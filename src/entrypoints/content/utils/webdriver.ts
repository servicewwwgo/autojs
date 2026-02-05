import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 业务逻辑：隐藏 navigator.webdriver 属性，防止网站检测到浏览器自动化工具，提升自动化脚本的隐蔽性
 * 
 * 实现方式：使用 Object.defineProperty() 重新定义 navigator.webdriver 属性，将 getter 返回 undefined
 * 
 * 注意事项：
 * - 此函数需要在页面脚本运行前执行（在 content script 的 document_start 阶段），否则可能无法覆盖只读属性
 * - 如果定义属性失败（某些浏览器可能不允许），会记录警告日志但不抛出异常
 * - 隐藏 webdriver 属性有助于避免反爬虫检测，但并非完全可靠
 * 
 * 相关代码：src/entrypoints/content.ts - content script 入口（在 document_start 阶段调用）
 */
export function hideWebdriver(): void {
    try {
        // 方法1: 使用 Object.defineProperty 重新定义 webdriver 属性为 undefined
        // 这是最常用的方法，可以覆盖原有的只读属性
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
            configurable: true,
            enumerable: true
        });

        OutputLogToFile('[Content] navigator.webdriver property hidden', { level: LogLevel.INFO });
    } catch (error) {
        OutputLogToFile(`[Content] Failed to hide navigator.webdriver property: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
    }
}
