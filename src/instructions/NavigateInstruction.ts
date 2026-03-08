import type { NavigateInstruction, NavigateInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：导航到指定 URL，用于页面跳转和 URL 变更，支持等待页面加载完成，确保页面完全加载后再继续执行后续指令
 *
 * 实现方式：继承自 BaseInstructionClass，使用 browser.tabs.update API 导航到指定 URL，然后监听标签页更新事件等待页面加载完成
 *
 * 注意事项：
 * - params.url 为必需参数，必须是有效的 URL 格式
 * - 导航后会等待页面加载完成（status 变为 'complete'），确保 content script 已准备好
 * - 支持延迟执行（delay 属性）和重试机制（retry 属性）
 * - 支持超时设置（timeout 属性），默认 60 秒，超时后会继续执行（不抛出错误）
 * - 如果标签页已经加载完成，会直接返回，避免不必要的等待
 *
 * 相关代码：src/types/instruction.ts - NavigateInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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
     * 业务逻辑：执行页面导航操作，跳转到指定 URL 并等待页面加载完成，确保页面完全加载后再继续执行
     *
     * 实现方式：使用 browser.tabs.update API 导航到指定 URL，然后调用 WaitForPageLoad() 方法等待页面加载完成
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 导航操作是异步的，不会等待页面加载完成，需要手动等待
     * - WaitForPageLoad() 方法会监听标签页更新事件，等待 status 变为 'complete'
     * - 如果页面加载超时，会记录警告日志但不会抛出错误，确保后续指令可以继续执行
     * - 返回结果包含导航的 URL，用于确认导航成功
     *
     * 相关代码：src/types/instruction.ts - NavigateInstructionResult 接口（结果数据结构），WaitForPageLoad() 方法（等待页面加载），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
     */
    public async Execute(): Promise<NavigateInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: NavigateInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

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
     * 业务逻辑：等待页面加载完成，确保页面完全加载后再继续执行，避免在页面未完全加载时执行后续操作导致失败
     *
     * 实现方式：先检查标签页是否已经加载完成，如果未完成则监听 browser.tabs.onUpdated 事件，等待 status 变为 'complete'
     *
     * 注意事项：
     * - 首先检查标签页状态，如果已经是 'complete'，直接返回，避免不必要的等待
     * - 使用 Promise 和事件监听器实现异步等待，超时后自动返回（不抛出错误）
     * - 超时时间使用指令的 timeout 属性（秒），默认 60 秒，会自动转换为毫秒
     * - 事件监听器会在页面加载完成或超时后自动移除，避免内存泄漏
     * - 超时后会记录警告日志，但不会抛出错误，确保后续指令可以继续执行
     *
     * 相关代码：Execute() 方法（调用此方法等待页面加载），browser.tabs.onUpdated API（标签页更新事件）
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