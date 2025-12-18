import type { CdpMessage, CdpResult, CdpConnectMessage, CdpConnectResult, CdpDisconnectMessage, CdpDisconnectResult, CdpListTargetsMessage, CdpListTargetsResult, CdpExecuteJavaScriptMessage, CdpExecuteJavaScriptResult, CdpTakeElementScreenshotMessage, CdpTakeElementScreenshotResult, CdpSendCommandMessage, CdpSendCommandResult, CdpGrepSourceMessage, CdpGrepSourceResult, CdpGetNetworkLogsMessage, CdpGetNetworkLogsResult, CdpInitNetworkLogsMessage, CdpInitNetworkLogsResult, CdpGetConsoleLogsMessage, CdpGetConsoleLogsResult, CdpInitConsoleLogsMessage, CdpInitConsoleLogsResult, CdpCloseNetworkLogsMessage, CdpCloseNetworkLogsResult, CdpCloseConsoleLogsMessage, CdpCloseConsoleLogsResult } from '../types';
import { EnsureCDPConnected, DisconnectCDP, ExecuteCDPCommand, OutputLogToFile, LogLevel } from '../utils';

/**
 * CDP (Chrome DevTools Protocol) 执行器
 * 提供通过 CDP 协议执行相关功能
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
        };
    }

    /**
     * 设置发送 CDP 结果的函数
     * @param sendResult - 发送结果的函数
     */
    public setSendResult(sendResult: (result: CdpResult) => void): void {
        this.sendResult = sendResult;
    }

    /**
     * 统一的 WebSocket 消息处理接口
     * 根据消息类型分发到相应的处理函数
     * @param message - WebSocket 消息
     * @returns void
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

        this.sendResult?.(defaultResult as CdpResult);
    }

    // 连接 CDP
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

    // 断开 CDP
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

    // 列出所有标签页
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

    // 执行 JavaScript 代码
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

    // 截取元素截图
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

    // 执行 CDP 命令
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

        // 执行 CDP 命令（params 可以为 undefined，因为某些 CDP 命令不需要参数）
        const result = await ExecuteCDPCommand(msg.data.tabId, msg.data.method, msg.data.params);

        defaultResult = { type: msg.type, id: msg.id, success: true, data: result } as CdpSendCommandResult;
        OutputLogToFile(`[CdpExecutor] CDP command executed successfully, tabId: ${msg.data.tabId}, method: ${msg.data.method}`, { level: LogLevel.INFO });
        this.sendResult?.(defaultResult as CdpSendCommandResult);
    }

    // 源码搜索
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

    // 获取网络日志
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

    // 获取控制台日志
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

    // 初始化网络日志收集
    private async handleInitNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpInitNetworkLogsMessage = cdpMessage as CdpInitNetworkLogsMessage;
        let defaultResult: CdpInitNetworkLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in init_network_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in init_network_logs');
        }

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

    // 初始化控制台日志收集
    private async handleInitConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpInitConsoleLogsMessage = cdpMessage as CdpInitConsoleLogsMessage;
        let defaultResult: CdpInitConsoleLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in init_console_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in init_console_logs');
        }

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

    // 关闭网络日志收集
    private async handleCloseNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpCloseNetworkLogsMessage = cdpMessage as CdpCloseNetworkLogsMessage;
        let defaultResult: CdpCloseNetworkLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in close_network_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in close_network_logs');
        }

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

    // 关闭控制台日志收集
    private async handleCloseConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const msg: CdpCloseConsoleLogsMessage = cdpMessage as CdpCloseConsoleLogsMessage;
        let defaultResult: CdpCloseConsoleLogsResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in close_console_logs');
        }

        if (msg.data.tabId === undefined || typeof msg.data.tabId !== 'number') {
            throw new Error('tabId is required and must be a number in close_console_logs');
        }

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
     * 添加控制台日志
     * @param tabId - 标签页ID
     * @param logEntry - 日志条目
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
     * 添加网络日志
     * @param tabId - 标签页ID
     * @param logEntry - 日志条目
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
     * 清空指定标签页的控制台日志
     * @param tabId - 标签页ID
     */
    public clearConsoleLogs(tabId: number): void {
        const logKey = `console_${tabId}`;
        this.consoleLogs.delete(logKey);
    }

    /**
     * 清空指定标签页的网络日志
     * @param tabId - 标签页ID
     */
    public clearNetworkLogs(tabId: number): void {
        const logKey = `network_${tabId}`;
        this.networkLogs.delete(logKey);
    }

    /**
     * 过滤网络日志
     * @param logs - 日志数组
     * @param filter - 过滤条件
     * @returns 过滤后的日志数组
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
     * 过滤控制台日志
     * @param logs - 日志数组
     * @param filter - 过滤条件
     * @returns 过滤后的日志数组
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
     * 按请求ID分组网络日志
     * @param logs - 日志数组
     * @returns 分组后的日志数组，每个请求包含完整的生命周期
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
}
