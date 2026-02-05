import { BackgroundScriptMessageType } from '../../../types';
import { nodeConfig } from '../../../managers';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 获取节点配置
 */
export async function getNodeProfile(
    message: BackgroundScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const profile = await nodeConfig.GetNodeProfile();
    OutputLogToFile(`[Background] Retrieved node profile successfully`, { level: LogLevel.INFO });
    sendResponse({ success: true, data: profile });
}

/**
 * 更新节点配置
 */
export async function updateNodeProfile(
    message: BackgroundScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    await nodeConfig.UpdateNodeProfile(message.params as { node_name?: string; node_token?: string });
    OutputLogToFile(`[Background] Updated node profile successfully`, { level: LogLevel.INFO });
    sendResponse({ success: true });
}
