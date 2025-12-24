import { ElementTag } from '../consts';
import { ElementClass, elementManager } from '../managers';
import { ElementData, FindElementByTextInstruction, InstructionResult } from '../types';
import { GenerateRandomString } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 通过文本内容查找元素指令
 */
export class FindElementByTextInstructionClass extends BaseInstructionClass {
    public params: {
        searchText: string;
        elementName: string;
        tagName?: string;
        description?: string;
        backup?: string;
    };

    constructor(instruction: FindElementByTextInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 执行通过文本内容查找元素指令
     * @returns 指令执行结果
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 启用必要的 CDP 域
            await this.ExecuteCDPCommand('DOM.enable');
            await this.ExecuteCDPCommand('Runtime.enable');

            // 转义搜索文本，防止注入攻击
            const escapedSearchText = this.params.searchText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

            // 使用 Runtime.evaluate 在页面上下文中搜索包含指定文本的元素
            // 返回元素对象引用以便后续获取 nodeId
            const escapedTagName = this.params.tagName ? this.params.tagName.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"') : null;
            const tagNameFilter = escapedTagName ? `'${escapedTagName.toUpperCase()}'` : 'null';
            const findElementExpression = `
                (function() {
                    const searchText = '${escapedSearchText}';
                    const tagName = ${tagNameFilter};
                    const allElements = tagName ? document.querySelectorAll(tagName.toLowerCase()) : document.querySelectorAll('*');
                    
                    for (let element of allElements) {
                        // 如果指定了标签名，检查元素标签是否匹配（tagName 是大写，如 'DIV', 'SPAN'）
                        if (tagName && element.tagName !== tagName) {
                            continue;
                        }
                        
                        const text = element.textContent || element.innerText || '';
                        if (text.includes(searchText)) {
                            // 检查元素是否可见
                            const style = window.getComputedStyle(element);
                            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                                return element;
                            }
                        }
                    }
                    return null;
                })()
            `;

            const findResult = await this.ExecuteCDPCommand('Runtime.evaluate', {
                expression: findElementExpression,
                returnByValue: false  // 返回对象引用，以便获取 nodeId
            });

            if (!findResult?.result?.objectId) {
                return { ...defaultResult, error: `Element with text "${this.params.searchText}" not found` };
            }

            // 将对象引用转换为 nodeId
            const requestNodeResult = await this.ExecuteCDPCommand('DOM.requestNode', {
                objectId: findResult.result.objectId
            });

            if (!requestNodeResult?.nodeId) {
                return { ...defaultResult, error: `Failed to get nodeId for element with text "${this.params.searchText}"` };
            }

            const matchedNodeId = requestNodeResult.nodeId;

            // 生成唯一的 tag（用于在 content script 中查找元素）
            const tag = GenerateRandomString(14);

            // 通过 CDP 设置元素的 tag 属性（参考 ElementManager.ts 的实现方式）
            await this.ExecuteCDPCommand('DOM.setAttributeValue', {
                nodeId: matchedNodeId,
                name: ElementTag,
                value: tag
            });

            // 创建 ElementData
            const elementData: ElementData = {
                tabId: this.tabId,
                name: this.params.elementName,
                description: this.params.description || `Element found by text: "${this.params.searchText}"`,
                backup: this.params.backup,
                selector: tag,
                selectorType: 'tag',
                nodeId: matchedNodeId,
                tag: tag
            };

            // 创建 ElementClass 实例
            const element = new ElementClass(elementData);

            // 保存到 elementManager
            elementManager.SetElementByName(this.tabId, this.params.elementName, element);

            return { ...defaultResult, success: true, data: element };
        });

        return result;
    }
}

