import type { ScreenshotInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { ElementManager } from '../managers';

/**
 * 页面截图指令
 */
export class ScreenshotInstructionClass extends BaseInstructionClass {
  public format?: 'png' | 'jpeg';
  public quality?: number;
  public fullPage?: boolean;

  constructor(instruction: ScreenshotInstruction, elementManager: ElementManager) {
    super(instruction, elementManager);

    this.format = instruction.format;
    this.quality = instruction.quality;
    this.fullPage = instruction.fullPage;
  }

  public async Execute(): Promise<InstructionResult> {

    const result = await this.Retry(async () => {
      const format = this.format || 'png';
      const quality = this.quality || 100;

      // 使用Chrome Tabs API截图
      // 注意：captureVisibleTab 需要 windowId，这里使用 tabId 对应的 windowId
      const tab = await browser.tabs.get(this.tabId) as Browser.tabs.Tab;

      if (!tab) {
        throw new Error('无法获取标签页');
      }

      const dataUrl = await browser.tabs.captureVisibleTab(Number(tab.windowId), {
        format,
        quality: format === 'jpeg' ? quality : undefined
      });

      return {
        instructionID: this.instructionID,
        success: true,
        duration: 0,
        data: { dataUrl, format, quality }
      } as InstructionResult;
    });

    return result;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      format: this.format,
      quality: this.quality,
      fullPage: this.fullPage
    } as object;
  }
}

