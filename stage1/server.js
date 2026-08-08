// ============================================================
// Stage 1：从"全量文本"到"操作"（Operation）
//
// 与 Stage 0 的唯一区别：
//   不再传整篇文档，而是传一个个操作：
//     { kind: 'insert', pos: 3, str: 'X' }   在位置3插入X
//     { kind: 'delete', pos: 3, len: 1 }     删除位置3起的1个字符
//
// 服务端仍然是"傻瓜"：收到操作就往自己文档上套，然后原样转发。
// —— 还没有版本号、没有修正逻辑，所以并发下依然会发散（这正是本阶段要观察的）
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

let doc = '';

// 把一个操作套用到文档上（客户端里也有一份一模一样的逻辑）
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
  ws.send(JSON.stringify({ type: 'init', text: doc }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'op') {
      doc = applyOp(doc, msg.op);
      console.log('收到操作', JSON.stringify(msg.op), '→ 服务端文档:', JSON.stringify(doc));
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'op', op: msg.op }));
        }
      }
    }
  });
});

// 注意端口：stageN 用 800N，这样几个阶段的 demo 可以同时开着对比
const PORT = 8001;
server.listen(PORT, () => {
  console.log(`Stage 1 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
