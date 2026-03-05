/**
 * 业务逻辑：定义通过 WebSocket 发送的 CDP（Chrome DevTools Protocol）消息结构，用于在浏览器扩展中执行 CDP 操作，支持连接管理、标签页操作、元素截图、日志收集、JavaScript 执行等功能
 *
 * 实现方式：使用 TypeScript 接口定义消息结构，包含 type 字段（消息类型）、id 字段（请求唯一标识符）和可选的 data 字段（消息参数）
 *
 * 注意事项：
 * - type 字段为必需字段，必须是预定义的 CDP 操作类型之一（cdp_connect、cdp_disconnect、list_targets、take_element_screenshot、send_command、grep_source、get_network_logs、get_console_logs、execute_javascript、init_network_logs、init_console_logs、close_network_logs、close_console_logs、create_tab_and_navigate、update_node_name、close_tab）
 * - id 字段为必需字段，用于标识请求，与响应结果中的 id 对应
 * - data 字段为可选字段，根据不同的消息类型，data 的结构会有所不同
 * - 消息通过 WebSocket 接收，由 CdpExecutor 处理并执行实际的 CDP 操作
 * - 所有具体的 CDP 消息类型（如 CdpConnectMessage、CdpSendCommandMessage 等）都继承自此接口
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleMessage() 函数（处理 CDP 消息），src/entrypoints/background.ts - WebSocket 消息路由（路由 CDP 消息）
 */
export interface CdpMessage {
    type: 'cdp_connect' | 'cdp_disconnect' | 'list_targets' | 'take_element_screenshot' | 'send_command' | 'grep_source' | 'get_network_logs' | 'get_console_logs' | 'execute_javascript' | 'init_network_logs' | 'init_console_logs' | 'close_network_logs' | 'close_console_logs' | 'create_tab_and_navigate' | 'update_node_name' | 'close_tab';
    id: string;
    data?: any;
}

/**
 * 业务逻辑：定义 CDP 操作执行结果的基础结构，用于记录操作执行状态、响应信息和错误信息，通过 WebSocket 返回给服务器
 *
 * 实现方式：使用 TypeScript 接口定义结果结构，包含必需字段（type、id、success）和可选字段（error、data）
 *
 * 注意事项：
 * - type 字段为消息类型，与请求消息的 type 对应
 * - id 字段为请求唯一标识符，与请求消息的 id 对应，用于匹配请求和响应
 * - success 字段为执行是否成功，布尔值，用于快速判断执行状态
 * - error 字段为错误信息，可选字段，仅在执行失败时设置
 * - data 字段为响应数据，可选字段，根据不同的操作类型，data 的结构会有所不同
 * - 结果通过 WebSocket 发送给服务器，由 CdpExecutor 的 sendResult 回调函数发送
 * - 所有具体的 CDP 结果类型（如 CdpConnectResult、CdpSendCommandResult 等）都继承自此接口
 *
 * 相关代码：src/executor/CdpExecutor.ts - 各种处理函数（生成此类型结果），setSendResult() 方法（设置结果发送回调），src/entrypoints/background.ts - WebSocket 结果发送（发送 CDP 结果）
 */
export interface CdpResult {
    type: string;
    id: string;
    success: boolean;
    error?: string;
    data?: any;
}

/**
 * 业务逻辑：定义 CDP 连接消息，用于建立与指定标签页的 CDP 连接，这是执行所有 CDP 操作的前提条件
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'cdp_connect'
 *
 * 注意事项：data 字段通常包含 tabId，用于指定要连接的标签页，连接成功后返回 tabId
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCdpConnect() 函数（处理连接消息）
 */
export interface CdpConnectMessage extends CdpMessage {
    type: 'cdp_connect';
}

/**
 * 业务逻辑：定义 CDP 连接结果，返回连接成功的标签页 ID，用于确认连接状态
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId
 *
 * 注意事项：data.tabId 为成功连接的标签页 ID，用于后续的 CDP 操作
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCdpConnect() 函数（返回此类型结果）
 */
export interface CdpConnectResult extends CdpResult {
    data?: {
        tabId: number;
    };
}

/**
 * 业务逻辑：定义 CDP 断开连接消息，用于断开与指定标签页的 CDP 连接，释放调试资源
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'cdp_disconnect'
 *
 * 注意事项：data 字段通常包含 tabId，用于指定要断开的标签页
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCdpDisconnect() 函数（处理断开连接消息）
 */
export interface CdpDisconnectMessage extends CdpMessage {
    type: 'cdp_disconnect';
}

/**
 * 业务逻辑：定义 CDP 断开连接结果，返回断开连接的标签页 ID，用于确认断开状态
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId
 *
 * 注意事项：data.tabId 为已断开连接的标签页 ID
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCdpDisconnect() 函数（返回此类型结果）
 */
export interface CdpDisconnectResult extends CdpResult {
    data?: {
        tabId: number;
    };
}

/**
 * 业务逻辑：定义列出所有标签页目标消息，用于获取所有可用的标签页信息，包括标签页 ID、索引和 URL
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'list_targets'
 *
 * 注意事项：无需 data 字段，直接返回所有标签页信息
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleListTargets() 函数（处理列出目标消息）
 */
export interface CdpListTargetsMessage extends CdpMessage {
    type: 'list_targets';
}

/**
 * 业务逻辑：定义列出标签页目标结果，返回所有标签页的详细信息数组，用于标签页管理和选择
 *
 * 实现方式：继承自 CdpResult 接口，data 字段为标签页信息数组
 *
 * 注意事项：data 为数组类型，每个元素包含 tabId、tabIndex、url 字段，用于在 UI 中显示和选择标签页
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleListTargets() 函数（返回此类型结果）
 */
export interface CdpListTargetsResult extends CdpResult {
    data?: {
        tabId: number;
        tabIndex: number;
        url: string;
    }[];
}

/**
 * 业务逻辑：定义执行 JavaScript 代码消息，用于在指定标签页的页面上下文中执行 JavaScript 代码，获取页面数据或执行自定义逻辑
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'execute_javascript'，data 字段包含 tabId 和 params
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.params 为 CDP Runtime.evaluate 命令的参数（通常包含 expression 字段）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleExecuteJavaScript() 函数（处理执行 JavaScript 消息）
 */
export interface CdpExecuteJavaScriptMessage extends CdpMessage {
    type: 'execute_javascript';
    data?: {
        tabId: number;
        params: any;
    };
}

/**
 * 业务逻辑：定义执行 JavaScript 代码结果，返回脚本执行的返回值和异常信息，用于获取页面数据和错误处理
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 result 和可选的 exceptionDetails
 *
 * 注意事项：data.result 为脚本执行的返回值（可能是任何可序列化的 JavaScript 值），data.exceptionDetails 为异常信息（仅在执行失败时存在）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleExecuteJavaScript() 函数（返回此类型结果）
 */
export interface CdpExecuteJavaScriptResult extends CdpResult {
    data?: {
        result: any;
        exceptionDetails?: any;
    }
}

/**
 * 业务逻辑：定义元素截图消息，用于捕获指定元素的截图，支持多种选择器类型定位元素
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'take_element_screenshot'，data 字段包含 tabId、selector、selectorType
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.selector 为元素选择器，data.selectorType 为选择器类型（css、xpath、id 等，可选）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleTakeElementScreenshot() 函数（处理元素截图消息）
 */
export interface CdpTakeElementScreenshotMessage extends CdpMessage {
    type: 'take_element_screenshot';
    data?: {
        tabId: number;
        selector: string;
        selectorType?: string;
    };
}

/**
 * 业务逻辑：定义元素截图结果，返回截图的 Base64 编码数据、格式和元素位置信息，用于页面状态记录和验证
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 image、format、x、y、width、height
 *
 * 注意事项：data.image 为 Base64 编码的图片数据，data.format 为图片格式（png、jpeg），data.x、data.y 为元素位置坐标，data.width、data.height 为元素尺寸
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleTakeElementScreenshot() 函数（返回此类型结果）
 */
export interface CdpTakeElementScreenshotResult extends CdpResult {
    data?: {
        image: string;
        format: string;
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

/**
 * 业务逻辑：定义发送 CDP 命令消息，用于执行任意 CDP 命令，提供最大的灵活性，支持所有 CDP Domain 的方法
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'send_command'，data 字段包含 tabId、method、params
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.method 为 CDP 方法名（如 'DOM.querySelector'、'Input.dispatchMouseEvent'），data.params 为命令参数（根据具体命令而定）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleSendCommand() 函数（处理发送命令消息）
 */
export interface CdpSendCommandMessage extends CdpMessage {
    type: 'send_command';
    data?: {
        tabId: number;
        method: string;
        params: any;
    };
}

/**
 * 业务逻辑：定义发送 CDP 命令结果，返回 CDP 命令的原生响应数据，类型取决于具体的 CDP 命令
 *
 * 实现方式：继承自 CdpResult 接口，data 字段为任意类型，直接返回 CDP 协议的原生响应
 *
 * 注意事项：data 的结构完全取决于执行的 CDP 命令，不做任何转换，直接返回 CDP 协议响应
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleSendCommand() 函数（返回此类型结果）
 */
export interface CdpSendCommandResult extends CdpResult {
    data?: any;
}

/**
 * 业务逻辑：定义搜索页面源码消息，用于在页面的所有资源（HTML、CSS、JavaScript）中搜索匹配的文本模式，用于代码分析和调试
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'grep_source'，data 字段包含 tabId、pattern、caseSensitive
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.pattern 为搜索模式（正则表达式或普通字符串），data.caseSensitive 为是否区分大小写（可选，默认 false）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleGrepSource() 函数（处理搜索源码消息）
 */
export interface CdpGrepSourceMessage extends CdpMessage {
    type: 'grep_source';
    data?: {
        tabId: number;
        pattern: string;
        caseSensitive?: boolean;
    };
}

/**
 * 业务逻辑：定义搜索页面源码结果，返回所有匹配的文本位置和内容，包括 URL、行号和匹配内容
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 matches 数组、pattern、count
 *
 * 注意事项：data.matches 为匹配结果数组，每个元素包含 url（资源 URL）、line（行号）、content（匹配内容），data.pattern 为搜索模式，data.count 为匹配数量
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleGrepSource() 函数（返回此类型结果）
 */
export interface CdpGrepSourceResult extends CdpResult {
    data?: {
        matches: Array<{ url: string; line: number; content: string }>;
        pattern: string;
        count: number;
    };
}

/**
 * 业务逻辑：定义获取网络日志消息，用于获取指定标签页的网络请求日志，支持过滤、分页和分组，用于网络监控和调试
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'get_network_logs'，data 字段包含 tabId 和多个可选过滤参数
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.clear 为是否清空日志（可选），data.filter 为过滤条件（可选），data.limit 为返回数量限制（可选），data.offset 为偏移量（可选），data.requestId 为特定请求 ID（可选），data.groupByRequest 为是否按请求分组（可选）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleGetNetworkLogs() 函数（处理获取网络日志消息）
 */
export interface CdpGetNetworkLogsMessage extends CdpMessage {
    type: 'get_network_logs';
    data?: {
        tabId: number;
        clear?: boolean;
        filter?: any;
        limit?: number;
        offset?: number;
        requestId?: string;
        groupByRequest?: boolean;
    };
}

/**
 * 业务逻辑：定义获取网络日志结果，返回网络请求日志数组和统计信息，用于网络分析和问题排查
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId、logs 数组、count、total、grouped
 *
 * 注意事项：data.tabId 为标签页 ID，data.logs 为日志数组，data.count 为返回的日志数量，data.total 为总日志数量，data.grouped 为是否已分组
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleGetNetworkLogs() 函数（返回此类型结果）
 */
export interface CdpGetNetworkLogsResult extends CdpResult {
    data?: {
        tabId: number;
        logs: any[];
        count: number;
        total: number;
        grouped: boolean;
    };
}

/**
 * 业务逻辑：定义初始化网络日志收集消息，用于开始收集指定标签页的网络请求日志，启用 Network 域的事件监听
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'init_network_logs'，data 字段包含 tabId 和可选的 clear
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.clear 为是否清空已有日志（可选，默认 false）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleInitNetworkLogs() 函数（处理初始化网络日志消息）
 */
export interface CdpInitNetworkLogsMessage extends CdpMessage {
    type: 'init_network_logs';
    data?: {
        tabId: number;
        clear?: boolean;
    };
}

/**
 * 业务逻辑：定义初始化网络日志收集结果，返回初始化状态信息，用于确认日志收集是否已启动
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId 和 message
 *
 * 注意事项：data.tabId 为标签页 ID，data.message 为状态消息（如 "Network logs initialized"）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleInitNetworkLogs() 函数（返回此类型结果）
 */
export interface CdpInitNetworkLogsResult extends CdpResult {
    data?: {
        tabId: number;
        message: string;
    };
}

/**
 * 业务逻辑：定义获取控制台日志消息，用于获取指定标签页的控制台日志，支持过滤和分页，用于调试和问题排查
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'get_console_logs'，data 字段包含 tabId 和多个可选过滤参数
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.clear 为是否清空日志（可选），data.filter 为过滤条件（可选），data.limit 为返回数量限制（可选），data.offset 为偏移量（可选）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleGetConsoleLogs() 函数（处理获取控制台日志消息）
 */
export interface CdpGetConsoleLogsMessage extends CdpMessage {
    type: 'get_console_logs';
    data?: {
        tabId: number;
        clear?: boolean;
        filter?: any;
        limit?: number;
        offset?: number;
    };
}

/**
 * 业务逻辑：定义获取控制台日志结果，返回控制台日志数组和统计信息，包括日志级别、消息内容、来源等
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId、logs 数组、count、total
 *
 * 注意事项：data.tabId 为标签页 ID，data.logs 为日志数组，data.count 为返回的日志数量，data.total 为总日志数量
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleGetConsoleLogs() 函数（返回此类型结果）
 */
export interface CdpGetConsoleLogsResult extends CdpResult {
    data?: {
        tabId: number;
        logs: any[];
        count: number;
        total: number;
    };
}

/**
 * 业务逻辑：定义初始化控制台日志收集消息，用于开始收集指定标签页的控制台日志，启用 Runtime 域的控制台事件监听
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'init_console_logs'，data 字段包含 tabId 和可选的 clear
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.clear 为是否清空已有日志（可选，默认 false）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleInitConsoleLogs() 函数（处理初始化控制台日志消息）
 */
export interface CdpInitConsoleLogsMessage extends CdpMessage {
    type: 'init_console_logs';
    data?: {
        tabId: number;
        clear?: boolean;
    };
}

/**
 * 业务逻辑：定义初始化控制台日志收集结果，返回初始化状态信息，用于确认日志收集是否已启动
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId 和 message
 *
 * 注意事项：data.tabId 为标签页 ID，data.message 为状态消息（如 "Console logs initialized"）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleInitConsoleLogs() 函数（返回此类型结果）
 */
export interface CdpInitConsoleLogsResult extends CdpResult {
    data?: {
        tabId: number;
        message: string;
    };
}

/**
 * 业务逻辑：定义关闭网络日志收集消息，用于停止收集指定标签页的网络请求日志，释放资源
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'close_network_logs'，data 字段包含 tabId 和可选的 clear
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.clear 为是否清空已有日志（可选，默认 false）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCloseNetworkLogs() 函数（处理关闭网络日志消息）
 */
export interface CdpCloseNetworkLogsMessage extends CdpMessage {
    type: 'close_network_logs';
    data?: {
        tabId: number;
        clear?: boolean;
    };
}

/**
 * 业务逻辑：定义关闭网络日志收集结果，返回关闭状态信息，用于确认日志收集是否已停止
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId 和 message
 *
 * 注意事项：data.tabId 为标签页 ID，data.message 为状态消息（如 "Network logs closed"）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCloseNetworkLogs() 函数（返回此类型结果）
 */
export interface CdpCloseNetworkLogsResult extends CdpResult {
    data?: {
        tabId: number;
        message: string;
    };
}

/**
 * 业务逻辑：定义关闭控制台日志收集消息，用于停止收集指定标签页的控制台日志，释放资源
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'close_console_logs'，data 字段包含 tabId 和可选的 clear
 *
 * 注意事项：data.tabId 为目标标签页 ID，data.clear 为是否清空已有日志（可选，默认 false）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCloseConsoleLogs() 函数（处理关闭控制台日志消息）
 */
export interface CdpCloseConsoleLogsMessage extends CdpMessage {
    type: 'close_console_logs';
    data?: {
        tabId: number;
        clear?: boolean;
    };
}

/**
 * 业务逻辑：定义关闭控制台日志收集结果，返回关闭状态信息，用于确认日志收集是否已停止
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId 和 message
 *
 * 注意事项：data.tabId 为标签页 ID，data.message 为状态消息（如 "Console logs closed"）
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCloseConsoleLogs() 函数（返回此类型结果）
 */
export interface CdpCloseConsoleLogsResult extends CdpResult {
    data?: {
        tabId: number;
        message: string;
    };
}

/**
 * 可选 cookie 项，用于在导航前通过 CDP Network.setCookies 设置，与 CDP CookieParam 对齐
 */
export interface CdpCookieParam {
    name: string;
    value: string;
    url?: string;   // 请求 URI，用于确定 cookie 的 domain/path，不传时由调用方用目标 url 填充
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    expires?: number; // TimeSinceEpoch
}

/**
 * 业务逻辑：定义创建标签页并导航消息，用于创建新标签页并导航到指定 URL，支持在当前窗口或新窗口中打开，支持导航前设置 cookie
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'create_tab_and_navigate'，data 字段包含 url、active、newWindow、cookies
 *
 * 注意事项：data.url 为目标 URL（必需），data.active 为是否激活新标签页（可选，默认 true），data.newWindow 为是否在新窗口中打开（可选，默认 false），data.cookies 为可选数组，若提供则先创建空白页、连接 CDP、设置 cookie 后再导航到 url
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCreateTabAndNavigate() 函数（处理创建标签页消息）
 */
export interface CdpCreateTabAndNavigateMessage extends CdpMessage {
    type: 'create_tab_and_navigate';
    data?: {
        url: string;
        active?: boolean;
        newWindow?: boolean; // 是否在新窗口中打开
        /** 可选。若提供则先设置 cookie 再导航到 url；会先创建 about:blank 再通过 CDP Network.setCookies 设置后 Page.navigate */
        cookies?: CdpCookieParam[];
    };
}

/**
 * 业务逻辑：定义创建标签页并导航结果，返回新创建的标签页信息，包括标签页 ID、索引和 URL
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId、tabIndex、url
 *
 * 注意事项：data.tabId 为新标签页的 ID，data.tabIndex 为标签页在窗口中的索引位置，data.url 为导航的目标 URL
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCreateTabAndNavigate() 函数（返回此类型结果）
 */
export interface CdpCreateTabAndNavigateResult extends CdpResult {
    data?: {
        tabId: number;
        tabIndex: number;
        url: string;
    };
}

/**
 * 业务逻辑：定义更新节点名称消息，用于更新浏览器扩展的节点名称，用于节点管理和标识
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'update_node_name'，data 字段包含 node_name
 *
 * 注意事项：data.node_name 为新的节点名称，会更新到本地存储和 Cookie 中
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleUpdateNodeName() 函数（处理更新节点名称消息）
 */
export interface CdpUpdateNodeNameMessage extends CdpMessage {
    type: 'update_node_name';
    data?: {
        node_name: string;
    };
}

/**
 * 业务逻辑：定义更新节点名称结果，返回更新后的节点名称，用于确认更新是否成功
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 node_name
 *
 * 注意事项：data.node_name 为更新后的节点名称，与请求中的节点名称相同
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleUpdateNodeName() 函数（返回此类型结果）
 */
export interface CdpUpdateNodeNameResult extends CdpResult {
    data?: {
        node_name: string;
    };
}

/**
 * 业务逻辑：定义关闭标签页消息，用于关闭指定的标签页，释放资源
 *
 * 实现方式：继承自 CdpMessage 接口，固定 type 为 'close_tab'，data 字段包含 tabId
 *
 * 注意事项：data.tabId 为要关闭的标签页 ID，关闭后该标签页的所有 CDP 连接和日志收集也会自动清理
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCloseTab() 函数（处理关闭标签页消息）
 */
export interface CdpCloseTabMessage extends CdpMessage {
    type: 'close_tab';
    data?: {
        tabId: number;
    };
}

/**
 * 业务逻辑：定义关闭标签页结果，返回已关闭的标签页 ID，用于确认关闭是否成功
 *
 * 实现方式：继承自 CdpResult 接口，data 字段包含 tabId
 *
 * 注意事项：data.tabId 为已关闭的标签页 ID，与请求中的 tabId 相同
 *
 * 相关代码：src/executor/CdpExecutor.ts - handleCloseTab() 函数（返回此类型结果）
 */
export interface CdpCloseTabResult extends CdpResult {
    data?: {
        tabId: number;
    };
}
