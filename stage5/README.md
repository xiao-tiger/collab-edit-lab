# Stage 5：持久化 + 快照截断 + 协同 undo

> 前置：Stage 3（transform）、Stage 4（光标）。本阶段把 demo 往"生产形态"推进一步：文档落盘、history 截断、能撤销。

## 运行

```bash
node stage5/server.js   # 端口 8005，开两个浏览器标签页访问
```

## 本阶段实现

### ① 持久化

每次变更把 `{ doc, rev, snapshotRev, history }` 写入 `data.json`（节流 100ms），重启后恢复。教学版直接写 JSON 文件；生产系统会写数据库/日志系统。

### ② 快照截断

`history` 不能无限长（内存膨胀、新客户端/过期修正都要回放全部）。策略：

```
每 20 个操作做一次快照：snapshotRev = 当前 rev，清空 history
history[i] 从此对应版本 snapshotRev + i
```

**代价与对策**：`baseRev < snapshotRev` 的请求，错过的历史已被截断，无法 transform 修正 → 回退为 **resync**（全量下发权威文档）。这正是真实系统的做法——"能修则修，太老全量"。新客户端加载也是同理：读快照 + 增量（教学版直接 init 全量）。

### ③ 协同 undo

难点：并发下不能简单"回退文档"——那会删掉别人刚写的内容。原则：**只能撤销我自己的操作，且不能影响别人的**。

实现（服务端协助模式）：

```js
// 1. 每个操作被接受时，就把逆操作存进历史（delete 的逆 = 插回被删文本，要在应用前取）
inverse = insert(pos, str) → delete(pos, str.length)
inverse = delete(pos, len) → insert(pos, 被删文本)

// 2. undo = 找到"我的最近一个操作"，把它的 inverse 针对之后的所有操作
//    逐个 transform 到当前版本，然后作为一个正常操作接受、定序、广播
let inv = history[i].inverse;
for (const h of history[i+1..]) inv = transform(inv, h.op, false);
```

要点：

- **undo 不是回退历史，而是一个新操作**（进入 history、分配 rev、正常广播）——历史只增不减，变换数学不被破坏
- undo 产生的条目标记 `isUndo`，不可再被撤销（撤销的撤销 = redo，本阶段不做）
- 客户端 undo 广播**统一走"远端操作"分支**（即使自己发起）：undo 坐标是服务端生成的，本地从未应用过；若有 pending 还需针对它变换——现有链路天然兼容
- 按 Cmd/Ctrl+Z 触发（拦截浏览器自带撤销）

## 实验

1. **undo 不影响别人**：A 打一段字，B 打一段字 → A 按 Cmd+Z → 只有 A 的内容消失，B 的完好；观察服务端日志 `[undo]` 的逆操作变换
2. **持久化**：打点字，`Ctrl+C` 停掉服务再重启 → 刷新页面，文档和 rev 原样恢复
3. **快照**：点「🤖 压力测试」（80 次操作）→ 看服务端日志多次出现 `[快照]`；文档依然收敛

## 已知简化（教学取舍）

1. undo 栈在服务端且随快照截断丢失（老操作不可撤销）。生产系统把 undo 栈存在客户端（OT 客户端 undo manager），可撤销更久
2. 无 redo；undo 是操作粒度而非"一次输入"粒度（真实系统会按时间/语义聚合）
3. 快照就是 data.json 本身，未做独立的快照文件与 history 日志分离

## 系列回顾

至此六个阶段完整：全量广播（0）→ 操作化（1）→ 版本定序（2）→ transform（3）→ 光标与压力测试（4）→ 持久化/快照/undo（5）。继续深入可读 ShareDB 源码、玩 Yjs 体验 CRDT 路线。
