# Stage 1：从"全量文本"到"操作"（Operation）

> 本阶段解决 Stage 0 的"互相覆盖丢字"：不再传整篇文档，改传**操作**。
> 同时会暴露出新问题——位置漂移，这是通向 OT 的关键一步。

## 运行

```bash
npm run ot:1   # 或 node ot/01-operations/server.js   # 端口 8001，开两个浏览器标签页访问
```

## 本阶段实现

### 操作模型

编辑动作被表达为两种原语：

```js
{ kind: 'insert', pos: 3, str: 'X' }   // 在位置3插入"X"
{ kind: 'delete', pos: 3, len: 1 }     // 删除位置3起的1个字符
```

### `diffToOps(oldText, newText)`：把输入翻译成操作

每次 `input` 事件后比较新旧文本：找**公共前缀**和**公共后缀**，中间变化的部分就是操作。
一次输入最多产生两个操作（先 delete 后 insert，覆盖选中区就是删+插）。

```
"hello" → "helXlo"
公共前缀 "hel"，公共后缀 "lo"，中间 "" → "X"
→ { kind: 'insert', pos: 3, str: 'X' }
```

### `applyOp(doc, op)`：前后端共用同一套应用逻辑

```js
insert: doc.slice(0, pos) + str + doc.slice(pos)
delete: doc.slice(0, pos) + doc.slice(pos + len)
```

### 朴素光标修正

远端操作发生在光标之前 → 光标跟着挪（`insert` 在光标前 → `cursor += str.length`）。
注意：**这已经是 transform 的思想萌芽**。

### 教学工具

- 操作日志面板：实时看到每次敲键变成什么操作
- **校验值**（内容哈希）：两个标签页校验值不同 = 文档发散，一目了然
- **800ms 模拟网络延迟**：让"并发"可以被手动稳定复现

## 核心实验：位置漂移

文档同步为 `"hello world"` 后（勾上延迟）：

```
A：光标放到最开头，敲 "A"   → 发出 insert pos=0
B：光标放到最末尾，退格删 'd' → 发出 delete pos=10

正确结果应为 "Ahello worl"，实际两边变成 "Ahello word" 之类：
  B 的 delete pos=10 到达 A 时，A 的文档已因开头插入整体右移一位，
  pos=10 指向的不再是 'd' 而是 'l' → 删错字 → 两边校验值不同，【静默发散】
```

## 根因分析

`pos` 是**相对坐标**。操作是基于"我生成它那一刻看到的文档"算出来的；
等它送达对方，对方文档已变，坐标就失效了。

## 已知弊端

1. 并发下位置漂移 → 静默发散（比 Stage 0 更隐蔽：表面正常，内容已不一致）
2. 服务端没有版本概念，无法检测冲突，更无法修正

## 后续阶段如何解决

- **Stage 2**：加版本号 + 服务端全局定序，冲突可检测、可强制收敛（但会丢编辑）
- **Stage 3**：`transform()` 修正过期操作的坐标，不再丢编辑（OT 核心）
- **Stage 4**：边界情况与光标 transform
