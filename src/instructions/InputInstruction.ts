import type { InputInstruction, InstructionResult, ContentScriptMessageType } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { elementManager } from '../managers';

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

            // 获取元素的 nodeId 和 tag
            const nodeId = element.GetNodeId();
            const tag = element.GetTag();

            if (!nodeId) {
                return { ...defaultResult, error: `Element "${this.params.elementName}" has no nodeId. Make sure the element was found using FindElementInstruction first.` };
            }

            // 启用 DOM 域
            await this.ExecuteCDPCommand('DOM.enable');
            // 滚动到元素位置
            await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: nodeId });
            // 聚焦元素
            await this.ExecuteCDPCommand('DOM.focus', { nodeId: nodeId });

            // 如果需要清空输入框，先选中所有文本（Ctrl+A）
            if (this.params.clear === true) {
                // 按下 Ctrl 键
                await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                    type: 'keyDown',
                    windowsVirtualKeyCode: 17, // Ctrl 键的虚拟键码
                    code: 'ControlLeft',
                    key: 'Control'
                });
                // 按下 A 键（全选）
                await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                    type: 'keyDown',
                    windowsVirtualKeyCode: 65, // A 键的虚拟键码
                    code: 'KeyA',
                    key: 'a'
                });
                // 释放 A 键
                await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    windowsVirtualKeyCode: 65,
                    code: 'KeyA',
                    key: 'a'
                });
                // 释放 Ctrl 键
                await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    windowsVirtualKeyCode: 17,
                    code: 'ControlLeft',
                    key: 'Control'
                });

                // 等待 100 毫秒，确保全选操作完成
                // 注意：Delay 方法使用秒为单位，所以 100 毫秒 = 0.1 秒
                await this.Delay(0.1);
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

    ToObject(): object {
        return {
            ...super.ToObject(),
            params: this.params
        } as object;
    }
}