import { WEBSOCKET_CONN_URL } from '../consts';
import type { WSMessage, WSLoginMessage, WSLoginResponse, WSHeartbeatMessage, WSHeartbeatResponse, WSErrorMessage, TabInfo } from '../types';
import { OutputLogToFile, LogLevel } from '../utils';
import { nodeConfig } from '../managers';

// 检查消息大小，避免发送过大的消息
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB

const HEARTBEAT_INTERVAL = 30000; // 30秒心跳间隔
const RECONNECT_INTERVAL = 5000; // 5秒重连间隔

/**
 * WebSocket连接器
 * 用于管理与服务器的通信，包括连接、重连、心跳和消息处理
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
     * 注册消息类型处理器
     * @param type - 消息类型
     * @param func - 消息处理函数
     */
    public registerMessageTypeHandler(type: string, func: (message: WSMessage) => Promise<void>): void {
        this.mapMessageTypeToFunction[type] = func;
    }

    /**
     * 连接 WebSocket
     * @throws {Error} 如果 URL 无效或连接失败
     */
    public async connect(): Promise<void> {
        // 如果已经连接且已登录，直接返回
        if (this.isWebSocketOpen() && this.isConnected()) {
            OutputLogToFile('[WebSocket] Already connected and logged in, returning', { level: LogLevel.INFO });
            return;
        }

        // 如果正在断开连接，不进行重连
        if (this.isDisconnecting) {
            OutputLogToFile('[WebSocket] Disconnecting, waiting for disconnect to complete', { level: LogLevel.INFO });
            return;
        }

        // 如果正在连接中，等待或返回
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            OutputLogToFile('[WebSocket] Connecting, waiting for connection to complete', { level: LogLevel.INFO });
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
                OutputLogToFile('[WebSocket] Connection established', { level: LogLevel.INFO });

                this.connected = true;
                this.isDisconnecting = false;

                // 异步发送登录消息，不阻塞连接
                this.sendLoginMessage().catch(() => {
                    OutputLogToFile('[WebSocket] Failed to send login message', { level: LogLevel.ERROR });
                    this.cleanupWebSocket();
                });

                // 发送所有标签页信息
                // this.sendAllTabsInfo().catch(() => {
                //     OutputLogToFile('[WebSocket] Failed to send all tabs info', { level: LogLevel.ERROR });
                // });

                this.startHeartbeat();
                this.clearReconnectTimer();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.ws.onerror = (error) => {
                OutputLogToFile(`[WebSocket] Connection error: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            };

            this.ws.onclose = (event) => {
                OutputLogToFile(`[WebSocket] Connection closed, code: ${event.code}, reason: ${event.reason || 'none'}`, { level: LogLevel.INFO });

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
            OutputLogToFile(`[WebSocket] Failed to create connection: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            this.connected = false;
            this.isLoggedIn = false;
            this.isDisconnecting = false; // 重置断开标记，允许后续重连
            throw error;
        }
    }

    /**
     * 主动断开连接
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
     * 清理 WebSocket 连接
     * @param ws - 要清理的 WebSocket 实例
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
            OutputLogToFile(`[WebSocket] Error cleaning up WebSocket connection: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        }
    }

    /**
     * 处理接收到的消息
     * @param event - WebSocket 消息事件
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

            OutputLogToFile(`[WebSocket] Received message type: ${message.type}`, { level: LogLevel.INFO });

            const handler = this.mapMessageTypeToFunction[message.type];

            if (!handler) {
                OutputLogToFile(`[WebSocket] Unknown message type: ${message.type}`, { level: LogLevel.WARN });
                return;
            }

            // 使用 queueMicrotask 将消息处理推迟到下一个微任务，避免阻塞 WebSocket 消息接收
            queueMicrotask(() => {
                handler(message).catch((error) => {
                    OutputLogToFile(`[WebSocket] Error processing message (type: ${message.type}): ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                });
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            OutputLogToFile(`[WebSocket] Error processing message: ${errorMessage}`, { level: LogLevel.ERROR });
        }
    }

    /**
     * 处理心跳响应消息
     * @param message - 心跳响应消息
     */
    private handleHeartbeatResponse(message: WSHeartbeatResponse): void {
        if (message.data.success) {
            OutputLogToFile(`[WebSocket] Received heartbeat response, success: ${message.data.success}`, { level: LogLevel.INFO });
        } else {
            OutputLogToFile(`[WebSocket] Received heartbeat response, failed: ${message.data.success}`, { level: LogLevel.ERROR });
        }
    }

    /**
     * 处理登录响应消息
     * @param message - 登录响应消息
     */
    private handleLoginResponse(message: WSLoginResponse): void {
        if (message.data.success) {
            this.isLoggedIn = true;
            OutputLogToFile(`[WebSocket] Login successful, node ID: ${message.data.node_id || 'unknown'}`, { level: LogLevel.INFO });
        } else {
            this.isLoggedIn = false;
            this.disconnect();

            OutputLogToFile(`[WebSocket] Login failed: ${message.data.error || message.data.message || 'unknown error'}`, { level: LogLevel.ERROR });
        }
    }

    /**
     * 处理Error消息
     * @param message - Error消息
     */
    private handleErrorMessage(message: WSErrorMessage): void {
        OutputLogToFile(`[WebSocket] Received error message: ${message.data.error || message.data.message || 'unknown error'}`, { level: LogLevel.ERROR });
    }

    /**
     * 发送心跳消息
     */
    private async sendHeartbeat(): Promise<boolean> {
        const message: WSHeartbeatMessage = { type: 'heartbeat', data: { timestamp: Date.now() } } as WSHeartbeatMessage;
        return this.sendMessage(message);
    }

    /**
     * 发送登录消息
     * @throws {Error} 如果获取节点配置失败或发送失败
     */
    private async sendLoginMessage(): Promise<boolean> {
        const profile = await nodeConfig.GetNodeProfile();
        const message: WSLoginMessage = { type: 'login', data: profile } as WSLoginMessage;

        const jsonString = JSON.stringify(message);

        this.ws?.send(jsonString);

        return true;
    }

    /**
     * 发送所有标签页信息
     */
    private async sendAllTabsInfo(): Promise<boolean> {
        const tabs = await browser.tabs.query({});

        for (const tab of tabs) {
            const message: WSMessage = {
                type: 'tabs', data: {
                    tabId: tab.id as number,
                    tabIndex: tab.index as number,
                    url: tab.url as string
                } as TabInfo
            } as WSMessage;
            this.sendMessage(message);
        }

        return true;
    }

    /**
     * 发送消息
     * @param message - 要发送的消息
     * @returns 是否成功发送
     * @remarks
     * 检查消息大小，避免发送过大的消息导致阻塞
     */
    public sendMessage(message: WSMessage): boolean {
        try {
            if (this.isWebSocketOpen() === false) {
                OutputLogToFile(`[WebSocket] Cannot send message, WebSocket not connected or not open (message type: ${message.type})`, { level: LogLevel.WARN });
                return false;
            }

            if (this.isConnected() === false) {
                OutputLogToFile(`[WebSocket] Cannot send message, WebSocket not connected or not logged in (message type: ${message.type})`, { level: LogLevel.WARN });
                return false;
            }

            const jsonString = JSON.stringify(message);

            // 检查消息大小（使用 Blob 获取准确的字节数）
            const blob = new Blob([jsonString]);
            const sizeInBytes = blob.size;

            if (sizeInBytes > MAX_MESSAGE_SIZE) {
                OutputLogToFile(`[WebSocket] Message too large (${sizeInBytes} bytes), exceeds limit (${MAX_MESSAGE_SIZE} bytes), message type: ${message.type}`, { level: LogLevel.ERROR });
                return false;
            }

            this.ws?.send(jsonString);
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            OutputLogToFile(`[WebSocket] Failed to send message (type: ${message.type}): ${errorMessage}`, { level: LogLevel.ERROR });
            this.cleanupWebSocket();
            return false;
        }
    }

    /**
     * 获取原始连接状态（不考虑登录状态）
     * @returns 是否已建立 WebSocket 连接
     */
    public isWebSocketOpen(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * 获取连接状态
     * @returns 是否已连接且已登录
     */
    public isConnected(): boolean {
        return this.connected && this.isLoggedIn;
    }

    /**
     * 开始心跳
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat().catch((error) => {
                OutputLogToFile(`[WebSocket] Error sending heartbeat message: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            });
        }, this.heartbeatInterval);
    }

    /**
     * 停止心跳
     */
    private stopHeartbeat(): void {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * 安排重连
     */
    private scheduleReconnect(): void {
        // 如果正在断开连接，不安排重连
        if (this.isDisconnecting === false) {
            this.clearReconnectTimer();
            this.reconnectTimer = setTimeout(() => {
                if (this.isDisconnecting === false) {
                    OutputLogToFile('[WebSocket] Attempting automatic reconnection...', { level: LogLevel.INFO });
                    this.connect().catch((error) => {
                        OutputLogToFile(`[WebSocket] Automatic reconnection failed: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                    });
                }
            }, this.reconnectInterval);
        }


    }

    /**
     * 清除重连定时器
     */
    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * 测试连接
     * @param url - WebSocket URL
     * @param timeout - 超时时间（毫秒），默认 5000ms
     * @returns 连接是否成功
     */
    public async testConnection(url: string, timeout: number = 5000): Promise<boolean> {
        // 验证 URL
        if (!url || typeof url !== 'string') {
            OutputLogToFile(`[WebSocket] Invalid WebSocket URL: ${url}`, { level: LogLevel.ERROR });
            return false;
        }

        // 验证 URL 格式
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
            OutputLogToFile(`[WebSocket] Invalid URL format, must start with ws:// or wss://: ${url}`, { level: LogLevel.ERROR });
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
                        OutputLogToFile(`[WebSocket] Error cleaning up test connection: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
                    }
                    testWs = null;
                }
            };

            try {
                testWs = new WebSocket(url);

                testWs.onopen = () => {
                    OutputLogToFile('[WebSocket] Test connection successful', { level: LogLevel.INFO });
                    cleanup();
                    resolve(true);
                };

                testWs.onerror = (error) => {
                    OutputLogToFile(`[WebSocket] Test connection error: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                    cleanup();
                    resolve(false);
                };

                testWs.onclose = (event) => {
                    if (!resolved) {
                        OutputLogToFile(`[WebSocket] Test connection closed, code: ${event.code}`, { level: LogLevel.INFO });
                        cleanup();
                        resolve(false);
                    }
                };

                // 设置超时
                timeoutId = setTimeout(() => {
                    if (!resolved) {
                        OutputLogToFile(`[WebSocket] Test connection timeout (${timeout}ms)`, { level: LogLevel.WARN });
                        cleanup();
                        resolve(false);
                    }
                }, timeout);
            } catch (error) {
                OutputLogToFile(`[WebSocket] Failed to create test connection: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                cleanup();
                resolve(false);
            }
        });
    }
}

// 初始化WebSocket连接器
export let wsConnector: WebSocketConnector = new WebSocketConnector(WEBSOCKET_CONN_URL);