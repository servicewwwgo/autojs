import type { GetAttributeInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { ElementManager } from '../managers';

/**
 * 获取元素属性指令
 */
export class GetAttributeInstructionClass extends BaseInstructionClass {
  public elementName: string;
  public attribute?: string;

  ToObject(): object {
    return {
      ...super.ToObject(),
      elementName: this.elementName,
      attribute: this.attribute
    } as object;
  }

  constructor(instruction: GetAttributeInstruction, elementManager: ElementManager) {
    super(instruction, elementManager);
    this.elementName = instruction.elementName;
    this.attribute = instruction.attribute;
  }

  public async Execute(): Promise<InstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: InstructionResult = { instructionID: this.instructionID, success: false, duration: 0 };

      // 从 elementManager 获取元素
      const element = this._elementManager.GetElementByName(this.tabId, this.elementName);

      if (!element) {
        return { ...defaultResult, error: `Element "${this.elementName}" not found in element manager` };
      }

      // 获取元素的 tag
      const tag = element.GetTag();

      if (!tag) {
        return { ...defaultResult, error: `Element "${this.elementName}" has no tag. Make sure the element was found using FindElementInstruction first.` };
      }

      // 发送消息到 content script 获取属性
      const response: any = await this.SendMessageToContentScript({
        type: 'get_attribute',
        params: {
          tag: tag,
          attribute: this.attribute || 'text'
        }
      });

      // 检查响应是否成功
      if (!response || !response.success) {
        return { ...defaultResult, error: response?.error || `Failed to get attribute "${this.attribute || 'text'}" for element "${this.elementName}"` };
      }

      return { ...defaultResult, success: true, data: response.data ?? undefined };
    });

    return result;
  }
}