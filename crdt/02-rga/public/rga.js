/* ============================================================
   Stage C2：迷你 RGA —— 文本 CRDT（约 80 行核心）

   核心思想：抛弃"位置坐标"，给每个字符发一张全局唯一的身份证：
   合并（状态型 CvRDT）：按 id 求并集 + 墓碑"删过即删"。
   排序（全副本一致地重建文本）：
     从根 DFS；同一 left 的并发兄弟按 id **降序**（"后来者居左"）。
     为什么必须降序：B 在 "hi" 的开头敲 'B'，若升序，B:1 会排在
     A:1(h) 后面 —— 用户在一处打字、字却出现在另一处，UX 错误。
     降序让新字符落回用户输入的位置；同时降序全局一致，收敛性不变。
     （和 OT 的 opIsLeft 同职，但无需协调，因为 id 天生可比较。）

   为什么这样就"赢"了 OT：
     - 没有 baseRev、没有 transform、没有中心定序：
       坐标从"相对位置"变成了"绝对身份"，过期问题不存在了
     - 乱序/重复/离线合并天然免疫（状态并集）
   代价：墓碑膨胀、每字符带元数据（Yjs 的 YATA 做了大量压缩优化）
   ============================================================ */

/**
 * @typedef {Object} RgaItem
 * @property {string} id        全局唯一、可比较的字符身份证（站点id:计数器，如 "B:3"）
 * @property {string|null} left 插入时左边那个字符的 id；null 表示文档开头
 * @property {string} ch        单个字符
 * @property {boolean} deleted  是否已删除（墓碑；不物理移除，否则后来者无法引用它）
 */

/**
 * @typedef {Object} RGA
 * @property {string} siteId                 本节点 id，如 'A'
 * @property {number} counter                本节点自增计数器（生成 id 用）
 * @property {Map<string, RgaItem>} items    全部字符（含墓碑），key 为 id
 */

/**
 * 创建一个 RGA 文档。
 * @param {string} siteId 本节点 id（全局唯一），如 'A'
 * @returns {RGA}
 */
function makeRGA(siteId) {
  return { siteId, counter: 0, items: new Map() };
}

/**
 * 生成下一个字符 id。
 * @param {RGA} rga
 * @returns {string} 形如 "A:3"
 */
function nextId(rga) {
  return `${rga.siteId}:${++rga.counter}`;
}

/* ---------- 本地编辑（针对"可见位置"）---------- */

/**
 * 在可见位置 pos 插入一个字符。
 * @param {RGA} rga
 * @param {number} pos  可见文本中的位置（0 = 最开头）
 * @param {string} ch   单个字符
 * @returns {RgaItem} 新建的字符项（left 指向 pos 左边那个可见字符）
 */
function rgaInsert(rga, pos, ch) {
  const seq = rgaSequence(rga);
  const left = pos === 0 ? null : seq[pos - 1].id;
  const item = { id: nextId(rga), left, ch, deleted: false };
  rga.items.set(item.id, item);
  return item;
}

/**
 * 删除可见位置 pos 起的 len 个字符（打墓碑）。
 * @param {RGA} rga
 * @param {number} pos
 * @param {number} len
 * @returns {void} 原地修改 rga（仅置 deleted 标记）
 */
function rgaDelete(rga, pos, len) {
  const seq = rgaSequence(rga);
  for (let i = pos; i < Math.min(pos + len, seq.length); i++) {
    seq[i].deleted = true;
  }
}

/* ---------- 合并：集合并集 + 墓碑优先 ----------
   交换/结合/幂等全部由"并集"天然保证 —— 乱序、重复、离线随便来 */

/**
 * 把对方发来的 Item 快照合并进本文档。
 * @param {RGA} into                      本文档（被原地修改）
 * @param {RgaItem[]} snapshotItems       对方全部 Item 的数组快照
 * @returns {void}
 */
function rgaMerge(into, snapshotItems) {
  for (const it of snapshotItems) {
    const cur = into.items.get(it.id);
    if (!cur) into.items.set(it.id, { ...it });
    else if (it.deleted && !cur.deleted) cur.deleted = true;
  }
}

/* ---------- 重建文本：从根 DFS，兄弟按 id 降序 ---------- */

/**
 * 按 RGA 规则排出全副本一致的字符序列。
 * @param {RGA} rga
 * @param {boolean} [includeDeleted=false] 是否包含墓碑（结构可视化时传 true）
 * @returns {RgaItem[]} 排序后的字符项数组（文本 = 各项 ch 拼接）
 */
function rgaSequence(rga, includeDeleted = false) {
  const children = new Map(); // leftId(null=根) → [items]
  for (const it of rga.items.values()) {
    const key = it.left ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(it);
  }
  for (const list of children.values()) {
    list.sort((x, y) => (x.id > y.id ? -1 : x.id < y.id ? 1 : 0)); // 降序：后来者居左
  }
  const out = [];
  (function walk(leftId) {
    for (const it of children.get(leftId) ?? []) {
      if (includeDeleted || !it.deleted) out.push(it);
      walk(it.id); // 子树紧随父节点 → 连续输入的字符不会被打散
    }
  })(null);
  return out;
}

/**
 * 读出当前可见文本。
 * @param {RGA} rga
 * @returns {string}
 */
function rgaText(rga) {
  return rgaSequence(rga).map((i) => i.ch).join('');
}

/* ---------- 已知局限（进阶阅读指引）----------
   1. 交错问题：两个站点"你一句我一句"并发插入同一位置时，
      RGA 可能把两段文字交错在一起（Yjs 的 YATA 算法解决了这点）
   2. 墓碑只增不减：真实系统靠 GC / 压缩控制（Yjs 会自动合并相邻 Item）
   3. 状态型每次发全量：真实系统用操作型（CmRDT）+ 因果广播省流量
*/
