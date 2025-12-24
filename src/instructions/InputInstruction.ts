import { elementManager } from '../managers';
import type { InputInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 文本输入指令
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

    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 从 elementManager 获取元素
            const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

            if (!element) {
                return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` };
            }

            // 定位元素
            if (!await element.LocateElement()) {
                return { ...defaultResult, error: `Element "${this.params.elementName}" not found with selector: ${element.GetSelector()}` };
            }

            // 滚动到元素位置
            await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: element.GetNodeId() });
            // 聚焦元素
            await this.ExecuteCDPCommand('DOM.focus', { nodeId: element.GetNodeId() });
            // 等待元素获得焦点
            await this.Delay(0.2);

            // 如果需要清空输入框，使用 Runtime.evaluate 直接设置 value 并触发事件
            if (this.params.clear === true) {
                // 获取元素的 objectId，用于 Runtime.evaluate
                const objectIdResult = await this.ExecuteCDPCommand('DOM.resolveNode', {
                    nodeId: element.GetNodeId()
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

            return { ...defaultResult, success: true, data: { text: this.params.text } };
        });

        return result;
    }
}