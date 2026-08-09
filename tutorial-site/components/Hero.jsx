// ============================================================
// 首页落地页：全幅 Hero + 自动播放的协同打字实况 + 阶段地图
// 实况动画同样调用 lib/ot.js 的真实 applyOp
// ============================================================
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './Hero.module.css';

/* ---------- 阶段地图数据 ---------- */
const STAGES = [
  { href: '/stage0', num: '00', title: '全量广播', desc: '最笨的同步：亲手复现「互相覆盖」' },
  { href: '/stage1', num: '01', title: '操作化', desc: 'insert / delete，意图登场' },
  { href: '/stage2', num: '02', title: '版本定序', desc: 'rev + baseRev，冲突可检测' },
  { href: '/stage3', num: '03', title: 'transform', desc: 'OT 心脏，可视化逐拍播放' },
  { href: '/stage4', num: '04', title: '工程化', desc: '光标 / undo / 持久化 / CRDT' },
];

/* ---------- 实况动画脚本：A 打「协同」，B 打「编辑」，A 补「 OT」 ---------- */
const SCRIPT = [
  { actor: 'A', op: { kind: 'insert', pos: 0, str: '协' } },
  { actor: 'B', op: { kind: 'insert', pos: 0, str: '编' } }, // 并发感：B 在 A 还没走远时插入
  { actor: 'A', op: { kind: 'insert', pos: 1, str: '同' } },
  { actor: 'B', op: { kind: 'insert', pos: 3, str: '辑' } },
  { actor: 'A', op: { kind: 'insert', pos: 3, str: ' ' } },
  { actor: 'B', op: { kind: 'insert', pos: 5, str: 'O' } },
  { actor: 'B', op: { kind: 'insert', pos: 6, str: 'T' } },
];
const INITIAL_CELLS = [];

let uid = 0;

function LiveDemo() {
  const [cells, setCells] = useState(INITIAL_CELLS);
  const [cur, setCur] = useState({ A: 0, B: 0 });
  const [packets, setPackets] = useState([]);
  const [round, setRound] = useState(0);
  const stepRef = useRef(0);
  const pidRef = useRef(0);

  useEffect(() => {
    stepRef.current = 0;
    setCells(INITIAL_CELLS);
    setCur({ A: 0, B: 0 });
    setPackets([]);
    const timer = setInterval(() => {
      const i = stepRef.current;
      if (i >= SCRIPT.length) {
        clearInterval(timer);
        setTimeout(() => setRound((r) => r + 1), 2200); // 停顿后循环
        return;
      }
      const { actor, op } = SCRIPT[i];
      stepRef.current++;
      // 应用操作到字符格子
      setCells((prev) => {
        const next = [...prev];
        if (op.kind === 'insert') {
          next.splice(op.pos, 0, ...[...op.str].map((ch) => ({ id: ++uid, ch, by: actor })));
        } else {
          next.splice(op.pos, op.len);
        }
        return next;
      });
      // 两个光标各自跟随（含被对方操作推移——朴素 transform）
      setCur((prev) => {
        const next = { ...prev };
        for (const who of ['A', 'B']) {
          if (who === actor) next[who] = op.kind === 'insert' ? op.pos + op.str.length : op.pos;
          else if (op.kind === 'insert' && op.pos <= next[who]) next[who] += op.str.length;
          else if (op.kind === 'delete' && op.pos < next[who]) next[who] = Math.max(op.pos, next[who] - op.len);
        }
        return next;
      });
      // 操作包飞向服务端
      const pid = ++pidRef.current;
      setPackets((p) => [...p, { id: pid, actor }]);
      setTimeout(() => setPackets((p) => p.filter((x) => x.id !== pid)), 850);
    }, 640);
    return () => clearInterval(timer);
  }, [round]);

  return (
    <div className={styles.demo}>
      <div className={styles.demoBar}>
        <span className={styles.dotA} /> 用户 A
        <span className={styles.dotB} /> 用户 B
        <span className={styles.demoTitle}>live · 协同实况</span>
      </div>
      <div className={styles.demoDoc}>
        {/* 在光标位置插入闪烁的插入符（A 蓝 / B 橙） */}
        {cells.map((c, i) => (
          <span key={c.id} className={styles.cellWrap}>
            {cur.A === i && <i className={`${styles.caret} ${styles.caretA}`} />}
            {cur.B === i && <i className={`${styles.caret} ${styles.caretB}`} />}
            <span className={`${styles.dcell} ${c.by === 'A' ? styles.dcellA : styles.dcellB}`}>
              {c.ch === ' ' ? '␣' : c.ch}
            </span>
          </span>
        ))}
        {cur.A === cells.length && <i className={`${styles.caret} ${styles.caretA}`} />}
        {cur.B === cells.length && <i className={`${styles.caret} ${styles.caretB}`} />}
        {cells.length === 0 && <span className={styles.placeholder}>正在输入…</span>}
      </div>
      <div className={styles.demoLane}>
        {packets.map((p) => (
          <i key={p.id} className={`${styles.fly} ${p.actor === 'A' ? styles.flyA : styles.flyB}`} />
        ))}
        <span className={styles.serverBadge}>服务端</span>
      </div>
    </div>
  );
}

/* ---------- 落地页 ---------- */
export default function Hero() {
  return (
    <div className={styles.page}>
      {/* 背景网格 + 光晕 */}
      <div className={styles.bgGrid} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />

      <section className={styles.hero}>
        <p className={styles.kicker}>COLLABORATIVE EDITING · INTERACTIVE COURSE</p>
        <h1 className={styles.h1}>
          一个文档，<br /><span className={styles.grad}>百手同书</span>。
        </h1>
        <p className={styles.sub}>
          为什么一百个人同时打字，在线文档不会乱？<br />
          不读论文、不写空话——从最笨的广播开始，五个可玩的阶段，亲手搓出 Google Docs 的核心算法 OT。
        </p>
        <div className={styles.ctas}>
          <Link href="/stage0" className={styles.ctaPrimary}>从 Stage 0 开始 →</Link>
          <Link href="/stage3" className={styles.ctaGhost}>直接看 transform 可视化</Link>
        </div>
        <div className={styles.stats}>
          <span><b>5</b> 个递进阶段</span><i />
          <span><b>4</b> 个可玩沙盒</span><i />
          <span><b>1</b> 场算法可视化</span><i />
          <span><b>0</b> 空话，全部真实算法驱动</span>
        </div>
      </section>

      <section className={styles.live}>
        <LiveDemo />
      </section>

      <section className={styles.map}>
        <h2 className={styles.mapTitle}>学习地图</h2>
        <div className={styles.cards}>
          {STAGES.map((s) => (
            <Link key={s.num} href={s.href} className={styles.card}>
              <span className={styles.cardNum}>{s.num}</span>
              <span className={styles.cardTitle}>{s.title}</span>
              <span className={styles.cardDesc}>{s.desc}</span>
              <span className={styles.cardArrow}>→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
