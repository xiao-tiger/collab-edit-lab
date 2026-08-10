/* ============================================================
   Stage C1 · 数据层：本节点的 CRDT 状态 + 经 WebSocket 的同步

   数据流向：
     用户操作 ──inc/setReg──→ 本地状态 ──sendSnapshot──→ WebSocket（服务端中转）
                                                              │
     渲染通知 ←── onChange(read()) ←── merge ←── 收到快照 ○───┘

   分五段阅读：状态 → 本地操作 → 发送 → 接收 → 快照
   算法在 crdt-core.js，渲染层在 app.js。
   ============================================================ */
import { makeGCounter, gInc, gValue, gMerge, makeRegister, regSet, regMerge } from './crdt-core.js';

/**
 * @typedef {Object} NodeView
 * @property {string} nodeId    本节点 id（每个标签页随机一个）
 * @property {GCounter} counter 计数器状态（counts 里能看到所有节点的格子）
 * @property {Register} reg     寄存器状态
 * @property {number} total     计数器总值（各格求和）
 * @property {boolean} connected 是否已连上服务端
 */

/**
 * 创建一个 CRDT 节点。
 * @param {Object} opts
 * @param {(view: NodeView) => void} opts.onChange 状态变化回调（渲染层用）
 * @param {(text: string) => void} [opts.onLog]    日志回调
 */
export function createCounterNode({ onChange, onLog = () => {} }) {
  // ── 一、状态（全部摆在这）──
  const nodeId = 'N-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const state = { counter: makeGCounter(), reg: makeRegister() };
  const chaos = { delay: false, dup: false }; // 人为网络病（验证幂等/乱序免疫）
  const ws = new WebSocket(`ws://${location.host}`);

  // ── 二、本地操作入口（app.js 只调这两个）──

  /** 计数器 +1 */
  function inc() { act((n) => gInc(n.counter, nodeId)); }

  /** 写寄存器。 @param {string} value */
  function setReg(value) { act((n) => regSet(n.reg, value, nodeId)); }

  // 一次本地操作 = 先改本地（立即可见）→ 再广播最终状态 → 通知渲染
  function act(mutate) {
    mutate(state);
    sendSnapshot();
    onChange(read());
  }

  // ── 三、发送：状态型同步 = 发整个状态快照（可叠加人为延迟/重复）──
  function sendSnapshot() {
    const msg = JSON.stringify({ type: 'snapshot', from: nodeId, counter: state.counter, reg: state.reg });
    const fire = (tag) => setTimeout(() => {
      if (ws.readyState === 1) {
        ws.send(msg);
        onLog(`我 → 服务端 快照${tag}`);
      }
    }, chaos.delay ? Math.floor(Math.random() * 800) : 0);
    fire('');
    if (chaos.dup) fire('（重复发送）');
  }

  // ── 四、接收与合并（merge 是纯函数，乱序/重复无所谓）──
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== 'init' && msg.type !== 'snapshot') return;
    state.counter = gMerge(state.counter, msg.counter);
    state.reg = regMerge(state.reg, msg.reg);
    onLog(msg.type === 'init' ? '已载入服务端存档副本' : `收到 ${msg.from} 的快照 → merge`);
    onChange(read());
  };
  ws.onopen = () => onChange(read());
  ws.onclose = () => onChange(read());

  // ── 五、快照输出（渲染层只读这个）──
  function read() {
    return {
      nodeId,
      counter: state.counter,
      reg: state.reg,
      total: gValue(state.counter),
      connected: ws.readyState === 1,
    };
  }

  return {
    inc,
    setReg,
    setChaos: (c) => Object.assign(chaos, c),
    read,
  };
}
