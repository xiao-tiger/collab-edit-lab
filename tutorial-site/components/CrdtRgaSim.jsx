// ============================================================
// CRDT C2/C3 沙盒：迷你 RGA 双节点文本协同
// 两种模式：
//   <CrdtRgaSim />          C2：在线同步（可开重复/乱序捣乱）
//   <CrdtRgaSim offline />  C3：断网/重连，互换最终状态收敛
// 每个节点下方渲染内部 Item 结构（id 上标；删除线 = 墓碑）。
// ============================================================
import { useRef, useState } from 'react';
import { makeRGA, rgaInsert, rgaDelete, rgaMerge, rgaSequence, rgaText } from '../lib/rga';
import styles from './CrdtSim.module.css';

function diffToOps(oldText, newText) {
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length, newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd--; }
  const ops = [];
  if (oldEnd > start) ops.push({ kind: 'delete', pos: start, len: oldEnd - start });
  if (newEnd > start) ops.push({ kind: 'insert', pos: start, str: newText.slice(start, newEnd) });
  return ops;
}

export default function CrdtRgaSim({ offline = false, children }) {
  const nodes = useRef({
    A: { id: 'A', rga: makeRGA('A'), el: null, oldValue: '', dirty: false },
    B: { id: 'B', rga: makeRGA('B'), el: null, oldValue: '', dirty: false },
  });
  const [dup, setDup] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [online, setOnline] = useState(true);
  const [inFlight, setInFlight] = useState(0);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const other = (id) => (id === 'A' ? 'B' : 'A');

  function onInput(node) {
    const ops = diffToOps(node.oldValue, node.el.value);
    for (const op of ops) {
      if (op.kind === 'delete') rgaDelete(node.rga, op.pos, op.len);
      else for (let i = 0; i < op.str.length; i++) rgaInsert(node.rga, op.pos + i, op.str[i]);
    }
    node.oldValue = node.el.value;
    if (online) broadcast(node);
    else node.dirty = true; // 离线：最终状态本身就在本地，只记一笔
    rerender();
  }

  // 状态型同步：发送整个 Item 集合的快照
  function broadcast(from) {
    const snapshot = [...from.rga.items.values()].map((i) => ({ ...i }));
    const jitter = shuffle ? Math.floor(Math.random() * 900) : 0;
    send(other(from.id), snapshot, jitter);
    if (dup) send(other(from.id), snapshot, jitter + 60);
  }
  function send(toId, snapshot, delay) {
    setInFlight((n) => n + 1);
    setTimeout(() => {
      setInFlight((n) => n - 1);
      const target = nodes.current[toId];
      rgaMerge(target.rga, snapshot);
      const text = rgaText(target.rga);
      if (target.el.value !== text) { target.el.value = text; target.oldValue = text; }
      rerender();
    }, 400 + delay);
  }

  function toggleNet() {
    const next = !online;
    setOnline(next);
    if (next) {
      // 重连：互换一次最终状态即收敛
      for (const id of ['A', 'B']) {
        const n = nodes.current[id];
        if (n.dirty) { broadcast(n); n.dirty = false; }
      }
    }
  }

  const A = nodes.current.A, B = nodes.current.B;
  const same = rgaText(A.rga) === rgaText(B.rga) && A.rga.items.size === B.rga.items.size;

  return (
    <div className={styles.wrap}>
      {children && <div className={styles.hint}>{children}</div>}
      <div className={styles.controls}>
        {offline ? (
          <>
            <button className={`${styles.netBtn} ${online ? '' : styles.off}`} onClick={toggleNet}>
              {online ? '⚡ 断开网络' : '🔌 重新连接'}
            </button>
            <span>{online ? '在线' : '离线（两端各自编辑）'}</span>
            <span>断网 → 两边各打一段 → 重连 → 瞬间收敛</span>
          </>
        ) : (
          <>
            <b>网络捣乱：</b>
            <label><input type="checkbox" checked={dup} onChange={(e) => setDup(e.target.checked)} /> 重复投递</label>
            <label><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> 乱序/大抖动</label>
            <span>（状态型同步对这些天然免疫）</span>
          </>
        )}
      </div>
      <div className={styles.arena}>
        {[A, B].map((node) => (
          <div key={node.id} className={`${styles.node} ${node.id === 'A' ? styles.a : styles.b}`}>
            <h2 className={styles.nodeTitle}>节点 {node.id}</h2>
            <textarea
              className={styles.ta}
              ref={(el) => (node.el = el)}
              placeholder={`在 ${node.id} 输入…`}
              onInput={() => onInput(node)}
            />
            {offline && <div className={styles.dirty}>{node.dirty ? '● 有未同步的本地变更' : ''}</div>}
            <div className={styles.structLabel}>内部结构（id 上标；删除线 = 墓碑）：</div>
            <div className={styles.struct}>
              {rgaSequence(node.rga, true).map((it) => (
                <span key={it.id} className={`${styles.item} ${it.deleted ? styles.tomb : ''}`}>
                  {it.ch === ' ' ? '␣' : it.ch}
                  <span className={styles.iid}>{it.id}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.verdict}>
        {same && inFlight === 0 && <span className={styles.ok}>两端一致 ✅（文本与结构完全相同）</span>}
        {!same && !online && <span className={styles.syncing}>已分叉（离线中，重连即可合并）</span>}
        {!same && online && <span className={styles.syncing}>同步中…</span>}
        {same && inFlight > 0 && <span className={styles.syncing}>已一致，还有消息在路上…</span>}
      </div>
    </div>
  );
}
