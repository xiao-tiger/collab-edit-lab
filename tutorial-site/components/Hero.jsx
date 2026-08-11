// ============================================================
// 首页落地页：全幅 Hero + 自动播放的协同打字实况 + 阶段地图
// 实况动画同样调用 lib/ot.js 的真实 applyOp
// ============================================================
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './Hero.module.css';

/* ---------- 阶段地图数据 ---------- */
const OT_STAGES = [
  { href: '/ot1', num: 'O1', title: '全量广播', desc: '最笨的同步：亲手复现「互相覆盖」' },
  { href: '/ot2', num: 'O2', title: '操作化', desc: 'insert / delete，意图登场' },
  { href: '/ot3', num: 'O3', title: '版本定序', desc: 'rev + baseRev，冲突可检测' },
  { href: '/ot4', num: 'O4', title: 'transform', desc: 'OT 心脏，可视化逐拍播放' },
  { href: '/ot5', num: 'O5', title: '客户端状态', desc: 'pending / buffer、远端操作与光标' },
  { href: '/ot6', num: 'O6', title: '快照与 Undo', desc: 'history 截断 / resync / 选择性撤销' },
  { href: '/ot-practice', num: 'LAB', title: 'Mini Docs 实战', desc: '完整运行 rev、history、transform、Undo 与 resync' },
];
const CRDT_STAGES = [
  { href: '/crdt1', num: 'C1', title: '合并与收敛', desc: '两条评论为什么同步后只剩一条' },
  { href: '/crdt2', num: 'C2', title: '版本向量', desc: '判断修改是先后发生还是离线并发' },
  { href: '/crdt3', num: 'C3', title: 'Register', desc: '两个并发标题最终显示哪一个' },
  { href: '/crdt4', num: 'C4', title: 'Set 与删除', desc: 'dot 与墓碑阻止标签意外复活' },
  { href: '/crdt5', num: 'C5', title: 'Map 文档', desc: '标题、状态和标签按字段分别合并' },
  { href: '/crdt6', num: 'C6', title: 'Sequence 正文', desc: '段落身份证、锚点与并发插入' },
  { href: '/crdt-practice', num: 'LAB', title: 'Mini Doc 实战', desc: '组合三种 CRDT，亲手控制网络并完成收敛' },
];

/* ---------- 实况动画脚本：A/B 交替打出「协同编辑 OT」 ---------- */
const SCRIPT = [
  { actor: 'A', op: { kind: 'insert', pos: 0, str: '协' } },
  { actor: 'B', op: { kind: 'insert', pos: 1, str: '同' } },
  { actor: 'A', op: { kind: 'insert', pos: 2, str: '编' } },
  { actor: 'B', op: { kind: 'insert', pos: 3, str: '辑' } },
  { actor: 'A', op: { kind: 'insert', pos: 4, str: ' ' } },
  { actor: 'B', op: { kind: 'insert', pos: 5, str: 'O' } },
  { actor: 'A', op: { kind: 'insert', pos: 6, str: 'T' } },
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
          答案在两套算法里。不读论文、不写空话——从最笨的办法开始，<br />
          一步步把它们亲手实现出来，每一步都有可以上手玩的 Demo。
        </p>
        <div className={styles.ctas}>
          <Link href="/ot1" className={styles.ctaPrimary}>开始学习之旅 →</Link>
          <a href="#routes" className={styles.ctaGhost}>先看看两条路线 ↓</a>
        </div>
        <div className={styles.stats}>
          <span><b>12</b> 个递进章节</span><i />
          <span><b>每章</b> 都能动手操作</span><i />
          <span><b>1</b> 场算法可视化</span><i />
          <span><b>0</b> 空话，全部真实代码</span>
        </div>
      </section>

      <section className={styles.live}>
        <p className={styles.liveCaption}>👇 正在实时演示：两个用户同时输入，修改即时同步——这个教程会让你明白它为什么能做到</p>
        <LiveDemo />
      </section>

      <section className={styles.routes} id="routes">
        <h2 className={styles.mapTitle}>两套算法，两种世界观</h2>
        <div className={styles.routeGrid}>
          <div className={styles.route}>
            <p className={styles.routeKicker}>路线一 · 6 章 + 1 实战</p>
            <h3 className={styles.routeTitle}>OT <span>操作变换</span></h3>
            <p className={styles.routeDesc}>
              雇一个「总台」：所有人的每次修改都报给它排队编号；
              谁的坐标过期了，总台负责<b>修正</b>之后再登记。
            </p>
            <p className={styles.routeMeta}>Google Docs 同款 · 适合中心化产品</p>
            <ol className={styles.routeSteps}>
              <li>最笨的广播：亲手复现「互相覆盖」</li>
              <li>操作化：insert / delete 登场</li>
              <li>版本号：冲突变得可检测</li>
              <li>transform：修正坐标，不再丢编辑</li>
              <li>客户端状态：pending、buffer 与光标</li>
              <li>快照、resync 与协同 Undo</li>
              <li>整合实战：控制完整 OT 消息流</li>
            </ol>
            <Link href="/ot1" className={styles.routeBtn}>从 O1 开始 →</Link>
          </div>
          <div className={styles.route}>
            <p className={styles.routeKicker}>路线二 · 6 章 + 1 实战</p>
            <h3 className={styles.routeTitle}>CRDT <span>无冲突数据类型</span></h3>
            <p className={styles.routeDesc}>
              不要总台：每个副本都能先修改自己的文档，
              消息无论按什么顺序、隔多久传来，都按同一套规则<b>合并收敛</b>。
            </p>
            <p className={styles.routeMeta}>离线编辑 / P2P / 端到端加密的首选</p>
            <ol className={styles.routeSteps}>
              <li>合并与收敛：两条评论不再丢失</li>
              <li>版本向量：看过后修改还是离线并发</li>
              <li>Register：两个标题如何选择</li>
              <li>Set：标签删除、重加与墓碑</li>
              <li>Map：组合标题、状态和标签</li>
              <li>Sequence：段落与正文并发插入</li>
              <li>整合实战：让一份 Mini Doc 经历并发后重新收敛</li>
            </ol>
            <Link href="/crdt1" className={styles.routeBtn}>从 C1 开始 →</Link>
          </div>
        </div>
        <p className={styles.routeFoot}>建议顺序：先 OT 后 CRDT——理解了「总台定序」的痛，才懂「身份证」的妙。</p>
      </section>

      <section className={styles.map}>
        <h2 className={styles.mapTitle}>章节索引</h2>
        <h3 className={styles.mapSub}>OT 篇 · Google Docs 路线</h3>
        <div className={styles.cards}>
          {OT_STAGES.map((s) => (
            <Link key={s.num} href={s.href} className={styles.card}>
              <span className={styles.cardNum}>{s.num}</span>
              <span className={styles.cardTitle}>{s.title}</span>
              <span className={styles.cardDesc}>{s.desc}</span>
              <span className={styles.cardArrow}>→</span>
            </Link>
          ))}
        </div>
        <h3 className={styles.mapSub}>CRDT 篇 · 去中心化路线</h3>
        <div className={`${styles.cards} ${styles.cardsCrdt}`}>
          {CRDT_STAGES.map((s) => (
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
