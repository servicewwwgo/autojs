import { BackgroundScriptMessageType, TabInfo } from '../../../types';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 业务逻辑：获取浏览器中所有打开的标签页信息，用于在 popup 界面显示标签页列表供用户选择
 * 
 * 实现方式：使用 browser.tabs.query({}) 查询所有标签页，提取标签页 ID、索引和 URL 信息返回给调用方
 * 
 * 注意事项：
 * - 返回的标签页信息包括 tabId、tabIndex 和 url
 * - 标签页 ID 和索引都是必需的，URL 可能为空（如新标签页）
 * 
 * 相关代码：src/types/index.ts - TabInfo 类型定义
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
