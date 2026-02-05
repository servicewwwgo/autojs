import type { HttpMessage, HttpRequestMessage, HttpRequestResult, HttpResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：通过 HTTP 协议执行网络请求，支持 GET、POST、PUT、DELETE 等常用 HTTP 方法，响应来自 WebSocket 的 HTTP 请求命令
 *
 * 实现方式：使用浏览器原生的 fetch API 执行 HTTP 请求，支持自定义请求头、请求体、超时设置，自动处理 JSON 响应解析
 *
 * 注意事项：
 * - 支持所有标准 HTTP 方法，但 GET、HEAD、DELETE、OPTIONS 方法不应包含请求体
 * - 请求体支持字符串和对象类型，对象会自动转换为 JSON 字符串
 * - 默认超时时间为 180 秒，可通过 timeout 参数自定义（单位：秒）
 * - 响应体如果是 JSON 格式会自动解析，否则返回文本
 * - 请求失败会返回错误信息，不会抛出异常
 *
 * 相关代码：src/types/http.ts - HTTP 消息和结果类型定义，src/entrypoints/background.ts - 注册 HTTP 消息处理器
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
     * 业务逻辑：设置 HTTP 执行结果的回调函数，用于将 HTTP 请求的执行结果发送到外部（如 WebSocket 服务器）
     *
     * 实现方式：将回调函数保存到私有属性 sendResult 中，在请求完成后通过此回调发送结果
     *
     * 注意事项：
     * - 必须在处理 HTTP 消息前设置此回调，否则结果无法发送
     * - 请求成功或失败都会通过此回调发送结果
     * - 如果未设置回调，结果仍会生成但不会发送
     *
     * @param sendResult - 发送 HTTP 结果的函数，接收 HttpResult 类型参数
     *
     * 相关代码：src/executor/HttpExecutor.ts - handleMessage() 方法（调用此回调），src/entrypoints/background.ts - 设置 WebSocket 发送回调
     */
    public setSendResult(sendResult: (result: HttpResult) => void): void {
        this.sendResult = sendResult;
    }

    /**
     * 业务逻辑：统一处理来自 WebSocket 的 HTTP 消息，根据消息类型分发到对应的处理方法，实现 HTTP 请求的统一入口
     *
     * 实现方式：使用 mapTypeToFunction 映射表查找对应的处理方法，如果找到则调用处理，如果未找到或处理出错则返回错误结果
     *
     * 注意事项：
     * - 消息类型必须在 mapTypeToFunction 中注册，否则返回 "handler not found" 错误
     * - 处理方法中的异常会被捕获并转换为错误结果返回
     * - 所有结果都会通过 sendResult 回调发送
     * - 会记录消息处理的日志，便于调试
     *
     * @param httpMessage - WebSocket HTTP 消息，必须包含 type 和 id 字段
     *
     * 相关代码：src/executor/HttpExecutor.ts - constructor() 方法（初始化映射表），src/types/http.ts - HttpMessage 接口（消息类型定义）
     */
    public async handleMessage(httpMessage: HttpMessage): Promise<void> {
        let defaultResult: HttpResult | undefined;

        OutputLogToFile(`[HttpExecutor] handle message: ${JSON.stringify(httpMessage)}`, { level: LogLevel.INFO });

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

        if (defaultResult) {
            this.sendResult?.(defaultResult as HttpResult);
        }
    }

    /**
     * 业务逻辑：执行 HTTP 请求，发送请求到指定 URL 并返回响应结果，支持自定义请求方法、请求头、请求体和超时设置
     *
     * 实现方式：
     * 1. 验证请求参数（method、url 必须存在）
     * 2. 准备请求选项（method、headers、body）
     * 3. 处理请求体：字符串直接使用，对象转换为 JSON 字符串并设置 Content-Type
     * 4. 对于不应包含请求体的方法（GET、HEAD、DELETE、OPTIONS），忽略请求体并记录警告
     * 5. 使用 Promise.race 实现超时控制
     * 6. 使用 fetch API 发送请求
     * 7. 解析响应：读取响应头、响应体，如果是 JSON 格式自动解析
     * 8. 返回响应结果（status、statusText、headers、body、url）
     *
     * 注意事项：
     * - method 和 url 必须存在且为字符串类型，否则抛出异常
     * - headers 为可选对象，默认为空对象
     * - body 支持字符串和对象类型，对象会自动转换为 JSON
     * - timeout 单位为秒，默认 180 秒，转换为毫秒后用于超时控制
     * - GET、HEAD、DELETE、OPTIONS 方法不应包含请求体，如果包含会记录警告但继续执行
     * - 响应体只能读取一次，先读取为文本再判断是否为 JSON
     * - 请求失败会返回错误结果，不会抛出异常
     *
     * 相关代码：src/types/http.ts - HttpRequestResult 接口（返回类型定义），浏览器 fetch API 文档
     */
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
        const timeout = msg.data.timeout ? msg.data.timeout * 1000 : 180000; // 默认180秒超时

        // HTTP 方法列表：这些方法不应该包含请求体
        const methodsWithoutBody = ['GET', 'HEAD', 'DELETE', 'OPTIONS'];

        // 准备请求选项
        const fetchOptions: RequestInit = {
            method: method,
            headers: headers,
        };

        // 如果有请求体且方法允许请求体，添加到选项中
        if (body !== undefined && body !== null && !methodsWithoutBody.includes(method)) {
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
        } else if (methodsWithoutBody.includes(method) && body !== undefined && body !== null) {
            // 对于不应该有请求体的方法，记录警告但继续执行
            OutputLogToFile(`[HttpExecutor] Warning: Method ${method} should not have a body, ignoring body`, { level: LogLevel.WARN });
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

            OutputLogToFile(`[HttpExecutor] HTTP request executed successfully, method: ${method}, url: ${url}, status: ${status}, responseBody: ${JSON.stringify(responseBody)}`, { level: LogLevel.INFO });
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
            if (defaultResult) {
                this.sendResult?.(defaultResult as HttpRequestResult);
            }
        }
    }
}
