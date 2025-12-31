/**
 * HTTP 消息数据映射类型
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
 * HTTP 结果数据映射类型
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
 * HTTP request 消息数据映射类型
 */
export interface HttpRequestMessage extends HttpMessage {
    type: 'http_request';
}

/**
 * HTTP request 结果数据映射类型
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

