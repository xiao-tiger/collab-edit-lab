/* ============================================================
   Stage C2 · 渲染层（只做 DOM：画快照 + 把输入转发给数据层）
   数据层在 client.js，算法在 rga.js。
   ============================================================ */
import { rgaSequence } from './rga.js';
import { createRgaNode } from './client.js';

const node = createRgaNode({ onChange: render, onLog: addLog });

const $ = (id) => document.getElementById(id);

/* ---------- 控件 → 数据层 ---------- */
$('editor').addEventListener('input', (e) => node.editText(e.target.value));
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

  const editor = $('editor');
  if (editor.value !== view.text) editor.value = view.text; // 远端合并写回
  $('meta').textContent = `文本长度 ${view.text.length} ｜ Item 总数 ${view.rga.items.size}（含墓碑）`;

  // 内部结构：每个 Item 一个格子（id 上标；删除线 = 墓碑）
  const struct = $('struct');
  struct.innerHTML = '';
  for (const it of rgaSequence(view.rga, true)) {
    const chip = document.createElement('span');
    chip.className = 'item' + (it.deleted ? ' tomb' : '');
    const ch = document.createElement('span');
    ch.textContent = it.ch === ' ' ? '␣' : it.ch;
    const idEl = document.createElement('span');
    idEl.className = 'id';
    idEl.textContent = it.id;
    chip.append(ch, idEl);
    struct.appendChild(chip);
  }
}

function addLog(text, chaos) {
  const line = document.createElement('div');
  if (chaos) line.className = 'chaos';
  line.textContent = text;
  const log = $('log');
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

render(node.read());
