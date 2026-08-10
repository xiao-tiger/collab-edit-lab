/* ============================================================
   Stage C2 · 数据层：本节点的 RGA + 经 WebSocket 的同步

   数据流向：
     用户输入 ──editText──→ 本地 RGA ──sendSnapshot──→ WebSocket（服务端中转）
                                                           │
     渲染通知 ←── onChange(read()) ←── rgaMerge ←── 收到快照 ○─┘

   分五段阅读：状态 → 本地操作 → 发送 → 接收 → 快照
   算法在 rga.js，渲染层在 app.js。
   ============================================================ */
import { makeRGA, rgaInsert, rgaDelete, rgaMerge, rgaText } from './rga.js';

/**
 * @typedef {Object} RgaNodeView
 * @property {string} nodeId     本节点 id（每个标签页随机一个，也是字符 id 的前缀）
 * @property {RGA} rga           本节点的 RGA 文档（渲染结构用）
 * @property {string} text       当前可见文本
 * @property {boolean} connected 是否已连上服务端
 */

/**
 * 创建一个 RGA 节点。
 * @param {Object} opts
 * @param {(view: RgaNodeView) => void} opts.onChange 状态变化回调（渲染层用）
 * @param {(text: string, chaos?: boolean) => void} [opts.onLog] 日志回调
 */
export function createRgaNode({ onChange, onLog = () => {} }) {
  // ── 一、状态（全部摆在这）──
  const nodeId = 'N-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const state = { rga: makeRGA(nodeId) };
  const chaos = { delay: false, dup: false }; // 人为网络病（验证幂等/乱序免疫）
  const ws = new WebSocket(`ws://${location.host}`);

  // ── 二、本地操作入口（app.js 只调这个）──

  /**
   * 文本框内容变为 newText：diff 成 RGA 操作 → 应用到本地 → 广播。
   * @param {string} newText
   */
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

  // ── 三、发送：状态型同步 = 发整个 Item 集合的快照（可叠加人为延迟/重复）──
  function sendSnapshot() {
    const msg = JSON.stringify({ type: 'snapshot', from: nodeId, items: [...state.rga.items.values()] });
    const fire = (tag) => setTimeout(() => {
      if (ws.readyState === 1) {
        ws.send(msg);
        onLog(`我 → 服务端 ${state.rga.items.size} 个 Item${tag}`, tag !== '');
      }
    }, chaos.delay ? Math.floor(Math.random() * 800) : 0);
    fire('');
    if (chaos.dup) fire('（重复发送）');
  }

  // ── 四、接收与合并（并集，乱序/重复无所谓）──
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== 'init' && msg.type !== 'snapshot') return;
    rgaMerge(state.rga, msg.items);
    onLog(msg.type === 'init' ? `已载入服务端存档（${msg.items.length} 个 Item）` : `收到 ${msg.from} 的快照（${msg.items.length} 个 Item）→ merge`);
    onChange(read());
  };
  ws.onopen = () => onChange(read());
  ws.onclose = () => onChange(read());

  // ── 五、快照输出（渲染层只读这个）──
  function read() {
    return {
      nodeId,
      rga: state.rga,
      text: rgaText(state.rga),
      connected: ws.readyState === 1,
    };
  }

  return {
    editText,
    setChaos: (c) => Object.assign(chaos, c),
    read,
  };
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
