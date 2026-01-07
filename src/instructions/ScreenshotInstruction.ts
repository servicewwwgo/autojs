import type { ScreenshotInstruction, ScreenshotInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 页面截图指令
 */
export class ScreenshotInstructionClass extends BaseInstructionClass {
  public params: {
    format?: 'png' | 'jpeg';
    quality?: number;
    fullPage?: boolean;
  };

  constructor(instruction: ScreenshotInstruction) {
    super(instruction);

    this.params = instruction.params;
  }

  public async Execute(): Promise<ScreenshotInstructionResult> {

    const result = await this.Retry(async () => {
      let defaultResult: ScreenshotInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      const format = this.params.format ?? 'png';
      const quality = this.params.quality ?? 100;

      // 使用Chrome Tabs API截图
      // 注意：captureVisibleTab 需要 windowId，这里使用 tabId 对应的 windowId
      const tab = await browser.tabs.get(this.tabId);

      if (!tab || !tab.windowId) {
        throw new Error('Failed to get tab or windowId');
      }

      const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format, quality: format === 'jpeg' ? quality : undefined });

      return { ...defaultResult, success: true, data: { dataUrl, format, quality } } as ScreenshotInstructionResult;
    });

    return result as ScreenshotInstructionResult;
  }
}