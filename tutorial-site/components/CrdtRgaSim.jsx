// ============================================================
// CRDT C2/C3 沙盒 · 渲染层（只负责画 + 转发用户操作）
// 所有数据逻辑（RGA 状态、diff、merge、虚拟网络）都在 lib/ 下
//   <CrdtRgaSim />          C2：在线同步（可开重复/乱序捣乱）
//   <CrdtRgaSim offline />  C3：断网/重连，互换最终状态收敛
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { rgaSequence, rgaText } from '../lib/rga';
import { createRgaSim } from '../lib/crdtSims';
import styles from './CrdtSim.module.css';

export default function CrdtRgaSim({ offline = false, children }) {
  const simRef = useRef(null);
  if (!simRef.current) {
    simRef.current = createRgaSim({
      latency: 400,
      onChange: (v) => setView(v),
    });
  }
  const sim = simRef.current;

  const [view, setView] = useState(sim.read());
  const [dup, setDup] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const taA = useRef(null);
  const taB = useRef(null);

  // 远端合并改变了数据层的文本 → 同步到 textarea（DOM 同步是渲染层的事）
  useEffect(() => {
    for (const [id, ref] of [['A', taA], ['B', taB]]) {
      const el = ref.current;
      if (!el) continue;
      const text = rgaText(view[id]);
      if (el.value !== text) el.value = text;
    }
  }, [view]);

  const updateChaos = (d, s) => sim.setChaos({ dup: d, shuffle: s });

  return (
    <div className={styles.wrap}>
      {children && <div className={styles.hint}>{children}</div>}
      <div className={styles.controls}>
        {offline ? (
          <>
            <button
              className={`${styles.netBtn} ${view.online ? '' : styles.off}`}
              onClick={() => sim.setOnline(!view.online)}
            >
              {view.online ? '⚡ 断开网络' : '🔌 重新连接'}
            </button>
            <span>{view.online ? '在线' : '离线（两端各自编辑）'}</span>
            <span>断网 → 两边各打一段 → 重连 → 瞬间收敛</span>
          </>
        ) : (
          <>
            <b>网络捣乱：</b>
            <label><input type="checkbox" checked={dup} onChange={(e) => { setDup(e.target.checked); updateChaos(e.target.checked, shuffle); }} /> 重复投递</label>
            <label><input type="checkbox" checked={shuffle} onChange={(e) => { setShuffle(e.target.checked); updateChaos(dup, e.target.checked); }} /> 乱序/大抖动</label>
            <span>（状态型同步对这些天然免疫）</span>
          </>
        )}
      </div>
      <div className={styles.arena}>
        {[['A', taA], ['B', taB]].map(([id, ref]) => (
          <div key={id} className={`${styles.node} ${id === 'A' ? styles.a : styles.b}`}>
            <h2 className={styles.nodeTitle}>节点 {id}</h2>
            <textarea
              className={styles.ta}
              ref={ref}
              placeholder={`在 ${id} 输入…`}
              onInput={(e) => sim.editText(id, e.target.value)}
            />
            {offline && (
              <div className={styles.dirty}>
                {(id === 'A' ? view.dirtyA : view.dirtyB) ? '● 有未同步的本地变更' : ''}
              </div>
            )}
            <div className={styles.structLabel}>内部结构（id 上标；删除线 = 墓碑）：</div>
            <div className={styles.struct}>
              {rgaSequence(view[id], true).map((it) => (
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
        {view.same && view.inFlight === 0 && <span className={styles.ok}>两端一致 ✅（文本与结构完全相同）</span>}
        {!view.same && !view.online && <span className={styles.syncing}>已分叉（离线中，重连即可合并）</span>}
        {!view.same && view.online && <span className={styles.syncing}>同步中…</span>}
        {view.same && view.inFlight > 0 && <span className={styles.syncing}>已一致，还有消息在路上…</span>}
      </div>
    </div>
  );
}
