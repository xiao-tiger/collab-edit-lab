# CRDT Stage C4：上手 Yjs（工业级 CRDT）

> 前置：C2（RGA 原理）。本阶段用工业级库搭一个真协同编辑器。你会发现 Yjs 的每个概念，都有我们手写过的对应物——这就是先造轮子的回报。

## 运行

```bash
npm run crdt:4   # 或 cd crdt/04-yjs && npm install && npm run build && npm start
npm install        # 首次
npm run build      # esbuild 打包浏览器端 → public/bundle.js
npm start          # http://localhost:8014，开两个标签页
```

## 概念映射表（手写的 → 工业的）

| 我们手写的 | Yjs 里的对应 | 说明 |
|---|---|---|
| RGA items + Map（c2） | `Y.Doc` + `Y.Text` | Yjs 内部是 YATA 算法，解决了 RGA 的交错问题，且自动合并相邻 Item 控制体积 |
| 全量快照互换（c2/c3） | `WebsocketProvider` 的 sync step | 增量同步：用状态向量（State Vector）只交换缺失的更新 |
| stage4 的光标同步 | `provider.awareness` | 临时状态（光标/选区/在线名单）专用通道，不落文档 |
| stage5 的 data.json | `IndexeddbPersistence` | 浏览器本地持久化：刷新、断网重开都在，联网后自动与房间合并 |
| 中心定序服务端（OT） | y-websocket 服务端 | **哑管道**：不定序、不变换、不理解内容——拓扑自由（可换 P2P  Provider） |

## 代码结构（总共 ~60 行）

- `server.js`：静态服务 + `setupWSConnection`（房间 = WS 路径）
- `client.js`：`Y.Doc` ↔ textarea 双向绑定（diff + `ydoc.transact`）+ Awareness 在线名单 + IndexedDB 持久化

## 实验

1. **基本协同**：两个标签页同时打字 → 收敛（注意：没有任何"回执/修正"日志——CRDT 不需要）
2. **离线**：停掉服务端继续打字 → 刷新页面内容还在（IndexedDB）→ 重启服务端 → 两端自动合并
3. **观察网络**：DevTools → WS 帧，对比 OT 篇的消息量（Yjs 是二进制编码 + 增量）

## 继续深入

- `Y.UndoManager`：对照 stage5 我们手写的 undo（客户端栈、只撤销自己）
- 富文本：`Y.XmlFragment` + TipTap/Quill 绑定
- YATA 论文：Yjs 作者 Kevin Jahns 的算法细节
