// ============================================================
// OT 可视化播放器
// 三栏（客户端 A / 服务端 / 客户端 B）逐步演示一次并发冲突的完整解决过程：
//   本地应用 → 操作包飞行 → 服务端定序 → transform 修正算式 → 广播 → 双侧变换 → 收敛验证
// 每一步都调用 lib/ot.js 的真实 transform，不是写死的动画。
// 用法（MDX 里）：<OtVisualizer />
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { applyOp, transform, checksum, fmtOp, sleep } from '../lib/ot';
import styles from './OtVisualizer.module.css';

// 预设场景：初始文档 + A/B 各自的并发操作
const SCENARIOS = {
  classic: { name: '经典：A 插开头 × B 删结尾', doc: 'hello world', opA: { kind: 'insert', pos: 0, str: 'A' }, opB: { kind: 'delete', pos: 10, len: 1 } },
  samepos: { name: '同位置插入对撞', doc: 'abc', opA: { kind: 'insert', pos: 1, str: 'X' }, opB: { kind: 'insert', pos: 1, str: 'Y' } },
  overlap: { name: '删除区间重叠', doc: 'abcdefgh', opA: { kind: 'delete', pos: 4, len: 4 }, opB: { kind: 'delete', pos: 2, len: 4 } },
  absorb:  { name: 'delete 吸收插入', doc: 'abcde', opA: { kind: 'insert', pos: 2, str: 'XX' }, opB: { kind: 'delete', pos: 1, len: 3 } },
};

let cellId = 0;
const mkCells = (doc) => [...doc].map((ch) => ({ id: ++cellId, ch }));
const cellsText = (cells) => cells.map((c) => c.ch).join('');

// 用大白话解释一条 transform 规则（带具体数字）
function explainTransform(op, other, fixed) {
  if (op.kind === 'insert' && other.kind === 'insert') {
    if (other.pos === op.pos) return `同位置并发插入：后接受者右移（opIsLeft 裁决）→ pos=${fixed.pos}`;
    return `对方在 pos=${other.pos} 插入（在我 pos=${op.pos} 之前）→ pos+${other.str.length}=${fixed.pos}`;
  }
  if (op.kind === 'insert' && other.kind === 'delete') {
    if (other.pos + other.len <= op.pos) return `删除区间 [${other.pos},${other.pos + other.len}) 在我 pos=${op.pos} 之前 → pos−${other.len}=${fixed.pos}`;
    return `我的插入点被删除区间覆盖 → 插入作废（与"delete 吸收"同一生死裁决）`;
  }
  if (op.kind === 'delete' && other.kind === 'insert') {
    if (other.pos <= op.pos) return `插入在我删除区间之前 → pos+${other.str.length}=${fixed.pos}`;
    return `插入落进我的删除区间 → 吸收：len+${other.str.length}=${fixed.len}`;
  }
  return `删除区间重叠，重叠部分对方已删 → 只删剩余 pos=${fixed.pos} len=${fixed.len}`;
}

export default function OtVisualizer() {
  const [scenario, setScenario] = useState('classic');
  const [view, setView] = useState(null);   // 视图快照（由 beats 逐步驱动）
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);                  // 取消令牌：重置后让旧的异步流程作废
  const idxRef = useRef(0);
  const beatsRef = useRef([]);
  const stageRef = useRef(null);
  const overlayRef = useRef(null);          // 操作包的"飞行层"（React 不管它的子节点）
  const nodeA = useRef(null), nodeS = useRef(null), nodeB = useRef(null);

  /* ---------- 视图同步 ---------- */
  // beats 持有自己的可变状态 m，通过 sync 把快照推进 React
  function makeSync(m, token) {
    return (patch) => {
      if (token !== runId.current) return; // 已重置，旧流程的写入作废
      setView({
        cellsA: [...m.cellsA], cellsS: [...m.cellsS], cellsB: [...m.cellsB],
        revA: m.revA, revS: m.revS, revB: m.revB,
        noteA: m.noteA, noteB: m.noteB, history: [...m.history],
        card: m.card, caption: m.caption,
        timeline: [...m.timeline], converged: m.converged,
        ...patch,
      });
    };
  }

  // 把操作应用到字符格子（带动画）：删除先标灰再移除，插入弹入新格子
  async function applyToStrip(m, sync, which, op, actor) {
    const key = 'cells' + which;
    const cells = m[key];
    if (op.kind === 'delete' && op.len > 0) {
      for (let i = op.pos; i < Math.min(op.pos + op.len, cells.length); i++) {
        cells[i] = { ...cells[i], dying: true, by: actor };
      }
      sync();
      await sleep(340);
      cells.splice(op.pos, op.len);
      sync();
    } else if (op.kind === 'insert' && op.str.length > 0) {
      const born = [...op.str].map((ch) => ({ id: ++cellId, ch, born: true, by: actor }));
      cells.splice(op.pos, 0, ...born);
      sync();
    }
  }

  // 操作包从 from 节点飞到 to 节点（命令式 DOM，React 不接管 overlay 的子节点）
  function flyPacket(m, label, cls, fromRef, toRef) {
    const overlay = overlayRef.current;
    if (!overlay) return Promise.resolve();
    const o = overlay.getBoundingClientRect();
    const f = fromRef.current.getBoundingClientRect();
    const t = toRef.current.getBoundingClientRect();
    const p = document.createElement('div');
    p.className = `${styles.packet} ${cls}`;
    p.textContent = label;
    overlay.appendChild(p);
    const fx = f.left - o.left + f.width / 2 - p.offsetWidth / 2;
    const fy = f.top - o.top + f.height / 2 - p.offsetHeight / 2;
    p.style.left = fx + 'px';
    p.style.top = fy + 'px';
    return new Promise((res) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        p.style.transform = `translate(${t.left - o.left + t.width / 2 - p.offsetWidth / 2 - fx}px, ${t.top - o.top + t.height / 2 - p.offsetHeight / 2 - fy}px)`;
      }));
      setTimeout(() => { p.remove(); res(); }, 730);
    });
  }

  /* ---------- 编排：8 拍 ---------- */
  function buildBeats(sc, token) {
    const m = {
      cellsA: mkCells(sc.doc), cellsS: mkCells(sc.doc), cellsB: mkCells(sc.doc),
      revA: 0, revS: 0, revB: 0,
      noteA: null, noteB: null, history: [], card: null, caption: '',
      timeline: [], converged: false,
      pendingA: null, pendingB: null, opBFixed: null,
      flightA: null, flightB: null, bcast1: null, bcast2: null,
    };
    const sync = makeSync(m, token);
    const ok = () => token === runId.current;
    // 操作时间线：每个关键事件沉淀一条记录，解决"指令飞走就忘了发过什么"
    let tlId = 0;
    const tell = (side, text) => { m.timeline.push({ id: ++tlId, side, text }); sync(); };

    return [
      { caption: `初始状态：三方文档一致，都是 <b>"${sc.doc}"</b>（rev=0）`,
        async run() { sync(); } },

      { caption: `<b>A 输入</b>：本地立即应用 <b>${fmtOp(sc.opA)}</b>，操作包飞往服务端（baseRev=0）`,
        async run() {
          await applyToStrip(m, sync, 'A', sc.opA, 'A');
          m.pendingA = sc.opA;
          tell('a', `A 发送：${fmtOp(sc.opA)}（baseRev=0）`);
          m.flightA = flyPacket(m, 'A: ' + fmtOp(sc.opA), styles.pa, nodeA, nodeS);
          await sleep(260);
        } },

      { caption: `<b>同一瞬间 B 也输入</b>：<b>${fmtOp(sc.opB)}</b> —— 两个操作都在路上，谁也没见过谁（并发！）`,
        async run() {
          await applyToStrip(m, sync, 'B', sc.opB, 'B');
          m.pendingB = sc.opB;
          tell('b', `B 发送：${fmtOp(sc.opB)}（baseRev=0）—— 与 A 并发`);
          m.flightB = flyPacket(m, 'B: ' + fmtOp(sc.opB), styles.pb, nodeB, nodeS);
          await Promise.all([m.flightA, m.flightB]);
        } },

      { caption: `服务端先收到 A：baseRev=0 = rev=0，<b>直接接受</b>，rev→1，进 history，广播给两端`,
        async run() {
          await applyToStrip(m, sync, 'S', sc.opA, 'A');
          m.revS = 1; m.history.push(`rev1: ${fmtOp(sc.opA)}`); sync();
          tell('s', `服务端接受 ${fmtOp(sc.opA)} → rev=1，广播`);
          m.bcast1 = Promise.all([
            flyPacket(m, '回执 → A', styles.ps, nodeS, nodeA),
            flyPacket(m, fmtOp(sc.opA) + ' → B', styles.ps, nodeS, nodeB),
          ]);
          await sleep(200);
        } },

      { caption: `服务端收到 B：baseRev=0 ≠ rev=1，<b>过期！</b>针对 history 里错过的操作做 transform 修正`,
        async run() {
          m.opBFixed = transform(sc.opB, sc.opA, false);
          m.card = { raw: fmtOp(sc.opB), missed: fmtOp(sc.opA), rule: explainTransform(sc.opB, sc.opA, m.opBFixed), fixed: fmtOp(m.opBFixed) };
          sync();
          tell('s', `B 的操作过期：${fmtOp(sc.opB)} →修正为→ ${fmtOp(m.opBFixed)}`);
          await sleep(1700);
        } },

      { caption: `应用<b>修正后</b>的 B 操作，rev→2，广播给两端 —— 没有拒绝，编辑不丢`,
        async run() {
          await applyToStrip(m, sync, 'S', m.opBFixed, 'B');
          m.revS = 2; m.history.push(`rev2: ${fmtOp(m.opBFixed)}`); sync();
          tell('s', `服务端接受 ${fmtOp(m.opBFixed)} → rev=2，广播`);
          m.bcast2 = Promise.all([
            flyPacket(m, fmtOp(m.opBFixed) + ' → A', styles.ps, nodeS, nodeA),
            flyPacket(m, '回执 → B', styles.ps, nodeS, nodeB),
          ]);
          await sleep(200);
        } },

      { caption: `第一轮广播到达：<b>A 收到回执</b>；<b>B 收到 A 的操作</b>——B 有未确认操作，先做本地变换再应用`,
        async run() {
          await m.bcast1; if (!ok()) return;
          m.noteA = { kind: 'ok', text: '回执 ✅ 操作被接受（rev=1）' };
          m.revA = 1; m.pendingA = null;
          tell('a', 'A 收到回执 ✅（操作已被接受）');
          const opAPrime = transform(sc.opA, m.pendingB, true);
          m.pendingB = transform(m.pendingB, sc.opA, false);
          await applyToStrip(m, sync, 'B', opAPrime, 'A');
          m.revB = 1;
          m.noteB = { kind: 'ok', text: '收到 A 的操作，本地变换后应用 ✅' };
          tell('b', `B 收到 A 的操作：本地变换后应用（pending 同步变换为 ${fmtOp(m.pendingB)}）`);
          sync();
        } },

      { caption: `第二轮广播到达：<b>A 应用修正后的 B 操作</b>；<b>B 收到回执</b>——与本地 pending 逐字一致，自校验通过`,
        async run() {
          await m.bcast2; if (!ok()) return;
          await applyToStrip(m, sync, 'A', m.opBFixed, 'B');
          m.revA = 2;
          tell('a', `A 应用 ${fmtOp(m.opBFixed)}`);
          const consistent = JSON.stringify(m.pendingB) === JSON.stringify(m.opBFixed);
          m.noteB = consistent
            ? { kind: 'ok', text: '回执 ✅ 与本地变换结果一致（rev=2）' }
            : { kind: 'warn', text: '回执与本地不一致 ⚠（transform 实现有 bug）' };
          m.revB = 2; m.pendingB = null; sync();
          if (consistent) tell('b', 'B 收到回执 ✅ 与本地变换结果一致');
        } },

      { caption: '', async run() {
          const docA = cellsText(m.cellsA), docS = cellsText(m.cellsS), docB = cellsText(m.cellsB);
          const same = docA === docS && docS === docB;
          m.card = null;
          m.converged = same;
          m.caption = same
            ? `<span class="${styles.converged}">收敛 ✅</span> 三方文档完全一致：<b>"${docS}"</b>（校验值 ${checksum(docS)}）。B 的坐标被修正过，但意图完整保留 —— 这就是 OT。`
            : `未一致！A="${docA}" S="${docS}" B="${docB}"`;
          if (same) tell('ok', `三方一致 ✅ "${docS}"`);
          sync();
        } },
    ];
  }

  function reset(scKey) {
    runId.current++;
    const token = runId.current;
    idxRef.current = 0;
    setBusy(false);
    if (overlayRef.current) overlayRef.current.innerHTML = '';
    beatsRef.current = buildBeats(SCENARIOS[scKey], token);
    beatsRef.current[0].run();
  }

  useEffect(() => {
    reset(scenario);
    return () => { runId.current++; }; // 卸载时作废所有异步流程
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  const done = view && idxRef.current >= beatsRef.current.length;

  async function playAll() {
    if (busy) return;
    setBusy(true);
    const token = runId.current;
    while (idxRef.current < beatsRef.current.length && token === runId.current) {
      const beat = beatsRef.current[idxRef.current++];
      if (beat.caption) {
        const m = { caption: beat.caption };
        setView((v) => ({ ...v, ...m }));
      }
      await beat.run();
      await sleep(650);
    }
    if (token === runId.current) setBusy(false);
  }

  async function stepOnce() {
    if (busy || idxRef.current >= beatsRef.current.length) return;
    setBusy(true);
    const token = runId.current;
    const beat = beatsRef.current[idxRef.current++];
    if (beat.caption) setView((v) => ({ ...v, caption: beat.caption }));
    await beat.run();
    if (token === runId.current) setBusy(false);
  }

  if (!view) return null;

  return (
    <div className={styles.viz}>
      <div className={styles.controls}>
        <div className={styles.scenes}>
          {Object.entries(SCENARIOS).map(([key, sc]) => (
            <button
              key={key}
              className={`${styles.pill} ${key === scenario ? styles.active : ''}`}
              onClick={() => setScenario(key)}
            >
              {sc.name}
            </button>
          ))}
        </div>
        <div className={styles.btns}>
          <button className={`${styles.btn} ${styles.primary}`} onClick={playAll} disabled={busy || done}>▶ 自动播放</button>
          <button className={styles.btn} onClick={stepOnce} disabled={busy || done}>⏭ 单步</button>
          <button className={styles.btn} onClick={() => reset(scenario)}>↺ 重置</button>
        </div>
      </div>

      <div className={styles.stage} ref={stageRef}>
        <VNode refObj={nodeA} who="客户端 A" cls="a" rev={view.revA} cells={view.cellsA} note={view.noteA} converged={view.converged} />
        <div className={styles.track} />
        <div className={`${styles.node} ${styles.server} ${view.converged ? styles.convergedNode : ''}`} ref={nodeS}>
          <div className={styles.head}><span>服务端</span><span className={styles.rev}>rev={view.revS}</span></div>
          <Strip cells={view.cellsS} />
          {view.card && (
            <div className={styles.tc}>
              <div className={styles.tcTitle}>⚠ 过期操作：baseRev=0 ≠ rev=1</div>
              <div className={styles.tcRow}>收到　<span className={styles.old}>{view.card.raw}</span></div>
              <div className={styles.tcRow}>错过　{view.card.missed}</div>
              <div className={styles.tcRow}>规则　{view.card.rule}</div>
              <div className={styles.tcRow}>修正　<span className={styles.new}>{view.card.fixed}</span> ✅</div>
            </div>
          )}
          {view.history.length > 0 && (
            <div className={styles.history}>
              {view.history.map((h, i) => <span key={i} className={styles.hchip}>{h}</span>)}
            </div>
          )}
        </div>
        <div className={styles.track} />
        <VNode refObj={nodeB} who="客户端 B" cls="b" rev={view.revB} cells={view.cellsB} note={view.noteB} converged={view.converged} />
        <div ref={overlayRef} className={styles.overlay} />
      </div>

      {/* 操作时间线：每条指令的去向都沉淀在这里，不会"飞走就忘" */}
      {view.timeline.length > 0 && (
        <div className={styles.timeline}>
          <div className={styles.tlTitle}>操作时间线</div>
          {view.timeline.map((e) => (
            <div key={e.id} className={styles.tlItem}>
              <span className={`${styles.dot} ${styles['dot_' + e.side]}`} />
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.caption} dangerouslySetInnerHTML={{ __html: view.caption }} />
    </div>
  );
}

/* ---------- 子组件 ---------- */

function VNode({ refObj, who, cls, rev, cells, note, converged }) {
  return (
    <div className={`${styles.node} ${styles[cls]} ${converged ? styles.convergedNode : ''}`} ref={refObj}>
      <div className={styles.head}><span>{who}</span><span className={styles.rev}>rev={rev}</span></div>
      <Strip cells={cells} />
      <div className={styles.note}>
        {note && <span className={note.kind === 'ok' ? styles.noteOk : styles.noteWarn}>{note.text}</span>}
      </div>
    </div>
  );
}

function Strip({ cells }) {
  return (
    <div className={styles.strip}>
      {cells.map((c) => (
        <span
          key={c.id}
          className={[
            styles.cell,
            c.born ? styles.born : '',
            c.dying ? styles.dying : '',
            c.by === 'A' ? styles.byA : c.by === 'B' ? styles.byB : '',
          ].join(' ')}
        >
          {c.ch === ' ' ? '␣' : c.ch}
        </span>
      ))}
    </div>
  );
}
