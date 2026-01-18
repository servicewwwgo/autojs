import { DEBUG_MODE } from '../consts';
import type { BackgroundScriptMessageType, ContentScriptMessageType, PopupScriptMessageType } from '../types';
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
                reject(new Error(browser.runtime.lastError.message || 'Failed to send message'));
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
                reject(new Error(browser.runtime.lastError.message || 'Failed to send message'));
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
            // 检查 runtime.lastError（API 层面的错误）
            if (browser.runtime.lastError) {
                reject(new Error(browser.runtime.lastError.message || `CDP command execution failed: ${method}`));
                return;
            }

            // 检查 CDP 响应中的错误（CDP 协议层面的错误）
            // CDP 错误响应格式: { code: number, message: string }
            if (result && typeof result === 'object' && 'code' in result && 'message' in result) {
                const errorCode = (result as any).code;
                const errorMessage = (result as any).message;
                // CDP 错误码通常为负数，成功响应不会有 code 字段或 code 为 0
                if (errorCode !== undefined && errorCode !== 0 && errorCode !== null) {
                    reject(new Error(JSON.stringify({ code: errorCode, message: errorMessage })));
                    return;
                }
            }

            resolve(result);
        });
    });
}

/**
 * 确保 Chrome DevTools Protocol (CDP) 已连接到指定标签页
 * @param tabId - 要连接的标签页 ID
 * @remarks
 * 使用 browser.debugger API 连接到标签页，版本为 1.3
 * 如果已经连接（可能是其他扩展或 DevTools），会忽略相关错误
 * 这是执行 CDP 命令的前提条件
 */
export async function EnsureCDPConnected(tabId: number): Promise<void> {
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
                OutputLogToFile(`CDP connection warning: ${errorMsg}`, { level: LogLevel.WARN });
            }
        }
    }
}

/**
 * 断开 CDP 连接
 * @param tabId - 要断开的标签页 ID
 * @remarks
 * 使用 browser.debugger.detach API 断开 CDP 连接
 * 如果断开失败，会抛出错误
 */
export async function DisconnectCDP(tabId: number): Promise<void> {
    try {
        const target: Browser.debugger.Debuggee = { tabId };
        // 断开 CDP 连接
        await browser.debugger.detach(target);
    } catch (error) {
        OutputLogToFile(`CDP disconnect error: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
    }
}

/**
 * 日志级别
 */
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

/**
 * 日志配置选项
 */
export interface LogOptions {
    level?: LogLevel;
    includeTimestamp?: boolean;
    includeSource?: boolean;
    source?: string;
    filePath?: string;
}

// 日志缓冲队列
let logBuffer: Array<{ message: string; timestamp: string; level: LogLevel; source?: string }> = [];
let logBufferTimer: ReturnType<typeof setTimeout> | null = null;
const LOG_BUFFER_SIZE = 10; // 缓冲10条日志后批量写入
const LOG_BUFFER_TIMEOUT = 5000; // 5秒后自动刷新缓冲
let nativePort: Browser.runtime.Port | null = null;

/**
 * 初始化 Native Messaging 连接
 * @param applicationName - Native Messaging 应用名称
 * @returns 是否连接成功
 */
function initNativeConnection(applicationName: string = 'com.autojs.logger'): boolean {
    try {
        if (nativePort) {
            // Check if connection is still valid by checking if port exists
            // Note: postMessage might not throw immediately if connection is broken,
            // so we rely on onDisconnect listener to set nativePort to null
            // For now, assume existing port is valid if it exists
            return true;
        }

        nativePort = browser.runtime.connectNative(applicationName);

        nativePort.onMessage.addListener((message: any) => {
            if (message.type === 'error') {
                console.error('[LogFile] Native application error:', message.error);
            } else if (message.type === 'success') {
                // Log write successful
            }
        });

        nativePort.onDisconnect.addListener(() => {
            if (browser.runtime.lastError) {
                console.warn('[LogFile] Native connection disconnected:', browser.runtime.lastError.message);
            }
            nativePort = null;
        });

        return true;
    } catch (error) {
        console.warn('[LogFile] Failed to connect to native application:', error);
        nativePort = null;
        return false;
    }
}

/**
 * 刷新日志缓冲，将缓冲的日志写入文件
 */
function flushLogBuffer(): void {
    if (logBuffer.length === 0) {
        return;
    }

    const logsToWrite = [...logBuffer];
    logBuffer = [];

    if (logBufferTimer) {
        clearTimeout(logBufferTimer);
        logBufferTimer = null;
    }

    if (!nativePort) {
        if (!initNativeConnection()) {
            // Fallback to console output if unable to connect to native application
            logsToWrite.forEach(log => {
                const logMessage = `[${log.timestamp}] [${log.level}]${log.source ? ` [${log.source}]` : ''} ${log.message}`;
                console.log(logMessage);
            });
            return;
        }
        // After initNativeConnection, check again in case it failed silently
        if (!nativePort) {
            // Fallback to console output
            logsToWrite.forEach(log => {
                const logMessage = `[${log.timestamp}] [${log.level}]${log.source ? ` [${log.source}]` : ''} ${log.message}`;
                console.log(logMessage);
            });
            return;
        }
    }

    try {
        nativePort.postMessage({
            type: 'writeLogs',
            logs: logsToWrite,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[LogFile] Failed to send logs:', error);
        // Fallback to console output
        logsToWrite.forEach(log => {
            const logMessage = `[${log.timestamp}] [${log.level}]${log.source ? ` [${log.source}]` : ''} ${log.message}`;
            console.log(logMessage);
        });
    }
}

/**
 * 格式化日志消息
 * @param message - 原始消息（已经是字符串）
 * @param options - 日志选项
 * @returns 格式化后的日志对象
 */
function formatLogMessage(message: string, options: LogOptions = {}): {
    message: string;
    timestamp: string;
    level: LogLevel;
    source?: string;
} {
    const level = options.level || LogLevel.INFO;
    const timestamp = new Date().toISOString();

    return {
        message: message,
        timestamp,
        level,
        source: options.includeSource ? options.source : undefined
    };
}

/**
 * 输出日志到文件
 * @param message - 日志消息（可以是字符串或对象）
 * @param options - 日志选项
 * @remarks
 * 使用 Chrome Native Messaging API 将日志写入本地文件
 * 
 * 功能特性：
 * - 支持日志级别（DEBUG, INFO, WARN, ERROR）
 * - 自动添加时间戳
 * - 日志缓冲机制，批量写入提高性能
 * - 自动重连机制
 * - 错误处理和回退到控制台输出
 * 
 * 使用示例：
 * ```typescript
 * // 基本用法
 * OutputLogToFile('这是一条日志消息');
 * 
 * // 指定日志级别
 * OutputLogToFile('错误信息', { level: LogLevel.ERROR });
 * 
 * // 包含来源信息
 * OutputLogToFile('执行完成', { 
 *     level: LogLevel.INFO, 
 *     includeSource: true, 
 *     source: 'InstructionExecutor' 
 * });
 * 
 * // 记录对象
 * OutputLogToFile({ tabId: 123, url: 'https://example.com' }, { level: LogLevel.DEBUG });
 * ```
 */
export function OutputLogToFile(message: string | object, options: LogOptions = {}): void {
    try {
        // 只有DEBUG_MODE为true时才输出日志
        if (!DEBUG_MODE) {
            return;
        }

        // 格式化日志消息
        const formattedLog = formatLogMessage(
            typeof message === 'string' ? message : JSON.stringify(message),
            options
        );

        // 添加到缓冲队列
        logBuffer.push(formattedLog);

        // 如果缓冲达到大小限制，立即刷新
        if (logBuffer.length >= LOG_BUFFER_SIZE) {
            // Clear existing timer before flushing
            if (logBufferTimer) {
                clearTimeout(logBufferTimer);
                logBufferTimer = null;
            }
            flushLogBuffer();
        } else {
            // 设置定时器，超时后自动刷新
            if (!logBufferTimer) {
                logBufferTimer = setTimeout(() => {
                    logBufferTimer = null; // Clear timer reference before flushing
                    flushLogBuffer();
                }, LOG_BUFFER_TIMEOUT);
            }
        }
    } catch (error) {
        console.error('[LogFile] Log processing failed:', error);
        console.log(`[${new Date().toISOString()}] [ERROR] ${typeof message === 'string' ? message : JSON.stringify(message)}`);
    }
}

/**
 * 立即刷新日志缓冲
 * 用于在应用关闭前确保所有日志都已写入
 */
export function FlushLogBuffer(): void {
    flushLogBuffer();
}

/**
 * 关闭日志连接
 */
export function CloseLogConnection(): void {
    flushLogBuffer();
    if (nativePort) {
        try {
            nativePort.disconnect();
        } catch (error) {
            console.warn('[LogFile] Error disconnecting:', error);
        }
        nativePort = null;
    }
}

/*
* 比特浏览器适配
* 列出所有标签页，并查找比特浏览器(console.bitbrowser.net)的标签页(只有一个)，获取title标题, 截取前半部分的数字，作为浏览器序号
* 返回浏览器序号列表
*/
export async function GetBitBrowserTabSequence(): Promise<string | undefined> {
    let tabs = await browser.tabs.query({});
    let browserTabs = tabs.filter((tab) => tab.url?.includes('console.bitbrowser.net'));

    if (browserTabs.length === 0) {
        return undefined;
    }

    // 等待10秒后再次查询
    await new Promise(resolve => setTimeout(resolve, 10 * 1000));

    tabs = await browser.tabs.query({});
    browserTabs = tabs.filter((tab) => tab.url?.includes('console.bitbrowser.net'));

    if (browserTabs.length === 0) {
        return undefined;
    }

    const browserTab = browserTabs[0];
    const browserTabTitle = browserTab.title;
    const browserTabSeq = browserTabTitle?.match(/\d+/)?.[0] ?? undefined;

    OutputLogToFile(`[GetBitBrowserTabSequence] BitBrowser tab sequence: ${browserTabSeq}`, { level: LogLevel.INFO });

    return browserTabSeq;
}