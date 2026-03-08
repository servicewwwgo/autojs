# ExecutionLog 改造为 WebSocket 收发日志 — 计划

## 目标

将 `src/entrypoints/popup/components/ExecutionLog.vue` 完全替换为 **「WebSocket 收发数据日志」** 展示页，用于查看扩展与 Center 之间的原始 WebSocket 收发数据。不再保留原「指令执行结果」功能。

---

## 已确定决策

| 决策 | 选择 | 备注 |
|------|------|------|
| 1. 记录哪些消息 | 原始 ws 收发数据 | `ws.send` 的原始发送字符串、`MessageEvent.data` 的原始接收字符串 |
| 2. payload 存多少 | 完整消息，最近 200 条 | 环形缓冲或 FIFO，超过 200 条丢弃最旧 |
| 3. 发送到服务器按钮 | 去掉 | 不再提供 |
| 4. 刷新方式 | 自动轮询 | 无需手动刷新按钮 |
| 5. 原指令执行结果 | 完全替换 | 本页仅展示 WebSocket 日志 |
| 6. 消息类型范围 | 记录所有类型 | 不按 type 过滤，login、heartbeat、instructions、cdp、http、error、logger、tabs 等全部记录 |

---

## 改造计划

### 1. 数据来源

- **改造前**：ExecutionLog 通过 background 的 `get_results` / `clear_results` 拉取 InstructionExecutor 的指令执行结果。
- **改造后**：数据改为「每条 WebSocket 收发的原始字符串」记录。

**实现要点：**

- **Background**：在 WebSocket 收发处打点记录，**不按 type 过滤，记录所有类型的消息**（login、heartbeat、instructions、cdp、http、error、logger、tabs 等）：
  - **收**：在 `WebSocketConnector` 的 `onmessage` 回调中，收到 `MessageEvent` 后，**在 `JSON.parse` 之前** 将 `event.data`（原始字符串）及方向、时间戳写入 WS 日志存储。
  - **发**：在 `WebSocketConnector.sendMessage()`、`sendLoginMessage()` 等实际调用 `ws.send(jsonString)` 之前，将待发送的 **原始字符串**（即 `jsonString`）及方向、时间戳写入同一存储。
- **Popup**：不再使用 `get_results` / `clear_results` / `send_results_to_server`，改为：
  - `get_ws_logs`：返回当前 WS 日志条目；
  - `clear_ws_logs`：清空 WS 日志。

### 2. 单条日志结构

| 字段 | 类型 | 说明 |
|------|------|------|
| direction | `'sent' \| 'received'` | 收发方向 |
| timestamp | number | 毫秒时间戳 |
| raw | string | 原始数据：发送时为 `ws.send` 的参数字符串，接收时为 `MessageEvent.data` 字符串 |

- **payload 内容**：完整原始字符串，不截断、不解析后存储；展示时可解析以显示 type、id 等便于筛选。
- **条数限制**：仅保留最近 200 条，超出时丢弃最旧。

### 3. 前端页面改造（ExecutionLog.vue）

- **列表**：展示 WS 日志条目；每条显示：方向（发送/接收）、时间、原始 JSON 内容（可折叠/展开）。
- **筛选**（可选）：按方向（发送/接收/全部）；若需按 type 筛选，可在展示时解析 raw 得到 type 再过滤。
- **操作按钮**：
  - **清空**：调用 `clear_ws_logs`；
  - **不再提供**：刷新（改为自动轮询）、发送到服务器。
- **刷新方式**：自动轮询（如每 2 秒调用 `get_ws_logs`），无需手动刷新按钮。

### 4. Background 改动要点

- **WS 日志存储**：在 `WebSocketConnector` 或 `WebSocketService` 中维护数组，FIFO，最大 200 条。
- **打点位置**：
  - **收**：`onmessage = (event) => { /* 此处 push { direction: 'received', timestamp, raw: event.data } */; handleMessage(event); }`
  - **发**：在 `sendMessage()`、`sendLoginMessage()` 中，`ws.send(jsonString)` 之前 push `{ direction: 'sent', timestamp, raw: jsonString }`。
- **script_message**：新增 `get_ws_logs`、`clear_ws_logs`，在 background 的 message 路由中增加对应 handler。

### 5. 删除或废弃

- 本页不再调用：`get_results`、`clear_results`、`send_results_to_server`。
- ExecutionLog 原「指令执行结果」相关 UI 与逻辑全部移除，由 WebSocket 收发日志完全替代。

---

## 实现对照表

| 模块 | 改动 |
|------|------|
| WebSocketConnector | 新增 WS 日志存储（最多 200 条）；onmessage 收前、send/sendLogin 发前打点 |
| background handlers | 新增 get_ws_logs、clear_ws_logs；可移除或保留 get_results/clear_results（供其他页面使用则保留） |
| script_message types | 新增 get_ws_logs、clear_ws_logs |
| ExecutionLog.vue | 完全改为 WS 日志展示：列表、方向、时间、raw、清空；自动轮询；去掉刷新、发送到服务器 |

---

*本文档仅描述计划，不修改代码。实现时按此文档执行。*
