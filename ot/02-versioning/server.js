// ============================================================
// Stage 2：版本号 + 服务端全局定序
//
// 新增概念：
//   rev      —— 文档版本号，服务端每接受一个操作 +1
//   baseRev  —— 客户端说："我这个操作是基于版本 N 的文档算出来的"
//   history  —— 服务端保存所有已接受操作的历史（Stage 3 的关键！）
//
// 冲突处理策略（本阶段是"保守派"）：
//   baseRev === rev → 操作是新鲜的，接受，分配新版本号，广播给所有人
//   baseRev !== rev → 操作过期了！说明对方生成它之后，文档已被别人改过
//                     → 【拒绝】，并把权威全文发回去让对方强制重同步
//
// 效果：系统永远不会发散（服务端是唯一真理源），但代价是——
//       被拒绝的操作连同用户后续输入一起【丢失】。这个"痛"就是 Stage 3 要解决的。
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

let doc = '';
let rev = 0;
const history = []; // history[i] = 把文档从版本 i 变成版本 i+1 的那个操作

function applyOp(doc, op) {
  if (op.kind === 'insert') return doc.slice(0, op.pos) + op.str + doc.slice(op.pos);
  if (op.kind === 'delete') return doc.slice(0, op.pos) + doc.slice(op.pos + op.len);
  return doc;
}

const server = createServer(async (req, res) => {
  const html = await readFile(join(__dirname, 'public', 'index.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', text: doc, rev }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type !== 'op') return;

    if (msg.baseRev === rev) {
      // 新鲜操作：接受、定序（rev+1 就是全局顺序）、入历史、广播（含发送者，作为"回执"）
      doc = applyOp(doc, msg.op);
      rev++;
      history.push(msg.op);
      console.log(`[接受] rev=${rev}`, JSON.stringify(msg.op), '→', JSON.stringify(doc));
      for (const client of wss.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'op', op: msg.op, rev, from: msg.from }));
        }
      }
    } else {
      // 过期操作：拒绝 + 强制重同步。服务端知道它错过了哪些操作
      // （就是 history[baseRev] 到 history[rev-1]），但现在还没能力"修正"，只能拒绝。
      console.log(`[拒绝] baseRev=${msg.baseRev} 但当前 rev=${rev}，错过了 ${rev - msg.baseRev} 个操作`);
      ws.send(JSON.stringify({ type: 'reject', doc, rev }));
    }
  });
});

const PORT = 8002;
server.listen(PORT, () => {
  console.log(`Stage 2 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
