// ============================================================
// Stage 5：持久化 + 快照截断 + 协同 undo
//
// 在 Stage 4 基础上新增：
//
// 1) 持久化：每次变更把 { doc, rev, snapshotRev, history } 写入 data.json，
//    重启后恢复 —— 文档不再因重启丢失。
//
// 2) 快照截断：history 不能无限长（否则新客户端/过期修正都要回放全部）。
//    每 SNAPSHOT_EVERY 个操作做一次"快照"：记录 snapshotRev = 当前 rev，清空 history。
//    代价：baseRev < snapshotRev 的请求无法再做 transform 修正
//    → 回退为 resync（全量同步权威文档），这正是真实系统的做法。
//
// 3) 协同 undo：撤销"我的最近一个操作"。
//    history 条目在应用时就存好逆操作 inverse（delete 的逆 = 插回被删文本），
//    undo = 取出 inverse，针对它之后的所有操作逐个 transform 到当前版本，再作为正常操作应用。
//    注意：undo 只撤销自己的操作；undo 本身也作为一个新操作进入历史。
// ============================================================
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { applyOp, transform } from './public/ot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data.json');
const SNAPSHOT_EVERY = 20;

let doc = '';
let rev = 0;
let snapshotRev = 0; // history[0] 对应的版本号（snapshotRev 之前的历史已截断）
let history = [];    // 元素：{ op, inverse, from, isUndo, undone }

// ---- 持久化：启动恢复 + 变更落盘（节流 100ms）----
try {
  const d = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  ({ doc, rev, snapshotRev, history } = d);
  console.log(`[持久化] 恢复成功：rev=${rev}，文档=${JSON.stringify(doc)}`);
} catch { /* 首次启动，无历史文件 */ }

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    writeFile(DATA_FILE, JSON.stringify({ doc, rev, snapshotRev, history })).catch(() => {});
  }, 100);
}

function snapshotIfNeeded() {
  if (history.length >= SNAPSHOT_EVERY) {
    snapshotRev = rev;
    history = [];
    console.log(`[快照] rev=${rev}：history 已截断（快照点 snapshotRev=${snapshotRev}）`);
  }
}

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

function broadcast(msg) {
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  }
}

function acceptOp(op, from, isUndo) {
  // 应用前算出逆操作存进历史（delete 的逆 = 插回被删文本，所以要在应用前取）
  const inverse = op.kind === 'insert'
    ? { kind: 'delete', pos: op.pos, len: op.str.length }
    : { kind: 'insert', pos: op.pos, str: doc.slice(op.pos, op.pos + op.len) };
  doc = applyOp(doc, op);
  rev++;
  history.push({ op, inverse, from, isUndo, undone: false });
  snapshotIfNeeded();
  persist();
  console.log(`[接受] rev=${rev}`, JSON.stringify(op), '→', JSON.stringify(doc));
  broadcast({ type: 'op', op, rev, from, undo: !!isUndo });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', text: doc, rev }));

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    // ---- 光标消息：与 Stage 4 相同（注意 history 索引要减去 snapshotRev）----
    if (msg.type === 'cursor') {
      let pos = msg.pos;
      if (msg.baseRev >= snapshotRev && msg.baseRev < rev) {
        for (let i = msg.baseRev - snapshotRev; i < history.length; i++) {
          pos = transform({ kind: 'insert', pos, str: '' }, history[i].op, false).pos;
        }
      }
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'cursor', pos, from: msg.from, rev }));
        }
      }
      return;
    }

    // ---- undo：撤销"我的最近一个操作" ----
    if (msg.type === 'undo') {
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        if (h.from === msg.from && !h.isUndo && !h.undone) {
          let inv = { ...h.inverse };
          for (let j = i + 1; j < history.length; j++) inv = transform(inv, history[j].op, false);
          h.undone = true;
          console.log(`[undo] ${msg.from} 撤销 ${JSON.stringify(h.op)}，逆操作变换为 ${JSON.stringify(inv)}`);
          acceptOp(inv, msg.from, true);
          return;
        }
      }
      ws.send(JSON.stringify({ type: 'undo-empty' }));
      return;
    }

    // ---- 操作消息 ----
    if (msg.type !== 'op') return;

    if (msg.baseRev < snapshotRev) {
      // 太老了：历史已截断，无法修正 → 全量重同步
      console.log(`[重同步] baseRev=${msg.baseRev} < snapshotRev=${snapshotRev}`);
      ws.send(JSON.stringify({ type: 'resync', doc, rev }));
      return;
    }
    let op = msg.op;
    if (msg.baseRev !== rev) {
      const missed = history.slice(msg.baseRev - snapshotRev).map((h) => h.op);
      for (const h of missed) op = transform(op, h, false);
      console.log(`[修正] baseRev=${msg.baseRev} 错过 ${missed.length} 个操作：`,
        JSON.stringify(msg.op), '→', JSON.stringify(op));
    }
    acceptOp(op, msg.from, false);
  });
});

const PORT = 8005;
server.listen(PORT, () => {
  console.log(`Stage 5 已启动: http://localhost:${PORT} （开两个标签页试验）`);
});
