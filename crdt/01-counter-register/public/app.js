/* ============================================================
   Stage C1 · 渲染层（只做 DOM：画快照 + 把用户操作转发给数据层）
   数据层在 client.js，算法在 crdt-core.js。
   ============================================================ */
import { createCounterNode } from './client.js';

const node = createCounterNode({ onChange: render, onLog: addLog });

const $ = (id) => document.getElementById(id);

/* ---------- 控件 → 数据层 ---------- */
$('incBtn').addEventListener('click', () => node.inc());
$('regInput').addEventListener('input', (e) => node.setReg(e.target.value));
$('chaosDelay').addEventListener('change', syncChaos);
$('chaosDup').addEventListener('change', syncChaos);
function syncChaos() {
  node.setChaos({ delay: $('chaosDelay').checked, dup: $('chaosDup').checked });
}

/* ---------- 渲染 ---------- */
function render(view) {
  $('nodeId').textContent = view.nodeId;
  $('status').textContent = view.connected ? '已连接服务端' : '未连接';
  $('status').style.color = view.connected ? 'var(--srv)' : 'var(--bad)';
  $('total').textContent = view.total;
  // 所有节点的格子一览（格子集合相同 = 收敛的直观证据）
  $('slots').textContent = 'counts = ' + JSON.stringify(view.counter.counts);
  const input = $('regInput');
  if (input.value !== view.reg.value) input.value = view.reg.value; // 远端合并写回
  $('regVer').textContent = `版本 n=${view.reg.n} by=${view.reg.by || '—'}`;
}

function addLog(text) {
  const line = document.createElement('div');
  if (text.includes('重复')) line.className = 'chaos';
  line.textContent = text;
  const log = $('log');
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

render(node.read());
