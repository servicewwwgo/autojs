import type { WSMessage } from '../types';
import { nodeConfig } from '../managers';

// 检查消息大小，避免发送过大的消息
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB

// WebSocket 默认连接 URL
const WEBSOCKET_CONN_URL = 'ws://localhost:8080';

/**
 * WebSocket连接器
 * 用于管理与服务器的通信，包括连接、重连、心跳和消息处理
 */
export class WebSocketConnector {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectInterval: number = 5000; // 5秒重连间隔
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatInterval: number = 30000; // 30秒心跳间隔
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
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.connected && this.isLoggedIn) {
            console.log('[WebSocket] 已连接且已登录，直接返回');
            return;
        }

        // 如果正在断开连接，不进行重连
        if (this.isDisconnecting) {
            console.log('[WebSocket] 正在断开连接，等待断开完成');
            return;
        }

        // 如果正在连接中，等待或返回
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.log('[WebSocket] 正在连接中，等待连接完成');
            return;
        }

        // 先断开旧连接
        this.disconnect();

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WebSocket] 连接已建立');

                this.connected = true;
                this.isDisconnecting = false;

                // 异步发送登录消息，不阻塞连接
                this.sendLoginMessage().catch((error) => {
                    console.error('[WebSocket] 发送登录消息失败:', error);
                    this.disconnect();
                });

                this.startHeartbeat();
                this.clearReconnectTimer();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.ws.onerror = (error) => {
                console.error('[WebSocket] 连接错误:', error);
            };

            this.ws.onclose = (event) => {
                console.log(`[WebSocket] 连接已关闭，代码: ${event.code}, 原因: ${event.reason || '无'}`);

                this.connected = false;
                this.isLoggedIn = false;
                this.stopHeartbeat();

                // 如果不是主动断开连接，则安排重连
                if (!this.isDisconnecting) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            console.error('[WebSocket] 创建连接失败:', error);
            this.connected = false;
            this.isLoggedIn = false;
            throw error;
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
                throw new Error('消息数据格式无效，期望字符串类型');
            }

            const message: WSMessage = JSON.parse(event.data);

            // 处理登录响应
            if (message.type === 'login') {
                this.handleLoginResponse(message);
                return;
            }

            console.log(`[WebSocket] 收到消息类型: ${message.type}`);

            const handler = this.mapMessageTypeToFunction[message.type];

            if (!handler) {
                console.warn(`[WebSocket] 未知消息类型: ${message.type}`);
                return;
            }

            // 使用 queueMicrotask 将消息处理推迟到下一个微任务，避免阻塞 WebSocket 消息接收
            queueMicrotask(() => {
                handler(message).catch((error) => {
                    console.error(`[WebSocket] 处理消息时出错 (类型: ${message.type}):`, error);
                });
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[WebSocket] 处理消息时出错:', errorMessage);
        }
    }

    /**
     * 处理登录响应消息
     * @param message - 登录响应消息
     */
    private handleLoginResponse(message: WSMessage): void {
        if (message.data && typeof message.data === 'object' && 'success' in message.data) {
            const loginData = message.data as { success: boolean; message?: string; error?: string; node_id?: string };

            if (loginData.success) {
                this.isLoggedIn = true;
                console.log(`[WebSocket] 登录成功，节点ID: ${loginData.node_id || '未知'}`);
            } else {
                this.isLoggedIn = false;
                console.error(`[WebSocket] 登录失败: ${loginData.error || loginData.message || '未知错误'}`);
                // 登录失败时断开连接
                this.disconnect();
            }
        } else {
            // 如果没有 success 字段，假设登录成功（向后兼容）
            this.isLoggedIn = true;
            console.log('[WebSocket] 登录响应（兼容模式）');
        }
    }

    /**
     * 断开连接
     */
    public disconnect(): void {
        this.isDisconnecting = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();

        if (this.ws) {
            this.cleanupWebSocket(this.ws);
            this.ws = null;
        }

        this.connected = false;
        this.isLoggedIn = false;
    }

    /**
     * 清理 WebSocket 连接
     * @param ws - 要清理的 WebSocket 实例
     */
    private cleanupWebSocket(ws: WebSocket): void {
        // 移除所有事件监听器，防止触发重连
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        // 只有在未关闭或未关闭中时才关闭
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
            try {
                ws.close();
            } catch (error) {
                console.warn('[WebSocket] 关闭连接时出错:', error);
            }
        }
    }

    /**
     * 发送登录消息
     * @throws {Error} 如果获取节点配置失败或发送失败
     */
    private async sendLoginMessage(): Promise<void> {
        try {
            const profile = await nodeConfig.GetNodeProfile();

            const message: WSMessage = {
                type: 'login',
                data: profile
            };

            const sent = this.sendMessage(message);
            if (!sent) {
                throw new Error('发送登录消息失败，WebSocket 未连接');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[WebSocket] 发送登录消息失败:', errorMessage);
            throw error;
        }
    }

    /**
     * 发送消息
     * @param message - 要发送的消息
     * @returns 是否成功发送
     * @remarks
     * 检查消息大小，避免发送过大的消息导致阻塞
     */
    public sendMessage(message: WSMessage): boolean {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`[WebSocket] 无法发送消息，WebSocket 未连接 (消息类型: ${message.type})`);
            return false;
        }

        try {
            const jsonString = JSON.stringify(message);

            // 检查消息大小
            if (jsonString.length > MAX_MESSAGE_SIZE) {
                console.error(
                    `[WebSocket] 消息过大 (${jsonString.length} bytes)，超过限制 (${MAX_MESSAGE_SIZE} bytes)，消息类型: ${message.type}`
                );
                return false;
            }

            this.ws.send(jsonString);
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[WebSocket] 发送消息失败 (类型: ${message.type}):`, errorMessage);
            return false;
        }
    }

    /**
     * 发送心跳消息
     */
    private sendHeartbeat(): void {
        if (this.connected && this.isLoggedIn) {
            const message: WSMessage = {
                type: 'heartbeat',
                data: { timestamp: Date.now() }
            };
            this.sendMessage(message);
        }
    }

    /**
     * 开始心跳
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat();
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
        if (this.isDisconnecting) {
            return;
        }

        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            if (!this.isDisconnecting) {
                console.log('[WebSocket] 尝试自动重连...');
                this.connect().catch((error) => {
                    console.error('[WebSocket] 自动重连失败:', error);
                });
            }
        }, this.reconnectInterval);
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
     * 获取连接状态
     * @returns 是否已连接且已登录
     */
    public isConnected(): boolean {
        return this.connected && this.isLoggedIn;
    }

    /**
     * 获取原始连接状态（不考虑登录状态）
     * @returns 是否已建立 WebSocket 连接
     */
    public isWebSocketOpen(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
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
            console.error('[WebSocket] 无效的 WebSocket URL:', url);
            return false;
        }

        // 验证 URL 格式
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
            console.error('[WebSocket] URL 格式无效，必须以 ws:// 或 wss:// 开头:', url);
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
                        console.warn('[WebSocket] 清理测试连接时出错:', error);
                    }
                    testWs = null;
                }
            };

            try {
                testWs = new WebSocket(url);

                testWs.onopen = () => {
                    console.log('[WebSocket] 测试连接成功');
                    cleanup();
                    resolve(true);
                };

                testWs.onerror = (error) => {
                    console.error('[WebSocket] 测试连接错误:', error);
                    cleanup();
                    resolve(false);
                };

                testWs.onclose = (event) => {
                    if (!resolved) {
                        console.log(`[WebSocket] 测试连接关闭，代码: ${event.code}`);
                        cleanup();
                        resolve(false);
                    }
                };

                // 设置超时
                timeoutId = setTimeout(() => {
                    if (!resolved) {
                        console.warn(`[WebSocket] 测试连接超时 (${timeout}ms)`);
                        cleanup();
                        resolve(false);
                    }
                }, timeout);
            } catch (error) {
                console.error('[WebSocket] 创建测试连接失败:', error);
                cleanup();
                resolve(false);
            }
        });
    }
}

// 初始化WebSocket连接器
export let wsConnector: WebSocketConnector = new WebSocketConnector(WEBSOCKET_CONN_URL);