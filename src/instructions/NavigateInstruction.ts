import type { NavigateInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { ElementManager } from '../managers';

/**
 * 页面导航指令
 */
export class NavigateInstructionClass extends BaseInstructionClass {
    public url: string;

    constructor(instruction: NavigateInstruction, elementManager: ElementManager) {
        super(instruction, elementManager);

        this.url = instruction.url;
    }

    /**
     * 执行页面导航指令
     * @returns 执行结果，包含导航的 URL 和执行时间
     * @remarks
     * 使用 browser.tabs.update API 导航到指定 URL
     * 导航后会等待页面加载完成，确保 content script 已准备好
     * 如果设置了 delay，会在导航前等待指定时间
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            // 如果设置了延迟，先等待
            if (this.delay && this.delay > 0) {
                await this.Delay(this.delay);
            }

            // 使用 browser.tabs API 导航到指定 URL
            await browser.tabs.update(this.tabId, { url: this.url });

            // 等待页面加载完成
            await this.WaitForPageLoad();

            // 等待 content script 准备好（最多等待 5 秒）
            // await this.WaitForContentScriptReady();

            return {
                instructionID: this.instructionID,
                success: true,
                duration: 0, // Retry 方法会计算总时间
                data: { url: this.url }
            } as InstructionResult;
        });

        return result;
    }

    /**
     * 等待页面加载完成
     * @remarks
     * 监听标签页的更新事件，等待页面状态变为 'complete'
     */
    private async WaitForPageLoad(): Promise<void> {
        return new Promise((resolve) => {
            const listener = (tabId: number, changeInfo: any) => {
                if (tabId === this.tabId && changeInfo.status === 'complete') {
                    browser.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };

            browser.tabs.onUpdated.addListener(listener);

            // 设置超时，避免无限等待（最多等待 30 秒）
            setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener);
                resolve();
            }, 30000);
        });
    }

    /**
     * 等待 content script 准备好
     * @remarks
     * 等待 content script 加载完成
     * 通过轮询检查消息是否能够发送成功来判断 content script 是否准备好
     * 最多等待 5 秒
     */
    private async WaitForContentScriptReady(): Promise<void> {
        const maxWaitTime = 5000; // 最多等待 5 秒
        const checkInterval = 200; // 每 200 毫秒检查一次
        const maxAttempts = Math.floor(maxWaitTime / checkInterval);

        for (let i = 0; i < maxAttempts; i++) {
            try {
                // 尝试发送消息来检查 content script 是否准备好
                // 使用一个不存在的元素名，如果 content script 已准备好，会返回错误但不会抛出连接错误
                await browser.tabs.sendMessage(this.tabId, {
                    type: 'get_node_id',
                    params: { elementName: '__check_ready__' }
                });
                // 如果消息发送成功（即使元素不存在），说明 content script 已准备好
                return;
            } catch (error) {
                // 检查错误类型
                const errorMsg = browser.runtime.lastError?.message || '';

                // 如果是连接错误，说明 content script 还未准备好
                if (errorMsg.includes('Receiving end does not exist') ||
                    errorMsg.includes('Could not establish connection')) {
                    // content script 还未准备好，等待后重试
                    if (i < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        continue;
                    }
                } else {
                    // 其他错误（比如元素不存在），说明 content script 已准备好，只是元素不存在
                    return;
                }
            }
        }

        // 超时后记录警告但继续执行
        console.warn(`Content script 在 ${maxWaitTime / 1000} 秒内未准备好，继续执行（可能影响后续需要 content script 的指令）`);
    }

    ToObject(): object {
        return {
            ...super.ToObject(),
            url: this.url
        } as object;
    }

}