import { ElementTag } from '../consts';
import { elementManager } from '../managers';
import type { GetAttributeInstruction, GetAttributeInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：获取 DOM 元素的属性值，用于数据提取和页面状态读取，支持标准 HTML 属性和 JavaScript 属性（如 value、checked 等）
 *
 * 实现方式：继承自 BaseInstructionClass，先从 ElementManager 获取元素，然后使用 CDP 的 DOM.getAttributes 获取 HTML 属性，如果未找到则使用 Runtime.evaluate 获取 JavaScript 属性
 *
 * 注意事项：
 * - elementName 为必需参数，元素需先通过 find_element 指令定位并保存到 ElementManager
 * - attribute 为必需参数，指定要获取的属性名
 * - usage 参数标识属性值的用途（variable 用于变量赋值、data 用于数据返回、none 仅获取）
 * - 优先从 HTML 属性中获取，如果未找到则尝试获取 JavaScript 属性（如 input.value、checkbox.checked）
 * - 如果元素不存在或 nodeId 获取失败，会返回明确的错误信息
 * - 属性值可能为 undefined（属性不存在）或 null（属性值为空）
 *
 * 相关代码：src/types/instruction.ts - GetAttributeInstruction 接口（指令数据结构），src/managers/ElementManager.ts - ElementManager 类（元素管理），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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

  /**
   * 业务逻辑：执行获取元素属性操作，读取指定元素的属性值并返回，用于数据提取和页面状态验证
   *
   * 实现方式：从 ElementManager 获取元素，获取 nodeId，使用 DOM.getAttributes 获取 HTML 属性，如果未找到则使用 Runtime.evaluate 获取 JavaScript 属性
   *
   * 注意事项：
   * - 执行前会先调用 Delay() 方法处理延迟
   * - 元素必须存在于 ElementManager 中，否则返回错误
   * - 先尝试从 HTML 属性中获取（DOM.getAttributes），适用于标准 HTML 属性（如 id、class、href 等）
   * - 如果 HTML 属性中未找到，使用 Runtime.evaluate 获取 JavaScript 属性（如 value、checked、innerText 等）
   * - DOM.getAttributes 返回的 attributes 数组格式为 [name1, value1, name2, value2, ...]，需要转换为键值对对象
   * - 获取到的属性值会记录到日志中，便于调试
   * - 返回结果包含 usage 和 value 字段，value 可能为 undefined（属性不存在）
   *
   * 相关代码：src/types/instruction.ts - GetAttributeInstructionResult 接口（结果数据结构），src/managers/ElementManager.ts - ElementManager.GetElementByName() 方法（获取元素），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
   */
  public async Execute(): Promise<GetAttributeInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: GetAttributeInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 从 elementManager 获取元素
      const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

      if (!element) {
        return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` } as GetAttributeInstructionResult;
      }

      // 使用 CDP 协议获取元素属性
      // DOM.getAttributes 返回格式: { attributes: ["attr1", "value1", "attr2", "value2", ...] }
      const nodeId = await element.GetNodeId();

      if (!nodeId) {
        return { ...defaultResult, error: `Failed to get nodeId for element "${this.params.elementName}"` } as GetAttributeInstructionResult;
      }

      const attributesResult = await this.ExecuteCDPCommand('DOM.getAttributes', {
        nodeId: nodeId,
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
            timeout: this.timeout ? this.timeout * 1000 : undefined // 将秒转换为毫秒
          });

          attributeValue = attrResult?.result?.value ?? undefined;
        } catch (error) {
          OutputLogToFile(`[GetAttributeInstruction] Failed to get attribute "${this.params.attribute}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        }
      }

      return { ...defaultResult, success: true, data: { usage: this.params.usage, value: attributeValue } } as GetAttributeInstructionResult;
    });

    return result as GetAttributeInstructionResult;
  }
}