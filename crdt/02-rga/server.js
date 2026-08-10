// ============================================================
// Stage C2（真服务端版）：迷你 RGA 文本协同
//
// 服务端职责（和 C1 一样"哑"）：
//   1. 静态服务
//   2. 快照中转：收到某节点的 Item 集合快照 → 原样转发给其他节点
//   3. 存档副本：把快照 merge 进自己的 RGA（并集），让新标签页能追上进度
//   不定序、不裁决 —— 收敛完全靠客户端的 rgaMerge。
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { makeRGA, rgaMerge, rgaText } from './public/rga.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// 存档副本：服务端的全部状态就是一个 RGA（存所有 Item，含墓碑）
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
  // 新节点加入：发存档副本里的全部 Item
  ws.send(JSON.stringify({ type: 'init', from: 'server', items: [...archive.items.values()] }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type !== 'snapshot') return;

    archive && rgaMerge(archive, msg.items); // ① 存档（并集，重复/乱序无所谓）
    console.log(`[中转] ${msg.from} 的快照（${msg.items.length} 个 Item）→ 存档共 ${archive.items.size} 项，文本=${JSON.stringify(rgaText(archive))}`);

    // ② 中转给其他节点
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) client.send(JSON.stringify(msg));
    }
  });
});

const PORT = 8012;
server.listen(PORT, () => {
  console.log(`Stage C2 已启动: http://localhost:${PORT} （每个标签页 = 一个节点）`);
});
