/**
 * 业务逻辑：定义通过 WebSocket 发送的 HTTP 请求消息结构，用于在浏览器扩展中执行 HTTP 请求，支持通过服务器远程控制浏览器发起 HTTP 请求
 *
 * 实现方式：使用 TypeScript 接口定义消息结构，包含 type 字段（固定为 'http_request'）、id 字段（请求唯一标识符）和可选的 data 字段（请求参数）
 *
 * 注意事项：
 * - type 字段固定为 'http_request'，用于标识消息类型
 * - id 字段为必需字段，用于标识请求，与响应结果中的 id 对应
 * - data 字段为可选，但实际使用时必须提供，包含 method、url、headers、body、timeout 等请求参数
 * - method 为 HTTP 方法（GET、POST、PUT、DELETE 等），会自动转换为大写
 * - url 为目标 URL，必须是有效的 URL 格式
 * - headers 为请求头，可选字段，使用 Record<string, string> 类型
 * - body 为请求体，可选字段，可以是字符串或对象（对象会自动转换为 JSON）
 * - timeout 为超时时间（秒），可选字段，默认 180 秒
 * - 消息通过 WebSocket 接收，由 HttpExecutor 处理并执行实际的 HTTP 请求
 *
 * 相关代码：src/executor/HttpExecutor.ts - handleMessage() 函数（处理 HTTP 消息），handleHttpRequest() 函数（执行 HTTP 请求），src/entrypoints/background.ts - WebSocket 消息路由（路由 HTTP 消息）
 */
export interface HttpMessage {
    type: 'http_request';
    id: string;
    data?: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: string | object;
        timeout?: number;
    };
}

/**
 * 业务逻辑：定义 HTTP 请求执行结果的基础结构，用于记录请求执行状态、响应信息和错误信息，通过 WebSocket 返回给服务器
 *
 * 实现方式：使用 TypeScript 接口定义结果结构，包含必需字段（type、id、success）和可选字段（error、data）
 *
 * 注意事项：
 * - type 字段为消息类型，通常为 'http_request'，与请求消息的 type 对应
 * - id 字段为请求唯一标识符，与请求消息的 id 对应，用于匹配请求和响应
 * - success 字段为执行是否成功，布尔值，用于快速判断执行状态
 * - error 字段为错误信息，可选字段，仅在执行失败时设置
 * - data 字段为响应数据，可选字段，仅在执行成功时设置，包含 status、statusText、headers、body、url
 * - data.status 为 HTTP 状态码（如 200、404、500 等）
 * - data.statusText 为 HTTP 状态文本（如 'OK'、'Not Found' 等）
 * - data.headers 为响应头，使用 Record<string, string> 类型
 * - data.body 为响应体，可能是字符串或对象（JSON 响应会自动解析为对象）
 * - data.url 为最终请求的 URL（可能经过重定向）
 * - 结果通过 WebSocket 发送给服务器，由 HttpExecutor 的 sendResult 回调函数发送
 *
 * 相关代码：src/executor/HttpExecutor.ts - handleHttpRequest() 函数（生成此类型结果），setSendResult() 方法（设置结果发送回调），src/entrypoints/background.ts - WebSocket 结果发送（发送 HTTP 结果）
 */
export interface HttpResult {
    type: string;
    id: string;
    success: boolean;
    error?: string;
    data?: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string | object;
        url: string;
    };
}

/**
 * 业务逻辑：定义 HTTP 请求消息的具体类型，继承自 HttpMessage，固定 type 为 'http_request'，用于类型安全的 HTTP 请求消息处理
 *
 * 实现方式：继承自 HttpMessage 接口，固定 type 为 'http_request'，确保类型一致性
 *
 * 注意事项：
 * - 此接口与 HttpMessage 在结构上相同，但提供了更明确的类型约束
 * - type 字段固定为 'http_request'，不能为其他值
 * - 用于 HttpExecutor 的类型检查和类型推断，确保处理的是正确的消息类型
 *
 * 相关代码：src/executor/HttpExecutor.ts - handleHttpRequest() 函数（使用此类型进行类型断言）
 */
export interface HttpRequestMessage extends HttpMessage {
    type: 'http_request';
}

/**
 * 业务逻辑：定义 HTTP 请求结果的具体类型，继承自 HttpResult，明确 data 字段的结构，用于类型安全的 HTTP 请求结果处理
 *
 * 实现方式：继承自 HttpResult 接口，明确 data 字段的结构，包含完整的响应信息
 *
 * 注意事项：
 * - 此接口与 HttpResult 在结构上相同，但提供了更明确的类型约束
 * - data 字段的结构已明确，包含 status、statusText、headers、body、url
 * - 用于 HttpExecutor 的类型检查和类型推断，确保返回的是正确的结果类型
 * - 成功时 data 字段必须包含所有响应信息，失败时 error 字段包含错误信息
 *
 * 相关代码：src/executor/HttpExecutor.ts - handleHttpRequest() 函数（返回此类型结果），setSendResult() 方法（发送此类型结果）
 */
export interface HttpRequestResult extends HttpResult {
    data?: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string | object;
        url: string;
    };
}

