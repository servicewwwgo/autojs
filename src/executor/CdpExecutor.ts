import type { WSMessage } from '../types';
import { EnsureCDPConnected, DisconnectCDP, ExecuteCDPCommand } from '../utils';
import { wsConnector } from './WebSocketConnector';
import { tabManager } from '../managers';

/**
 * CDP 消息数据映射类型
 */
export interface CdpMessage {
    type: 'list_targets' | 'take_element_screenshot' | 'send_command' | 'grep_source' | 'get_network_logs' | 'get_console_logs' | 'execute_javascript' | 'init_network_logs' | 'init_console_logs';
    id: string;
    data: any;
}

export interface CdpResult {
    type: string;
    id: string;
    success?: boolean;
    error?: string;
    data?: any;
}

/**
 * CDP (Chrome DevTools Protocol) 执行器
 * 提供通过 CDP 协议执行相关功能
 */
export class CdpExecutor {
    private consoleLogs: Map<string, any> = new Map();
    private networkLogs: Map<string, any> = new Map();
    private readonly MAX_LOG_ENTRIES = 10000; // 每个标签页最多保存的日志条目数

    private mapTypeToFunction: { [key: string]: (data: any) => Promise<void> } = {};

    constructor() {
        // 初始化类型到函数的映射
        this.mapTypeToFunction = {
            'list_targets': this.handleListTargets,
            'take_element_screenshot': this.handleTakeElementScreenshot,
            'send_command': this.handleSendCommand,
            'grep_source': this.handleGrepSource,
            'get_network_logs': this.handleGetNetworkLogs,
            'get_console_logs': this.handleGetConsoleLogs,
            'execute_javascript': this.handleExecuteJavaScript,
            'init_network_logs': this.handleInitNetworkLogs,
            'init_console_logs': this.handleInitConsoleLogs,
        };
    }

    /**
     * 发送 CDP 结果
     * @param result - CDP 结果对象
     */
    public async sendResult(result: CdpResult): Promise<void> {
        wsConnector.sendMessage({ type: 'cdp', data: result } as WSMessage);
    }

    /**
     * 统一的 WebSocket 消息处理接口
     * 根据消息类型分发到相应的处理函数
     * @param message - WebSocket 消息
     * @returns void
     */
    public async handleMessage(message: WSMessage): Promise<void> {
        const cdpMessage = message.data as CdpMessage;
        const handler = this.mapTypeToFunction[cdpMessage.type];
        if (handler) {
            try {
                await handler(cdpMessage);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('[CdpExecutor] 处理 CDP 消息时出错:', errorMessage);

                this.sendResult({
                    type: cdpMessage.type,
                    id: cdpMessage.id,
                    success: false,
                    error: errorMessage,
                });
            }

        }
    }

    // 列出所有标签页
    public async handleListTargets(cdpMessage: CdpMessage): Promise<void> {
        // 获取所有标签页
        const tabs = tabManager.GetAllTabs();

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: tabs
        });
    }

    // 执行 JavaScript 代码
    public async handleExecuteJavaScript(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, expression, ...options } = cdpMessage.data;

        await EnsureCDPConnected(tabId);

        // 启用 Runtime 域
        await ExecuteCDPCommand(tabId, 'Runtime.enable');

        // 构建 Runtime.evaluate 参数
        const params: any = {
            expression: expression
        };

        // 添加可选参数
        if (options.returnByValue !== undefined) params.returnByValue = options.returnByValue;
        if (options.awaitPromise !== undefined) params.awaitPromise = options.awaitPromise;
        if (options.userGesture !== undefined) params.userGesture = options.userGesture;
        if (options.silent !== undefined) params.silent = options.silent;
        if (options.contextId !== undefined) params.contextId = options.contextId;
        if (options.objectGroup !== undefined) params.objectGroup = options.objectGroup;
        if (options.generatePreview !== undefined) params.generatePreview = options.generatePreview;
        if (options.includeCommandLineAPI !== undefined) params.includeCommandLineAPI = options.includeCommandLineAPI;

        // 执行 JavaScript 代码
        const evalResult = await ExecuteCDPCommand(tabId, 'Runtime.evaluate', params);

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: evalResult
        });

        await DisconnectCDP(tabId);
    }

    // 截取元素截图
    public async handleTakeElementScreenshot(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, selector, selectorType = 'css' } = cdpMessage.data;

        await EnsureCDPConnected(tabId);

        // 步骤1: 启用 DOM 域和 Page 域
        await ExecuteCDPCommand(tabId, 'DOM.enable');
        await ExecuteCDPCommand(tabId, 'Page.enable');

        // 步骤2: 获取文档根节点
        const documentResult = await ExecuteCDPCommand(tabId, 'DOM.getDocument', {
            depth: -1,
            pierce: false
        });

        if (!documentResult?.root?.nodeId) {
            throw new Error('无法获取文档根节点');
        }

        const rootNodeId = documentResult.root.nodeId;

        // 步骤3: 通过选择器查找元素
        let nodeId: number | undefined;

        if (selectorType === 'xpath') {
            const searchResult = await ExecuteCDPCommand(tabId, 'DOM.performSearch', {
                query: selector,
                includeUserAgentShadowDOM: false
            });

            if (searchResult?.searchId) {
                const searchResults = await ExecuteCDPCommand(tabId, 'DOM.getSearchResults', {
                    searchId: searchResult.searchId,
                    fromIndex: 0,
                    toIndex: 1
                });

                if (searchResults?.nodeIds && searchResults.nodeIds.length > 0) {
                    nodeId = searchResults.nodeIds[0];
                }
            }
        } else {
            const cssSelector = selectorType === 'id' ? `#${selector}` : selector;
            const queryResult = await ExecuteCDPCommand(tabId, 'DOM.querySelector', {
                nodeId: rootNodeId,
                selector: cssSelector
            });

            nodeId = queryResult?.nodeId;
        }

        if (!nodeId) {
            throw new Error(`未找到元素: ${selector}`);
        }

        // 步骤4: 滚动元素到可视区
        await ExecuteCDPCommand(tabId, 'DOM.scrollIntoViewIfNeeded', {
            nodeId: nodeId
        });

        // 等待滚动完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 步骤5: 获取元素盒模型（位置和尺寸）
        const boxModel = await ExecuteCDPCommand(tabId, 'DOM.getBoxModel', {
            nodeId: nodeId
        });

        if (!boxModel?.model) {
            throw new Error('无法获取元素盒模型');
        }

        // 步骤6: 获取页面布局信息（获取滚动偏移量）
        const layoutMetrics = await ExecuteCDPCommand(tabId, 'Page.getLayoutMetrics');

        // 步骤7: 计算元素在文档中的绝对坐标
        const contentQuad = boxModel.model.content;
        const x = Math.min(contentQuad[0], contentQuad[2], contentQuad[4], contentQuad[6]);
        const y = Math.min(contentQuad[1], contentQuad[3], contentQuad[5], contentQuad[7]);
        const width = Math.max(contentQuad[0], contentQuad[2], contentQuad[4], contentQuad[6]) - x;
        const height = Math.max(contentQuad[1], contentQuad[3], contentQuad[5], contentQuad[7]) - y;

        // 步骤8: 截取元素截图
        const screenshotResult = await ExecuteCDPCommand(tabId, 'Page.captureScreenshot', {
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
        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: {
                image: base64Image,
                format: 'png',
                x: x,
                y: y,
                width: width,
                height: height
            }
        });

        // 步骤11: 断开 CDP 连接
        await DisconnectCDP(tabId);
    }

    // 执行 CDP 命令
    public async handleSendCommand(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, method, params } = cdpMessage.data;

        await EnsureCDPConnected(tabId);
        const result = await ExecuteCDPCommand(tabId, method, params);
        await DisconnectCDP(tabId);

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: result
        });
    }

    // 源码搜索
    public async handleGrepSource(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, pattern, caseSensitive = false } = cdpMessage.data;

        await EnsureCDPConnected(tabId);

        // 启用 Page 域以获取页面源码
        await ExecuteCDPCommand(tabId, 'Page.enable');

        // 获取页面资源树
        const resourceTree = await ExecuteCDPCommand(tabId, 'Page.getResourceTree');

        if (!resourceTree?.frameTree) {
            throw new Error('无法获取页面资源树');
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
                        console.warn(`无法获取资源内容: ${resource.url}`, error);
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

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: {
                matches: matches,
                pattern: pattern,
                count: matches.length
            }
        });

        await DisconnectCDP(tabId);
    }

    // 获取网络日志
    public async handleGetNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, clear = false, filter, limit, offset = 0, requestId, groupByRequest = false } = cdpMessage.data;

        const logKey = `network_${tabId}`;
        let logs = this.networkLogs.get(logKey) || [];

        // 如果请求清空日志，先返回当前日志，然后清空
        if (clear) {
            this.networkLogs.delete(logKey);
            // 清空后返回空数组
            logs = [];
        } else {
            // 如果指定了 requestId，只返回该请求的日志
            if (requestId) {
                logs = logs.filter((log: any) => log.requestId === requestId);
            } else {
                // 应用过滤条件
                if (filter) {
                    logs = this.filterNetworkLogs(logs, filter);
                }
            }

            // 如果按请求分组，将同一 requestId 的日志合并
            if (groupByRequest && !requestId) {
                logs = this.groupNetworkLogsByRequest(logs);
            }

            // 应用分页
            if (limit !== undefined && !groupByRequest) {
                logs = logs.slice(offset, offset + limit);
            }
        }

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: {
                tabId: tabId,
                logs: logs,
                count: logs.length,
                total: clear ? 0 : (this.networkLogs.get(logKey)?.length || 0),
                grouped: groupByRequest && !requestId
            }
        });
    }

    // 获取控制台日志
    public async handleGetConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, clear = false, filter, limit, offset = 0 } = cdpMessage.data;

        const logKey = `console_${tabId}`;
        let logs = this.consoleLogs.get(logKey) || [];

        // 如果请求清空日志，先返回当前日志，然后清空
        if (clear) {
            this.consoleLogs.delete(logKey);
            // 清空后返回空数组
            logs = [];
        } else {
            // 应用过滤条件
            if (filter) {
                logs = this.filterConsoleLogs(logs, filter);
            }

            // 应用分页
            if (limit !== undefined) {
                logs = logs.slice(offset, offset + limit);
            }
        }

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: {
                tabId: tabId,
                logs: logs,
                count: logs.length,
                total: clear ? 0 : (this.consoleLogs.get(logKey)?.length || 0)
            }
        });
    }

    // 初始化网络日志收集
    public async handleInitNetworkLogs(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, clear = false } = cdpMessage.data;

        await EnsureCDPConnected(tabId);

        // 启用 Network 域以开始收集网络日志
        await ExecuteCDPCommand(tabId, 'Network.enable');

        // 如果请求清空日志，则清空该标签页的网络日志
        if (clear) {
            this.clearNetworkLogs(tabId);
        }

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: {
                tabId: tabId,
                message: '网络日志收集已启用'
            }
        });

        // 注意：不断开连接，以便持续收集日志
    }

    // 初始化控制台日志收集
    public async handleInitConsoleLogs(cdpMessage: CdpMessage): Promise<void> {
        const { tabId, clear = false } = cdpMessage.data;

        await EnsureCDPConnected(tabId);

        // 启用 Runtime 域以开始收集控制台日志（控制台日志通过 Runtime.consoleAPICalled 事件收集）
        await ExecuteCDPCommand(tabId, 'Runtime.enable');

        // 如果请求清空日志，则清空该标签页的控制台日志
        if (clear) {
            this.clearConsoleLogs(tabId);
        }

        this.sendResult({
            type: cdpMessage.type,
            id: cdpMessage.id,
            success: true,
            data: {
                tabId: tabId,
                message: '控制台日志收集已启用'
            }
        });

        // 注意：不断开连接，以便持续收集日志
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
