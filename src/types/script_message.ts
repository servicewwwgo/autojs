/**
 * 业务逻辑：定义 popup 窗口向 background script 发送的消息类型，用于 popup UI 与后台服务之间的通信，支持执行控制、结果管理、WebSocket 连接等功能
 *
 * 实现方式：使用 TypeScript 接口定义消息结构，包含 type 字段（消息类型）和可选的 params 字段（消息参数），type 字段使用联合类型限制为预定义的消息类型
 *
 * 注意事项：
 * - type 字段为必需字段，必须是预定义的消息类型之一
 * - params 字段为可选字段，根据不同的消息类型，params 的结构会有所不同
 * - 当前实现中，popup 组件主要使用 BackgroundScriptMessageType，此类型为预留接口，用于将来区分 popup 和 content script 的消息
 * - 消息类型包括：执行结果管理（get_results、clear_results、send_results_to_server）、指令执行（execute_instructions）、WebSocket 连接（connect_websocket、disconnect_websocket）、指令结果通知（instruction_result）
 * - 消息通过 browser.runtime.sendMessage API 发送，background script 需要注册相应的消息监听器
 *
 * 相关代码：src/utils/index.ts - SendMessageToPopupWindow() 函数（发送消息到 popup），src/entrypoints/background.ts - 消息监听器（接收消息），src/entrypoints/popup/components/ - popup 组件（发送消息）
 */
export interface PopupScriptMessageType {
    type: 'get_results' | 'clear_results' | 'send_results_to_server' | 'instruction_result' | 'connect_websocket' | 'disconnect_websocket' | 'execute_instructions' | 'get_ws_logs' | 'clear_ws_logs';
    params?: any;
}

/**
 * 业务逻辑：定义向 background script 发送的消息类型，用于 popup、content script 和 side panel 与后台服务之间的通信，支持标签页管理、节点配置、指令执行、结果管理、WebSocket 连接等功能
 *
 * 实现方式：使用 TypeScript 接口定义消息结构，包含 type 字段（消息类型）和可选的 params 字段（消息参数），type 字段使用联合类型限制为预定义的消息类型
 *
 * 注意事项：
 * - type 字段为必需字段，必须是预定义的消息类型之一
 * - params 字段为可选字段，根据不同的消息类型，params 的结构会有所不同
 * - 消息类型包括：生命周期（content_script_loaded、setCallbacks）、标签页管理（get_tabs、send_tabs）、节点配置（get_node_profile、update_node_profile）、指令管理（add_instructions、execute_instructions）、结果管理（get_results、clear_results、send_results_to_server）、WebSocket 连接（connect_websocket、disconnect_websocket、test_websocket）
 * - 消息通过 browser.runtime.sendMessage API 发送，background script 需要注册相应的消息监听器处理这些消息
 * - 这是最常用的消息类型，popup 组件和 content script 都使用此类型与 background script 通信
 *
 * 相关代码：src/utils/index.ts - SendMessageToBackgroundScript() 函数（发送消息到 background script），src/entrypoints/background.ts - 消息监听器（接收和处理消息），src/entrypoints/popup/components/ - popup 组件（发送消息），src/entrypoints/content.ts - content script（发送消息）
 */
export interface BackgroundScriptMessageType {
    type: 'content_script_loaded' | 'get_tabs' | 'send_tabs' | 'get_node_profile' | 'update_node_profile' | 'add_instructions' | 'execute_instructions' | 'get_results' | 'clear_results' | 'connect_websocket' | 'disconnect_websocket' | 'test_websocket' | 'send_results_to_server' | 'get_ws_logs' | 'clear_ws_logs' | 'setCallbacks';
    params?: any;
}

/**
 * 业务逻辑：定义向 content script 发送的消息类型，用于 background script 或 popup 与页面上下文中的 content script 通信，执行 DOM 操作、获取元素信息等页面级操作
 *
 * 实现方式：使用 TypeScript 接口定义消息结构，包含 type 字段（消息类型）和可选的 params 字段（消息参数），type 字段使用联合类型限制为预定义的消息类型
 *
 * 注意事项：
 * - type 字段为必需字段，必须是预定义的消息类型之一
 * - params 字段为可选字段，根据不同的消息类型，params 的结构会有所不同
 * - 消息类型包括：元素滚动（scroll_into_view）、属性获取（get_attribute）、脚本执行（execute_script）、文本获取（get_text）、可见性检查（is_visible）
 * - 消息通过 browser.tabs.sendMessage API 发送到指定标签页的 content script
 * - content script 必须在目标标签页中已加载，否则消息发送会失败
 * - 这些操作在页面上下文中执行，可以访问页面的 DOM 和 JavaScript 环境
 * - 消息处理函数在 content script 中注册，通过 mapTypeToFunction 映射到对应的处理函数
 *
 * 相关代码：src/utils/index.ts - SendMessageToContentScript() 函数（发送消息到 content script），src/entrypoints/content.ts - 消息监听器和处理函数（接收和处理消息），src/instructions/BaseInstruction.ts - SendMessageToContentScript() 方法（指令基类中的封装）
 */
export interface ContentScriptMessageType {
    type: 'scroll_into_view' | 'get_attribute' | 'execute_script' | 'get_text' | 'is_visible';
    params?: any;
}