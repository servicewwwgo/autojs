import { elementManager } from '../managers';
import type { InputInstruction, InputInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：向输入框、文本域等元素输入文本内容，支持清空后输入和逐字符输入，确保文本正确输入到页面元素中
 *
 * 实现方式：继承自 BaseInstructionClass，从 ElementManager 获取元素，滚动到元素位置并聚焦，然后使用 CDP 的 Input.dispatchKeyEvent 逐字符输入文本
 *
 * 注意事项：
 * - elementName 为必需参数，元素需先通过 find_element 指令定位并保存到 ElementManager
 * - text 为必需参数，包含要输入的文本内容
 * - clear 参数为可选，设置为 true 时会先清空输入框再输入
 * - 清空操作优先使用 Runtime.callFunctionOn 直接设置 value 并触发事件，如果失败则回退到键盘事件（Ctrl+A + Delete）
 * - 支持 Unicode 字符（包括中文、emoji 等），使用 Array.from 正确处理代理对
 * - 如果设置了 delay 属性，会在每个字符输入前等待，实现慢速输入效果
 * - 输入前会滚动到元素位置并聚焦，确保输入操作正确执行
 *
 * 相关代码：src/types/instruction.ts - InputInstruction 接口（指令数据结构），src/managers/ElementManager.ts - ElementManager 类（元素管理），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
 */
export class InputInstructionClass extends BaseInstructionClass {
    public params: {
        elementName: string;
        text: string;
        clear?: boolean;
    };

    constructor(instruction: InputInstruction) {
        super(instruction);

        this.params = instruction.params;
    }

    /**
     * 业务逻辑：执行文本输入操作，将指定文本输入到目标元素中，支持清空后输入和逐字符输入
     *
     * 实现方式：获取元素并滚动聚焦，如果需要清空则先清空输入框，然后使用 Input.dispatchKeyEvent 逐字符输入文本
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 元素必须存在于 ElementManager 中，否则返回错误
     * - 输入前会滚动到元素位置（DOM.scrollIntoViewIfNeeded）并聚焦（DOM.focus），确保元素可见且可输入
     * - 聚焦后会等待 0.2 秒，确保元素获得焦点
     * - 清空操作优先使用 Runtime.callFunctionOn 直接设置 value 并触发 input/change 事件，适用于 React 等框架
     * - 如果无法获取 objectId，回退到键盘事件方法（Ctrl+A + Delete）
     * - 文本输入使用 Input.dispatchKeyEvent 的 type: 'char' 事件，支持 Unicode 字符
     * - 如果设置了 delay 属性，会在每个字符输入前等待，实现慢速输入效果
     * - 使用 Array.from 正确处理 Unicode 字符（包括代理对和 emoji）
     *
     * 相关代码：src/types/instruction.ts - InputInstructionResult 接口（结果数据结构），src/managers/ElementManager.ts - ElementManager.GetElementByName() 方法（获取元素），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
     */
    public async Execute(): Promise<InputInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InputInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

            // 从 elementManager 获取元素
            const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

            if (!element) {
                return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` } as InputInstructionResult;
            }

            // 获取 nodeId
            const nodeId = await element.GetNodeId();

            if (!nodeId) {
                return { ...defaultResult, error: `Failed to get nodeId for element "${this.params.elementName}"` } as InputInstructionResult;
            }

            // 滚动到元素位置
            await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: nodeId });
            // 聚焦元素
            await this.ExecuteCDPCommand('DOM.focus', { nodeId: nodeId });
            // 等待元素获得焦点
            await this.Delay(0.2);

            // 如果需要清空输入框，使用 Runtime.evaluate 直接设置 value 并触发事件
            if (this.params.clear === true) {
                // 获取元素的 objectId，用于 Runtime.evaluate
                const objectIdResult = await this.ExecuteCDPCommand('DOM.resolveNode', {
                    nodeId: nodeId
                });

                if (objectIdResult?.object?.objectId) {
                    // 使用 Runtime.evaluate 直接设置 value 为空并触发 input 和 change 事件
                    await this.ExecuteCDPCommand('Runtime.callFunctionOn', {
                        objectId: objectIdResult.object.objectId,
                        functionDeclaration: `
                            function() {
                                // 设置 value 属性
                                this.value = '';
                                
                                // 触发 input 事件
                                const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                                this.dispatchEvent(inputEvent);
                                
                                // 触发 change 事件
                                const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                                this.dispatchEvent(changeEvent);
                                
                                // 对于 React 等框架，还需要触发更底层的事件
                                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                    window.HTMLInputElement.prototype,
                                    'value'
                                )?.set;
                                if (nativeInputValueSetter) {
                                    nativeInputValueSetter.call(this, '');
                                    const event = new Event('input', { bubbles: true });
                                    this.dispatchEvent(event);
                                }
                                
                                return true;
                            }
                        `,
                        returnByValue: true
                    });
                } else {
                    // 如果无法获取 objectId，回退到键盘事件方法
                    // 按下 Ctrl 键
                    await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        windowsVirtualKeyCode: 17, // Ctrl 键的虚拟键码
                        code: 'ControlLeft',
                        key: 'Control'
                    });
                    await this.Delay(0.1);
                    // 按下 A 键（全选）
                    await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        windowsVirtualKeyCode: 65, // A 键的虚拟键码
                        code: 'KeyA',
                        key: 'a'
                    });
                    await this.Delay(0.1);
                    // 释放 A 键
                    await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        windowsVirtualKeyCode: 65,
                        code: 'KeyA',
                        key: 'a'
                    });
                    await this.Delay(0.1);
                    // 释放 Ctrl 键
                    await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        windowsVirtualKeyCode: 17,
                        code: 'ControlLeft',
                        key: 'Control'
                    });
                    // 等待全选操作完成
                    await this.Delay(0.2);
                    // 按下 Delete 键删除选中的文本
                    await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        windowsVirtualKeyCode: 46, // Delete 键的虚拟键码
                        code: 'Delete',
                        key: 'Delete'
                    });
                    await this.Delay(0.1);
                    // 释放 Delete 键
                    await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        windowsVirtualKeyCode: 46,
                        code: 'Delete',
                        key: 'Delete'
                    });
                    // 等待删除操作完成
                    await this.Delay(0.2);
                }

                await this.Delay(1);
            }

            // 输入文本 - 支持中文字符和 Unicode 字符输入
            // 使用 Array.from 确保正确处理 Unicode 字符（包括代理对和 emoji）
            // 虽然 for...of 已经能正确处理 Unicode，但 Array.from 更明确和可靠
            const textArray = Array.from(this.params.text);

            for (const char of textArray) {
                // 如果设置了延迟，在输入每个字符前等待
                // delay 单位为秒，例如 delay=0.1 表示每个字符间隔 0.1 秒
                if (this.delay && this.delay > 0) {
                    await this.Delay(this.delay);
                }

                // 使用 CDP 的 Input.dispatchKeyEvent 方法输入字符
                // type: 'char' 表示输入字符事件，text 参数包含要输入的字符
                // 这对于 ASCII 和 Unicode 字符（包括中文、emoji 等）都有效
                await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                    type: 'char',
                    text: char
                });
            }

            return { ...defaultResult, success: true, data: { text: this.params.text } } as InputInstructionResult;
        });

        return result as InputInstructionResult;
    }
}