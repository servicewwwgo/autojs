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
 * Content script入口
 * 配置 runAt: 'document_start' 确保内容脚本在 document 加载前被加载
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

        // 消息处理器映射
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
