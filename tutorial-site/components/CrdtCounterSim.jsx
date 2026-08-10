// ============================================================
// CRDT C1 沙盒 · 渲染层（只负责画 + 转发用户操作）
// 所有数据逻辑（节点状态、merge、虚拟网络）都在 lib/crdtSims.js + lib/simNet.js
// 用法（MDX 里）：<CrdtCounterSim>实验指引…</CrdtCounterSim>
// ============================================================
import { useRef, useState } from 'react';
import { gValue } from '../lib/crdt-basic';
import { createCounterSim } from '../lib/crdtSims';
import styles from './CrdtSim.module.css';

export default function CrdtCounterSim({ children }) {
  // 仿真内核只创建一次；它的快照变化直接 setView 驱动渲染
  const simRef = useRef(null);
  if (!simRef.current) {
    simRef.current = createCounterSim({
      latency: 400,
      onChange: (v) => setView(v),
      onLog: (e) => setLogs((l) => [...l.slice(-100), { id: ++logId, ...e }]),
    });
  }
  const sim = simRef.current;

  const [view, setView] = useState(sim.read());
  const [logs, setLogs] = useState([]);
  const [dup, setDup] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [mode, setMode] = useState('crdt');

  const updateChaos = (d, s) => sim.setChaos({ dup: d, shuffle: s });
  const updateMode = (m) => { setMode(m); sim.setMode(m); };

  return (
    <div className={styles.wrap}>
      {children && <div className={styles.hint}>{children}</div>}
      <div className={styles.controls}>
        <b>网络捣乱：</b>
        <label><input type="checkbox" checked={dup} onChange={(e) => { setDup(e.target.checked); updateChaos(e.target.checked, shuffle); }} /> 重复投递</label>
        <label><input type="checkbox" checked={shuffle} onChange={(e) => { setShuffle(e.target.checked); updateChaos(dup, e.target.checked); }} /> 乱序/大抖动</label>
        ｜ 计数器同步：
        <label><input type="radio" name="c1-mode" checked={mode === 'crdt'} onChange={() => updateMode('crdt')} /> CRDT merge</label>
        <label><input type="radio" name="c1-mode" checked={mode === 'naive'} onChange={() => updateMode('naive')} /> 朴素覆盖</label>
      </div>
      <div className={`${styles.arena} ${styles.withPipe}`}>
        {[view.A, view.B].map((s, i) => {
          const id = i === 0 ? 'A' : 'B';
          return (
            <div key={id} className={`${styles.node} ${id === 'A' ? styles.a : styles.b}`}>
              <h2 className={styles.nodeTitle}>节点 {id}</h2>
              <div className={styles.big}>{gValue(s.counter)}</div>
              <div className={styles.slots}>counts = {JSON.stringify(s.counter.counts)}</div>
              <button className={styles.incBtn} onClick={() => sim.inc(id)}>+1</button>
              <div className={styles.regBox}>
                <input
                  className={styles.regInput}
                  value={s.reg.value}
                  placeholder={`在 ${id} 写入寄存器…`}
                  onChange={(e) => sim.setReg(id, e.target.value)}
                />
                <div className={styles.regVer}>版本 n={s.reg.n} by={s.reg.by || '—'}</div>
              </div>
            </div>
          );
        })}
        <div className={styles.pipe}>
          <h3 className={styles.pipeTitle}>网络管道</h3>
          <div className={styles.netlog}>
            {logs.map((l) => <div key={l.id} className={l.chaos ? styles.chaos : ''}>{l.text}</div>)}
          </div>
        </div>
      </div>
      <div className={styles.verdict}>
        {view.same && view.inFlight === 0 && <span className={styles.ok}>两端一致 ✅（乱序/重复也收敛）</span>}
        {view.same && view.inFlight > 0 && <span className={styles.syncing}>已一致，还有消息在路上…</span>}
        {!view.same && view.inFlight > 0 && <span className={styles.syncing}>同步中…</span>}
        {!view.same && view.inFlight === 0 && <span className={styles.bad}>发散 ❌（朴素覆盖丢了并发增量）</span>}
      </div>
    </div>
  );
}

let logId = 0;
