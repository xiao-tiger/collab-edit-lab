/* ============================================================
   Stage C1：最简 CRDT —— G-Counter 与 LWW-Register

   CRDT 的收敛不依赖中心定序，靠的是 merge 满足三条数学性质：
     交换律  merge(a, b) === merge(b, a)
     结合律  merge(merge(a, b), c) === merge(a, merge(b, c))
     幂等    merge(a, a) === a        （重复投递无副作用）
   满足这三条，消息乱序、重复、延迟都无所谓 —— 必然收敛。

   设计要点：状态里不放"我是谁"。节点身份属于副本（replica），
   不属于 CRDT 状态 —— 否则 merge 结果会依赖操作数顺序，
   交换律就不严格成立了（我们的测试抓到过这个问题）。
   ============================================================ */

/* ---------- G-Counter（只增计数器，状态型 CvRDT）----------
   状态：{ counts: { 节点id: 该节点自己增过的次数 } }
   规则：每个节点只能改自己那一格 → 各格天然无冲突；
        merge 对每一格取 max → 三性质全满足            */
function makeGCounter() {
  return { counts: {} };
}
function gInc(g, nodeId) {
  g.counts[nodeId] = (g.counts[nodeId] || 0) + 1;
}
function gValue(g) {
  return Object.values(g.counts).reduce((a, b) => a + b, 0);
}
function gMerge(a, b) {
  const ids = new Set([...Object.keys(a.counts), ...Object.keys(b.counts)]);
  const counts = {};
  for (const id of ids) counts[id] = Math.max(a.counts[id] || 0, b.counts[id] || 0);
  return { counts };
}

/* ---------- LWW-Register（最后写入者胜寄存器）----------
   状态：{ value, n: 逻辑时钟, by: 最后写入的节点id }
   merge：n 大者胜；n 并列时按 by 字典序裁决（确定性！）。
   特点：永不发散，但并发写会丢一个（last-writer-wins）——
   这就是 C2 文本 CRDT 要解决"不丢字符"的动机。           */
function makeRegister() {
  return { value: '', n: 0, by: '' };
}
function regSet(reg, value, nodeId) {
  reg.value = value;
  reg.n += 1;          // 逻辑时钟：本节点每写一次 +1
  reg.by = nodeId;
}
function regMerge(a, b) {
  if (a.n !== b.n) return a.n > b.n ? { ...a } : { ...b };
  if (a.by === b.by) return { ...a };
  return a.by > b.by ? { ...a } : { ...b }; // 并列裁决：规则任意但必须全局一致（耳熟吗？）
}
