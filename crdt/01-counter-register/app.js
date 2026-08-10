/* ============================================================
   Stage C1 · 渲染层（只做 DOM：画快照 + 把用户操作转发给数据层）
   数据层在 sim.js，算法在 crdt-core.js。
   ============================================================ */

const sim = createCounterSim({
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
document.querySelectorAll('input[name="mode"]').forEach((r) =>
  r.addEventListener('change', () => sim.setMode(r.value))
);

/* ---------- 渲染（输入参数 = sim.read() 快照） ---------- */
function render(view) {
  renderNode(view.A, document.getElementById('nodeA'));
  renderNode(view.B, document.getElementById('nodeB'));

  if (view.same && view.inFlight === 0) verdict.innerHTML = '<span class="ok">两端一致 ✅（乱序/重复也收敛）</span>';
  else if (view.same) verdict.innerHTML = '<span class="syncing">已一致，还有消息在路上…</span>';
  else if (view.inFlight > 0) verdict.innerHTML = '<span class="syncing">同步中…</span>';
  else verdict.innerHTML = '<span class="bad">发散 ❌（朴素覆盖丢了并发增量）</span>';
}

function renderNode(node, el) {
  el.querySelector('.big').textContent = gValue(node.counter);
  el.querySelector('.slots').textContent = 'counts = ' + JSON.stringify(node.counter.counts);
  const input = el.querySelector('input');
  if (input.value !== node.reg.value) input.value = node.reg.value; // 远端合并写回
  el.querySelector('.ver').textContent = `版本 n=${node.reg.n} by=${node.reg.by || '—'}`;
}

/* 两个节点面板上的按钮/输入框 → 数据层意图方法 */
document.getElementById('nodeA').querySelector('button').onclick = () => sim.inc('A');
document.getElementById('nodeB').querySelector('button').onclick = () => sim.inc('B');
document.getElementById('nodeA').querySelector('input').oninput = (e) => sim.setReg('A', e.target.value);
document.getElementById('nodeB').querySelector('input').oninput = (e) => sim.setReg('B', e.target.value);

render(sim.read());
