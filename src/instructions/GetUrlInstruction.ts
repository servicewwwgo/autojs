import type { GetUrlInstruction, InstructionResult } from '../types';
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
  public async Execute(): Promise<InstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 如果设置了延迟，先等待
      await this.Delay(this.delay);

      // 使用 browser.tabs.get API 获取标签页信息
      const tab = await browser.tabs.get(this.tabId);
      
      // 获取URL，优先使用 url，如果不存在则使用 pendingUrl
      const url = tab.url || tab.pendingUrl || '';

      if (!url) {
        return { ...defaultResult, error: 'Failed to get URL from tab' };
      }

      OutputLogToFile(`[GetUrlInstruction] Current tab URL: ${url}`, { level: LogLevel.INFO });

      return { 
        ...defaultResult, 
        success: true, 
        data: { 
          usage: this.params.usage || "data", 
          url: url 
        } 
      };
    });

    return result;
  }
}

