import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 隐藏 navigator.webdriver 属性
 * 用于防止网站检测到自动化工具
 * 
 * 注意：由于 webdriver 属性可能是只读的，我们使用多种方法来尝试隐藏它
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
