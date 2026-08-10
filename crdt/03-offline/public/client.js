/* ============================================================
   Stage C3 · 数据层：RGA 节点 + 真实断网/重连

   数据流向：
     用户输入 ──editText──→ 本地 RGA ──sendSnapshot──→ WebSocket
     （离线时：只记 dirty，状态本身就在本地）              │
     渲染通知 ←── onChange(read()) ←── rgaMerge ←── 收到快照/init ○─┘

   分五段阅读：状态 → 本地操作 → 发送 → 接收 → 快照
   算法在 rga.js，渲染层在 app.js。
   ============================================================ */
import { makeRGA, rgaInsert, rgaDelete, rgaMerge, rgaText } from './rga.js';

/**
 * @typedef {Object} OfflineNodeView
 * @property {string} nodeId    本节点 id
 * @property {RGA} rga          本节点的 RGA 文档
 * @property {string} text      当前可见文本
 * @property {boolean} online   是否在线
 * @property {boolean} dirty    是否有未同步的本地变更
 */

/**
 * 创建一个支持真实断网/重连的 RGA 节点（创建后自动连接）。
 * @param {Object} opts
 * @param {(view: OfflineNodeView) => void} opts.onChange 状态变化回调
 * @param {(text: string) => void} [opts.onLog] 日志回调
 */
export function createOfflineNode({ onChange, onLog = () => {} }) {
  // ── 一、状态（全部摆在这）──
  const nodeId = 'N-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const state = { rga: makeRGA(nodeId), dirty: false };
  let ws = null;

  // ── 二、本地操作入口 ──

  /** 文本框内容变为 newText（内部 diff 成 RGA 操作）。 @param {string} newText */
  function editText(newText) {
    const rga = state.rga;
    const ops = diffToOps(rgaText(rga), newText);
    for (const op of ops) {
      if (op.kind === 'delete') rgaDelete(rga, op.pos, op.len);
      else for (let i = 0; i < op.str.length; i++) rgaInsert(rga, op.pos + i, op.str[i]);
    }
    sendSnapshot();
    onChange(read());
  }

  // ── 三、发送：状态型同步 = 发整个 Item 集合快照；离线只记 dirty ──
  function sendSnapshot() {
    if (!ws || ws.readyState !== 1) {
      state.dirty = true; // 离线：最终状态本身就在本地，无需缓存消息
      return;
    }
    ws.send(JSON.stringify({ type: 'snapshot', from: nodeId, items: [...state.rga.items.values()] }));
    state.dirty = false;
    onLog(`我 → 服务端 ${state.rga.items.size} 个 Item 的快照`);
  }

  // ── 四、接收与连接管理 ──

  /** 断开网络（真断：close WebSocket） */
  function disconnect() {
    if (ws) ws.close();
  }

  /** 重新连接：① 收 init 拿到别人的离线编辑 ② 补发自己的快照 */
  function connect() {
    ws = new WebSocket(`ws://${location.host}`);
    ws.onopen = () => {
      onLog('已连接服务端');
      if (state.dirty) sendSnapshot(); // 补发离线期间的本地编辑
      onChange(read());
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'init' && msg.type !== 'snapshot') return;
      rgaMerge(state.rga, msg.items); // 并集：别人的离线编辑合进来
      onLog(msg.type === 'init' ? `收到存档（${msg.items.length} 个 Item）→ merge` : `收到 ${msg.from} 的快照 → merge`);
      onChange(read());
    };
    ws.onclose = () => {
      onLog('已断开（离线编辑中，状态都保留在本地）');
      onChange(read());
    };
  }

  // ── 五、快照输出 ──
  function read() {
    return {
      nodeId,
      rga: state.rga,
      text: rgaText(state.rga),
      online: !!ws && ws.readyState === 1,
      dirty: state.dirty,
    };
  }

  connect(); // 创建即连接
  return { editText, connect, disconnect, read };
}

/**
 * 把"文本前后差异"翻译成操作（公共前缀/后缀 diff）。
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{kind:'delete', pos:number, len:number} | {kind:'insert', pos:number, str:string}>}
 */
function diffToOps(oldText, newText) {
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length, newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd--; }
  const ops = [];
  if (oldEnd > start) ops.push({ kind: 'delete', pos: start, len: oldEnd - start });
  if (newEnd > start) ops.push({ kind: 'insert', pos: start, str: newText.slice(start, newEnd) });
  return ops;
}
