# 协同编辑教程网站（Nextra 版）

用 **Nextra**（Next.js 文档框架）重写的交互教程：左侧栏导航、每页一个 MDX 文件、交互组件独立成 React 组件，源码按职责分文件，好读好改。

## 命令

```bash
npm run dev     # 开发（含热更新），访问 http://localhost:8020
npm run build   # 生产构建
npm start       # 生产预览，http://localhost:8020
```

## 目录结构（每个文件干什么一目了然）

```
tutorial-site/
├── pages/                  # 教程内容（纯文字 + 嵌入组件，改文案只动这里）
│   ├── _meta.js            # 左侧栏标题与顺序
│   ├── index.mdx           # 前言：学习地图、OT/CRDT 速览
│   ├── stage0.mdx          # 全量广播（嵌 OtPlayground policy="fulltext"）
│   ├── stage1.mdx          # 操作化（policy="op"）
│   ├── stage2.mdx          # 版本定序（policy="reject"）
│   ├── stage3.mdx          # transform（嵌 OtVisualizer + policy="transform" 沙盒）
│   ├── stage4.mdx          # 光标 transform + 远端光标 + 压力测试
│   ├── stage5.mdx          # 持久化 + 快照截断 + 协同 undo
│   ├── crdt1.mdx           # C1 最简 CRDT（嵌 CrdtCounterSim）
│   ├── crdt2.mdx           # C2 迷你 RGA（嵌 CrdtRgaSim）
│   ├── crdt3.mdx           # C3 离线合并（CrdtRgaSim offline 模式）
│   └── crdt4.mdx           # C4 上手 Yjs（概念映射 + 实验指引）
├── components/             # 交互组件（改交互/动画只动这里）
│   ├── OtPlayground.jsx        # OT 沙盒：仿真 客户端A/服务端/B + 网络延迟，四种策略
│   ├── OtPlayground.module.css
│   ├── OtVisualizer.jsx        # OT 可视化播放器：操作包飞行/transform 算式/收敛验证
│   ├── OtVisualizer.module.css
│   ├── CrdtCounterSim.jsx      # CRDT C1 沙盒：G-Counter/LWW + 捣乱网络
│   ├── CrdtRgaSim.jsx          # CRDT C2/C3 沙盒：RGA 文本 + 离线模式
│   ├── CrdtSim.module.css      # CRDT 组件共用样式
│   ├── Hero.jsx                # 首页落地页（含实况打字动画）
│   ├── Hero.module.css
│   ├── ThemeToggle.jsx         # 顶栏明暗切换
│   └── ThemeToggle.module.css
├── lib/
│   ├── ot.js               # OT 核心（副本，canonical 在 ../ot/03-transform/public/ot.mjs）
│   ├── rga.js              # RGA 核心（副本，canonical 在 ../crdt/02-rga/rga.js）
│   └── crdt-basic.js       # G-Counter/LWW（副本，canonical 在 ../crdt/01-counter-register/crdt-core.js）
├── theme.config.jsx        # 站点主题配置（标题/侧栏/默认暗色）
└── next.config.mjs         # Next.js + Nextra 接入
```

## 关键实现说明

- **可视化不造假**：`lib/ot.js` 的 `transform` 与 `ot/03-transform` 可运行 demo 完全一致；沙盒和播放器都是逐步驱动真实算法状态再渲染
- **OtPlayground**：`policy` 属性切换四种同步策略（fulltext/op/reject/transform），对应四个学习阶段
- **OtVisualizer**：预设场景在组件顶部 `SCENARIOS`，加新场景只需加一条配置

## 依赖注意事项（踩过的坑）

- `typescript` 必须固定 **5.x**（devDependencies）：npm 默认装 7.x（原生版），没有 `ts.sys` API，会导致 Nextra 的 twoslash 代码高亮构建崩溃
- Nextra 3 要求 `pages/_meta.js`（不再是 `_meta.json`）和 `pages/_app.jsx`
