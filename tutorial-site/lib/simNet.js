// ============================================================
// 虚拟网络（纯 JS，零 React）
// 把"发消息"建模为延迟投递，可叠加三种"网络病"：
//   dup     重复投递（同一消息送两次）
//   shuffle 乱序/大抖动（随机额外延迟）
//   断网     setOnline(false) 后 send 直接失败，由调用方决定怎么办
// 用法：const net = createNet({ latency, onLog }); net.onDeliver(fn); net.send(...)
// ============================================================

export function createNet({ latency = 400, onLog = () => {} }) {
  let dup = false;
  let shuffle = false;
  let online = true;
  let inFlight = 0;
  let deliver = () => {};

  // 返回是否成功发出（断网时返回 false，消息直接丢弃——
  // 状态型 CRDT 不需要缓存，因为"最终状态"本身就在发送方本地）
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
