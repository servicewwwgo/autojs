import { BackgroundScriptMessageType, WSMessage } from '../../../types';
import { WebSocketConnector } from '../../../executor';
import { InstructionExecutor } from '../../../executor';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 业务逻辑：创建连接 WebSocket 的处理器函数，建立与服务器的 WebSocket 连接，用于接收指令和发送结果
 * 
 * 实现方式：从消息参数中获取 WebSocket URL，调用 WebSocketConnector.connect() 方法建立连接
 * 
 * 注意事项：
 * - 连接是异步的，需要等待连接完成
 * - 如果连接器未初始化，返回错误响应
 * - URL 参数是必需的，缺失时返回错误
 * 
 * @param wsConnector - WebSocket 连接器实例
 * 
 * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector.connect()
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
 * 业务逻辑：创建断开 WebSocket 的处理器函数，关闭与服务器的 WebSocket 连接
 * 
 * 实现方式：调用 WebSocketConnector.disconnect() 方法关闭连接
 * 
 * 注意事项：断开连接后无法接收服务器指令，需要重新连接才能恢复通信
 * 
 * @param wsConnector - WebSocket 连接器实例
 * 
 * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector.disconnect()
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
 * 业务逻辑：创建测试 WebSocket 连接的处理器函数，验证指定 URL 的 WebSocket 服务器是否可达
 * 
 * 实现方式：调用 WebSocketConnector.testConnection() 方法，尝试连接指定 URL 并返回连接结果
 * 
 * 注意事项：测试连接不会建立持久连接，仅用于验证服务器可达性
 * 
 * @param wsConnector - WebSocket 连接器实例
 * 
 * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector.testConnection()
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
 * 业务逻辑：创建发送执行结果到服务器的处理器函数，将本地保存的所有指令执行结果通过 WebSocket 发送到服务器
 * 
 * 实现方式：获取所有执行结果，封装成 WebSocket 消息（类型：instructions），调用 WebSocketConnector.sendMessage() 发送
 * 
 * 注意事项：
 * - 只有在 WebSocket 已连接时才能发送结果
 * - 发送前需要检查连接状态，未连接时返回错误
 * - 结果以数组形式发送，包含所有已执行的指令结果
 * 
 * @param wsConnector - WebSocket 连接器实例
 * @param instructionExecutor - 指令执行器实例
 * 
 * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector.sendMessage(),
 * src/executor/InstructionExecutor.ts - InstructionExecutor.GetResultManager()
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
