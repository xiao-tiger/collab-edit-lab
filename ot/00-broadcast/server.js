// ============================================================
// Stage 0：最笨的协同 —— 全量文本广播
//
// 服务端只有三个职责：
//   1. 提供一个网页（index.html）
//   2. 内存里存一份"文档"（就是个大字符串）
//   3. 收到任何客户端发来的全量文本 → 覆盖内存 → 广播给其他所有人
// ============================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 文档本体：一个字符串。没有版本、没有历史、没有操作概念
let doc = '';

const server = createServer(async (req, res) => {
  // 极简静态服务：不管请求什么路径，都返回编辑器页面
  const html = await readFile(join(__dirname, 'public', 'index.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

const wss = new WebSocketServer({ server });

// 回调中的 ws 参数就是客户端浏览器对象
wss.on('connection', (ws) => {
  // 新客户端连上：把当前文档全量发给它（否则它看到的是空白页）
  ws.send(JSON.stringify({ type: 'init', text: doc }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'update') {
      // 关键问题点①：全量覆盖，后到者胜（last-write-wins）
      // 服务端根本不知道这次"更新"是基于哪个版本改出来的
      doc = msg.text;

      // 广播给除发送者外的所有人
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'update', text: doc }));
        }
      }
    }
  });
});

// 注意：不要用 6000，它是浏览器受限端口（X11），会被直接拒绝连接
const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Stage 0 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
