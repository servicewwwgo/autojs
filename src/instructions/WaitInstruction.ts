import { ElementTag } from '../consts';
import { ElementClass, elementManager, IElement } from '../managers';
import { ElementData, WaitAttributeContainsResult, WaitElementExistsResult, WaitElementVisibleResult, WaitInstruction, WaitInstructionResult, WaitPageLoadResult, WaitTitleContainsResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 等待指令
 */
export class WaitInstructionClass extends BaseInstructionClass {
    public params: {
        waitType: 'wait_title_contains' | 'wait_element_exists' | 'wait_element_visible' | 'wait_attribute_contains' | 'wait_page_load';
        titleText?: string;
        element?: ElementData;
        elementName?: string;
        attribute?: string;
        attributeText?: string;
    };

    constructor(instruction: WaitInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 执行等待指令
     * @returns 指令执行结果
     */
    public async Execute(): Promise<WaitInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: WaitInstructionResult = {
                tabId: this.tabId,
                instructionID: this.instructionID,
                success: false,
                duration: 0
            };

            // 默认超时时间为 30 秒，如果指定了 timeout 则使用指定的值
            const timeoutMs = (this.timeout || 30) * 1000; // 转换为毫秒
            const startTime = Date.now();

            try {
                switch (this.params.waitType) {
                    case 'wait_title_contains':
                        return await this.WaitForTitleContains(timeoutMs, startTime);
                    case 'wait_element_exists':
                        return await this.WaitForElementExists(timeoutMs, startTime);
                    case 'wait_element_visible':
                        return await this.WaitForElementVisible(timeoutMs, startTime);
                    case 'wait_attribute_contains':
                        return await this.WaitForAttributeContains(timeoutMs, startTime);
                    case 'wait_page_load':
                        return await this.WaitForPageLoad(timeoutMs, startTime);
                    default:
                        return {
                            ...defaultResult,
                            error: `Unknown wait type: ${this.params.waitType}`
                        } as WaitInstructionResult;
                }
            } catch (error) {
                return {
                    ...defaultResult,
                    error: error instanceof Error ? error.message : String(error)
                } as WaitInstructionResult;
            }
        });

        return result;
    }

    /**
     * 等待页面标题包含指定字符串
     * @param timeoutMs - 超时时间（毫秒）
     * @param startTime - 开始时间
     * @returns 指令执行结果
     */
    private async WaitForTitleContains(timeoutMs: number, startTime: number): Promise<WaitTitleContainsResult> {
        if (!this.params.titleText) {
            return {
                tabId: this.tabId,
                instructionID: this.instructionID,
                success: false,
                error: 'titleText parameter is required for wait_title_contains',
                duration: Date.now() - startTime
            } as WaitTitleContainsResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次
        const targetText = this.params.titleText.toLowerCase();

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 使用 CDP 获取页面标题
                const result = await this.ExecuteCDPCommand('Runtime.evaluate', {
                    expression: 'document.title',
                    returnByValue: true
                });

                const currentTitle = result?.result?.value || '';
                if (typeof currentTitle === 'string' && currentTitle.toLowerCase().includes(targetText)) {
                    OutputLogToFile(`[WaitInstruction] Title contains "${this.params.titleText}"`, { level: LogLevel.INFO });
                    return {
                        tabId: this.tabId,
                        instructionID: this.instructionID,
                        success: true,
                        data: { title: currentTitle },
                        duration: Date.now() - startTime
                    } as WaitTitleContainsResult;
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking title: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return {
            tabId: this.tabId,
            instructionID: this.instructionID,
            success: false,
            error: `Timeout waiting for title to contain "${this.params.titleText}"`,
            duration: Date.now() - startTime
        } as WaitTitleContainsResult;
    }

    /**
     * 等待元素存在于 DOM 中
     * @param timeoutMs - 超时时间（毫秒）
     * @param startTime - 开始时间
     * @returns 指令执行结果
     */
    private async WaitForElementExists(timeoutMs: number, startTime: number): Promise<WaitElementExistsResult> {
        const element = await this.GetElement();
        if (!element) {
            return {
                tabId: this.tabId,
                instructionID: this.instructionID,
                success: false,
                error: 'Element not found in element manager and element data not provided',
                duration: Date.now() - startTime
            } as WaitElementExistsResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 先尝试获取 nodeId（如果元素已经定位，可以直接获取）
                let nodeId = await element.GetNodeId();

                // 如果无法获取 nodeId，尝试定位元素
                if (!nodeId) {
                    if (!await element.LocateElement()) {
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        continue;
                    }
                    nodeId = await element.GetNodeId();
                    if (!nodeId) {
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        continue;
                    }
                }

                // 元素存在
                OutputLogToFile(`[WaitInstruction] Element "${element.GetName()}" exists in DOM`, { level: LogLevel.INFO });
                return {
                    tabId: this.tabId,
                    instructionID: this.instructionID,
                    success: true,
                    data: { elementName: element.GetName() },
                    duration: Date.now() - startTime
                } as WaitElementExistsResult;
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking element existence: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return {
            tabId: this.tabId,
            instructionID: this.instructionID,
            success: false,
            error: `Timeout waiting for element "${element.GetName()}" to exist in DOM`,
            duration: Date.now() - startTime
        } as WaitElementExistsResult;
    }

    /**
     * 等待元素存在于 DOM 且可见
     * @param timeoutMs - 超时时间（毫秒）
     * @param startTime - 开始时间
     * @returns 指令执行结果
     */
    private async WaitForElementVisible(timeoutMs: number, startTime: number): Promise<WaitElementVisibleResult> {
        const element = await this.GetElement();
        if (!element) {
            return {
                tabId: this.tabId,
                instructionID: this.instructionID,
                success: false,
                error: 'Element not found in element manager and element data not provided',
                duration: Date.now() - startTime
            } as WaitElementVisibleResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 先尝试获取 nodeId（如果元素已经定位，可以直接获取）
                let nodeId = await element.GetNodeId();

                // 如果无法获取 nodeId，尝试定位元素
                if (!nodeId) {
                    if (!await element.LocateElement()) {
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        continue;
                    }
                    nodeId = await element.GetNodeId();
                    if (!nodeId) {
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        continue;
                    }
                }

                // 检查元素是否可见
                const isVisible = await this.CheckElementVisible(nodeId);
                if (isVisible === true) {
                    OutputLogToFile(`[WaitInstruction] Element "${element.GetName()}" is visible`, { level: LogLevel.INFO });
                    return {
                        tabId: this.tabId,
                        instructionID: this.instructionID,
                        success: true,
                        data: { elementName: element.GetName() },
                        duration: Date.now() - startTime
                    } as WaitElementVisibleResult;
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking element visibility: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return {
            tabId: this.tabId,
            instructionID: this.instructionID,
            success: false,
            error: `Timeout waiting for element "${element.GetName()}" to be visible`,
            duration: Date.now() - startTime
        } as WaitElementVisibleResult;
    }

    /**
     * 等待元素的某个属性值包含指定文本
     * @param timeoutMs - 超时时间（毫秒）
     * @param startTime - 开始时间
     * @returns 指令执行结果
     */
    private async WaitForAttributeContains(timeoutMs: number, startTime: number): Promise<WaitAttributeContainsResult> {
        if (!this.params.attribute || !this.params.attributeText) {
            return {
                tabId: this.tabId,
                instructionID: this.instructionID,
                success: false,
                error: 'attribute and attributeText parameters are required for wait_attribute_contains',
                duration: Date.now() - startTime
            } as WaitAttributeContainsResult;
        }

        const element = await this.GetElement();
        if (!element) {
            return {
                tabId: this.tabId,
                instructionID: this.instructionID,
                success: false,
                error: 'Element not found in element manager and element data not provided',
                duration: Date.now() - startTime
            } as WaitAttributeContainsResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次
        const targetText = this.params.attributeText.toLowerCase();

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 先定位元素
                if (await element.LocateElement()) {
                    const nodeId = await element.GetNodeId();
                    if (!nodeId) {
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        continue;
                    }

                    // 获取元素属性
                    const attributesResult = await this.ExecuteCDPCommand('DOM.getAttributes', {
                        nodeId: nodeId,
                    });

                    // 将成对的数组转换为键值对对象
                    const attributesArray = attributesResult?.attributes || [];
                    const attributesObject: Record<string, string> = {};

                    for (let i = 0; i < attributesArray.length; i += 2) {
                        const attrName = attributesArray[i];
                        const attrValue = attributesArray[i + 1];
                        if (attrName && attrValue !== undefined) {
                            attributesObject[attrName] = attrValue;
                        }
                    }

                    // 检查属性值
                    let attributeValue: string | undefined = attributesObject[this.params.attribute];

                    // 如果 HTML 属性中没有，尝试使用 Runtime.evaluate 获取元素属性
                    if (attributeValue === undefined) {
                        try {
                            const attrResult = await this.ExecuteCDPCommand('Runtime.evaluate', {
                                expression: `(function() {
                                    const node = document.querySelector('[${ElementTag}=${JSON.stringify(element.GetTag())}]');
                                    if (node) {
                                      return node.getAttribute(${JSON.stringify(this.params.attribute)}) || node[${JSON.stringify(this.params.attribute)}] || null;
                                    }
                                    return null;
                                  })()`,
                                returnByValue: true,
                                timeout: this.timeout ? this.timeout * 1000 : undefined // 将秒转换为毫秒
                            });

                            attributeValue = attrResult?.result?.value ?? undefined;
                        } catch (error) {
                            // 忽略错误，继续检查
                        }
                    }

                    // 检查属性值是否包含目标文本
                    if (attributeValue && typeof attributeValue === 'string' && attributeValue.toLowerCase().includes(targetText)) {
                        OutputLogToFile(`[WaitInstruction] Attribute "${this.params.attribute}" contains "${this.params.attributeText}"`, { level: LogLevel.INFO });
                        return {
                            tabId: this.tabId,
                            instructionID: this.instructionID,
                            success: true,
                            data: {
                                elementName: element.GetName(),
                                attribute: this.params.attribute,
                                attributeValue: attributeValue
                            },
                            duration: Date.now() - startTime
                        } as WaitAttributeContainsResult;
                    }
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking attribute: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return {
            tabId: this.tabId,
            instructionID: this.instructionID,
            success: false,
            error: `Timeout waiting for attribute "${this.params.attribute}" to contain "${this.params.attributeText}"`,
            duration: Date.now() - startTime
        } as WaitAttributeContainsResult;
    }

    /**
     * 检查元素是否可见
     * @param nodeId - 节点ID
     * @returns 是否可见，如果检查失败则返回 undefined
     */
    private async CheckElementVisible(nodeId: number): Promise<boolean | undefined> {
        try {
            // 检查 CSS 样式
            const computedStyle = await this.ExecuteCDPCommand('CSS.getComputedStyleForNode', {
                nodeId: nodeId
            });

            if (computedStyle?.computedStyle) {
                const styles = computedStyle.computedStyle;

                // 查找关键样式属性
                const getStyleValue = (propertyName: string): string | undefined => {
                    const style = styles.find((s: any) => s.name === propertyName);
                    return style?.value;
                };

                const display = getStyleValue('display');
                const visibility = getStyleValue('visibility');
                const opacity = getStyleValue('opacity');

                // 检查 display
                if (display === 'none') {
                    return false;
                }

                // 检查 visibility
                if (visibility === 'hidden' || visibility === 'collapse') {
                    return false;
                }

                // 检查 opacity
                if (opacity) {
                    const opacityValue = parseFloat(opacity);
                    if (!isNaN(opacityValue) && opacityValue <= 0) {
                        return false;
                    }
                }
            }

            // 检查元素尺寸和位置
            const boxModel = await this.ExecuteCDPCommand('DOM.getBoxModel', {
                nodeId: nodeId
            });

            if (boxModel?.model?.content && boxModel.model.content.length >= 8) {
                const left = Math.min(boxModel.model.content[0], boxModel.model.content[2], boxModel.model.content[4], boxModel.model.content[6]);
                const top = Math.min(boxModel.model.content[1], boxModel.model.content[3], boxModel.model.content[5], boxModel.model.content[7]);
                const right = Math.max(boxModel.model.content[0], boxModel.model.content[2], boxModel.model.content[4], boxModel.model.content[6]);
                const bottom = Math.max(boxModel.model.content[1], boxModel.model.content[3], boxModel.model.content[5], boxModel.model.content[7]);

                const width = right - left;
                const height = bottom - top;

                // 检查元素尺寸
                if (width <= 0 || height <= 0) {
                    return false;
                }

                // 如果所有检查都通过，认为元素可见
                return true;
            }

            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    /**
     * 等待页面加载完成
     * @param timeoutMs - 超时时间（毫秒）
     * @param startTime - 开始时间
     * @returns 指令执行结果
     */
    private async WaitForPageLoad(timeoutMs: number, startTime: number): Promise<WaitPageLoadResult> {
        const checkInterval = 500; // 每 500ms 检查一次

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 使用 CDP 检查页面加载状态
                const result = await this.ExecuteCDPCommand('Runtime.evaluate', {
                    expression: 'document.readyState',
                    returnByValue: true
                });

                const readyState = result?.result?.value || '';
                if (typeof readyState === 'string' && readyState === 'complete') {
                    OutputLogToFile(`[WaitInstruction] Page load completed`, { level: LogLevel.INFO });
                    return {
                        tabId: this.tabId,
                        instructionID: this.instructionID,
                        success: true,
                        data: { readyState: readyState },
                        duration: Date.now() - startTime
                    } as WaitPageLoadResult;
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking page load state: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return {
            tabId: this.tabId,
            instructionID: this.instructionID,
            success: false,
            error: 'Timeout waiting for page to load',
            duration: Date.now() - startTime
        } as WaitPageLoadResult;
    }

    /**
     * 获取元素对象
     * @returns 元素对象，如果不存在则返回 undefined
     */
    private async GetElement(): Promise<IElement | undefined> {
        // 优先使用 elementName 从 elementManager 获取
        if (this.params.elementName) {
            const element = elementManager.GetElementByName(this.tabId, this.params.elementName);
            if (element) {
                return element;
            }
        }

        // 如果 elementName 不存在或找不到，使用 element 数据创建新元素
        if (this.params.element) {
            return new ElementClass({
                ...this.params.element,
                tabId: this.tabId
            });
        }

        return undefined;
    }
}