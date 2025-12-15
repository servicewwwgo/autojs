import type { KeyboardInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { elementManager } from '../managers';

/**
 * 键盘操作指令
 */
export class KeyboardInstructionClass extends BaseInstructionClass {
    public elementName?: string;
    public action: 'press' | 'type' | 'keydown' | 'keyup';
    public key: string;

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
        this.elementName = instruction.elementName;
        this.action = instruction.action;
        this.key = instruction.key;
    }

    ToObject(): object {
        return {
            ...super.ToObject(),
            elementName: this.elementName,
            action: this.action,
            key: this.key
        } as object;
    }

    /**
     * 判断是否为特殊按键
     * @param key - 按键名称
     * @returns 是否为特殊按键
     */
    private isSpecialKey(key: string): boolean {
        return KeyboardInstructionClass.SPECIAL_KEYS.includes(key as any);
    }

    /**
     * 获取按键的 Windows 虚拟键码
     * @param key - 按键名称或字符
     * @returns Windows 虚拟键码（Virtual Key Code）
     */
    private getVirtualKeyCode(key: string): number {
        return KeyboardInstructionClass.VIRTUAL_KEY_CODES[key] || key.toUpperCase().charCodeAt(0);
    }

    /**
     * 获取按键的 code 名称（用于 CDP Input.dispatchKeyEvent）
     * @param key - 按键名称或字符
     * @returns 按键的 code 名称
     */
    private getKeyCodeName(key: string): string {
        return KeyboardInstructionClass.KEY_CODE_NAMES[key] || `Key${key.toUpperCase()}`;
    }

    /**
     * 准备元素（聚焦、滚动等）
     * @returns 成功返回 true，失败返回错误信息
     */
    private async prepareElement(): Promise<{ success: true } | { success: false; error: string }> {
        if (!this.elementName) {
            return { success: true };
        }

        // 从 elementManager 获取元素
        const element = elementManager.GetElementByName(this.tabId, this.elementName);

        if (!element) {
            return { success: false, error: `Element "${this.elementName}" not found in element manager` };
        }

        // 获取元素的 nodeId 和 tag
        const nodeId = element.GetNodeId();
        const tag = element.GetTag();

        if (!nodeId) {
            return { success: false, error: `Element "${this.elementName}" has no nodeId. Make sure the element was found using FindElementInstruction first.` };
        }

        // 启用 DOM 域
        await this.ExecuteCDPCommand('DOM.enable');
        // 滚动到元素位置
        await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: nodeId });
        // 聚焦元素
        await this.ExecuteCDPCommand('DOM.focus', { nodeId: nodeId });

        return { success: true };
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
    private async executePress(): Promise<void> {
        const isSpecial = this.isSpecialKey(this.key);

        if (isSpecial) {
            // 特殊按键：keyDown → keyUp
            await this.dispatchKeyEvent('keyDown', this.key);
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('keyUp', this.key);
        } else {
            // 普通字符：keyDown → char → keyUp（完整事件序列）
            await this.dispatchKeyEvent('keyDown', this.key);
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('char', this.key, this.key);
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('keyUp', this.key);
        }
    }

    /**
     * 执行输入操作（type）
     * 逐个字符输入，每个字符使用 char 事件
     */
    private async executeType(): Promise<void> {
        for (const char of Array.from(this.key)) {
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('char', char, char);
        }
    }

    /**
     * 执行按键按下操作（keydown）
     */
    private async executeKeyDown(): Promise<void> {
        await this.dispatchKeyEvent('keyDown', this.key);
    }

    /**
     * 执行按键释放操作（keyup）
     */
    private async executeKeyUp(): Promise<void> {
        await this.dispatchKeyEvent('keyUp', this.key);
    }

    /**
     * 执行键盘操作指令
     * @returns 指令执行结果
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 准备元素（聚焦、滚动等）
            const prepareResult = await this.prepareElement();

            if (!prepareResult.success) {
                return { ...defaultResult, error: prepareResult.error };
            }

            // 根据操作类型执行相应的键盘操作
            switch (this.action) {
                case 'press':
                    await this.executePress();
                    break;
                case 'type':
                    await this.executeType();
                    break;
                case 'keydown':
                    await this.executeKeyDown();
                    break;
                case 'keyup':
                    await this.executeKeyUp();
                    break;
                default:
                    return { ...defaultResult, error: `Unknown keyboard action: ${this.action}` };
            }

            return { ...defaultResult, success: true, data: { key: this.key, action: this.action } };
        });

        return result;
    }
}

