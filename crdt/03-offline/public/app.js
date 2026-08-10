/* ============================================================
   Stage C3 · 渲染层（只做 DOM：画快照 + 转发用户操作）
   数据层在 client.js，算法在 rga.js。
   ============================================================ */
import { createOfflineNode } from './client.js';

const node = createOfflineNode({ onChange: render, onLog: addLog });

const $ = (id) => document.getElementById(id);

/* ---------- 控件 → 数据层 ---------- */
$('editor').addEventListener('input', (e) => node.editText(e.target.value));
$('netBtn').addEventListener('click', () => {
  if (node.read().online) node.disconnect();
  else node.connect();
});

/* ---------- 渲染 ---------- */
function render(view) {
  $('nodeId').textContent = view.nodeId;
  $('netBtn').textContent = view.online ? '⚡ 断开网络' : '🔌 重新连接';
  $('netBtn').className = view.online ? 'net' : 'net offline';
  $('netState').textContent = view.online ? '在线' : '离线（本地编辑都保留）';
  $('netState').style.color = view.online ? 'var(--srv)' : 'var(--bad)';
  $('dirty').textContent = view.dirty ? '● 有未同步的本地变更（重连后自动补发）' : '';

  const editor = $('editor');
  if (editor.value !== view.text) editor.value = view.text; // 合并结果写回
}

function addLog(text) {
  const line = document.createElement('div');
  line.textContent = text;
  const log = $('log');
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

render(node.read());
