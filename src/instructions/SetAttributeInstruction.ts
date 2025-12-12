import type { SetAttributeInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { elementManager } from '../managers';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 设置元素属性指令
 */
export class SetAttributeInstructionClass extends BaseInstructionClass {
    public elementName: string;
    public attribute: string;
    public value: string;

    constructor(instruction: SetAttributeInstruction) {
        super(instruction);
        this.elementName = instruction.elementName;
        this.attribute = instruction.attribute;
        this.value = instruction.value;
    }

    ToObject(): object {
        return {
            ...super.ToObject(),
            elementName: this.elementName,
            attribute: this.attribute,
            value: this.value
        } as object;
    }

    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InstructionResult = { instructionID: this.instructionID, success: false, duration: 0 };

            // 从 elementManager 获取元素
            const element = elementManager.GetElementByName(this.tabId, this.elementName);

            if (!element) {
                return { ...defaultResult, error: `Element "${this.elementName}" not found in element manager` };
            }

            // 获取元素的 nodeId
            const nodeId = element.GetNodeId();

            if (!nodeId) {
                return { ...defaultResult, error: `Element "${this.elementName}" has no nodeId. Make sure the element was found using FindElementInstruction first.` };
            }

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 使用 CDP 的 DOM.setAttributeValue 方法设置属性
            await this.ExecuteCDPCommand('DOM.setAttributeValue', {
                nodeId: nodeId,
                name: this.attribute,
                value: this.value
            });

            OutputLogToFile(`[SetAttributeInstruction] 设置元素属性成功: ${this.elementName}.${this.attribute} = ${this.value}`, { level: LogLevel.INFO });

            return { ...defaultResult, success: true, data: { elementName: this.elementName, attribute: this.attribute, value: this.value } };
        });

        return result;
    }
}