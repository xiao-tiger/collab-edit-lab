// ============================================================
// OT 核心：操作模型 + transform
//
// 这份文件同时被服务端（Node）和客户端（浏览器）使用。
// 协同双方必须用【同一套】变换规则，数学上才保证收敛。
// ============================================================

// 把操作应用到文档字符串上
export function applyOp(doc, op) {
  if (op.kind === 'insert') return doc.slice(0, op.pos) + op.str + doc.slice(op.pos);
  if (op.kind === 'delete') return doc.slice(0, op.pos) + doc.slice(op.pos + op.len);
  return doc;
}

// transform(op, other, opIsLeft)
//   前提：other 已经应用到了文档上。
//   返回一个新操作：与 op"意图等效"，但可以安全地应用在 other 之后。
//   opIsLeft：在【服务端最终定序】里 op 是否排在 other 前面。
//   —— 只在"两个 insert 落在同一位置"这种无法判定先后的场景起决定作用。
export function transform(op, other, opIsLeft) {
  op = { ...op };

  if (op.kind === 'insert' && other.kind === 'insert') {
    // 别人在我前面插了字 → 我的插入点右移
    // 位置相同：排前面的（left）原地不动，排后面的右移。
    // 规则本身是任意的，但必须全局一致，否则两端会得出不同结果。
    if (other.pos < op.pos || (other.pos === op.pos && !opIsLeft)) {
      op.pos += other.str.length;
    }
  }

  else if (op.kind === 'insert' && other.kind === 'delete') {
    if (other.pos + other.len <= op.pos) {
      op.pos -= other.len;      // 被删区间整体在我左边 → 我左移
    } else if (other.pos < op.pos) {
      // 我的插入点被删除区间覆盖 → 插入作废（返回空操作）。
      // 必须与规则三「delete 吸收 insert」同一生死裁决（两个方向都 delete 赢），
      // 否则一端保留插入、另一端删除插入 → 发散（违反收敛性质 TP1）
      return { kind: 'insert', pos: other.pos, str: '' };
    }
  }

  else if (op.kind === 'delete' && other.kind === 'insert') {
    if (other.pos <= op.pos) {
      op.pos += other.str.length;        // 插入在我左边 → 删除区间右移
    } else if (other.pos < op.pos + op.len) {
      op.len += other.str.length;        // 插入落进我的删除区间 → 吸收（连它一起删）
    }
  }

  else if (op.kind === 'delete' && other.kind === 'delete') {
    if (other.pos + other.len <= op.pos) {
      op.pos -= other.len;               // 不相交、在我左边 → 左移
    } else if (other.pos < op.pos + op.len) {
      // 相交/包含：重叠部分对方已删，我只需删剩下的
      const overlap =
        Math.min(op.pos + op.len, other.pos + other.len) - Math.max(op.pos, other.pos);
      op.pos = Math.min(op.pos, other.pos);
      op.len -= overlap;
    }
  }

  return op;
}

// 双向变换：a 是"先被服务端接受"的那个操作。
// 返回 [a', b']，数学保证（收敛性）：
//   applyOp(applyOp(doc, a), b') === applyOp(applyOp(doc, b), a')
export function transformX(a, b) {
  return [transform(a, b, true), transform(b, a, false)];
}
