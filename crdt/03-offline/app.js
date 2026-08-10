/* ============================================================
   Stage C3 · 渲染层（只做 DOM：画快照 + 把输入转发给数据层）
   数据层在 sim.js（与 C2 同款，含断网/重连逻辑），算法在 rga.js。
   ============================================================ */

const sim = createRgaSim({ latency: 300, onChange: render });

const netBtn = document.getElementById('netBtn');
const netState = document.getElementById('netState');
const verdict = document.getElementById('verdict');

/* ---------- 控件 ---------- */
netBtn.addEventListener('click', () => sim.setOnline(!sim.read().online));

/* ---------- 输入 → 数据层 ---------- */
document.getElementById('taA').addEventListener('input', (e) => sim.editText('A', e.target.value));
document.getElementById('taB').addEventListener('input', (e) => sim.editText('B', e.target.value));

/* ---------- 渲染 ---------- */
function render(view) {
  renderNode('A', view, document.getElementById('taA'));
  renderNode('B', view, document.getElementById('taB'));

  netBtn.textContent = view.online ? '⚡ 断开网络' : '🔌 重新连接';
  netBtn.className = view.online ? 'net' : 'net offline';
  netState.textContent = view.online ? '在线' : '离线（两端各自编辑）';
  netState.style.color = view.online ? 'var(--srv)' : 'var(--bad)';

  document.getElementById('dirtyA').textContent = view.dirtyA ? '● 有未同步的本地变更' : '';
  document.getElementById('dirtyB').textContent = view.dirtyB ? '● 有未同步的本地变更' : '';

  if (view.same) verdict.innerHTML = '<span class="ok">两端一致 ✅</span>';
  else if (!view.online) verdict.innerHTML = '<span class="offline">已分叉（离线中，重连即可合并）</span>';
  else verdict.innerHTML = '<span class="ok">同步中…</span>';
}

function renderNode(id, view, ta) {
  // 远端合并改变了数据层文本 → 写回 textarea
  const text = rgaText(view[id]);
  if (ta.value !== text) ta.value = text;
}

render(sim.read());
