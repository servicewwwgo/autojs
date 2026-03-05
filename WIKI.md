# AutoJS：基于 WebSocket 与 CDP 的浏览器自动化扩展

---

## 摘要

本文介绍 AutoJS（内部代号 web-crawler-extension）的设计与实现。该扩展以 Chrome 扩展形态运行，通过 WebSocket 与远程服务器通信，接收并执行自动化指令（导航、元素查找与操作、键盘/鼠标、截图、等待等），并通过 Chrome DevTools Protocol（CDP）与 HTTP 完成底层浏览器控制与网络请求。系统采用指令工厂与多管理器架构，支持按标签页分组的 FIFO 指令队列、级联失败处理、心跳与重连，以及 Tab 生命周期下的资源清理。本文从架构、协议、关键模块与使用方式等方面进行说明，为后续维护与扩展提供参考。

**关键词**：浏览器自动化；Chrome 扩展；WebSocket；CDP；指令队列；WXT；Vue

---

## 1. 引言

### 1.1 背景与动机

在网页自动化、爬虫与 RPA 等场景中，需要在用户浏览器环境中执行一系列预定操作（如登录、填表、点击、截图），并将执行结果回传至控制端。传统方案多依赖 Selenium/Playwright 等进程级自动化，或基于 CDP 的独立客户端。将自动化能力以浏览器扩展形式实现，可复用用户已登录的会话与 Cookie，并便于与现有 Web 工作流集成。AutoJS 即为此类扩展：在浏览器内运行，通过 WebSocket 接收服务器下发的指令，在指定标签页中按序执行，并通过同一连接回传结果与日志。

### 1.2 目标与范围

- **主要目标**：在 Chrome（及兼容的 Chromium 系浏览器）中，以扩展形式提供可被远程调度的自动化执行能力，支持多 Tab 并发执行、指令级重试/超时/忽略错误，以及 CDP/HTTP 等扩展能力。
- **范围**：本文档覆盖扩展的架构、消息协议、指令体系、执行流程、资源管理与配置方式；不涉及服务端实现或具体业务脚本编写细节。

### 1.3 技术选型概览

| 类别     | 选型说明 |
|----------|----------|
| 扩展框架 | WXT（基于 Vite，支持 MV3） |
| 前端 UI  | Vue 3（Popup 等） |
| 语言     | TypeScript |
| 通信     | WebSocket（指令下发、结果/日志上报） |
| 浏览器控制 | Chrome DevTools Protocol（CDP） |
| 测试     | Vitest |

---

## 2. 系统架构

### 2.1 整体架构

系统分为以下层次：

1. **入口与运行时**
   - **Background（Service Worker）**：扩展主逻辑所在；初始化各执行器与服务，处理来自 Popup/Content 的消息，管理 WebSocket 连接与浏览器事件（启动、安装、Alarm、Tab 关闭）。
   - **Content Script**：注入到页面，负责元素查找（含 text/ledby 等选择器）、属性读写、可见性判断等，通过消息与 Background 协作。
   - **Popup**：Vue 界面，用于连接/断开 WebSocket、查看节点与标签页、触发指令等。

2. **执行层**
   - **InstructionExecutor**：指令执行引擎；维护按 Tab 分组的 FIFO 队列，在每 Tab 上串行执行指令，并收集结果通过回调上报。
   - **CdpExecutor**：处理 CDP 类消息（建连、建 Tab、执行 JS、截图、网络/控制台日志等）。
   - **HttpExecutor**：处理 HTTP 类消息，在扩展上下文中发起 HTTP 请求并返回结果。

3. **连接与消息**
   - **WebSocketConnector**：维护与服务器的 WebSocket 连接，负责登录、心跳、重连、消息收发与按类型分发。

4. **管理层**
   - **InstructionManager**：按 tabId 分组的指令队列（入队、按 Tab 取首条、按 Tab 删除）。
   - **InstructionResultManager**：按 tabId 存储指令执行结果，支持按 Tab 取出并删除（用于上报后清空）。
   - **ElementManager**：按 tabId 与元素名称管理已定位的 DOM 元素信息（含 nodeId、tag 等），供后续指令引用。
   - **NodeManager**：节点配置（类型、ID、名称、令牌等），用于 WebSocket 登录与身份标识。

### 2.2 数据流概览

- **指令下发**：服务器经 WebSocket 发送 `type: 'instructions'` 消息，Payload 为指令数组；Background 将消息交给 InstructionExecutor，经 InstructionFactory 转为指令类实例并入队，随后对有待执行指令且当前未在运行的 Tab 启动 `runTabLoop`。
- **指令执行**：每个 Tab 独立循环：取该 Tab 首条指令 → 确保 CDP 已连接并启用所需域 → 执行指令（可能调用 Content Script 或 CDP）→ 写入结果 → 若不可忽略失败则级联标记本 Tab 剩余指令失败并清队 → 取该 Tab 所有结果上报并删除。
- **结果与日志**：InstructionExecutor 通过 `setSendResult` 注入的回调将 `InstructionResults` 发回 WebSocket；日志通过 `OutputLogToFile` 统一输出，并可在启用时经 WebSocket 发送 `log` 消息。

---

## 3. 消息协议与接口

### 3.1 WebSocket 消息格式

所有 WebSocket 消息为 JSON，顶层包含：

- **type**：消息类型，如 `'login' | 'heartbeat' | 'instructions' | 'cdp' | 'http' | 'log' | 'logger' | 'error' | 'tabs'` 等。
- **data**：与类型对应的载荷（可选）。

连接建立后客户端发送 `login`，携带节点信息（NodeProfile）；服务器可返回 `login` 响应（含 success/error）。心跳为 `heartbeat` 请求/响应，用于保活与检测断开。业务消息主要包括：

- **instructions**：指令数组，每项为 BaseInstruction（含 tabId、type、instructionID、delay、retry、timeout、ignoreError、params 等）。
- **cdp**：CDP 请求（含 type、id、data），扩展执行后回写 CdpResult（type、id、success、error、data）。
- **http**：HTTP 请求（如 type: 'http_request'），扩展执行后回写 HttpResult。

详细 CDP 消息与结果结构见项目内 `cdp_json_schema.md`。

### 3.2 指令类型与参数

指令的 `type` 与 `params` 对应关系简要如下：

| type            | 说明           | params 要点 |
|-----------------|----------------|-------------|
| navigate        | 页面导航       | url         |
| find_element    | 查找元素       | element (ElementData) |
| input           | 输入文本       | elementName, text, clear? |
| keyboard        | 键盘操作       | action, key?, text?, elementName? |
| mouse           | 鼠标操作       | action, elementName?, x?, y?, simulate? |
| get_attribute   | 获取属性       | elementName, attribute, usage? |
| set_attribute   | 设置属性       | elementName, attribute, value |
| screenshot      | 截图           | format?, quality?, fullPage?, elementName? |
| wait            | 等待条件       | waitType, titleText?/element?/attribute? 等 |
| get_url         | 获取当前 URL   | usage?      |
| activate_tab    | 激活标签页     | （使用指令 tabId） |
| execute_script  | 执行页面脚本   | 脚本内容等  |

元素定位使用 ElementData：selector、selectorType（'css'|'id'|'tag'|'text'|'ledby'）、以及可选的 parentName、childrenName、siblingName、siblingOffset 等以区分多匹配。定位成功后由系统填充 nodeId、tag 等，供后续指令通过 elementName 引用。

---

## 4. 关键模块设计

### 4.1 指令执行流程

- **入队与调度**：`ExecuteAll(instructions)` 将指令加入 InstructionManager，随后通过 `queueMicrotask` 对“有待执行指令且未在运行”的 Tab 启动 `runTabLoop`，避免阻塞调用方。
- **单 Tab 循环**：校验 Tab 存在 → 建立并启用 CDP 域（DOM、CSS、Page、Runtime）→ 循环：取该 Tab 首条指令 → 执行 → 更新统计并写入 ResultManager；若指令执行失败且未标记 `ignoreError`，则将本 Tab 剩余指令全部标记为“因前序指令失败而跳过”并清队，再上报该 Tab 所有结果。
- **执行结果**：每条指令返回 `InstructionResult`（tabId、instructionID、success、error、duration、data?）；同一 Tab 的结果在循环结束后通过 `GetResultAndDelete(tabId)` 取出并经由 `sendResult` 回调发送，避免重复发送。

### 4.2 WebSocket 连接管理

- **连接与登录**：连接建立后自动发送 `login`（NodeProfile）；在未登录前不处理业务消息。支持 `isDisconnecting` 防止主动断开时触发重连。
- **心跳与重连**：定时发送 `heartbeat`（如 15 秒间隔）；断线后按间隔（如 5 秒）重连。`isConnected()` 会校验 WebSocket 实际 `readyState`，以应对 Service Worker 休眠导致的状态不一致。
- **消息大小**：发送前检查消息体，超过 10MB 拒绝发送，避免异常大包导致连接或内存问题。

### 4.3 资源与生命周期

- **Tab 关闭**：`tabs.onRemoved` 时统一清理该 tabId 在 InstructionManager、InstructionResultManager、ElementManager、CdpExecutor（如 console/network 日志）中的状态，防止内存泄漏。
- **Content Script**：元素定位依赖注入页面的 Content Script；查找结果通过 CDP 或元素 tag（如 `cdp-locate-id`）在后续指令中复用。

### 4.4 错误与健壮性

- **指令级**：支持 delay、retry、timeout、ignoreError；某条指令不可忽略失败时，该 Tab 剩余指令不再执行并统一标记为级联失败。
- **HTTP**：GET/HEAD/DELETE/OPTIONS 不携带 body；请求超时（如 180 秒可配置）；响应解析失败时回退为文本。
- **安全与注入**：ElementManager 对 text/ledby 选择器中的搜索文本与 selector 做转义，降低注入风险；CDP Runtime 对象用后释放。

---

## 5. 配置与构建

### 5.1 环境变量（构建时）

通过 `.env` 或构建环境注入（以 `VITE_` 为前缀）：

- **VITE_WEBSOCKET_CONN_URL**：开发时 WebSocket 地址（如 `ws://localhost:80/ws`）。
- **VITE_DEBUG_MODE**：为 `'true'` 时使用开发 WebSocket 地址并可能开启调试日志。
- **VITE_APP_VERSION**：版本号，与 package.json 同步。
- **VITE_DEFAULT_NODE_TOKEN**：节点默认令牌（仅当未配置自定义节点令牌时使用）；生产环境应通过 CI/本地环境注入，勿将真实令牌提交仓库。

生产 WebSocket 地址在代码中默认为 `wss://browser.autowave.dev/ws`（见 `src/consts/index.ts`）。

### 5.2 构建与运行

- 安装依赖：`npm install`
- 开发模式：`npm run dev`（会先执行 sync-version，再以 Chrome 开发模式启动）
- 生产构建：`npm run build`
- 打包 zip：`npm run zip`
- 类型检查：`npm run compile`
- 单元测试：`npm run test`

扩展入口与构建配置见 `wxt.config.ts`（权限、manifest、Vite 选项等）。

---

## 6. 结论

AutoJS 通过 WebSocket 将远程下发的指令在浏览器扩展内执行，并结合 CDP 与 HTTP 能力，形成可扩展的自动化执行框架。架构上区分指令执行、CDP 执行、HTTP 执行与连接管理，管理器职责清晰；协议上统一消息类型与指令/结果结构，便于前后端对接。通过按 Tab 的 FIFO 队列、级联失败、心跳重连与 Tab 级资源清理，在保证行为可预期的同时兼顾稳定性与可维护性。后续可在指令类型扩展、重试策略细化、可观测性（指标/追踪）等方面继续演进。

---

## 参考文献与相关文档

- 项目内 `CODE_REVIEW.md`：代码审查结论与已修复项。
- 项目内 `cdp_json_schema.md`：CDP 消息与结果的 JSON 结构说明。
- [WXT 文档](https://wxt.dev/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
