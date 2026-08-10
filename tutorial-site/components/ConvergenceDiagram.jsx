// ============================================================
// OT 收敛性菱形图解（静态 SVG，明暗主题自适应）
// 例子：S='abc'，A: insert(1,'X') 与 B: insert(2,'Y') 并发
//   左路径：先 A 后 B'（B' = transform(B, A) = insert(3,'Y')）
//   右路径：先 B 后 A'（A' = transform(A, B) = insert(1,'X'），不变）
//   终点相同：'aXbYc' —— apply(apply(S,A),B') === apply(apply(S,B),A')
// ============================================================
import styles from './ConvergenceDiagram.module.css';

function Box({ x, y, w, children, tone }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={56} rx={10} className={`${styles.box} ${tone ? styles['box_' + tone] : ''}`} />
      <text x={x + w / 2} y={y + 34} textAnchor="middle" className={styles.txt}>{children}</text>
    </g>
  );
}

function Edge({ x1, y1, x2, y2, label, lx, ly, tone, marker }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={`${styles.edge} ${styles['edge_' + tone]}`} markerEnd={`url(#${marker})`} />
      <text x={lx} y={ly} textAnchor="middle" className={`${styles.lbl} ${styles['lbl_' + tone]}`}>{label}</text>
    </g>
  );
}

export default function ConvergenceDiagram() {
  return (
    <div className={styles.wrap}>
      <svg viewBox="0 0 760 430" className={styles.svg} role="img" aria-label="OT 收敛性菱形图">
        <defs>
          <marker id="arrA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.mA} />
          </marker>
          <marker id="arrB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.mB} />
          </marker>
          <marker id="arrS" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.mS} />
          </marker>
        </defs>

        {/* 顶点：共同起点 */}
        <Box x={280} y={20} w={200}>{"S = 'abc'"}</Box>

        {/* 两臂：各自本地应用 */}
        <Box x={60} y={170} w={200} tone="a">{"S·A = 'aXbc'"}</Box>
        <Box x={500} y={170} w={200} tone="b">{"S·B = 'abYc'"}</Box>

        {/* 底点：殊途同归 */}
        <Box x={220} y={340} w={320} tone="s">{"S·A·B' = S·B·A' = 'aXbYc'"}</Box>

        {/* 四条边：上面两条是原始并发操作，下面两条是变换后的操作 */}
        <Edge x1={310} y1={76} x2={205} y2={168} label="A: insert(1,'X')" lx={175} ly={118} tone="a" marker="arrA" />
        <Edge x1={450} y1={76} x2={555} y2={168} label="B: insert(2,'Y')" lx={590} ly={118} tone="b" marker="arrB" />
        <Edge x1={205} y1={228} x2={315} y2={338} label="B': insert(3,'Y')（变换后）" lx={140} ly={292} tone="b" marker="arrS" />
        <Edge x1={555} y1={228} x2={445} y2={338} label="A': insert(1,'X')（不变）" lx={620} ly={292} tone="a" marker="arrS" />
      </svg>
      <p className={styles.figCaption}>
        左臂：A 先应用自己的操作，再应用<strong>变换后的</strong> B'；<br></br>
        右臂：B 先应用自己的，再应用 A'。<br></br>
        两条路径终点必然相同 —— 这就是 transformX 的收敛保证。
      </p>
    </div>
  );
}
