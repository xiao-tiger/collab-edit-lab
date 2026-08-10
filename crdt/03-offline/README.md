# CRDT Stage C3：离线合并实测（真服务端版）

> 前置：C2（RGA）。本阶段不引入新数据结构，只验证 CRDT 的杀手级场景：**离线编辑**。
> 这次是真断网——「断开网络」按钮直接 `ws.close()`。

## 运行

```bash
npm run crdt:3   # 或 node crdt/03-offline/server.js → http://localhost:8013
```

## 文件结构

与 C2 同构：`server.js`（中转+存档）、`public/rga.js`（算法副本）、`public/client.js`（数据层，多了 `connect/disconnect/dirty`）、`public/app.js`、`public/index.html`。

## 离线/重连的实现（看 client.js 三、四段）

- **断网**：`ws.close()` 真断开；此后 `sendSnapshot()` 发现连接不可用，只记 `dirty = true`——**最终状态本身就在本地，什么都不用缓存**
- **重连**：`connect()` 新建 WebSocket，onopen 里若 dirty 就**补发自己的最终快照**；服务端随即发来 init（存档副本，含离线期间别人的编辑）→ merge 即收敛

## 实验

1. 开两个标签页
2. 标签页 A 点「断开网络」→ 两边各打一段字（自由分叉，A 侧显示"有未同步的本地变更"）
3. A 点「重新连接」→ 两边瞬间一致 ✅

## 核心认知：状态型 CRDT 的离线为何如此便宜

| | OT（stage 系列） | 状态型 CRDT |
|---|---|---|
| 离线期间 | 缓存全部操作，重连后 baseRev 早已过期，要服务端逐条变换 | 什么都不用做，最终状态本身就在本地 |
| 重连合并 | 依赖服务端权威定序 | 互换一次快照，并集即收敛 |
| 断网几天 | 基本不可行 | 天然支持 |

对照 OT 篇 Stage 5：它的快照/resync 本质是"放弃合并、回到权威"；CRDT 的快照（状态）本身就是可合并单元。

## 后续

- **C4**：上手 Yjs——工业级 CRDT 库，对照我们手写的每个概念
