import { BackgroundScriptMessageType } from '../../../types';
import { nodeManager } from '../../../managers';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 业务逻辑：获取当前节点的配置信息（节点名称和令牌），用于在 popup 界面显示节点信息
 * 
 * 实现方式：调用 NodeManager.GetNodeProfile() 方法从存储中读取节点配置，返回给调用方
 * 
 * 注意事项：节点配置存储在浏览器本地存储中，如果未设置则返回默认值
 * 
 * 相关代码：src/managers/NodeManager.ts - NodeManager.GetNodeProfile()
 */
export async function getNodeProfile(
    message: BackgroundScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const profile = await nodeManager.GetNodeProfile();
    OutputLogToFile(`[Background] Retrieved node profile successfully`, { level: LogLevel.INFO });
    sendResponse({ success: true, data: profile });
}

/**
 * 业务逻辑：更新节点配置信息（节点名称和令牌），用于配置节点与服务器的连接参数
 * 
 * 实现方式：从消息参数中提取节点名称和令牌，调用 NodeManager.UpdateNodeProfile() 方法更新存储
 * 
 * 注意事项：
 * - 节点名称和令牌都是可选的，可以只更新其中一个
 * - 更新后的配置会持久化到浏览器本地存储
 * 
 * 相关代码：src/managers/NodeManager.ts - NodeManager.UpdateNodeProfile()
 */
export async function updateNodeProfile(
    message: BackgroundScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    await nodeManager.UpdateNodeProfile(message.params as { node_name?: string; node_token?: string });
    OutputLogToFile(`[Background] Updated node profile successfully`, { level: LogLevel.INFO });
    sendResponse({ success: true });
}
