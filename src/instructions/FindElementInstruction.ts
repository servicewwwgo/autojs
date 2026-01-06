import { ElementClass } from '../managers';
import { ElementData, FindElementInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 元素查找指令
 */
export class FindElementInstructionClass extends BaseInstructionClass {
    public params: {
        element: ElementData;
    };

    constructor(instruction: FindElementInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 執行元素查找指令(並獲取元素nodeId及設置元素節點的tag)
     * @returns 指令執行結果
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {

            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            const element = new ElementClass({
                ...this.params.element,
                tabId: this.tabId
            });

            // 定位元素
            if (!await element.LocateElement()) {
                return { ...defaultResult, error: `Element "${this.params.element.name}" not found with selector: ${this.params.element.selector}` };
            }

            return { ...defaultResult, success: true, data: element };
        });

        return result;
    }
}