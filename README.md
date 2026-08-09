# collab-demo：协同编辑从 0 到 1

亲手实现协同编辑的完整学习项目：先走 **OT**（Google Docs 路线），再走 **CRDT**（Yjs 路线），配一个可交互的教程网站。

## 快速入口（根目录统一脚本，不用记端口）

```bash
npm run ot:3      # OT 篇 Stage 3（transform）→ :8003
npm run crdt:2    # CRDT 篇 RGA（浏览器直接打开）
npm run site      # 教程网站（开发模式）→ :8020
```

## 目录结构

```
collab-demo/
├── ot/                  # OT 篇（六个递进 demo，各带教程级 README）
│   ├── 00-broadcast/            全量广播：并发互相覆盖
│   ├── 01-operations/           操作化：insert/delete 携带意图，但位置漂移
│   ├── 02-versioning/           版本定序：rev/baseRev/history，可检测但丢编辑
│   ├── 03-transform/            ★ OT 心脏（含 TP1 修复记录；ot.mjs 的 canonical 版本）
│   ├── 04-cursor-stress/        光标 transform + 远端光标 + 机器人压测
│   └── 05-persistence-undo/     持久化 + 快照截断 + 协同 undo
├── crdt/                # CRDT 篇（01~03 无需服务器，浏览器直接打开）
│   ├── 01-counter-register/     G-Counter / LWW-Register：merge 三性质
│   ├── 02-rga/                  迷你 RGA：每字符一个身份证（rga.js 的 canonical 版本）
│   ├── 03-offline/              离线合并：断网分叉 → 重连互换最终状态收敛
│   └── 04-yjs/                  Yjs 上手：哑服务端 + Awareness + IndexedDB
├── tutorial-site/       # 交互教程站（Nextra：落地页 + 六章 + 沙盒 + OT 可视化）
└── package.json         # 统一 scripts 入口 + OT 篇共用的 ws 依赖
```

## 全部脚本

| 脚本 | 内容 | 地址 |
|---|---|---|
| `npm run ot:0` ~ `ot:5` | OT 篇六个阶段 | :8000 ~ :8005 |
| `npm run crdt:1` ~ `crdt:3` | CRDT 前三个阶段（`open` 打开本地文件） | — |
| `npm run crdt:4` | Yjs（自动先 build 再启动） | :8014 |
| `npm run site` | 教程网站开发模式 | :8020 |

## 两条路线的一句话对比

- **OT**：中心定序 + 坐标变换。无元数据开销，适合中心化产品；离线/P2P 痛苦
- **CRDT**：收敛靠数学（交换/结合/幂等）。天然离线/P2P/加密友好；代价是墓碑与元数据

## 副本约定

为保持"每个阶段自包含可读"，算法文件存在**有意为之的教学副本**：

- `ot.mjs`：canonical 在 `ot/03-transform/public/`，04、05 与 `tutorial-site/lib/ot.js` 是副本
- `rga.js`：canonical 在 `crdt/02-rga/`，`03-offline/` 是副本

修改算法请改 canonical 版本并同步副本（文件头均有标注）。

## 学习过程中的两个"真 bug"纪念

1. **TP1 违反**（ot/03-transform）：「delete 吸收 insert」与「insert 落进删除区间挪位置」生死裁决矛盾 → 发散。修复：统一 delete 赢（吸收 ↔ 作废）
2. **RGA 兄弟排序**（crdt/02-rga）：升序导致开头打字落位错误 → 改降序"后来者居左"
