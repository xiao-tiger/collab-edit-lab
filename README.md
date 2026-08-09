# collab-demo：协同编辑从 0 到 1

亲手实现协同编辑的完整学习项目：先走 **OT**（Google Docs 路线），再走 **CRDT**（Yjs 路线），配一个可交互的教程网站。

## 全景地图

### OT 篇（六个递进 demo + 教程级 README）

| 目录 | 主题 | 一句话 | 运行 |
|---|---|---|---|
| `stage0/` | 全量广播 | 最笨的同步，并发互相覆盖 | `node stage0/server.js` → :8000 |
| `stage1/` | 操作化 | insert/delete 携带意图，但位置漂移 | `node stage1/server.js` → :8001 |
| `stage2/` | 版本定序 | rev/baseRev/history，冲突可检测但丢编辑 | `node stage2/server.js` → :8002 |
| `stage3/` | **transform** | OT 心脏：过期坐标修正后接受，含 TP1 修复记录 | `node stage3/server.js` → :8003 |
| `stage4/` | 光标与压测 | 光标=空串 insert 复用 transform；机器人压测收敛 | `node stage4/server.js` → :8004 |
| `stage5/` | 工程化 | 持久化 + 快照截断 + 协同 undo | `node stage5/server.js` → :8005 |

### 教程网站（Nextra）

| 目录 | 说明 | 运行 |
|---|---|---|
| `tutorial-site/` | 落地页 + 六章文档 + 沙盒 + OT 可视化播放器 | `cd tutorial-site && npm install && npm run dev` → :8020 |

### CRDT 篇（无需服务器，除非注明）

| 目录 | 主题 | 一句话 | 运行 |
|---|---|---|---|
| `crdt/c1/` | 最简 CRDT | G-Counter/LWW-Register，merge 三性质 | `open crdt/c1/index.html` |
| `crdt/c2/` | 迷你 RGA | 每字符一个身份证，合并=并集；删除不吸收并发插入 | `open crdt/c2/index.html` |
| `crdt/c3/` | 离线合并 | 断网分叉 → 重连互换最终状态即收敛 | `open crdt/c3/index.html` |
| `crdt/c4/` | Yjs | 工业级 CRDT：哑服务端 + Awareness + IndexedDB | `cd crdt/c4 && npm install && npm run build && npm start` → :8014 |

## 两条路线的一句话对比

- **OT**：中心定序 + 坐标变换。无元数据开销，适合中心化产品；离线/P2P 痛苦
- **CRDT**：收敛靠数学（交换/结合/幂等）。天然离线/P2P/加密友好；代价是墓碑与元数据

## 学习过程中的两个"真 bug"纪念

1. **TP1 违反**（stage3）：「delete 吸收 insert」与「insert 落进删除区间挪位置」生死裁决矛盾 → 发散。修复：统一 delete 赢（吸收 ↔ 作废）
2. **RGA 兄弟排序**（crdt/c2）：升序导致开头打字落位错误 → 改降序"后来者居左"
