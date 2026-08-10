// ============================================================
// Stage C1（真服务端版）：G-Counter + LWW-Register
//
// 服务端职责（注意它有多"哑"）：
//   1. 静态服务（给出页面与模块）
//   2. 快照中转：收到某节点的状态快照 → 原样转发给其他节点
//   3. 存档副本：顺手把快照 merge 进自己的一份状态，
//      只为"新标签页加入时能拿到当前进度" —— 它不定序、不裁决，
//      收敛完全靠各节点客户端的 CRDT merge。
//      对比 OT 篇：那里的服务端是权威（定序 + transform），这里只是搬运工。
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { makeGCounter, gValue, gMerge, makeRegister, regMerge } from './public/crdt-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// 存档副本（服务端的唯一状态）
let archive = { counter: makeGCounter(), reg: makeRegister() };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? 'index.html' : req.url.slice(1);
  try {
    const data = await readFile(join(__dirname, 'public', path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // 新节点加入：发存档副本（它 merge 后就追上了进度）
  ws.send(JSON.stringify({ type: 'init', from: 'server', ...archive }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type !== 'snapshot') return;

    // ① 存档：merge 进服务端副本（纯函数，重复/乱序无所谓）
    archive.counter = gMerge(archive.counter, msg.counter);
    archive.reg = regMerge(archive.reg, msg.reg);
    console.log(`[中转] ${msg.from} 的快照 → 存档总值=${gValue(archive.counter)}，转发给其他 ${wss.clients.size - 1} 个节点`);

    // ② 中转：原样转发给其他所有节点
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) client.send(JSON.stringify(msg));
    }
  });
});

const PORT = 8011;
server.listen(PORT, () => {
  console.log(`Stage C1 已启动: http://localhost:${PORT} （每个标签页 = 一个节点，多开几个试试）`);
});
