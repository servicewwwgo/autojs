import { ElementTag } from '../consts';
import { ElementData, FindElementInstruction, InstructionResult } from '../types';
import { GenerateRandomString, OutputLogToFile, LogLevel } from '../utils';
import { ElementClass, elementManager } from '../managers';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 元素查找指令
 */
export class FindElementInstructionClass extends BaseInstructionClass {
    public params: {
        element: ElementData;
    };

    constructor(instruction: FindElementInstruction) {
        super(instruction);
        this.params = instruction.params;
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
            const documentResult = await this.ExecuteCDPCommand('DOM.getDocument', {
                depth: -1,
                pierce: false
            });

            if (!documentResult?.root?.nodeId) {
                OutputLogToFile(`[FindElementInstruction] Failed to get document root node for "${this.params.element.name}"`, { level: LogLevel.ERROR });
                return [];
            }

            const rootNodeId = documentResult.root.nodeId;

            // 使用 querySelectorAll 查找所有匹配的元素
            let candidateNodeIds: number[] = [];

            switch (selectorType) {
                case 'css':
                    try {
                        const queryResult = await this.ExecuteCDPCommand('DOM.querySelectorAll', {
                            nodeId: rootNodeId,
                            selector: selector
                        });
                        candidateNodeIds = queryResult?.nodeIds || [];
                    } catch (error) {
                        OutputLogToFile(`[FindElementInstruction] CDP querySelectorAll failed for "${this.params.element.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                case 'id':
                    try {
                        const queryResult = await this.ExecuteCDPCommand('DOM.querySelectorAll', {
                            nodeId: rootNodeId,
                            selector: `#${selector}`
                        });
                        candidateNodeIds = queryResult?.nodeIds || [];
                    } catch (error) {
                        OutputLogToFile(`[FindElementInstruction] CDP querySelectorAll (id) failed for "${this.params.element.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                case 'xpath':
                    try {
                        const searchResult = await this.ExecuteCDPCommand('DOM.performSearch', {
                            query: selector,
                            includeUserAgentShadowDOM: false
                        });

                        if (!searchResult?.searchId) {
                            OutputLogToFile(`[FindElementInstruction] XPath search did not return a searchId for "${this.params.element.name}"`, { level: LogLevel.WARN });
                            candidateNodeIds = [];
                            break;
                        }

                        const searchId = searchResult.searchId;
                        const maxResults = 1000; // 限制最多返回 1000 个结果

                        try {
                            const getSearchResults = await this.ExecuteCDPCommand('DOM.getSearchResults', {
                                searchId: searchId,
                                fromIndex: 0,
                                toIndex: maxResults
                            });

                            candidateNodeIds = getSearchResults?.nodeIds || [];

                            // 检查是否有更多结果被截断
                            if (candidateNodeIds.length >= maxResults) {
                                OutputLogToFile(`[FindElementInstruction] XPath search returned ${candidateNodeIds.length} results for "${this.params.element.name}", which may be truncated (max: ${maxResults})`, { level: LogLevel.WARN });
                            }
                        } finally {
                            // 确保清理搜索资源，即使获取结果时出错
                            try {
                                await this.ExecuteCDPCommand('DOM.discardSearchResults', {
                                    searchId: searchId
                                });
                            } catch (discardError) {
                                OutputLogToFile(`[FindElementInstruction] Failed to discard search results for "${this.params.element.name}": ${discardError instanceof Error ? discardError.message : String(discardError)}`, { level: LogLevel.WARN });
                            }
                        }
                    } catch (error) {
                        OutputLogToFile(`[FindElementInstruction] CDP performSearch (xpath) failed for "${this.params.element.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                        throw error;
                    }
                    break;

                default:
                    throw new Error(`Unsupported selector type: ${selectorType}`);
            }

            return candidateNodeIds;
        } catch (error) {
            OutputLogToFile(`[FindElementInstruction] Error finding all matching elements for "${this.params.element.name}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
            const nodeInfo = await this.ExecuteCDPCommand('DOM.describeNode', {
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
            OutputLogToFile(`[FindElementInstruction] Error checking node has child: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
            const childrenElement = elementManager.GetElementByName(this.tabId, childrenName);

            if (!childrenElement || !childrenElement.elementData.nodeId) {
                OutputLogToFile(`[FindElementInstruction] Children element "${childrenName}" not found in manager`, { level: LogLevel.WARN });
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
            OutputLogToFile(`[FindElementInstruction] Error selecting element by children "${childrenName}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
            const parentElement = elementManager.GetElementByName(this.tabId, parentName);

            if (!parentElement || !parentElement.elementData.nodeId) {
                OutputLogToFile(`[FindElementInstruction] Parent element "${parentName}" not found in manager`, { level: LogLevel.WARN });
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
                    const nodeInfo = await this.ExecuteCDPCommand('DOM.describeNode', {
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
            OutputLogToFile(`[FindElementInstruction] Error selecting element by parent "${parentName}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
            const siblingElement = elementManager.GetElementByName(this.tabId, siblingName);

            if (!siblingElement || !siblingElement.elementData.nodeId) {
                OutputLogToFile(`[FindElementInstruction] Sibling element "${siblingName}" not found in manager`, { level: LogLevel.WARN });
                return undefined;
            }

            const targetSiblingNodeId = siblingElement.elementData.nodeId;

            // 遍历所有候选元素，找到符合兄弟节点条件的元素
            for (const candidateNodeId of nodeIds) {
                try {
                    // 获取候选节点的父节点
                    const candidateInfo = await this.ExecuteCDPCommand('DOM.describeNode', {
                        nodeId: candidateNodeId,
                        depth: 0
                    });

                    const parentId = candidateInfo.node.parentId;
                    if (!parentId) {
                        continue; // 没有父节点，跳过
                    }

                    // 获取父节点的所有子节点
                    const parentInfo = await this.ExecuteCDPCommand('DOM.describeNode', {
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
                    OutputLogToFile(`[FindElementInstruction] Error checking sibling relation for node ${candidateNodeId}: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
                    continue; // 继续检查下一个节点
                }
            }

            return undefined;
        } catch (error) {
            OutputLogToFile(`[FindElementInstruction] Error selecting element by sibling "${siblingName}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
            OutputLogToFile(`[FindElementInstruction] Error checking node relations: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
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
            let cssCheckFailed = false;

            try {
                const computedStyle = await this.ExecuteCDPCommand('CSS.getComputedStyleForNode', {
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
                const boxModel = await this.ExecuteCDPCommand('DOM.getBoxModel', {
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

            // 如果 CSS 檢查明確失敗，返回 false
            if (cssCheckFailed) {
                return false;
            }

            // 如果所有方法都無法確定，返回 undefined
            return undefined;

        } catch (error) {
            return undefined;
        }
    }

    /**
     * 執行元素查找指令(並獲取元素nodeId及設置元素節點的tag)
     * @returns 指令執行結果
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {

            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            // 启用 DOM 域
            await this.ExecuteCDPCommand('DOM.enable');
            // 启用 CSS 域
            await this.ExecuteCDPCommand('CSS.enable');
            // 启用 Runtime 域
            await this.ExecuteCDPCommand('Runtime.enable');

            // 查找所有匹配的元素
            const candidateNodeIds = await this.FindAllMatchingElementNodeIds(this.params.element.selectorType, this.params.element.selector);

            // 如果没有找到任何候选元素
            if (candidateNodeIds.length === 0) {
                return { ...defaultResult, error: `Element "${this.params.element.name}" not found with selector: ${this.params.element.selector}` };
            }

            // 使用相对关系筛选候选元素
            let selectedNodeId: number | undefined = undefined;

            // 如果有相对关系条件（parentName, childrenName, siblingName），使用筛选方法
            if (this.params.element.parentName || this.params.element.childrenName || this.params.element.siblingName) {
                // 直接传入所有候选节点，方法内部会进行筛选
                selectedNodeId = await this.checkNodeRelations(candidateNodeIds, this.params.element.parentName, this.params.element.childrenName, this.params.element.siblingName, this.params.element.siblingOffset);

                // 如果筛选后没有找到符合条件的节点
                if (!selectedNodeId) {
                    return { ...defaultResult, error: `Element "${this.params.element.name}" found but does not match relation criteria (parent: ${this.params.element.parentName || 'none'}, children: ${this.params.element.childrenName || 'none'}, sibling: ${this.params.element.siblingName || 'none'})` };
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

            // 创建 ElementClass 对象并设置 nodeId
            if (selectedNodeId !== undefined && selectedNodeId !== 0) {
                // 生成唯一的 tag（用于在 content script 中查找元素）
                const tag = GenerateRandomString(14);

                // 通过 CDP 设置元素的 tag 属性
                await this.ExecuteCDPCommand('DOM.setAttributeValue', {
                    nodeId: selectedNodeId,
                    name: ElementTag,
                    value: tag
                });

                const elementDataWithNodeId: ElementData = {
                    ...this.params.element,
                    nodeId: selectedNodeId,
                    tag: tag,
                    tabId: this.tabId
                };

                const element = new ElementClass(elementDataWithNodeId);

                // 添加到 elementManager
                elementManager.SetElementByName(this.tabId, this.params.element.name, element);

                return { ...defaultResult, success: true, data: element };
            }

            return { ...defaultResult, error: `Element "${this.params.element.name}" not found or failed to set nodeId` };
        });

        return result;
    }
}