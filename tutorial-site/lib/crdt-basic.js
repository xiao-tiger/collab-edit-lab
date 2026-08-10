// ============================================================
// 最简 CRDT：G-Counter 与 LWW-Register
//
// 【教学副本】canonical 版本在 ../crdt/01-counter-register/public/crdt-core.js，
// 内容一致（此处仅改为 ESM export；副本是有意为之：每个阶段自包含可读）。
//
// CRDT 的收敛不依赖中心定序，靠的是 merge 满足三条数学性质：
//   交换律  merge(a, b) === merge(b, a)
//   结合律  merge(merge(a, b), c) === merge(a, merge(b, c))
//   幂等    merge(a, a) === a        （重复投递无副作用）
// 设计要点：状态里不放"我是谁"（身份属于副本，不属于 CRDT 状态）。
// ============================================================

/* G-Counter：每个节点只改自己那一格；merge 每格取 max */
export function makeGCounter() {
  return { counts: {} };
}
export function gInc(g, nodeId) {
  g.counts[nodeId] = (g.counts[nodeId] || 0) + 1;
}
export function gValue(g) {
  return Object.values(g.counts).reduce((a, b) => a + b, 0);
}
export function gMerge(a, b) {
  const ids = new Set([...Object.keys(a.counts), ...Object.keys(b.counts)]);
  const counts = {};
  for (const id of ids) counts[id] = Math.max(a.counts[id] || 0, b.counts[id] || 0);
  return { counts };
}

/* LWW-Register：n 大者胜；n 并列按 by 字典序裁决（确定性）。
   永不发散，但并发写会丢一个 —— C2 文本 CRDT 的动机。 */
export function makeRegister() {
  return { value: '', n: 0, by: '' };
}
export function regSet(reg, value, nodeId) {
  reg.value = value;
  reg.n += 1;
  reg.by = nodeId;
}
export function regMerge(a, b) {
  if (a.n !== b.n) return a.n > b.n ? { ...a } : { ...b };
  if (a.by === b.by) return { ...a };
  return a.by > b.by ? { ...a } : { ...b };
}
