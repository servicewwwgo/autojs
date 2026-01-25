import { elementManager } from '../managers';
import type { KeyboardInstruction, KeyboardInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 键盘操作指令
 */
export class KeyboardInstructionClass extends BaseInstructionClass {
    public params: {
        elementName?: string;
        action: 'press' | 'type' | 'keydown' | 'keyup';
        key?: string;
        text?: string;
    };

    // 特殊按键列表（不需要 char 事件的按键）
    private static readonly SPECIAL_KEYS = [
        'Enter', 'Escape', 'Tab', 'Backspace', 'Delete',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'Control', 'Alt', 'Shift', 'Meta'
    ] as const;

    // Windows 虚拟键码映射表
    private static readonly VIRTUAL_KEY_CODES: Record<string, number> = {
        Enter: 13,      // VK_RETURN
        Escape: 27,    // VK_ESCAPE
        Tab: 9,        // VK_TAB
        Backspace: 8,  // VK_BACK
        Delete: 46,    // VK_DELETE
        ArrowUp: 38,   // VK_UP
        ArrowDown: 40, // VK_DOWN
        ArrowLeft: 37, // VK_LEFT
        ArrowRight: 39, // VK_RIGHT
        Home: 36,      // VK_HOME
        End: 35,       // VK_END
        PageUp: 33,    // VK_PRIOR
        PageDown: 34,  // VK_NEXT
        F1: 112, F2: 113, F3: 114, F4: 115,
        F5: 116, F6: 117, F7: 118, F8: 119,
        F9: 120, F10: 121, F11: 122, F12: 123,
        Control: 17,   // VK_CONTROL
        Alt: 18,       // VK_MENU
        Shift: 16,     // VK_SHIFT
        Meta: 91       // VK_LWIN
    };

    // 按键 code 名称映射表（用于 CDP Input.dispatchKeyEvent）
    private static readonly KEY_CODE_NAMES: Record<string, string> = {
        Enter: 'Enter',
        Escape: 'Escape',
        Tab: 'Tab',
        Backspace: 'Backspace',
        Delete: 'Delete',
        ArrowUp: 'ArrowUp',
        ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        Home: 'Home',
        End: 'End',
        PageUp: 'PageUp',
        PageDown: 'PageDown',
        F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4',
        F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8',
        F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
        Control: 'ControlLeft',
        Alt: 'AltLeft',
        Shift: 'ShiftLeft',
        Meta: 'MetaLeft'
    };

    constructor(instruction: KeyboardInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 判断是否为特殊按键
     * @param key - 按键名称
     * @returns 是否为特殊按键
     */
    private isSpecialKey(key: string): boolean {
        if (!key || key.length === 0) {
            return false;
        }
        return (KeyboardInstructionClass.SPECIAL_KEYS as readonly string[]).includes(key);
    }

    /**
     * 获取按键的 Windows 虚拟键码
     * @param key - 按键名称或字符
     * @returns Windows 虚拟键码（Virtual Key Code）
     */
    private getVirtualKeyCode(key: string): number {
        if (!key || key.length === 0) {
            throw new Error('Key cannot be empty');
        }
        return KeyboardInstructionClass.VIRTUAL_KEY_CODES[key] || key.toUpperCase().charCodeAt(0);
    }

    /**
     * 获取按键的 code 名称（用于 CDP Input.dispatchKeyEvent）
     * @param key - 按键名称或字符
     * @returns 按键的 code 名称
     */
    private getKeyCodeName(key: string): string {
        if (!key || key.length === 0) {
            throw new Error('Key cannot be empty');
        }
        return KeyboardInstructionClass.KEY_CODE_NAMES[key] || `Key${key.toUpperCase()}`;
    }

    /**
     * 发送键盘事件
     * @param type - 事件类型：'keyDown' | 'keyUp' | 'char'
     * @param key - 按键
     * @param text - 字符文本（仅用于 char 类型）
     */
    private async dispatchKeyEvent(
        type: 'keyDown' | 'keyUp' | 'char',
        key: string,
        text?: string
    ): Promise<void> {
        if (type === 'char') {
            // char 事件只需要 text 参数
            await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                type: 'char',
                text: text || key
            });
        } else {
            // keyDown 和 keyUp 事件需要完整的按键信息
            await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                type: type,
                windowsVirtualKeyCode: this.getVirtualKeyCode(key),
                code: this.getKeyCodeName(key),
                key: key
            });
        }
    }

    /**
     * 执行按键按下操作（press）
     * 对于普通字符：keyDown → char → keyUp
     * 对于特殊按键：keyDown → keyUp
     */
    private async executePress(key: string): Promise<void> {
        const isSpecial = this.isSpecialKey(key);

        if (isSpecial) {
            // 特殊按键：keyDown → keyUp
            await this.dispatchKeyEvent('keyDown', key);
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('keyUp', key);
        } else {
            // 普通字符：keyDown → char → keyUp（完整事件序列）
            await this.dispatchKeyEvent('keyDown', key);
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('char', key, key);
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('keyUp', key);
        }
    }

    /**
     * 执行输入操作（type）
     * 逐个字符输入，每个字符使用 char 事件
     */
    private async executeType(key: string): Promise<void> {
        for (const char of Array.from(key)) {
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('char', char, char);
        }
    }

    /**
     * 执行按键按下操作（keydown）
     */
    private async executeKeyDown(key: string): Promise<void> {
        await this.dispatchKeyEvent('keyDown', key);
    }

    /**
     * 执行按键释放操作（keyup）
     */
    private async executeKeyUp(key: string): Promise<void> {
        await this.dispatchKeyEvent('keyUp', key);
    }

    /**
     * 执行键盘操作指令
     * @returns 指令执行结果
     */
    public async Execute(): Promise<KeyboardInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: KeyboardInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            if (this.params.elementName) {
                // 从 elementManager 获取元素
                const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

                if (!element) {
                    return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` } as KeyboardInstructionResult;
                }

                const nodeId = await element.GetNodeId();
                if (!nodeId) {
                    return { ...defaultResult, error: `Failed to get nodeId for element "${this.params.elementName}"` } as KeyboardInstructionResult;
                }

                // 滚动到元素位置
                await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: nodeId });
                // 聚焦元素
                await this.ExecuteCDPCommand('DOM.focus', { nodeId: nodeId });
            }

            if (this.params.key !== undefined && this.params.key !== null && this.params.key !== '') {
                // 根据操作类型执行相应的键盘操作
                switch (this.params.action) {
                    case 'press':
                        await this.executePress(this.params.key);
                        break;
                    case 'type':
                        await this.executeType(this.params.key);
                        break;
                    case 'keydown':
                        await this.executeKeyDown(this.params.key);
                        break;
                    case 'keyup':
                        await this.executeKeyUp(this.params.key);
                        break;
                    default:
                        return { ...defaultResult, error: `Unknown keyboard action: ${this.params.action}` } as KeyboardInstructionResult;
                }

                return { ...defaultResult, success: true, data: { key: this.params.key, action: this.params.action } } as KeyboardInstructionResult;
            }

            if (this.params.text !== undefined && this.params.text !== null && this.params.text !== '') {
                // 根据操作类型执行相应的键盘操作
                switch (this.params.action) {
                    case 'press':
                        for (const char of Array.from(this.params.text)) {
                            await this.executePress(char);
                        }
                        break;
                    case 'type':
                        for (const char of Array.from(this.params.text)) {
                            await this.executeType(char);
                        }
                        break;
                    case 'keydown':
                        for (const char of Array.from(this.params.text)) {
                            await this.executeKeyDown(char);
                        }
                        break;
                    case 'keyup':
                        for (const char of Array.from(this.params.text)) {
                            await this.executeKeyUp(char);
                        }
                        break;
                    default:
                        return { ...defaultResult, error: `Unknown keyboard action: ${this.params.action}` } as KeyboardInstructionResult;
                }

                return { ...defaultResult, success: true, data: { text: this.params.text, action: this.params.action } } as KeyboardInstructionResult;
            }

            // 如果 key 和 text 都不存在，返回错误
            return { ...defaultResult, error: 'Either "key" or "text" parameter must be provided' } as KeyboardInstructionResult;
        });

        return result as KeyboardInstructionResult;
    }
}

