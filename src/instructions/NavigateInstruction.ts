import type { NavigateInstruction, NavigateInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 页面导航指令
 */
export class NavigateInstructionClass extends BaseInstructionClass {
    public params: {
        url: string;
    };

    constructor(instruction: NavigateInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 执行页面导航指令
     * @returns 执行结果，包含导航的 URL 和执行时间
     * @remarks
     * 使用 browser.tabs.update API 导航到指定 URL
     * 导航后会等待页面加载完成，确保 content script 已准备好
     * 如果设置了 delay，会在导航前等待指定时间
     */
    public async Execute(): Promise<NavigateInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: NavigateInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 使用 browser.tabs.update API 导航到指定 URL
            await browser.tabs.update(this.tabId, { url: this.params.url });

            // 等待页面加载完成
            await this.WaitForPageLoad();

            return { ...defaultResult, success: true, data: { url: this.params.url } } as NavigateInstructionResult;
        });

        return result as NavigateInstructionResult;
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
}