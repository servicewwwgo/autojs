import { ElementTag } from '../consts';
import { elementManager } from '../managers';
import type { GetAttributeInstruction, InstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 获取元素属性指令
 */
export class GetAttributeInstructionClass extends BaseInstructionClass {
  public params: {
    elementName: string;
    attribute: string;
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

      if (!await element.LocateElement()) {
        return { ...defaultResult, error: `Element "${this.params.elementName}" not found with selector: ${element.GetSelector()}` };
      }

      // 使用 CDP 协议获取元素属性
      // DOM.getAttributes 返回格式: { attributes: ["attr1", "value1", "attr2", "value2", ...] }
      const attributesResult = await this.ExecuteCDPCommand('DOM.getAttributes', {
        nodeId: element.GetNodeId(),
      });

      // 将成对的数组转换为键值对对象
      const attributesArray = attributesResult?.attributes || [];
      const attributesObject: Record<string, string> = {};

      for (let i = 0; i < attributesArray.length; i += 2) {
        const attrName = attributesArray[i];
        const attrValue = attributesArray[i + 1];
        if (attrName && attrValue !== undefined) {
          attributesObject[attrName] = attrValue;
        }
      }

      OutputLogToFile(`[GetAttributeInstruction] Attributes: ${JSON.stringify(attributesObject)}`, { level: LogLevel.INFO });

      // 获取属性值
      let attributeValue: string | undefined = undefined;

      // 获取指定的属性值
      // 先从 attributesObject 中获取（HTML 属性）
      attributeValue = attributesObject[this.params.attribute];

      // 如果 attributesObject 中没有，尝试使用 Runtime.evaluate 获取元素属性（如 value, checked 等）
      if (attributeValue === undefined) {
        try {
          const attrResult = await this.ExecuteCDPCommand('Runtime.evaluate', {
            expression: `(function() {
                const node = document.querySelector('[${ElementTag}=${JSON.stringify(element.GetTag())}]');
                if (node) {
                  return node.getAttribute(${JSON.stringify(this.params.attribute)});
                }
                return null;
              })()`,
            returnByValue: true,
            timeout: this.timeout
          });

          attributeValue = attrResult?.result?.value ?? undefined;
        } catch (error) {
          OutputLogToFile(`[GetAttributeInstruction] Failed to get attribute "${this.params.attribute}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        }
      }

      return { ...defaultResult, success: true, data: { usage: this.params.usage, value: attributeValue } };
    });

    return result;
  }
}