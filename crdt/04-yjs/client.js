// ============================================================
// Stage C4：Yjs 上手 —— 客户端（浏览器）
// 对照手写时代（c2/c3）的概念映射：
//   Y.Doc            ≈ 文档 + 全部 Item 历史
//   Y.Text           ≈ 我们的 RGA（但内部是 YATA，解决了交错问题）
//   WebsocketProvider ≈ 传输层（自动重连 + 增量同步，不是全量快照）
//   Awareness        ≈ stage4 手写的光标/在线状态（工业版）
//   IndexeddbPersistence ≈ stage5 的持久化（浏览器本地，离线可恢复）
// ============================================================
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

const editor = document.getElementById('editor');
const statusEl = document.getElementById('status');
const peersEl = document.getElementById('peers');
const metaEl = document.getElementById('meta');

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(`ws://${location.host}`, 'c4-room', ydoc);
const ytext = ydoc.getText('doc');

// 离线持久化：内容先存浏览器 IndexedDB，刷新/断网重开都在；联网后与房间自动合并
new IndexeddbPersistence('c4-room', ydoc);

provider.on('status', ({ status }) => {
  statusEl.textContent = status === 'connected' ? '已连接' : '已断开（离线可继续编辑，重连自动合并）';
});

// ---------- Y.Text → textarea ----------
ytext.observe(() => {
  const text = ytext.toString();
  if (editor.value !== text) editor.value = text;
  refreshMeta();
});

// ---------- textarea → Y.Text（diff 后事务化应用）----------
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

editor.addEventListener('input', () => {
  const ops = diffToOps(ytext.toString(), editor.value);
  if (ops.length === 0) return;
  // transact 保证多个操作打包成一个更新事件
  ydoc.transact(() => {
    for (const op of ops) {
      if (op.kind === 'delete') ytext.delete(op.pos, op.len);
      else ytext.insert(op.pos, op.str);
    }
  });
  refreshMeta();
});

// ---------- Awareness：在线状态（光标的工业版入口）----------
const colors = ['#0070f3', '#d97706', '#059669', '#7c3aed', '#dc2626'];
provider.awareness.setLocalStateField('user', {
  name: '用户' + Math.floor(Math.random() * 100),
  color: colors[Math.floor(Math.random() * colors.length)],
});
provider.awareness.on('change', () => {
  const users = [...provider.awareness.getStates().values()].map((s) => s.user).filter(Boolean);
  peersEl.innerHTML = users.map((u) => `<span style="color:${u.color}">● ${u.name}</span>`).join('　');
});

function refreshMeta() {
  metaEl.textContent = `长度 ${ytext.length}`;
}
refreshMeta();
