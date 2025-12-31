import type { HttpMessage, HttpRequestMessage, HttpRequestResult, HttpResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';

/**
 * HTTP 执行器
 * 提供通过 HTTP 协议执行相关功能
 */
export class HttpExecutor {
    private mapTypeToFunction: { [key: string]: (data: any) => Promise<void> } = {};
    private sendResult: ((result: HttpResult) => void) | undefined;

    constructor() {
        // 初始化类型到函数的映射，使用箭头函数确保 this 绑定正确
        this.mapTypeToFunction = {
            'http_request': (data: any) => this.handleHttpRequest(data),
        };
    }

    /**
     * 设置发送 HTTP 结果的函数
     * @param sendResult - 发送结果的函数
     */
    public setSendResult(sendResult: (result: HttpResult) => void): void {
        this.sendResult = sendResult;
    }

    /**
     * 统一的 WebSocket 消息处理接口
     * 根据消息类型分发到相应的处理函数
     * @param message - WebSocket 消息
     * @returns void
     */
    public async handleMessage(httpMessage: HttpMessage): Promise<void> {
        let defaultResult: HttpResult | undefined;

        const handler = this.mapTypeToFunction[httpMessage.type];

        if (handler) {
            try {
                await handler(httpMessage);
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                defaultResult = { type: httpMessage.type, id: httpMessage.id, success: false, error: errorMessage } as HttpResult;
                OutputLogToFile(`[HttpExecutor] handle message error: ${errorMessage}`, { level: LogLevel.ERROR });
            }
        } else {
            const errorMessage = `handler not found: ${httpMessage.type}`;
            defaultResult = { type: httpMessage.type, id: httpMessage.id, success: false, error: errorMessage } as HttpResult;
            OutputLogToFile(`[HttpExecutor] handler not found: ${errorMessage}`, { level: LogLevel.ERROR });
        }

        this.sendResult?.(defaultResult as HttpResult);
    }

    // 执行 HTTP 请求
    private async handleHttpRequest(httpMessage: HttpMessage): Promise<void> {
        const msg: HttpRequestMessage = httpMessage as HttpRequestMessage;
        let defaultResult: HttpRequestResult | undefined;

        if (msg.data === undefined) {
            throw new Error('data is undefined in http_request');
        }

        if (!msg.data.method || typeof msg.data.method !== 'string') {
            throw new Error('method is required and must be a string in http_request');
        }

        if (!msg.data.url || typeof msg.data.url !== 'string') {
            throw new Error('url is required and must be a string in http_request');
        }

        const method = msg.data.method.toUpperCase();
        const url = msg.data.url;
        const headers = msg.data.headers || {};
        const body = msg.data.body;
        const timeout = msg.data.timeout || 30000; // 默认30秒超时

        // 准备请求选项
        const fetchOptions: RequestInit = {
            method: method,
            headers: headers,
        };

        // 如果有请求体，添加到选项中
        if (body !== undefined && body !== null) {
            if (typeof body === 'string') {
                // 如果 body 是字符串，直接使用
                fetchOptions.body = body;
            } else {
                // 如果 body 是对象，转换为 JSON 字符串
                fetchOptions.body = JSON.stringify(body);
                // 如果没有设置 Content-Type，默认设置为 application/json
                if (!headers['Content-Type'] && !headers['content-type']) {
                    fetchOptions.headers = {
                        ...headers,
                        'Content-Type': 'application/json',
                    };
                }
            }
        }

        try {
            // 创建超时 Promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Request timeout after ${timeout}ms`));
                }, timeout);
            });

            // 执行 HTTP 请求（使用 fetch API）
            const fetchPromise = fetch(url, fetchOptions);

            // 等待请求完成或超时
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            // 获取响应状态
            const status = response.status;
            const statusText = response.statusText;

            // 获取响应头
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            // 获取响应体
            let responseBody: string | object;
            const contentType = response.headers.get('content-type') || '';

            // 先读取文本内容（响应体只能读取一次）
            const textBody = await response.text();

            if (contentType.includes('application/json')) {
                // 如果是 JSON，尝试解析
                try {
                    responseBody = JSON.parse(textBody);
                } catch (error) {
                    // 解析失败，返回文本
                    responseBody = textBody;
                }
            } else {
                // 否则返回文本
                responseBody = textBody;
            }

            defaultResult = {
                type: msg.type,
                id: msg.id,
                success: true,
                data: {
                    status: status,
                    statusText: statusText,
                    headers: responseHeaders,
                    body: responseBody,
                    url: response.url || url,
                },
            } as HttpRequestResult;

            OutputLogToFile(`[HttpExecutor] HTTP request executed successfully, method: ${method}, url: ${url}, status: ${status}`, { level: LogLevel.INFO });
            this.sendResult?.(defaultResult as HttpRequestResult);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            defaultResult = {
                type: msg.type,
                id: msg.id,
                success: false,
                error: errorMessage,
            } as HttpRequestResult;

            OutputLogToFile(`[HttpExecutor] HTTP request failed, method: ${method}, url: ${url}, error: ${errorMessage}`, { level: LogLevel.ERROR });
            this.sendResult?.(defaultResult as HttpRequestResult);
        }
    }
}
