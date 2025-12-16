import type { BaseInstruction, InstructionResult, ContentScriptMessageType } from '../types';
import { SendMessageToContentScript, ExecuteCDPCommand, OutputLogToFile, LogLevel } from '../utils';

/**
 * 基础指令对象接口 - 针对标签页的命令
 */
export abstract class BaseInstructionClass implements BaseInstruction {
    public tabId: number;
    public type: string;
    public instructionID: string;
    public delay?: number;
    public retry?: number;
    public timeout?: number;
    public ignoreError?: boolean;
    public created_at: number;

    constructor(instruction: BaseInstruction) {
        this.tabId = instruction.tabId;
        this.type = instruction.type;
        this.instructionID = instruction.instructionID;
        this.delay = instruction.delay;
        this.retry = instruction.retry;
        this.timeout = instruction.timeout;
        this.ignoreError = instruction.ignoreError;
        this.created_at = instruction.created_at;
    }

    /**
     * 转换为对象
     * @returns 对象
     */
    ToObject(): object {
        return {
            tabId: this.tabId,
            type: this.type,
            instructionID: this.instructionID,
            delay: this.delay,
            retry: this.retry,
            timeout: this.timeout,
            created_at: this.created_at
        } as object;
    }

    /**
     * 执行方法（抽象方法，由子类实现）
     * @returns 执行结果
     */
    public abstract Execute(): Promise<InstructionResult>;

    /**
     * 等待指定时间
     * @param time - 延迟时间（秒），如果未提供则使用指令的 delay 属性
     * @remarks
     * delay 属性单位为秒，但这里转换为毫秒进行等待
     * 例如：delay = 1 表示等待 1 秒
     */
    protected async Delay(time?: number): Promise<void> {
        const delay_time = time || this.delay;

        if (delay_time && delay_time > 0) {
            // 将秒转换为毫秒：delay_time 是秒，需要乘以 1000
            await new Promise<void>(resolve => setTimeout(resolve, delay_time * 1000));
        }
    }

    /**
     * 重试执行指令
     * @param fn - 要执行的异步函数，返回 InstructionResult
     * @returns 执行结果，包含成功或失败信息
     * @remarks
     * 根据指令的 retry 属性决定重试次数
     * 如果 retry 为 0 或未设置，至少执行一次
     * 每次重试前等待 1 秒
     */
    protected async Retry(fn: () => Promise<InstructionResult>): Promise<InstructionResult> {
        let lastError: Error | null = null;
        const startTime = Date.now();

        // 确保至少执行一次，即使 retry 为 0 或未设置
        // retry = 0 表示不重试，但仍需执行一次
        // retry = 1 表示最多执行 2 次（初始 + 1次重试）
        const maxAttempts = Math.max(1, (this.retry || 0) + 1);

        for (let i = 1; i <= maxAttempts; i++) {
            try {
                const result = await fn();
                // 计算总执行时间（包括重试）
                result.duration = Date.now() - startTime;
                return result;
            } catch (error) {
                lastError = error as Error;
                // 如果不是最后一次尝试，等待后重试
                if (i < maxAttempts) {
                    OutputLogToFile(`[BaseInstruction] Instruction ${this.instructionID} execution failed, retrying (${i}/${maxAttempts}): ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
                    await this.Delay(1); // 重试前等待 1 秒
                }
            }
        }

        // 所有重试都失败，返回错误结果
        return {
            instructionID: this.instructionID,
            tabId: this.tabId,
            success: false,
            error: lastError?.message || `执行失败：已重试 ${maxAttempts} 次`,
            duration: Date.now() - startTime
        } as InstructionResult;
    }

    /**
     * 执行 Chrome DevTools Protocol (CDP) 命令
     * @param method - CDP 方法名，例如 'Input.dispatchKeyEvent', 'DOM.focus' 等
     * @param params - CDP 命令参数对象
     * @returns Promise，解析为 CDP 命令的执行结果
     * @throws 如果 CDP 命令执行失败，抛出错误
     * @remarks
     * 使用 browser.debugger API 发送 CDP 命令到指定的标签页
     * 需要确保标签页已通过 debugger.attach 连接
     */
    protected async ExecuteCDPCommand(method: string, params?: any): Promise<any> {
        return await ExecuteCDPCommand(this.tabId, method, params);
    }

    /**
     * 发送消息到内容脚本（Content Script）
     * @param message - 要发送的消息对象
     * @returns Promise，解析为内容脚本的响应
     * @throws 如果消息发送失败，抛出错误
     * @remarks
     * 用于与页面中的内容脚本通信，例如获取元素信息、执行 DOM 操作等
     */
    protected async SendMessageToContentScript(message: ContentScriptMessageType): Promise<any> {
        return await SendMessageToContentScript(this.tabId, message);
    }
}