/* ============================================================
   Stage C1 · 数据层（纯 JS，无 DOM）
   组成：createNet（虚拟网络）+ createCounterSim（双节点 + merge 流程）
   算法在 crdt-core.js，渲染层在 app.js。
   ============================================================ */

/**
 * @typedef {Object} NetLogEvent
 * @property {string} text  日志文本，如 "A → B 快照（重复投递）"
 * @property {boolean} chaos 是否为"网络病"事件（重复/乱序）
 */

/**
 * 虚拟网络句柄。
 * @typedef {Object} Net
 * @property {(from: string, to: string, payload: any) => boolean} send
 *           投递一份消息；断网时返回 false（消息丢弃，由调用方自行处理）
 * @property {(c: {dup: boolean, shuffle: boolean}) => void} setChaos  设置"网络病"
 * @property {(v: boolean) => void} setOnline                          断网/恢复
 * @property {(fn: (toId: string, payload: any) => void) => void} onDeliver  注册到达回调
 * @property {number} inFlight 在途消息数（只读）
 * @property {boolean} online   当前是否在线（只读）
 */

/**
 * 创建虚拟网络：把"发消息"建模为延迟投递，可叠加"网络病"。
 * @param {Object} opts
 * @param {number} [opts.latency=400] 基础延迟（ms）
 * @param {(e: NetLogEvent) => void} [opts.onLog] 消息事件回调（发送/到达各一条）
 * @returns {Net}
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
    onLog({ text: `${from} → ${to} 快照${tag}`, chaos: tag !== '' });
    setTimeout(() => {
      inFlight--;
      onLog({ text: `${to} ← 合并快照${tag}`, chaos: tag !== '' });
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
 * C1 渲染层快照。
 * @typedef {Object} CounterView
 * @property {{id: string, counter: GCounter, reg: Register}} A
 * @property {{id: string, counter: GCounter, reg: Register}} B
 * @property {number} inFlight 在途消息数
 * @property {boolean} same    两端状态是否一致
 */

/**
 * C1 仿真内核句柄。
 * @typedef {Object} CounterSim
 * @property {(id: string) => void} inc              某节点计数器 +1
 * @property {(id: string, v: string) => void} setReg 某节点写寄存器
 * @property {(m: 'crdt'|'naive') => void} setMode   切换同步策略（CRDT merge / 朴素覆盖对照组）
 * @property {(c: {dup: boolean, shuffle: boolean}) => void} setChaos 设置网络病
 * @property {() => CounterView} read                读取当前快照（渲染层用）
 */

/**
 * 创建 C1 仿真内核：两个对等节点（A/B），互发状态快照合并。
 * @param {Object} opts
 * @param {number} [opts.latency=400]          网络基础延迟（ms）
 * @param {(view: CounterView) => void} [opts.onChange] 状态变化回调（每次本地操作/合并后触发）
 * @param {(e: NetLogEvent) => void} [opts.onLog]       网络消息回调
 * @returns {CounterSim}
 */
function createCounterSim({ latency = 400, onChange = () => {}, onLog = () => {} }) {
  let mode = 'crdt'; // 'crdt' | 'naive'
  const nodes = {
    A: { id: 'A', counter: makeGCounter(), reg: makeRegister() },
    B: { id: 'B', counter: makeGCounter(), reg: makeRegister() },
  };
  const net = createNet({ latency, onLog });

  net.onDeliver((toId, snap) => {
    const n = nodes[toId];
    n.counter = mode === 'crdt'
      ? gMerge(n.counter, snap.counter)
      : { counts: { [toId]: gValue(snap.counter) } }; // 朴素覆盖
    n.reg = regMerge(n.reg, snap.reg);
    onChange(read());
  });

  // 一次本地操作：先改本地状态（立即可见），再把最终状态发出去
  function act(id, mutate) {
    mutate(nodes[id], id);
    net.send(id, other(id), JSON.parse(JSON.stringify({ counter: nodes[id].counter, reg: nodes[id].reg })));
    onChange(read());
  }

  // counts 相等性要逐键比较（JSON.stringify 受键序影响会误判）
  function countsEq(x, y) {
    const kx = Object.keys(x), ky = Object.keys(y);
    return kx.length === ky.length && kx.every((k) => x[k] === y[k]);
  }

  function read() {
    return {
      A: nodes.A, B: nodes.B,
      inFlight: net.inFlight,
      same: countsEq(nodes.A.counter.counts, nodes.B.counter.counts) &&
            nodes.A.reg.value === nodes.B.reg.value,
    };
  }

  return {
    act,
    inc: (id) => act(id, (n) => gInc(n.counter, id)),
    setReg: (id, v) => act(id, (n) => regSet(n.reg, v, id)),
    setMode: (m) => { mode = m; },
    setChaos: (c) => net.setChaos(c),
    read,
  };
}

/**
 * @param {string} id
 * @returns {string} 对端节点 id（'A' ↔ 'B'）
 */
function other(id) { return id === 'A' ? 'B' : 'A'; }
