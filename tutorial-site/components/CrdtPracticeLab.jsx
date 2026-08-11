import { useMemo, useRef, useState } from 'react';
import styles from './CrdtPracticeLab.module.css';

const INITIAL_BLOCKS = [
  { id: 'seed:0001', leftId: null, value: '开场：本周项目进展', deleted: false },
  { id: 'seed:0002', leftId: 'seed:0001', value: '结论：下周继续推进', deleted: false },
];

function makeDoc(actor) {
  return {
    actor,
    clock: 0,
    title: { value: '项目周报', stamp: { counter: 0, actor: 'seed' } },
    tags: { adds: { 协作: ['seed:tag:1'] }, removes: [] },
    blocks: INITIAL_BLOCKS.map((item) => ({ ...item })),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unique(values) {
  return [...new Set(values)];
}

function compareStamp(a, b) {
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.actor.localeCompare(b.actor);
}

function mergeDoc(local, remote) {
  const next = clone(local);
  next.clock = Math.max(local.clock, remote.clock);
  next.title = compareStamp(local.title.stamp, remote.title.stamp) >= 0
    ? clone(local.title)
    : clone(remote.title);

  const tagNames = new Set([...Object.keys(local.tags.adds), ...Object.keys(remote.tags.adds)]);
  next.tags.adds = {};
  for (const tag of tagNames) {
    next.tags.adds[tag] = unique([
      ...(local.tags.adds[tag] ?? []),
      ...(remote.tags.adds[tag] ?? []),
    ]);
  }
  next.tags.removes = unique([...local.tags.removes, ...remote.tags.removes]);

  const items = new Map();
  for (const item of [...local.blocks, ...remote.blocks]) {
    const current = items.get(item.id);
    if (!current) items.set(item.id, clone(item));
    else if (item.deleted) current.deleted = true;
  }
  next.blocks = [...items.values()];
  return next;
}

function visibleTags(doc) {
  return Object.entries(doc.tags.adds)
    .filter(([, dots]) => dots.some((dot) => !doc.tags.removes.includes(dot)))
    .map(([tag]) => tag)
    .sort();
}

function orderedBlocks(doc, includeDeleted = false) {
  const children = new Map();
  for (const item of doc.blocks) {
    const key = item.leftId ?? 'ROOT';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(item);
  }
  for (const list of children.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const result = [];
  function walk(leftId) {
    for (const item of children.get(leftId) ?? []) {
      if (includeDeleted || !item.deleted) result.push(item);
      walk(item.id);
    }
  }
  walk('ROOT');
  return result;
}

function comparableState(doc) {
  return JSON.stringify({
    title: doc.title,
    tags: Object.fromEntries(Object.entries(doc.tags.adds).sort().map(([tag, dots]) => [tag, [...dots].sort()])),
    removes: [...doc.tags.removes].sort(),
    blocks: [...doc.blocks].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function ReplicaEditor({ id, doc, draft, setDraft, act, undo, redo, undoCount, redoCount }) {
  const tags = visibleTags(doc);
  const blocks = orderedBlocks(doc);
  const internalBlocks = orderedBlocks(doc, true);

  return (
    <section className={`${styles.replica} ${id === 'A' ? styles.replicaA : styles.replicaB}`}>
      <div className={styles.replicaHead}>
        <div><strong>副本 {id}</strong><span>本地时钟 {doc.clock}</span></div>
        <span className={styles.localBadge}>本地立即生效</span>
      </div>

      <div className={styles.undoBar}>
        <button onClick={undo} disabled={undoCount === 0}>↶ 撤销我的操作 <span>{undoCount}</span></button>
        <button onClick={redo} disabled={redoCount === 0}>↷ 重做 <span>{redoCount}</span></button>
      </div>

      <div className={styles.field}>
        <label htmlFor={`title-${id}`}>文档标题 · LWW Register</label>
        <div className={styles.inline}>
          <input id={`title-${id}`} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <button onClick={() => act('title', draft.title)} disabled={!draft.title.trim()}>写入</button>
        </div>
        <small>当前：{doc.title.value} · stamp=({doc.title.stamp.counter},{doc.title.stamp.actor})</small>
      </div>

      <div className={styles.field}>
        <label htmlFor={`tag-${id}`}>文档标签 · OR-Set</label>
        <div className={styles.tags}>
          {tags.map((tag) => <button key={tag} title={`删除标签 ${tag}`} onClick={() => act('removeTag', tag)}>#{tag} ×</button>)}
          {tags.length === 0 && <span>暂无标签</span>}
        </div>
        <div className={styles.inline}>
          <input id={`tag-${id}`} value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value })} placeholder="例如：需求" />
          <button onClick={() => act('addTag', draft.tag)} disabled={!draft.tag.trim()}>添加</button>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`block-${id}`}>文档段落 · Sequence CRDT</label>
        <input id={`block-${id}`} value={draft.block} onChange={(event) => setDraft({ ...draft, block: event.target.value })} placeholder="准备插入的新段落" />
        <ol className={styles.blocks}>
          {blocks.map((item) => (
            <li key={item.id}>
              <span>{item.value}<code>{item.id}</code></span>
              <div>
                <button onClick={() => act('insertBlock', draft.block, item.id)} disabled={!draft.block.trim()}>插在此后</button>
                <button className={styles.danger} onClick={() => act('removeBlock', item.id)}>删除</button>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <details className={styles.internal}>
        <summary>查看内部 CRDT 状态</summary>
        <pre>{JSON.stringify({ title: doc.title, tags: doc.tags, blocks: internalBlocks }, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function CrdtPracticeLab() {
  const packetId = useRef(0);
  const [docs, setDocs] = useState({ A: makeDoc('A'), B: makeDoc('B') });
  const [queue, setQueue] = useState([]);
  const [drafts, setDrafts] = useState({
    A: { title: '八月项目周报', tag: '需求', block: '方案：完成第一版' },
    B: { title: '项目周报最终版', tag: '评审', block: '风险：排期可能延后' },
  });
  const [touched, setTouched] = useState({ A: false, B: false });
  const [history, setHistory] = useState({
    A: { undo: [], redo: [] },
    B: { undo: [], redo: [] },
  });
  const [activity, setActivity] = useState([]);
  const [usedUndo, setUsedUndo] = useState(false);

  const same = comparableState(docs.A) === comparableState(docs.B);
  const visibleSame = useMemo(() => JSON.stringify({
    title: docs.A.title.value,
    tags: visibleTags(docs.A),
    blocks: orderedBlocks(docs.A).map((item) => item.value),
  }) === JSON.stringify({
    title: docs.B.title.value,
    tags: visibleTags(docs.B),
    blocks: orderedBlocks(docs.B).map((item) => item.value),
  }), [docs]);

  function setDraft(id, value) {
    setDrafts((current) => ({ ...current, [id]: value }));
  }

  function enqueue(from, snapshot, label) {
    const to = from === 'A' ? 'B' : 'A';
    setQueue((current) => [...current, { id: ++packetId.current, from, to, label, snapshot: clone(snapshot) }]);
  }

  function runOperation(id, operation, origin = 'edit', record = true) {
    const draft = clone(docs[id]);
    draft.clock += 1;
    const dot = `${id}:${String(draft.clock).padStart(4, '0')}`;
    let label = '';
    let inverse = null;
    let createdId = null;

    if (operation.type === 'title') {
      inverse = { type: 'title', value: draft.title.value };
      draft.title = { value: operation.value.trim(), stamp: { counter: draft.clock, actor: id } };
      label = `set title · (${draft.clock},${id})`;
    }
    if (operation.type === 'addTag') {
      const tag = operation.tag.trim();
      draft.tags.adds[tag] = unique([...(draft.tags.adds[tag] ?? []), dot]);
      inverse = { type: 'removeDots', tag, dots: [dot] };
      label = `add #${tag} · ${dot}`;
      setDraft(id, { ...drafts[id], tag: '' });
    }
    if (operation.type === 'removeTag') {
      const liveDots = (draft.tags.adds[operation.tag] ?? [])
        .filter((item) => !draft.tags.removes.includes(item));
      draft.tags.removes = unique([...draft.tags.removes, ...liveDots]);
      inverse = { type: 'addTag', tag: operation.tag };
      label = `remove #${operation.tag}`;
    }
    if (operation.type === 'removeDots') {
      draft.tags.removes = unique([...draft.tags.removes, ...operation.dots]);
      label = `remove dots · ${operation.dots.join(',')}`;
    }
    if (operation.type === 'insertBlock') {
      draft.blocks.push({ id: dot, leftId: operation.leftId, value: operation.value.trim(), deleted: false });
      inverse = { type: 'removeBlock', id: dot };
      createdId = dot;
      label = `insert ${dot} after ${operation.leftId}`;
      setDraft(id, { ...drafts[id], block: '' });
    }
    if (operation.type === 'removeBlock') {
      const item = draft.blocks.find((block) => block.id === operation.id);
      if (item) inverse = { type: 'insertBlock', value: item.value, leftId: item.leftId };
      if (item) item.deleted = true;
      label = `delete ${operation.id}`;
    }

    setDocs((current) => ({ ...current, [id]: draft }));
    setTouched((current) => ({ ...current, [id]: true }));
    const prefix = origin === 'undo' ? 'UNDO · ' : origin === 'redo' ? 'REDO · ' : '';
    enqueue(id, draft, `${prefix}${label}`);
    setActivity((current) => [
      { id: `${id}-${draft.clock}-${origin}`, actor: id, origin, label },
      ...current,
    ].slice(0, 12));

    if (record && inverse) {
      setHistory((current) => ({
        ...current,
        [id]: {
          undo: [...current[id].undo, { undo: inverse, redo: clone(operation), label }],
          redo: [],
        },
      }));
    }

    return { inverse, createdId };
  }

  function act(id, type, value, anchor) {
    if (type === 'title') runOperation(id, { type, value });
    if (type === 'addTag') runOperation(id, { type, tag: value });
    if (type === 'removeTag') runOperation(id, { type, tag: value });
    if (type === 'insertBlock') runOperation(id, { type, value, leftId: anchor });
    if (type === 'removeBlock') runOperation(id, { type, id: value });
  }

  function undo(id) {
    const stack = history[id].undo;
    const entry = stack[stack.length - 1];
    if (!entry) return;
    const result = runOperation(id, entry.undo, 'undo', false);
    let redoOperation = entry.redo;
    if (entry.undo.type === 'insertBlock' && entry.redo.type === 'removeBlock' && result.createdId) {
      redoOperation = { type: 'removeBlock', id: result.createdId };
    }
    setHistory((current) => ({
      ...current,
      [id]: {
        undo: current[id].undo.slice(0, -1),
        redo: [...current[id].redo, { ...entry, redo: redoOperation }],
      },
    }));
    setUsedUndo(true);
  }

  function redo(id) {
    const stack = history[id].redo;
    const entry = stack[stack.length - 1];
    if (!entry) return;
    const result = runOperation(id, entry.redo, 'redo', false);
    setHistory((current) => ({
      ...current,
      [id]: {
        undo: [...current[id].undo, { undo: result.inverse, redo: entry.redo, label: entry.label }],
        redo: current[id].redo.slice(0, -1),
      },
    }));
  }

  function deliver(index) {
    const message = queue[index];
    if (!message) return;
    setDocs((current) => ({
      ...current,
      [message.to]: mergeDoc(current[message.to], message.snapshot),
    }));
    setQueue((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function deliverAll() {
    const next = { A: clone(docs.A), B: clone(docs.B) };
    for (const message of queue) next[message.to] = mergeDoc(next[message.to], message.snapshot);
    setDocs(next);
    setQueue([]);
  }

  function syncBoth() {
    enqueue('A', docs.A, 'A 当前完整状态');
    enqueue('B', docs.B, 'B 当前完整状态');
  }

  function reset() {
    packetId.current = 0;
    setDocs({ A: makeDoc('A'), B: makeDoc('B') });
    setQueue([]);
    setTouched({ A: false, B: false });
    setHistory({ A: { undo: [], redo: [] }, B: { undo: [], redo: [] } });
    setActivity([]);
    setUsedUndo(false);
    setDrafts({
      A: { title: '八月项目周报', tag: '需求', block: '方案：完成第一版' },
      B: { title: '项目周报最终版', tag: '评审', block: '风险：排期可能延后' },
    });
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.mission}>
        <div><span>实战任务</span><strong>让两份 Mini Doc 经历并发后重新收敛</strong></div>
        <ol>
          <li className={touched.A ? styles.done : ''}>在副本 A 完成至少一次修改</li>
          <li className={touched.B ? styles.done : ''}>在副本 B 完成至少一次修改</li>
          <li className={queue.length > 0 ? styles.done : ''}>让修改进入网络队列</li>
          <li className={usedUndo ? styles.done : ''}>撤销一次自己的操作并继续同步</li>
          <li className={touched.A && touched.B && queue.length === 0 && same ? styles.done : ''}>投递并确认内部状态完全收敛</li>
        </ol>
      </section>

      <div className={styles.toolbar}>
        <button onClick={syncBoth}>双向发送当前状态</button>
        <button onClick={() => setQueue((current) => [...current].reverse())} disabled={queue.length < 2}>反转队列</button>
        <button onClick={() => setQueue((current) => current.length ? [...current, { ...clone(current[0]), id: ++packetId.current }] : current)} disabled={queue.length === 0}>重复第一包</button>
        <button className={styles.primary} onClick={deliverAll} disabled={queue.length === 0}>全部投递</button>
        <button onClick={reset}>重置实战</button>
      </div>

      <div className={styles.arena}>
        <ReplicaEditor
          id="A"
          doc={docs.A}
          draft={drafts.A}
          setDraft={(value) => setDraft('A', value)}
          act={(...args) => act('A', ...args)}
          undo={() => undo('A')}
          redo={() => redo('A')}
          undoCount={history.A.undo.length}
          redoCount={history.A.redo.length}
        />

        <section className={styles.pipe}>
          <div className={styles.pipeHead}><strong>网络管道</strong><span>{queue.length} 条等待</span></div>
          {queue.length === 0 ? <div className={styles.empty}>本地操作产生的状态快照会出现在这里</div> : queue.map((message, index) => (
            <button className={styles.packet} key={message.id} onClick={() => deliver(index)}>
              <span>{message.from} → {message.to}<i>点击投递</i></span>
              <code>{message.label}</code>
            </button>
          ))}
        </section>

        <ReplicaEditor
          id="B"
          doc={docs.B}
          draft={drafts.B}
          setDraft={(value) => setDraft('B', value)}
          act={(...args) => act('B', ...args)}
          undo={() => undo('B')}
          redo={() => redo('B')}
          undoCount={history.B.undo.length}
          redoCount={history.B.redo.length}
        />
      </div>

      <section className={styles.activity}>
        <div className={styles.activityHead}>
          <strong>本地操作历史</strong>
          <span>远端 merge 不进入本地 Undo 栈</span>
        </div>
        {activity.length === 0 ? <div className={styles.activityEmpty}>完成一次编辑后，这里会显示普通操作、Undo 和 Redo。</div> : (
          <div className={styles.activityList}>
            {activity.map((item) => (
              <div key={item.id}>
                <b className={item.actor === 'A' ? styles.actorA : styles.actorB}>{item.actor}</b>
                <span className={item.origin === 'undo' ? styles.undoKind : item.origin === 'redo' ? styles.redoKind : ''}>
                  {item.origin === 'undo' ? 'UNDO' : item.origin === 'redo' ? 'REDO' : 'EDIT'}
                </span>
                <code>{item.label}</code>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={`${styles.verdict} ${same ? styles.converged : styles.diverged}`}>
        <strong>{same ? '内部状态已完全收敛 ✓' : visibleSame ? '界面相同，但内部状态仍未完全同步' : '两份文档正在分叉'}</strong>
        <span>{same ? '继续在任一副本修改，开始下一轮实验。' : '改变消息顺序、重复投递，再把队列全部送达。'}</span>
      </div>
    </div>
  );
}
