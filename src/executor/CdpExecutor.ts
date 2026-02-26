import { nodeManager } from '../managers';
import type { CdpCloseConsoleLogsMessage, CdpCloseConsoleLogsResult, CdpCloseNetworkLogsMessage, CdpCloseNetworkLogsResult, CdpCloseTabMessage, CdpCloseTabResult, CdpConnectMessage, CdpConnectResult, CdpCreateTabAndNavigateMessage, CdpCreateTabAndNavigateResult, CdpDisconnectMessage, CdpDisconnectResult, CdpExecuteJavaScriptMessage, CdpExecuteJavaScriptResult, CdpGetConsoleLogsMessage, CdpGetConsoleLogsResult, CdpGetNetworkLogsMessage, CdpGetNetworkLogsResult, CdpGrepSourceMessage, CdpGrepSourceResult, CdpInitConsoleLogsMessage, CdpInitConsoleLogsResult, CdpInitNetworkLogsMessage, CdpInitNetworkLogsResult, CdpListTargetsMessage, CdpListTargetsResult, CdpMessage, CdpResult, CdpSendCommandMessage, CdpSendCommandResult, CdpTakeElementScreenshotMessage, CdpTakeElementScreenshotResult, CdpUpdateNodeNameMessage, CdpUpdateNodeNameResult } from '../types';
import { DisconnectCDP, EnsureCDPConnected, ExecuteCDPCommand, LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：通过 Chrome DevTools Protocol (CDP) 执行浏览器操作，包括标签页管理、JavaScript 执行、元素截图、网络/控制台日志收集等功能，响应来自 WebSocket 的 CDP 命令请求
 *
 * 实现方式：使用消息类型到处理函数的映射表（mapTypeToFunction），根据消息类型分发到对应的处理方法，通过 ExecuteCDPCommand 工具函数执行 CDP 命令，使用 Map 存储每个标签页的网络和控制台日志
 *
 * 注意事项：
 * - 每个标签页的日志存储在独立的 Map 中，键格式为 "network_{tabId}" 或 "console_{tabId}"
 * - 日志数量限制为 MAX_LOG_ENTRIES（10000 条），超过限制会自动删除最旧的日志
 * - CDP 连接需要在执行命令前通过 EnsureCDPConnected() 确保已建立
 * - 某些操作需要先启用相应的 CDP 域（如 DOM.enable、Network.enable 等）
 * - 日志收集是持续性的，需要调用 close 方法才能停止收集
 *
 * 相关代码：src/utils/index.ts - ExecuteCDPCommand() 和 EnsureCDPConnected() 函数（CDP 操作工具），src/types/cdp.ts - CDP 消息和结果类型定义，src/entrypoints/background.ts - 注册 CDP 消息处理器
 */
export class CdpExecutor {
    private consoleLogs: Map<string, any> = new Map();
    private networkLogs: Map<string, any> = new Map();
    private readonly MAX_LOG_ENTRIES = 10000; // 每个标签页最多保存的日志条目数

    private mapTypeToFunction: { [key: string]: (data: any) => Promise<void> } = {};

    private sendResult: ((result: CdpResult) => void) | undefined;

    constructor() {
        // 初始化类型到函数的映射，使用箭头函数确保 this 绑定正确
        this.mapTypeToFunction = {
            'cdp_connect': (data: any) => this.handleCdpConnect(data),
            'cdp_disconnect': (data: any) => this.handleCdpDisconnect(data),
            'list_targets': (data: any) => this.handleListTargets(data),
            'execute_javascript': (data: any) => this.handleExecuteJavaScript(data),
            'take_element_screenshot': (data: any) => this.handleTakeElementScreenshot(data),
            'send_command': (data: any) => this.handleSendCommand(data),
            'grep_source': (data: any) => this.handleGrepSource(data),
            'get_network_logs': (data: any) => this.handleGetNetworkLogs(data),
            'get_console_logs': (data: any) => this.handleGetConsoleLogs(data),
            'init_network_logs': (data: any) => this.handleInitNetworkLogs(data),
            'init_console_logs': (data: any) => this.handleInitConsoleLogs(data),
            'close_network_logs': (data: any) => this.handleCloseNetworkLogs(data),
            'close_console_logs': (data: any) => this.handleCloseConsoleLogs(data),
            'create_tab_and_navigate': (data: any) => this.handleCreateTabAndNavigate(data),
            'update_node_name': (data: any) => this.handleUpdateNodeName(data),
            'close_tab': (data: any) => this.handleCloseTab(data),
        };
    }

    /**
     * 业务逻辑：设置 CDP 执行结果的回调函数，用于将 CDP 命令的执行结果发送到外部（如 WebSocket 服务器）
     *
     * 实现方式：将回调函数保存到私有属性 sendResult 中，在各个处理方法中通过此回调发送结果
     *
     * 注意事项：
     * - 必须在处理 CDP 消息前设置此回调，否则结果无法发送
     * - 每个处理方法执行完成后会通过此回调发送结果
     * - 如果未设置回调，结果仍会生成但不会发送
     *
     * @param sendResult - 发送 CDP 结果的函数，接收 CdpResult 类型参数
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleMessage() 方法（调用此回调），src/entrypoints/background.ts - 设置 WebSocket 发送回调
     */
    public setSendResult(sendResult: (result: CdpResult) => void): void {
        this.sendResult = sendResult;
    }

    /**
     * 业务逻辑：统一处理来自 WebSocket 的 CDP 消息，根据消息类型分发到对应的处理方法，实现 CDP 命令的统一入口
     *
     * 实现方式：使用 mapTypeToFunction 映射表查找对应的处理方法，如果找到则调用处理，如果未找到或处理出错则返回错误结果
     *
     * 注意事项：
     * - 消息类型必须在 mapTypeToFunction 中注册，否则返回 "handler not found" 错误
     * - 处理方法中的异常会被捕获并转换为错误结果返回
     * - 所有结果都会通过 sendResult 回调发送
     *
     * @param cdpMessage - WebSocket CDP 消息，必须包含 type 和 id 字段
     *
     * 相关代码：src/executor/CdpExecutor.ts - constructor() 方法（初始化映射表），src/types/cdp.ts - CdpMessage 接口（消息类型定义）
     */
    public async handleMessage(cdpMessage: CdpMessage): Promise<void> {
        let defaultResult: CdpResult | undefined;

        const handler = this.mapTypeToFunction[cdpMessage.type];

        if (handler) {
            try {
                await handler(cdpMessage);
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                defaultResult = { type: cdpMessage.type, id: cdpMessage.id, success: false, error: errorMessage } as CdpResult;
                OutputLogToFile(`[CdpExecutor] handle message error: ${errorMessage}`, { level: LogLevel.ERROR });
            }
        } else {
            const errorMessage = `handler not found: ${cdpMessage.type}`;
            defaultResult = { type: cdpMessage.type, id: cdpMessage.id, success: false, error: errorMessage } as CdpResult;
            OutputLogToFile(`[CdpExecutor] handler not found: ${errorMessage}`, { level: LogLevel.ERROR });
        }

        if (defaultResult) {
            this.sendResult?.(defaultResult as CdpResult);
        }
    }

    /**
     * 业务逻辑：建立与指定标签页的 CDP 连接，为后续的 CDP 命令执行做准备
     *
     * 实现方式：调用 EnsureCDPConnected() 工具函数建立 CDP 连接，连接成功后返回标签页 ID
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - CDP 连接是后续所有 CDP 操作的前提条件
     * - 如果标签页不存在或无法连接，会抛出异常
     *
     * 相关代码：src/utils/index.ts - EnsureCDPConnected() 函数（建立 CDP 连接）
     */
    private async handleCdpConnect(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpConnectMessage = cdpMessage as CdpConnectMessage;
        let defaultResult: CdpConnectResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in cdp_connect');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in cdp_connect');
        }

        await EnsureCDPConnected(msg.data.tabId);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId } } as CdpConnectResult;
        OutputLogToFile(`[CdpExecutor] CDP connected successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpConnectResult);
    }

    /**
     * 业务逻辑：断开与指定标签页的 CDP 连接，释放资源并停止 CDP 事件监听
     *
     * 实现方式：调用 DisconnectCDP() 工具函数断开 CDP 连接
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 断开连接后无法再执行 CDP 命令，需要重新连接
     * - 如果 CDP 未连接，断开操作不会抛出异常
     *
     * 相关代码：src/utils/index.ts - DisconnectCDP() 函数（断开 CDP 连接）
     */
    private async handleCdpDisconnect(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpDisconnectMessage = cdpMessage as CdpDisconnectMessage;
        let defaultResult: CdpDisconnectResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in cdp_disconnect');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in cdp_disconnect');
        }

        await DisconnectCDP(msg.data.tabId);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId } } as CdpDisconnectResult;
        OutputLogToFile(`[CdpExecutor] CDP disconnected successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpDisconnectResult);
    }

    /**
     * 业务逻辑：列出浏览器中所有打开的标签页，返回标签页的基本信息（ID、索引、URL），用于查询和管理标签页
     *
     * 实现方式：使用 browser.tabs.query() API 获取所有标签页，转换为统一的 TabInfo 格式返回
     *
     * 注意事项：
     * - 返回的标签页信息包括 tabId、tabIndex 和 url
     * - 如果标签页 URL 未加载完成，会使用 pendingUrl 或 'about:blank' 作为默认值
     * - 标签页索引从 0 开始
     *
     * 相关代码：src/types/cdp.ts - CdpListTargetsResult 接口（返回类型定义）
     */
    private async handleListTargets(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpListTargetsMessage = cdpMessage as CdpListTargetsMessage;
        let defaultResult: CdpListTargetsResult | undefined;

        // 使用 browser.tabs.query 获取所有标签页
        const browserTabs = await browser.tabs.query({});

        // 将浏览器标签页信息转换为 TabInfo 格式
        const tabs: { tabId: number; tabIndex: number; url: string }[] = browserTabs.map((tab) => ({
            tabId: tab.id || 0,
            tabIndex: tab.index || 0,
            url: tab.url || tab.pendingUrl || 'about:blank'
        }));

        defaultResult = { type: msg.type, id: msg.id, success: true, data: tabs } as CdpListTargetsResult;
        OutputLogToFile(`[CdpExecutor] Listed targets successfully, count: ${tabs.length}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpListTargetsResult);
    }

    /**
     * 业务逻辑：创建新标签页或新窗口并导航到指定 URL，等待页面加载完成后返回标签页信息，用于自动化任务中的页面导航
     *
     * 实现方式：
     * 1. 根据 newWindow 参数决定创建标签页（browser.tabs.create）或新窗口（browser.windows.create）
     * 2. 创建时指定 URL，浏览器会自动导航
     * 3. 等待标签页加载完成（通过 waitForTabLoadComplete）
     * 4. 返回标签页信息（tabId、tabIndex、url）
     *
     * 注意事项：
     * - url 必须存在且为字符串类型，否则抛出异常
     * - newWindow 为 true 时创建新窗口，false 时创建新标签页
     * - active 参数控制是否激活新标签页/窗口，默认为 true
     * - 会等待页面加载完成（最多 30 秒），超时后仍会返回但页面可能未完全加载
     *
     * 相关代码：src/executor/CdpExecutor.ts - waitForTabLoadComplete() 方法（等待加载完成）
     */
    private async handleCreateTabAndNavigate(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpCreateTabAndNavigateMessage = cdpMessage as CdpCreateTabAndNavigateMessage;
        let defaultResult: CdpCreateTabAndNavigateResult | undefined;

        var tabId = -1;

        if (msg.data === undefined) {
            throw new Error('data is undefined in create_tab_and_navigate');
        }

        if (!msg.data.url || typeof msg.data.url !== 'string') {
            throw new Error('url is required and must be a string in create_tab_and_navigate');
        }

        if (msg.data.newWindow === undefined || msg.data.newWindow === false) {
            // 创建新标签页（创建时指定 URL，浏览器会自动导航）
            const newTab = await browser.tabs.create({
                url: msg.data.url,
                active: msg.data.active !== undefined ? msg.data.active : true
            });

            if (!newTab.id) {
                throw new Error('failed to create new tab');
            }

            tabId = newTab.id;
        } else {
            const newWindow = await browser.windows.create({
                url: msg.data.url,
                type: 'normal',
                state: 'normal',
                focused: msg.data.active !== undefined ? msg.data.active : true
            });

            if (!newWindow?.tabs?.[0]?.id) {
                throw new Error('failed to create new window');
            }

            tabId = newWindow.tabs[0].id;
        }

        // 等待 tabId 标签页完成加载
        await this.waitForTabLoadComplete(tabId);

        // 获取标签页信息
        const tab = await browser.tabs.get(tabId);

        defaultResult = {
            type: msg.type,
            id: msg.id,
            success: true,
            data: {
                tabId: tabId,
                tabIndex: tab.index || 0,
                url: tab.url || tab.pendingUrl || msg.data.url
            }
        } as CdpCreateTabAndNavigateResult;

        OutputLogToFile(`[CdpExecutor] Created tab and navigated successfully, tabId: ${tabId}, url: ${msg.data.url}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpCreateTabAndNavigateResult);
    }

    /**
     * 业务逻辑：在指定标签页中执行 JavaScript 代码，返回执行结果或异常信息，用于动态操作页面或获取页面数据
     *
     * 实现方式：
     * 1. 启用 Runtime 域（Runtime.enable）
     * 2. 调用 Runtime.evaluate CDP 命令执行 JavaScript 代码
     * 3. 返回执行结果（result）和异常信息（exceptionDetails）
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - params 必须为对象类型，包含 expression（代码字符串）等参数
     * - 执行结果可能包含返回值、异常信息或 undefined
     * - JavaScript 代码在页面上下文中执行，可以访问页面的全局对象和 DOM
     *
     * 相关代码：src/types/cdp.ts - CdpExecuteJavaScriptResult 接口（返回类型定义），CDP Runtime.evaluate 文档
     */
    private async handleExecuteJavaScript(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpExecuteJavaScriptMessage = cdpMessage as CdpExecuteJavaScriptMessage;
        let defaultResult: CdpExecuteJavaScriptResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in execute_javascript');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in execute_javascript');
        }

        if (!msg.data.params || typeof msg.data.params !== 'object') {
            throw new Error('params is required and must be a object in execute_javascript');
        }

        // 启用 Runtime 域
        await ExecuteCDPCommand(msg.data.tabId, 'Runtime.enable');

        // 执行 JavaScript 代码
        const evalResult = await ExecuteCDPCommand(msg.data.tabId, 'Runtime.evaluate', msg.data.params);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { result: evalResult?.result, exceptionDetails: evalResult?.exceptionDetails } } as CdpExecuteJavaScriptResult;
        OutputLogToFile(`[CdpExecutor] Executed JavaScript successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpExecuteJavaScriptResult);
    }

    /**
     * 业务逻辑：截取页面中指定元素的截图，返回 base64 编码的 PNG 图片，用于元素可视化验证或文档生成
     *
     * 实现方式：
     * 1. 启用 DOM 域和 Page 域
     * 2. 获取文档根节点
     * 3. 根据选择器类型（CSS、ID、XPath）查找元素节点
     * 4. 滚动元素到可视区
     * 5. 获取元素的盒模型（位置和尺寸）
     * 6. 计算元素在文档中的绝对坐标
     * 7. 使用 Page.captureScreenshot 截取元素区域
     * 8. 返回 base64 编码的图片和元素位置信息
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - selector 必须存在且为字符串类型，否则抛出异常
     * - selectorType 支持 'css'、'id'、'xpath' 三种类型，默认为 'css'
     * - 如果元素未找到，会抛出异常
     * - 截图格式固定为 PNG，返回 base64 编码字符串
     * - 元素必须可见才能截图，隐藏元素可能无法正确截图
     *
     * 相关代码：src/types/cdp.ts - CdpTakeElementScreenshotResult 接口（返回类型定义），CDP DOM 和 Page 域文档
     */
    private async handleTakeElementScreenshot(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpTakeElementScreenshotMessage = cdpMessage as CdpTakeElementScreenshotMessage;
        let defaultResult: CdpTakeElementScreenshotResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in take_element_screenshot');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in take_element_screenshot');
        }

        if (!msg.data.selector || typeof msg.data.selector !== 'string') {
            throw new Error('selector is required and must be a string in take_element_screenshot');
        }

        // 确保 CDP 连接
        await EnsureCDPConnected(msg.data.tabId);

        // 步骤1: 启用 DOM 域和 Page 域
        await ExecuteCDPCommand(msg.data.tabId, 'DOM.enable');
        await ExecuteCDPCommand(msg.data.tabId, 'Page.enable');

        // 步骤2: 获取文档根节点
        const documentResult = await ExecuteCDPCommand(msg.data.tabId, 'DOM.getDocument', {
            depth: -1,
            pierce: false
        });

        if (!documentResult?.root?.nodeId) {
            throw new Error('failed to get document root node in take_element_screenshot');
        }

        const rootNodeId = documentResult.root.nodeId;

        // 步骤3: 通过选择器查找元素
        let nodeId: number | undefined;

        if (msg.data.selectorType === 'xpath') {
            const searchResult = await ExecuteCDPCommand(msg.data.tabId, 'DOM.performSearch', {
                query: msg.data.selector,
                includeUserAgentShadowDOM: false
            });

            if (searchResult?.searchId) {
                const searchResults = await ExecuteCDPCommand(msg.data.tabId, 'DOM.getSearchResults', {
                    searchId: searchResult.searchId,
                    fromIndex: 0,
                    toIndex: 1
                });

                if (searchResults?.nodeIds && searchResults.nodeIds.length > 0) {
                    nodeId = searchResults.nodeIds[0];
                }
            }
        } else {
            const cssSelector = msg.data.selectorType === 'id' ? `#${msg.data.selector}` : msg.data.selector;
            const queryResult = await ExecuteCDPCommand(msg.data.tabId, 'DOM.querySelector', {
                nodeId: rootNodeId,
                selector: cssSelector
            });
            nodeId = queryResult?.nodeId;
        }

        if (!nodeId) {
            throw new Error(`element not found: ${msg.data.selector}`);
        }

        // 步骤4: 滚动元素到可视区
        await ExecuteCDPCommand(msg.data.tabId, 'DOM.scrollIntoViewIfNeeded', {
            nodeId: nodeId
        });

        // 等待滚动完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 步骤5: 获取元素盒模型（位置和尺寸）
        const boxModel = await ExecuteCDPCommand(msg.data.tabId, 'DOM.getBoxModel', {
            nodeId: nodeId
        });

        if (!boxModel?.model) {
            throw new Error('failed to get element box model in take_element_screenshot');
        }

        // 步骤6: 获取页面布局信息（获取滚动偏移量）
        const layoutMetrics = await ExecuteCDPCommand(msg.data.tabId, 'Page.getLayoutMetrics');

        // 步骤7: 计算元素在文档中的绝对坐标
        const contentQuad = boxModel.model.content;
        const x = Math.min(contentQuad[0], contentQuad[2], contentQuad[4], contentQuad[6]);
        const y = Math.min(contentQuad[1], contentQuad[3], contentQuad[5], contentQuad[7]);
        const width = Math.max(contentQuad[0], contentQuad[2], contentQuad[4], contentQuad[6]) - x;
        const height = Math.max(contentQuad[1], contentQuad[3], contentQuad[5], contentQuad[7]) - y;

        // 步骤8: 截取元素截图
        const screenshotResult = await ExecuteCDPCommand(msg.data.tabId, 'Page.captureScreenshot', {
            format: 'png',
            clip: {
                x: x,
                y: y,
                width: width,
                height: height,
                scale: 1
            }
        });

        // 步骤9: 截图已经是 base64 编码
        const base64Image = screenshotResult?.data || '';

        // 步骤10: 返回截图结果
        defaultResult = { type: msg.type, id: msg.id, success: true, data: { image: base64Image, format: 'png', x: x, y: y, width: width, height: height } } as CdpTakeElementScreenshotResult;
        OutputLogToFile(`[CdpExecutor] Element screenshot taken successfully, tabId: ${msg.data.tabId}, selector: ${msg.data.selector}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpTakeElementScreenshotResult);
    }

    /**
     * 业务逻辑：执行自定义 CDP 命令，提供通用的 CDP 命令执行接口，支持所有 CDP 域的命令
     *
     * 实现方式：调用 ExecuteCDPCommand() 工具函数执行指定的 CDP 方法和参数，返回原始 CDP 响应
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - method 必须存在且为字符串类型，格式为 "Domain.method"（如 "DOM.querySelector"）
     * - params 为可选参数对象，某些 CDP 命令不需要参数
     * - 返回的是 CDP 的原始响应，结构取决于具体的 CDP 命令
     * - 执行前会确保 CDP 连接已建立
     *
     * 相关代码：src/utils/index.ts - ExecuteCDPCommand() 函数（执行 CDP 命令），CDP 协议文档
     */
    private async handleSendCommand(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpSendCommandMessage = cdpMessage as CdpSendCommandMessage;
        let defaultResult: CdpSendCommandResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in send_command');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in send_command');
        }

        if (!msg.data.method || typeof msg.data.method !== 'string') {
            throw new Error('method is required and must be a string in send_command');
        }

        // 确保 CDP 连接
        await EnsureCDPConnected(msg.data.tabId);

        // 执行 CDP 命令（params 可以为 undefined，因为某些 CDP 命令不需要参数）
        const result = await ExecuteCDPCommand(msg.data.tabId, msg.data.method, msg.data.params);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: result } as CdpSendCommandResult;
        OutputLogToFile(`[CdpExecutor] CDP command executed successfully, tabId: ${msg.data.tabId}, method: ${msg.data.method}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpSendCommandResult);
    }

    /**
     * 业务逻辑：在页面资源中搜索匹配指定模式的内容，返回匹配的行号和内容，用于页面源码分析和调试
     *
     * 实现方式：
     * 1. 启用 Page 域并获取页面资源树
     * 2. 递归遍历所有资源（包括子框架）
     * 3. 获取每个资源的内容（支持 base64 解码）
     * 4. 使用正则表达式在每行中搜索匹配模式
     * 5. 收集匹配的行号、URL 和内容片段
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - pattern 必须存在且为字符串类型，作为正则表达式使用
     * - caseSensitive 控制是否区分大小写，默认为 false
     * - 某些资源可能无法获取内容（如跨域资源），会跳过并记录警告
     * - 匹配的内容片段限制为 200 字符
     * - base64 编码的资源会自动解码
     *
     * 相关代码：src/types/cdp.ts - CdpGrepSourceResult 接口（返回类型定义），CDP Page.getResourceContent 文档
     */
    private async handleGrepSource(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpGrepSourceMessage = cdpMessage as CdpGrepSourceMessage;
        let defaultResult: CdpGrepSourceResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in grep_source');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in grep_source');
        }

        if (!msg.data.pattern || typeof msg.data.pattern !== 'string') {
            throw new Error('pattern is required and must be a string in grep_source');
        }

        // 保存已验证的数据引用，避免 TypeScript 类型检查问题
        const data = msg.data;
        const tabId = data.tabId;
        const pattern = data.pattern;
        const caseSensitive = data.caseSensitive;

        // 确保 CDP 连接
        await EnsureCDPConnected(tabId);

        // 启用 Page 域以获取页面源码
        await ExecuteCDPCommand(tabId, 'Page.enable');

        // 获取页面资源树
        const resourceTree = await ExecuteCDPCommand(tabId, 'Page.getResourceTree');

        if (!resourceTree?.frameTree) {
            throw new Error('failed to get page resource tree in grep_source');
        }

        const matches: Array<{ url: string; line: number; content: string }> = [];
        const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

        // 递归遍历资源树并获取资源内容
        const searchInResourceTree = async (frameTree: any): Promise<void> => {
            // 搜索当前框架的资源
            if (frameTree?.resources) {
                for (const resource of frameTree.resources) {
                    try {
                        // 使用 Page.getResourceContent 获取资源内容
                        const contentResult = await ExecuteCDPCommand(tabId, 'Page.getResourceContent', {
                            frameId: frameTree.frame.id,
                            url: resource.url
                        });

                        if (contentResult?.content) {
                            let content: string;
                            if (contentResult.base64Encoded) {
                                // 在浏览器环境中解码 base64
                                try {
                                    content = atob(contentResult.content);
                                } catch (error) {
                                    // base64 解码失败，跳过此资源
                                    continue;
                                }
                            } else {
                                content = contentResult.content;
                            }

                            const lines = content.split('\n');
                            lines.forEach((line: string, index: number) => {
                                // 使用 match() 而不是 test()，避免正则表达式的 lastIndex 问题
                                // 或者重置 lastIndex（对于全局正则表达式）
                                regex.lastIndex = 0;
                                if (regex.test(line)) {
                                    matches.push({
                                        url: resource.url,
                                        line: index + 1,
                                        content: line.trim().substring(0, 200)
                                    });
                                }
                            });
                        }
                    } catch (error) {
                        // 某些资源可能无法获取内容，忽略错误继续
                        // 注意：msg.data 在这里已经验证过，不会是 undefined
                        OutputLogToFile(`[CdpExecutor] some resources may not be able to get content, ignore errors and continue: ${resource.url} - ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
                    }
                }
            }

            // 递归搜索子框架
            if (frameTree?.childFrames) {
                for (const childFrame of frameTree.childFrames) {
                    await searchInResourceTree(childFrame);
                }
            }
        };

        // 搜索主框架
        await searchInResourceTree(resourceTree.frameTree);

        // 返回结果
        defaultResult = { type: msg.type, id: msg.id, success: true, data: { matches: matches, pattern: pattern, count: matches.length } } as CdpGrepSourceResult;
        OutputLogToFile(`[CdpExecutor] Source code search completed successfully, tabId: ${tabId}, pattern: ${pattern}, matches: ${matches.length}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpGrepSourceResult);
    }

    /**
     * 业务逻辑：获取指定标签页的网络请求日志，支持过滤、分页、分组等功能，用于网络请求分析和调试
     *
     * 实现方式：
     * 1. 从 networkLogs Map 中获取该标签页的日志
     * 2. 根据 requestId 或 filter 条件过滤日志
     * 3. 可选按请求 ID 分组（groupByRequest）
     * 4. 应用分页（limit 和 offset）
     * 5. 如果 clear 为 true，清空日志后返回
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 如果 clear 为 true，返回当前日志后清空，total 返回 0
     * - requestId 和 filter 不能同时使用，requestId 优先级更高
     * - groupByRequest 会将同一请求的所有事件合并为一个对象
     * - 分页仅在未分组时生效
     * - total 表示清空前或当前存储的日志总数
     *
     * 相关代码：src/executor/CdpExecutor.ts - addNetworkLog() 方法（添加日志），src/executor/CdpExecutor.ts - filterNetworkLogs() 方法（过滤日志），src/types/cdp.ts - CdpGetNetworkLogsResult 接口（返回类型定义）
     */
    private async handleGetNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpGetNetworkLogsMessage = cdpMessage as CdpGetNetworkLogsMessage;
        let defaultResult: CdpGetNetworkLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in get_network_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in get_network_logs');
        }

        const logKey = `network_${msg.data.tabId}`;
        let logs = this.networkLogs.get(logKey) || [];
        const totalBeforeClear = logs.length;

        // 如果请求清空日志，先返回当前日志，然后清空
        if (msg.data?.clear) {
            this.networkLogs.delete(logKey);
        }

        // 如果指定了 requestId，只返回该请求的日志
        if (msg.data?.requestId) {
            logs = logs.filter((log: any) => log.requestId === msg.data?.requestId);
        } else if (msg.data?.filter) {
            // 应用过滤条件
            logs = this.filterNetworkLogs(logs, msg.data?.filter);
        }

        // 如果按请求分组，将同一 requestId 的日志合并
        if (msg.data?.groupByRequest && !msg.data?.requestId) {
            logs = this.groupNetworkLogsByRequest(logs);
        }

        // 应用分页
        if (msg.data?.limit !== undefined && !msg.data?.groupByRequest) {
            logs = logs.slice(msg.data?.offset || 0, (msg.data?.offset || 0) + (msg.data?.limit || 0));
        }

        // 计算总数：如果已清空，则为0；否则使用当前存储的日志数量
        const total = msg.data.clear ? 0 : (this.networkLogs.get(logKey)?.length || totalBeforeClear);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId, logs: logs, count: logs.length, total: total, grouped: msg.data.groupByRequest && !msg.data.requestId } } as CdpGetNetworkLogsResult;
        OutputLogToFile(`[CdpExecutor] Retrieved network logs successfully, tabId: ${msg.data.tabId}, returned: ${logs.length}, total: ${total}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpGetNetworkLogsResult);
    }

    /**
     * 业务逻辑：获取指定标签页的控制台日志，支持过滤和分页，用于页面 JavaScript 错误和日志分析
     *
     * 实现方式：
     * 1. 从 consoleLogs Map 中获取该标签页的日志
     * 2. 根据 filter 条件过滤日志（类型、级别、文本、时间范围）
     * 3. 应用分页（limit 和 offset）
     * 4. 如果 clear 为 true，清空日志后返回
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 如果 clear 为 true，返回当前日志后清空，total 返回 0
     * - filter 支持按类型（type）、级别（level）、文本（text）、时间范围（startTime、endTime）过滤
     * - 文本过滤会搜索日志参数（args）的 JSON 字符串表示
     * - total 表示清空前或当前存储的日志总数
     *
     * 相关代码：src/executor/CdpExecutor.ts - addConsoleLog() 方法（添加日志），src/executor/CdpExecutor.ts - filterConsoleLogs() 方法（过滤日志），src/types/cdp.ts - CdpGetConsoleLogsResult 接口（返回类型定义）
     */
    private async handleGetConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpGetConsoleLogsMessage = cdpMessage as CdpGetConsoleLogsMessage;
        let defaultResult: CdpGetConsoleLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in get_console_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in get_console_logs');
        }

        const logKey = `console_${msg.data.tabId}`;
        let logs = this.consoleLogs.get(logKey) || [];
        const totalBeforeClear = logs.length;

        // 如果请求清空日志，先返回当前日志，然后清空
        if (msg.data?.clear) {
            this.consoleLogs.delete(logKey);
        }

        // 应用过滤条件
        if (msg.data?.filter) {
            logs = this.filterConsoleLogs(logs, msg.data?.filter);
        }

        // 应用分页
        if (msg.data?.limit !== undefined) {
            logs = logs.slice(msg.data?.offset || 0, (msg.data?.offset || 0) + (msg.data?.limit || 0));
        }

        // 计算总数：如果已清空，则为0；否则使用当前存储的日志数量
        const total = msg.data.clear ? 0 : (this.consoleLogs.get(logKey)?.length || totalBeforeClear);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId, logs: logs, count: logs.length, total: total } } as CdpGetConsoleLogsResult;
        OutputLogToFile(`[CdpExecutor] Retrieved console logs successfully, tabId: ${msg.data.tabId}, returned: ${logs.length}, total: ${total}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpGetConsoleLogsResult);
    }

    /**
     * 业务逻辑：初始化网络日志收集，启用 Network 域开始监听网络请求事件，用于持续监控页面的网络活动
     *
     * 实现方式：
     * 1. 确保 CDP 连接已建立
     * 2. 启用 Network 域（Network.enable），开始接收网络事件
     * 3. 如果 clear 为 true，清空该标签页的现有网络日志
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 启用后会持续收集网络日志，直到调用 close_network_logs
     * - 网络日志通过 CDP 事件监听器自动添加到 networkLogs Map 中
     * - 如果 clear 为 true，会先清空现有日志再开始收集
     * - CDP 连接会保持打开状态以持续接收事件
     *
     * 相关代码：src/executor/CdpExecutor.ts - addNetworkLog() 方法（添加日志），src/executor/CdpExecutor.ts - handleCloseNetworkLogs() 方法（停止收集），CDP Network 域文档
     */
    private async handleInitNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpInitNetworkLogsMessage = cdpMessage as CdpInitNetworkLogsMessage;
        let defaultResult: CdpInitNetworkLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in init_network_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in init_network_logs');
        }

        // 确保 CDP 连接
        await EnsureCDPConnected(msg.data.tabId);

        // 启用 Network 域以开始收集网络日志
        await ExecuteCDPCommand(msg.data.tabId, 'Network.enable');

        // 如果请求清空日志，则清空该标签页的网络日志
        if (msg.data?.clear) {
            this.clearNetworkLogs(msg.data.tabId);
        }

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId, message: 'Network logs collection enabled' } } as CdpInitNetworkLogsResult;
        OutputLogToFile(`[CdpExecutor] Network log collection initialized successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpInitNetworkLogsResult);

        // 注意：不断开连接，以便持续收集日志
    }

    /**
     * 业务逻辑：初始化控制台日志收集，启用 Runtime 域开始监听控制台 API 调用事件，用于持续监控页面的 JavaScript 日志和错误
     *
     * 实现方式：
     * 1. 确保 CDP 连接已建立
     * 2. 启用 Runtime 域（Runtime.enable），开始接收控制台事件（通过 Runtime.consoleAPICalled 事件）
     * 3. 如果 clear 为 true，清空该标签页的现有控制台日志
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 启用后会持续收集控制台日志，直到调用 close_console_logs
     * - 控制台日志通过 CDP 事件监听器自动添加到 consoleLogs Map 中
     * - 如果 clear 为 true，会先清空现有日志再开始收集
     * - CDP 连接会保持打开状态以持续接收事件
     *
     * 相关代码：src/executor/CdpExecutor.ts - addConsoleLog() 方法（添加日志），src/executor/CdpExecutor.ts - handleCloseConsoleLogs() 方法（停止收集），CDP Runtime 域文档
     */
    private async handleInitConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpInitConsoleLogsMessage = cdpMessage as CdpInitConsoleLogsMessage;
        let defaultResult: CdpInitConsoleLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in init_console_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in init_console_logs');
        }

        // 确保 CDP 连接
        await EnsureCDPConnected(msg.data.tabId);

        // 启用 Runtime 域以开始收集控制台日志（控制台日志通过 Runtime.consoleAPICalled 事件收集）
        await ExecuteCDPCommand(msg.data.tabId, 'Runtime.enable');

        // 如果请求清空日志，则清空该标签页的控制台日志
        if (msg.data?.clear) {
            this.clearConsoleLogs(msg.data.tabId);
        }

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId, message: 'Console logs collection enabled' } } as CdpInitConsoleLogsResult;
        OutputLogToFile(`[CdpExecutor] Console log collection initialized successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpInitConsoleLogsResult);

        // 注意：不断开连接，以便持续收集日志
    }

    /**
     * 业务逻辑：停止网络日志收集，禁用 Network 域停止监听网络请求事件，释放资源并停止日志收集
     *
     * 实现方式：
     * 1. 确保 CDP 连接已建立
     * 2. 禁用 Network 域（Network.disable），停止接收网络事件
     * 3. 如果 clear 为 true，清空该标签页的网络日志
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 禁用后会停止收集新的网络日志，但已收集的日志会保留（除非 clear 为 true）
     * - 如果 clear 为 true，会清空所有已收集的网络日志
     * - 停止收集后可以重新调用 init_network_logs 恢复收集
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleInitNetworkLogs() 方法（开始收集），src/executor/CdpExecutor.ts - clearNetworkLogs() 方法（清空日志）
     */
    private async handleCloseNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpCloseNetworkLogsMessage = cdpMessage as CdpCloseNetworkLogsMessage;
        let defaultResult: CdpCloseNetworkLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in close_network_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in close_network_logs');
        }

        // 确保 CDP 连接
        await EnsureCDPConnected(msg.data.tabId);

        // 禁用 Network 域以停止收集网络日志
        await ExecuteCDPCommand(msg.data.tabId, 'Network.disable');

        // 如果请求清空日志，则清空该标签页的网络日志
        if (msg.data?.clear) {
            this.clearNetworkLogs(msg.data.tabId);
        }

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId, message: 'Network logs collection disabled' } } as CdpCloseNetworkLogsResult;
        OutputLogToFile(`[CdpExecutor] Network log collection closed successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpCloseNetworkLogsResult);
    }

    /**
     * 业务逻辑：停止控制台日志收集，禁用 Runtime 域停止监听控制台 API 调用事件，释放资源并停止日志收集
     *
     * 实现方式：
     * 1. 确保 CDP 连接已建立
     * 2. 禁用 Runtime 域（Runtime.disable），停止接收控制台事件
     * 3. 如果 clear 为 true，清空该标签页的控制台日志
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - 禁用后会停止收集新的控制台日志，但已收集的日志会保留（除非 clear 为 true）
     * - 如果 clear 为 true，会清空所有已收集的控制台日志
     * - 停止收集后可以重新调用 init_console_logs 恢复收集
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleInitConsoleLogs() 方法（开始收集），src/executor/CdpExecutor.ts - clearConsoleLogs() 方法（清空日志）
     */
    private async handleCloseConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpCloseConsoleLogsMessage = cdpMessage as CdpCloseConsoleLogsMessage;
        let defaultResult: CdpCloseConsoleLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in close_console_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in close_console_logs');
        }

        // 确保 CDP 连接
        await EnsureCDPConnected(msg.data.tabId);

        // 禁用 Runtime 域以停止收集控制台日志
        await ExecuteCDPCommand(msg.data.tabId, 'Runtime.disable');

        // 如果请求清空日志，则清空该标签页的控制台日志
        if (msg.data?.clear) {
            this.clearConsoleLogs(msg.data.tabId);
        }

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId, message: 'Console logs collection disabled' } } as CdpCloseConsoleLogsResult;
        OutputLogToFile(`[CdpExecutor] Console log collection closed successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpCloseConsoleLogsResult);
    }

    /**
     * 业务逻辑：添加控制台日志到指定标签页的日志集合中，由 CDP 事件监听器调用，用于收集页面的 JavaScript 日志和错误
     *
     * 实现方式：
     * 1. 使用 "console_{tabId}" 作为键从 consoleLogs Map 中获取或创建日志数组
     * 2. 处理时间戳（CDP 时间戳转换为毫秒时间戳）
     * 3. 添加收集时间（collectedAt）
     * 4. 将日志条目添加到数组末尾
     * 5. 如果日志数量超过 MAX_LOG_ENTRIES，删除最旧的日志
     *
     * 注意事项：
     * - tabId 用于标识日志所属的标签页
     * - logEntry 应包含 CDP Runtime.consoleAPICalled 事件的数据
     * - 时间戳会自动处理：CDP 时间戳（秒）转换为毫秒时间戳，或使用当前时间
     * - 日志数量限制为 MAX_LOG_ENTRIES（10000 条），超过会自动删除最旧的
     * - 此方法由 CDP 事件监听器调用，不应手动调用
     *
     * @param tabId - 标签页 ID
     * @param logEntry - 日志条目，包含日志类型、参数、时间戳等信息
     *
     * 相关代码：src/entrypoints/background.ts - CDP 事件监听器（调用此方法），src/executor/CdpExecutor.ts - handleGetConsoleLogs() 方法（获取日志）
     */
    public addConsoleLog(tabId: number, logEntry: any): void {
        const logKey = `console_${tabId}`;

        if (!this.consoleLogs.has(logKey)) {
            this.consoleLogs.set(logKey, []);
        }
        const logs = this.consoleLogs.get(logKey)!;

        // 优先使用 CDP 提供的时间戳，如果没有则使用当前时间
        // CDP 的 timestamp 是相对于页面加载时间的（单位：秒），需要转换为毫秒时间戳
        let timestamp = Date.now();
        if (logEntry.timestamp !== undefined) {
            // CDP timestamp 是相对于页面加载的时间（秒），转换为毫秒
            // 这里我们直接使用，因为 CDP 可能已经提供了绝对时间戳
            timestamp = typeof logEntry.timestamp === 'number'
                ? (logEntry.timestamp > 1000000000000 ? logEntry.timestamp : logEntry.timestamp * 1000)
                : Date.now();
        }

        logs.push({
            ...logEntry,
            timestamp: timestamp,
            collectedAt: Date.now() // 添加收集时间
        });

        // 限制日志数量，防止内存溢出
        if (logs.length > this.MAX_LOG_ENTRIES) {
            logs.shift(); // 移除最旧的日志
        }
    }

    /**
     * 业务逻辑：添加网络日志到指定标签页的日志集合中，由 CDP 事件监听器调用，用于收集页面的网络请求和响应信息
     *
     * 实现方式：
     * 1. 使用 "network_{tabId}" 作为键从 networkLogs Map 中获取或创建日志数组
     * 2. 处理时间戳（CDP 时间戳转换为毫秒时间戳）
     * 3. 添加收集时间（collectedAt）
     * 4. 将日志条目添加到数组末尾
     * 5. 如果日志数量超过 MAX_LOG_ENTRIES，删除最旧的日志
     *
     * 注意事项：
     * - tabId 用于标识日志所属的标签页
     * - logEntry 应包含 CDP Network 域事件的数据（如 requestWillBeSent、responseReceived 等）
     * - 时间戳会自动处理：CDP 时间戳（秒）转换为毫秒时间戳，或使用当前时间
     * - 日志数量限制为 MAX_LOG_ENTRIES（10000 条），超过会自动删除最旧的
     * - 此方法由 CDP 事件监听器调用，不应手动调用
     *
     * @param tabId - 标签页 ID
     * @param logEntry - 日志条目，包含请求/响应信息、事件类型、时间戳等
     *
     * 相关代码：src/entrypoints/background.ts - CDP 事件监听器（调用此方法），src/executor/CdpExecutor.ts - handleGetNetworkLogs() 方法（获取日志）
     */
    public addNetworkLog(tabId: number, logEntry: any): void {
        const logKey = `network_${tabId}`;

        if (!this.networkLogs.has(logKey)) {
            this.networkLogs.set(logKey, []);
        }

        const logs = this.networkLogs.get(logKey)!;

        // 优先使用 CDP 提供的时间戳，如果没有则使用当前时间
        // CDP 的 timestamp 是相对于页面加载时间的（单位：秒），需要转换为毫秒时间戳
        let timestamp = Date.now();
        if (logEntry.timestamp !== undefined) {
            // CDP timestamp 是相对于页面加载的时间（秒），转换为毫秒
            // 这里我们直接使用，因为 CDP 可能已经提供了绝对时间戳
            timestamp = typeof logEntry.timestamp === 'number'
                ? (logEntry.timestamp > 1000000000000 ? logEntry.timestamp : logEntry.timestamp * 1000)
                : Date.now();
        }

        logs.push({
            ...logEntry,
            timestamp: timestamp,
            collectedAt: Date.now() // 添加收集时间
        });

        // 限制日志数量，防止内存溢出
        if (logs.length > this.MAX_LOG_ENTRIES) {
            logs.shift(); // 移除最旧的日志
        }
    }

    /**
     * 业务逻辑：清空指定标签页的所有控制台日志，释放内存并重置日志状态
     *
     * 实现方式：从 consoleLogs Map 中删除该标签页的日志条目
     *
     * 注意事项：
     * - 清空后无法恢复日志，操作不可逆
     * - 如果标签页没有日志，操作不会报错
     * - 清空后新的日志仍会正常收集
     *
     * @param tabId - 标签页 ID
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleCloseConsoleLogs() 方法（停止收集时调用），src/executor/CdpExecutor.ts - handleInitConsoleLogs() 方法（初始化时可选清空）
     */
    public clearConsoleLogs(tabId: number): void {
        const logKey = `console_${tabId}`;
        this.consoleLogs.delete(logKey);
    }

    /**
     * 业务逻辑：清空指定标签页的所有网络日志，释放内存并重置日志状态
     *
     * 实现方式：从 networkLogs Map 中删除该标签页的日志条目
     *
     * 注意事项：
     * - 清空后无法恢复日志，操作不可逆
     * - 如果标签页没有日志，操作不会报错
     * - 清空后新的日志仍会正常收集
     *
     * @param tabId - 标签页 ID
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleCloseNetworkLogs() 方法（停止收集时调用），src/executor/CdpExecutor.ts - handleInitNetworkLogs() 方法（初始化时可选清空）
     */
    public clearNetworkLogs(tabId: number): void {
        const logKey = `network_${tabId}`;
        this.networkLogs.delete(logKey);
    }

    /**
     * 业务逻辑：根据过滤条件筛选网络日志，支持按事件类型、URL、请求方法、状态码、时间范围等条件过滤，用于精确查找特定的网络请求
     *
     * 实现方式：使用 Array.filter() 方法，根据 filter 对象的各个字段逐一检查日志条目，只有满足所有条件的日志才会被保留
     *
     * 注意事项：
     * - filter.event：按事件类型过滤（如 'requestWillBeSent'、'responseReceived'）
     * - filter.url：URL 包含指定字符串的日志会被保留（不区分大小写）
     * - filter.method：按 HTTP 请求方法过滤（不区分大小写）
     * - filter.statusCode：按 HTTP 状态码过滤（精确匹配）
     * - filter.startTime 和 filter.endTime：按时间范围过滤（时间戳，毫秒）
     * - 所有过滤条件都是可选的，未指定的条件不会应用过滤
     * - 多个条件之间是 AND 关系，必须全部满足
     *
     * @param logs - 要过滤的日志数组
     * @param filter - 过滤条件对象，包含 event、url、method、statusCode、startTime、endTime 等字段
     * @returns 过滤后的日志数组
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleGetNetworkLogs() 方法（使用此方法过滤日志）
     */
    private filterNetworkLogs(logs: any[], filter: any): any[] {
        return logs.filter(log => {
            // 按事件类型过滤
            if (filter.event && log.event !== filter.event) {
                return false;
            }

            // 按 URL 过滤
            if (filter.url) {
                const url = log.request?.url || log.response?.url || '';
                if (!url.includes(filter.url)) {
                    return false;
                }
            }

            // 按请求方法过滤
            if (filter.method) {
                const method = log.request?.method || '';
                if (method.toUpperCase() !== filter.method.toUpperCase()) {
                    return false;
                }
            }

            // 按状态码过滤
            if (filter.statusCode) {
                const statusCode = log.response?.status || 0;
                if (statusCode !== filter.statusCode) {
                    return false;
                }
            }

            // 按时间范围过滤
            if (filter.startTime && log.timestamp < filter.startTime) {
                return false;
            }
            if (filter.endTime && log.timestamp > filter.endTime) {
                return false;
            }

            return true;
        });
    }

    /**
     * 业务逻辑：根据过滤条件筛选控制台日志，支持按日志类型、级别、文本内容、时间范围等条件过滤，用于精确查找特定的控制台输出
     *
     * 实现方式：使用 Array.filter() 方法，根据 filter 对象的各个字段逐一检查日志条目，只有满足所有条件的日志才会被保留
     *
     * 注意事项：
     * - filter.type：按日志类型过滤（如 'log'、'error'、'warn'）
     * - filter.level：按日志级别过滤（不区分大小写），会与 log.type 比较
     * - filter.text：文本内容包含指定字符串的日志会被保留（不区分大小写），会搜索日志参数（args）的 JSON 字符串
     * - filter.startTime 和 filter.endTime：按时间范围过滤（时间戳，毫秒）
     * - 所有过滤条件都是可选的，未指定的条件不会应用过滤
     * - 多个条件之间是 AND 关系，必须全部满足
     *
     * @param logs - 要过滤的日志数组
     * @param filter - 过滤条件对象，包含 type、level、text、startTime、endTime 等字段
     * @returns 过滤后的日志数组
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleGetConsoleLogs() 方法（使用此方法过滤日志）
     */
    private filterConsoleLogs(logs: any[], filter: any): any[] {
        return logs.filter(log => {
            // 按日志类型过滤
            if (filter.type && log.type !== filter.type) {
                return false;
            }

            // 按日志级别过滤（log, warn, error, info, debug）
            if (filter.level) {
                const level = log.type?.toLowerCase() || '';
                if (level !== filter.level.toLowerCase()) {
                    return false;
                }
            }

            // 按文本内容过滤
            if (filter.text) {
                const text = JSON.stringify(log.args || []).toLowerCase();
                if (!text.includes(filter.text.toLowerCase())) {
                    return false;
                }
            }

            // 按时间范围过滤
            if (filter.startTime && log.timestamp < filter.startTime) {
                return false;
            }
            if (filter.endTime && log.timestamp > filter.endTime) {
                return false;
            }

            return true;
        });
    }

    /**
     * 业务逻辑：将网络日志按请求 ID 分组，将同一请求的所有事件（requestWillBeSent、responseReceived、loadingFinished 等）合并为一个对象，用于查看请求的完整生命周期
     *
     * 实现方式：
     * 1. 使用 Map 按 requestId 分组日志
     * 2. 为每个请求创建包含完整生命周期的对象结构
     * 3. 根据事件类型填充相应的字段（request、response、loadingFinished、loadingFailed 等）
     * 4. 将所有事件保存到 events 数组中
     * 5. 按开始时间排序后返回
     *
     * 注意事项：
     * - 没有 requestId 的日志会被忽略
     * - 每个分组对象包含：requestId、request、response、loadingFinished、loadingFailed、events、startTime、endTime 等字段
     * - events 数组包含该请求的所有原始事件日志
     * - 返回的数组按请求开始时间（startTime）排序
     * - 分组后的对象结构更便于分析请求的完整流程
     *
     * @param logs - 要分组的日志数组
     * @returns 分组后的日志数组，每个元素代表一个完整的网络请求
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleGetNetworkLogs() 方法（使用此方法分组日志）
     */
    private groupNetworkLogsByRequest(logs: any[]): any[] {
        const grouped = new Map<string, any>();

        logs.forEach(log => {
            const requestId = log.requestId;
            if (!requestId) return;

            if (!grouped.has(requestId)) {
                grouped.set(requestId, {
                    requestId: requestId,
                    request: null,
                    response: null,
                    loadingFinished: null,
                    loadingFailed: null,
                    events: [],
                    startTime: log.timestamp,
                    endTime: log.timestamp
                });
            }

            const group = grouped.get(requestId)!;

            // 根据事件类型填充相应的字段
            switch (log.event) {
                case 'requestWillBeSent':
                    group.request = log.request;
                    group.url = log.request?.url || '';
                    group.method = log.request?.method || '';
                    group.startTime = log.timestamp;
                    break;
                case 'responseReceived':
                    group.response = log.response;
                    group.statusCode = log.response?.status || 0;
                    group.statusText = log.response?.statusText || '';
                    break;
                case 'loadingFinished':
                    group.loadingFinished = log;
                    group.endTime = log.timestamp;
                    group.encodedDataLength = log.encodedDataLength;
                    break;
                case 'loadingFailed':
                    group.loadingFailed = log;
                    group.endTime = log.timestamp;
                    group.errorText = log.errorText;
                    group.canceled = log.canceled;
                    break;
            }

            group.events.push(log);
        });

        // 转换为数组并按时间排序
        return Array.from(grouped.values()).sort((a, b) => a.startTime - b.startTime);
    }

    /**
     * 业务逻辑：等待指定标签页加载完成，确保页面完全加载后再继续操作，用于页面导航后的等待
     *
     * 实现方式：
     * 1. 首先检查标签页状态，如果已经是 'complete' 则立即返回
     * 2. 如果未完成，监听 browser.tabs.onUpdated 事件
     * 3. 当标签页状态变为 'complete' 时，移除监听器并返回
     * 4. 如果超时，移除监听器并返回（不抛出异常）
     *
     * 注意事项：
     * - tabId 必须存在且为有效的标签页 ID
     * - timeout 默认 30 秒，超时后仍会返回但页面可能未完全加载
     * - 如果标签页已经加载完成，会立即返回，不会等待
     * - 超时不会抛出异常，只会记录警告日志
     * - 监听器会在返回或超时后自动移除，避免内存泄漏
     *
     * @param tabId - 标签页 ID
     * @param timeout - 超时时间（毫秒），默认 30 秒
     *
     * 相关代码：src/executor/CdpExecutor.ts - handleCreateTabAndNavigate() 方法（创建标签页后调用）
     */
    private async waitForTabLoadComplete(tabId: number, timeout: number = 60000): Promise<void> {
        // 首先检查标签页是否已经加载完成
        try {
            const tab = await browser.tabs.get(tabId);
            if (tab.status === 'complete') {
                OutputLogToFile(`[CdpExecutor] Tab ${tabId} already loaded`, { level: LogLevel.INFO });
                return;
            }
        } catch (error) {
            OutputLogToFile(`[CdpExecutor] Failed to get tab ${tabId}: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        }

        // 如果还没加载完成，等待加载完成事件
        return new Promise((resolve) => {
            const listener = (updatedTabId: number, changeInfo: any) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    browser.tabs.onUpdated.removeListener(listener);
                    OutputLogToFile(`[CdpExecutor] Tab ${tabId} loaded successfully`, { level: LogLevel.INFO });
                    resolve();
                }
            };

            browser.tabs.onUpdated.addListener(listener);

            // 设置超时，避免无限等待
            setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener);
                OutputLogToFile(`[CdpExecutor] Tab ${tabId} load timeout after ${timeout}ms`, { level: LogLevel.WARN });
                resolve();
            }, timeout);
        });
    }

    /**
     * 业务逻辑：更新节点配置中的节点名称，用于标识和管理不同的自动化节点实例
     *
     * 实现方式：调用 nodeManager.UpdateNodeProfile() 方法更新节点配置中的 node_name 字段
     *
     * 注意事项：
     * - node_name 必须存在且为字符串类型，否则抛出异常
     * - 节点名称用于在服务器端标识不同的节点实例
     * - 更新后的名称会在下次登录时发送给服务器
     *
     * 相关代码：src/managers/NodeManager.ts - nodeManager 对象（节点配置管理器）
     */
    private async handleUpdateNodeName(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpUpdateNodeNameMessage = cdpMessage as CdpUpdateNodeNameMessage;
        let defaultResult: CdpUpdateNodeNameResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in update_node_name');
        }

        if (!msg.data.node_name || typeof msg.data.node_name !== 'string') {
            throw new Error('node_name is required and must be a string in update_node_name');
        }

        // 更新节点名称
        await nodeManager.UpdateNodeProfile({ node_name: msg.data.node_name });

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { node_name: msg.data.node_name } } as CdpUpdateNodeNameResult;
        OutputLogToFile(`[CdpExecutor] Node name updated successfully, node_name: ${msg.data.node_name}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpUpdateNodeNameResult);
    }

    /**
     * 业务逻辑：关闭指定标签页，断开 CDP 连接并清理相关日志，用于清理不再需要的标签页和释放资源
     *
     * 实现方式：
     * 1. 尝试断开 CDP 连接（如果已连接）
     * 2. 使用 browser.tabs.remove() 关闭标签页
     * 3. 清空该标签页的控制台和网络日志
     *
     * 注意事项：
     * - tabId 必须存在且为数字类型，否则抛出异常
     * - CDP 断开操作失败不会阻止标签页关闭（仅记录警告）
     * - 关闭标签页会自动清理该标签页的所有日志
     * - 如果标签页不存在，会抛出异常
     *
     * 相关代码：src/utils/index.ts - DisconnectCDP() 函数（断开 CDP 连接），src/executor/CdpExecutor.ts - clearConsoleLogs() 和 clearNetworkLogs() 方法（清理日志）
     */
    private async handleCloseTab(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpCloseTabMessage = cdpMessage as CdpCloseTabMessage;
        let defaultResult: CdpCloseTabResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in close_tab');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in close_tab');
        }

        // 关闭标签页前，先断开 CDP 连接（如果已连接）
        try {
            await DisconnectCDP(msg.data.tabId);
        } catch (error) {
            // 如果 CDP 未连接，忽略错误
            OutputLogToFile(`[CdpExecutor] CDP not connected for tab ${msg.data.tabId}, skipping disconnect`, { level: LogLevel.WARN });
        }

        // 关闭标签页
        await browser.tabs.remove(msg.data.tabId);

        // 清理该标签页的日志
        this.clearConsoleLogs(msg.data.tabId);
        this.clearNetworkLogs(msg.data.tabId);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: { tabId: msg.data.tabId } } as CdpCloseTabResult;
        OutputLogToFile(`[CdpExecutor] Tab closed successfully, tabId: ${msg.data.tabId}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpCloseTabResult);
    }
}
