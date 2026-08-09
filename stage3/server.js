// ============================================================
// Stage 3：transform —— OT 的心脏
//
// 与 Stage 2 的唯一本质区别：过期操作不再被拒绝。
//
//   收到 baseRev 过期的操作 op：
//     missed = history[baseRev ... rev-1]     // 它错过的所有操作
//     for (const h of missed) op = transform(op, h, false)
//     应用修正后的 op —— 编辑不再丢失！
//
// 配套变化：客户端也要做对称的变换（收到别人操作时，
// 把自己未确认的 pending/buffer 变换一遍），见 index.html。
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { applyOp, transform } from './public/ot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let doc = '';
let rev = 0;
const history = []; // history[i] = 把文档从版本 i 变成版本 i+1 的操作（已是变换后的最终形态）

const server = createServer(async (req, res) => {
  if (req.url === '/ot.mjs') {
    const js = await readFile(join(__dirname, 'public', 'ot.mjs'));
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return res.end(js);
  }
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

    let op = msg.op;
    if (msg.baseRev !== rev) {
      // 过期操作：针对它错过的每个操作，逐个 transform 修正坐标
      const missed = history.slice(msg.baseRev);
      for (const h of missed) op = transform(op, h, false);
      console.log(`[修正] baseRev=${msg.baseRev} 错过 ${missed.length} 个操作：`,
        JSON.stringify(msg.op), '→', JSON.stringify(op));
    }

    doc = applyOp(doc, op);
    rev++;
    history.push(op);
    console.log(`[接受] rev=${rev}`, JSON.stringify(op), '→', JSON.stringify(doc));
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'op', op, rev, from: msg.from }));
      }
    }
  });
});

const PORT = 8003;
server.listen(PORT, () => {
  console.log(`Stage 3 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
