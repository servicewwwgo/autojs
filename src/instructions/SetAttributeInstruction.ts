import { elementManager } from '../managers';
import type { SetAttributeInstruction, SetAttributeInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：设置 DOM 元素的属性值，用于动态修改页面元素状态（如设置 input 的 value、修改元素的 class 等），支持动态页面操作
 *
 * 实现方式：继承自 BaseInstructionClass，从 ElementManager 获取元素，使用 CDP 的 DOM.setAttributeValue 方法设置属性值
 *
 * 注意事项：
 * - elementName 为必需参数，元素需先通过 find_element 指令定位并保存到 ElementManager
 * - attribute 为必需参数，指定要设置的属性名
 * - value 为必需参数，指定要设置的属性值
 * - 如果元素不存在或 nodeId 获取失败，会返回明确的错误信息
 * - 设置属性后会记录日志，便于调试和监控
 * - 支持延迟执行（delay 属性）和重试机制（retry 属性）
 *
 * 相关代码：src/types/instruction.ts - SetAttributeInstruction 接口（指令数据结构），src/managers/ElementManager.ts - ElementManager 类（元素管理），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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

    /**
     * 业务逻辑：执行设置元素属性操作，修改指定元素的属性值，用于动态页面操作和状态修改
     *
     * 实现方式：从 ElementManager 获取元素，获取 nodeId，使用 CDP 的 DOM.setAttributeValue 方法设置属性值
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 元素必须存在于 ElementManager 中，否则返回错误
     * - 需要先获取 nodeId，如果获取失败会返回错误
     * - 使用 DOM.setAttributeValue 方法设置属性，适用于标准 HTML 属性
     * - 设置属性后会记录日志，包含元素名称、属性名和属性值，便于调试
     * - 返回结果包含设置的元素名称、属性名和属性值，用于确认操作成功
     *
     * 相关代码：src/types/instruction.ts - SetAttributeInstructionResult 接口（结果数据结构），src/managers/ElementManager.ts - ElementManager.GetElementByName() 方法（获取元素），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
     */
    public async Execute(): Promise<SetAttributeInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: SetAttributeInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            // 从 elementManager 获取元素
            const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

            if (!element) {
                return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` } as SetAttributeInstructionResult;
            }

            // 获取 nodeId
            const nodeId = await element.GetNodeId();
            if (!nodeId) {
                return { ...defaultResult, error: `Failed to get nodeId for element "${this.params.elementName}"` } as SetAttributeInstructionResult;
            }

            // 使用 CDP 的 DOM.setAttributeValue 方法设置属性
            await this.ExecuteCDPCommand('DOM.setAttributeValue', {
                nodeId: nodeId,
                name: this.params.attribute,
                value: this.params.value
            });

            OutputLogToFile(`[SetAttributeInstruction] Set element attribute successfully: ${this.params.elementName}.${this.params.attribute} = ${this.params.value}`, { level: LogLevel.INFO });

            return { ...defaultResult, success: true, data: { elementName: this.params.elementName, attribute: this.params.attribute, value: this.params.value } } as SetAttributeInstructionResult;
        });

        return result as SetAttributeInstructionResult;
    }
}