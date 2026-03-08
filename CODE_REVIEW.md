# AutoJS 代码审查报告

## 一、项目概览

- **技术栈**：TypeScript + WXT (Chrome 扩展) + Vue
- **职责**：Web 自动化爬虫扩展，通过 WebSocket 接收指令、CDP/HTTP 执行、结果回传
- **结构**：指令执行器、CDP/HTTP 执行器、WebSocket 连接、指令/元素/结果管理、background/content/popup 入口；Popup 内含「WebSocket 日志」页，展示原始 ws 收发数据（最近 200 条）
- **协议**：WSMessage 形态 `{ type, id?, data }`；instructions 请求/响应负载含 `id`，与 control 端一致（见 `docs/autojs-control-protocol.md`）

---

## 二、优点

### 1. 架构清晰
- **职责分离**：`InstructionExecutor` / `CdpExecutor` / `HttpExecutor` 各司其职，WebSocket 只做连接与消息分发。
- **管理器独立**：`InstructionManager`、`ElementManager`、`InstructionResultManager`、`NodeManager` 边界清楚，便于测试与扩展。
- **指令工厂**：`InstructionFactory` + 各指令类，类型与扩展性较好。

### 2. 文档与注释
- 关键类/方法有业务逻辑、实现方式、注意事项、相关代码引用，对维护友好。
- 类型定义（`instruction.ts`、`http.ts`、`websocket_message` 等）与注释一致，便于对接。

### 3. 错误与边界处理
- **指令级**：`ignoreError`、重试、超时、cascading failure（前一条失败则后续全部标记失败并清队）处理完整。
- **Tab 生命周期**：`tabs.onRemoved` 时统一清理 Instruction/Element/Result/CDP，避免泄漏。
- **WebSocket**：心跳、重连、`isDisconnecting` 防重连、`isConnected()` 与真实 `readyState` 校验，考虑较全。

### 4. 安全与健壮
- **HttpExecutor**：对 GET/HEAD/DELETE/OPTIONS 不送 body、超时与 Promise.race、JSON 解析失败回退到文本。
- **ElementManager**：text/ledby 选择器中对搜索文本和 selector 做转义，降低注入风险；Runtime 对象用后 `releaseObject`，避免泄漏。

### 5. 类型与 Lint
- TypeScript 使用规范，接口与联合类型清晰；InstructionsRequestPayload / InstructionsResponsePayload 与 WSMessage 约定一致；WSLogEntry（direction、timestamp、raw）与 WebSocket 日志展示一致。

### 6. WebSocket 收发日志（新增）
- **WebSocketConnector**：在 onmessage（JSON.parse 前）与 sendMessage/sendLoginMessage（ws.send 前）打点记录原始字符串；FIFO 最多 200 条；getWsLogs/clearWsLogs 供 popup 使用。
- **ExecutionLog.vue**：改为「WebSocket 日志」页，展示方向/时间/raw、按方向筛选、条目展开、自动轮询 2 秒、清空按钮；轮询定时器在 onUnmounted 中正确清理。

---

## 三、问题与建议

### 1. 注释与实现不一致（已修复）

**位置**：`src/entrypoints/background/handlers/instructions.ts`

- 原注释写「延迟 1 秒」，代码为 `setTimeout(..., 5000)`（5 秒）。已将注释改为「延迟 5 秒」与实现一致。
- 已抽成常量 `EXECUTE_DELAY_MS = 5000`，便于配置与文档化。

### 2. 魔术数字与常量（已修复）

- **HttpExecutor**：已增加 `DEFAULT_HTTP_TIMEOUT_MS`、`METHODS_WITHOUT_BODY` 常量。
- **instructions**：已增加 `EXECUTE_DELAY_MS` 常量。

### 3. 类型与命名（已修复）

- **ElementData.selectorType**：已在 `ElementClass.Validate()` 中去掉 `xpath`，仅允许 `'css' | 'id' | 'tag' | 'text' | 'ledby'`，与类型及 `FindAllMatchingElementNodeIds` 实现一致。
- **InstructionResultManager.GetResultAndDelete**：已改为「该 tabId 存在条目即从 Map 删除（含空数组）」，并同步更新注释。

### 4. 潜在逻辑细节（已修复）

- **InstructionManager.GetFirstInstructionByTabId**：已去掉冗余的 `set(tabId, instructions)`，仅在实际为空时 `delete(tabId)`。
- **runTabLoop 中 cascading failure**：已在「获取结果并 sendResult」前增加注释，说明正常结束或 cascading failure 后均在本轮末尾统一上报。

### 5. 可维护性（已修复）

- **ElementManager**：已抽成静态方法 `buildTextSearchExpression`、`buildLedbySearchExpression`，供 text/ledby 分支复用。
- **WebSocketConnector**：已将所有 `console.log`/`console.warn`/`console.error` 改为 `OutputLogToFile(..., { level: LogLevel.* })`。

### 6. 测试与健壮性（已修复）

- 已引入 Vitest，并新增：
  - `src/managers/InstructionManager.test.ts`：入队、FIFO 取出、按 tab 分组、删除等。
  - `src/executor/HttpExecutor.test.ts`：未知 type、缺参、成功/失败请求的 handleMessage 行为。
  - `src/managers/InstructionResultManager.test.ts`：SaveResult、GetResultAndDelete（含空数组移除）、ClearResult、GetAllResults。
- `InstructionExecutor.runTabLoop` 依赖 browser/CDP 环境，暂未加单测，可在后续用 mock 补充。

### 7. 待改进项（建议）

- **instructions 处理器 JSON.parse**：`src/entrypoints/background/handlers/instructions.ts` 第 36 行 `JSON.parse(instructionsJsonString)` 在非法 JSON 时会抛错；外层 background 的 onMessage 会 catch 并返回通用错误。建议在 handler 内 try/catch，返回 `{ success: false, error: 'Invalid JSON: ...' }`，便于 popup 提示更明确。
- **_currentRequestId 与多批指令**：`InstructionExecutor._currentRequestId` 为单实例共享。若服务端在短时间内连续下发两条 instructions 消息（两个 id），第二条 handleMessage 会覆盖 _currentRequestId，导致第一条批次中尚未执行完的 tab 在 sendResult 时带上第二条的 id。当前使用方式多为「单批执行完再发下一批」，若未来有并发多批需求，可改为按批次/请求 id 存储并随结果带出。
- **ExecutionLog 展开 key**：`expanded` 使用 `timestamp` 作为 key，同一毫秒内多条消息会共用同一 key，点击展开时可能同时展开/折叠。建议改为 `${timestamp}-${index}` 或条目唯一 id 以区分。
- **清空后 expanded 状态**：`clearLogs` 成功后未清空 `expanded`，旧 timestamp 可能与新日志冲突（概率极低）。可按需在 clearLogs 成功时清空 expanded。

### 8. WebSocket 日志敏感数据

- **login 消息含 node_token**：WS 日志记录 login 等所有类型，原始 raw 包含 NodeProfile（含 node_token）。Popup 中可查看，若为调试/开发工具可接受；若部署到不可信环境，需注意不要在生产环境长期开启或对敏感字段做脱敏。

---

## 四、小结

- 整体设计清晰，类型与注释到位，错误与资源清理考虑较全，安全相关点（转义、超时、body 限制）处理得当；协议与 control 端已对齐；WebSocket 收发日志（FIFO 200 条、get_ws_logs/clear_ws_logs、ExecutionLog 页）实现完整。
- 历史项已修复：延迟/常量、selectorType、GetResultAndDelete 语义、runTabLoop 注释、ElementManager 抽取方法、日志统一、单元测试。
- 建议优先：instructions 内 JSON.parse 的 try/catch；ExecutionLog 展开 key 改为唯一标识；清空时可选清空 expanded；WS 日志含敏感数据（login token）需在不可信环境中注意。

---

## 五、安全与配置

### 1. 敏感配置

- **DEFAULT_NODE_TOKEN**：节点默认令牌由 `src/consts/index.ts` 从环境变量 `VITE_DEFAULT_NODE_TOKEN` 读取，构建时打入扩展；`.env` 中不应提交真实令牌，且 `.env` 已列入 `.gitignore`。
- **建议**：生产构建使用 CI 或本地临时环境变量注入令牌，避免将 `.env` 或带真实 token 的 `.env.example` 提交仓库。

---

*审查基于当前代码库静态阅读，未运行完整自动化测试或扩展安装验证。*
