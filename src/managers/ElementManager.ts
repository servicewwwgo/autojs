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
    GetNodeId(): number | undefined;

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
    GetSelectorType(): 'css' | 'xpath' | 'id' | 'tag';

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
     * @returns 元素nodeId列表
     */
    private async FindAllMatchingElementNodeIds(selectorType: string, selector: string): Promise<number[]> {
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

                case 'xpath':
                    try {
                        // 使用 Runtime.callFunctionOn 执行 XPath 查询
                        // 注意：CDP 的 DOM.performSearch 不支持 XPath，必须使用 JavaScript 执行
                        const escapedSelector = JSON.stringify(selector);
                        const maxResults = 1000; // 限制最多返回 1000 个结果

                        // 使用 callFunctionOn 更简洁，直接返回节点数组
                        const callResult = await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.callFunctionOn', {
                            functionDeclaration: `
                                function(xpath, maxCount) {
                                    try {
                                        const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                                        const nodes = [];
                                        const count = Math.min(result.snapshotLength, maxCount);
                                        for (let i = 0; i < count; i++) {
                                            const node = result.snapshotItem(i);
                                            if (node && node.nodeType === Node.ELEMENT_NODE) {
                                                nodes.push(node);
                                            }
                                        }
                                        return nodes;
                                    } catch (e) {
                                        return [];
                                    }
                                }
                            `,
                            arguments: [
                                { value: selector },
                                { value: maxResults }
                            ],
                            returnByValue: false // 返回对象引用，以便后续获取 nodeId
                        });

                        if (!callResult?.result?.objectId) {
                            OutputLogToFile(`[ElementManager] XPath evaluation did not return objectId for "${this.elementData.name}"`, { level: LogLevel.WARN });
                            candidateNodeIds = [];
                            break;
                        }

                        // 获取数组的所有属性（包括索引属性）
                        const objectId = callResult.result.objectId;
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
                                        OutputLogToFile(`[ElementManager] Failed to get nodeId for XPath result at index ${property.name}: ${nodeIdError instanceof Error ? nodeIdError.message : String(nodeIdError)}`, { level: LogLevel.WARN });
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
                            OutputLogToFile(`[ElementManager] Failed to release object for "${this.elementData.name}": ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`, { level: LogLevel.WARN });
                        }

                        // 检查是否有更多结果被截断
                        if (candidateNodeIds.length >= maxResults) {
                            OutputLogToFile(`[ElementManager] XPath search returned ${candidateNodeIds.length} results for "${this.elementData.name}", which may be truncated (max: ${maxResults})`, { level: LogLevel.WARN });
                        }
                    } catch (error) {
                        OutputLogToFile(`[ElementManager] XPath evaluation failed for "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
     * 递归检查节点是否包含指定的子节点
     * @param parentNodeId - 父节点ID
     * @param targetChildNodeId - 目标子节点ID
     * @returns 是否包含指定的子节点
     */
    private async checkNodeHasChild(parentNodeId: number, targetChildNodeId: number): Promise<boolean> {
        try {
            const nodeInfo = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.describeNode', {
                nodeId: parentNodeId,
                depth: -1
            });

            if (!nodeInfo.node.children || nodeInfo.node.children.length === 0) {
                return false;
            }

            for (const child of nodeInfo.node.children) {
                if (child.nodeId === targetChildNodeId) {
                    return true;
                }

                if (await this.checkNodeHasChild(child.nodeId, targetChildNodeId)) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error checking node has child: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return false;
        }
    }

    /**
     * 挑選元素(從元素列表中，挑選出子元素是childrenName的元素)
     * @param nodeIds - 元素列表
     * @param childrenName - 子元素名称
     * @returns 挑選出的元素ID
     */
    private async selectElementByChildren(nodeIds: number[], childrenName: string): Promise<number | undefined> {
        try {
            // 获取子元素
            const childrenElement = elementManager.GetElementByName(this.elementData.tabId, childrenName);

            if (!childrenElement || !childrenElement.elementData.nodeId) {
                OutputLogToFile(`[ElementManager] Children element "${childrenName}" not found in manager`, { level: LogLevel.WARN });
                return undefined;
            }

            const targetChildNodeId = childrenElement.elementData.nodeId;

            // 遍历所有候选元素，找到包含目标子节点的元素
            for (const nodeId of nodeIds) {
                const hasChild = await this.checkNodeHasChild(nodeId, targetChildNodeId);

                if (hasChild) {
                    return nodeId;
                }
            }

            return undefined;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error selecting element by children "${childrenName}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return undefined;
        }
    }

    /**
     * 挑選元素(從元素列表中，挑選出父元素或祖父元素是parentName的元素)
     * @param nodeIds - 元素列表
     * @param parentName - 父元素名称
     * @returns 挑選出的元素ID
     */
    private async selectElementByParent(nodeIds: number[], parentName: string): Promise<number | undefined> {
        try {
            // 获取父元素
            const parentElement = elementManager.GetElementByName(this.elementData.tabId, parentName);

            if (!parentElement || !parentElement.elementData.nodeId) {
                OutputLogToFile(`[ElementManager] Parent element "${parentName}" not found in manager`, { level: LogLevel.WARN });
                return undefined;
            }

            const targetParentNodeId = parentElement.elementData.nodeId;

            // 遍历所有候选元素，找到父节点链中包含目标父节点的元素
            for (const nodeId of nodeIds) {
                let currentNodeId = nodeId;
                let found = false;
                const maxDepth = 20;
                let depth = 0;

                // 向上遍历父节点链
                while (currentNodeId && depth < maxDepth) {
                    const nodeInfo = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.describeNode', {
                        nodeId: currentNodeId,
                        depth: 0
                    });

                    if (nodeInfo.node.parentId === targetParentNodeId) {
                        found = true;
                        break;
                    }

                    currentNodeId = nodeInfo.node.parentId;
                    depth++;
                }

                if (found) {
                    return nodeId;
                }
            }

            return undefined;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error selecting element by parent "${parentName}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return undefined;
        }
    }

    /**
     * 挑選元素(從元素列表中，挑選出兄弟元素是siblingName的元素, 并根据偏移量挑選出元素)
     * @param nodeIds - 元素列表
     * @param siblingName - 兄弟元素名称
     * @param siblingOffset - 兄弟元素偏移量（可选，如果未指定则检查是否是相邻兄弟节点）
     * @returns 挑選出的元素ID
     */
    private async selectElementBySibling(nodeIds: number[], siblingName: string, siblingOffset?: number): Promise<number | undefined> {
        try {
            // 获取兄弟元素
            const siblingElement = elementManager.GetElementByName(this.elementData.tabId, siblingName);

            if (!siblingElement || !siblingElement.elementData.nodeId) {
                OutputLogToFile(`[ElementManager] Sibling element "${siblingName}" not found in manager`, { level: LogLevel.WARN });
                return undefined;
            }

            const targetSiblingNodeId = siblingElement.elementData.nodeId;

            // 遍历所有候选元素，找到符合兄弟节点条件的元素
            for (const candidateNodeId of nodeIds) {
                try {
                    // 获取候选节点的父节点
                    const candidateInfo = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.describeNode', {
                        nodeId: candidateNodeId,
                        depth: 0
                    });

                    const parentId = candidateInfo.node.parentId;
                    if (!parentId) {
                        continue; // 没有父节点，跳过
                    }

                    // 获取父节点的所有子节点
                    const parentInfo = await ExecuteCDPCommand(this.elementData.tabId, 'DOM.describeNode', {
                        nodeId: parentId,
                        depth: 1
                    });

                    if (!parentInfo.node.children) {
                        continue; // 没有子节点，跳过
                    }

                    // 找到兄弟节点和候选节点的索引
                    let siblingIndex = -1;
                    let candidateIndex = -1;

                    for (let i = 0; i < parentInfo.node.children.length; i++) {
                        const child = parentInfo.node.children[i];
                        if (child.nodeId === targetSiblingNodeId) {
                            siblingIndex = i;
                        }
                        if (child.nodeId === candidateNodeId) {
                            candidateIndex = i;
                        }
                    }

                    // 如果找不到兄弟节点或候选节点，跳过
                    if (siblingIndex === -1 || candidateIndex === -1) {
                        continue;
                    }

                    // 检查偏移量
                    if (siblingOffset !== undefined) {
                        // 如果指定了偏移量，检查候选节点是否在兄弟节点的指定偏移位置
                        const expectedIndex = siblingIndex + siblingOffset;
                        if (candidateIndex === expectedIndex) {
                            return candidateNodeId;
                        }
                    } else {
                        // 如果没有指定偏移量，检查是否是相邻兄弟节点
                        if (Math.abs(candidateIndex - siblingIndex) === 1) {
                            return candidateNodeId;
                        }
                    }
                } catch (error) {
                    OutputLogToFile(`[ElementManager] Error checking sibling relation for node ${candidateNodeId}: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
                    continue; // 继续检查下一个节点
                }
            }

            return undefined;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error selecting element by sibling "${siblingName}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return undefined;
        }
    }

    /**
     * 检查节点是否符合相对关系条件
     * @param candidateNodeIds - 候选节点的 nodeId 数组
     * @param parentName - 父节点名称（可选）
     * @param childrenName - 子节点名称（可选）
     * @param siblingName - 兄弟节点名称（可选）
     * @param siblingOffset - 兄弟节点偏移量（可选）
     * @returns 符合所有条件的节点ID，如果不存在则返回 undefined
     */
    private async checkNodeRelations(
        candidateNodeIds: number[],
        parentName?: string,
        childrenName?: string,
        siblingName?: string,
        siblingOffset?: number
    ): Promise<number | undefined> {
        try {
            // 如果没有候选节点，返回 undefined
            if (!candidateNodeIds || candidateNodeIds.length === 0) {
                return undefined;
            }

            // 先根据父节点条件筛选
            let filteredNodeIds = candidateNodeIds;

            if (parentName) {
                const selectedNodeId = await this.selectElementByParent(filteredNodeIds, parentName);
                if (!selectedNodeId) {
                    return undefined; // 没有符合父节点条件的节点
                }
                filteredNodeIds = [selectedNodeId]; // 只保留符合父节点条件的节点
            }

            // 再根据子节点条件筛选
            if (childrenName) {
                const selectedNodeId = await this.selectElementByChildren(filteredNodeIds, childrenName);
                if (!selectedNodeId) {
                    return undefined; // 没有符合子节点条件的节点
                }
                filteredNodeIds = [selectedNodeId]; // 只保留符合子节点条件的节点
            }

            // 最后根据兄弟节点条件筛选
            if (siblingName) {
                const selectedNodeId = await this.selectElementBySibling(filteredNodeIds, siblingName, siblingOffset);
                if (!selectedNodeId) {
                    return undefined; // 没有符合兄弟节点条件的节点
                }
                filteredNodeIds = [selectedNodeId]; // 只保留符合兄弟节点条件的节点
            }

            // 返回第一个符合所有条件的节点ID
            return filteredNodeIds.length > 0 ? filteredNodeIds[0] : undefined;
        } catch (error) {
            OutputLogToFile(`[ElementManager] Error checking node relations: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            return undefined;
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

        // 启用 DOM 域
        await ExecuteCDPCommand(this.elementData.tabId, 'DOM.enable');
        // 启用 CSS 域
        await ExecuteCDPCommand(this.elementData.tabId, 'CSS.enable');
        // 启用 Runtime 域
        await ExecuteCDPCommand(this.elementData.tabId, 'Runtime.enable');

        // 验证 nodeId 是否仍然有效（通过尝试获取节点信息）, 如果已经失效, 则重新定位元素
        if (this.elementData.nodeId) {
            try {
                await ExecuteCDPCommand(this.elementData.tabId, 'DOM.describeNode', { nodeId: this.elementData.nodeId });
                // nodeId 有效，直接返回成功
                return true;
            } catch (error) {
                OutputLogToFile(`[ElementManager] Error checking nodeId validity for element "${this.elementData.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }
        }

        // 查找所有匹配的元素
        const candidateNodeIds = await this.FindAllMatchingElementNodeIds(this.elementData.selectorType, this.elementData.selector);

        // 如果没有找到任何候选元素
        if (candidateNodeIds.length === 0) {
            OutputLogToFile(`[ElementManager] No candidate elements found for element "${this.elementData.name}" with selector: ${this.elementData.selector}`, { level: LogLevel.WARN });
            return false;
        }

        // 使用相对关系筛选候选元素
        let selectedNodeId: number | undefined = undefined;

        // 如果有相对关系条件（parentName, childrenName, siblingName），使用筛选方法
        if (this.elementData.parentName || this.elementData.childrenName || this.elementData.siblingName) {
            // 直接传入所有候选节点，方法内部会进行筛选
            selectedNodeId = await this.checkNodeRelations(candidateNodeIds, this.elementData.parentName, this.elementData.childrenName, this.elementData.siblingName, this.elementData.siblingOffset);

            // 如果筛选后没有找到符合条件的节点
            if (!selectedNodeId) {
                OutputLogToFile(`[ElementManager] No valid element found for element "${this.elementData.name}" with selector: ${this.elementData.selector} and relation criteria (parent: ${this.elementData.parentName || 'none'}, children: ${this.elementData.childrenName || 'none'}, sibling: ${this.elementData.siblingName || 'none'})`, { level: LogLevel.ERROR });
                return false;
            }
        } else if (candidateNodeIds.length > 1) {
            // 選取所有候選元素中，可見的元素
            for (const nodeId of candidateNodeIds) {
                const isVisible = await this.checkNodeIsVisible(nodeId);
                if (isVisible === true) {
                    selectedNodeId = nodeId;
                    break;
                }
            }
        } else if (candidateNodeIds.length === 1) {
            selectedNodeId = candidateNodeIds[0];
        }

        if (selectedNodeId === undefined || selectedNodeId === 0) {
            OutputLogToFile(`[ElementManager] No valid element found for element "${this.elementData.name}" with selector: ${this.elementData.selector}`, { level: LogLevel.ERROR });
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

    public GetNodeId(): number | undefined {
        return this.elementData.nodeId;
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

    public GetSelector(): string | undefined {
        return this.elementData.selector;
    }

    public GetSelectorType(): 'css' | 'xpath' | 'id' | 'tag' {
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