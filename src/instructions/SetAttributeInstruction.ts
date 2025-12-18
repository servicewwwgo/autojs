import type { SetAttributeInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { elementManager } from '../managers';
import { OutputLogToFile, LogLevel } from '../utils';

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

            // 获取元素的 nodeId
            const nodeId = element.GetNodeId();

            if (!nodeId) {
                return { ...defaultResult, error: `Element "${this.params.elementName}" has no nodeId. Make sure the element was found using FindElementInstruction first.` };
            }

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 使用 CDP 的 DOM.setAttributeValue 方法设置属性
            await this.ExecuteCDPCommand('DOM.setAttributeValue', {
                nodeId: nodeId,
                name: this.params.attribute,
                value: this.params.value
            });

            OutputLogToFile(`[SetAttributeInstruction] Set element attribute successfully: ${this.params.elementName}.${this.params.attribute} = ${this.params.value}`, { level: LogLevel.INFO });

            return { ...defaultResult, success: true, data: { elementName: this.params.elementName, attribute: this.params.attribute, value: this.params.value } };
        });

        return result;
    }
}