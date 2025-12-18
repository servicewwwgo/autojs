import type { GetAttributeInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { elementManager } from '../managers';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 获取元素属性指令
 */
export class GetAttributeInstructionClass extends BaseInstructionClass {
  public params: {
    elementName: string;
    attribute?: string;
    usage?: "variable" | "data" | "none";
  };

  constructor(instruction: GetAttributeInstruction) {
    super(instruction);
    this.params = instruction.params;
  }

  public async Execute(): Promise<InstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 从 elementManager 获取元素
      const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

      if (!element) {
        return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` };
      }

      // 使用 CDP 协议获取元素属性
      const attributes = await this.ExecuteCDPCommand('DOM.getAttributes', {
        nodeId: element.GetNodeId(),
      });

      OutputLogToFile(`[GetAttributeInstruction] Attributes: ${JSON.stringify(attributes)}`, { level: LogLevel.INFO });

      return { ...defaultResult, success: true, data: { usage: this.params.usage, value: attributes[this.params.attribute || 'text'] ?? undefined } };
    });

    return result;
  }
}