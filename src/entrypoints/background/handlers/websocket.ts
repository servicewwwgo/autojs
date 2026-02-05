import { BackgroundScriptMessageType, WSMessage } from '../../../types';
import { WebSocketConnector } from '../../../executor';
import { InstructionExecutor } from '../../../executor';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 连接WebSocket
 * @param wsConnector - WebSocket连接器实例
 */
export function createConnectWebSocketHandler(wsConnector: WebSocketConnector) {
    return async function connectWebSocket(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        if (message.params?.url) {
            const url = message.params.url as string;
            if (wsConnector) {
                await wsConnector.connect();
                OutputLogToFile(`[Background] WebSocket connected successfully, URL: ${url}`, { level: LogLevel.INFO });
            } else {
                OutputLogToFile(`[Background] WebSocket connection failed: wsConnector not initialized`, { level: LogLevel.ERROR });
            }

            sendResponse({ success: true });
        } else {
            OutputLogToFile(`[Background] WebSocket connection failed: missing URL`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'Missing WebSocket URL' });
        }
    };
}

/**
 * 断开WebSocket
 * @param wsConnector - WebSocket连接器实例
 */
export function createDisconnectWebSocketHandler(wsConnector: WebSocketConnector) {
    return async function disconnectWebSocket(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        if (wsConnector) {
            wsConnector.disconnect();
            OutputLogToFile(`[Background] WebSocket disconnected`, { level: LogLevel.INFO });
        }

        sendResponse({ success: true });
    };
}

/**
 * 测试WebSocket连接
 * @param wsConnector - WebSocket连接器实例
 */
export function createTestWebSocketHandler(wsConnector: WebSocketConnector) {
    return async function testWebSocket(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        if (message.params?.url && wsConnector) {
            const url = message.params.url as string;
            const connected = await wsConnector.testConnection(url);
            sendResponse({ success: true, data: { connected } });
        } else {
            sendResponse({ success: false, error: 'Missing WebSocket URL' });
        }
    };
}

/**
 * 发送执行结果到服务器
 * @param wsConnector - WebSocket连接器实例
 * @param instructionExecutor - 指令执行器实例
 */
export function createSendResultsToServerHandler(
    wsConnector: WebSocketConnector,
    instructionExecutor: InstructionExecutor
) {
    return async function sendResultsToServer(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        if (wsConnector && wsConnector.isConnected()) {
            const results = instructionExecutor.GetResultManager().GetAllResults();
            const message: WSMessage = { type: 'instructions', data: results };
            wsConnector.sendMessage(message);
            OutputLogToFile(`[Background] Sent execution results to server successfully, count: ${results.length}`, { level: LogLevel.INFO });
            sendResponse({ success: true });
        } else {
            OutputLogToFile(`[Background] Failed to send execution results to server: WebSocket not connected`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'WebSocket not connected' });
        }
    };
}
