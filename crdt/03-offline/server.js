// ============================================================
// Stage C3（真服务端版）：离线合并实测
//
// 服务端与 C2 完全相同：静态服务 + 快照中转 + 存档副本（RGA 并集）。
// 离线实验靠客户端真断开 WebSocket（ws.close()），重连后：
//   ① 服务端发 init（存档副本，含离线期间别人的编辑）
//   ② 本节点补发自己的快照（离线期间的本地编辑）
//   双方 merge 即收敛 —— 状态型 CRDT 离线的全部秘密。
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { makeRGA, rgaMerge, rgaText } from './public/rga.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const archive = makeRGA('server');

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
  ws.send(JSON.stringify({ type: 'init', from: 'server', items: [...archive.items.values()] }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type !== 'snapshot') return;
    rgaMerge(archive, msg.items);
    console.log(`[中转] ${msg.from} 的快照（${msg.items.length} 个 Item）→ 存档共 ${archive.items.size} 项，文本=${JSON.stringify(rgaText(archive))}`);
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) client.send(JSON.stringify(msg));
    }
  });
});

const PORT = 8013;
server.listen(PORT, () => {
  console.log(`Stage C3 已启动: http://localhost:${PORT} （开两个标签页，用「断开网络」按钮做离线实验）`);
});
