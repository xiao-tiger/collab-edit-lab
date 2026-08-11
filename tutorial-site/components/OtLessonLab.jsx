import { useState } from 'react';
import styles from './OtLessonLab.module.css';

const node = (doc, meta) => ({ doc, meta });
const packet = (lane, from, to, label, status = '等待投递') => ({ lane, from, to, label, status });

const LESSONS = {
  o1: {
    eyebrow: 'O1 · 全量广播',
    question: 'A、B 同时修改一份项目周报，为什么每次发送整篇文档会丢掉一个人的内容？',
    variantLabel: '服务端先收到',
    variants: [{ id: 'a', label: 'A 的全文' }, { id: 'b', label: 'B 的全文' }],
    code: [
      'function receiveFullText(message) {',
      '  serverDoc = message.text',
      '  broadcast(serverDoc)',
      '}',
    ],
    scenarios: {
      a: [
        { title: '三方都从“项目周报”开始', a: node('项目周报', '本地副本'), s: node('项目周报', '权威全文'), b: node('项目周报', '本地副本'), packets: [], decision: '此时三份文本完全相同。', active: [] },
        { title: 'A、B 离线修改不同位置', a: node('八月项目周报', '准备发送完整字符串'), s: node('项目周报', '尚未收到修改'), b: node('项目周报已完成', '准备发送完整字符串'), packets: [packet('as', 'A', 'S', 'text="八月项目周报"'), packet('sb', 'B', 'S', 'text="项目周报已完成"')], decision: '两个全文快照都不知道对方新增了什么。', active: [0] },
        { title: '服务端先收到 A，直接覆盖', a: node('八月项目周报', '本地仍有 A 的版本'), s: node('八月项目周报', 'serverDoc = A.text'), b: node('项目周报已完成', 'B 的消息仍在路上'), packets: [packet('as', 'A', 'S', 'A 全文', '已覆盖'), packet('sb', 'B', 'S', 'B 全文')], decision: '全文没有“在开头插入八月”的意图，只能整体替换。', active: [1, 2] },
        { title: 'B 后到，再次覆盖 A', a: node('项目周报已完成 ❌', '“八月”丢失'), s: node('项目周报已完成', '最后到达者胜'), b: node('八月项目周报 ❌', '两端甚至可能暂时发散'), packets: [packet('as', 'S', 'A', 'B 的全文', '广播'), packet('sb', 'S', 'B', 'A 的旧全文', '延迟广播')], decision: '网络顺序决定谁丢内容；正确结果本应是“八月项目周报已完成”。', active: [1, 2] },
      ],
      b: [
        { title: '三方都从“项目周报”开始', a: node('项目周报', '本地副本'), s: node('项目周报', '权威全文'), b: node('项目周报', '本地副本'), packets: [], decision: '换一种到达顺序，错误仍然存在。', active: [] },
        { title: 'A、B 同时修改', a: node('八月项目周报', '完整快照 A'), s: node('项目周报', '等待消息'), b: node('项目周报已完成', '完整快照 B'), packets: [packet('as', 'A', 'S', 'A 全文'), packet('sb', 'B', 'S', 'B 全文')], decision: '这次让 B 先到服务端。', active: [0] },
        { title: 'B 先覆盖，A 后覆盖', a: node('项目周报已完成 ❌', '收到 B 广播'), s: node('八月项目周报', '最后又被 A 覆盖'), b: node('八月项目周报 ❌', '“已完成”丢失'), packets: [packet('as', 'A', 'S', 'A 全文', '后到'), packet('sb', 'B', 'S', 'B 全文', '先到')], decision: '换了顺序，只是换了失败的人；全量广播仍无法合并意图。', active: [1, 2] },
      ],
    },
  },
  o2: {
    eyebrow: 'O2 · 操作化',
    question: '已经把修改变成 insert/delete，为什么并发时还是会删除错误的字？',
    variantLabel: '场景',
    variants: [{ id: 'drift', label: '插入导致坐标漂移' }, { id: 'safe', label: '没有并发时正常' }],
    code: [
      'function applyOp(doc, op) {',
      '  if (op.kind === "insert")',
      '    return doc.slice(0, op.pos) + op.str + doc.slice(op.pos)',
      '  return doc.slice(0, op.pos) + doc.slice(op.pos + op.len)',
      '}',
    ],
    scenarios: {
      drift: [
        { title: '初始文档和坐标一致', a: node('项目周报', 'index: 项0 目1 周2 报3'), s: node('项目周报', '没有版本号'), b: node('项目周报', 'index: 项0 目1 周2 报3'), packets: [], decision: '操作里的 pos 只对生成它时看到的文档有效。', active: [0] },
        { title: 'A 插开头，B 删除末尾', a: node('八月项目周报', 'insert(0,"八月")'), s: node('项目周报', '等待操作'), b: node('项目周', 'delete(3,1)'), packets: [packet('as', 'A', 'S', 'insert(0,"八月")'), packet('sb', 'B', 'S', 'delete(3,1)')], decision: '两个操作都基于旧文档“项目周报”。', active: [1, 2, 3] },
        { title: 'A 的插入先改变了坐标系', a: node('八月项目周报', '报现在位于 pos=5'), s: node('八月项目周报', '已经应用 A'), b: node('项目周', '仍发送 delete(3,1)'), packets: [packet('sb', 'B', 'S', 'delete(3,1)', '旧坐标')], decision: '服务端不知道 delete(3) 已经过期，仍然直接执行。', active: [3] },
        { title: '旧坐标删除了“目”而不是“报”', a: node('八月项周报 ❌', '套用 B 的旧坐标'), s: node('八月项周报 ❌', 'delete(3,1)'), b: node('八月项目周 ❌', '套用 A 的操作'), packets: [packet('as', 'S', 'A', 'delete(3,1)', '广播'), packet('sb', 'S', 'B', 'insert(0,"八月")', '广播')], decision: '操作携带了意图，但 pos 属于旧坐标系，三方结果不再一致。', active: [3] },
      ],
      safe: [
        { title: 'A 单独插入“八月”', a: node('八月项目周报', 'insert(0,"八月")'), s: node('项目周报', '等待操作'), b: node('项目周报', '没有本地并发'), packets: [packet('as', 'A', 'S', 'insert(0,"八月")')], decision: '没有其他操作改变坐标时，pos 仍然有效。', active: [1, 2] },
        { title: '操作依次送达，三方一致', a: node('八月项目周报', '已同步'), s: node('八月项目周报', '已应用'), b: node('八月项目周报', '已应用远端操作'), packets: [packet('sb', 'S', 'B', 'insert(0,"八月")', '已投递')], decision: '操作化解决了全文覆盖，却没有解决并发坐标漂移。', active: [1, 2] },
      ],
    },
  },
  o3: {
    eyebrow: 'O3 · 版本检测',
    question: '服务端怎样知道一个操作的 pos 已经过期，而不是继续静默执行？',
    variantLabel: '场景',
    variants: [{ id: 'reject', label: '并发后拒绝' }, { id: 'normal', label: '版本匹配' }],
    code: [
      'function receive(message) {',
      '  if (message.baseRev !== serverRev) {',
      '    return rejectAndResync(message.from)',
      '  }',
      '  serverDoc = applyOp(serverDoc, message.op)',
      '  serverRev += 1',
      '  history.push(message.op)',
      '}',
    ],
    scenarios: {
      reject: [
        { title: '三方都在 rev=0', a: node('项目周报', 'rev=0'), s: node('项目周报', 'rev=0 · history=[]'), b: node('项目周报', 'rev=0'), packets: [], decision: '客户端发送操作时必须声明 baseRev。', active: [] },
        { title: 'A、B 同时基于 rev=0 操作', a: node('八月项目周报', 'pending · baseRev=0'), s: node('项目周报', 'rev=0'), b: node('项目周', 'pending · baseRev=0'), packets: [packet('as', 'A', 'S', 'insert · baseRev=0'), packet('sb', 'B', 'S', 'delete · baseRev=0')], decision: '两条消息的 baseRev 都是 0。', active: [0] },
        { title: 'A 先到：0 === 0，接受', a: node('八月项目周报', '等待回执'), s: node('八月项目周报', 'rev=1 · history=[insert]'), b: node('项目周', '操作仍在路上'), packets: [packet('as', 'A', 'S', 'baseRev=0', '接受'), packet('sb', 'B', 'S', 'baseRev=0')], decision: '服务端应用 A 后把全局版本推进到 rev=1。', active: [1, 4, 5, 6] },
        { title: 'B 后到：0 !== 1，拒绝', a: node('八月项目周报', 'rev=1'), s: node('八月项目周报', 'rev=1'), b: node('八月项目周报', '强制 resync · 本地删除丢失'), packets: [packet('sb', 'S', 'B', 'reject + 权威全文', '已重同步')], decision: '系统不再发散，但 B 的编辑被丢弃；这是检测和恢复，还不是合并。', active: [1, 2] },
      ],
      normal: [
        { title: 'A 发送 baseRev=0', a: node('八月项目周报', 'pending · baseRev=0'), s: node('项目周报', 'rev=0'), b: node('项目周报', 'rev=0'), packets: [packet('as', 'A', 'S', 'insert · baseRev=0')], decision: 'baseRev 与 serverRev 一致。', active: [1] },
        { title: '接受、rev+1、广播', a: node('八月项目周报', 'rev=1 · pending 清空'), s: node('八月项目周报', 'rev=1 · history=1'), b: node('八月项目周报', 'rev=1'), packets: [packet('as', 'S', 'A', 'ack rev=1', '已投递'), packet('sb', 'S', 'B', 'insert rev=1', '已投递')], decision: '没有并发时，版本流水线正常推进。', active: [4, 5, 6] },
      ],
    },
  },
  o4: {
    eyebrow: 'O4 · Transform',
    question: '服务端已经发现 B 的坐标过期，能不能修正坐标后继续接受，而不是丢掉编辑？',
    variantLabel: 'transform 场景',
    variants: [{ id: 'shift', label: '插入 × 删除' }, { id: 'same', label: '同位置插入' }],
    code: [
      'if (message.baseRev !== serverRev) {',
      '  const missed = history.slice(message.baseRev)',
      '  for (const other of missed) {',
      '    op = transform(op, other, false)',
      '  }',
      '}',
      'applyAndBroadcast(op)',
    ],
    scenarios: {
      shift: [
        { title: 'B 的 delete(3,1) 基于 rev=0', a: node('八月项目周报', 'insert(0,"八月")'), s: node('八月项目周报', 'rev=1 · history=[insert(0,2)]'), b: node('项目周', 'delete(3,1) · baseRev=0'), packets: [packet('sb', 'B', 'S', 'delete(3,1) · baseRev=0')], decision: '服务端知道 B 错过了 history 中 A 的插入。', active: [0, 1] },
        { title: '针对错过的操作修正坐标', a: node('八月项目周报', '等待 B'), s: node('计算中', 'delete(3,1) → delete(5,1)'), b: node('项目周', '本地意图仍是删“报”'), packets: [packet('sb', 'B', 'S', 'delete(3,1)', 'transform')], decision: 'A 在 B 的删除点左侧插入 2 个字，所以 B 的 pos 从 3 右移到 5。', active: [1, 2, 3] },
        { title: '应用修正后的 delete(5,1)', a: node('八月项目周', '应用远端操作'), s: node('八月项目周', 'rev=2 · history=2'), b: node('八月项目周', '回执与本地意图对齐'), packets: [packet('as', 'S', 'A', 'delete(5,1) · rev=2', '广播'), packet('sb', 'S', 'B', 'ack · rev=2', '回执')], decision: '坐标改变了，删除“报”的意图没有改变，三方收敛。', active: [6] },
      ],
      same: [
        { title: 'A、B 都在 pos=2 插入', a: node('项目A周报', 'insert(2,"A")'), s: node('项目周报', 'rev=0'), b: node('项目B周报', 'insert(2,"B")'), packets: [packet('as', 'A', 'S', 'insert(2,"A")'), packet('sb', 'B', 'S', 'insert(2,"B")')], decision: '相同坐标没有自然先后，必须采用全局一致的裁决。', active: [0] },
        { title: 'A 先被服务端接受', a: node('项目A周报', 'rev=1'), s: node('项目A周报', 'history=[A]'), b: node('项目B周报', 'B 仍 pending'), packets: [packet('as', 'S', 'A', 'ack A', '回执')], decision: '服务端最终顺序中 A 是 left，B 是 right。', active: [1] },
        { title: 'B 右移一位后接受', a: node('项目AB周报', '应用 B′'), s: node('项目AB周报', 'B: pos 2 → 3'), b: node('项目AB周报', '本地双侧变换'), packets: [packet('as', 'S', 'A', 'insert(3,"B")'), packet('sb', 'S', 'B', 'ack B′')], decision: '裁决本身可以任意，但服务端与客户端必须使用完全相同的方向。', active: [2, 3, 6] },
      ],
    },
  },
  o5: {
    eyebrow: 'O5 · 客户端状态',
    question: '本地输入已经提前显示，远端操作到达时，pending、buffer 和光标怎样一起修正？',
    variantLabel: '观察对象',
    variants: [{ id: 'pending', label: 'pending / buffer' }, { id: 'cursor', label: '远端光标' }],
    code: [
      'let remotePrime = transform(remote, pending, true)',
      'pending = transform(pending, remote, false)',
      'for (const item of buffer) {',
      '  item = transform(item, remotePrime, false)',
      '  remotePrime = transform(remotePrime, item, true)',
      '}',
      'localDoc = applyOp(localDoc, remotePrime)',
    ],
    scenarios: {
      pending: [
        { title: 'A 快速输入两次', a: node('八月项目周报最终版', 'pending=insert("八月") · buffer=[insert("最终版")]'), s: node('项目周报', 'rev=0'), b: node('项目周报', 'rev=0'), packets: [packet('as', 'A', 'S', 'pending · baseRev=0')], decision: '任何时刻只允许一个未确认操作在途，后续操作先进入 buffer。', active: [] },
        { title: 'B 的远端操作先广播到 A', a: node('八月项目周报最终版', 'pending 与 buffer 都需要换坐标'), s: node('项目周报（已审）', 'rev=1'), b: node('项目周报（已审）', 'rev=1'), packets: [packet('as', 'S', 'A', 'insert("（已审）") · rev=1')], decision: 'A 的界面包含未确认本地操作，不能直接套用服务端坐标。', active: [0, 1] },
        { title: '远端、本地 pending 和 buffer 双侧变换', a: node('八月项目周报最终版（已审）', 'pending′ · buffer′ · rev=1'), s: node('项目周报（已审）', '等待 A'), b: node('项目周报（已审）', 'rev=1'), packets: [packet('as', 'A', 'S', '变换后的 pending · baseRev=1')], decision: '既修正远端操作，也同步修正尚未发送完成的本地操作。', active: [0, 1, 2, 3, 4, 6] },
      ],
      cursor: [
        { title: 'B 的光标位于 pos=4', a: node('项目周报', '我的光标 pos=0'), s: node('项目周报', 'rev=0'), b: node('项目周报|', '远端光标 pos=4'), packets: [packet('sb', 'B', 'S', 'cursor pos=4 · baseRev=0')], decision: '光标不是文档历史，但它的坐标同样可能过期。', active: [] },
        { title: 'A 在开头插入“八月”', a: node('八月项目周报', 'insert(0,"八月")'), s: node('八月项目周报', 'rev=1'), b: node('项目周报|', '光标消息仍是 pos=4'), packets: [packet('sb', 'B', 'S', 'cursor pos=4', '过期')], decision: '服务端针对 history 修正光标：4 → 6。', active: [0, 1] },
        { title: '修正后的远端光标到达 A', a: node('八月项目周报|', '看到 B 的光标 pos=6'), s: node('八月项目周报', 'cursor 不进入 history'), b: node('八月项目周报|', '本地光标'), packets: [packet('as', 'S', 'A', 'cursor pos=6', '已转发')], decision: '把光标看成插入空串的位置，就能复用 transformPos。', active: [6] },
      ],
    },
  },
  o6: {
    eyebrow: 'O6 · 快照与 Undo',
    question: 'history 不能无限增长，Undo 又不能回退整篇文档，生产系统怎样处理？',
    variantLabel: '工程场景',
    variants: [{ id: 'undo', label: '选择性 Undo' }, { id: 'snapshot', label: '快照与 resync' }],
    code: [
      'let inverse = target.inverse',
      'for (const item of history.slice(target.rev)) {',
      '  inverse = transform(inverse, item.op, false)',
      '}',
      'applyAsNewOperation(inverse)',
      '',
      'if (message.baseRev < snapshotRev) resync(message.from)',
    ],
    scenarios: {
      undo: [
        { title: 'A、B 的操作都已进入历史', a: node('八月项目周报（已审）', 'A 想撤销“八月”'), s: node('八月项目周报（已审）', 'rev=2 · [A insert, B insert]'), b: node('八月项目周报（已审）', 'B 的“已审”必须保留'), packets: [packet('as', 'A', 'S', 'undo request')], decision: '不能恢复 A 修改前的全文，否则会一起删除 B 的后续内容。', active: [0] },
        { title: '取 A 操作的 inverse', a: node('等待 Undo', '目标：delete(0,2)'), s: node('计算 inverse', 'insert(0,"八月") → delete(0,2)'), b: node('八月项目周报（已审）', '保持不动'), packets: [], decision: '逆操作还要穿过目标操作之后的 history。', active: [0, 1, 2] },
        { title: 'Undo 作为 rev=3 的新操作广播', a: node('项目周报（已审）', 'A 的内容撤销'), s: node('项目周报（已审）', 'rev=3 · history 继续增长'), b: node('项目周报（已审）', 'B 的内容保留'), packets: [packet('as', 'S', 'A', 'delete(0,2) · rev=3', '广播'), packet('sb', 'S', 'B', 'delete(0,2) · rev=3', '广播')], decision: 'Undo 不是删除历史，而是一条经过 transform 的新操作。', active: [4] },
      ],
      snapshot: [
        { title: 'history 已积累 20 个操作', a: node('项目周报……', 'rev=20'), s: node('项目周报……', 'rev=20 · history=20'), b: node('项目周报……', 'rev=20'), packets: [], decision: '无限保存 history 会持续占用内存并拖慢 transform。', active: [] },
        { title: '服务端保存快照并截断历史', a: node('项目周报……', 'rev=20'), s: node('项目周报……', 'snapshotRev=20 · history=[]'), b: node('项目周报……', 'rev=20'), packets: [], decision: '快照保存当前全文与 rev，旧 history 可以清理。', active: [] },
        { title: '离线太久的操作 baseRev=5 到达', a: node('旧离线编辑', 'baseRev=5'), s: node('项目周报……', '5 < snapshotRev 20'), b: node('项目周报……', 'rev=20'), packets: [packet('as', 'A', 'S', 'op · baseRev=5', '无法 transform')], decision: '需要的历史已经被截断，服务端只能发送权威快照 resync。', active: [6] },
      ],
    },
  },
};

function StateNode({ kind, title, value }) {
  return (
    <section className={`${styles.node} ${styles[kind]}`}>
      <div className={styles.nodeTitle}><strong>{title}</strong><span>{kind === 'server' ? '权威状态' : '本地状态'}</span></div>
      <div className={styles.doc}>{value.doc}</div>
      <pre>{value.meta}</pre>
    </section>
  );
}

function Lane({ name, packets }) {
  return (
    <section className={styles.lane}>
      <div className={styles.laneTitle}>{name}</div>
      {packets.length === 0 ? <span className={styles.empty}>暂无消息</span> : packets.map((item, index) => (
        <div className={styles.packet} key={`${item.from}-${item.to}-${item.label}-${index}`}>
          <div><b>{item.from} → {item.to}</b><i>{item.status}</i></div>
          <code>{item.label}</code>
        </div>
      ))}
    </section>
  );
}

export default function OtLessonLab({ lesson }) {
  const config = LESSONS[lesson];
  const [variant, setVariant] = useState(config.variants[0].id);
  const [step, setStep] = useState(0);
  const steps = config.scenarios[variant];
  const current = steps[Math.min(step, steps.length - 1)];

  function switchVariant(value) {
    setVariant(value);
    setStep(0);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topline}><span>{config.eyebrow}</span><strong>{step + 1} / {steps.length}</strong></div>
      <div className={styles.question}>{config.question}</div>
      <div className={styles.controls}>
        <label><span>{config.variantLabel}</span><select value={variant} onChange={(event) => switchVariant(event.target.value)}>{config.variants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div>
          <button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>上一步</button>
          <button onClick={() => setStep(0)}>重置</button>
          <button className={styles.primary} onClick={() => setStep((value) => value === steps.length - 1 ? 0 : value + 1)}>{step === steps.length - 1 ? '重新演示' : '下一步'}</button>
        </div>
      </div>
      <div className={styles.progress}><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      <h3 className={styles.stepTitle}>{current.title}</h3>
      <div className={styles.arena}>
        <StateNode kind="clientA" title="客户端 A" value={current.a} />
        <Lane name="A ↔ 服务端" packets={current.packets.filter((item) => item.lane === 'as')} />
        <StateNode kind="server" title="服务端" value={current.s} />
        <Lane name="服务端 ↔ B" packets={current.packets.filter((item) => item.lane === 'sb')} />
        <StateNode kind="clientB" title="客户端 B" value={current.b} />
      </div>
      <section className={styles.decision}><span>当前判断</span><p>{current.decision}</p></section>
      <section className={styles.codePanel}>
        <div><span>关键 JavaScript</span><small>高亮行为当前执行的逻辑</small></div>
        <pre>{config.code.map((line, index) => <code key={`${line}-${index}`} className={current.active.includes(index) ? styles.activeLine : ''}><i>{String(index + 1).padStart(2, '0')}</i>{line || ' '}{'\n'}</code>)}</pre>
      </section>
      <div className={styles.dots}>{steps.map((item, index) => <button key={item.title} className={index === step ? styles.current : ''} onClick={() => setStep(index)} aria-label={`跳到第 ${index + 1} 步`} />)}</div>
    </div>
  );
}
