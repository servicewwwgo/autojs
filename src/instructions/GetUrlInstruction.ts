import type { GetUrlInstruction, GetUrlInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 获取当前标签页URL指令
 */
export class GetUrlInstructionClass extends BaseInstructionClass {
  public params: {
    usage?: "variable" | "data" | "none";
  };

  constructor(instruction: GetUrlInstruction) {
    super(instruction);
    this.params = instruction.params;
  }

  /**
   * 执行获取URL指令
   * @returns 执行结果，包含当前标签页的URL
   * @remarks
   * 使用 browser.tabs.get API 获取标签页信息，从中提取 URL
   * 如果设置了 delay，会在执行前等待指定时间
   */
  public async Execute(): Promise<GetUrlInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: GetUrlInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 如果设置了延迟，先等待
      await this.Delay(this.delay);

      // 使用 browser.tabs.get API 获取标签页信息
      let tab;
      try {
        tab = await browser.tabs.get(this.tabId);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
          return { ...defaultResult, error: `Tab ${this.tabId} does not exist` } as GetUrlInstructionResult;
        }
        throw error; // 重新抛出其他错误，让 Retry 处理
      }

      if (!tab) {
        return { ...defaultResult, error: `Failed to get tab ${this.tabId}` } as GetUrlInstructionResult;
      }

      // 获取URL，优先使用 url，如果不存在则使用 pendingUrl
      const url = tab.url || tab.pendingUrl || '';

      if (!url) {
        return { ...defaultResult, error: `Tab ${this.tabId} has no URL (may be a special page like chrome:// or about:)` } as GetUrlInstructionResult;
      }

      OutputLogToFile(`[GetUrlInstruction] Current tab URL: ${url}`, { level: LogLevel.INFO });

      return { ...defaultResult, success: true, data: { usage: this.params.usage || "data", url: url } } as GetUrlInstructionResult;
    });

    return result as GetUrlInstructionResult;
  }
}

