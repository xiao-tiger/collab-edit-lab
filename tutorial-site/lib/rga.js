// ============================================================
// 迷你 RGA —— 文本 CRDT
//
// 【教学副本】canonical 版本在 ../crdt/02-rga/public/rga.js，
// 内容一致（此处仅改为 ESM export；副本是有意为之：每个阶段自包含可读）。
//
// Item = { id, left, ch, deleted }
//   id       全局唯一、可比较（站点id + 计数器）
//   left     插入时左边那个字符的 id
//   deleted  删除 = 打墓碑（不物理移除）
// 合并 = 按 id 求并集（墓碑"删过即删"）；重建文本 = 从根 DFS，
// 同一 left 的并发兄弟按 id 降序（"后来者居左"，否则打字落位错误）。
// ============================================================

export function makeRGA(siteId) {
  return { siteId, counter: 0, items: new Map() };
}

function nextId(rga) {
  return `${rga.siteId}:${++rga.counter}`;
}

export function rgaInsert(rga, pos, ch) {
  const seq = rgaSequence(rga);
  const left = pos === 0 ? null : seq[pos - 1].id;
  const item = { id: nextId(rga), left, ch, deleted: false };
  rga.items.set(item.id, item);
  return item;
}

export function rgaDelete(rga, pos, len) {
  const seq = rgaSequence(rga);
  for (let i = pos; i < Math.min(pos + len, seq.length); i++) {
    seq[i].deleted = true;
  }
}

export function rgaMerge(into, snapshotItems) {
  for (const it of snapshotItems) {
    const cur = into.items.get(it.id);
    if (!cur) into.items.set(it.id, { ...it });
    else if (it.deleted && !cur.deleted) cur.deleted = true;
  }
}

export function rgaSequence(rga, includeDeleted = false) {
  const children = new Map();
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
      walk(it.id);
    }
  })(null);
  return out;
}

export function rgaText(rga) {
  return rgaSequence(rga).map((i) => i.ch).join('');
}
