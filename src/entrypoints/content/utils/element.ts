import { ElementTag } from '../../../consts';
import { EscapeCSSSelector, LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 业务逻辑：根据选择器和选择器类型查找页面中的 DOM 元素，支持多种选择器类型以满足不同场景需求
 * 
 * 实现方式：根据选择器类型使用不同的 DOM API 查找元素：
 * - css: 使用 document.querySelector()
 * - xpath: 使用 document.evaluate()
 * - id: 使用 document.getElementById()
 * - tag: 使用自定义 ElementTag 属性查找
 * 
 * 注意事项：
 * - 选择器类型不支持时记录错误日志并返回 undefined
 * - tag 类型需要先转义选择器字符串，然后使用 CSS 选择器查找
 * - 所有查找方法都可能返回 null，需要调用方处理未找到的情况
 * 
 * @param selector - 选择器字符串
 * @param selectorType - 选择器类型（css/xpath/id/tag）
 * @returns 找到的 DOM 元素节点，如果未找到则返回 undefined
 * 
 * 相关代码：src/consts/index.ts - ElementTag 常量，src/utils/index.ts - EscapeCSSSelector()
 */
export function findElement(selector: string, selectorType: 'css' | 'xpath' | 'id' | 'tag'): HTMLElement | undefined {
    let element: HTMLElement | undefined;

    switch (selectorType) {
        case 'css':
            {
                element = document.querySelector(selector) as HTMLElement;
                break;
            }
        case 'xpath':
            {
                const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const node = result.singleNodeValue;
                element = node ? (node as HTMLElement) : undefined;
                break;
            }
        case 'id':
            {
                element = document.getElementById(selector) as HTMLElement;
                break;
            }
        case 'tag':
            {
                // tag 类型使用 ElementTag 属性查找元素
                const escapedTag = EscapeCSSSelector(selector);
                element = findElement(`[${ElementTag}="${escapedTag}"]`, 'css');
                break;
            }
        default:
            OutputLogToFile(`[Content] Unsupported selector type: ${selectorType}`, { level: LogLevel.ERROR });
    }

    return element;
}

/**
 * 业务逻辑：根据标记（tag）查找页面中的 DOM 元素，标记是元素的自定义属性值，用于唯一标识元素
 * 
 * 实现方式：将标记转义后构造 CSS 属性选择器，调用 findElement() 方法查找元素
 * 
 * 注意事项：
 * - tag 参数必须是非空字符串，否则返回 undefined
 * - 标记需要转义特殊字符，避免 CSS 选择器注入问题
 * - 元素必须具有 ElementTag 属性且值匹配才能找到
 * 
 * @param tag - 标记字符串，用于标识元素的唯一标识符
 * @returns 找到的 DOM 元素节点，如果未找到则返回 undefined
 * 
 * 相关代码：src/consts/index.ts - ElementTag 常量，src/utils/index.ts - EscapeCSSSelector(),
 * src/entrypoints/content/utils/element.ts - findElement()
 */
export function findElementByTag(tag: any): HTMLElement | undefined {
    if (!tag || typeof tag !== 'string') {
        return undefined;
    }
    const escapedTag = EscapeCSSSelector(tag);
    return findElement(`[${ElementTag}="${escapedTag}"]`, 'css');
}
