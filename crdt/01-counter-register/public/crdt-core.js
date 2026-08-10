/* ============================================================
   Stage C1：最简 CRDT（ESM 版：浏览器 <script type="module"> 与 Node import 通用） —— G-Counter 与 LWW-Register

   CRDT 的收敛不依赖中心定序，靠的是 merge 满足三条数学性质：
     交换律  merge(a, b) === merge(b, a)
     结合律  merge(merge(a, b), c) === merge(a, merge(b, c))
     幂等    merge(a, a) === a        （重复投递无副作用）
   满足这三条，消息乱序、重复、延迟都无所谓 —— 必然收敛。

   设计要点：状态里不放"我是谁"。节点身份属于副本（replica），
   不属于 CRDT 状态 —— 否则 merge 结果会依赖操作数顺序，
   交换律就不严格成立了（我们的测试抓到过这个问题）。
   ============================================================ */

/**
 * @typedef {Object} GCounter
 * @property {Record<string, number>} counts 每节点一格：{ 节点id: 该节点增过的次数 }，如 { A: 2, B: 1 }
 */

/**
 * @typedef {Object} Register
 * @property {string} value 当前值
 * @property {number} n     逻辑时钟：本节点每写一次 +1
 * @property {string} by    最后写入的节点 id（n 并列时按它字典序裁决）
 */

/* ---------- G-Counter（只增计数器，状态型 CvRDT）----------
   规则：每个节点只能改自己那一格 → 各格天然无冲突；
        merge 对每一格取 max → 三性质全满足            */

/**
 * 创建一个只增计数器状态。
 * @returns {GCounter} 初始状态 { counts: {} } 类型：Record<counts, Record<string, number>>
 */
export function makeGCounter() {
  return { counts: {} };  // counts: { A: 1, B: 1 }
}

/**
 * 本节点 +1（只能改自己那一格）。
 * @param {GCounter} g
 * @param {string} nodeId 节点 id，如 'A'
 * @returns {void} 原地修改 g
 */
export function gInc(g, nodeId) {
  g.counts[nodeId] = (g.counts[nodeId] || 0) + 1;
}

/**
 * 读取计数器当前总值（各格求和）。
 * @param {GCounter} g
 * @returns {number}
 */
export function gValue(g) {
  return Object.values(g.counts).reduce((a, b) => a + b, 0);
}

/**
 * 合并两个计数器状态（每格取 max）。
 * @param {GCounter} a
 * @param {GCounter} b
 * @returns {GCounter} 新状态，不修改入参
 */
export function gMerge(a, b) {
  const ids = new Set([...Object.keys(a.counts), ...Object.keys(b.counts)]);
  const counts = {};
  for (const id of ids) counts[id] = Math.max(a.counts[id] || 0, b.counts[id] || 0);
  return { counts };
}

/* ---------- LWW-Register（最后写入者胜寄存器）----------
   merge：n 大者胜；n 并列时按 by 字典序裁决（确定性！）。
   特点：永不发散，但并发写会丢一个（last-writer-wins）——
   这就是 C2 文本 CRDT 要解决"不丢字符"的动机。           */

/**
 * 创建一个寄存器状态。
 * @returns {Register} 初始状态 { value: '', n: 0, by: '' }
 */
export function makeRegister() {
  return { value: '', n: 0, by: '' };
}

/**
 * 写入寄存器（逻辑时钟 +1，记录写入者）。
 * @param {Register} reg
 * @param {string} value  新值
 * @param {string} nodeId 节点 id，如 'A'
 * @returns {void} 原地修改 reg
 */
export function regSet(reg, value, nodeId) {
  reg.value = value;
  reg.n += 1;
  reg.by = nodeId;
}

/**
 * 合并两个寄存器状态：n 大者胜，并列按 by 字典序裁决。
 * @param {Register} a
 * @param {Register} b
 * @returns {Register} 胜出的状态副本，不修改入参
 */
export function regMerge(a, b) {
  if (a.n !== b.n) return a.n > b.n ? { ...a } : { ...b };
  if (a.by === b.by) return { ...a };
  // a 和 b 同时进行了 修改，出现冲突，全局规定，只保留一个，约定以  by 来定也就是 nodeId
  return a.by > b.by ? { ...a } : { ...b }; // 并列裁决：规则任意但必须全局一致（耳熟吗？）
}
