import { CdpExecutor } from '../../../executor';
import { ExecuteCDPCommand } from '../../../utils';

/**
 * CDP 事件监听服务
 * 
 * 业务逻辑：负责监听和处理 Chrome DevTools Protocol (CDP) 事件，包括控制台日志和网络请求日志，
 * 将 CDP 事件转换为内部日志格式并传递给 CDP 执行器处理
 * 
 * 实现方式：使用 browser.debugger.onEvent 监听器监听所有 CDP 事件，根据事件类型（method）过滤并处理
 * 控制台日志（Runtime.consoleAPICalled）和网络请求事件（Network.*），将事件数据传递给 CdpExecutor
 * 
 * 注意事项：
 * - 需要确保 debugger API 已正确附加到目标标签页，否则无法接收 CDP 事件
 * - 只处理有 tabId 的事件，忽略非标签页相关的事件
 * - 网络事件包括请求发送、响应接收、加载完成、加载失败等多种类型
 * 
 * 相关代码：src/executor/CdpExecutor.ts - CdpExecutor，src/entrypoints/background.ts - 后台脚本入口
 */
export class CdpEventService {
    private cdpExecutor: CdpExecutor;

    constructor(cdpExecutor: CdpExecutor) {
        this.cdpExecutor = cdpExecutor;
    }

    /**
     * 业务逻辑：初始化 CDP 事件监听器，开始监听控制台日志和网络请求事件
     * 
     * 实现方式：注册 browser.debugger.onEvent 监听器，根据事件方法名（method）匹配对应的处理逻辑，
     * 将控制台日志和网络事件数据传递给 CdpExecutor 的相应方法
     * 
     * 注意事项：
     * - 监听器会接收所有 CDP 事件，需要根据 method 进行过滤
     * - tabId 为 undefined 的事件会被忽略
     * - 事件处理是同步的，避免阻塞其他事件处理
     * 
     * 相关代码：src/executor/CdpExecutor.ts - CdpExecutor.addConsoleLog(), CdpExecutor.addNetworkLog()
     */
    initialize(): void {
        // 监听 CDP 事件（控制台日志和网络日志）
        browser.debugger.onEvent.addListener((source, method, params) => {
            const tabId = source.tabId;
            if (tabId === undefined) return;

            // 处理控制台日志事件
            if (method === 'Runtime.consoleAPICalled') {
                const consoleParams = params as any;
                this.cdpExecutor.addConsoleLog(tabId, {
                    type: consoleParams.type,
                    args: consoleParams.args,
                    timestamp: consoleParams.timestamp,
                    executionContextId: consoleParams.executionContextId,
                    stackTrace: consoleParams.stackTrace
                });
            }

            // 处理网络请求事件
            if (method === 'Network.requestWillBeSent') {
                const networkParams = params as any;
                this.cdpExecutor.addNetworkLog(tabId, {
                    event: 'requestWillBeSent',
                    requestId: networkParams.requestId,
                    request: networkParams.request,
                    timestamp: networkParams.timestamp,
                    wallTime: networkParams.wallTime,
                    initiator: networkParams.initiator,
                    redirectResponse: networkParams.redirectResponse,
                    type: networkParams.type,
                    frameId: networkParams.frameId
                });
            }

            // 处理网络响应事件
            if (method === 'Network.responseReceived') {
                const networkParams = params as any;
                this.cdpExecutor.addNetworkLog(tabId, {
                    event: 'responseReceived',
                    requestId: networkParams.requestId,
                    response: networkParams.response,
                    timestamp: networkParams.timestamp,
                    type: networkParams.type,
                    frameId: networkParams.frameId
                });
            }

            // 处理网络请求完成事件
            if (method === 'Network.loadingFinished') {
                const networkParams = params as any;
                this.cdpExecutor.addNetworkLog(tabId, {
                    event: 'loadingFinished',
                    requestId: networkParams.requestId,
                    timestamp: networkParams.timestamp,
                    encodedDataLength: networkParams.encodedDataLength
                });
            }

            // 处理网络请求失败事件
            if (method === 'Network.loadingFailed') {
                const networkParams = params as any;
                this.cdpExecutor.addNetworkLog(tabId, {
                    event: 'loadingFailed',
                    requestId: networkParams.requestId,
                    timestamp: networkParams.timestamp,
                    type: networkParams.type,
                    errorText: networkParams.errorText,
                    canceled: networkParams.canceled,
                    blockedReason: networkParams.blockedReason
                });
            }

            // 关页过程中若出现 JS 弹窗（如 beforeunload），自动接受以便标签页能关闭
            if (method === 'Page.javascriptDialogOpening' && this.cdpExecutor.hasPendingCloseTabId(tabId)) {
                this.cdpExecutor.removePendingCloseTabId(tabId);
                ExecuteCDPCommand(tabId, 'Page.handleJavaScriptDialog', { accept: true }).catch(() => {
                    // 弹窗已处理或 tab 已关闭，忽略
                });
            }
        });
    }
}
