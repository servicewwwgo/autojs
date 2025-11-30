import type { KeyboardInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { ElementManager } from '../managers';
/**
 * 键盘操作指令
 */
export class KeyboardInstructionClass extends BaseInstructionClass {
    public elementName?: string;
    public action: 'press' | 'type' | 'keydown' | 'keyup';
    public key: string;

    constructor(instruction: KeyboardInstruction, elementManager: ElementManager) {
        super(instruction, elementManager);

        this.elementName = instruction.elementName;
        this.action = instruction.action;
        this.key = instruction.key;
    }

    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            try {
                if (this.elementName) {
                    // 从 elementManager 获取元素
                    const element = this._elementManager.GetElementByName(this.tabId, this.elementName);

                    if (!element) {
                        return {
                            instructionID: this.instructionID,
                            success: false,
                            error: `Element "${this.elementName}" not found in element manager`,
                            duration: 0,
                            data: null
                        } as InstructionResult;
                    }

                    // 获取元素的 nodeId 和 tag
                    const nodeId = element.GetNodeId();
                    const tag = element.GetTag();

                    if (!nodeId) {
                        return {
                            instructionID: this.instructionID,
                            success: false,
                            error: `Element "${this.elementName}" has no nodeId. Make sure the element was found using FindElementInstruction first.`,
                            duration: 0,
                            data: null
                        } as InstructionResult;
                    }

                    // 如果元素有 tag，使用 scroll_into_view 滚动到元素位置
                    if (tag) {
                        try {
                            const scrollResponse: any = await this.SendMessageToContentScript({
                                type: 'scroll_into_view',
                                params: {
                                    tag: tag
                                }
                            });

                            if (!scrollResponse || !scrollResponse.success) {
                                console.warn(`Failed to scroll to element "${this.elementName}":`, scrollResponse?.error);
                            }
                        } catch (error) {
                            console.warn(`Error scrolling to element "${this.elementName}":`, error);
                            // 继续执行，即使滚动失败
                        }
                    }

                    // 聚焦元素
                    await this.ExecuteCDPCommand('DOM.focus', { nodeId: nodeId });
                }

                // 执行键盘操作
                switch (this.action) {
                    case 'press':
                        // 按下按键
                        await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                            type: 'keyDown',
                            windowsVirtualKeyCode: this.getKeyCode(this.key),
                            code: this.key,
                            key: this.key
                        });
                        // 按键间延迟
                        await this.Delay(this.delay);
                        // 释放按键
                        await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                            type: 'keyUp',
                            windowsVirtualKeyCode: this.getKeyCode(this.key),
                            code: this.key,
                            key: this.key
                        });
                        break;

                    case 'type':
                        for (const char of Array.from(this.key)) {
                            // 按键间延迟
                            await this.Delay(this.delay);

                            // 输入字符
                            await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                                type: 'char',
                                text: char
                            });
                        }
                        break;

                    case 'keydown':
                        await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                            type: 'keyDown',
                            windowsVirtualKeyCode: this.getKeyCode(this.key),
                            code: this.key,
                            key: this.key
                        });
                        break;

                    case 'keyup':
                        await this.ExecuteCDPCommand('Input.dispatchKeyEvent', {
                            type: 'keyUp',
                            windowsVirtualKeyCode: this.getKeyCode(this.key),
                            code: this.key,
                            key: this.key
                        });
                        break;
                }

                return {
                    instructionID: this.instructionID,
                    success: true,
                    duration: 0,
                    data: { key: this.key, action: this.action }
                } as InstructionResult;
            } catch (error) {
                return {
                    instructionID: this.instructionID,
                    success: false,
                    error: (error as Error).message || 'Unknown error',
                    duration: 0,
                    data: null
                } as InstructionResult;
            }
        });

        return result;
    }

    /**
     * 获取按键的 Windows 虚拟键码
     * @param key - 按键名称或字符
     * @returns Windows 虚拟键码（Virtual Key Code）
     * @remarks
     * 对于特殊按键（如 Enter、Escape 等），返回预定义的虚拟键码
     * 对于普通字符，返回字符的 ASCII 码
     */
    private getKeyCode(key: string): number {
        // 特殊按键的 Windows 虚拟键码映射表
        const keyMap: Record<string, number> = {
            Enter: 13,      // VK_RETURN
            Escape: 27,    // VK_ESCAPE
            Tab: 9,        // VK_TAB
            Backspace: 8,  // VK_BACK
            Delete: 46,    // VK_DELETE
            ArrowUp: 38,   // VK_UP
            ArrowDown: 40, // VK_DOWN
            ArrowLeft: 37, // VK_LEFT
            ArrowRight: 39 // VK_RIGHT
        };
        // 如果是特殊按键，返回映射值；否则返回字符的 ASCII 码
        return keyMap[key] || key.charCodeAt(0);
    }

    ToObject(): object {
        return {
            ...super.ToObject(),
            elementName: this.elementName,
            action: this.action,
            key: this.key
        } as object;
    }
}

