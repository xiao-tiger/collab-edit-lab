import { useMemo, useState } from 'react';
import styles from './CrdtLessonLab.module.css';

const node = (doc, meta) => ({ doc, meta });
const packet = (from, to, label, status = '等待投递') => ({ from, to, label, status });

const LESSONS = {
  c1: {
    eyebrow: 'C1 · 合并与收敛',
    question: 'A、B 离线时各新增一条评论，重连后为什么不能只保留最后收到的 count=1？',
    variantLabel: '合并方式',
    variants: [
      { id: 'crdt', label: 'CRDT merge' },
      { id: 'naive', label: '朴素覆盖（错误）' },
    ],
    code: [
      'function mergeCounts(a, b) {',
      '  const actors = new Set([...Object.keys(a), ...Object.keys(b)])',
      '  const result = {}',
      '  for (const actor of actors) {',
      '    result[actor] = Math.max(a[actor] ?? 0, b[actor] ?? 0)',
      '  }',
      '  return result',
      '}',
      '',
      'const commentCount = counts => Object.values(counts).reduce((n, x) => n + x, 0)',
    ],
    scenarios: {
      crdt: [
        { title: '双方从评论数 0 开始', a: node('评论数：0', 'counts = {}'), b: node('评论数：0', 'counts = {}'), packets: [], decision: '先把“总数”拆成每个副本只能修改的一格。', active: [1] },
        { title: 'A 离线新增一条评论', a: node('评论数：1', 'counts = { A: 1 }'), b: node('评论数：0', 'counts = {}'), packets: [packet('A', 'B', '{ A: 1 }')], decision: 'A 只增加自己的 A 分量。', active: [4] },
        { title: 'B 也离线新增一条评论', a: node('评论数：1', 'counts = { A: 1 }'), b: node('评论数：1', 'counts = { B: 1 }'), packets: [packet('A', 'B', '{ A: 1 }'), packet('B', 'A', '{ B: 1 }')], decision: '两次修改互不覆盖，各自留在不同分量。', active: [4] },
        { title: '消息穿过网络，双方执行 merge', a: node('评论数：2', 'counts = { A: 1, B: 1 }'), b: node('评论数：2', 'counts = { A: 1, B: 1 }'), packets: [packet('A', 'B', '{ A: 1 }', '已合并'), packet('B', 'A', '{ B: 1 }', '已合并')], decision: '逐 actor 取 max，再把分量相加，得到正确结果 2。', active: [3, 4, 6, 9] },
        { title: '重复投递也不会多算', a: node('评论数：2', 'counts = { A: 1, B: 1 }'), b: node('评论数：2', 'counts = { A: 1, B: 1 }'), packets: [packet('A', 'B', '{ A: 1 }', '重复但无副作用')], decision: 'max(1, 1) 仍然是 1，这就是幂等。', active: [4] },
      ],
      naive: [
        { title: '双方从 count=0 开始', a: node('评论数：0', 'count = 0'), b: node('评论数：0', 'count = 0'), packets: [], decision: '错误模型只有一个容易被覆盖的总数。', active: [] },
        { title: 'A 离线执行 count + 1', a: node('评论数：1', 'count = 1'), b: node('评论数：0', 'count = 0'), packets: [packet('A', 'B', 'count = 1')], decision: 'A 不知道 B 也会修改这个总数。', active: [] },
        { title: 'B 也离线执行 count + 1', a: node('评论数：1', 'count = 1'), b: node('评论数：1', 'count = 1'), packets: [packet('A', 'B', 'count = 1'), packet('B', 'A', 'count = 1')], decision: '真实发生了两次新增，但两个快照都写着 1。', active: [] },
        { title: '互相覆盖后只剩 1', a: node('评论数：1 ❌', 'count = 1'), b: node('评论数：1 ❌', 'count = 1'), packets: [packet('A', 'B', 'count = 1', '覆盖'), packet('B', 'A', 'count = 1', '覆盖')], decision: '结果看似一致，却静默丢失了一次修改；正确答案应该是 2。', active: [] },
      ],
    },
  },
  c2: {
    eyebrow: 'C2 · 因果关系与版本向量',
    question: 'B 修改标题时，到底看过 A 的版本，还是两个人在互不知情时同时修改？',
    variantLabel: '修改关系',
    variants: [
      { id: 'concurrent', label: '离线并发' },
      { id: 'causal', label: '看过后再改' },
    ],
    code: [
      'function compareVector(a, b) {',
      '  const actors = new Set([...Object.keys(a), ...Object.keys(b)])',
      '  let less = false',
      '  let greater = false',
      '  for (const actor of actors) {',
      '    if ((a[actor] ?? 0) < (b[actor] ?? 0)) less = true',
      '    if ((a[actor] ?? 0) > (b[actor] ?? 0)) greater = true',
      '  }',
      '  if (less && greater) return "concurrent"',
      '  if (less) return "before"',
      '  if (greater) return "after"',
      '  return "equal"',
      '}',
    ],
    scenarios: {
      concurrent: [
        { title: '初始标题相同', a: node('标题：周报', 'vector = { A: 0, B: 0 }'), b: node('标题：周报', 'vector = { A: 0, B: 0 }'), packets: [], decision: '版本向量表示“我见过每个副本多少次修改”。', active: [0] },
        { title: '网络暂停，A 修改标题', a: node('标题：周报 v2', 'vector = { A: 1, B: 0 }'), b: node('标题：周报', 'vector = { A: 0, B: 0 }'), packets: [packet('A', 'B', '[1,0] · 周报 v2')], decision: 'A 只增加自己的分量。', active: [4] },
        { title: 'B 不知道 A 的修改，也修改标题', a: node('标题：周报 v2', 'vector = { A: 1, B: 0 }'), b: node('标题：周报最终版', 'vector = { A: 0, B: 1 }'), packets: [packet('A', 'B', '[1,0]'), packet('B', 'A', '[0,1]')], decision: 'A 分量 1>0，B 分量 0<1，两个向量交叉。', active: [4, 5, 6] },
        { title: '比较结果：concurrent', a: node('候选：周报 v2', '[1,0]'), b: node('候选：周报最终版', '[0,1]'), packets: [packet('A', 'B', '[1,0]', '已比较'), packet('B', 'A', '[0,1]', '已比较')], decision: '双方修改时都没见过对方，因此没有真实的先后顺序。', active: [8] },
      ],
      causal: [
        { title: 'A 修改标题', a: node('标题：周报 v2', 'vector = { A: 1, B: 0 }'), b: node('标题：周报', 'vector = { A: 0, B: 0 }'), packets: [packet('A', 'B', '[1,0] · 周报 v2')], decision: 'A 产生版本 [1,0]。', active: [4] },
        { title: 'B 先收到 A 的版本', a: node('标题：周报 v2', 'vector = { A: 1, B: 0 }'), b: node('标题：周报 v2', 'vector = { A: 1, B: 0 }'), packets: [packet('A', 'B', '[1,0]', '已合并')], decision: 'B 的历史已经包含 A 的第一次修改。', active: [4] },
        { title: 'B 看过后再修改', a: node('标题：周报 v2', 'vector = { A: 1, B: 0 }'), b: node('标题：周报最终版', 'vector = { A: 1, B: 1 }'), packets: [packet('B', 'A', '[1,1] · 周报最终版')], decision: '[1,0] 的每个分量都不大于 [1,1]。', active: [4, 5] },
        { title: '比较结果：before', a: node('旧版本：周报 v2', '[1,0]'), b: node('新版本：周报最终版', '[1,1]'), packets: [packet('B', 'A', '[1,1]', '已比较')], decision: 'B 看过 A 后再改，因果上更新的版本可以安全覆盖旧版本。', active: [9] },
      ],
    },
  },
  c3: {
    eyebrow: 'C3 · Register CRDT',
    question: '版本向量已经发现两个标题并发了，但文档最终应该显示哪个标题？',
    variantLabel: '冲突策略',
    variants: [
      { id: 'lww', label: 'LWW：选一个' },
      { id: 'mv', label: 'MV：都保留' },
    ],
    code: [
      'function mergeRegister(a, b, strategy) {',
      '  const relation = compareVector(a.vector, b.vector)',
      '  if (relation === "before") return b',
      '  if (relation === "after") return a',
      '  if (relation === "equal") return a',
      '',
      '  // 只有 concurrent 才进入冲突策略',
      '  if (strategy === "mv") return { conflicts: [a, b] }',
      '  return compareStamp(a.stamp, b.stamp) >= 0 ? a : b',
      '}',
    ],
    scenarios: {
      lww: [
        { title: '两个标题离线并发产生', a: node('周报 v2', 'vector=[1,0] · stamp=(1,A)'), b: node('周报最终版', 'vector=[0,1] · stamp=(1,B)'), packets: [packet('A', 'B', '标题版本 A'), packet('B', 'A', '标题版本 B')], decision: '版本向量只能判断 concurrent，不能告诉我们哪个标题更好。', active: [1, 6] },
        { title: 'LWW 比较确定性的 stamp', a: node('周报 v2', 'stamp=(1,A)'), b: node('周报最终版', 'stamp=(1,B)'), packets: [packet('A', 'B', '(1,A)', '比较中'), packet('B', 'A', '(1,B)', '比较中')], decision: '(1,B) > (1,A)；这只是稳定的裁决规则，不代表 B 更正确。', active: [8] },
        { title: '双方选择同一个标题', a: node('标题：周报最终版', 'winner = (1,B)'), b: node('标题：周报最终版', 'winner = (1,B)'), packets: [], decision: 'LWW 保证单值和收敛，代价是静默丢掉 A 的标题。', active: [8] },
      ],
      mv: [
        { title: '两个标题离线并发产生', a: node('周报 v2', 'vector=[1,0]'), b: node('周报最终版', 'vector=[0,1]'), packets: [packet('A', 'B', '标题版本 A'), packet('B', 'A', '标题版本 B')], decision: '两个版本互相都不是旧版本。', active: [1, 6] },
        { title: 'MV-Register 保留两个并发值', a: node('冲突：周报 v2｜周报最终版', 'conflicts = 2'), b: node('冲突：周报 v2｜周报最终版', 'conflicts = 2'), packets: [packet('A', 'B', '版本 A', '已保留'), packet('B', 'A', '版本 B', '已保留')], decision: '系统不替用户猜，两个标题都进入待解决冲突。', active: [7] },
        { title: '用户确认一个新标题', a: node('标题：周报最终版', 'vector=[2,1]'), b: node('标题：周报最终版', 'vector=[2,1]'), packets: [packet('A', 'B', '新版本 [2,1]', '已覆盖冲突')], decision: '新版本同时见过两个旧版本，因此可以安全消除冲突。', active: [2, 3] },
      ],
    },
  },
  c4: {
    eyebrow: 'C4 · Set CRDT',
    question: 'A 删除文档标签“需求”，B 离线时又添加同名标签，合并后标签应该存在吗？',
    variantLabel: '产品规则',
    variants: [
      { id: 'add', label: 'Add-Wins' },
      { id: 'remove', label: 'Remove-Wins' },
    ],
    code: [
      'function add(set, tag, dot) { set.adds[tag].add(dot) }',
      'function remove(set, tag) {',
      '  for (const dot of set.adds[tag]) set.removes.add(dot)',
      '}',
      'function merge(a, b) {',
      '  return { adds: union(a.adds, b.adds), removes: union(a.removes, b.removes) }',
      '}',
      'function has(set, tag) {',
      '  return [...set.adds[tag]].some(dot => !set.removes.has(dot))',
      '}',
    ],
    scenarios: {
      add: [
        { title: '双方都见过标签“需求”', a: node('标签：需求', 'adds={需求:S1} · removes={}'), b: node('标签：需求', 'adds={需求:S1} · removes={}'), packets: [], decision: '标签不是一个布尔值；它来自一次唯一的新增事件 S1。', active: [0] },
        { title: 'A 删除自己见过的新增事件', a: node('标签：（无）', 'adds={S1} · removes={S1}'), b: node('标签：需求', 'adds={S1} · removes={}'), packets: [packet('A', 'B', 'remove S1')], decision: '删除针对 dot=S1，而不是模糊地写 tag=false。', active: [1, 2] },
        { title: 'B 离线重新添加同名标签', a: node('标签：（无）', 'removes={S1}'), b: node('标签：需求', 'adds={S1,B1}'), packets: [packet('A', 'B', 'remove S1'), packet('B', 'A', 'add B1')], decision: '重新添加产生新身份 B1，A 删除时没有见过它。', active: [0] },
        { title: '合并并集后，新 dot 仍存活', a: node('标签：需求', 'adds={S1,B1} · removes={S1}'), b: node('标签：需求', 'adds={S1,B1} · removes={S1}'), packets: [packet('A', 'B', 'remove S1', '已合并'), packet('B', 'A', 'add B1', '已合并')], decision: 'B1 不在 removes 中，所以 Add-Wins 结果仍然显示“需求”。', active: [4, 5, 7, 8] },
      ],
      remove: [
        { title: '双方都见过标签“需求”', a: node('标签：需求', 'lifecycle = present@S1'), b: node('标签：需求', 'lifecycle = present@S1'), packets: [], decision: 'Remove-Wins 还需要为标签生命周期记录删除事件。', active: [] },
        { title: 'A 删除，B 并发重新添加', a: node('标签：（无）', 'remove=R1'), b: node('标签：需求', 'add=B1'), packets: [packet('A', 'B', 'remove R1'), packet('B', 'A', 'add B1')], decision: '两个生命周期事件互相并发。', active: [] },
        { title: '产品规则规定删除优先', a: node('标签：（无）', 'winner = remove R1'), b: node('标签：（无）', 'winner = remove R1'), packets: [packet('A', 'B', 'remove R1', '胜出')], decision: 'Remove-Wins 不是网络自然给出的答案，而是产品明确选择的冲突语义。', active: [] },
      ],
    },
  },
  c5: {
    eyebrow: 'C5 · Map CRDT',
    question: 'A 修改标题，B 修改文档状态；为什么不应该用一份完整文档快照互相覆盖？',
    variantLabel: '并发场景',
    variants: [
      { id: 'different', label: '修改不同字段' },
      { id: 'same', label: '修改同一字段' },
    ],
    code: [
      'function mergeDoc(a, b) {',
      '  return {',
      '    title: mergeRegister(a.title, b.title),',
      '    status: mergeRegister(a.status, b.status),',
      '    tags: mergeORSet(a.tags, b.tags),',
      '  }',
      '}',
    ],
    scenarios: {
      different: [
        { title: '双方拥有相同文档', a: node('标题：周报\n状态：草稿', 'title@S0 · status@S0'), b: node('标题：周报\n状态：草稿', 'title@S0 · status@S0'), packets: [], decision: 'Map 的每个字段都有自己的 CRDT 状态。', active: [0, 1] },
        { title: 'A 修改标题，B 修改状态', a: node('标题：八月周报\n状态：草稿', 'title@A1 · status@S0'), b: node('标题：周报\n状态：已发布', 'title@S0 · status@B1'), packets: [packet('A', 'B', 'title@A1'), packet('B', 'A', 'status@B1')], decision: '两次修改落在不同字段，不需要互相竞争。', active: [2, 3] },
        { title: '按字段分别 merge', a: node('标题：八月周报\n状态：已发布', 'title@A1 · status@B1'), b: node('标题：八月周报\n状态：已发布', 'title@A1 · status@B1'), packets: [packet('A', 'B', 'title@A1', '已合并'), packet('B', 'A', 'status@B1', '已合并')], decision: '标题保留 A 的修改，状态保留 B 的修改，没有整份文档覆盖。', active: [2, 3, 5] },
      ],
      same: [
        { title: '双方拥有相同标题', a: node('标题：周报', 'title@S0'), b: node('标题：周报', 'title@S0'), packets: [], decision: 'Map 只能把冲突缩小到字段，不能凭空消除字段内部冲突。', active: [2] },
        { title: '双方并发修改 title 字段', a: node('标题：八月周报', 'title@A1'), b: node('标题：最终周报', 'title@B1'), packets: [packet('A', 'B', 'title@A1'), packet('B', 'A', 'title@B1')], decision: '两个修改都落在 title，交给这个字段的 Register CRDT。', active: [2] },
        { title: 'title 内部执行 LWW', a: node('标题：最终周报', 'winner=title@B1'), b: node('标题：最终周报', 'winner=title@B1'), packets: [packet('B', 'A', 'title@B1', '胜出')], decision: 'Map 负责组合，Register 负责同字段的冲突语义。', active: [2, 5] },
      ],
    },
  },
  c6: {
    eyebrow: 'C6 · Sequence CRDT',
    question: 'A、B 同时在“开场”和“结论”之间插入段落，不能依赖数组下标时怎样稳定排序？',
    variantLabel: '并发场景',
    variants: [
      { id: 'insert', label: '同位置插入' },
      { id: 'delete', label: '删除与插入' },
    ],
    code: [
      'function insert(seq, value, leftId, id) {',
      '  seq.set(id, { id, leftId, value, deleted: false })',
      '}',
      'function remove(seq, id) { seq.get(id).deleted = true }',
      'function merge(a, b) {',
      '  for (const item of b.values()) joinItem(a, item)',
      '}',
      'function visible(seq) {',
      '  return walkFromRoot(seq).filter(item => !item.deleted)',
      '}',
    ],
    scenarios: {
      insert: [
        { title: '初始段落有稳定 ID', a: node('开场\n结论', '开场#S1 → 结论#S2'), b: node('开场\n结论', '开场#S1 → 结论#S2'), packets: [], decision: '界面显示段落，内部保存永久 ID 和锚点关系。', active: [0] },
        { title: 'A 在“开场”后插入“方案”', a: node('开场\n方案\n结论', '方案#A1 left=S1'), b: node('开场\n结论', 'S1 → S2'), packets: [packet('A', 'B', 'insert A1 after S1')], decision: '操作描述“在 S1 后”，而不是“在 index=1”。', active: [0, 1] },
        { title: 'B 同时在相同位置插入“风险”', a: node('开场\n方案\n结论', 'A1 left=S1'), b: node('开场\n风险\n结论', 'B1 left=S1'), packets: [packet('A', 'B', 'A1 after S1'), packet('B', 'A', 'B1 after S1')], decision: 'A1 与 B1 是共享同一锚点的并发兄弟节点。', active: [0, 1] },
        { title: '合并节点并稳定排序', a: node('开场\n方案\n风险\n结论', 'S1 → {A1,B1} → S2'), b: node('开场\n方案\n风险\n结论', 'S1 → {A1,B1} → S2'), packets: [packet('A', 'B', 'A1', '已合并'), packet('B', 'A', 'B1', '已合并')], decision: '所有副本使用相同的 ID 排序规则，因此消息先后不影响最终段落顺序。', active: [4, 5, 7, 8] },
      ],
      delete: [
        { title: '初始段落链', a: node('开场\n正文\n结论', 'S1 → S2 → S3'), b: node('开场\n正文\n结论', 'S1 → S2 → S3'), packets: [], decision: '正文#S2 可能成为后来插入的定位锚点。', active: [] },
        { title: 'A 删除正文，但保留墓碑', a: node('开场\n结论', 'S1 → S2† → S3'), b: node('开场\n正文\n结论', 'S1 → S2 → S3'), packets: [packet('A', 'B', 'delete S2')], decision: '删除只把 deleted 改成 true，不物理移除节点。', active: [3] },
        { title: 'B 不知道删除，在正文后插入补充', a: node('开场\n结论', 'S2†'), b: node('开场\n正文\n补充\n结论', 'B1 left=S2'), packets: [packet('A', 'B', 'delete S2'), packet('B', 'A', 'B1 after S2')], decision: '如果 S2 已被物理删除，A 将无法理解 B1 应该放在哪里。', active: [0, 1] },
        { title: '墓碑隐藏，但继续充当锚点', a: node('开场\n补充\n结论', 'S1 → S2† → B1 → S3'), b: node('开场\n补充\n结论', 'S1 → S2† → B1 → S3'), packets: [packet('A', 'B', 'delete S2', '已合并'), packet('B', 'A', 'B1', '已合并')], decision: '读取时跳过 S2，但仍沿着它找到 B1；这就是墓碑的作用。', active: [4, 5, 7, 8] },
      ],
    },
  },
};

function Replica({ id, value }) {
  return (
    <section className={`${styles.replica} ${id === 'A' ? styles.replicaA : styles.replicaB}`}>
      <div className={styles.replicaTitle}><span>副本 {id}</span><small>用户看到</small></div>
      <div className={styles.document}>{value.doc}</div>
      <div className={styles.metaLabel}>CRDT 内部状态</div>
      <pre className={styles.meta}>{value.meta}</pre>
    </section>
  );
}

export default function CrdtLessonLab({ lesson }) {
  const config = LESSONS[lesson];
  const [variant, setVariant] = useState(config.variants[0].id);
  const [step, setStep] = useState(0);
  const [reverse, setReverse] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const steps = config.scenarios[variant];
  const current = steps[Math.min(step, steps.length - 1)];

  const packets = useMemo(() => {
    let result = [...current.packets];
    if (reverse) result.reverse();
    if (duplicate && result.length) result = [...result, { ...result[result.length - 1], status: '重复投递' }];
    return result;
  }, [current, reverse, duplicate]);

  const changeVariant = (value) => {
    setVariant(value);
    setStep(0);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.topline}>
        <span>{config.eyebrow}</span>
        <strong>{step + 1} / {steps.length}</strong>
      </div>
      <div className={styles.question}>{config.question}</div>

      <div className={styles.controls}>
        <label>
          <span>{config.variantLabel}</span>
          <select value={variant} onChange={(event) => changeVariant(event.target.value)}>
            {config.variants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className={styles.check}><input type="checkbox" checked={reverse} onChange={(event) => setReverse(event.target.checked)} /> 反转管道顺序</label>
        <label className={styles.check}><input type="checkbox" checked={duplicate} onChange={(event) => setDuplicate(event.target.checked)} /> 重复最后一包</label>
        <div className={styles.actions}>
          <button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>上一步</button>
          <button onClick={() => setStep(0)}>重置</button>
          <button className={styles.primary} onClick={() => setStep((value) => value === steps.length - 1 ? 0 : value + 1)}>{step === steps.length - 1 ? '重新演示' : '下一步'}</button>
        </div>
      </div>

      <div className={styles.progress}><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      <h3 className={styles.stepTitle}>{current.title}</h3>

      <div className={styles.arena}>
        <Replica id="A" value={current.a} />
        <section className={styles.pipe} aria-label="网络管道">
          <div className={styles.pipeTitle}>网络管道</div>
          {packets.length === 0 ? <div className={styles.empty}>还没有消息</div> : packets.map((item, index) => (
            <div className={styles.packet} key={`${item.from}-${item.to}-${item.label}-${index}`}>
              <div><b>{item.from} → {item.to}</b><span>{item.status}</span></div>
              <code>{item.label}</code>
            </div>
          ))}
          <div className={styles.pipeHint}>乱序与重复只改变到达方式，不应改变正确算法的最终结论。</div>
        </section>
        <Replica id="B" value={current.b} />
      </div>

      <section className={styles.decision}>
        <span>算法正在判断</span>
        <p>{current.decision}</p>
      </section>

      <section className={styles.codePanel}>
        <div className={styles.codeTitle}><span>关键 JavaScript</span><small>高亮行为当前执行的分支</small></div>
        <pre>{config.code.map((line, index) => (
          <code key={`${line}-${index}`} className={current.active.includes(index) ? styles.activeLine : ''}>
            <i>{String(index + 1).padStart(2, '0')}</i>{line || ' '}{'\n'}
          </code>
        ))}</pre>
      </section>

      <div className={styles.stepDots} aria-label="实验步骤">
        {steps.map((item, index) => (
          <button key={item.title} className={index === step ? styles.currentDot : ''} onClick={() => setStep(index)} aria-label={`跳到第 ${index + 1} 步`} />
        ))}
      </div>
    </div>
  );
}
