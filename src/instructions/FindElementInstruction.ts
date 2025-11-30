import type { ElementData, FindElementInstruction, InstructionResult } from '../types';
import { ElementTag } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { ElementClass, ElementManager } from '../managers';
import { GenerateRandomString } from '../utils';

/**
 * 元素查找指令
 */
export class FindElementInstructionClass extends BaseInstructionClass {
    public elementData: ElementData;

    constructor(instruction: FindElementInstruction, elementManager: ElementManager) {
        super(instruction, elementManager);
        this.elementData = instruction.element;
    }

    ToObject(): object {
        return {
            ...super.ToObject(),
            elementData: this.elementData
        } as object;
    }

    /**
     * 查找所有匹配的元素, 并返回元素nodeId列表
     * @param selectorType - 选择器类型
     * @param selector - 选择器
     * @returns 元素nodeId列表
     */
    private async FindAllMatchingElementNodeIds(selectorType: string, selector: string): Promise<number[]> {
        try {
            // 启用 DOM 域
            await this.ExecuteCDPCommand('DOM.enable');

            // 获取文档根节点
            const documentResult = await this.ExecuteCDPCommand('DOM.getDocument', {
                depth: -1,
                pierce: false
            });

            if (!documentResult?.root?.nodeId) {
                console.error(`Failed to get document root node for "${this.elementData.name}"`);
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
                        console.error(`CDP querySelectorAll failed for "${this.elementData.name}":`, error);
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
                        console.error(`CDP querySelectorAll (id) failed for "${this.elementData.name}":`, error);
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
                            console.warn(`XPath search did not return a searchId for "${this.elementData.name}"`);
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
                                console.warn(`XPath search returned ${candidateNodeIds.length} results for "${this.elementData.name}", which may be truncated (max: ${maxResults})`);
                            }
                        } finally {
                            // 确保清理搜索资源，即使获取结果时出错
                            try {
                                await this.ExecuteCDPCommand('DOM.discardSearchResults', {
                                    searchId: searchId
                                });
                            } catch (discardError) {
                                console.warn(`Failed to discard search results for "${this.elementData.name}":`, discardError);
                            }
                        }
                    } catch (error) {
                        console.error(`CDP performSearch (xpath) failed for "${this.elementData.name}":`, error);
                        throw error;
                    }
                    break;

                default:
                    throw new Error(`Unsupported selector type: ${selectorType}`);
            }

            return candidateNodeIds;
        } catch (error) {
            console.error(`Error finding all matching elements for "${this.elementData.name}":`, error);
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
            console.error(`Error checking node has child:`, error);
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
            const childrenElement = this._elementManager.GetElementByName(this.tabId, childrenName);

            if (!childrenElement || !childrenElement.elementData.nodeId) {
                console.warn(`Children element "${childrenName}" not found in manager`);
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
            console.error(`Error selecting element by children "${childrenName}":`, error);
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
            const parentElement = this._elementManager.GetElementByName(this.tabId, parentName);

            if (!parentElement || !parentElement.elementData.nodeId) {
                console.warn(`Parent element "${parentName}" not found in manager`);
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
            console.error(`Error selecting element by parent "${parentName}":`, error);
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
            const siblingElement = this._elementManager.GetElementByName(this.tabId, siblingName);

            if (!siblingElement || !siblingElement.elementData.nodeId) {
                console.warn(`Sibling element "${siblingName}" not found in manager`);
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
                    console.warn(`Error checking sibling relation for node ${candidateNodeId}:`, error);
                    continue; // 继续检查下一个节点
                }
            }

            return undefined;
        } catch (error) {
            console.error(`Error selecting element by sibling "${siblingName}":`, error);
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
            console.error(`Error checking node relations:`, error);
            return undefined;
        }
    }

    /**
     * 執行元素查找指令(並獲取元素nodeId及設置元素節點的tag)
     * @returns 指令執行結果
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            try {
                // 查找所有匹配的元素
                const candidateNodeIds = await this.FindAllMatchingElementNodeIds(this.elementData.selectorType, this.elementData.selector);

                // 如果没有找到任何候选元素
                if (candidateNodeIds.length === 0) {
                    return {
                        instructionID: this.instructionID,
                        success: false,
                        error: `Element "${this.elementData.name}" not found with selector: ${this.elementData.selector}`,
                        duration: 0,
                        data: null
                    } as InstructionResult;
                }

                // 使用相对关系筛选候选元素
                let selectedNodeId: number | undefined = undefined;

                // 如果有相对关系条件（parentName, childrenName, siblingName），使用筛选方法
                const hasRelationConditions = this.elementData.parentName || this.elementData.childrenName || this.elementData.siblingName;

                if (hasRelationConditions) {
                    // 直接传入所有候选节点，方法内部会进行筛选
                    selectedNodeId = await this.checkNodeRelations(
                        candidateNodeIds,
                        this.elementData.parentName,
                        this.elementData.childrenName,
                        this.elementData.siblingName,
                        this.elementData.siblingOffset
                    );

                    // 如果筛选后没有找到符合条件的节点
                    if (!selectedNodeId) {
                        return {
                            instructionID: this.instructionID,
                            success: false,
                            error: `Element "${this.elementData.name}" found but does not match relation criteria (parent: ${this.elementData.parentName || 'none'}, children: ${this.elementData.childrenName || 'none'}, sibling: ${this.elementData.siblingName || 'none'})`,
                            duration: 0,
                            data: null
                        } as InstructionResult;
                    }
                } else {
                    // 如果没有相对关系条件，使用第一个候选节点
                    selectedNodeId = candidateNodeIds[0];
                }

                // 创建 ElementClass 对象并设置 nodeId
                if (selectedNodeId !== undefined && selectedNodeId !== 0) {
                    // 生成唯一的 tag（用于在 content script 中查找元素）
                    const tag = GenerateRandomString(14);

                    // 通过 CDP 设置元素的 tag 属性
                    try {
                        // 使用 DOM.resolveNode 将 nodeId 转换为可以在页面中访问的对象
                        const resolveResult = await this.ExecuteCDPCommand('DOM.resolveNode', {
                            nodeId: selectedNodeId
                        });

                        if (resolveResult?.object?.objectId) {
                            // 使用 Runtime.callFunctionOn 在页面上下文中设置属性
                            // this 指向元素对象，通过 this.setAttribute 设置属性
                            await this.ExecuteCDPCommand('Runtime.callFunctionOn', {
                                objectId: resolveResult.object.objectId,
                                functionDeclaration: `
                                    function(tagName, tagValue) {
                                        if (this && this.setAttribute) {
                                            this.setAttribute(tagName, tagValue);
                                            return true;
                                        }
                                        return false;
                                    }
                                `,
                                arguments: [
                                    { value: ElementTag },
                                    { value: tag }
                                ],
                                returnByValue: true
                            });
                        } else {
                            console.warn(`Failed to resolve node ${selectedNodeId} to object for setting tag`);
                        }
                    } catch (error) {
                        console.warn(`Failed to set element tag via CDP:`, error);
                        // 即使设置 tag 失败，也继续执行
                    }

                    const elementDataWithNodeId: ElementData = {
                        ...this.elementData,
                        nodeId: selectedNodeId,
                        tag: tag,
                        tabId: this.tabId
                    };

                    const element = new ElementClass(elementDataWithNodeId);

                    // 添加到 elementManager
                    this._elementManager.SetElementByName(this.tabId, this.elementData.name, element);

                    return {
                        instructionID: this.instructionID,
                        success: true,
                        duration: 0,
                        data: element
                    } as InstructionResult;
                }

                return {
                    instructionID: this.instructionID,
                    success: false,
                    error: `Element "${this.elementData.name}" not found or failed to set nodeId`,
                    duration: 0,
                    data: null
                } as InstructionResult;

            } catch (error) {
                console.error(`Error finding element "${this.elementData.name}" via CDP:`, error);
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
}