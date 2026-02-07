import type { BackgroundScriptMessageType, ContentScriptMessageType, PopupScriptMessageType } from '../types';
import { LogLevel } from '../types/websocket_message';

// 重新导出 LogLevel，保持向后兼容
export { LogLevel };
/**
 * 业务逻辑：生成符合 RFC 4122 标准的 UUID v4，用于为节点、指令等实体分配唯一标识符，确保系统内各实体的唯一性
 *
 * 实现方式：使用随机数生成器填充 UUID 模板，其中 'x' 位置使用随机十六进制数字，'y' 位置使用特定范围的随机值（8-11）以确保版本号正确
 *
 * 注意事项：
 * - 生成的 UUID 格式为：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - 版本号固定为 4（UUID v4），变体标识符为 8-11 范围内的值
 * - 使用 Math.random() 生成随机数，不保证密码学安全性，仅用于标识符生成
 *
 * 相关代码：src/managers/NodeManager.ts - GetNodeProfile() 函数（生成节点ID）
 */
export function GenerateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * 业务逻辑：生成指定长度的随机字符串，用于为已定位的 DOM 元素创建唯一标记（tag），便于在 content script 中快速查找元素
 *
 * 实现方式：使用 Math.random() 生成随机数，转换为 36 进制字符串（包含 0-9 和 a-z），截取指定长度
 *
 * 注意事项：
 * - 默认长度为 14 位，可根据需要调整
 * - 生成的字符串仅包含小写字母和数字，不包含特殊字符
 * - 随机性依赖于 Math.random()，不保证全局唯一性，但在实际使用中冲突概率极低
 * - 字符串长度必须大于 0，否则返回空字符串
 *
 * 相关代码：src/managers/ElementManager.ts - LocateElement() 函数（生成元素标记）
 */
export function GenerateRandomString(length: number = 14): string {
    return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * 业务逻辑：转义 CSS 选择器中的特殊字符，防止在构建 CSS 选择器时因特殊字符导致选择器解析错误，确保元素查找的准确性
 *
 * 实现方式：使用正则表达式匹配双引号和反斜杠，并在其前添加反斜杠进行转义
 *
 * 注意事项：
 * - 仅转义双引号（"）和反斜杠（\）两种特殊字符
 * - 其他 CSS 选择器特殊字符（如空格、>、+、~ 等）需要在使用选择器时手动处理
 * - 转义后的值可直接用于 CSS 属性选择器，如 `[cdp-locate-id="${escapedValue}"]`
 *
 * 相关代码：src/entrypoints/content.ts - FindElement() 函数（转义 tag 值），src/managers/ElementManager.ts - LocateElement() 函数（构建选择器）
 */
export function EscapeCSSSelector(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
}

/**
 * 业务逻辑：获取比特浏览器（BitBrowser）的浏览器序号，用于自动识别和设置节点名称，适配比特浏览器多实例环境
 *
 * 实现方式：查询所有标签页，筛选包含 'console.bitbrowser.net' 的标签页，等待 10 秒后再次查询以确保页面加载完成，从标题中提取数字序号
 *
 * 注意事项：
 * - 比特浏览器控制台页面 URL 必须包含 'console.bitbrowser.net'
 * - 标题格式应为包含数字的字符串，函数会提取第一个连续数字作为序号
 * - 如果未找到比特浏览器标签页，返回 undefined
 * - 等待 10 秒是为了确保页面标题已加载完成，避免获取到空标题
 * - 如果标题中不包含数字，返回 undefined
 *
 * 相关代码：src/managers/NodeManager.ts - GetNodeProfile() 函数（自动设置节点名称）
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

/**
 * 业务逻辑：从 background script 或 popup 向指定标签页的 content script 发送消息，用于执行 DOM 操作、获取元素信息等页面级操作
 *
 * 实现方式：使用 browser.tabs.sendMessage API 发送消息，通过 Promise 包装以支持异步/await 语法，检查 runtime.lastError 处理发送失败的情况
 *
 * 注意事项：
 * - 目标标签页必须已加载 content script，否则会抛出错误
 * - 如果标签页不存在或 content script 未加载，会通过 runtime.lastError 返回错误
 * - 消息类型必须符合 ContentScriptMessageType 接口定义
 * - 返回的 Promise 会在收到 content script 的响应后 resolve，如果发送失败则 reject
 *
 * 相关代码：src/instructions/BaseInstruction.ts - SendMessageToContentScript() 方法（指令基类中的封装），src/entrypoints/content.ts - 消息监听器（接收消息）
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
 * 业务逻辑：从 popup、content script 或 side panel 向 background script 发送消息，用于执行指令管理、状态查询、标签页操作等后台任务
 *
 * 实现方式：使用 browser.runtime.sendMessage API 发送消息，通过 Promise 包装以支持异步/await 语法，检查 runtime.lastError 处理发送失败的情况
 *
 * 注意事项：
 * - background script 必须已注册消息监听器，否则消息会被忽略
 * - 消息类型必须符合 BackgroundScriptMessageType 接口定义
 * - 如果 background script 未响应或发送失败，会通过 runtime.lastError 返回错误
 * - 返回的 Promise 会在收到 background script 的响应后 resolve，如果发送失败则 reject
 *
 * 相关代码：src/entrypoints/background.ts - 消息监听器（接收消息），src/entrypoints/popup/components/ExecutionControl.vue - 执行控制组件（发送消息）
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
 * 业务逻辑：从 background script 或 content script 向 popup 窗口发送消息，用于更新 UI 状态、显示通知等
 *
 * 实现方式：使用 browser.runtime.sendMessage API 发送消息，直接返回 Promise（与 SendMessageToBackgroundScript 类似但更简洁）
 *
 * 注意事项：
 * - popup 窗口必须处于打开状态，否则消息可能无法送达
 * - 消息类型必须符合 PopupScriptMessageType 接口定义
 * - 如果 popup 未打开或发送失败，Promise 可能会 reject
 * - 此函数主要用于单向通知，不保证 popup 一定会处理消息
 *
 * 相关代码：src/entrypoints/popup/App.vue - popup 主组件（接收消息）
 */
export async function SendMessageToPopupWindow(message: PopupScriptMessageType): Promise<any> {
    return await browser.runtime.sendMessage(message);
}

/**
 * 业务逻辑：执行 Chrome DevTools Protocol (CDP) 命令，实现对浏览器的底层控制，包括 DOM 操作、输入模拟、页面导航、网络监控等功能
 *
 * 实现方式：使用 browser.debugger.sendCommand API 发送 CDP 命令，通过 Promise 包装以支持异步/await 语法，同时检查 API 层面和 CDP 协议层面的错误
 *
 * 注意事项：
 * - 执行前必须通过 EnsureCDPConnected() 确保已连接到目标标签页
 * - 某些 Domain 需要先启用（如 DOM.enable, Runtime.enable），通过发送相应的 CDP 命令完成
 * - 支持所有 CDP Domain 的方法（DOM, Input, Page, Network, Runtime, Performance, Debugger, CSS, Overlay, Emulation 等）
 * - 支持所有 CDP 版本（1.0, 1.1, 1.2, 1.3 等）
 * - 错误处理：检查 runtime.lastError（API 层面）和 result.code（CDP 协议层面）
 * - 返回的结果是原生的 CDP 协议响应，无需额外转换
 *
 * @param tabId - 标签页ID
 * @param method - CDP 方法名（例如 'DOM.querySelector', 'Input.dispatchMouseEvent', 'Page.navigate' 等）
 * @param params - CDP 命令参数（可选，根据具体命令而定）
 * @returns CDP 命令执行结果（原生 CDP 协议响应）
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
 * 相关代码：src/executor/CdpExecutor.ts - CDP 执行器（大量使用此函数），src/managers/ElementManager.ts - LocateElement() 函数（DOM 操作）
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
 * 业务逻辑：确保 Chrome DevTools Protocol (CDP) 已连接到指定标签页，这是执行所有 CDP 命令的前提条件，确保浏览器自动化功能正常工作
 *
 * 实现方式：使用 browser.debugger.attach API 连接到标签页，指定 CDP 版本为 1.3，如果已连接则忽略"另一个调试器已连接"的错误
 *
 * 注意事项：
 * - CDP 版本固定为 1.3，与 Chrome 扩展 API 兼容
 * - 如果其他扩展或 DevTools 已连接，会忽略相关错误，不影响后续操作
 * - 连接失败时会记录警告日志，但不会抛出异常
 * - 每次执行 CDP 命令前都应调用此函数确保连接状态
 *
 * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（执行指令前连接），src/executor/CdpExecutor.ts - 执行 CDP 消息前连接
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
 * 业务逻辑：断开指定标签页的 CDP 连接，释放调试资源，通常在完成所有自动化操作后调用
 *
 * 实现方式：使用 browser.debugger.detach API 断开连接，捕获并记录错误但不抛出异常，避免影响其他操作
 *
 * 注意事项：
 * - 断开连接后无法再执行 CDP 命令，需要重新连接
 * - 如果连接不存在或断开失败，会记录错误日志但不会抛出异常
 * - 建议在标签页关闭或不再需要自动化操作时调用此函数
 *
 * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（执行完成后断开）
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

// 全局 WebSocketConnector 引用，用于日志发送
let globalWsConnector: import('../executor').WebSocketConnector | null = null;

/**
 * 业务逻辑：设置全局 WebSocketConnector 引用，使 OutputLogToFile 函数能够通过 WebSocket 发送日志消息
 *
 * 实现方式：保存 WebSocketConnector 实例到全局变量
 *
 * 注意事项：
 * - 此函数应在 background script 初始化时调用，设置 WebSocketConnector 实例
 * - 如果未设置，OutputLogToFile 将无法发送日志消息
 *
 * 相关代码：src/utils/index.ts - OutputLogToFile() 函数（使用此引用），src/entrypoints/background.ts - 设置引用
 */
export function setGlobalWebSocketConnector(connector: import('../executor').WebSocketConnector | null): void {
    globalWsConnector = connector;
}

/**
 * 业务逻辑：定义日志输出选项接口，用于自定义日志格式和内容，提供灵活的日志记录能力
 *
 * 实现方式：使用 TypeScript 接口定义可选配置项，所有字段均为可选，提供默认值处理
 *
 * 注意事项：
 * - level：日志级别，默认为 LogLevel.INFO
 * - includeSource：是否包含来源信息，需要同时设置 source 字段
 * - source：来源标识（如模块名、函数名），仅在 includeSource 为 true 时生效
 *
 * 相关代码：src/utils/index.ts - OutputLogToFile() 函数（使用此接口）
 */
export interface LogOptions {
    level?: LogLevel;
    includeSource?: boolean;
    source?: string;
}

/**
 * 业务逻辑：将日志消息通过 WebSocket 发送到服务器，用于远程调试和问题排查
 *
 * 实现方式：通过全局 WebSocketConnector 引用调用 sendLogMessage 方法发送日志消息
 *
 * 注意事项：
 * - 支持字符串和对象类型的消息，对象会自动转换为 JSON 字符串
 * - 如果全局 WebSocketConnector 未设置，函数会静默失败，不抛出异常
 * - 日志级别默认为 LogLevel.INFO，可通过 options.level 覆盖
 * - 如果 includeSource 为 true 且 source 已设置，会将 source 信息包含在日志消息中
 *
 * @param message - 日志消息（可以是字符串或对象）
 * @param options - 日志选项（级别、来源等）
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
 *
 * 相关代码：src/executor/WebSocketConnector.ts - sendLogMessage() 方法（实际发送日志），src/entrypoints/background.ts - 设置全局引用
 */
export function OutputLogToFile(message: string | object, options: LogOptions = {}): void {
    try {
        // 如果全局 WebSocketConnector 未设置，静默失败
        if (!globalWsConnector) {
            return;
        }

        // 格式化日志消息
        const logMessage = typeof message === 'string' ? message : JSON.stringify(message);
        const level = options.level || LogLevel.INFO;
        const source = options.includeSource && options.source ? options.source : undefined;

        // 通过 WebSocket 发送日志消息
        globalWsConnector.sendLogMessage(logMessage, level, undefined, source);
    } catch (error) {
        // 静默处理错误，避免影响主流程
        console.error('[LogFile] Failed to send log message:', error);
    }
}