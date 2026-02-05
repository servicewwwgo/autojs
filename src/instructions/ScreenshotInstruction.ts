import type { ScreenshotInstruction, ScreenshotInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：捕获页面截图，用于页面状态记录、验证和调试，支持全页面截图和指定格式（PNG、JPEG）
 *
 * 实现方式：继承自 BaseInstructionClass，根据 fullPage 参数选择不同的截图方式（全页面使用 CDP 的 Page.captureScreenshot，可见区域使用 browser.tabs.captureVisibleTab）
 *
 * 注意事项：
 * - format 参数指定图片格式（png 或 jpeg），默认 png
 * - quality 参数指定 JPEG 质量（0-100），默认 100，仅对 JPEG 格式有效
 * - fullPage 参数指定是否截取整个页面，默认 false（仅截取可视区域）
 * - 全页面截图使用 CDP 的 Page.captureScreenshot，可以截取超出可视区域的内容
 * - 可见区域截图使用 browser.tabs.captureVisibleTab，需要 windowId（从 tab.windowId 获取）
 * - 截图结果以 Base64 编码的 data URL 格式返回，可以直接用于显示或保存
 *
 * 相关代码：src/types/instruction.ts - ScreenshotInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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

  /**
   * 业务逻辑：执行页面截图操作，捕获当前页面或可见区域的截图，返回 Base64 编码的图片数据
   *
   * 实现方式：根据 fullPage 参数选择不同的截图方式，全页面使用 CDP，可见区域使用 browser.tabs.captureVisibleTab
   *
   * 注意事项：
   * - 执行前会先调用 Delay() 方法处理延迟
   * - 如果 fullPage 为 true，使用 CDP 的 Page.captureScreenshot 截取整个页面
   * - 如果 fullPage 为 false，使用 browser.tabs.captureVisibleTab 截取可见区域
   * - 全页面截图需要先获取 tab.windowId，如果获取失败会抛出错误
   * - 截图结果以 Base64 编码返回，需要转换为 data URL 格式（data:image/{format};base64,{data}）
   * - 如果截图失败（返回空数据），会抛出错误
   * - 返回结果包含 dataUrl、format、quality 字段，用于后续处理和保存
   *
   * 相关代码：src/types/instruction.ts - ScreenshotInstructionResult 接口（结果数据结构），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制），ExecuteCDPCommand() 方法（执行 CDP 命令）
   */
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