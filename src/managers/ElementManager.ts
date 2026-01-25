import { ElementTag } from '../consts';
import type { ElementData } from '../types';
import { ExecuteCDPCommand, GenerateRandomString, LogLevel, OutputLogToFile } from '../utils';

/**
 * 元素对象接口
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
    GetSelectorType(): 'css' | 'id' | 'tag' | 'text';

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
 * 元素对象实现类
 */
export class ElementClass implements IElement {
    public elementData: ElementData;

    constructor(data: ElementData) {
        this.elementData = data;
    }

    /**
     * 查找所有匹配的元素, 并返回元素nodeId列表
     * @param selectorType - 选择器类型
     * @param selector - 选择器
     * @param text - 文本内容（用于 text 类型选择器）
     * @returns 元素nodeId列表
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
     * 檢查節點是否可見
     * @param nodeId - 節點ID
     * @returns 是否可見，如果檢查失敗則返回 undefined
     * @remarks
     * 可見性判斷標準（按優先級順序）：
     * 
     * 【明確不可見的指標】（任何一項滿足即返回 false）：
     * 1. CSS display === 'none' - 元素不佔據空間，完全不可見
     * 2. CSS visibility === 'hidden' 或 'collapse' - 元素不可見但佔據空間
     * 3. CSS opacity <= 0 - 元素完全透明
     * 4. 元素未連接到 DOM (isConnected === false) - 元素不在文檔中
     * 5. 元素尺寸為 0 (width <= 0 或 height <= 0) - 元素沒有可見區域
     * 6. 元素完全在視口外 - 元素不在可見區域內
     * 
     * 【明確可見的指標】（所有檢查都通過才返回 true）：
     * 1. 元素已連接到 DOM
     * 2. CSS display !== 'none'
     * 3. CSS visibility !== 'hidden' 且 !== 'collapse'
     * 4. CSS opacity > 0
     * 5. 元素有有效尺寸 (width > 0 且 height > 0)
     * 6. 元素至少部分在視口內
     * 
     * 檢查方法優先級：
     * 1. CSS.getComputedStyleForNode - 最快，檢查 CSS 樣式
     * 2. DOM.getBoxModel - 檢查尺寸和位置
     * 3. Runtime.callFunctionOn - 最全面，在頁面上下文中檢查
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
     * 定位元素
     * @returns 是否成功定位元素
     * @throws 如果元素未找到或定位失败，抛出错误
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

        if (!['css', 'xpath', 'id', 'tag'].includes(this.elementData.selectorType)) {
            return false;
        }

        // 检查是否找到元素（通过 nodeId）
        if (!this.elementData.nodeId) {
            OutputLogToFile(`[ElementManager] Element "${this.elementData.name}" not found with nodeId: ${this.elementData.nodeId}`, { level: LogLevel.ERROR });
            return false;
        }

        return true;
    }

    public ToObject(): object {
        return this.elementData;
    }

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

    public GetBackup(): string | undefined {
        return this.elementData.backup;
    }

    public GetTag(): string | undefined {
        return this.elementData.tag;
    }

    public GetName(): string | undefined {
        return this.elementData.name;
    }

    public GetDescription(): string | undefined {
        return this.elementData.description;
    }

    public GetText(): string | undefined {
        return this.elementData.text;
    }

    public GetSelector(): string | undefined {
        return this.elementData.selector;
    }

    public GetSelectorType(): 'css' | 'id' | 'tag' | 'text' {
        return this.elementData.selectorType;
    }

    public GetParentName(): string | undefined {
        return this.elementData.parentName;
    }

    public GetChildrenName(): string | undefined {
        return this.elementData.childrenName;
    }

    public GetSiblingName(): string | undefined {
        return this.elementData.siblingName;
    }

    public GetSiblingOffset(): number | undefined {
        return this.elementData.siblingOffset;
    }
}

/**
 * 元素管理器
 * 用于保存全部元素，按tabId和元素名称分组
 */
export class ElementManager {
    private elements: Map<number, Map<string, IElement>> = new Map();

    /**
     * 清空所有元素
     */
    public clearAll(): void {
        const totalCount = Array.from(this.elements.values()).reduce((sum, map) => sum + map.size, 0);
        this.elements.clear();
        OutputLogToFile(`[ElementManager] Cleared all elements successfully, count: ${totalCount}`, { level: LogLevel.INFO });
    }

    /**
     * 根据元素名称获取
     */
    public GetElementByName(tabId: number, name: string): IElement | undefined {
        return this.elements.has(tabId) ? this.elements.get(tabId)?.get(name) : undefined;
    }

    /**
     * 根据元素名称保存
     */
    public SetElementByName(tabId: number, name: string, element: IElement): void {
        if (!this.elements.has(tabId)) {
            this.elements.set(tabId, new Map());
        }
        this.elements.get(tabId)?.set(name, element);
        OutputLogToFile(`[ElementManager] Saved element successfully, tabId: ${tabId}, elementName: ${name}`, { level: LogLevel.INFO });
    }

    /**
     * 根据元素名称删除
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
     * 检查元素名称是否存在
     */
    public HasElementByName(tabId: number, name: string): boolean {
        return this.elements.has(tabId) && this.elements.get(tabId)?.has(name) || false;
    }

    /**
     * 获取元素数量
     */
    public GetElementCount(tabId: number): number {
        return this.elements.has(tabId) ? this.elements.get(tabId)?.size || 0 : 0;
    }

    /**
     * 清空指定标签页的所有元素
     */
    public ClearTabElements(tabId: number): void {
        const count = this.elements.get(tabId)?.size || 0;
        this.elements.delete(tabId);
        OutputLogToFile(`[ElementManager] Cleared tab elements successfully, tabId: ${tabId}, count: ${count}`, { level: LogLevel.INFO });
    }
}

/**
 * 导出全局元素管理器
 */
export let elementManager: ElementManager = new ElementManager();