// ============================================================
// Stage C4：Yjs 上手 —— 服务端
//
// 注意这个服务端和 OT 篇的本质区别：
//   它【不定序、不变换、不理解文档内容】，只是转发消息 + 房间管理。
//   CRDT 的收敛在客户端的 Y.Doc 里完成 —— 服务端哑了，拓扑自由了。
//   （y-websocket 官方还提供服务端持久化等可选能力，教学从简）
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? 'index.html' : req.url.slice(1);
  try {
    const data = await readFile(join(__dirname, 'public', path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found（先 npm run build 生成 public/bundle.js）');
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  // 房间名取自 URL 路径（ws://host/房间名），同房间的 Doc 自动同步
  setupWSConnection(ws, req);
});

const PORT = 8014;
server.listen(PORT, () => {
  console.log(`Stage C4 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
