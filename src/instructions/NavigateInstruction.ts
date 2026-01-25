import type { NavigateInstruction, NavigateInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
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
     * 首先检查标签页是否已经加载完成，避免竞态条件
     */
    private async WaitForPageLoad(): Promise<void> {
        // 首先检查标签页是否已经加载完成
        try {
            const tab = await browser.tabs.get(this.tabId);
            if (tab.status === 'complete') {
                OutputLogToFile(`[NavigateInstruction] Tab ${this.tabId} already loaded`, { level: LogLevel.INFO });
                return;
            }
        } catch (error) {
            OutputLogToFile(`[NavigateInstruction] Failed to get tab ${this.tabId}: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        }

        // 如果还没加载完成，等待加载完成事件
        const timeout = (this.timeout || 60) * 1000; // 使用指令的 timeout 属性，默认 60 秒

        return new Promise((resolve) => {
            const listener = (tabId: number, changeInfo: any) => {
                if (tabId === this.tabId && changeInfo.status === 'complete') {
                    browser.tabs.onUpdated.removeListener(listener);
                    OutputLogToFile(`[NavigateInstruction] Tab ${this.tabId} loaded successfully`, { level: LogLevel.INFO });
                    resolve();
                }
            };

            browser.tabs.onUpdated.addListener(listener);

            // 设置超时，避免无限等待
            setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener);
                OutputLogToFile(`[NavigateInstruction] Tab ${this.tabId} load timeout after ${timeout}ms`, { level: LogLevel.WARN });
                resolve();
            }, timeout);
        });
    }
}