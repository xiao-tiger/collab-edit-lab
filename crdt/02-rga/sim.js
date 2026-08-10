/* ============================================================
   Stage C2 · 数据层（纯 JS，无 DOM）
   组成：createNet（虚拟网络）+ createRgaSim（双节点 RGA + merge 流程）
   算法在 rga.js，渲染层在 app.js。
   ============================================================ */

/**
 * @typedef {Object} NetLogEvent
 * @property {string} text  日志文本
 * @property {boolean} chaos 是否为"网络病"事件（重复/乱序）
 */

/**
 * 虚拟网络句柄。
 * @typedef {Object} Net
 * @property {(from: string, to: string, payload: RgaItem[]) => boolean} send 投递；断网返回 false
 * @property {(c: {dup: boolean, shuffle: boolean}) => void} setChaos
 * @property {(v: boolean) => void} setOnline
 * @property {(fn: (toId: string, payload: RgaItem[]) => void) => void} onDeliver
 * @property {number} inFlight 在途消息数（只读）
 * @property {boolean} online   是否在线（只读）
 */

/**
 * 创建虚拟网络：延迟投递，可叠加 dup（重复）/ shuffle（乱序）/ 断网。
 * 断网时 send 返回 false（消息丢弃；状态型 CRDT 无需缓存——最终状态就在发送方本地）。
 * @param {Object} opts
 * @param {number} [opts.latency=400] 基础延迟（ms）
 * @param {(e: NetLogEvent) => void} [opts.onLog] 消息事件回调
 * @returns {Net} Net 句柄（见上方 typedef）
 */
function createNet({ latency = 400, onLog = () => {} }) {
  let dup = false;
  let shuffle = false;
  let online = true;
  let inFlight = 0;
  let deliver = () => {};

  function send(from, to, payload) {
    if (!online) return false;
    const jitter = shuffle ? Math.floor(Math.random() * 900) : 0;
    queue(from, to, payload, jitter, '');
    if (dup) queue(from, to, payload, jitter + 60, '（重复投递）');
    return true;
  }

  function queue(from, to, payload, extraDelay, tag) {
    inFlight++;
    onLog({ text: `${from} → ${to} ${payload.length} 个 Item${tag}`, chaos: tag !== '' });
    setTimeout(() => {
      inFlight--;
      deliver(to, payload);
    }, latency + extraDelay);
  }

  return {
    send,
    setChaos({ dup: d, shuffle: s }) { dup = d; shuffle = s; },
    setOnline(v) { online = v; },
    onDeliver(fn) { deliver = fn; },
    get inFlight() { return inFlight; },
    get online() { return online; },
  };
}

/**
 * 把"文本前后差异"翻译成操作（公共前缀/后缀 diff）。
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{kind:'delete', pos:number, len:number} | {kind:'insert', pos:number, str:string}>}
 *          最多两个操作：先 delete 后 insert
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

/**
 * C2/C3 渲染层快照。
 * @typedef {Object} RgaView
 * @property {RGA} A
 * @property {RGA} B
 * @property {boolean} dirtyA   A 有未同步的本地变更（离线期间）
 * @property {boolean} dirtyB   B 有未同步的本地变更
 * @property {number} inFlight  在途消息数
 * @property {boolean} online   网络是否连通
 * @property {boolean} same     两端文本与结构是否完全一致
 */

/**
 * RGA 仿真内核句柄。
 * @typedef {Object} RgaSim
 * @property {(id: string, newText: string) => void} editText  某节点文本变为 newText（内部 diff 成 RGA 操作）
 * @property {(v: boolean) => void} setOnline                  断网/重连（重连时互换最终状态）
 * @property {(c: {dup: boolean, shuffle: boolean}) => void} setChaos 设置网络病
 * @property {() => RgaView} read                              读取当前快照（渲染层用）
 */

/**
 * 创建 RGA 仿真内核：两个对等节点（A/B），互发 Item 集合快照做并集合并。
 * @param {Object} opts
 * @param {number} [opts.latency=400]         网络基础延迟（ms）
 * @param {(view: RgaView) => void} [opts.onChange] 状态变化回调
 * @param {(e: NetLogEvent) => void} [opts.onLog]   网络消息回调
 * @returns {RgaSim}
 */
function createRgaSim({ latency = 400, onChange = () => {}, onLog = () => {} }) {
  const nodes = {
    A: { id: 'A', rga: makeRGA('A'), dirty: false },
    B: { id: 'B', rga: makeRGA('B'), dirty: false },
  };
  const net = createNet({ latency, onLog });

  net.onDeliver((toId, items) => {
    rgaMerge(nodes[toId].rga, items); // 合并 = 并集，乱序/重复无所谓
    onChange(read());
  });

  function editText(id, newText) {
    const rga = nodes[id].rga;
    const ops = diffToOps(rgaText(rga), newText);
    for (const op of ops) {
      if (op.kind === 'delete') rgaDelete(rga, op.pos, op.len);
      else for (let i = 0; i < op.str.length; i++) rgaInsert(rga, op.pos + i, op.str[i]);
    }
    // 状态型同步：发整个 Item 集合的快照
    const snapshot = [...rga.items.values()].map((i) => ({ ...i }));
    const sent = net.send(id, other(id), snapshot);
    if (!sent) nodes[id].dirty = true; // 断网：最终状态就在本地，只记一笔
    onChange(read());
  }

  function setOnline(v) {
    net.setOnline(v);
    if (v) {
      // 重连：互换一次最终状态即收敛
      for (const id of ['A', 'B']) {
        if (nodes[id].dirty) {
          const snapshot = [...nodes[id].rga.items.values()].map((i) => ({ ...i }));
          net.send(id, other(id), snapshot);
          nodes[id].dirty = false;
        }
      }
    }
    onChange(read());
  }

  function read() {
    return {
      A: nodes.A.rga, B: nodes.B.rga,
      dirtyA: nodes.A.dirty, dirtyB: nodes.B.dirty,
      inFlight: net.inFlight, online: net.online,
      same: rgaText(nodes.A.rga) === rgaText(nodes.B.rga) &&
            nodes.A.rga.items.size === nodes.B.rga.items.size,
    };
  }

  return { editText, setOnline, setChaos: (c) => net.setChaos(c), read };
}

/**
 * @param {string} id
 * @returns {string} 对端节点 id（'A' ↔ 'B'）
 */
function other(id) { return id === 'A' ? 'B' : 'A'; }
