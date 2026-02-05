import { ElementClass } from '../managers';
import { ElementData, FindElementInstruction, FindElementInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：在页面中定位和查找 DOM 元素，为后续操作（点击、输入、获取属性等）做准备，是大多数页面操作的基础步骤
 *
 * 实现方式：继承自 BaseInstructionClass，使用 ElementClass 的 LocateElement() 方法在页面中定位元素，定位成功后会设置 nodeId 和 tag
 *
 * 注意事项：
 * - params.element 为必需参数，包含元素的选择器、选择器类型等信息
 * - 定位成功后会返回完整的元素信息，包括系统自动生成的 nodeId 和 tag
 * - nodeId 用于后续的 CDP 操作（如点击、输入），tag 用于在 content script 中快速查找元素
 * - 如果元素未找到，会返回明确的错误信息，包含元素名称和选择器
 * - 支持延迟执行（delay 属性）和重试机制（retry 属性）
 * - 定位后的元素会被保存到 ElementManager 中，可通过元素名称获取
   *
 * 相关代码：src/types/instruction.ts - FindElementInstruction 接口（指令数据结构），src/managers/ElementManager.ts - ElementClass 类（元素定位逻辑），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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
     * 业务逻辑：执行元素查找操作，定位页面中的目标元素，获取元素的 nodeId 和 tag，为后续操作做准备
     *
     * 实现方式：创建 ElementClass 实例，调用 LocateElement() 方法定位元素，定位成功返回元素完整信息
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 使用 ElementClass 封装元素定位逻辑，支持多种选择器类型和相对关系定位
     * - 定位成功后会返回包含 nodeId 和 tag 的元素信息，这些信息由系统自动生成
     * - 如果元素未找到（LocateElement() 返回 false），会返回包含元素名称和选择器的错误信息
     * - 定位后的元素会被保存到 ElementManager 中，后续可通过元素名称获取
     * - 返回结果包含完整的 ElementData 对象，可用于后续的元素操作
     *
     * 相关代码：src/types/instruction.ts - FindElementInstructionResult 接口（结果数据结构），src/managers/ElementManager.ts - ElementClass.LocateElement() 方法（元素定位实现），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
     */
    public async Execute(): Promise<FindElementInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: FindElementInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 如果设置了延迟，先等待
            await this.Delay(this.delay);

            const element = new ElementClass({
                ...this.params.element,
                tabId: this.tabId
            });

            // 定位元素
            if (!await element.LocateElement()) {
                return { ...defaultResult, error: `Element "${this.params.element.name}" not found with selector: ${this.params.element.selector}` } as FindElementInstructionResult;
            }

            return { ...defaultResult, success: true, data: element.ToObject() as ElementData } as FindElementInstructionResult;
        });

        return result as FindElementInstructionResult;
    }
}