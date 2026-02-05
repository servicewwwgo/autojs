import { elementManager } from '../managers';
import type { KeyboardInstruction, KeyboardInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：模拟键盘按键操作，支持单字符按键和多字符文本输入，用于触发键盘事件、快捷键操作和文本输入
 *
 * 实现方式：继承自 BaseInstructionClass，使用 CDP 的 Input.dispatchKeyEvent 发送键盘事件，支持 keyDown、keyUp、char 三种事件类型
 *
 * 注意事项：
 * - action 参数指定操作类型（press 按下、type 输入、keydown 按下、keyup 释放）
 * - key 参数用于特殊按键（如 Enter、Tab、Escape 等），text 参数用于多字符输入
 * - elementName 参数为可选，如果指定则先聚焦到该元素再执行键盘操作
 * - 特殊按键（如 Enter、Tab）不需要 char 事件，普通字符需要完整的 keyDown → char → keyUp 序列
 * - 使用 Windows 虚拟键码映射表确保按键事件正确发送
 * - 支持逐字符输入（type 操作），每个字符使用 char 事件
 *
 * 相关代码：src/types/instruction.ts - KeyboardInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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
     * 业务逻辑：判断按键是否为特殊按键（不需要 char 事件的按键），用于确定按键事件的发送方式
     *
     * 实现方式：检查按键是否在 SPECIAL_KEYS 常量数组中
     *
     * 注意事项：特殊按键（如 Enter、Tab、Escape、方向键等）只需要 keyDown 和 keyUp 事件，不需要 char 事件
     *
     * 相关代码：SPECIAL_KEYS 常量（特殊按键列表），executePress() 方法（使用此方法判断按键类型）
     */
    private isSpecialKey(key: string): boolean {
        if (!key || key.length === 0) {
            return false;
        }
        return (KeyboardInstructionClass.SPECIAL_KEYS as readonly string[]).includes(key);
    }

    /**
     * 业务逻辑：获取按键的 Windows 虚拟键码，用于 CDP 的 Input.dispatchKeyEvent 事件，确保按键事件正确发送
     *
     * 实现方式：从 VIRTUAL_KEY_CODES 映射表中查找，如果未找到则使用字符的 ASCII 码
     *
     * 注意事项：特殊按键使用预定义的虚拟键码，普通字符使用字符的 ASCII 码（大写）
     *
     * 相关代码：VIRTUAL_KEY_CODES 常量（虚拟键码映射表），dispatchKeyEvent() 方法（使用此方法获取虚拟键码）
     */
    private getVirtualKeyCode(key: string): number {
        if (!key || key.length === 0) {
            throw new Error('Key cannot be empty');
        }
        return KeyboardInstructionClass.VIRTUAL_KEY_CODES[key] || key.toUpperCase().charCodeAt(0);
    }

    /**
     * 业务逻辑：获取按键的 code 名称（用于 CDP Input.dispatchKeyEvent），确保按键事件包含正确的 code 字段
     *
     * 实现方式：从 KEY_CODE_NAMES 映射表中查找，如果未找到则使用 "Key" + 大写字符的格式
     *
     * 注意事项：code 字段用于标识按键的物理位置，与 key 字段（逻辑按键）不同
     *
     * 相关代码：KEY_CODE_NAMES 常量（code 名称映射表），dispatchKeyEvent() 方法（使用此方法获取 code 名称）
     */
    private getKeyCodeName(key: string): string {
        if (!key || key.length === 0) {
            throw new Error('Key cannot be empty');
        }
        return KeyboardInstructionClass.KEY_CODE_NAMES[key] || `Key${key.toUpperCase()}`;
    }

    /**
     * 业务逻辑：发送键盘事件到页面，用于模拟用户按键操作，支持 keyDown、keyUp、char 三种事件类型
     *
     * 实现方式：使用 CDP 的 Input.dispatchKeyEvent 方法发送键盘事件，根据事件类型设置不同的参数
     *
     * 注意事项：
     * - char 事件只需要 text 参数，用于输入字符
     * - keyDown 和 keyUp 事件需要完整的按键信息（虚拟键码、code、key）
     * - 事件会正确触发页面的键盘事件处理器，包括 keydown、keypress、keyup 等
     *
     * 相关代码：src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令），executePress()、executeType() 等方法（调用此方法发送事件）
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
     * 业务逻辑：执行按键按下操作（press），模拟用户按下并释放按键，对于普通字符发送完整的事件序列，对于特殊按键只发送 keyDown 和 keyUp
     *
     * 实现方式：根据按键类型（特殊按键或普通字符）发送不同的事件序列，普通字符：keyDown → char → keyUp，特殊按键：keyDown → keyUp
     *
     * 注意事项：
     * - 特殊按键（如 Enter、Tab）不需要 char 事件，只需要 keyDown 和 keyUp
     * - 普通字符需要完整的事件序列（keyDown → char → keyUp）才能正确输入
     * - 事件之间会等待 delay 时间，确保事件顺序正确
     *
     * 相关代码：isSpecialKey() 方法（判断按键类型），dispatchKeyEvent() 方法（发送键盘事件）
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
     * 业务逻辑：执行输入操作（type），逐个字符输入文本，每个字符使用 char 事件，用于多字符文本输入
     *
     * 实现方式：遍历文本的每个字符，对每个字符发送 char 事件，字符之间等待 delay 时间
     *
     * 注意事项：
     * - 使用 Array.from 正确处理 Unicode 字符（包括代理对和 emoji）
     * - 每个字符之间会等待 delay 时间，实现慢速输入效果
     * - 只发送 char 事件，不发送 keyDown 和 keyUp 事件
     *
     * 相关代码：dispatchKeyEvent() 方法（发送键盘事件），Execute() 方法（调用此方法执行输入操作）
     */
    private async executeType(key: string): Promise<void> {
        for (const char of Array.from(key)) {
            await this.Delay(this.delay);
            await this.dispatchKeyEvent('char', char, char);
        }
    }

    /**
     * 业务逻辑：执行按键按下操作（keydown），只发送 keyDown 事件，不释放按键，用于组合键或长按场景
     *
     * 实现方式：调用 dispatchKeyEvent() 方法发送 keyDown 事件
     *
     * 注意事项：只发送 keyDown 事件，不发送 keyUp 事件，按键会保持按下状态，需要配合 keyup 操作使用
     *
     * 相关代码：dispatchKeyEvent() 方法（发送键盘事件），executeKeyUp() 方法（释放按键）
     */
    private async executeKeyDown(key: string): Promise<void> {
        await this.dispatchKeyEvent('keyDown', key);
    }

    /**
     * 业务逻辑：执行按键释放操作（keyup），只发送 keyUp 事件，释放之前按下的按键，用于组合键或长按场景
     *
     * 实现方式：调用 dispatchKeyEvent() 方法发送 keyUp 事件
     *
     * 注意事项：只发送 keyUp 事件，需要配合 keydown 操作使用，确保按键先按下再释放
     *
     * 相关代码：dispatchKeyEvent() 方法（发送键盘事件），executeKeyDown() 方法（按下按键）
     */
    private async executeKeyUp(key: string): Promise<void> {
        await this.dispatchKeyEvent('keyUp', key);
    }

    /**
     * 业务逻辑：执行键盘操作指令，根据 action 参数执行相应的键盘操作（press、type、keydown、keyup），支持单字符和多字符操作
     *
     * 实现方式：如果指定了 elementName，先聚焦到该元素，然后根据 action 和 key/text 参数执行相应的键盘操作
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 如果指定了 elementName，会先滚动到元素位置并聚焦，确保键盘事件正确发送到目标元素
     * - key 和 text 参数至少需要提供一个，key 用于特殊按键，text 用于多字符输入
     * - 根据 action 参数调用不同的执行方法（executePress、executeType、executeKeyDown、executeKeyUp）
     * - 如果 action 未知，会返回错误
     * - 返回结果包含操作类型和按键/文本信息，用于确认操作成功
     *
     * 相关代码：src/types/instruction.ts - KeyboardInstructionResult 接口（结果数据结构），executePress()、executeType() 等方法（执行具体操作），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
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

