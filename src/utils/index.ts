import type { ContentScriptMessageType, BackgroundScriptMessageType, PopupScriptMessageType } from '../types';

/**
 * 生成UUID
 * 
 * @returns 生成的 UUID
 */
export function GenerateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * 生成隨機字符串(14位字符)
 * 
 * @param length - 字符串长度(默认14位)
 * @returns 生成的隨機字符串
 */
export function GenerateRandomString(length: number = 14): string {
    return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * 转义 CSS 选择器中的特殊字符
 * @param value - 需要转义的值
 * @returns 转义后的值
 */
export function EscapeCSSSelector(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
}

/**
 * 发送消息到内容脚本
 * 
 * @param tabId - 标签页ID
 * @param message - 消息
 * @returns 发送结果
 */
export async function SendMessageToContentScript(tabId: number, message: ContentScriptMessageType): Promise<any> {
    return new Promise((resolve, reject) => {
        browser.tabs.sendMessage(tabId, message, (result) => {
            if (browser.runtime.lastError) {
                reject(new Error(browser.runtime.lastError.message || '消息发送失败'));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * 发送消息到背景脚本
 * 
 * @param message - 消息
 * @returns 发送结果
 */
export async function SendMessageToBackgroundScript(message: BackgroundScriptMessageType): Promise<any> {
    return new Promise((resolve, reject) => {
        browser.runtime.sendMessage(message, (result) => {
            if (browser.runtime.lastError) {
                reject(new Error(browser.runtime.lastError.message || '消息发送失败'));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * 发送消息到 popup 窗口
 * 
 * @param message - 消息
 * @returns 发送结果
 */
export async function SendMessageToPopupWindow(message: PopupScriptMessageType): Promise<any> {
    return await browser.runtime.sendMessage(message);
}

/**
 * 执行 CDP 命令
 * 
 * @param tabId - 标签页ID
 * @param method - CDP 方法名（例如 'DOM.querySelector', 'Input.dispatchMouseEvent', 'Page.navigate' 等）
 * @param params - CDP 命令参数（可选，根据具体命令而定）
 * @returns CDP 命令执行结果（原生 CDP 协议响应）
 * 
 * @remarks
 * 使用 browser.debugger.sendCommand API 执行 CDP 命令
 * 
 * 此函数可以执行所有 Chrome DevTools Protocol (CDP) 支持的命令，包括：
 * - 所有 Domain 的所有方法（DOM, Input, Page, Network, Runtime, Performance, Debugger, CSS, Overlay, Emulation 等）
 * - 所有版本的 CDP 命令（1.0, 1.1, 1.2, 1.3 等）
 * - 所有参数格式和返回格式都遵循原生 CDP 协议规范
 * 
 * 使用示例：
 * ```typescript
 * // DOM 操作
 * const result = await ExecuteCDPCommand(tabId, 'DOM.querySelector', { nodeId: 1, selector: '#myElement' });
 * 
 * // 输入操作
 * await ExecuteCDPCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 100, y: 200, button: 'left' });
 * 
 * // 页面操作
 * await ExecuteCDPCommand(tabId, 'Page.navigate', { url: 'https://example.com' });
 * 
 * // 运行时操作
 * const evalResult = await ExecuteCDPCommand(tabId, 'Runtime.evaluate', { expression: 'document.title' });
 * ```
 * 
 * 注意：
 * - 执行前需要确保已通过 browser.debugger.attach 连接到标签页
 * - 某些 Domain 可能需要先启用（如 DOM.enable, Runtime.enable），但这是通过发送相应的 CDP 命令来完成的
 * - 返回的结果是原生的 CDP 协议响应，无需额外转换
 */
export async function ExecuteCDPCommand(tabId: number, method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
        browser.debugger.sendCommand({ tabId: tabId }, method, params, (result) => {
            if (browser.runtime.lastError) {
                reject(new Error(browser.runtime.lastError.message || `CDP命令执行失败: ${method}`));
            } else {
                resolve(result);
            }
        });
    });
}