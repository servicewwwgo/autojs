import { ElementTag } from '../consts';
import type { ElementData } from '../types';
import { ExecuteCDPCommand, GenerateRandomString, LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：定义元素对象的接口规范，用于统一管理页面元素的定位、验证和属性访问，支持多种选择器类型和相对关系定位
 *
 * 实现方式：使用 TypeScript 接口定义元素对象必须实现的方法，包括验证、转换、属性获取和定位等功能
 *
 * 注意事项：
 * - 所有元素类必须实现此接口
 * - 元素数据存储在 elementData 字段中
 * - LocateElement() 方法用于在页面上定位元素，是核心功能
 *
 * 相关代码：src/managers/ElementManager.ts - ElementClass 类（实现此接口），src/types/instruction.ts - ElementData 接口（元素数据结构）
 */
export interface IElement {
    // 元素数据
    elementData: ElementData;

    // 验证方法
    Validate(): boolean;

    // 转换为对象
    ToObject(): object;

    // 获取节点ID
    GetNodeId(): Promise<number | undefined>;

    // 获取元素tag
    GetTag(): string | undefined;

    // 获取元素名称
    GetName(): string | undefined;

    // 获取元素描述
    GetDescription(): string | undefined;

    // 获取元素備注
    GetBackup(): string | undefined;

    // 获取元素选择器
    GetSelector(): string | undefined;

    // 获取元素选择器类型
    GetSelectorType(): 'css' | 'id' | 'tag' | 'text' | 'ledby';

    // 获取元素父元素名称
    GetParentName(): string | undefined;

    // 获取元素子元素名称
    GetChildrenName(): string | undefined;

    // 获取元素兄弟元素名称
    GetSiblingName(): string | undefined;

    // 获取元素兄弟元素偏移量
    GetSiblingOffset(): number | undefined;

    // 定位元素
    LocateElement(): Promise<boolean>;
}

/**
 * 业务逻辑：实现页面元素的定位和管理功能，支持 CSS、ID、Tag、Text 四种选择器类型，支持父元素、子元素、兄弟元素等相对关系定位，确保元素定位的准确性和可见性
 *
 * 实现方式：使用 Chrome DevTools Protocol (CDP) 在页面上查找和定位元素，通过 DOM.querySelectorAll、Runtime.evaluate 等方法查找匹配元素，使用 CSS.getComputedStyleForNode 和 DOM.getBoxModel 检查元素可见性，为定位的元素生成唯一 tag 并设置到 DOM 属性中
 *
 * 注意事项：
 * - 元素定位会考虑可见性，优先选择可见的元素
 * - 支持通过 parentName、childrenName、siblingName 等字段进行相对关系定位
 * - 定位成功后会生成唯一的 tag 并保存到 elementManager，便于后续快速查找
 * - 文本选择器会转义特殊字符，防止注入攻击
 * - 可见性检查包括 display、visibility、opacity、尺寸和位置等多个维度
 *
 * 相关代码：src/managers/ElementManager.ts - ElementManager 类（管理元素实例），src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（使用此元素类），src/utils/index.ts - ExecuteCDPCommand() 函数（执行 CDP 命令）
 */
export class ElementClass implements IElement {
    public elementData: ElementData;

    constructor(data: ElementData) {
        this.elementData = data;
    }

    /**
     * 业务逻辑：根据选择器类型和选择器查找页面上所有匹配的元素，返回元素的 nodeId 列表，用于后续筛选和定位
     *
     * 实现方式：
     * - CSS/ID/Tag 类型：使用 DOM.querySelectorAll CDP 命令查找元素
     * - Text 类型：使用 Runtime.evaluate 在页面上下文中执行 JavaScript 代码查找包含指定文本的元素，然后通过 Runtime.getProperties 和 DOM.requestNode 获取 nodeId
     * - Ledby 类型：使用 Runtime.evaluate 查找所有包含 aria-labelledby 属性的元素，然后通过 aria-labelledby 的值找到对应的 label 元素，检查 label 元素的文本内容是否包含指定文本
     * - 所有类型都会先获取文档根节点，然后执行相应的查询操作
     *
     * 注意事项：
     * - CSS 和 ID 类型直接使用 querySelectorAll，ID 类型会自动添加 # 前缀
     * - Tag 类型使用 ElementTag 属性选择器，需要转义特殊字符
     * - Text 类型需要转义搜索文本和选择器，防止注入攻击
     * - Text 类型会检查元素可见性（display、visibility、opacity），只返回可见元素
     * - Ledby 类型需要转义搜索文本，防止注入攻击，会检查 label 元素的文本内容是否包含指定文本
     * - 所有查询失败时返回空数组，不会抛出异常
     * - Text 和 Ledby 类型查找后需要释放对象引用，避免内存泄漏
     *
     * @param selectorType - 选择器类型（'css' | 'id' | 'tag' | 'text' | 'ledby'）
     * @param selector - 选择器字符串
     * @param text - 文本内容（用于 text 和 ledby 类型选择器）
     * @returns 元素 nodeId 列表（Promise）
     *
     * 相关代码：src/managers/ElementManager.ts - LocateElement() 方法（调用此方法查找候选元素），src/utils/index.ts - ExecuteCDPCommand() 函数（执行 CDP 命令）
     */
    private async FindAllMatchingElementNodeIds(selectorType: string, selector: string, text: string): Promise<number[]> {
        try {
            // 获取文档根节点
            const documentResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.getDocument', {
                depth: -1,
                pierce: false
            });

            if (!documentResult?.root?.nodeId) {
                OutputLogToFile(`[ElementManager] Failed to get document root node for "${this.elementData.name}"`, { level: LogLevel.ERROR });
                return [];
            }

            const rootNodeId = documentResult.root.nodeId;

            // 使用 querySelectorAll 查找所有匹配的元素
            let candidateNodeIds: number[] = [];

            switch (selectorType) {
                case 'css':
                    try {
                        const queryResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.querySelectorAll', {
                            nodeId: rootNodeId,
                            selector: selector
                        });
                        candidateNodeIds = queryResult?.nodeIds || [];
                    } catch (error) {
                        OutputLogToFile(`[ElementManager] CDP querySelectorAll failed for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                case 'id':
                    try {
                        const queryResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.querySelectorAll', {
                            nodeId: rootNodeId,
                            selector: `#${selector}`
                        });
                        candidateNodeIds = queryResult?.nodeIds || [];
                    } catch (error) {
                        OutputLogToFile(`[ElementManager] CDP querySelectorAll (id) failed for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                case 'tag':
                    try {
                        // tag 类型使用 ElementTag 属性查找元素
                        const escapedTag = selector.replace(/"/g, '\\"');
                        const queryResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.querySelectorAll', {
                            nodeId: rootNodeId,
                            selector: `[${ElementTag}="${escapedTag}"]`
                        });
                        candidateNodeIds = queryResult?.nodeIds || [];
                    } catch (error) {
                        OutputLogToFile(`[ElementManager] CDP querySelectorAll (tag) failed for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                case 'text':
                    // 通过文本内容查找所有匹配的元素, 并返回元素nodeId列表
                    try {
                        // 检查 text 是否存在
                        if (!text) {
                            OutputLogToFile(`[ElementManager] Text parameter is required for text selector type for "${this.elementData.name}"`, { level: LogLevel.ERROR });
                            candidateNodeIds = [];
                            break;
                        }

                        // 转义搜索文本，防止注入攻击
                        const escapedSearchText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

                        // 转义 selector，防止注入攻击，并用引号包裹
                        const escapedSelector = JSON.stringify(selector);

                        // 使用 Runtime.evaluate 在页面上下文中搜索包含指定文本的所有元素
                        // 返回元素数组引用以便后续获取所有 nodeId
                        const findElementsExpression = `
                            (function() {
                                const searchText = '${escapedSearchText}';
                                const searchSelector = ${escapedSelector};
                                const allElements = document.querySelectorAll(searchSelector);
                                const matchedElements = [];
                                
                                for (let element of allElements) {                        
                                    const text = element.textContent || element.innerText || '';
                                    if (text.includes(searchText)) {
                                        // 检查元素是否可见
                                        const style = window.getComputedStyle(element);
                                        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                                            matchedElements.push(element);
                                        }
                                    }
                                }
                                return matchedElements;
                            })()
                        `;

                        const findResult = await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.evaluate', {
                            expression: findElementsExpression,
                            returnByValue: false  // 返回对象引用，以便获取 nodeId
                        });

                        if (!findResult?.result?.objectId) {
                            OutputLogToFile(`[ElementManager] No elements found with text "${text}" and selector "${selector}" for "${this.elementData.name}"`, { level: LogLevel.WARN });
                            candidateNodeIds = [];
                            break;
                        }

                        // 获取数组的所有属性（包括索引属性）
                        const objectId = findResult.result.objectId;
                        const propertiesResult = await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.getProperties', {
                            objectId: objectId,
                            ownProperties: true
                        });

                        candidateNodeIds = [];

                        if (propertiesResult?.result) {
                            // 遍历所有属性，获取每个节点的 nodeId
                            for (const property of propertiesResult.result) {
                                // 只处理数字索引（数组元素）
                                if (property.name && /^\d+$/.test(property.name) && property.value?.objectId) {
                                    try {
                                        const nodeIdResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.requestNode', {
                                            objectId: property.value.objectId
                                        });
                                        if (nodeIdResult?.nodeId) {
                                            candidateNodeIds.push(nodeIdResult.nodeId);
                                        }
                                    } catch (nodeIdError) {
                                        OutputLogToFile(`[ElementManager] Failed to get nodeId for text search result at index ${property.name}: ${nodeIdError instanceof Error ? nodeIdError.message : String(nodeIdError)}`, { level: LogLevel.WARN });
                                    }
                                }
                            }
                        }

                        // 释放数组对象引用
                        try {
                            await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.releaseObject', {
                                objectId: objectId
                            });
                        } catch (releaseError) {
                            OutputLogToFile(`[ElementManager] Failed to release object for text search "${this.elementData.name}": ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`, { level: LogLevel.WARN });
                        }
                    } catch (error) {
                        OutputLogToFile(`[ElementManager] Text search failed for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                case 'ledby':
                    // 通过 aria-labelledby 属性查找元素
                    try {
                        // 检查 text 是否存在
                        if (!text) {
                            OutputLogToFile(`[ElementManager] Text parameter is required for ledby selector type for "${this.elementData.name}"`, { level: LogLevel.ERROR });
                            candidateNodeIds = [];
                            break;
                        }

                        // 转义搜索文本，防止注入攻击
                        const escapedSearchText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');

                        // 转义 selector，防止注入攻击，并用引号包裹
                        const escapedSelector = JSON.stringify(selector);

                        // 使用 Runtime.evaluate 在页面上下文中查找所有包含 aria-labelledby 属性的元素
                        // 然后通过 aria-labelledby 的值找到对应的 label 元素，检查 label 元素的文本内容是否包含指定文本
                        const findElementsExpression = `
                            (function() {
                                const searchText = '${escapedSearchText}';
                                const searchSelector = ${escapedSelector};
                                const allElements = document.querySelectorAll(searchSelector);
                                const matchedElements = [];
                                
                                for (let element of allElements) {
                                    // 检查元素是否有 aria-labelledby 属性
                                    const ariaLabelledBy = element.getAttribute('aria-labelledby');
                                    if (ariaLabelledBy) {
                                        // 通过 id 找到对应的 label 元素
                                        const labelElement = document.getElementById(ariaLabelledBy);
                                        if (labelElement) {
                                            // 获取 label 元素的文本内容
                                            const labelText = labelElement.textContent || labelElement.innerText || '';
                                            // 检查 label 元素的文本内容是否包含指定文本
                                            if (labelText.includes(searchText)) {
                                                // 检查元素是否可见
                                                const style = window.getComputedStyle(element);
                                                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                                                    matchedElements.push(element);
                                                }
                                            }
                                        }
                                    }
                                }
                                return matchedElements;
                            })()
                        `;

                        const findResult = await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.evaluate', {
                            expression: findElementsExpression,
                            returnByValue: false  // 返回对象引用，以便获取 nodeId
                        });

                        if (!findResult?.result?.objectId) {
                            OutputLogToFile(`[ElementManager] No elements found with ledby selector "${selector}" and text "${text}" for "${this.elementData.name}"`, { level: LogLevel.WARN });
                            candidateNodeIds = [];
                            break;
                        }

                        // 获取数组的所有属性（包括索引属性）
                        const objectId = findResult.result.objectId;
                        const propertiesResult = await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.getProperties', {
                            objectId: objectId,
                            ownProperties: true
                        });

                        candidateNodeIds = [];

                        if (propertiesResult?.result) {
                            // 遍历所有属性，获取每个节点的 nodeId
                            for (const property of propertiesResult.result) {
                                // 只处理数字索引（数组元素）
                                if (property.name && /^\d+$/.test(property.name) && property.value?.objectId) {
                                    try {
                                        const nodeIdResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.requestNode', {
                                            objectId: property.value.objectId
                                        });
                                        if (nodeIdResult?.nodeId) {
                                            candidateNodeIds.push(nodeIdResult.nodeId);
                                        }
                                    } catch (nodeIdError) {
                                        OutputLogToFile(`[ElementManager] Failed to get nodeId for ledby search result at index ${property.name}: ${nodeIdError instanceof Error ? nodeIdError.message : String(nodeIdError)}`, { level: LogLevel.WARN });
                                    }
                                }
                            }
                        }

                        // 释放数组对象引用
                        try {
                            await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.releaseObject', {
                                objectId: objectId
                            });
                        } catch (releaseError) {
                            OutputLogToFile(`[ElementManager] Failed to release object for ledby search "${this.elementData.name}": ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`, { level: LogLevel.WARN });
                        }
                    } catch (error) {
                        OutputLogToFile(`[ElementManager] Ledby search failed for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                default:
                    throw new Error(`Unsupported selector type: ${selectorType}`);
            }

            return candidateNodeIds;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error finding all matching elements for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return [];
        }
    }

    /**
     * 业务逻辑：检查节点是否在页面上可见，用于在多个候选元素中选择可见的元素进行定位，确保用户可以看到和交互的元素
     *
     * 实现方式：分两个阶段检查：
     * 1. CSS 样式检查：使用 CSS.getComputedStyleForNode 检查 display、visibility、opacity 属性
     * 2. 尺寸检查：使用 DOM.getBoxModel 检查元素的宽度和高度
     * 如果 CSS 检查通过且尺寸有效，则认为元素可见
     *
     * 注意事项：
     * - 明确不可见的指标（任何一项满足即返回 false）：
     *   - CSS display === 'none'：元素不占据空间，完全不可见
     *   - CSS visibility === 'hidden' 或 'collapse'：元素不可见但占据空间
     *   - CSS opacity <= 0：元素完全透明
     *   - 元素尺寸为 0（width <= 0 或 height <= 0）：元素没有可见区域
     * - 明确可见的指标（所有检查都通过才返回 true）：
     *   - CSS display !== 'none'
     *   - CSS visibility !== 'hidden' 且 !== 'collapse'
     *   - CSS opacity > 0
     *   - 元素有有效尺寸（width > 0 且 height > 0）
     * - 如果检查失败（CDP 命令出错），返回 undefined 表示无法确定
     * - BoxModel 给出的是文档坐标，不是视口坐标，这里只检查尺寸
     *
     * @param nodeId - 节点ID
     * @returns 是否可见（true/false），如果检查失败则返回 undefined
     *
     * 相关代码：src/managers/ElementManager.ts - LocateElement() 方法（调用此方法筛选可见元素），src/utils/index.ts - ExecuteCDPCommand() 函数（执行 CDP 命令）
     */
    private async checkNodeIsVisible(nodeId: number): Promise<boolean | undefined> {
        try {
            // ========== 階段1: 檢查 CSS 樣式（最快速，最明確的不可見指標）==========
            let cssCheckPassed = false;

            try {
                const computedStyle = await ExecuteCDPCommand(this.elementData.tabId, 'CSS.getComputedStyleForNode', {
                    nodeId: nodeId
                });

                if (computedStyle?.computedStyle) {
                    const styles = computedStyle.computedStyle;

                    // 查找關鍵樣式屬性
                    const getStyleValue = (propertyName: string): string | undefined => {
                        const style = styles.find((s: any) => s.name === propertyName);
                        return style?.value;
                    };

                    const display = getStyleValue('display');
                    const visibility = getStyleValue('visibility');
                    const opacity = getStyleValue('opacity');

                    // 【明確不可見指標 1】檢查 display
                    if (display === 'none') {
                        return false; // 明確不可見
                    }

                    // 【明確不可見指標 2】檢查 visibility
                    if (visibility === 'hidden' || visibility === 'collapse') {
                        return false; // 明確不可見
                    }

                    // 【明確不可見指標 3】檢查 opacity
                    if (opacity) {
                        const opacityValue = parseFloat(opacity);
                        if (!isNaN(opacityValue) && opacityValue <= 0) {
                            return false; // 明確不可見
                        }
                    }

                    // CSS 檢查通過
                    cssCheckPassed = true;
                }
            } catch (cssError) {
                // CSS 檢查失敗，繼續使用其他方法
            }

            // ========== 階段2: 檢查元素尺寸和位置（通過 BoxModel）==========
            let boxModelCheckPassed = false;
            let hasValidSize = false;

            try {
                const boxModel = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.getBoxModel', {
                    nodeId: nodeId
                });

                if (boxModel?.model?.content && boxModel.model.content.length >= 8) {
                    // content 數組格式: [x1, y1, x2, y2, x3, y3, x4, y4]
                    const left = Math.min(boxModel.model.content[0], boxModel.model.content[2], boxModel.model.content[4], boxModel.model.content[6]);
                    const top = Math.min(boxModel.model.content[1], boxModel.model.content[3], boxModel.model.content[5], boxModel.model.content[7]);
                    const right = Math.max(boxModel.model.content[0], boxModel.model.content[2], boxModel.model.content[4], boxModel.model.content[6]);
                    const bottom = Math.max(boxModel.model.content[1], boxModel.model.content[3], boxModel.model.content[5], boxModel.model.content[7]);

                    const width = right - left;
                    const height = bottom - top;

                    // 【明確不可見指標 5】檢查元素尺寸
                    if (width <= 0 || height <= 0) {
                        return false; // 明確不可見：沒有有效尺寸
                    }
                    hasValidSize = true;

                    // 檢查是否在視口內（需要獲取視口尺寸，這裡先標記，後續在 Runtime 中檢查）
                    // 注意：BoxModel 給出的是文檔坐標，不是視口坐標，所以這裡只檢查尺寸
                    boxModelCheckPassed = true;
                } else {
                    // 無法獲取 box model，可能元素不存在或不可見
                    return false; // 明確不可見：無法獲取邊界框
                }
            } catch (boxModelError) {
                // BoxModel 檢查失敗，繼續使用 Runtime 方法
            }

            // ========== 綜合判斷 ==========
            // 如果 CSS 檢查通過，且 BoxModel 檢查通過，認為元素可見
            if (cssCheckPassed && boxModelCheckPassed && hasValidSize) {
                return true;
            }

            // 如果所有方法都無法確定，返回 undefined
            return undefined;

        } catch (error) {
            return undefined;
        }
    }

    /**
     * 业务逻辑：在页面上定位元素，根据选择器类型和相对关系找到匹配的元素，为元素生成唯一 tag 并保存到管理器，用于后续指令执行时快速查找元素
     *
     * 实现方式：
     * 1. 如果元素已定位过（有 nodeId 和 tag），先验证元素是否仍然存在
     * 2. 根据 parentName 和 childrenName 优化选择器（使用 :has() 和属性选择器）
     * 3. 调用 FindAllMatchingElementNodeIds() 查找所有候选元素
     * 4. 如果有多个候选元素，使用 checkNodeIsVisible() 选择可见的元素
     * 5. 为选中的元素生成唯一 tag，通过 CDP 设置到 DOM 属性中
     * 6. 保存元素到 elementManager，便于后续快速查找
     *
     * 注意事项：
     * - 如果元素已定位，会先验证元素是否仍然存在，避免使用过期的 nodeId
     * - 支持通过 parentName 和 childrenName 优化选择器，提高定位准确性
     * - 多个候选元素时优先选择可见的元素，确保用户可以看到和交互
     * - 定位成功后会生成 14 位随机字符串作为 tag，设置到 ElementTag 属性中
     * - tag 用于在 content script 中快速查找元素，避免重复定位
     * - 定位失败时返回 false，不会抛出异常
     *
     * @returns 是否成功定位元素（Promise）
     *
     * 相关代码：src/managers/ElementManager.ts - FindAllMatchingElementNodeIds() 方法（查找候选元素），src/managers/ElementManager.ts - checkNodeIsVisible() 方法（检查可见性），src/consts/index.ts - ElementTag 常量（tag 属性名），src/utils/index.ts - GenerateRandomString() 函数（生成 tag）
     */
    public async LocateElement(): Promise<boolean> {
        // 如果元素已经定位过（有 nodeId 和 tag），先验证元素是否仍然存在且有效
        if (this.elementData.nodeId && this.elementData.tag) {
            // 直接使用tag选择器重新定位元素, 并设置 nodeId
            const newNodeId = await this.GetNodeId();

            if (newNodeId) {
                this.elementData.nodeId = newNodeId;
                return true;
            }
        }

        let selectorType: string = this.elementData.selectorType;
        let selector: string = this.elementData.selector;
        let text: string = this.elementData.text || '';

        // 如果有 childrenName 且 selectorType 是 'css'，尝试使用 :has() 优化选择器
        if (this.elementData.childrenName && this.elementData.selectorType === 'css') {
            const childrenElement = elementManager.GetElementByName(this.elementData.tabId, this.elementData.childrenName);

            if (!childrenElement) {
                OutputLogToFile(`[ElementManager] Children element "${this.elementData.childrenName}" not found in manager, falling back to original method`, { level: LogLevel.WARN });
                return false;
            }

            const childElementTag = childrenElement.GetTag();
            selector = `${selector}:has([${ElementTag}="${childElementTag}"])`;
        }

        // 如果有 parentName 且 selectorType 是 'css'
        if (this.elementData.parentName && this.elementData.selectorType === 'css') {
            const parentElement = elementManager.GetElementByName(this.elementData.tabId, this.elementData.parentName);
            if (!parentElement) {
                OutputLogToFile(`[ElementManager] Parent element "${this.elementData.parentName}" not found in manager, falling back to original method`, { level: LogLevel.WARN });
                return false;
            }
            const parentElementTag = parentElement.GetTag();
            selector = `[${ElementTag}="${parentElementTag}"] ${selector}`;
        }

        // 查找所有匹配的元素
        const candidateNodeIds = await this.FindAllMatchingElementNodeIds(selectorType, selector, text);

        // 如果没有找到任何候选元素
        if (candidateNodeIds.length === 0) {
            OutputLogToFile(`[ElementManager] No candidate elements found for element "${this.elementData.name}" with selector: ${selector}`, { level: LogLevel.WARN });
            return false;
        }

        // 使用相对关系筛选候选元素
        let selectedNodeId: number | undefined = undefined;

        // 如果有多個候選元素，選取可見的元素, 如果只有一個候選元素，則直接選取
        if (candidateNodeIds.length > 1) {
            for (const nodeId of candidateNodeIds) {
                const isVisible = await this.checkNodeIsVisible(nodeId);
                if (isVisible === true) {
                    selectedNodeId = nodeId;
                    break;
                }
            }
        }
        else if (candidateNodeIds.length === 1) {
            selectedNodeId = candidateNodeIds[0];
        }

        if (selectedNodeId === undefined || selectedNodeId === 0) {
            OutputLogToFile(`[ElementManager] No valid element found for element "${this.elementData.name}" with selector: ${selector}`, { level: LogLevel.ERROR });
            return false;
        }

        // 生成唯一的 tag（用于在 content script 中查找元素）
        const tag = GenerateRandomString(14);

        // 通过 CDP 设置元素的 tag 属性
        await ExecuteCDPCommand(this.elementData.tabId, 'DOM.setAttributeValue', {
            nodeId: selectedNodeId,
            name: ElementTag,
            value: tag
        });

        this.elementData.nodeId = selectedNodeId;
        this.elementData.tag = tag;

        // 保存到 elementManager
        elementManager.SetElementByName(this.elementData.tabId, this.elementData.name, this);

        // 成功定位元素
        return true;
    }

    /**
     * 业务逻辑：验证元素数据的完整性和有效性，确保元素对象包含必要的字段且已成功定位，用于在执行指令前检查元素是否可用
     *
     * 实现方式：依次检查必需字段（name、selector、selectorType、tabId）是否存在，验证 selectorType 是否为支持的类型，最后检查 nodeId 是否存在（表示元素已定位）
     *
     * 注意事项：
     * - name、selector、selectorType、tabId 为必需字段，缺失任一字段返回 false
     * - selectorType 必须是 'css'、'xpath'、'id'、'tag'、'text'、'ledby' 之一
     * - nodeId 必须存在，表示元素已成功定位，否则返回 false 并记录错误日志
     * - 验证失败时会记录详细的错误日志，便于问题排查
     *
     * @returns 验证是否通过（true/false）
     *
     * 相关代码：src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（执行前验证元素）
     */
    public Validate(): boolean {

        // 校驗
        if (!this.elementData.name) {
            return false;
        }

        if (!this.elementData.selector) {
            return false;
        }

        if (!this.elementData.selectorType) {
            return false;
        }

        if (!this.elementData.tabId) {
            return false;
        }

        if (!['css', 'xpath', 'id', 'tag', 'text', 'ledby'].includes(this.elementData.selectorType)) {
            return false;
        }

        // 检查是否找到元素（通过 nodeId）
        if (!this.elementData.nodeId) {
            OutputLogToFile(`[ElementManager] Element "${this.elementData.name}" not found with nodeId: ${this.elementData.nodeId}`, { level: LogLevel.ERROR });
            return false;
        }

        return true;
    }

    /**
     * 业务逻辑：将元素对象转换为普通对象，用于序列化和数据传递
     *
     * 实现方式：直接返回 elementData 对象
     *
     * 注意事项：返回的是对象引用，修改会影响内部状态
     *
     * @returns 元素数据对象
     */
    public ToObject(): object {
        return this.elementData;
    }

    /**
     * 业务逻辑：实时获取元素的 nodeId，通过 tag 选择器在页面上查找元素，用于验证元素是否仍然存在或获取最新的 nodeId
     *
     * 实现方式：使用 DOM.querySelector CDP 命令，通过 ElementTag 属性选择器查找元素，返回元素的 nodeId
     *
     * 注意事项：
     * - 需要元素已定位并设置了 tag，否则返回 undefined
     * - tag 值会转义特殊字符，防止注入攻击
     * - 如果元素不存在（页面已更新或元素已删除），返回 undefined
     * - 此方法用于验证元素是否仍然存在，避免使用过期的 nodeId
     *
     * @returns 元素的 nodeId，如果元素不存在或没有 tag 则返回 undefined（Promise）
     *
     * 相关代码：src/managers/ElementManager.ts - LocateElement() 方法（定位时设置 tag），src/consts/index.ts - ElementTag 常量（tag 属性名）
     */
    public async GetNodeId(): Promise<number | undefined> {
        // 实时获取 nodeId, 通过 tag 选择器查找元素, 并得到 nodeId
        try {
            // 检查是否有 tag
            if (!this.elementData.tag) {
                OutputLogToFile(`[ElementManager] Element "${this.elementData.name}" has no tag, cannot get nodeId`, { level: LogLevel.WARN });
                return undefined;
            }

            // 获取文档根节点
            const documentResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.getDocument', {
                depth: -1,
                pierce: false
            });

            if (!documentResult?.root?.nodeId) {
                OutputLogToFile(`[ElementManager] Failed to get document root node for element "${this.elementData.name}"`, { level: LogLevel.ERROR });
                return undefined;
            }

            const rootNodeId = documentResult.root.nodeId;

            // 转义 tag 值，防止注入攻击
            const escapedTag = this.elementData.tag.replace(/"/g, '\\"');

            // 使用 tag 选择器查找元素
            const queryResult = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.querySelector', {
                nodeId: rootNodeId,
                selector: `[${ElementTag}="${escapedTag}"]`
            });

            return queryResult?.nodeId;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error getting nodeId for element "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return undefined;
        }
    }

    /**
     * 业务逻辑：获取元素的备注信息，用于存储额外的描述或说明
     *
     * 实现方式：直接返回 elementData.backup 字段
     *
     * @returns 备注信息，如果不存在则返回 undefined
     */
    public GetBackup(): string | undefined {
        return this.elementData.backup;
    }

    /**
     * 业务逻辑：获取元素的唯一 tag，用于在页面上快速查找元素
     *
     * 实现方式：直接返回 elementData.tag 字段
     *
     * 注意事项：tag 在元素定位时自动生成，用于 CDP 命令中查找元素
     *
     * @returns tag 字符串，如果元素未定位则返回 undefined
     */
    public GetTag(): string | undefined {
        return this.elementData.tag;
    }

    /**
     * 业务逻辑：获取元素的名称，用于标识和查找元素
     *
     * 实现方式：直接返回 elementData.name 字段
     *
     * @returns 元素名称，如果不存在则返回 undefined
     */
    public GetName(): string | undefined {
        return this.elementData.name;
    }

    /**
     * 业务逻辑：获取元素的描述信息，用于显示和说明元素的用途
     *
     * 实现方式：直接返回 elementData.description 字段
     *
     * @returns 描述信息，如果不存在则返回 undefined
     */
    public GetDescription(): string | undefined {
        return this.elementData.description;
    }

    /**
     * 业务逻辑：获取元素的文本内容，用于文本类型选择器
     *
     * 实现方式：直接返回 elementData.text 字段
     *
     * @returns 文本内容，如果不存在则返回 undefined
     */
    public GetText(): string | undefined {
        return this.elementData.text;
    }

    /**
     * 业务逻辑：获取元素的选择器字符串，用于定位元素
     *
     * 实现方式：直接返回 elementData.selector 字段
     *
     * @returns 选择器字符串，如果不存在则返回 undefined
     */
    public GetSelector(): string | undefined {
        return this.elementData.selector;
    }

    /**
     * 业务逻辑：获取元素的选择器类型，用于确定使用哪种定位方式
     *
     * 实现方式：直接返回 elementData.selectorType 字段
     *
     * @returns 选择器类型（'css' | 'id' | 'tag' | 'text' | 'ledby'）
     */
    public GetSelectorType(): 'css' | 'id' | 'tag' | 'text' | 'ledby' {
        return this.elementData.selectorType;
    }

    /**
     * 业务逻辑：获取元素的父元素名称，用于相对关系定位
     *
     * 实现方式：直接返回 elementData.parentName 字段
     *
     * 注意事项：父元素名称用于优化选择器，提高定位准确性
     *
     * @returns 父元素名称，如果不存在则返回 undefined
     */
    public GetParentName(): string | undefined {
        return this.elementData.parentName;
    }

    /**
     * 业务逻辑：获取元素的子元素名称，用于相对关系定位
     *
     * 实现方式：直接返回 elementData.childrenName 字段
     *
     * 注意事项：子元素名称用于优化选择器（使用 :has() 伪类），提高定位准确性
     *
     * @returns 子元素名称，如果不存在则返回 undefined
     */
    public GetChildrenName(): string | undefined {
        return this.elementData.childrenName;
    }

    /**
     * 业务逻辑：获取元素的兄弟元素名称，用于相对关系定位
     *
     * 实现方式：直接返回 elementData.siblingName 字段
     *
     * 注意事项：兄弟元素名称用于在多个候选元素中筛选目标元素
     *
     * @returns 兄弟元素名称，如果不存在则返回 undefined
     */
    public GetSiblingName(): string | undefined {
        return this.elementData.siblingName;
    }

    /**
     * 业务逻辑：获取元素的兄弟元素偏移量，用于相对关系定位
     *
     * 实现方式：直接返回 elementData.siblingOffset 字段
     *
     * 注意事项：偏移量用于在多个兄弟元素中选择特定位置的元素
     *
     * @returns 兄弟元素偏移量，如果不存在则返回 undefined
     */
    public GetSiblingOffset(): number | undefined {
        return this.elementData.siblingOffset;
    }
}

/**
 * 业务逻辑：管理所有已定位的页面元素，按标签页ID和元素名称分组存储，提供元素的增删改查功能，用于在指令执行过程中快速查找和复用已定位的元素
 *
 * 实现方式：使用嵌套 Map 数据结构，外层 Map 的 key 是标签页ID，value 是内层 Map（key 是元素名称，value 是元素对象），实现两级索引快速查找
 *
 * 注意事项：
 * - 元素按标签页和名称双重索引，确保快速查找
 * - 支持按标签页批量清理元素，避免内存泄漏
 * - 所有操作都会记录日志，便于调试和监控
 * - 元素定位成功后会自动保存到管理器，便于后续指令复用
 *
 * 相关代码：src/managers/ElementManager.ts - ElementClass 类（定位成功后保存到此管理器），src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（使用此管理器查找元素）
 */
export class ElementManager {
    private elements: Map<number, Map<string, IElement>> = new Map();

    /**
     * 业务逻辑：清空所有标签页的所有元素，用于系统重置或清理内存
     *
     * 实现方式：使用 Map.clear() 方法清空所有键值对
     *
     * 注意事项：清空前会统计总元素数量并记录日志，便于监控和调试
     */
    public clearAll(): void {
        const totalCount = Array.from(this.elements.values()).reduce((sum, map) => sum + map.size, 0);
        this.elements.clear();
        OutputLogToFile(`[ElementManager] Cleared all elements successfully, count: ${totalCount}`, { level: LogLevel.INFO });
    }

    /**
     * 业务逻辑：根据标签页ID和元素名称获取已定位的元素，用于在指令执行时快速查找元素，避免重复定位
     *
     * 实现方式：先检查外层 Map 是否包含标签页ID，如果存在则从内层 Map 中获取元素名称对应的元素
     *
     * 注意事项：标签页不存在或元素不存在时返回 undefined，不会抛出异常
     *
     * @param tabId - 标签页ID
     * @param name - 元素名称
     * @returns 元素对象，如果不存在则返回 undefined
     *
     * 相关代码：src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（查找元素时调用此方法）
     */
    public GetElementByName(tabId: number, name: string): IElement | undefined {
        return this.elements.has(tabId) ? this.elements.get(tabId)?.get(name) : undefined;
    }

    /**
     * 业务逻辑：保存已定位的元素到管理器，用于后续指令执行时快速查找和复用元素
     *
     * 实现方式：如果标签页不存在则创建内层 Map，然后将元素保存到内层 Map 中
     *
     * 注意事项：保存操作会记录日志，包含标签页ID和元素名称，便于调试和监控
     *
     * @param tabId - 标签页ID
     * @param name - 元素名称
     * @param element - 元素对象
     *
     * 相关代码：src/managers/ElementManager.ts - ElementClass.LocateElement() 方法（定位成功后调用此方法）
     */
    public SetElementByName(tabId: number, name: string, element: IElement): void {
        if (!this.elements.has(tabId)) {
            this.elements.set(tabId, new Map());
        }
        this.elements.get(tabId)?.set(name, element);
        OutputLogToFile(`[ElementManager] Saved element successfully, tabId: ${tabId}, elementName: ${name}`, { level: LogLevel.INFO });
    }

    /**
     * 业务逻辑：删除指定标签页的指定元素，用于清理不再需要的元素，释放内存
     *
     * 实现方式：从内层 Map 中删除指定名称的元素，如果删除成功则记录日志
     *
     * 注意事项：标签页不存在或元素不存在时不会抛出异常，删除成功时记录日志
     *
     * @param tabId - 标签页ID
     * @param name - 元素名称
     */
    public RemoveElementByName(tabId: number, name: string): void {
        if (this.elements.has(tabId)) {
            const deleted = this.elements.get(tabId)?.delete(name);
            if (deleted) {
                OutputLogToFile(`[ElementManager] Removed element successfully, tabId: ${tabId}, elementName: ${name}`, { level: LogLevel.INFO });
            }
        }
    }

    /**
     * 业务逻辑：检查指定标签页的指定元素是否存在，用于判断元素是否已定位
     *
     * 实现方式：检查外层 Map 是否包含标签页ID，且内层 Map 是否包含元素名称
     *
     * 注意事项：标签页不存在或元素不存在时返回 false
     *
     * @param tabId - 标签页ID
     * @param name - 元素名称
     * @returns 元素是否存在（true/false）
     */
    public HasElementByName(tabId: number, name: string): boolean {
        return this.elements.has(tabId) && this.elements.get(tabId)?.has(name) || false;
    }

    /**
     * 业务逻辑：获取指定标签页的元素数量，用于统计和监控
     *
     * 实现方式：从内层 Map 获取 size 属性，如果标签页不存在则返回 0
     *
     * 注意事项：标签页不存在时返回 0，不会抛出异常
     *
     * @param tabId - 标签页ID
     * @returns 元素数量
     */
    public GetElementCount(tabId: number): number {
        return this.elements.has(tabId) ? this.elements.get(tabId)?.size || 0 : 0;
    }

    /**
     * 业务逻辑：清空指定标签页的所有元素，用于标签页关闭或重置时清理资源
     *
     * 实现方式：从外层 Map 中删除指定标签页的键值对
     *
     * 注意事项：删除前会统计元素数量并记录日志，便于监控和调试
     *
     * @param tabId - 标签页ID
     */
    public ClearTabElements(tabId: number): void {
        const count = this.elements.get(tabId)?.size || 0;
        this.elements.delete(tabId);
        OutputLogToFile(`[ElementManager] Cleared tab elements successfully, tabId: ${tabId}, count: ${count}`, { level: LogLevel.INFO });
    }
}

/**
 * 业务逻辑：导出全局单例元素管理器对象，确保整个应用使用同一个管理器实例，便于在不同模块间共享已定位的元素
 *
 * 实现方式：创建 ElementManager 实例并导出为全局变量
 *
 * 注意事项：使用单例模式，所有模块共享同一个管理器对象
 *
 * 相关代码：src/managers/ElementManager.ts - ElementClass 类（定位成功后保存到此管理器），src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（从此管理器查找元素）
 */
export let elementManager: ElementManager = new ElementManager();