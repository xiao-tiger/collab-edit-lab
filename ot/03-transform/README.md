# Stage 3：transform —— OT 的心脏

> 前置：建议先理解 Stage 1（操作模型）和 Stage 2（版本号 + 定序）。
> 本阶段解决 Stage 2 的遗留问题：过期操作被**拒绝**导致用户编辑丢失。

## 运行

```bash
npm run ot:3   # 或 node ot/03-transform/server.js   # 端口 8003，开两个浏览器标签页访问
```

---

## 1. 要解决什么问题

Stage 2 里，服务端靠 `baseRev !== rev` 检测出过期操作后直接拒绝。系统不发散，但**用户敲的字被整批丢掉**。

过期操作"过期"的不是版本号，而是**坐标**：

```
rev 0: "hello world"
rev 1: "Ahello world"   （A 在 pos=0 插入 "A"）

B 并发生成了 delete pos=10（想删 'd'），基于 rev 0。
等它到达服务端时文档已是 rev 1，pos=10 指向的变成了 'l'。
```

直接拒绝会丢编辑；直接应用会删错字。正确做法：**把坐标从"rev 0 的坐标系"换算到"rev 1 的坐标系"**——这个换算函数就是 `transform`。

## 2. transform 的定义与数学保证

```js
transform(op, other, opIsLeft) → 新 op
```

前提：`other` 已经应用到文档上。返回值与 `op` **意图等效**，但可以安全地应用在 `other` 之后。

配套的双向变换 `transformX(a, b) = [transform(a,b,true), transform(b,a,false)]` 满足**收敛性质**——这是整个 OT 的地基：

```
applyOp(applyOp(doc, a), b') === applyOp(applyOp(doc, b), a')
```

即：无论"先 a 后 b'"还是"先 b 后 a'"，结果相同。协同双方因此殊途同归。

## 3. 四条规则详解（带实例）

操作只有 insert/delete 两种，两两组合共 4 条规则。**记忆口诀：只关心"别人的操作落在我坐标系的什么位置"，然后调整我的 pos/len。**

### 规则一：insert vs insert

> 别人在我前面插了字 → 我的插入点右移。

```
doc = "abc"
A: insert pos=0 "X"  → 服务端先接受 → "Xabc"
B: insert pos=2 "Y"  → 过期，transform：A 的 pos(0) < B 的 pos(2) → pos 变为 3
修正后 insert pos=3 "Y" 应用到 "Xabc" → "XabYc"   ✅ Y 仍在 c 前面，意图保留
```

**同位置对撞（opIsLeft 的作用）**：两人同时往 pos=1 插入，坐标上无法判断谁先谁后。规则本身无所谓，**但全局必须一致**，否则两端算出不同结果。约定：服务端先接受的（left）原地不动，后到的右移：

```
doc = "abc"
A: insert pos=1 "X"（先接受，left） → "aXbc"
B: insert pos=1 "Y"（后到，right） → transform 后 pos=2 → "aXYbc"
两端最终都是 "aXYbc" ✅（若规则不一致，一端会是 "aYXbc"，发散）
```

### 规则二：insert vs delete

> 被删区间整体在我左边 → 我左移；**我的插入点被删除区间覆盖 → 插入作废（变成空操作）**。

```
doc = "abcde"
A: delete pos=1 len=2（删 "bc"）→ 先接受 → "ade"
B: insert pos=3 "X"（想在 'd' 前插入）→ 过期
transform：被删区间 [1,3) 整体在 pos=3 左边 → pos -= 2 → pos=1
修正后应用到 "ade" → "aXde"   ✅ X 仍在 'd' 前面
```

⚠️ **作废规则的由来（TP1 陷阱）**：如果改成"插入点落进被删区间 → 挪到区间起点保留"，会与规则三（delete 吸收 insert）产生**生死裁决矛盾**——同一个并发插入，一个方向判活、另一个方向判死，两端必然发散：

```
doc = "abcde"，A: insert pos=2 "XX"，B: delete pos=1 len=3（覆盖插入点）
服务端方向（规则三吸收）："ae"      ← XX 被删
B 本地方向（若规则二保留）："aXXe"  ← XX 活着   ✗ 发散！
```

所以两条规则必须统一为"delete 赢"：吸收 ↔ 作废。这是收敛性质（TP1）最容易踩的坑。

### 规则三：delete vs insert

> 插入在我左边 → 删除区间右移；**插入落进我的删除区间 → 吸收**（len += 插入长度，连它一起删）。

```
doc = "abcde"
A: insert pos=2 "XX"  → 先接受 → "abXXcde"
B: delete pos=1 len=3（想删 "bcd"）→ 过期
transform：A 的插入点 pos=2 落在 B 的删除区间 [1,4) 内 → len += 2 → len=5
修正后 delete pos=1 len=5 应用到 "abXXcde" → "ae"
```

⚠️ 注意取舍：A 刚插的 "XX" 被 B 一起删了。这是标准 OT 的语义取舍（"删除整个区域"的意图优先），真实产品靠富文本树结构缓解，见第 6 节。

### 规则四：delete vs delete

> 不相交 → 左移；**重叠 → 重叠部分对方已删，我只删剩下的**。

```
doc = "abcdefgh"
A: delete pos=4 len=4（删 "efgh"）→ 先接受 → "abcd"
B: delete pos=2 len=4（删 "cdef"）→ 过期
transform：两区间重叠 [4,6)，长度 2 → pos=min(2,4)=2，len=4-2=2
修正后 delete pos=2 len=2 应用到 "abcd" → "ab"
```

验证意图：A 想删 "efgh"、B 想删 "cdef"，并集是删 "cdefgh"，"abcdefgh" 删完正好剩 "ab" ✅

## 4. 服务端怎么用（`server.js`）

Stage 2 的拒绝逻辑换成 4 行修正逻辑：

```js
if (msg.baseRev !== rev) {                              // 过期？
  const missed = history.slice(msg.baseRev);            // 它错过的所有操作
  for (const h of missed) op = transform(op, h, false); // 逐个修正坐标
}
doc = applyOp(doc, op); rev++; history.push(op);        // 然后正常接受、定序、广播
```

- 修正必须**逐个针对错过的每个操作**做（可能错过多个），顺序按服务端定序。
- `history` 里存的是**修正后的最终形态**（广播什么就存什么），保证后续操作用同一坐标系换算。

## 5. 客户端怎么用（`public/index.html`）

服务端修好了坐标，但本地 textarea 早就按旧坐标应用过操作了，所以收到远端操作时要**双侧变换**：

```js
// 远端操作 op 在服务端定序里，排在我所有未确认操作（pending + buffer）之前
let opPrime = transform(op, pending, true);    // ① 把 op 针对 pending 变换
pending = transform(pending, op, false);       // ② pending 针对 op 变换（保持坐标有效）
for (const b of buffer) {                      // ③ buffer 里每个操作同样处理
  buffer[i] = transform(b, opPrime, false);
  opPrime = transform(opPrime, b, true);
}
applyRemote(opPrime);                          // ④ 应用变换后的 op
```

**回执到达时 textarea 为什么不用动**：收敛性质保证了"我先应用自己的、再补变换后的别人的"与"服务端先应用别人的、再应用变换后的我的"结果相同。

**三本账自校验**（理解这段判断的关键）：

| 变量 | 含义 |
|---|---|
| `lastSent` | 操作最初发送时的快照（原始坐标，永不变） |
| `pending` | "活"的：等待回执期间，每收到一个远端操作就被本地 transform 一次 |
| `msg.op`（回执） | 服务端 transform 后的最终形态 |

- `msg.op !== pending` → 同一笔账两次独立计算结果不同 → **transform 实现有 bug**（打警告）
- `msg.op !== lastSent`（但 === pending）→ 期间发生过并发，坐标被修正过（教学展示，打 ✅）

## 6. 实验

1. **经典实验**（延迟勾着）：A 开头敲 `A`，B 末尾删 `d` → 两边编辑都保住，校验值相同，日志出现"服务端修正了坐标 ✅"
2. **同位置对撞**：A、B 光标放同一位置同时各敲一字 → 两端最终顺序一致（先到服务器的在前）
3. **乱打压力测试**：两标签页同时疯狂打字 10 秒，等队列清空 → 校验值相同即收敛

## 7. 已知弊端 / 语义取舍

1. **delete 吸收**：删除区间内别人的并发插入会被一起删掉（规则三）
2. 光标仍是朴素调整，未参与 transform（多人时偶尔跳）
3. 无持久化（重启丢文档）、无 undo、单文档单进程
4. 排队操作逐个发送（每 RTT 一个），真实系统会批量/组合（compose）

## 8. 后续阶段

- **Stage 4**：边界情况验证、延迟压力测试、光标 transform
- **Stage 5**（选做）：持久化 + 快照、协同 undo、多人光标展示
