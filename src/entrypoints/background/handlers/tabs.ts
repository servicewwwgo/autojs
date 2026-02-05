import { BackgroundScriptMessageType, TabInfo } from '../../../types';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 获取所有标签页
 */
export async function getTabs(
    message: BackgroundScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const tabs = await browser.tabs.query({});
    OutputLogToFile(`[Background] Retrieved tabs list successfully, count: ${tabs.length}`, { level: LogLevel.INFO });
    sendResponse({
        success: true,
        data: tabs.map((tab) => ({
            tabId: tab.id as number,
            tabIndex: tab.index as number,
            url: tab.url as string,
        })) as TabInfo[]
    });
}
