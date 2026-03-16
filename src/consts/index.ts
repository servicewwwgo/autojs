/**
 * 业务逻辑：为已定位的 DOM 元素设置唯一标记属性，用于在 content script 中快速查找和操作元素
 *
 * 实现方式：通过 CDP 协议设置元素的 HTML 属性，属性名为 'cdp-locate-id'，属性值为随机生成的 14 位字符串
 *
 * 注意事项：
 * - 该标记仅在元素定位成功后设置，用于后续的元素操作（点击、输入等）
 * - 标记值由系统自动生成，用户不可手动设置
 * - 在 content script 中通过 CSS 选择器 `[cdp-locate-id="tag值"]` 查找元素
 *
 * 相关代码：src/managers/ElementManager.ts - LocateElement() 函数，src/entrypoints/content.ts - FindElement() 函数
 */
export const ElementTag: string = 'cdp-locate-id';

/**
 * 业务逻辑：配置 WebSocket 服务器连接地址，用于扩展与服务器之间的双向通信，接收指令并返回执行结果
 *
 * 实现方式：根据 VITE_DEBUG_MODE 的值决定使用哪个 WebSocket 地址
 * - 如果 VITE_DEBUG_MODE 为 true，使用 VITE_WEBSOCKET_CONN_URL（开发环境地址）
 * - 否则使用默认生产环境地址 wss://browser.autowave.dev/ws
 *
 * 注意事项：
 * - 开发环境可通过 .env 文件设置不同的 WebSocket 地址（如 ws://localhost:8080）
 * - 支持 ws:// 和 wss:// 协议，生产环境建议使用 wss:// 确保安全连接
 * - 连接失败时会自动重连，重连间隔和次数由 WebSocketConnector 管理
 *
 * 相关代码：src/entrypoints/background.ts - WebSocketConnector 初始化，src/executor/WebSocketConnector.ts - 连接管理
 */
export const WEBSOCKET_CONN_URL: string = import.meta.env.VITE_DEBUG_MODE === 'true'
    ? (import.meta.env.VITE_WEBSOCKET_CONN_URL || 'ws://localhost/client')
    : 'wss://browser.autowave.dev/client';

/**
 * 业务逻辑：控制是否将日志输出到本地文件，用于调试和问题排查，生产环境可关闭以减少性能开销
 *
 * 实现方式：从环境变量 VITE_DEBUG_MODE 读取，未设置或值为 'true' 时启用，其他值禁用
 *
 * 注意事项：
 * - 日志通过 Chrome Native Messaging API 写入本地文件，需要配置 native messaging host
 * - 禁用调试模式后，OutputLogToFile 函数会直接返回，不执行任何日志操作
 * - 日志包含时间戳、级别、来源等信息，支持缓冲机制批量写入以提高性能
 * - 环境变量值为字符串类型，需要显式设置为 'true' 字符串才能启用
 *
 * 相关代码：src/utils/index.ts - OutputLogToFile() 函数
 */
export const DEBUG_MODE: boolean = import.meta.env.VITE_DEBUG_MODE === undefined || import.meta.env.VITE_DEBUG_MODE === '' || import.meta.env.VITE_DEBUG_MODE === 'true';

/**
 * 业务逻辑：存储应用版本号，用于在 UI 界面显示当前版本信息，便于用户了解扩展版本
 *
 * 实现方式：从环境变量 VITE_APP_VERSION 读取，该值由 sync-version.js 脚本自动从 package.json 同步
 *
 * 注意事项：
 * - 版本号应与 package.json 中的 version 字段保持一致
 * - 构建前会自动运行 sync-version 脚本同步版本号到 .env 文件
 * - 如果环境变量未设置，值为 undefined，UI 中可能显示为空
 * - 版本号格式遵循语义化版本规范（如 1.2.22）
 *
 * 相关代码：src/entrypoints/popup/App.vue - 版本显示，sync-version.js - 版本同步脚本
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION;

/**
 * 业务逻辑：存储节点默认令牌，用于 WebSocket 连接时的身份验证，当节点未配置自定义令牌时使用此默认值
 *
 * 实现方式：优先从环境变量 VITE_DEFAULT_NODE_TOKEN 读取，如果未设置则使用硬编码的默认值
 *
 * 注意事项：
 * - 该令牌用于节点与服务器之间的身份验证
 * - 如果节点配置了自定义令牌，优先使用自定义令牌
 * - 默认令牌应保持安全，避免泄露
 * - 可通过 .env 文件设置 VITE_DEFAULT_NODE_TOKEN 环境变量来自定义默认令牌
 *
 * 相关代码：src/managers/NodeManager.ts - GetNodeProfile() 函数（使用此默认值）
 */
export const DEFAULT_NODE_TOKEN: string = import.meta.env.VITE_DEFAULT_NODE_TOKEN;