// ============================================================
// Stage 4：打磨 —— 光标 transform + 远端光标同步
//
// 在 Stage 3 完整 OT 的基础上新增：
//   光标消息中转（{ type:'cursor', pos, baseRev, from }）：
//     光标和操作一样有过期问题！对方发光标时基于旧版本，
//     服务端用 history 把 pos 修正到当前版本再转发 ——
//     光标修正 = 把光标看成"空串 insert"做 transform。
//   光标不参与定序、不进 history，纯粹是瞬时状态。
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
const history = [];

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

    // ---- 光标消息：修正坐标后中转（不定序、不入历史）----
    if (msg.type === 'cursor') {
      let pos = msg.pos;
      if (msg.baseRev < rev) {
        for (let i = msg.baseRev; i < rev; i++) {
          pos = transform({ kind: 'insert', pos, str: '' }, history[i], false).pos;
        }
        console.log(`[光标修正] @${msg.pos} → @${pos}（baseRev=${msg.baseRev} → rev=${rev}）`);
      }
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'cursor', pos, from: msg.from, rev }));
        }
      }
      return;
    }

    // ---- 操作消息：与 Stage 3 相同 ----
    if (msg.type !== 'op') return;
    let op = msg.op;
    if (msg.baseRev !== rev) {
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

const PORT = 8004;
server.listen(PORT, () => {
  console.log(`Stage 4 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
