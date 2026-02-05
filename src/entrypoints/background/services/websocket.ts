import { WEBSOCKET_CONN_URL } from '../../../consts';
import { WebSocketConnector } from '../../../executor';
import { CdpExecutor, HttpExecutor, InstructionExecutor } from '../../../executor';
import { CdpMessage, CdpResult, HttpMessage, HttpResult, InstructionResults, WSMessage } from '../../../types';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * WebSocket服务
 * 负责WebSocket连接管理和回调设置
 */
export class WebSocketService {
    private wsConnector: WebSocketConnector;
    private instructionExecutor: InstructionExecutor;
    private cdpExecutor: CdpExecutor;
    private httpExecutor: HttpExecutor;

    constructor(
        wsConnector: WebSocketConnector,
        instructionExecutor: InstructionExecutor,
        cdpExecutor: CdpExecutor,
        httpExecutor: HttpExecutor
    ) {
        this.wsConnector = wsConnector;
        this.instructionExecutor = instructionExecutor;
        this.cdpExecutor = cdpExecutor;
        this.httpExecutor = httpExecutor;
    }

    /**
     * 设置所有回调函数
     */
    async setCallbacks(): Promise<void> {
        // 注册消息类型处理器 - 执行指令（通过 WebSocket 消息）
        this.wsConnector.registerMessageTypeHandler('instructions', async (message: WSMessage): Promise<void> => {
            await this.instructionExecutor.handleMessage(message);
        });

        // 设置指令执行器的结果发送回调
        this.instructionExecutor.setSendResult((result: InstructionResults): void => {
            // 通过 WebSocket 发送指令结果
            this.wsConnector.sendMessage({ type: 'instructions', data: result } as WSMessage);
        });

        // 注册 cdp 执行器的统一消息处理器（所有 CDP 相关消息都通过 handleMessage 处理）
        this.wsConnector.registerMessageTypeHandler('cdp', async (message: WSMessage): Promise<void> => {
            await this.cdpExecutor.handleMessage(message.data as CdpMessage);
        });

        // 设置 CDP 执行器的结果发送回调
        this.cdpExecutor.setSendResult((result: CdpResult): void => {
            // 通过 WebSocket 发送 CDP 结果
            this.wsConnector.sendMessage({ type: 'cdp', data: result } as WSMessage);
        });

        // 注册 http 执行器的统一消息处理器（所有 HTTP 相关消息都通过 handleMessage 处理）
        this.wsConnector.registerMessageTypeHandler('http', async (message: WSMessage): Promise<void> => {
            await this.httpExecutor.handleMessage(message.data as HttpMessage);
        });

        // 设置 HTTP 执行器的结果发送回调
        this.httpExecutor.setSendResult((result: HttpResult): void => {
            // 通过 WebSocket 发送 HTTP 结果
            this.wsConnector.sendMessage({ type: 'http', data: result } as WSMessage);
        });
    }

    /**
     * 检查并连接WebSocket
     */
    async checkAndConnect(): Promise<void> {
        // 实际检查 WebSocket 连接状态，防止 Service Worker 休眠后状态不一致
        // 如果已经连接且 WebSocket 实际处于 OPEN 状态，直接返回
        if (this.wsConnector.isConnected()) {
            OutputLogToFile('[Background] WebSocket already connected, skipping connection and send_tabs', { level: LogLevel.INFO });
            return;
        }

        OutputLogToFile('[Background] WebSocket not connected or connection lost, attempting to connect...', { level: LogLevel.INFO });

        // 启动连接（异步操作，不等待完成）
        this.wsConnector.connect().catch(error => {
            OutputLogToFile(`[Background] Failed to connect WebSocket: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        });
    }

    /**
     * 获取WebSocket连接器实例
     */
    getConnector(): WebSocketConnector {
        return this.wsConnector;
    }
}
