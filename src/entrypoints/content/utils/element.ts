import { ElementTag } from '../../../consts';
import { EscapeCSSSelector, LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 查找元素（使用 DOM API）
 * @param selector - 选择器字符串
 * @param selectorType - 选择器类型
 * @returns 找到的 DOM 元素节点，如果未找到则返回 undefined
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
 * 查找元素（使用標記）
 * @param tag - 標記
 * @returns 找到的 DOM 元素节点，如果未找到则返回 undefined
 */
export function findElementByTag(tag: any): HTMLElement | undefined {
    if (!tag || typeof tag !== 'string') {
        return undefined;
    }
    const escapedTag = EscapeCSSSelector(tag);
    return findElement(`[${ElementTag}="${escapedTag}"]`, 'css');
}
