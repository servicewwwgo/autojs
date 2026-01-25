import type { ActivateTabInstruction, ActivateTabInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 激活标签页指令
 */
export class ActivateTabInstructionClass extends BaseInstructionClass {
    public params?: {};

    constructor(instruction: ActivateTabInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 执行激活标签页指令
     * @returns 执行结果，包含激活的标签页ID和执行时间
     * @remarks
     * 使用 browser.tabs.update API 激活指定标签页
     * 如果设置了 delay，会在激活前等待指定时间
     */
    public async Execute(): Promise<ActivateTabInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: ActivateTabInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 首先检查标签页是否存在
            try {
                const tab = await browser.tabs.get(this.tabId);
                if (!tab) {
                    return { ...defaultResult, error: `Failed to get tab ${this.tabId}` } as ActivateTabInstructionResult;
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
                    return { ...defaultResult, error: `Tab ${this.tabId} does not exist` } as ActivateTabInstructionResult;
                }
                throw error; // 重新抛出其他错误，让 Retry 处理
            }

            // 使用 browser.tabs.update API 激活指定标签页
            let updatedTab;
            try {
                updatedTab = await browser.tabs.update(this.tabId, { active: true });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                return { ...defaultResult, error: `Failed to activate tab ${this.tabId}: ${errorMsg}` } as ActivateTabInstructionResult;
            }

            if (!updatedTab) {
                return { ...defaultResult, error: `Failed to activate tab ${this.tabId}: update returned no result` } as ActivateTabInstructionResult;
            }

            OutputLogToFile(`[ActivateTabInstruction] Tab ${this.tabId} activated successfully`, { level: LogLevel.INFO });

            return { ...defaultResult, success: true, data: { tabId: this.tabId } } as ActivateTabInstructionResult;
        });

        return result as ActivateTabInstructionResult;
    }
}

