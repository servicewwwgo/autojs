import { CdpExecutor } from '../../../executor';

/**
 * CDP事件监听服务
 * 负责监听和处理Chrome DevTools Protocol事件
 */
export class CdpEventService {
    private cdpExecutor: CdpExecutor;

    constructor(cdpExecutor: CdpExecutor) {
        this.cdpExecutor = cdpExecutor;
    }

    /**
     * 初始化CDP事件监听器
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
        });
    }
}
