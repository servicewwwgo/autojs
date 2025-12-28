import type { ActivateTabInstruction, InstructionResult } from '../types';
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
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 使用 browser.tabs.update API 激活指定标签页
            await browser.tabs.update(this.tabId, { active: true });

            return { ...defaultResult, success: true, data: { tabId: this.tabId } };
        });

        return result;
    }
}

