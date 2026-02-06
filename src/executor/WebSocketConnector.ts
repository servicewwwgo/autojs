import { nodeManager } from '../managers';
import type { WSErrorMessage, WSHeartbeatMessage, WSHeartbeatResponse, WSLoginMessage, WSLoginResponse, WSLogMessage, WSMessage } from '../types';
import { LogLevel } from '../utils';

// 检查消息大小，避免发送过大的消息
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB

const HEARTBEAT_INTERVAL = 15000; // 15秒心跳间隔（缩短以更快检测断开）
const RECONNECT_INTERVAL = 5000; // 5秒重连间隔

/**
 * 业务逻辑：管理与服务器的 WebSocket 连接，处理连接、重连、心跳、登录和消息收发，确保与服务器的稳定通信，支持自动重连和连接状态监控
 *
 * 实现方式：
 * 1. 使用浏览器原生 WebSocket API 建立连接
 * 2. 通过消息类型到处理函数的映射表（mapMessageTypeToFunction）分发消息
 * 3. 使用定时器实现心跳机制（每 15 秒发送一次心跳）
 * 4. 使用定时器实现自动重连（连接断开后 5 秒重连）
 * 5. 连接建立后自动发送登录消息
 * 6. 使用状态标志（connected、isLoggedIn、isDisconnecting）管理连接状态
 *
 * 注意事项：
 * - 连接建立后会自动发送登录消息，登录成功后才能处理业务消息
 * - 心跳间隔为 15 秒，用于检测连接是否存活
 * - 重连间隔为 5 秒，连接断开后会自动尝试重连
 * - 消息大小限制为 10MB，超过限制的消息不会发送
 * - 使用 queueMicrotask 异步处理消息，避免阻塞 WebSocket 消息接收
 * - 主动断开连接（disconnect）不会触发自动重连
 * - Service Worker 休眠可能导致状态不一致，isConnected() 会检查实际 WebSocket 状态
 *
 * 相关代码：src/types/websocket_message.ts - WebSocket 消息类型定义，src/entrypoints/background.ts - 使用此连接器，src/managers/NodeManager.ts - 获取节点配置用于登录
 */
export class WebSocketConnector {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectInterval: number = RECONNECT_INTERVAL; // 5秒重连间隔
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatInterval: number = HEARTBEAT_INTERVAL; // 30秒心跳间隔
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private connected: boolean = false; // WebSocket 连接状态
    private isLoggedIn: boolean = false; // 登录状态
    private isDisconnecting: boolean = false; // 标记是否正在断开连接，防止重连

    private mapMessageTypeToFunction: { [key: string]: (message: WSMessage) => Promise<void> } = {};

    constructor(url: string) {
        this.url = url;
    }

    /**
     * 业务逻辑：注册特定消息类型的处理函数，允许外部代码注册自定义消息处理器，实现消息的灵活分发
     *
     * 实现方式：将消息类型和处理函数的映射关系保存到 mapMessageTypeToFunction 对象中
     *
     * 注意事项：
     * - 同一消息类型只能注册一个处理器，后注册的会覆盖先注册的
     * - 处理器函数应该是异步的，返回 Promise<void>
     * - 处理器中的异常会被捕获并记录错误日志，不会影响其他消息的处理
     * - 登录、心跳、错误消息有内置处理器，不需要注册
     *
     * @param type - 消息类型字符串，如 'instruction'、'cdp'、'http' 等
     * @param func - 消息处理函数，接收 WSMessage 类型参数，返回 Promise<void>
     *
     * 相关代码：src/executor/WebSocketConnector.ts - handleMessage() 方法（使用注册的处理器），src/entrypoints/background.ts - 注册各种消息处理器
     */
    public registerMessageTypeHandler(type: string, func: (message: WSMessage) => Promise<void>): void {
        this.mapMessageTypeToFunction[type] = func;
    }

    /**
     * 业务逻辑：建立 WebSocket 连接，如果已连接则直接返回，如果连接失败则安排自动重连，连接成功后自动发送登录消息
     *
     * 实现方式：
     * 1. 检查现有连接状态，如果已连接且已登录则直接返回
     * 2. 如果连接状态异常，清理旧连接
     * 3. 如果正在断开连接，等待断开完成
     * 4. 创建新的 WebSocket 连接
     * 5. 设置事件处理器（onopen、onmessage、onerror、onclose）
     * 6. 连接成功后发送登录消息并启动心跳
     * 7. 连接失败或断开后安排自动重连
     *
     * 注意事项：
     * - 如果已连接且已登录，重复调用会直接返回
     * - 如果正在断开连接，不会创建新连接
     * - 连接建立后会异步发送登录消息，不阻塞连接流程
     * - 登录失败会自动断开连接
     * - 连接断开后（非主动断开）会自动安排重连
     * - 首次连接失败也会安排重连
     *
     * 相关代码：src/executor/WebSocketConnector.ts - sendLoginMessage() 方法（发送登录），src/executor/WebSocketConnector.ts - startHeartbeat() 方法（启动心跳），src/executor/WebSocketConnector.ts - scheduleReconnect() 方法（安排重连）
     */
    public async connect(): Promise<void> {
        // 检查 WebSocket 实际状态，如果存在但状态不是 OPEN，需要清理
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`[WebSocket] WebSocket exists but state is not OPEN (state: ${this.ws.readyState}), cleaning up`);
            this.clearReconnectTimer();
            this.stopHeartbeat();
            this.cleanupWebSocket();
            this.ws = null;
            this.connected = false;
            this.isLoggedIn = false;
        }

        // 如果已经连接且已登录，直接返回
        if (this.isConnected()) {
            console.log('[WebSocket] Already connected and logged in, returning');
            return;
        }

        // 如果正在断开连接，不进行重连
        if (this.isDisconnecting) {
            console.log('[WebSocket] Disconnecting, waiting for disconnect to complete');
            return;
        }

        // 如果正在连接中，等待或返回
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('[WebSocket] Connecting, waiting for connection to complete');
            return;
        }

        // 先断开旧连接（但不设置 isDisconnecting，因为我们要立即创建新连接）
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.cleanupWebSocket();

        this.ws = null;
        this.connected = false;
        this.isLoggedIn = false;

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WebSocket] Connection established');

                this.connected = true;
                this.isDisconnecting = false;

                // 异步发送登录消息，不阻塞连接
                this.sendLoginMessage().catch(() => {
                    console.error('[WebSocket] Failed to send login message');
                    this.cleanupWebSocket();
                });

                this.startHeartbeat();
                this.clearReconnectTimer();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.ws.onerror = (error) => {
                console.error(`[WebSocket] Connection error: ${error instanceof Error ? error.message : String(error)}`);
            };

            this.ws.onclose = (event) => {
                console.log(`[WebSocket] Connection closed, code: ${event.code}, reason: ${event.reason || 'none'}`);

                // 只有当关闭的是当前连接时才更新状态
                if (event.target === this.ws) {
                    this.connected = false;
                    this.isLoggedIn = false;
                    this.stopHeartbeat();

                    // 如果不是主动断开连接，则安排重连
                    if (this.isDisconnecting === false) {
                        this.scheduleReconnect();
                    }
                }
            };
        } catch (error) {
            console.error(`[WebSocket] Failed to create connection: ${error instanceof Error ? error.message : String(error)}`);
            this.connected = false;
            this.isLoggedIn = false;
            this.isDisconnecting = false; // 重置断开标记，允许后续重连

            // 首次连接失败时，安排重连
            this.scheduleReconnect();
        }
    }

    /**
     * 业务逻辑：主动断开 WebSocket 连接，清理所有定时器和事件监听器，停止心跳和重连，用于正常关闭连接
     *
     * 实现方式：
     * 1. 设置 isDisconnecting 标志，防止自动重连
     * 2. 清除重连定时器
     * 3. 停止心跳定时器
     * 4. 清理 WebSocket 连接和事件监听器
     * 5. 重置所有状态标志
     *
     * 注意事项：
     * - 主动断开后不会触发自动重连
     * - 断开操作会立即执行，不会等待消息发送完成
     * - 断开后会重置所有状态，需要重新调用 connect() 才能连接
     *
     * 相关代码：src/executor/WebSocketConnector.ts - cleanupWebSocket() 方法（清理连接），src/executor/WebSocketConnector.ts - stopHeartbeat() 方法（停止心跳）
     */
    public disconnect(): void {
        this.isDisconnecting = true;

        this.clearReconnectTimer();
        this.stopHeartbeat();

        this.cleanupWebSocket();

        this.ws = null;
        this.connected = false;
        this.isLoggedIn = false;
    }

    /**
     * 业务逻辑：清理 WebSocket 连接，安全地关闭连接并移除所有事件监听器，防止内存泄漏和事件重复触发
     *
     * 实现方式：
     * 1. 检查 WebSocket 状态，只有在未关闭或未关闭中时才关闭
     * 2. 移除所有事件监听器（onopen、onmessage、onerror、onclose）
     * 3. 将 WebSocket 引用设置为 null
     *
     * 注意事项：
     * - 如果 WebSocket 已经关闭或正在关闭，不会重复关闭
     * - 移除事件监听器可以防止内存泄漏
     * - 清理过程中的异常会被捕获并记录警告，不会抛出
     *
     * 相关代码：src/executor/WebSocketConnector.ts - disconnect() 方法（主动断开时调用），src/executor/WebSocketConnector.ts - connect() 方法（连接前清理旧连接）
     */
    private cleanupWebSocket(): void {
        try {
            if (this.ws) {
                // 只有在未关闭或未关闭中时才关闭
                if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
                    this.ws.close();
                }

                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onerror = null;
                this.ws.onclose = null;
                this.ws = null;
            }
        } catch (error) {
            console.warn(`[WebSocket] Error cleaning up WebSocket connection: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 业务逻辑：处理接收到的 WebSocket 消息，解析消息并根据类型分发到对应的处理器，支持登录、心跳、错误和业务消息的处理
     *
     * 实现方式：
     * 1. 验证消息数据格式（必须是字符串）
     * 2. 解析 JSON 字符串为消息对象
     * 3. 处理特殊消息类型（login、heartbeat、error）使用内置处理器
     * 4. 其他消息类型通过 mapMessageTypeToFunction 查找注册的处理器
     * 5. 使用 queueMicrotask 异步处理消息，避免阻塞 WebSocket 消息接收
     *
     * 注意事项：
     * - 消息数据必须是字符串类型，否则抛出异常
     * - 登录、心跳、错误消息有内置处理器，不需要注册
     * - 未注册的消息类型会记录警告但不会抛出异常
     * - 处理器中的异常会被捕获并记录错误日志
     * - 使用 queueMicrotask 确保消息处理不阻塞 WebSocket 接收
     *
     * 相关代码：src/executor/WebSocketConnector.ts - handleLoginResponse() 方法（处理登录响应），src/executor/WebSocketConnector.ts - handleHeartbeatResponse() 方法（处理心跳响应），src/types/websocket_message.ts - WSMessage 接口（消息类型定义）
     */
    private handleMessage(event: MessageEvent): void {
        try {
            // 验证数据格式
            if (!event.data || typeof event.data !== 'string') {
                throw new Error('Invalid message data format, expected string type');
            }

            const message: WSMessage = JSON.parse(event.data);

            // 处理登录响应
            if (message.type === 'login') {
                this.handleLoginResponse(message as WSLoginResponse);
                return;
            }

            // 处理心跳响应
            if (message.type === 'heartbeat') {
                this.handleHeartbeatResponse(message as WSHeartbeatResponse);
                return;
            }

            // 处理错误消息
            if (message.type === 'error') {
                this.handleErrorMessage(message as WSErrorMessage);
                return;
            }

            console.log(`[WebSocket] Received message type: ${message.type}`);

            const handler = this.mapMessageTypeToFunction[message.type];

            if (!handler) {
                console.warn(`[WebSocket] Unknown message type: ${message.type}`);
                return;
            }

            // 使用 queueMicrotask 将消息处理推迟到下一个微任务，避免阻塞 WebSocket 消息接收
            queueMicrotask(() => {
                handler(message).catch((error) => {
                    console.error(`[WebSocket] Error processing message (type: ${message.type}): ${error instanceof Error ? error.message : String(error)}`);
                });
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[WebSocket] Error processing message: ${errorMessage}`);
        }
    }

    /**
     * 业务逻辑：处理服务器返回的心跳响应消息，确认连接仍然存活，用于检测连接状态
     *
     * 实现方式：检查响应中的 success 字段，记录成功或失败的日志
     *
     * 注意事项：
     * - 心跳响应用于确认服务器和客户端之间的连接仍然有效
     * - 如果心跳失败，可能表示连接有问题，但不会自动断开连接
     * - 心跳成功会记录 INFO 级别日志，失败记录 ERROR 级别日志
     *
     * 相关代码：src/executor/WebSocketConnector.ts - sendHeartbeat() 方法（发送心跳），src/types/websocket_message.ts - WSHeartbeatResponse 接口（响应类型定义）
     */
    private handleHeartbeatResponse(message: WSHeartbeatResponse): void {
        if (message.data.success) {
            console.log(`[WebSocket] Received heartbeat response, success: ${message.data.success}`);
        } else {
            console.error(`[WebSocket] Received heartbeat response, failed: ${message.data.success}`);
        }
    }

    /**
     * 业务逻辑：处理服务器返回的登录响应消息，根据登录结果更新登录状态，登录失败时自动断开连接
     *
     * 实现方式：
     * 1. 检查响应中的 success 字段
     * 2. 如果成功，设置 isLoggedIn 为 true，记录节点 ID
     * 3. 如果失败，设置 isLoggedIn 为 false，调用 disconnect() 断开连接
     *
     * 注意事项：
     * - 登录成功后才能处理业务消息
     * - 登录失败会自动断开连接，不会触发自动重连（因为 isDisconnecting 已设置）
     * - 节点 ID 会记录在日志中，用于标识当前节点
     * - 登录失败的错误信息会记录在日志中
     *
     * 相关代码：src/executor/WebSocketConnector.ts - sendLoginMessage() 方法（发送登录），src/executor/WebSocketConnector.ts - disconnect() 方法（断开连接），src/types/websocket_message.ts - WSLoginResponse 接口（响应类型定义）
     */
    private handleLoginResponse(message: WSLoginResponse): void {
        if (message.data.success) {
            this.isLoggedIn = true;
            console.log(`[WebSocket] Login successful, node ID: ${message.data.node_id || 'unknown'}`);
        } else {
            this.isLoggedIn = false;
            this.disconnect();

            console.error(`[WebSocket] Login failed: ${message.data.error || message.data.message || 'unknown error'}`);
        }
    }

    /**
     * 业务逻辑：处理服务器发送的错误消息，记录错误信息用于调试和问题排查
     *
     * 实现方式：从消息中提取错误信息（error 或 message 字段），记录 ERROR 级别日志
     *
     * 注意事项：
     * - 错误消息不会影响连接状态
     * - 错误信息可能来自 error 或 message 字段
     * - 如果两个字段都不存在，使用 'unknown error' 作为默认值
     *
     * 相关代码：src/types/websocket_message.ts - WSErrorMessage 接口（错误消息类型定义）
     */
    private handleErrorMessage(message: WSErrorMessage): void {
        console.error(`[WebSocket] Received error message: ${message.data.error || message.data.message || 'unknown error'}`);
    }

    /**
     * 业务逻辑：向服务器发送心跳消息，保持连接活跃并检测连接状态，定期调用以维持连接
     *
     * 实现方式：创建心跳消息对象（包含当前时间戳），调用 sendMessage() 发送
     *
     * 注意事项：
     * - 心跳消息包含当前时间戳（Date.now()），用于服务器端的时间同步
     * - 发送失败会返回 false，但不会抛出异常
     * - 心跳由 startHeartbeat() 定时调用，不需要手动调用
     *
     * 相关代码：src/executor/WebSocketConnector.ts - startHeartbeat() 方法（启动心跳定时器），src/executor/WebSocketConnector.ts - sendMessage() 方法（发送消息），src/types/websocket_message.ts - WSHeartbeatMessage 接口（心跳消息类型定义）
     */
    private async sendHeartbeat(): Promise<boolean> {
        const message: WSHeartbeatMessage = { type: 'heartbeat', data: { timestamp: Date.now() } } as WSHeartbeatMessage;
        return this.sendMessage(message);
    }

    /**
     * 业务逻辑：向服务器发送登录消息，使用节点配置信息进行身份验证，建立会话
     *
     * 实现方式：
     * 1. 从 nodeManager 获取节点配置（节点名称、ID 等）
     * 2. 创建登录消息对象，包含节点配置信息
     * 3. 将消息序列化为 JSON 字符串
     * 4. 通过 WebSocket 发送消息
     *
     * 注意事项：
     * - 登录消息在连接建立后自动发送，不需要手动调用
     * - 节点配置必须包含必要的字段（如 node_name），否则服务器可能拒绝登录
     * - 发送失败不会抛出异常，但会记录错误日志
     * - 登录结果通过 handleLoginResponse() 处理
     *
     * 相关代码：src/managers/NodeManager.ts - nodeManager 对象（节点配置管理器），src/executor/WebSocketConnector.ts - handleLoginResponse() 方法（处理登录响应），src/types/websocket_message.ts - WSLoginMessage 接口（登录消息类型定义）
     */
    private async sendLoginMessage(): Promise<boolean> {
        const profile = await nodeManager.GetNodeProfile();
        const message: WSLoginMessage = { type: 'login', data: profile } as WSLoginMessage;

        const jsonString = JSON.stringify(message);

        this.ws?.send(jsonString);

        return true;
    }

    /**
     * 业务逻辑：向服务器发送日志消息，将客户端日志信息发送到服务器端，便于服务器端统一管理和监控客户端运行状态
     *
     * 实现方式：
     * 1. 构造日志消息对象（WSLogMessage），包含日志内容、级别、时间戳和来源
     * 2. 如果未提供时间戳，使用当前时间（Date.now()）
     * 3. 调用 sendMessage() 发送消息
     *
     * 注意事项：
     * - message 字段为必需，表示日志消息内容
     * - level 字段为必需，使用 LogLevel 枚举值（DEBUG、INFO、WARN、ERROR）
     * - timestamp 字段为可选，未提供时使用当前时间戳
     * - source 字段为可选，表示日志来源（如模块名、函数名），便于定位问题
     * - 日志消息可用于远程调试、问题排查和运行状态监控
     * - 生产环境建议仅发送 WARN 和 ERROR 级别的日志，减少网络传输
     * - 发送失败会返回 false，但不会抛出异常
     *
     * @param message - 日志消息内容
     * @param level - 日志级别（DEBUG、INFO、WARN、ERROR）
     * @param timestamp - 可选的时间戳，未提供时使用当前时间
     * @param source - 可选的日志来源（如模块名、函数名）
     * @returns 如果成功发送返回 true，否则返回 false
     *
     * 相关代码：src/executor/WebSocketConnector.ts - sendMessage() 方法（发送消息），src/types/websocket_message.ts - WSLogMessage 接口（日志消息类型定义），src/utils/index.ts - LogLevel 枚举（日志级别定义）
     */
    public sendLogMessage(message: string, level: LogLevel, timestamp?: number, source?: string): boolean {
        const logMessage: WSLogMessage = {
            type: 'log',
            data: {
                message,
                level,
                timestamp: timestamp ?? Date.now(),
                ...(source && { source }),
            },
        } as WSLogMessage;
        return this.sendMessage(logMessage);
    }

    /**
     * 业务逻辑：向服务器发送 WebSocket 消息，检查连接状态和消息大小，确保消息能够安全发送
     *
     * 实现方式：
     * 1. 检查 WebSocket 是否打开（isWebSocketOpen）
     * 2. 检查连接状态是否已连接且已登录（isConnected）
     * 3. 将消息序列化为 JSON 字符串
     * 4. 使用 Blob 计算消息大小（字节数）
     * 5. 如果消息超过 MAX_MESSAGE_SIZE（10MB），拒绝发送并记录错误
     * 6. 通过 WebSocket.send() 发送消息
     *
     * 注意事项：
     * - 只有在连接已建立且已登录时才能发送消息
     * - 消息大小限制为 10MB，超过限制不会发送
     * - 发送失败会清理 WebSocket 连接并返回 false
     * - 消息必须是可序列化为 JSON 的对象
     * - 发送失败不会抛出异常，只返回 false
     *
     * @param message - 要发送的消息对象，必须符合 WSMessage 接口定义
     * @returns 如果成功发送返回 true，否则返回 false
     *
     * 相关代码：src/executor/WebSocketConnector.ts - isWebSocketOpen() 方法（检查连接状态），src/executor/WebSocketConnector.ts - isConnected() 方法（检查登录状态），src/types/websocket_message.ts - WSMessage 接口（消息类型定义）
     */
    public sendMessage(message: WSMessage): boolean {
        try {
            if (this.isWebSocketOpen() === false) {
                console.warn(`[WebSocket] Cannot send message, WebSocket not connected or not open (message type: ${message.type})`);
                return false;
            }

            if (this.isConnected() === false) {
                console.warn(`[WebSocket] Cannot send message, WebSocket not connected or not logged in (message type: ${message.type})`);
                return false;
            }

            const jsonString = JSON.stringify(message);

            // 检查消息大小（使用 Blob 获取准确的字节数）
            const blob = new Blob([jsonString]);
            const sizeInBytes = blob.size;

            if (sizeInBytes > MAX_MESSAGE_SIZE) {
                console.error(`[WebSocket] Message too large (${sizeInBytes} bytes), exceeds limit (${MAX_MESSAGE_SIZE} bytes), message type: ${message.type}`);
                return false;
            }

            this.ws?.send(jsonString);
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[WebSocket] Failed to send message (type: ${message.type}): ${errorMessage}`);
            this.cleanupWebSocket();
            return false;
        }
    }

    /**
     * 业务逻辑：检查 WebSocket 的原始连接状态（不考虑登录状态），用于判断底层连接是否已建立
     *
     * 实现方式：检查 WebSocket 实例是否存在且 readyState 为 OPEN
     *
     * 注意事项：
     * - 此方法只检查 WebSocket 连接状态，不考虑登录状态
     * - 连接打开但未登录时返回 true
     * - 用于 sendMessage() 等方法的内部检查
     *
     * @returns 如果 WebSocket 已打开返回 true，否则返回 false
     *
     * 相关代码：src/executor/WebSocketConnector.ts - isConnected() 方法（检查完整连接状态），src/executor/WebSocketConnector.ts - sendMessage() 方法（发送前检查）
     */
    public isWebSocketOpen(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * 业务逻辑：检查完整的连接状态（连接已建立且已登录），用于判断是否可以发送业务消息
     *
     * 实现方式：
     * 1. 检查 WebSocket 实际状态（isWebSocketOpen）
     * 2. 检查内部状态标志（connected && isLoggedIn）
     * 3. 如果状态不一致（标记为已连接但 WebSocket 未打开），修正状态并返回 false
     *
     * 注意事项：
     * - 只有在连接已建立且已登录时才返回 true
     * - 会检查实际 WebSocket 状态，防止 Service Worker 休眠后状态不一致
     * - 如果检测到状态不一致，会自动修正并返回 false
     * - 状态不一致时会停止心跳，防止无效操作
     *
     * @returns 如果已连接且已登录返回 true，否则返回 false
     *
     * 相关代码：src/executor/WebSocketConnector.ts - isWebSocketOpen() 方法（检查原始连接状态），src/executor/WebSocketConnector.ts - sendMessage() 方法（发送前检查）
     */
    public isConnected(): boolean {
        // 实际检查 WebSocket 状态，防止 Service Worker 休眠后状态不一致
        const wsOpen = this.isWebSocketOpen();
        const stateMatch = this.connected && this.isLoggedIn;

        // 如果状态不一致，修正状态
        if (stateMatch && !wsOpen) {
            console.warn('[WebSocket] State mismatch detected: marked as connected but WebSocket is not open, correcting state');
            this.connected = false;
            this.isLoggedIn = false;
            this.stopHeartbeat();
            return false;
        }

        return wsOpen && stateMatch;
    }

    /**
     * 业务逻辑：启动心跳定时器，定期向服务器发送心跳消息，保持连接活跃并检测连接状态
     *
     * 实现方式：使用 setInterval 创建定时器，每隔 heartbeatInterval（15 秒）调用一次 sendHeartbeat()
     *
     * 注意事项：
     * - 启动前会先停止现有的心跳定时器，避免重复启动
     * - 心跳间隔为 15 秒，可以在构造函数中配置
     * - 心跳失败不会停止定时器，会继续尝试发送
     * - 连接断开时会自动停止心跳
     *
     * 相关代码：src/executor/WebSocketConnector.ts - stopHeartbeat() 方法（停止心跳），src/executor/WebSocketConnector.ts - sendHeartbeat() 方法（发送心跳消息）
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat().catch((error) => {
                console.warn(`[WebSocket] Error sending heartbeat message: ${error instanceof Error ? error.message : String(error)}`);
            });
        }, this.heartbeatInterval);
    }

    /**
     * 业务逻辑：停止心跳定时器，释放资源，用于连接断开或清理时调用
     *
     * 实现方式：如果心跳定时器存在，使用 clearInterval 清除定时器，并将定时器引用设置为 null
     *
     * 注意事项：
     * - 停止心跳后不会自动恢复，需要重新调用 startHeartbeat()
     * - 如果定时器不存在，操作不会报错
     * - 连接断开时会自动调用此方法
     *
     * 相关代码：src/executor/WebSocketConnector.ts - startHeartbeat() 方法（启动心跳），src/executor/WebSocketConnector.ts - disconnect() 方法（断开连接时调用）
     */
    private stopHeartbeat(): void {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * 业务逻辑：安排自动重连，在连接断开后延迟一段时间后尝试重新连接，实现连接的自动恢复
     *
     * 实现方式：
     * 1. 检查是否正在断开连接，如果是则不安排重连
     * 2. 清除现有的重连定时器
     * 3. 使用 setTimeout 创建新的重连定时器
     * 4. 定时器触发后调用 connect() 尝试重连
     *
     * 注意事项：
     * - 只有在非主动断开连接时才会安排重连
     * - 重连间隔为 5 秒（reconnectInterval），可以在构造函数中配置
     * - 如果正在断开连接，不会安排重连
     * - 重连失败会记录错误日志，但不会再次安排重连（由 connect() 内部处理）
     *
     * 相关代码：src/executor/WebSocketConnector.ts - connect() 方法（执行重连），src/executor/WebSocketConnector.ts - clearReconnectTimer() 方法（清除定时器）
     */
    private scheduleReconnect(): void {
        // 如果正在断开连接，不安排重连
        if (this.isDisconnecting === false) {
            this.clearReconnectTimer();
            this.reconnectTimer = setTimeout(() => {
                if (this.isDisconnecting === false) {
                    console.log('[WebSocket] Attempting automatic reconnection...');
                    this.connect().catch((error) => {
                        console.error(`[WebSocket] Automatic reconnection failed: ${error instanceof Error ? error.message : String(error)}`);
                    });
                }
            }, this.reconnectInterval);
        }


    }

    /**
     * 业务逻辑：清除重连定时器，取消已安排的自动重连，用于连接成功或主动断开时调用
     *
     * 实现方式：如果重连定时器存在，使用 clearTimeout 清除定时器，并将定时器引用设置为 null
     *
     * 注意事项：
     * - 清除后不会自动重新安排，需要重新调用 scheduleReconnect()
     * - 如果定时器不存在，操作不会报错
     * - 连接成功时会自动调用此方法，取消重连计划
     *
     * 相关代码：src/executor/WebSocketConnector.ts - scheduleReconnect() 方法（安排重连），src/executor/WebSocketConnector.ts - connect() 方法（连接成功时调用）
     */
    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * 业务逻辑：测试 WebSocket 连接是否可用，创建临时连接验证 URL 的有效性，用于连接配置验证
     *
     * 实现方式：
     * 1. 验证 URL 格式（必须是字符串且以 ws:// 或 wss:// 开头）
     * 2. 创建临时的 WebSocket 连接
     * 3. 监听连接事件（onopen、onerror、onclose）
     * 4. 设置超时定时器
     * 5. 连接成功或失败后清理临时连接和定时器
     * 6. 返回连接是否成功
     *
     * 注意事项：
     * - 此方法创建的是临时测试连接，不会影响主连接
     * - 超时时间默认 5 秒，可以在参数中自定义
     * - URL 格式验证失败会返回 false 并记录错误日志
     * - 测试连接会在完成后自动关闭
     * - 使用 Promise 和 cleanup 函数确保资源正确释放
     *
     * @param url - WebSocket URL，必须以 ws:// 或 wss:// 开头
     * @param timeout - 超时时间（毫秒），默认 5000ms
     * @returns 如果连接成功返回 true，否则返回 false
     *
     * 相关代码：src/entrypoints/popup/components/ - 可能用于连接配置界面
     */
    public async testConnection(url: string, timeout: number = 5000): Promise<boolean> {
        // 验证 URL
        if (!url || typeof url !== 'string') {
            console.error(`[WebSocket] Invalid WebSocket URL: ${url}`);
            return false;
        }

        // 验证 URL 格式
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
            console.error(`[WebSocket] Invalid URL format, must start with ws:// or wss://: ${url}`);
            return false;
        }

        return new Promise((resolve) => {
            let testWs: WebSocket | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let resolved = false;

            const cleanup = () => {
                if (resolved) {
                    return;
                }
                resolved = true;

                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                if (testWs) {
                    try {
                        // 移除事件监听器
                        testWs.onopen = null;
                        testWs.onerror = null;
                        testWs.onclose = null;

                        // 关闭连接
                        if (testWs.readyState !== WebSocket.CLOSED && testWs.readyState !== WebSocket.CLOSING) {
                            testWs.close();
                        }
                    } catch (error) {
                        console.warn(`[WebSocket] Error cleaning up test connection: ${error instanceof Error ? error.message : String(error)}`);
                    }
                    testWs = null;
                }
            };

            try {
                testWs = new WebSocket(url);

                testWs.onopen = () => {
                    console.log('[WebSocket] Test connection successful');
                    cleanup();
                    resolve(true);
                };

                testWs.onerror = (error) => {
                    console.error(`[WebSocket] Test connection error: ${error instanceof Error ? error.message : String(error)}`);
                    cleanup();
                    resolve(false);
                };

                testWs.onclose = (event) => {
                    if (!resolved) {
                        console.log(`[WebSocket] Test connection closed, code: ${event.code}`);
                        cleanup();
                        resolve(false);
                    }
                };

                // 设置超时
                timeoutId = setTimeout(() => {
                    if (!resolved) {
                        console.warn(`[WebSocket] Test connection timeout (${timeout}ms)`);
                        cleanup();
                        resolve(false);
                    }
                }, timeout);
            } catch (error) {
                console.error(`[WebSocket] Failed to create test connection: ${error instanceof Error ? error.message : String(error)}`);
                cleanup();
                resolve(false);
            }
        });
    }
}