import { WEBSOCKET_CONN_URL } from '../../../consts';
import { WebSocketConnector } from '../../../executor';
import { CdpExecutor, HttpExecutor, InstructionExecutor } from '../../../executor';
import { CdpMessage, CdpResult, HttpMessage, HttpResult, InstructionResults, WSMessage } from '../../../types';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * WebSocket 服务
 * 
 * 业务逻辑：负责 WebSocket 连接管理和消息回调设置，建立执行器（指令、CDP、HTTP）与 WebSocket 连接器之间的
 * 双向通信机制，实现服务器指令的下发和执行结果的回传
 * 
 * 实现方式：封装 WebSocketConnector，为各个执行器注册消息类型处理器和结果发送回调，实现消息的路由和分发
 * 
 * 注意事项：
 * - 回调设置需要在 WebSocket 连接之前完成，确保消息能够正确路由
 * - 每个执行器都有对应的消息类型（instructions/cdp/http）和结果发送回调
 * - WebSocket 连接可能因 Service Worker 休眠而断开，需要通过定时任务定期检查并重连
 * 
 * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector，src/executor/ - 各种执行器实现
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
     * 业务逻辑：设置所有执行器的消息回调和结果发送回调，建立 WebSocket 消息与执行器之间的双向通信机制
     * 
     * 实现方式：为 WebSocketConnector 注册三种消息类型处理器（instructions/cdp/http），
     * 为每个执行器设置结果发送回调，将执行结果通过 WebSocket 发送回服务器
     * 
     * 注意事项：
     * - 回调设置是幂等的，多次调用不会产生副作用
     * - 消息类型处理器负责接收服务器下发的指令并调用执行器处理
     * - 结果发送回调负责将执行结果封装成 WebSocket 消息发送回服务器
     * 
     * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector.registerMessageTypeHandler(),
     * src/executor/ - 各种执行器的 handleMessage() 和 setSendResult() 方法
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
     * 业务逻辑：检查 WebSocket 连接状态并在需要时重新连接，用于在 Service Worker 休眠后恢复连接
     * 
     * 实现方式：调用 WebSocketConnector.isConnected() 检查连接状态，如果未连接则调用 connect() 方法进行连接
     * 
     * 注意事项：
     * - Service Worker 休眠后 WebSocket 连接会被断开，但连接状态可能不一致，需要实际检查
     * - 连接操作是异步的，不等待连接完成，避免阻塞定时任务执行
     * - 连接失败会记录错误日志，但不会抛出异常
     * 
     * 相关代码：src/executor/WebSocketConnector.ts - WebSocketConnector.isConnected(), WebSocketConnector.connect(),
     * src/entrypoints/background/services/initialization.ts - InitializationService.handleAlarm()
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
     * 业务逻辑：获取 WebSocket 连接器实例，供其他模块直接操作 WebSocket 连接
     * 
     * 实现方式：返回内部保存的 WebSocketConnector 实例
     * 
     * 注意事项：此方法用于向后兼容，允许外部代码直接访问 WebSocketConnector
     * 
     * 相关代码：src/entrypoints/background/handlers/websocket.ts - WebSocket 相关消息处理器
     */
    getConnector(): WebSocketConnector {
        return this.wsConnector;
    }
}
