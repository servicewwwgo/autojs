import { defineContentScript } from 'wxt/utils/define-content-script';
import { BackgroundScriptMessageType, ContentScriptMessageType } from '../types';
import { LogLevel, OutputLogToFile, SendMessageToBackgroundScript } from '../utils';
import { hideWebdriver } from './content/utils';
import {
    scrollIntoView,
    getAttribute,
    getText,
    checkElementVisible,
    executeScript
} from './content/handlers';

/**
 * Content script 入口点
 * 
 * 业务逻辑：作为浏览器扩展的内容脚本入口，在页面加载前注入到所有网页中，负责隐藏自动化检测标识、
 * 处理来自后台脚本和 popup 的 DOM 操作请求，提供元素查找、属性获取、可见性检查等功能
 * 
 * 实现方式：使用 WXT 框架的 defineContentScript 定义内容脚本，配置 runAt: 'document_start' 确保在页面脚本运行前加载，
 * 通过消息监听机制接收后台脚本的指令，使用 DOM API 操作页面元素
 * 
 * 注意事项：
 * - runAt: 'document_start' 确保在页面脚本运行前隐藏 navigator.webdriver，防止被检测
 * - 内容脚本运行在独立的执行环境中，无法直接访问页面的 JavaScript 变量和函数
 * - 所有 DOM 操作都需要通过消息传递机制与后台脚本通信
 * 
 * 相关代码：src/entrypoints/content/handlers/ - 消息处理器，src/entrypoints/content/utils/ - DOM 操作工具函数
 */
export default defineContentScript({
    matches: ['<all_urls>'],
    runAt: 'document_start',
    main() {
        OutputLogToFile('[Content] Content script loaded (document_start)', { level: LogLevel.INFO });

        // 立即隐藏 navigator.webdriver 属性（在页面脚本运行之前）
        hideWebdriver();

        SendMessageToBackgroundScript({ type: 'content_script_loaded' } as BackgroundScriptMessageType).catch(error => {
            OutputLogToFile(`[Content] Failed to send content script loaded message: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        });

        /**
         * 业务逻辑：统一处理来自 popup 和 background script 的消息，根据消息类型路由到对应的 DOM 操作处理器
         * 
         * 实现方式：使用消息类型映射表（mapTypeToFunction）查找对应的处理器函数，异步执行并捕获错误
         * 
         * 注意事项：
         * - 处理器函数返回 Promise，支持异步 DOM 操作
         * - 所有错误都会被捕获并返回错误响应给调用方
         * - 未知消息类型会返回错误响应
         * 
         * 相关代码：src/entrypoints/content/handlers/element.ts - 各种 DOM 操作处理器实现
         */
        const mapTypeToFunction: {
            [key: string]: (
                message: ContentScriptMessageType,
                sender: Browser.runtime.MessageSender,
                sendResponse: (response?: any) => void
            ) => Promise<void>;
        } = {
            'scroll_into_view': scrollIntoView,
            'get_attribute': getAttribute,
            'get_text': getText,
            'is_visible': checkElementVisible,
            'execute_script': executeScript
        };

        // 监听来自popup和background script的消息
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            const handler = mapTypeToFunction[message.type as keyof typeof mapTypeToFunction];

            if (handler) {
                handler(message, sender, sendResponse).catch((error) =>
                    sendResponse({ success: false, error: `Failed to handle message: ${error instanceof Error ? error.message : String(error)}` })
                );
            } else {
                sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
            }
        });
    }
});
