import { ExecuteCDPCommand } from '../utils';

/**
 * CDP 命令请求接口
 */
export interface CDPCommandRequest {
    id?: string | number;           // 请求ID，用于匹配请求和响应
    tabId: number;                   // 标签页ID
    method: string;                  // CDP 方法名，例如 'DOM.querySelector', 'Input.dispatchMouseEvent' 等
    params?: any;                    // CDP 命令参数
}

/**
 * CDP 命令响应接口
 */
export interface CDPCommandResponse {
    id?: string | number;            // 请求ID，与请求中的 id 对应
    result?: any;                    // CDP 命令执行结果（成功时）
    error?: {                        // CDP 命令执行错误（失败时）
        code: number;                // 错误代码
        message: string;             // 错误消息
        data?: any;                  // 错误数据
    };
}

/**
 * CDP 命令执行器
 * 用于执行 Chrome DevTools Protocol (CDP) 命令
 * 使用原生的 browser.debugger API 执行 CDP 命令
 * 
 * @remarks
 * 此执行器可以执行所有浏览器插件能够执行的 CDP 命令，包括但不限于：
 * - DOM 操作：DOM.querySelector, DOM.querySelectorAll, DOM.getDocument, DOM.getBoxModel 等
 * - 输入操作：Input.dispatchMouseEvent, Input.dispatchKeyEvent 等
 * - 页面操作：Page.navigate, Page.getLayoutMetrics, Page.captureScreenshot 等
 * - 网络监控：Network.enable, Network.getResponseBody 等
 * - 运行时操作：Runtime.evaluate, Runtime.callFunctionOn 等
 * - 性能分析：Performance.enable, Performance.getMetrics 等
 * - 调试操作：Debugger.enable, Debugger.setBreakpoint 等
 * - 以及其他所有 CDP 协议支持的命令
 * 
 * 使用 browser.debugger.sendCommand API，这是 Chrome 扩展中执行 CDP 命令的标准方法，
 * 支持所有 CDP 协议定义的命令，无任何限制。
 */
export class CDPExecutor {
    /**
     * 执行 CDP 命令
     * @param request - CDP 命令请求
     * @returns Promise，解析为 CDP 命令响应
     * @remarks
     * 使用原生的 browser.debugger.sendCommand API 执行 CDP 命令
     * 返回原生的 CDP 协议响应结果
     * 
     * 此方法可以执行所有 CDP 协议支持的命令，包括：
     * - 所有 Domain 的所有方法（DOM, Input, Page, Network, Runtime, Performance, Debugger 等）
     * - 所有版本的 CDP 命令（1.0, 1.1, 1.2, 1.3 等）
     * - 所有参数格式和返回格式都遵循原生 CDP 协议规范
     * 
     * 注意：某些 Domain 可能需要先启用（如 DOM.enable, Runtime.enable），
     * 但这是通过发送相应的 CDP 命令来完成的，所以当前实现已经支持。
     */
    public async ExecuteCommand(request: CDPCommandRequest): Promise<CDPCommandResponse> {
        const { id, tabId, method, params } = request;

        try {
            // 验证必需参数
            if (!tabId || !method) {
                return {
                    id,
                    error: {
                        code: -32602, // Invalid params
                        message: 'Missing required parameters: tabId and method are required'
                    }
                };
            }

            // 确保 CDP 已连接到标签页
            await this.ensureCDPConnected(tabId);

            // 执行 CDP 命令（使用原生的 ExecuteCDPCommand 函数）
            const result = await ExecuteCDPCommand(tabId, method, params);

            // 返回原生的 CDP 协议响应结果
            return {
                id,
                result: result
            };
        } catch (error) {
            // 处理错误
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorCode = this.getErrorCode(errorMessage);

            return {
                id,
                error: {
                    code: errorCode,
                    message: errorMessage,
                    data: error instanceof Error ? { stack: error.stack } : undefined
                }
            };
        }
    }

    /**
     * 批量执行 CDP 命令
     * @param requests - CDP 命令请求数组
     * @returns Promise，解析为 CDP 命令响应数组
     */
    public async ExecuteCommands(requests: CDPCommandRequest[]): Promise<CDPCommandResponse[]> {
        const promises = requests.map(request => this.ExecuteCommand(request));
        return Promise.all(promises);
    }

    /**
     * 确保 CDP 已连接到指定标签页
     * @param tabId - 标签页ID
     * @remarks
     * 使用 browser.debugger API 连接到标签页，版本为 1.3
     * 如果已经连接（可能是其他扩展或 DevTools），会忽略相关错误
     */
    private async ensureCDPConnected(tabId: number): Promise<void> {
        try {
            const target: Browser.debugger.Debuggee = { tabId };
            // 连接到标签页，使用 CDP 版本 1.3
            await browser.debugger.attach(target, '1.3');
        } catch (error) {
            // 如果已经连接，忽略错误（可能是其他扩展或 DevTools 已连接）
            if (browser.runtime.lastError) {
                const errorMsg = browser.runtime.lastError.message || '';
                // 忽略"另一个调试器已连接"的错误（可能是其他扩展或DevTools）
                if (!errorMsg.includes('Another debugger') && !errorMsg.includes('already attached')) {
                    // 如果是其他错误，抛出异常
                    throw new Error(`Failed to attach debugger to tab ${tabId}: ${errorMsg}`);
                }
            }
        }
    }

    /**
     * 根据错误消息获取错误代码
     * @param errorMessage - 错误消息
     * @returns 错误代码
     */
    private getErrorCode(errorMessage: string): number {
        // CDP 标准错误代码
        if (errorMessage.includes('not found') || errorMessage.includes('不存在')) {
            return -32601; // Method not found
        }
        if (errorMessage.includes('Invalid') || errorMessage.includes('无效')) {
            return -32602; // Invalid params
        }
        if (errorMessage.includes('timeout') || errorMessage.includes('超时')) {
            return -32000; // Server error (timeout)
        }
        if (errorMessage.includes('permission') || errorMessage.includes('权限')) {
            return -32001; // Server error (permission denied)
        }
        // 默认服务器错误
        return -32000; // Server error
    }
}

/**
 * 导出全局 CDP 执行器
 */
export let cdpExecutor: CDPExecutor = new CDPExecutor();

