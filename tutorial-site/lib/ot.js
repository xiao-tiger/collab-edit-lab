// ============================================================
// OT 核心算法 —— 与 collab-demo/stage3/public/ot.mjs 完全同源
// 本站所有交互组件（沙盒、可视化播放器）都跑这套真实算法
// ============================================================

// 把操作应用到文档字符串上
export function applyOp(doc, op) {
  if (op.kind === 'insert') return doc.slice(0, op.pos) + op.str + doc.slice(op.pos);
  if (op.kind === 'delete') return doc.slice(0, op.pos) + doc.slice(op.pos + op.len);
  return doc;
}

// transform(op, other, opIsLeft)
//   前提：other 已应用。返回与 op「意图等效」、但可安全应用在 other 之后的新操作。
//   opIsLeft：在服务端最终定序里 op 是否排在 other 前面（裁决同位置双 insert）。
export function transform(op, other, opIsLeft) {
  op = { ...op };

  if (op.kind === 'insert' && other.kind === 'insert') {
    // 别人在我前面插了字 → 右移；同位置：排后面的右移（规则任意但必须全局一致）
    if (other.pos < op.pos || (other.pos === op.pos && !opIsLeft)) op.pos += other.str.length;
  } else if (op.kind === 'insert' && other.kind === 'delete') {
    if (other.pos + other.len <= op.pos) {
      op.pos -= other.len;
    } else if (other.pos < op.pos) {
      // 插入点被删除区间覆盖 → 作废为空操作。
      // 必须与下一条「delete 吸收 insert」同一生死裁决（两个方向都 delete 赢），
      // 否则一端保留插入、另一端删除插入 → 发散（违反收敛性质 TP1）
      return { kind: 'insert', pos: other.pos, str: '' };
    }
  } else if (op.kind === 'delete' && other.kind === 'insert') {
    if (other.pos <= op.pos) {
      op.pos += other.str.length;
    } else if (other.pos < op.pos + op.len) {
      op.len += other.str.length; // 插入落进删除区间 → 吸收（连它一起删）
    }
  } else if (op.kind === 'delete' && other.kind === 'delete') {
    if (other.pos + other.len <= op.pos) {
      op.pos -= other.len;
    } else if (other.pos < op.pos + op.len) {
      // 重叠部分对方已删，只删剩下的
      const overlap = Math.min(op.pos + op.len, other.pos + other.len) - Math.max(op.pos, other.pos);
      op.pos = Math.min(op.pos, other.pos);
      op.len -= overlap;
    }
  }
  return op;
}

// 把一次输入 diff 成操作（公共前缀/后缀法），最多产生 delete + insert 两个
export function diffToOps(oldText, newText) {
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length, newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd--; }
  const ops = [];
  if (oldEnd > start) ops.push({ kind: 'delete', pos: start, len: oldEnd - start });
  if (newEnd > start) ops.push({ kind: 'insert', pos: start, str: newText.slice(start, newEnd) });
  return ops;
}

// 内容校验值（哈希）：两端不同 = 发散
export function checksum(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16);
}

// 操作的展示格式
export function fmtOp(op) {
  return op.kind === 'insert' ? `insert @${op.pos} "${op.str}"` : `delete @${op.pos} ×${op.len}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
