import { elementManager } from '../managers';
import type { InstructionResult, SetAttributeInstruction } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 设置元素属性指令
 */
export class SetAttributeInstructionClass extends BaseInstructionClass {
    public params: {
        elementName: string;
        attribute: string;
        value: string;
    };

    constructor(instruction: SetAttributeInstruction) {
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

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 使用 CDP 的 DOM.setAttributeValue 方法设置属性
            await this.ExecuteCDPCommand('DOM.setAttributeValue', {
                nodeId: element.GetNodeId(),
                name: this.params.attribute,
                value: this.params.value
            });

            OutputLogToFile(`[SetAttributeInstruction] Set element attribute successfully: ${this.params.elementName}.${this.params.attribute} = ${this.params.value}`, { level: LogLevel.INFO });

            return { ...defaultResult, success: true, data: { elementName: this.params.elementName, attribute: this.params.attribute, value: this.params.value } };
        });

        return result;
    }
}