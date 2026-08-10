// ============================================================
// CRDT 仿真内核（纯 JS，零 React）
//
// 职责：维护两个对等节点（A/B）的 CRDT 状态 + 消息同步流程。
// 渲染层（components/Crdt*Sim.jsx）只做两件事：
//   1. 把用户操作翻译成这里的意图方法（inc / setReg / editText / …）
//   2. 订阅 read() 快照并画出来
//
// 结构：createTwoNodeSim 是通用骨架（节点 + 网络 + 广播/合并循环），
//       两个算法的差异全部收敛在各自的 algo 描述对象里。
// ============================================================
import { makeGCounter, gInc, gValue, gMerge, makeRegister, regSet, regMerge } from './crdt-basic.js';
import { makeRGA, rgaInsert, rgaDelete, rgaMerge, rgaText } from './rga.js';
import { diffToOps } from './ot.js';
import { createNet } from './simNet.js';

const other = (id) => (id === 'A' ? 'B' : 'A');

// counts 相等性：逐键比较（不能用 JSON.stringify——对象键序不同会误判，测试抓到过）
function countsEq(x, y) {
  const kx = Object.keys(x), ky = Object.keys(y);
  return kx.length === ky.length && kx.every((k) => x[k] === y[k]);
}

/* ---------- 通用骨架 ---------- */
function createTwoNodeSim({ algo, latency = 400, onChange = () => {}, onLog = () => {} }) {
  const nodes = {
    A: { id: 'A', s: algo.init('A'), dirty: false },
    B: { id: 'B', s: algo.init('B'), dirty: false },
  };
  const net = createNet({ latency, onLog });

  net.onDeliver((toId, payload) => {
    const n = nodes[toId];
    algo.merge(n.s, payload, n.id); // 合并是纯函数，乱序/重复无所谓
    onChange(read());
  });

  // 一次本地操作：先改本地状态（立即可见），再把最终状态发出去
  function act(id, mutate) {
    mutate(nodes[id].s, id);
    const sent = net.send(id, other(id), algo.snapshot(nodes[id].s));
    if (!sent) nodes[id].dirty = true; // 断网：只记一笔"我有未同步变更"
    onChange(read());
  }

  function setOnline(v) {
    net.setOnline(v);
    if (v) {
      // 重连：互换一次最终状态即收敛（状态型 CRDT 离线合并的全部秘密）
      for (const id of ['A', 'B']) {
        if (nodes[id].dirty) {
          net.send(id, other(id), algo.snapshot(nodes[id].s));
          nodes[id].dirty = false;
        }
      }
    }
    onChange(read());
  }

  // 给渲染层的只读快照
  function read() {
    return {
      A: nodes.A.s,
      B: nodes.B.s,
      dirtyA: nodes.A.dirty,
      dirtyB: nodes.B.dirty,
      inFlight: net.inFlight,
      online: net.online,
      same: algo.same(nodes.A.s, nodes.B.s),
    };
  }

  return { act, setOnline, setChaos: (c) => net.setChaos(c), read };
}

/* ---------- C1：G-Counter + LWW-Register ---------- */
export function createCounterSim(opts) {
  let mode = 'crdt'; // 'crdt' | 'naive'（朴素覆盖对照组）

  const sim = createTwoNodeSim({
    ...opts,
    algo: {
      init: () => ({ counter: makeGCounter(), reg: makeRegister() }),
      snapshot: (s) => JSON.parse(JSON.stringify(s)),
      merge(local, snap, nodeId) {
        local.counter = mode === 'crdt'
          ? gMerge(local.counter, snap.counter)
          : { counts: { [nodeId]: gValue(snap.counter) } }; // last-write-wins，并发增量会丢
        local.reg = regMerge(local.reg, snap.reg);
      },
      same: (a, b) => countsEq(a.counter.counts, b.counter.counts) && a.reg.value === b.reg.value,
    },
  });

  return {
    ...sim,
    setMode: (m) => { mode = m; },
    inc: (id) => sim.act(id, (s) => gInc(s.counter, id)),
    setReg: (id, v) => sim.act(id, (s) => regSet(s.reg, v, id)),
  };
}

/* ---------- C2/C3：迷你 RGA 文本 ---------- */
export function createRgaSim(opts) {
  const sim = createTwoNodeSim({
    ...opts,
    algo: {
      init: (id) => makeRGA(id),
      snapshot: (rga) => [...rga.items.values()].map((i) => ({ ...i })),
      merge: (rga, items) => rgaMerge(rga, items),
      same: (a, b) => rgaText(a) === rgaText(b) && a.items.size === b.items.size,
    },
  });

  return {
    ...sim,
    // 渲染层只传来"新文本"，diff 成 RGA 操作是数据层的事
    editText(id, newText) {
      sim.act(id, (rga) => {
        const ops = diffToOps(rgaText(rga), newText);
        for (const op of ops) {
          if (op.kind === 'delete') rgaDelete(rga, op.pos, op.len);
          else for (let i = 0; i < op.str.length; i++) rgaInsert(rga, op.pos + i, op.str[i]);
        }
      });
    },
  };
}
