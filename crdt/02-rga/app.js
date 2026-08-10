/* ============================================================
   Stage C2 · 渲染层（只做 DOM：画快照 + 把输入转发给数据层）
   数据层在 sim.js，算法在 rga.js。
   ============================================================ */

const sim = createRgaSim({
  latency: 400,
  onChange: render,
  onLog: (e) => {
    const line = document.createElement('div');
    if (e.chaos) line.className = 'chaos';
    line.textContent = e.text;
    netlog.appendChild(line);
    netlog.scrollTop = netlog.scrollHeight;
  },
});

const netlog = document.getElementById('netlog');
const verdict = document.getElementById('verdict');

/* ---------- 控件 ---------- */
document.getElementById('chaosDup').addEventListener('change', syncChaos);
document.getElementById('chaosShuffle').addEventListener('change', syncChaos);
function syncChaos() {
  sim.setChaos({
    dup: document.getElementById('chaosDup').checked,
    shuffle: document.getElementById('chaosShuffle').checked,
  });
}

/* ---------- 输入 → 数据层 ---------- */
document.getElementById('taA').addEventListener('input', (e) => sim.editText('A', e.target.value));
document.getElementById('taB').addEventListener('input', (e) => sim.editText('B', e.target.value));

/* ---------- 渲染 ---------- */
function render(view) {
  renderNode('A', view.A, document.getElementById('taA'));
  renderNode('B', view.B, document.getElementById('taB'));

  if (view.same && view.inFlight === 0) verdict.innerHTML = '<span class="ok">两端一致 ✅（文本与结构完全相同）</span>';
  else verdict.innerHTML = '<span class="syncing">同步中…</span>';
}

function renderNode(id, rga, ta) {
  // 远端合并改变了数据层文本 → 写回 textarea
  const text = rgaText(rga);
  if (ta.value !== text) ta.value = text;

  // 内部结构：每个 Item 一个格子（id 上标；删除线 = 墓碑）
  const struct = document.getElementById('struct' + id);
  struct.innerHTML = '';
  for (const it of rgaSequence(rga, true)) {
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

render(sim.read());
