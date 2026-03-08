import { ElementTag } from '../consts';
import { ElementClass, elementManager, IElement } from '../managers';
import { ElementData, WaitAttributeContainsResult, WaitElementExistsResult, WaitElementVisibleResult, WaitInstruction, WaitInstructionResult, WaitPageLoadResult, WaitTitleContainsResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：等待特定条件满足后再继续执行，用于处理异步页面操作和动态内容加载，支持等待标题、元素、属性、页面加载等多种等待类型
 *
 * 实现方式：继承自 BaseInstructionClass，根据 waitType 参数调用不同的等待方法，使用轮询机制定期检查条件是否满足
 *
 * 注意事项：
 * - waitType 参数指定等待类型（wait_title_contains、wait_element_exists、wait_element_visible、wait_attribute_contains、wait_page_load）
 * - 根据不同的 waitType，需要提供相应的参数（titleText、element、elementName、attribute、attributeText）
 * - 默认超时时间为 30 秒，可以通过 timeout 属性自定义
 * - 使用轮询机制（每 500ms 检查一次）检查条件是否满足，避免频繁检查导致性能问题
 * - 如果超时，会返回包含超时信息的错误结果，但不会抛出异常
 * - 支持延迟执行（delay 属性）和重试机制（retry 属性）
 *
 * 相关代码：src/types/instruction.ts - WaitInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
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
     * 业务逻辑：执行等待指令，根据 waitType 参数执行相应的等待操作，直到条件满足或超时
     *
     * 实现方式：根据 waitType 参数调用不同的等待方法，使用 Retry() 方法包装以支持重试机制
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 默认超时时间为 30 秒，可以通过 timeout 属性自定义（单位为秒，会转换为毫秒）
     * - 根据 waitType 调用不同的等待方法，如果 waitType 未知会返回错误
     * - 如果等待超时，会返回包含超时信息的错误结果，但不会抛出异常
     * - 返回结果包含等待耗时（duration 字段），用于性能分析
     *
     * 相关代码：src/types/instruction.ts - WaitInstructionResult 联合类型（结果数据结构），WaitForTitleContains()、WaitForElementExists() 等方法（具体等待实现），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
     */
    public async Execute(): Promise<WaitInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: WaitInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

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
                        return { ...defaultResult, error: `Unknown wait type: ${this.params.waitType}` } as WaitInstructionResult;
                }
            } catch (error) {
                return { ...defaultResult, error: error instanceof Error ? error.message : String(error) } as WaitInstructionResult;
            }
        });

        return result;
    }

    /**
     * 业务逻辑：等待页面标题包含指定字符串，用于确认页面是否已加载到目标页面，常用于页面跳转后的验证
     *
     * 实现方式：使用 CDP 的 Page.getTitle 获取页面标题，每 500ms 检查一次，直到标题包含目标文本或超时
     *
     * 注意事项：
     * - titleText 参数为必需，指定要匹配的文本（不区分大小写）
     * - 使用轮询机制（每 500ms 检查一次）检查标题，避免频繁检查
     * - 标题匹配不区分大小写，使用 toLowerCase() 进行比较
     * - 如果检查过程中出错，会记录警告日志但继续检查
     * - 超时后会返回包含超时信息的错误结果
     * - 返回结果包含匹配到的完整标题，用于确认等待成功
     *
     * 相关代码：src/types/instruction.ts - WaitTitleContainsResult 接口（结果数据结构），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
     */
    private async WaitForTitleContains(timeoutMs: number, startTime: number): Promise<WaitTitleContainsResult> {
        let defaultResult: WaitInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

        if (!this.params.titleText) {
            return { ...defaultResult, error: 'titleText parameter is required for wait_title_contains', duration: Date.now() - startTime } as WaitTitleContainsResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次
        const targetText = this.params.titleText.toLowerCase();

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 使用 CDP 获取页面标题
                const result = await this.ExecuteCDPCommand('Page.getTitle');
                const currentTitle = result?.title || '';
                if (typeof currentTitle === 'string' && currentTitle.toLowerCase().includes(targetText)) {
                    OutputLogToFile(`[WaitInstruction] Title contains "${this.params.titleText}"`, { level: LogLevel.INFO });
                    return { ...defaultResult, success: true, data: { title: currentTitle }, duration: Date.now() - startTime } as WaitTitleContainsResult;
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking title: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return { ...defaultResult, error: `Timeout waiting for title to contain "${this.params.titleText}"`, duration: Date.now() - startTime } as WaitTitleContainsResult;
    }

    /**
     * 业务逻辑：等待元素存在于 DOM 中，用于等待动态加载的元素出现，常用于 AJAX 加载或动态渲染的场景
     *
     * 实现方式：使用 ElementClass 的 LocateElement() 方法定位元素，每 500ms 检查一次，直到元素存在或超时
     *
     * 注意事项：
     * - 元素可以通过 elementName（从 ElementManager 获取）或 element（直接创建）指定
     * - 使用轮询机制（每 500ms 检查一次）检查元素是否存在
     * - 如果元素未定位成功，会继续等待，直到定位成功或超时
     * - 定位成功后还需要获取 nodeId，确保元素确实存在于 DOM 中
     * - 如果检查过程中出错，会记录警告日志但继续检查
     * - 超时后会返回包含超时信息的错误结果
     * - 返回结果包含找到的元素名称，用于确认等待成功
     *
     * 相关代码：src/types/instruction.ts - WaitElementExistsResult 接口（结果数据结构），src/managers/ElementManager.ts - ElementClass.LocateElement() 方法（元素定位），GetElement() 方法（获取元素对象）
     */
    private async WaitForElementExists(timeoutMs: number, startTime: number): Promise<WaitElementExistsResult> {
        let defaultResult: WaitInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

        const element = await this.GetElement();
        if (!element) {
            return { ...defaultResult, error: 'Element not found in element manager and element data not provided', duration: Date.now() - startTime } as WaitElementExistsResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次

        while (Date.now() - startTime < timeoutMs) {
            try {
                if (!await element.LocateElement()) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    continue;
                }
                const nodeId = await element.GetNodeId();

                if (!nodeId) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    continue;
                }

                // 元素存在
                OutputLogToFile(`[WaitInstruction] Element "${element.GetName()}" exists in DOM`, { level: LogLevel.INFO });
                return { ...defaultResult, success: true, data: { elementName: element.GetName() }, duration: Date.now() - startTime } as WaitElementExistsResult;
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking element existence: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return { ...defaultResult, error: `Timeout waiting for element "${element.GetName()}" to exist in DOM`, duration: Date.now() - startTime } as WaitElementExistsResult;
    }

    /**
     * 业务逻辑：等待元素存在于 DOM 且可见，用于等待元素不仅出现还要可见（不被隐藏），常用于等待加载动画结束或元素显示
     *
     * 实现方式：先定位元素，然后使用 CheckElementVisible() 方法检查元素是否可见，每 500ms 检查一次，直到元素可见或超时
     *
     * 注意事项：
     * - 元素可以通过 elementName（从 ElementManager 获取）或 element（直接创建）指定
     * - 使用轮询机制（每 500ms 检查一次）检查元素是否可见
     * - 可见性检查包括：display 不为 none、visibility 不为 hidden/collapse、opacity 大于 0、元素尺寸大于 0
     * - 如果元素未定位成功或不可见，会继续等待，直到元素可见或超时
     * - 如果检查过程中出错，会记录警告日志但继续检查
     * - 超时后会返回包含超时信息的错误结果
     * - 返回结果包含可见的元素名称，用于确认等待成功
     *
     * 相关代码：src/types/instruction.ts - WaitElementVisibleResult 接口（结果数据结构），CheckElementVisible() 方法（检查元素可见性），GetElement() 方法（获取元素对象）
     */
    private async WaitForElementVisible(timeoutMs: number, startTime: number): Promise<WaitElementVisibleResult> {
        let defaultResult: WaitInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

        const element = await this.GetElement();
        if (!element) {
            return { ...defaultResult, error: 'Element not found in element manager and element data not provided', duration: Date.now() - startTime } as WaitElementVisibleResult;
        }

        const checkInterval = 500; // 每 500ms 检查一次

        while (Date.now() - startTime < timeoutMs) {
            try {
                // 先尝试获取 nodeId（如果元素已经定位，可以直接获取）
                if (!await element.LocateElement()) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    continue;
                }

                // 获取 nodeId
                const nodeId = await element.GetNodeId();
                if (!nodeId) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    continue;
                }

                // 检查元素是否可见
                const isVisible = await this.CheckElementVisible(nodeId);
                if (isVisible === true) {
                    OutputLogToFile(`[WaitInstruction] Element "${element.GetName()}" is visible`, { level: LogLevel.INFO });
                    return { ...defaultResult, success: true, data: { elementName: element.GetName() }, duration: Date.now() - startTime } as WaitElementVisibleResult;
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking element visibility: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return { ...defaultResult, error: `Timeout waiting for element "${element.GetName()}" to be visible`, duration: Date.now() - startTime } as WaitElementVisibleResult;
    }

    /**
     * 业务逻辑：等待元素的某个属性值包含指定文本，用于等待元素属性值变化（如等待加载状态变为完成），常用于异步操作的状态检查
     *
     * 实现方式：先定位元素，然后获取元素属性值，每 500ms 检查一次，直到属性值包含目标文本或超时
     *
     * 注意事项：
     * - attribute 和 attributeText 参数为必需，指定要检查的属性名和要匹配的文本（不区分大小写）
     * - 元素可以通过 elementName（从 ElementManager 获取）或 element（直接创建）指定
     * - 使用轮询机制（每 500ms 检查一次）检查属性值
     * - 先尝试从 HTML 属性中获取（DOM.getAttributes），如果未找到则使用 Runtime.evaluate 获取 JavaScript 属性
     * - 属性值匹配不区分大小写，使用 toLowerCase() 进行比较
     * - 如果元素未定位成功或属性值不匹配，会继续等待，直到匹配或超时
     * - 如果检查过程中出错，会记录警告日志但继续检查
     * - 超时后会返回包含超时信息的错误结果
     * - 返回结果包含匹配到的元素名称、属性名和属性值，用于确认等待成功
     *
     * 相关代码：src/types/instruction.ts - WaitAttributeContainsResult 接口（结果数据结构），CheckElementVisible() 方法（检查元素可见性），GetElement() 方法（获取元素对象），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
     */
    private async WaitForAttributeContains(timeoutMs: number, startTime: number): Promise<WaitAttributeContainsResult> {
        let defaultResult: WaitInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

        if (!this.params.attribute || !this.params.attributeText) {
            return { ...defaultResult, error: 'attribute and attributeText parameters are required for wait_attribute_contains', duration: Date.now() - startTime } as WaitAttributeContainsResult;
        }

        const element = await this.GetElement();
        if (!element) {
            return { ...defaultResult, error: 'Element not found in element manager and element data not provided', duration: Date.now() - startTime } as WaitAttributeContainsResult;
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
                            const elementTag = element.GetTag();
                            if (elementTag) {
                                const attrResult = await this.ExecuteCDPCommand('Runtime.evaluate', {
                                    expression: `(function() {
                                        const node = document.querySelector('[${ElementTag}=${JSON.stringify(elementTag)}]');
                                        if (node) {
                                          return node.getAttribute(${JSON.stringify(this.params.attribute)}) || node[${JSON.stringify(this.params.attribute)}] || null;
                                        }
                                        return null;
                                      })()`,
                                    returnByValue: true,
                                    timeout: this.timeout ? this.timeout * 1000 : undefined // 将秒转换为毫秒
                                });

                                attributeValue = attrResult?.result?.value ?? undefined;
                            }
                        } catch (error) {
                            // 忽略错误，继续检查
                        }
                    }

                    // 检查属性值是否包含目标文本
                    if (attributeValue && typeof attributeValue === 'string' && attributeValue.toLowerCase().includes(targetText)) {
                        OutputLogToFile(`[WaitInstruction] Attribute "${this.params.attribute}" contains "${this.params.attributeText}"`, { level: LogLevel.INFO });
                        return { ...defaultResult, success: true, data: { elementName: element.GetName(), attribute: this.params.attribute, attributeValue: attributeValue }, duration: Date.now() - startTime } as WaitAttributeContainsResult;
                    }
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking attribute: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return { ...defaultResult, error: `Timeout waiting for attribute "${this.params.attribute}" to contain "${this.params.attributeText}"`, duration: Date.now() - startTime } as WaitAttributeContainsResult;
    }

    /**
     * 业务逻辑：检查元素是否可见，通过检查 CSS 样式和元素尺寸判断元素是否真正可见，用于等待元素显示的场景
     *
     * 实现方式：使用 CDP 的 CSS.getComputedStyleForNode 获取计算样式，检查 display、visibility、opacity，然后使用 DOM.getBoxModel 检查元素尺寸
     *
     * 注意事项：
     * - 检查 display 属性，如果为 'none' 则不可见
     * - 检查 visibility 属性，如果为 'hidden' 或 'collapse' 则不可见
     * - 检查 opacity 属性，如果小于等于 0 则不可见
     * - 检查元素尺寸，如果宽度或高度小于等于 0 则不可见
     * - 如果所有检查都通过，返回 true（可见）
     * - 如果检查过程中出错，返回 undefined（无法确定）
     * - 此方法用于 WaitForElementVisible() 方法中，判断元素是否真正可见
     *
     * 相关代码：WaitForElementVisible() 方法（使用此方法检查可见性），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
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
     * 业务逻辑：等待页面加载完成，通过检查 document.readyState 判断页面是否已完全加载，用于确保页面资源已加载完成
     *
     * 实现方式：使用 CDP 的 Runtime.evaluate 执行 document.readyState，每 500ms 检查一次，直到 readyState 为 'complete' 或超时
     *
     * 注意事项：
     * - 使用轮询机制（每 500ms 检查一次）检查页面加载状态
     * - document.readyState 可能的值：'loading'（加载中）、'interactive'（DOM 已加载）、'complete'（完全加载）
     * - 只有当 readyState 为 'complete' 时才认为页面加载完成
     * - 如果检查过程中出错，会记录警告日志但继续检查
     * - 超时后会返回包含超时信息的错误结果
     * - 返回结果包含页面的 readyState 值，用于确认等待成功
     *
     * 相关代码：src/types/instruction.ts - WaitPageLoadResult 接口（结果数据结构），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
     */
    private async WaitForPageLoad(timeoutMs: number, startTime: number): Promise<WaitPageLoadResult> {
        let defaultResult: WaitInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

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
                    return { ...defaultResult, success: true, data: { readyState: readyState }, duration: Date.now() - startTime } as WaitPageLoadResult;
                }
            } catch (error) {
                OutputLogToFile(`[WaitInstruction] Error checking page load state: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            // 等待一段时间后再次检查
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return { ...defaultResult, error: 'Timeout waiting for page to load', duration: Date.now() - startTime } as WaitPageLoadResult;
    }

    /**
     * 业务逻辑：获取元素对象，优先从 ElementManager 获取，如果不存在则根据 element 数据创建新元素，用于统一元素获取逻辑
     *
     * 实现方式：优先使用 elementName 从 ElementManager 获取元素，如果不存在或未指定 elementName，则使用 element 数据创建新的 ElementClass 实例
     *
     * 注意事项：
     * - 优先使用 elementName 从 ElementManager 获取元素（如果元素已定位并保存）
     * - 如果 elementName 不存在或找不到元素，使用 element 数据创建新元素
     * - 如果 elementName 和 element 都不存在，返回 undefined
     * - 此方法用于统一元素获取逻辑，避免在多个等待方法中重复代码
     *
     * 相关代码：src/managers/ElementManager.ts - ElementManager.GetElementByName() 方法（获取元素），ElementClass 类（创建元素实例），WaitForElementExists()、WaitForElementVisible() 等方法（使用此方法获取元素）
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