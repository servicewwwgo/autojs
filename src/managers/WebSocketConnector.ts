import type { WSMessage, BackgroundScriptMessageType, PopupScriptMessageType } from '../types';
import { SendMessageToBackgroundScript } from '../utils';
import { NodeConfig, InstructionManager, ResultManager } from '.';
import { CDPExecutor, type CDPCommandRequest, type CDPCommandResponse } from './CDPExecutor';

/**
 * WebSocket连接器
 * 用于管理与服务器的通信
 */
export class WebSocketConnector {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 5000; // 5秒重连间隔
  private reconnectTimer: number | null = null;
  private heartbeatInterval: number = 30000; // 30秒心跳间隔
  private heartbeatTimer: number | null = null;
  private isConnected: boolean = false;
  private isLoggedIn: boolean = false;
  private isDisconnecting: boolean = false; // 标记是否正在断开连接，防止重连
  private nodeConfig: NodeConfig;
  private instructionManager: InstructionManager;
  private resultManager: ResultManager;
  private cdpExecutor: CDPExecutor;

  constructor(url: string, nodeConfig: NodeConfig, instructionManager: InstructionManager, resultManager: ResultManager, cdpExecutor?: CDPExecutor) {
    this.url = url;
    this.nodeConfig = nodeConfig;
    this.instructionManager = instructionManager;
    this.resultManager = resultManager;
    this.cdpExecutor = cdpExecutor || new CDPExecutor();
  }

  /**
   * 连接 WebSocket
   * @throws {Error} 如果 URL 无效或连接失败
   */
  public async Connect(): Promise<void> {
    // 如果已经连接，直接返回
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // 如果正在断开连接，不进行重连
    if (this.isDisconnecting) {
      return;
    }

    // 如果正在连接中，等待或返回
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket正在连接中，等待连接完成...');
      return;
    }

    // 清理旧的 WebSocket 连接
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
          this.ws.close();
        }
      } catch (error) {
        console.warn('清理旧 WebSocket 连接时出错:', error);
      }
      this.ws = null;
    }

    try {
      // 验证 URL
      if (!this.url || typeof this.url !== 'string') {
        throw new Error('Invalid WebSocket URL');
      }

      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket连接已建立');
        this.isConnected = true;
        this.isDisconnecting = false;
        // 异步发送登录消息，不阻塞连接
        this.sendLoginMessage().catch((error) => {
          console.error('发送登录消息失败:', error);
        });
        this.startHeartbeat();
        this.clearReconnectTimer();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket连接已关闭', event.code, event.reason);
        this.isConnected = false;
        this.isLoggedIn = false;
        this.stopHeartbeat();

        // 如果不是主动断开连接，则安排重连
        if (!this.isDisconnecting) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('WebSocket连接失败:', error);
      this.ws = null;
      this.isConnected = false;
      this.isLoggedIn = false;

      // 如果不是主动断开连接，则安排重连
      if (!this.isDisconnecting) {
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  /**
   * 断开连接
   */
  public Disconnect(): void {
    this.isDisconnecting = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (this.ws) {
      // 移除所有事件监听器，防止触发重连
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      // 只有在未关闭或未关闭中时才关闭
      if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
        try {
          this.ws.close();
        } catch (error) {
          console.warn('关闭 WebSocket 时出错:', error);
        }
      }
      this.ws = null;
    }

    this.isConnected = false;
    this.isLoggedIn = false;
  }

  /**
   * 发送登录消息
   * @throws {Error} 如果获取节点配置失败
   */
  private async sendLoginMessage(): Promise<void> {
    try {
      const profile = await this.nodeConfig.GetNodeProfile();
      if (!profile) {
        throw new Error('Failed to get node profile');
      }
      const message: WSMessage = {
        type: 'login',
        data: profile
      };
      this.sendMessage(message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('发送登录消息失败:', errorMessage);
      // 登录失败时断开连接
      this.Disconnect();
      throw error;
    }
  }

  /**
   * 发送心跳消息
   */
  private sendHeartbeat(): void {
    if (this.isConnected && this.isLoggedIn) {
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
    // 使用 window.setInterval 或 globalThis.setInterval 来避免类型错误
    this.heartbeatTimer = (typeof window !== 'undefined' ? window : globalThis).setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval) as unknown as number;
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
   * 处理接收到的消息
   * @param data - 接收到的消息数据（字符串）
   * @remarks
   * 消息处理采用非阻塞方式，避免阻塞 WebSocket 事件循环
   */
  private handleMessage(data: string): void {
    // 验证数据格式
    if (!data || typeof data !== 'string') {
      console.warn('收到无效的消息数据:', typeof data);
      return;
    }

    // 检查消息大小，避免处理过大的消息导致阻塞
    const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
    if (data.length > MAX_MESSAGE_SIZE) {
      console.error(`消息过大 (${data.length} bytes)，超过限制 (${MAX_MESSAGE_SIZE} bytes)`);
      if (this.isConnected && this.isLoggedIn) {
        this.SendErrorMessage({
          type: 'message_too_large',
          message: `Message size ${data.length} exceeds limit ${MAX_MESSAGE_SIZE}`
        });
      }
      return;
    }

    try {
      // 使用异步解析，避免大消息阻塞事件循环
      // 注意：JSON.parse 本身是同步的，但我们可以使用 setTimeout 将其推迟到下一个事件循环
      const message: WSMessage = JSON.parse(data);

      // 验证消息格式
      if (!message || typeof message !== 'object' || !message.type) {
        console.warn('收到格式无效的消息:', message);
        return;
      }

      // 使用 setTimeout 将消息处理推迟到下一个事件循环，避免阻塞 WebSocket 消息接收
      setTimeout(() => {
        try {
          switch (message.type) {
            case 'login':
              if (message.data?.success) {
                this.isLoggedIn = true;
                console.log('登录成功');
              } else {
                this.isLoggedIn = false;
                console.error('登录失败:', message.data?.error);
                this.Disconnect();
              }
              break;

            case 'instructions':
              this.handleInstructionsMessage(message.data);
              break;

            case 'cdp':
              // 处理 CDP 命令请求（异步处理，但不阻塞消息处理）
              this.handleCDPMessage(message.data).catch((error) => {
                console.error('处理 CDP 消息时发生未捕获的错误:', error);
              });
              break;

            case 'error':
              console.error('服务器错误:', message.data);
              break;

            case 'heartbeat':
              // 心跳响应，可以在这里更新最后心跳时间
              break;

            case 'result':
              // 结果响应，通常不需要处理
              break;

            case 'tabs':
              // Tabs 响应，通常不需要处理
              break;

            default:
              console.log('未知消息类型:', message.type);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('处理消息时发生错误:', errorMessage);
        }
      }, 0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('解析消息失败:', errorMessage, '原始数据:', data.substring(0, 100));
      // 发送错误响应给服务器（如果可能）
      if (this.isConnected && this.isLoggedIn) {
        this.SendErrorMessage({
          type: 'parse_error',
          message: errorMessage,
          data: data.substring(0, 100)
        });
      }
    }
  }

  /**
   * 处理指令列表消息
   * @param data - 指令数据（应该是指令数组）
   * @remarks
   * 消息发送采用异步非阻塞方式，避免阻塞 WebSocket 消息处理
   */
  private handleInstructionsMessage(data: any): void {
    // 验证数据格式
    if (!data) {
      console.warn('收到空的指令数据');
      return;
    }

    if (!Array.isArray(data)) {
      console.warn('指令数据必须是数组，收到:', typeof data);
      return;
    }

    if (data.length === 0) {
      console.log('收到空的指令数组');
      return;
    }

    // 使用异步函数处理，避免阻塞消息处理
    (async () => {
      try {
        // 按标签页分组指令
        this.instructionManager.AddUnfilteredInstructions(data);

        // 通知background脚本有新指令
        const tabIds = this.instructionManager.GetAllTabIds();
        if (tabIds.length === 0) {
          console.warn('没有找到任何标签页ID');
          return;
        }

        // 并行发送所有消息，但限制并发数量以避免资源耗尽
        const MAX_CONCURRENT = 10; // 最大并发数
        const validTabIds = tabIds.filter((tabId): tabId is number =>
          typeof tabId === 'number' && tabId > 0
        );

        // 分批处理，每批最多 MAX_CONCURRENT 个
        for (let i = 0; i < validTabIds.length; i += MAX_CONCURRENT) {
          const batch = validTabIds.slice(i, i + MAX_CONCURRENT);

          // 并行发送当前批次的消息
          const promises = batch.map(tabId =>
            SendMessageToBackgroundScript({
              type: 'execute_instructions',
              params: { tabId: tabId }
            } as BackgroundScriptMessageType).catch((error) => {
              console.error(`发送执行指令消息到标签页 ${tabId} 失败:`, error);
              return null; // 返回 null 表示失败，但不影响其他消息
            })
          );

          // 等待当前批次完成（但不阻塞下一批次）
          await Promise.allSettled(promises);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('处理指令消息失败:', errorMessage);
      }
    })().catch((error) => {
      // 捕获未处理的错误
      console.error('处理指令消息时发生未捕获的错误:', error);
    });
  }

  /**
   * 处理CDP消息
   * 将来自 WebSocket 的 CDP 命令请求转发给 CDP 执行器执行
   * 并将执行结果通过 WebSocket 返回
   * @param data - CDP 命令请求数据（可以是单个 CDPCommandRequest 或 CDPCommandRequest[]）
   * @remarks
   * 支持单个命令和批量命令：
   * - 单个命令：data 是一个 CDPCommandRequest 对象
   * - 批量命令：data 是一个 CDPCommandRequest[] 数组
   * 
   * 响应格式：
   * - 单个命令：返回单个 CDPCommandResponse
   * - 批量命令：返回 CDPCommandResponse[] 数组
   * 
   * 批量命令会并行执行以提高性能，避免阻塞
   */
  private async handleCDPMessage(data: any): Promise<void> {
    try {
      // 验证数据格式
      if (!data || typeof data !== 'object') {
        this.sendCDPErrorResponse(null, -32602, 'Invalid CDP request: data must be an object or array');
        return;
      }

      // 支持单个命令或批量命令
      const isBatch = Array.isArray(data);
      const requests: CDPCommandRequest[] = isBatch ? data : [data];

      // 如果批量请求为空数组，返回空数组响应
      if (isBatch && requests.length === 0) {
        this.sendCDPResponse([]);
        return;
      }

      // 对于单个命令，使用串行执行（保持原有行为）
      if (!isBatch) {
        try {
          const request = requests[0];

          // 验证请求格式
          if (!request || typeof request !== 'object') {
            const requestId = request && typeof request === 'object' && 'id' in request ? (request as CDPCommandRequest).id : undefined;
            this.sendCDPErrorResponse(requestId ?? null, -32602, 'Invalid request: request must be an object');
            return;
          }

          // 验证必需参数
          if (typeof request.tabId !== 'number' || !request.tabId) {
            this.sendCDPErrorResponse(request.id, -32602, 'Missing or invalid required parameter: tabId must be a number');
            return;
          }

          if (typeof request.method !== 'string' || !request.method) {
            this.sendCDPErrorResponse(request.id, -32602, 'Missing or invalid required parameter: method must be a non-empty string');
            return;
          }

          // 执行 CDP 命令
          const response = await this.cdpExecutor.ExecuteCommand(request);
          this.sendCDPResponse(response);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Unexpected error executing CDP command:`, error);
          const requestId = requests[0]?.id;
          this.sendCDPErrorResponse(requestId ?? null, -32000, `Unexpected error: ${errorMessage}`);
        }
        return;
      }

      // 批量命令：并行执行以提高性能
      // 先验证所有请求，然后并行执行有效的请求
      const validatedRequests: Array<{ index: number; request: CDPCommandRequest }> = [];
      const errorResponses: Array<{ index: number; response: CDPCommandResponse }> = [];

      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];

        // 验证请求格式
        if (!request || typeof request !== 'object') {
          errorResponses.push({
            index: i,
            response: {
              id: undefined,
              error: {
                code: -32602,
                message: 'Invalid request: request must be an object'
              }
            }
          });
          continue;
        }

        // 验证必需参数
        if (typeof request.tabId !== 'number' || !request.tabId) {
          errorResponses.push({
            index: i,
            response: {
              id: request.id,
              error: {
                code: -32602,
                message: 'Missing or invalid required parameter: tabId must be a number'
              }
            }
          });
          continue;
        }

        if (typeof request.method !== 'string' || !request.method) {
          errorResponses.push({
            index: i,
            response: {
              id: request.id,
              error: {
                code: -32602,
                message: 'Missing or invalid required parameter: method must be a non-empty string'
              }
            }
          });
          continue;
        }

        validatedRequests.push({ index: i, request });
      }

      // 并行执行所有有效的请求
      const executionPromises = validatedRequests.map(async ({ index, request }) => {
        try {
          const response = await this.cdpExecutor.ExecuteCommand(request);
          return { index, response };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Unexpected error executing CDP command:`, error);
          return {
            index,
            response: {
              id: request.id,
              error: {
                code: -32000,
                message: `Unexpected error: ${errorMessage}`
              }
            } as CDPCommandResponse
          };
        }
      });

      // 等待所有命令执行完成
      const executionResults = await Promise.all(executionPromises);

      // 合并所有响应（包括验证错误和执行结果），按原始顺序排序
      const allResponses: Array<{ index: number; response: CDPCommandResponse }> = [
        ...errorResponses,
        ...executionResults
      ].sort((a, b) => a.index - b.index);

      // 提取响应数组
      const responses: CDPCommandResponse[] = allResponses.map(item => item.response);

      // 发送批量响应
      this.sendCDPResponse(responses);
    } catch (error) {
      // 处理整体错误（这种情况不应该发生，因为所有错误都应该被捕获）
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('处理 CDP 消息失败:', error);
      this.sendCDPErrorResponse(null, -32000, `Failed to process CDP message: ${errorMessage}`);
    }
  }

  /**
   * 发送CDP命令响应
   * @param response - CDP 命令响应数据
   */
  private sendCDPResponse(response: CDPCommandResponse | CDPCommandResponse[]): void {
    if (this.isConnected && this.isLoggedIn) {
      const message: WSMessage = {
        type: 'cdp',
        data: response
      };
      this.sendMessage(message);
    } else {
      console.warn('WebSocket未连接或未登录，无法发送CDP响应');
    }
  }

  /**
   * 发送CDP错误响应
   * @param id - 请求ID
   * @param code - 错误代码
   * @param message - 错误消息
   */
  private sendCDPErrorResponse(id: string | number | null | undefined, code: number, message: string): void {
    const response: CDPCommandResponse = {
      id: id || undefined,
      error: {
        code,
        message
      }
    };
    this.sendCDPResponse(response);
  }

  /**
   * 发送CDP命令响应（公共方法，用于外部调用）
   * @deprecated 使用 sendCDPResponse 代替
   * @param data - CDP 命令响应数据
   */
  public SendCDPCommandResponse(data: CDPCommandResponse | CDPCommandResponse[]): void {
    this.sendCDPResponse(data);
  }

  /**
   * 发送错误消息
   * @param error - 错误信息（可以是 Error 对象、字符串或任意对象）
   */
  public SendErrorMessage(error: Error | string | Record<string, unknown>): void {
    if (this.isConnected && this.isLoggedIn) {
      // 标准化错误格式
      const errorData = error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : typeof error === 'string'
          ? { message: error }
          : error;

      const message: WSMessage = {
        type: 'error',
        data: errorData
      };
      this.sendMessage(message);
    } else {
      console.warn('WebSocket未连接或未登录，无法发送错误消息');
    }
  }

  /**
   * 发送tabs上线消息
   * @param data - tabs 数据（通常是标签页信息数组或对象）
   */
  public SendTabsMessage(data: unknown): void {
    if (this.isConnected && this.isLoggedIn) {
      const message: WSMessage = {
        type: 'tabs',
        data: data
      };
      this.sendMessage(message);
    } else {
      console.warn('WebSocket未连接或未登录，无法发送tabs消息');
    }
  }

  /**
   * 发送执行结果
   * @returns 是否成功发送
   */
  public SendResults(): boolean {
    try {
      const results = this.resultManager.GetAllResults();

      if (results.length === 0) {
        return false; // 没有结果可发送
      }

      if (!this.isConnected || !this.isLoggedIn) {
        console.warn('WebSocket未连接或未登录，无法发送执行结果');
        return false;
      }

      const message: WSMessage = {
        type: 'result',
        data: results
      };

      const sent = this.sendMessage(message);

      // 只有在成功发送后才清除结果
      if (sent) {
        this.resultManager.ClearAll();
      }

      return sent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('发送执行结果失败:', errorMessage);
      return false;
    }
  }

  /**
   * 发送消息
   * @param message - 要发送的消息
   * @returns 是否成功发送
   * @remarks
   * 检查消息大小，避免发送过大的消息导致阻塞
   */
  private sendMessage(message: WSMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket未连接，无法发送消息');
      return false;
    }

    try {
      const jsonString = JSON.stringify(message);

      // 检查消息大小，避免发送过大的消息
      const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
      if (jsonString.length > MAX_MESSAGE_SIZE) {
        console.error(`消息过大 (${jsonString.length} bytes)，超过限制 (${MAX_MESSAGE_SIZE} bytes)，消息类型: ${message.type}`);
        return false;
      }

      this.ws.send(jsonString);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('发送消息失败:', errorMessage, '消息类型:', message.type);
      return false;
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
    // 使用 window.setTimeout 或 globalThis.setTimeout 来避免类型错误
    this.reconnectTimer = (typeof window !== 'undefined' ? window : globalThis).setTimeout(() => {
      if (!this.isDisconnecting) {
        this.Connect().catch((error) => {
          console.error('自动重连失败:', error);
        });
      }
    }, this.reconnectInterval) as unknown as number;
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
   */
  public IsConnected(): boolean {
    return this.isConnected && this.isLoggedIn;
  }

  /**
   * 测试连接
   * @param url - WebSocket URL
   * @param timeout - 超时时间（毫秒），默认 5000ms
   * @returns 连接是否成功
   */
  public async TestConnection(url: string, timeout: number = 5000): Promise<boolean> {
    // 验证 URL
    if (!url || typeof url !== 'string') {
      console.error('无效的 WebSocket URL:', url);
      return false;
    }

    return new Promise((resolve) => {
      let testWs: WebSocket | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;

          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (testWs) {
            try {
              testWs.onopen = null;
              testWs.onerror = null;
              testWs.onclose = null;
              if (testWs.readyState !== WebSocket.CLOSED && testWs.readyState !== WebSocket.CLOSING) {
                testWs.close();
              }
            } catch (error) {
              console.warn('清理测试 WebSocket 时出错:', error);
            }
            testWs = null;
          }
        }
      };

      try {
        testWs = new WebSocket(url);

        testWs.onopen = () => {
          cleanup();
          resolve(true);
        };

        testWs.onerror = (error) => {
          console.error('测试 WebSocket 连接错误:', error);
          cleanup();
          resolve(false);
        };

        testWs.onclose = (event) => {
          cleanup();
          if (!resolved) {
            resolve(false);
          }
        };

        // 设置超时
        timeoutId = setTimeout(() => {
          cleanup();
          if (!resolved) {
            resolve(false);
          }
        }, timeout);
      } catch (error) {
        console.error('创建测试 WebSocket 连接失败:', error);
        cleanup();
        resolve(false);
      }
    });
  }
}

/**
 * 导出全局WebSocket连接器
 */
export let webSocketConnector: WebSocketConnector | null = null;