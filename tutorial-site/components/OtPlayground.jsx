// ============================================================
// 协同沙盒组件：浏览器内仿真「客户端 A / 服务端 / 客户端 B」+ 可调网络延迟
// 四种策略对应四个学习阶段：
//   fulltext  Stage 0 全量广播（互相覆盖）
//   op        Stage 1 操作同步（位置漂移）
//   reject    Stage 2 版本定序（过期拒绝 + 强制重同步）
//   transform Stage 3+ 完整 OT（修正后接受，收敛）
// 用法（MDX 里）：<OtPlayground policy="fulltext" latency={600}>实验指引…</OtPlayground>
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { applyOp, transform, diffToOps, checksum, fmtOp } from '../lib/ot';
import styles from './OtPlayground.module.css';

let logId = 0;

export default function OtPlayground({ policy, latency = 600, children }) {
  const hasRev = policy === 'reject' || policy === 'transform';

  // 可变仿真状态放 ref（setTimeout 回调里要读最新值），视图靠 force 刷新
  const S = useRef({ doc: '', rev: 0, history: [] });
  const C = useRef({
    A: { id: 'A', oldValue: '', rev: 0, pending: null, buffer: [], lastSent: null, el: null },
    B: { id: 'B', oldValue: '', rev: 0, pending: null, buffer: [], lastSent: null, el: null },
  });
  const [logs, setLogs] = useState([]);
  const [flash, setFlash] = useState({}); // 拒绝时输入框红闪
  const [, force] = useState(0);
  const logRef = useRef(null);
  const rerender = () => force((n) => n + 1);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const log = (cls, text) => {
    if (!mounted.current) return;
    setLogs((l) => [...l.slice(-120), { id: ++logId, cls, text }]);
  };

  const other = (id) => (id === 'A' ? 'B' : 'A');

  // ---- 虚拟网络：延迟投递 ----
  function deliver(msg, to) {
    setTimeout(() => {
      if (!mounted.current) return;
      if (to === 'S') serverRecv(msg);
      else clientRecv(C.current[to], msg);
    }, latency);
  }

  // ---- 客户端发送 ----
  function pushOrSend(c, op) {
    if (c.pending) { c.buffer.push(op); rerender(); return; }
    c.pending = op;
    c.lastSent = { ...op };
    log(c.id === 'A' ? styles.la : styles.lb, `${c.id} → 服务端: ${fmtOp(op)} (baseRev=${c.rev})`);
    deliver({ type: 'op', op, baseRev: c.rev, from: c.id }, 'S');
    rerender();
  }

  function onInput(c) {
    if (policy === 'fulltext') {
      log(c.id === 'A' ? styles.la : styles.lb, `${c.id} → 服务端: [全量 ${c.el.value.length} 字符]`);
      deliver({ kind: 'update', text: c.el.value, from: c.id }, 'S');
    } else {
      const ops = diffToOps(c.oldValue, c.el.value);
      c.oldValue = c.el.value;
      for (const op of ops) {
        if (policy === 'op') {
          log(c.id === 'A' ? styles.la : styles.lb, `${c.id} → 服务端: ${fmtOp(op)}`);
          deliver({ type: 'op', op, from: c.id }, 'S');
        } else {
          pushOrSend(c, op);
        }
      }
    }
    rerender();
  }

  // ---- 服务端 ----
  function serverRecv(msg) {
    const s = S.current;
    if (policy === 'fulltext') {
      s.doc = msg.text;
      log(styles.ls, `服务端: 全量覆盖 → 广播给 ${other(msg.from)}`);
      deliver({ kind: 'update', text: s.doc }, other(msg.from));
    } else if (policy === 'op') {
      s.doc = applyOp(s.doc, msg.op);
      log(styles.ls, `服务端: 套用 ${fmtOp(msg.op)} → "${s.doc}"`);
      deliver({ type: 'op', op: msg.op }, other(msg.from));
    } else {
      let op = msg.op;
      if (msg.baseRev !== s.rev) {
        if (policy === 'reject') {
          log(styles.lw, `服务端: 拒绝 ${msg.from} 的 ${fmtOp(op)}（baseRev=${msg.baseRev} ≠ rev=${s.rev}）→ 强制重同步`);
          deliver({ type: 'reject', doc: s.doc, rev: s.rev }, msg.from);
          rerender();
          return;
        }
        const missed = s.history.slice(msg.baseRev);
        for (const h of missed) op = transform(op, h, false);
        log(styles.ls, `服务端: 修正 ${msg.from} 的过期操作 ${fmtOp(msg.op)} → ${fmtOp(op)}`);
      }
      s.doc = applyOp(s.doc, op);
      s.rev++;
      s.history.push(op);
      log(styles.ls, `服务端: 接受 ${fmtOp(op)} → rev=${s.rev}`);
      for (const id of ['A', 'B']) deliver({ type: 'op', op, rev: s.rev, from: msg.from }, id);
    }
    rerender();
  }

  // ---- 客户端接收 ----
  function applyRemote(c, op) {
    const el = c.el;
    const cursor = el.selectionStart;
    el.value = applyOp(el.value, op);
    c.oldValue = el.value;
    let cur = cursor;
    if (op.kind === 'insert' && op.pos <= cursor) cur = cursor + op.str.length;
    if (op.kind === 'delete') {
      if (op.pos + op.len <= cursor) cur = cursor - op.len;
      else if (op.pos < cursor) cur = op.pos;
    }
    el.selectionStart = el.selectionEnd = cur;
  }

  function clientRecv(c, msg) {
    const cls = c.id === 'A' ? styles.la : styles.lb;
    if (msg.kind === 'update') {
      c.el.value = msg.text; // Stage 0：光标被拍飞是故意保留的体感
      log(cls, `${c.id} ← 全量覆盖`);
    } else if (msg.type === 'reject') {
      const lost = (c.pending ? 1 : 0) + c.buffer.length;
      log(styles.lw, `${c.id}: ${lost} 个操作被拒绝丢弃，强制重同步到 rev=${msg.rev}`);
      c.el.value = msg.doc; c.oldValue = msg.doc; c.rev = msg.rev;
      c.pending = null; c.buffer = [];
      setFlash((f) => ({ ...f, [c.id]: true }));
      setTimeout(() => mounted.current && setFlash((f) => ({ ...f, [c.id]: false })), 900);
    } else if (msg.type === 'op' && !hasRev) {
      log(cls, `${c.id} ← ${fmtOp(msg.op)}（直接套用旧坐标）`);
      applyRemote(c, msg.op);
    } else if (msg.type === 'op') {
      if (msg.from === c.id) {
        // 回执
        c.rev = msg.rev;
        if (policy === 'transform' && JSON.stringify(msg.op) !== JSON.stringify(c.lastSent)) {
          log(cls, `${c.id} ← 回执 rev=${msg.rev}：服务端修正了坐标 ✅ ${fmtOp(c.lastSent)} → ${fmtOp(msg.op)}`);
        } else {
          log(cls, `${c.id} ← 回执 rev=${msg.rev}`);
        }
        c.pending = null; c.lastSent = null;
        if (c.buffer.length > 0) {
          const next = c.buffer.shift();
          c.pending = next; c.lastSent = { ...next };
          log(cls, `${c.id} → 服务端: ${fmtOp(next)} (baseRev=${c.rev})`);
          deliver({ type: 'op', op: next, baseRev: c.rev, from: c.id }, 'S');
        }
      } else {
        // 远端操作：transform 策略下做双侧变换
        let opPrime = msg.op;
        if (policy === 'transform' && c.pending) {
          opPrime = transform(msg.op, c.pending, true);
          c.pending = transform(c.pending, msg.op, false);
          for (let i = 0; i < c.buffer.length; i++) {
            const b = c.buffer[i];
            c.buffer[i] = transform(b, opPrime, false);
            opPrime = transform(opPrime, b, true);
          }
          log(cls, `${c.id} ← ${fmtOp(msg.op)}（本地变换后应用: ${fmtOp(opPrime)}）`);
        } else {
          log(cls, `${c.id} ← ${fmtOp(opPrime)}`);
        }
        applyRemote(c, opPrime);
        c.rev = msg.rev;
      }
    }
    rerender();
  }

  // ---- 渲染 ----
  const a = C.current.A, b = C.current.B;
  const sumA = a.el ? checksum(a.el.value) : checksum('');
  const sumB = b.el ? checksum(b.el.value) : checksum('');
  const consistent = sumA === sumB;

  return (
    <div className={styles.wrap}>
      {children && <div className={styles.hint}>{children}</div>}
      <div className={styles.pg}>
        {['A', 'B'].map((id) => (
          <div key={id} className={`${styles.client} ${id === 'A' ? styles.ca : styles.cb}`}>
            <div className={styles.title}>
              <span>客户端 {id}</span>
              <span className={styles.meta}>
                {hasRev ? `rev=${C.current[id].rev} · ` : ''}校验 {id === 'A' ? sumA : sumB}
              </span>
            </div>
            <textarea
              ref={(el) => (C.current[id].el = el)}
              className={flash[id] ? styles.flashBad : ''}
              spellCheck="false"
              placeholder={`在 ${id} 输入…`}
              onInput={() => onInput(C.current[id])}
            />
          </div>
        ))}
        <div className={styles.server}>
          <div className={styles.title}>
            <span>服务端 · 延迟 {latency}ms</span>
            <span className={styles.meta}>
              {hasRev ? `rev=${S.current.rev} · ` : ''}
              {consistent ? <span className={styles.good}>两端一致 ✅</span> : <span className={styles.bad}>已发散 ❌</span>}
            </span>
          </div>
          <div className={styles.sdoc}>{S.current.doc === '' ? '（空文档）' : S.current.doc}</div>
        </div>
        <div className={styles.logwrap}>
          <div className={styles.logtitle}>
            <span>消息日志</span>
            <button className={styles.clear} onClick={() => setLogs([])}>清空</button>
          </div>
          <div className={styles.log} ref={logRef}>
            {logs.map((l) => <div key={l.id} className={l.cls}>{l.text}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
