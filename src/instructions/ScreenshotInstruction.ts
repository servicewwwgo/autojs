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
      const fullPage = this.params.fullPage ?? false;

      let dataUrl: string;

      if (fullPage) {
        // 使用 CDP Page.captureScreenshot 实现全页截图
        const screenshotResult = await this.ExecuteCDPCommand('Page.captureScreenshot', {
          format: format,
          quality: format === 'jpeg' ? quality : undefined,
          fullPage: true
        });

        const base64Image = screenshotResult?.data || '';
        if (!base64Image) {
          throw new Error('Failed to capture screenshot: empty result');
        }

        // 将 base64 数据转换为 data URL
        dataUrl = `data:image/${format};base64,${base64Image}`;
      } else {
        // 使用 Chrome Tabs API 截取可见区域
        // 注意：captureVisibleTab 需要 windowId，这里使用 tabId 对应的 windowId
        const tab = await browser.tabs.get(this.tabId);

        if (!tab || !tab.windowId) {
          throw new Error('Failed to get tab or windowId');
        }

        dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { 
          format, 
          quality: format === 'jpeg' ? quality : undefined 
        });
      }

      return { ...defaultResult, success: true, data: { dataUrl, format, quality } } as ScreenshotInstructionResult;
    });

    return result as ScreenshotInstructionResult;
  }
}