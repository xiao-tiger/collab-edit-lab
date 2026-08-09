// ============================================================
// CRDT C1 沙盒：G-Counter + LWW-Register 双节点模拟
// 同步内容 = 整个状态快照；可开"重复投递/乱序"捣乱，验证三性质免疫。
// 用法（MDX 里）：<CrdtCounterSim>实验指引…</CrdtCounterSim>
// ============================================================
import { useRef, useState } from 'react';
import { makeGCounter, gInc, gValue, gMerge, makeRegister, regSet, regMerge } from '../lib/crdt-basic';
import styles from './CrdtSim.module.css';

let logId = 0;

export default function CrdtCounterSim({ children }) {
  const nodes = useRef({
    A: { id: 'A', counter: makeGCounter(), reg: makeRegister() },
    B: { id: 'B', counter: makeGCounter(), reg: makeRegister() },
  });
  const [logs, setLogs] = useState([]);
  const [dup, setDup] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [mode, setMode] = useState('crdt'); // crdt | naive（朴素覆盖对照组）
  const [inFlight, setInFlight] = useState(0);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const other = (id) => (id === 'A' ? 'B' : 'A');
  const log = (text, chaos = false) =>
    setLogs((l) => [...l.slice(-100), { id: ++logId, text, chaos }]);

  function broadcast(from) {
    const snapshot = JSON.parse(JSON.stringify({ from: from.id, counter: from.counter, reg: from.reg }));
    const jitter = shuffle ? Math.floor(Math.random() * 900) : 0;
    send(other(from.id), snapshot, jitter, '');
    if (dup) send(other(from.id), snapshot, jitter + 60, '（重复投递）');
  }
  function send(toId, snapshot, delay, tag) {
    setInFlight((n) => n + 1);
    log(`${snapshot.from} → ${toId} 快照 ${tag}`, tag !== '');
    setTimeout(() => {
      setInFlight((n) => n - 1);
      receive(nodes.current[toId], snapshot);
    }, 400 + delay);
  }
  function receive(node, snapshot) {
    if (mode === 'crdt') {
      node.counter = gMerge(node.counter, snapshot.counter);
    } else {
      // 朴素覆盖（last-write-wins）：并发增量会丢
      node.counter = { counts: { [node.id]: gValue(snapshot.counter) } };
    }
    node.reg = regMerge(node.reg, snapshot.reg);
    log(`${node.id} ← 合并快照`);
    rerender();
  }

  const A = nodes.current.A, B = nodes.current.B;
  const same =
    JSON.stringify(A.counter.counts) === JSON.stringify(B.counter.counts) &&
    A.reg.value === B.reg.value;

  return (
    <div className={styles.wrap}>
      {children && <div className={styles.hint}>{children}</div>}
      <div className={styles.controls}>
        <b>网络捣乱：</b>
        <label><input type="checkbox" checked={dup} onChange={(e) => setDup(e.target.checked)} /> 重复投递</label>
        <label><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> 乱序/大抖动</label>
        ｜ 计数器同步：
        <label><input type="radio" name="c1-mode" checked={mode === 'crdt'} onChange={() => setMode('crdt')} /> CRDT merge</label>
        <label><input type="radio" name="c1-mode" checked={mode === 'naive'} onChange={() => setMode('naive')} /> 朴素覆盖</label>
      </div>
      <div className={`${styles.arena} ${styles.withPipe}`}>
        {[A, B].map((node) => (
          <div key={node.id} className={`${styles.node} ${node.id === 'A' ? styles.a : styles.b}`}>
            <h2 className={styles.nodeTitle}>节点 {node.id}</h2>
            <div className={styles.big}>{gValue(node.counter)}</div>
            <div className={styles.slots}>counts = {JSON.stringify(node.counter.counts)}</div>
            <button
              className={styles.incBtn}
              onClick={() => { gInc(node.counter, node.id); broadcast(node); rerender(); }}
            >+1</button>
            <div className={styles.regBox}>
              <input
                className={styles.regInput}
                value={node.reg.value}
                placeholder={`在 ${node.id} 写入寄存器…`}
                onChange={(e) => { regSet(node.reg, e.target.value, node.id); broadcast(node); rerender(); }}
              />
              <div className={styles.regVer}>版本 n={node.reg.n} by={node.reg.by || '—'}</div>
            </div>
          </div>
        ))}
        <div className={styles.pipe}>
          <h3 className={styles.pipeTitle}>网络管道</h3>
          <div className={styles.netlog}>
            {logs.map((l) => <div key={l.id} className={l.chaos ? styles.chaos : ''}>{l.text}</div>)}
          </div>
        </div>
      </div>
      <div className={styles.verdict}>
        {same && inFlight === 0 && <span className={styles.ok}>两端一致 ✅（乱序/重复也收敛）</span>}
        {same && inFlight > 0 && <span className={styles.syncing}>已一致，还有消息在路上…</span>}
        {!same && inFlight > 0 && <span className={styles.syncing}>同步中…</span>}
        {!same && inFlight === 0 && <span className={styles.bad}>发散 ❌（朴素覆盖丢了并发增量）</span>}
      </div>
    </div>
  );
}
