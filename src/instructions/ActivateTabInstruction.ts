import type { ActivateTabInstruction, ActivateTabInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：激活指定的浏览器标签页，将其切换到前台成为活动标签页，用于多标签页场景下的标签页切换操作
 *
 * 实现方式：继承自 BaseInstructionClass，使用 browser.tabs.update API 将指定标签页设置为活动状态（active: true）
 *
 * 注意事项：
 * - 执行前会先检查标签页是否存在，如果不存在会返回错误
 * - 如果标签页已经是活动状态，操作仍然会成功
 * - 支持延迟执行（delay 属性）和重试机制（retry 属性）
 * - 标签页不存在时会返回明确的错误信息，便于问题排查
 *
 * 相关代码：src/types/instruction.ts - ActivateTabInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
 */
export class ActivateTabInstructionClass extends BaseInstructionClass {
    public params?: {};

    constructor(instruction: ActivateTabInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 业务逻辑：执行激活标签页操作，将指定标签页切换到前台，确保后续操作在正确的标签页上进行
     *
     * 实现方式：先检查标签页是否存在，然后使用 browser.tabs.update API 设置 active: true，使用 Retry() 方法包装以支持重试
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 如果标签页不存在（No tab with id），会返回明确的错误信息
     * - 如果 browser.tabs.update 返回空结果，会返回错误
     * - 执行成功后会记录日志，便于调试和监控
     * - 返回结果包含激活的标签页 ID，用于确认操作成功
     *
     * 相关代码：src/types/instruction.ts - ActivateTabInstructionResult 接口（结果数据结构），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
     */
    public async Execute(): Promise<ActivateTabInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: ActivateTabInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

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

