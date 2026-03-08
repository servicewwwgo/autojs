import { elementManager } from '../managers';
import type { ScreenshotInstruction, ScreenshotInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：捕获页面截图，用于页面状态记录、验证和调试，支持全页面截图、指定元素截图和指定格式（PNG、JPEG）
 *
 * 实现方式：继承自 BaseInstructionClass，根据 elementName、fullPage 参数选择截图方式（指定元素使用 CDP 的 Page.captureScreenshot + clip，全页面使用 Page.captureScreenshot，可见区域使用 browser.tabs.captureVisibleTab）
 *
 * 注意事项：
 * - format 参数指定图片格式（png 或 jpeg），默认 png
 * - quality 参数指定 JPEG 质量（0-100），默认 100，仅对 JPEG 格式有效
 * - fullPage 参数指定是否截取整个页面，默认 false（仅截取可视区域）
 * - elementName 为可选元素名称（需先通过 find_element 定位），指定时仅截取该元素区域，优先级高于 fullPage
 * - 全页面/元素截图使用 CDP 的 Page.captureScreenshot，可以截取超出可视区域的内容
 * - 可见区域截图使用 browser.tabs.captureVisibleTab，需要 windowId（从 tab.windowId 获取）
 * - 截图结果以 Base64 编码的 data URL 格式返回，可以直接用于显示或保存
 *
 * 相关代码：src/types/instruction.ts - ScreenshotInstruction 接口（指令数据结构），src/managers/ElementManager.ts - GetElementByName() 方法（按名称获取元素），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
 */
export class ScreenshotInstructionClass extends BaseInstructionClass {
  public params: {
    format?: 'png' | 'jpeg';
    quality?: number;
    fullPage?: boolean;
    elementName?: string;
  };

  constructor(instruction: ScreenshotInstruction) {
    super(instruction);

    this.params = instruction.params;
  }

  /**
   * 业务逻辑：执行页面截图操作，捕获当前页面、指定元素或可见区域的截图，返回 Base64 编码的图片数据
   *
   * 实现方式：若指定 elementName 则从 ElementManager 获取元素并用 CDP clip 截取该元素；否则根据 fullPage 选择全页或可见区域截图
   *
   * 注意事项：
   * - 执行前会先调用 Delay() 方法处理延迟
   * - 若指定 elementName，元素需已通过 find_element 定位并保存在 ElementManager 中，会先滚动到元素再截取
   * - 若 fullPage 为 true 且未指定 elementName，使用 CDP 的 Page.captureScreenshot 截取整个页面
   * - 若 fullPage 为 false 且未指定 elementName，使用 browser.tabs.captureVisibleTab 截取可见区域
   * - 截图结果以 Base64 编码返回，需转换为 data URL 格式（data:image/{format};base64,{data}）
   * - 返回结果包含 dataUrl、format、quality 字段，用于后续处理和保存
   *
   * 相关代码：src/types/instruction.ts - ScreenshotInstructionResult 接口（结果数据结构），src/managers/ElementManager.ts - GetElementByName() 方法，src/instructions/BaseInstruction.ts - Retry()、ExecuteCDPCommand()
   */
  public async Execute(): Promise<ScreenshotInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: ScreenshotInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

      const format = this.params.format ?? 'png';
      const quality = this.params.quality ?? 100;
      const fullPage = this.params.fullPage ?? false;
      const elementName = this.params.elementName;

      let dataUrl: string;

      if (elementName) {
        // 按元素名称截图：从 ElementManager 获取元素，获取边界框后使用 CDP clip 截取
        const element = elementManager.GetElementByName(this.tabId, elementName);
        if (!element) {
          return { ...defaultResult, error: `Element "${elementName}" not found in element manager` } as ScreenshotInstructionResult;
        }
        const nodeId = await element.GetNodeId();
        if (!nodeId) {
          return { ...defaultResult, error: `Failed to get nodeId for element "${elementName}"` } as ScreenshotInstructionResult;
        }
        await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId });
        await this.Delay(0.1);
        const boxModel = await this.ExecuteCDPCommand('DOM.getBoxModel', { nodeId });
        if (!boxModel?.model?.content || boxModel.model.content.length < 8) {
          return { ...defaultResult, error: `Failed to get box model for element "${elementName}"` } as ScreenshotInstructionResult;
        }
        const content = boxModel.model.content;
        const x = Math.min(content[0], content[2], content[4], content[6]);
        const y = Math.min(content[1], content[3], content[5], content[7]);
        const width = Math.max(content[0], content[2], content[4], content[6]) - x;
        const height = Math.max(content[1], content[3], content[5], content[7]) - y;
        const screenshotResult = await this.ExecuteCDPCommand('Page.captureScreenshot', {
          format,
          quality: format === 'jpeg' ? quality : undefined,
          clip: { x, y, width, height, scale: 1 }
        });
        const base64Image = screenshotResult?.data || '';
        if (!base64Image) {
          throw new Error('Failed to capture element screenshot: empty result');
        }
        dataUrl = `data:image/${format};base64,${base64Image}`;
      } else if (fullPage) {
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

        dataUrl = `data:image/${format};base64,${base64Image}`;
      } else {
        // 使用 Chrome Tabs API 截取可见区域
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