import { useState } from 'react';
import { applyOp, checksum, diffToOps, fmtOp, transform } from '../lib/ot';
import styles from './OtPracticeLab.module.css';

const INITIAL_TEXT = '项目周报';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeClient(id) {
  return { id, doc: INITIAL_TEXT, rev: 0, pending: null, buffer: [] };
}

function makeServer() {
  return {
    doc: INITIAL_TEXT,
    rev: 0,
    snapshotRev: 0,
    history: [],
    undoStacks: { A: [], B: [] },
    redoStacks: { A: [], B: [] },
  };
}

function inverseOp(doc, op) {
  if (op.kind === 'insert') return { kind: 'delete', pos: op.pos, len: op.str.length };
  return { kind: 'insert', pos: op.pos, str: doc.slice(op.pos, op.pos + op.len) };
}

function messageLabel(message) {
  const payload = message.payload;
  if (payload.type === 'op') return `${fmtOp(payload.op)} · baseRev=${payload.baseRev}`;
  if (payload.type === 'broadcast') return `${payload.kind.toUpperCase()} ${fmtOp(payload.op)} · rev=${payload.rev}`;
  if (payload.type === 'undo') return '请求 selective undo';
  if (payload.type === 'redo') return '请求 selective redo';
  return `RESYNC · rev=${payload.rev}`;
}

export default function OtPracticeLab() {
  const [clients, setClients] = useState({ A: makeClient('A'), B: makeClient('B') });
  const [server, setServer] = useState(makeServer());
  const [queue, setQueue] = useState([]);
  const [events, setEvents] = useState([]);
  const [nextId, setNextId] = useState(1);

  const converged = queue.length === 0
    && !clients.A.pending && !clients.B.pending
    && clients.A.buffer.length === 0 && clients.B.buffer.length === 0
    && clients.A.doc === server.doc && clients.B.doc === server.doc;

  function log(kind, text) {
    setEvents((current) => [{ id: `${Date.now()}-${Math.random()}`, kind, text }, ...current].slice(0, 18));
  }

  function appendMessages(messages) {
    if (messages.length === 0) return;
    setQueue((current) => [
      ...current,
      ...messages.map((message, index) => ({ ...message, id: nextId + index })),
    ]);
    setNextId((value) => value + messages.length);
  }

  function editClient(id, nextText) {
    const current = clients[id];
    const operations = diffToOps(current.doc, nextText);
    if (operations.length === 0) return;

    const next = clone(current);
    next.doc = nextText;
    const outgoing = [];
    for (const operation of operations) {
      if (!next.pending) {
        next.pending = operation;
        outgoing.push({ from: id, to: 'S', payload: { type: 'op', op: operation, baseRev: next.rev, from: id } });
      } else {
        next.buffer.push(operation);
      }
    }
    setClients((state) => ({ ...state, [id]: next }));
    appendMessages(outgoing);
    log(id, `${id} 本地应用 ${operations.map(fmtOp).join(' + ')}；${next.buffer.length ? '后续操作进入 buffer' : '操作进入 pending'}`);
  }

  function broadcastMessages(op, rev, from, kind) {
    return ['A', 'B'].map((to) => ({
      from: 'S',
      to,
      payload: { type: 'broadcast', op: clone(op), rev, from, kind },
    }));
  }

  function receiveAtServer(message, restQueue) {
    const payload = message.payload;
    const next = clone(server);

    if (payload.type === 'op') {
      if (payload.baseRev < next.snapshotRev) {
        restQueue.push({ from: 'S', to: payload.from, payload: { type: 'resync', doc: next.doc, rev: next.rev } });
        log('warn', `${payload.from} 的 baseRev=${payload.baseRev} 早于 snapshotRev=${next.snapshotRev}，只能 resync`);
      } else {
        let operation = clone(payload.op);
        const missed = next.history.filter((entry) => entry.rev > payload.baseRev);
        for (const entry of missed) operation = transform(operation, entry.op, false);
        const inverse = inverseOp(next.doc, operation);
        next.doc = applyOp(next.doc, operation);
        next.rev += 1;
        next.history.push({ rev: next.rev, op: clone(operation), from: payload.from, kind: 'edit' });
        next.undoStacks[payload.from].push({ op: inverse, baseRev: next.rev });
        next.redoStacks[payload.from] = [];
        restQueue.push(...broadcastMessages(operation, next.rev, payload.from, 'edit'));
        log('S', missed.length
          ? `服务端把 ${fmtOp(payload.op)} 穿过 ${missed.length} 条 history，修正为 ${fmtOp(operation)}，rev=${next.rev}`
          : `服务端接受 ${fmtOp(operation)}，rev=${next.rev}`);
      }
    }

    if (payload.type === 'undo') {
      const target = next.undoStacks[payload.from].pop();
      if (!target) log('warn', `${payload.from} 没有可撤销的服务端操作`);
      else {
        let operation = clone(target.op);
        for (const entry of next.history.filter((item) => item.rev > target.baseRev)) {
          operation = transform(operation, entry.op, false);
        }
        const redoOp = inverseOp(next.doc, operation);
        next.doc = applyOp(next.doc, operation);
        next.rev += 1;
        next.history.push({ rev: next.rev, op: clone(operation), from: payload.from, kind: 'undo' });
        next.redoStacks[payload.from].push({ op: redoOp, baseRev: next.rev });
        restQueue.push(...broadcastMessages(operation, next.rev, payload.from, 'undo'));
        log('undo', `服务端把 ${payload.from} 的 inverse 变换到当前版本：${fmtOp(operation)}，rev=${next.rev}`);
      }
    }

    if (payload.type === 'redo') {
      const target = next.redoStacks[payload.from].pop();
      if (!target) log('warn', `${payload.from} 没有可重做的操作`);
      else {
        let operation = clone(target.op);
        for (const entry of next.history.filter((item) => item.rev > target.baseRev)) {
          operation = transform(operation, entry.op, false);
        }
        const undoOp = inverseOp(next.doc, operation);
        next.doc = applyOp(next.doc, operation);
        next.rev += 1;
        next.history.push({ rev: next.rev, op: clone(operation), from: payload.from, kind: 'redo' });
        next.undoStacks[payload.from].push({ op: undoOp, baseRev: next.rev });
        restQueue.push(...broadcastMessages(operation, next.rev, payload.from, 'redo'));
        log('redo', `服务端重做 ${payload.from} 的操作：${fmtOp(operation)}，rev=${next.rev}`);
      }
    }

    setServer(next);
    return restQueue;
  }

  function receiveAtClient(message, restQueue) {
    const id = message.to;
    const payload = message.payload;
    const current = clone(clients[id]);

    if (payload.type === 'resync') {
      current.doc = payload.doc;
      current.rev = payload.rev;
      current.pending = null;
      current.buffer = [];
      setClients((state) => ({ ...state, [id]: current }));
      log('warn', `${id} 强制重同步到 rev=${payload.rev}，未确认本地操作被丢弃`);
      return restQueue;
    }

    if (payload.rev !== current.rev + 1) {
      log('warn', `${id} 还在等待 rev=${current.rev + 1}，暂不能接收 rev=${payload.rev}（有序通道要求）`);
      return [message, ...restQueue];
    }

    if (payload.from === id && payload.kind === 'edit') {
      current.rev = payload.rev;
      current.pending = null;
      if (current.buffer.length > 0) {
        const operation = current.buffer.shift();
        current.pending = operation;
        restQueue.push({ from: id, to: 'S', payload: { type: 'op', op: clone(operation), baseRev: current.rev, from: id } });
      }
      log(id, `${id} 收到自己的回执 rev=${payload.rev}${current.pending ? '，发送下一条 buffer' : ''}`);
    } else {
      let operation = clone(payload.op);
      if (current.pending) {
        operation = transform(payload.op, current.pending, true);
        current.pending = transform(current.pending, payload.op, false);
        for (let index = 0; index < current.buffer.length; index += 1) {
          const buffered = current.buffer[index];
          current.buffer[index] = transform(buffered, operation, false);
          operation = transform(operation, buffered, true);
        }
      }
      current.doc = applyOp(current.doc, operation);
      current.rev = payload.rev;
      log(id, `${id} 应用 ${payload.kind.toUpperCase()} ${fmtOp(operation)}，rev=${payload.rev}`);
    }

    setClients((state) => ({ ...state, [id]: current }));
    return restQueue;
  }

  function deliver(index) {
    const message = queue[index];
    if (!message) return;
    let restQueue = queue.filter((_, itemIndex) => itemIndex !== index).map(clone);
    restQueue = message.to === 'S'
      ? receiveAtServer(message, restQueue)
      : receiveAtClient(message, restQueue);
    setQueue(restQueue.map((item, itemIndex) => ({ ...item, id: nextId + itemIndex })));
    setNextId((value) => value + restQueue.length);
  }

  function requestHistoryAction(id, type) {
    appendMessages([{ from: id, to: 'S', payload: { type, from: id } }]);
    log(id, `${id} 发送 ${type.toUpperCase()} 请求；本地不会直接回退全文`);
  }

  function reverseClientOperations() {
    setQueue((current) => {
      const reversed = current.filter((item) => item.to === 'S' && item.payload.type === 'op').reverse();
      let index = 0;
      return current.map((item) => item.to === 'S' && item.payload.type === 'op' ? reversed[index++] : item);
    });
  }

  function snapshot() {
    const next = clone(server);
    next.snapshotRev = next.rev;
    next.history = [];
    next.undoStacks = { A: [], B: [] };
    next.redoStacks = { A: [], B: [] };
    setServer(next);
    log('S', `保存快照 snapshotRev=${next.snapshotRev}，清空 history 与教学版 Undo 栈`);
  }

  function addStalePacket() {
    const operation = { kind: 'insert', pos: clients.A.doc.length, str: '（离线稿）' };
    appendMessages([{ from: 'A', to: 'S', payload: { type: 'op', op: operation, baseRev: Math.max(0, server.snapshotRev - 1), from: 'A' } }]);
    log('A', '加入一条故意早于 snapshotRev 的离线操作');
  }

  function reset() {
    setClients({ A: makeClient('A'), B: makeClient('B') });
    setServer(makeServer());
    setQueue([]);
    setEvents([]);
    setNextId(1);
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.mission}>
        <div><span>OT 整合实战</span><strong>制造并发，让服务端修正坐标并驱动三方收敛</strong></div>
        <p>先分别修改 A、B，不要急着投递；再反转客户端操作顺序，逐条点击网络消息。完成后尝试 Undo、Redo、快照与过老操作。</p>
      </section>

      <div className={styles.toolbar}>
        <button onClick={reverseClientOperations} disabled={queue.filter((item) => item.to === 'S' && item.payload.type === 'op').length < 2}>反转客户端→服务端</button>
        <button onClick={() => deliver(0)} disabled={queue.length === 0}>投递下一条</button>
        <button onClick={snapshot} disabled={server.rev === server.snapshotRev}>服务端做快照</button>
        <button onClick={addStalePacket} disabled={server.snapshotRev === 0}>制造过老操作</button>
        <button onClick={reset}>重置实战</button>
      </div>

      <section className={styles.queue}>
        <div className={styles.queueHead}><strong>网络消息队列</strong><span>{queue.length} 条等待 · 点击任意消息投递</span></div>
        {queue.length === 0 ? <div className={styles.empty}>在任一客户端输入，operation 会带着 baseRev 进入这里。</div> : (
          <div className={styles.packetList}>
            {queue.map((message, index) => (
              <button key={message.id} onClick={() => deliver(index)}>
                <span>{message.from} → {message.to}<i>{message.payload.type}</i></span>
                <code>{messageLabel(message)}</code>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className={styles.arena}>
        {['A', 'B'].map((id, index) => (
          <section key={id} className={`${styles.client} ${id === 'A' ? styles.clientA : styles.clientB}`} style={{ order: index === 0 ? 1 : 3 }}>
            <div className={styles.head}><strong>客户端 {id}</strong><span>rev={clients[id].rev} · checksum={checksum(clients[id].doc)}</span></div>
            <textarea value={clients[id].doc} onChange={(event) => editClient(id, event.target.value)} spellCheck="false" />
            <dl>
              <div><dt>pending</dt><dd>{clients[id].pending ? fmtOp(clients[id].pending) : '—'}</dd></div>
              <div><dt>buffer</dt><dd>{clients[id].buffer.length ? clients[id].buffer.map(fmtOp).join(' · ') : '—'}</dd></div>
            </dl>
            <div className={styles.historyButtons}>
              <button onClick={() => requestHistoryAction(id, 'undo')} disabled={server.undoStacks[id].length === 0}>Undo {server.undoStacks[id].length}</button>
              <button onClick={() => requestHistoryAction(id, 'redo')} disabled={server.redoStacks[id].length === 0}>Redo {server.redoStacks[id].length}</button>
            </div>
          </section>
        ))}

        <section className={styles.server} style={{ order: 2 }}>
          <div className={styles.head}><strong>权威服务端</strong><span>rev={server.rev} · snapshotRev={server.snapshotRev}</span></div>
          <div className={styles.serverDoc}>{server.doc}</div>
          <div className={styles.historyTitle}>history</div>
          <div className={styles.history}>
            {server.history.length === 0 ? <span>（空）</span> : server.history.map((entry) => <code key={entry.rev}>rev{entry.rev} · {entry.kind} · {entry.from} · {fmtOp(entry.op)}</code>)}
          </div>
        </section>
      </div>

      <section className={styles.events}>
        <div><strong>算法日志</strong><span>服务端定序与客户端双侧 transform</span></div>
        {events.length === 0 ? <p>完成一次输入后开始记录。</p> : events.map((event) => <p key={event.id} className={styles[event.kind] ?? ''}><b>{event.kind}</b>{event.text}</p>)}
      </section>

      <div className={`${styles.verdict} ${converged ? styles.ok : styles.wait}`}>
        <strong>{converged ? 'A、服务端、B 已收敛 ✓' : '协同流程尚未完成'}</strong>
        <span>{converged ? `最终文档：“${server.doc}”` : '继续投递消息；每个客户端必须按 rev 顺序接收广播。'}</span>
      </div>
    </div>
  );
}
