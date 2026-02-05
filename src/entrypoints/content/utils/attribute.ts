import { LogLevel, OutputLogToFile } from '../../../utils';
import { findElementByTag } from './element';

/**
 * 获取元素的属性
 * @param element - DOM元素
 * @param attribute - 属性名称
 * @returns 属性值
 * @remarks
 * 支持的属性类型：
 * 1. 标准 HTML 属性：使用 element.getAttribute() 获取
 * 2. 图片相关：
 *    - 'src' 或 'image' - 获取 <img> 标签的 src 属性
 *    - 'background-image' 或 'backgroundImage' - 从计算样式中获取背景图片 URL
 *    - 'image' - 智能检测：优先获取 src，如果没有则获取 background-image
 * 3. 计算样式属性：使用 window.getComputedStyle() 获取
 */
export function getElementAttribute(element: HTMLElement, attribute: string): string | null | undefined {
    let attributeValue: string | null | undefined = undefined;

    // 特殊处理：图片获取
    if (attribute === 'image' || attribute === 'src' || attribute === 'background-image' || attribute === 'backgroundImage') {
        // 1. 如果是 <img> 标签，优先获取 src 属性
        if (element.tagName === 'IMG' || element.tagName === 'img') {
            const imgElement = element as HTMLImageElement;
            // 尝试多种方式获取图片 URL
            attributeValue = imgElement.src ||
                imgElement.getAttribute('src') ||
                imgElement.getAttribute('data-src') ||
                imgElement.getAttribute('data-lazy-src') ||
                null;
        }

        // 2. 如果还没有获取到，尝试从背景图片中获取
        if (!attributeValue && (attribute === 'image' || attribute === 'background-image' || attribute === 'backgroundImage')) {
            try {
                const style = window.getComputedStyle(element);
                const backgroundImage = style.backgroundImage || style.getPropertyValue('background-image');

                if (backgroundImage && backgroundImage !== 'none') {
                    // 从 backgroundImage 中提取 URL
                    // 格式可能是: url("http://example.com/image.jpg") 或 url('http://example.com/image.jpg') 或 url(http://example.com/image.jpg)
                    const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (urlMatch && urlMatch[1]) {
                        attributeValue = urlMatch[1];
                    } else {
                        attributeValue = backgroundImage;
                    }
                }
            } catch (error) {
                OutputLogToFile(`[Content] Failed to get background-image: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }
        }

        // 3. 如果是指定获取 src 但元素不是 img，返回 null
        if (!attributeValue && attribute === 'src' && element.tagName !== 'IMG' && element.tagName !== 'img') {
            attributeValue = null;
        }
    }
    // 特殊处理：计算样式属性（CSS 属性）
    else if (attribute.includes('-') || ['display', 'visibility', 'opacity', 'color', 'backgroundColor', 'width', 'height', 'fontSize'].includes(attribute)) {
        try {
            const style = window.getComputedStyle(element);
            // 尝试直接获取属性
            attributeValue = (style as any)[attribute] || style.getPropertyValue(attribute) || null;

            // 如果还是没有，尝试驼峰命名
            if (!attributeValue) {
                const camelCase = attribute.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
                attributeValue = (style as any)[camelCase] || null;
            }
        } catch (error) {
            OutputLogToFile(`[Content] Failed to get computed style property "${attribute}": ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            attributeValue = null;
        }
    }
    // 标准 HTML 属性
    else {
        attributeValue = element.getAttribute(attribute);

        // 如果 getAttribute 返回 null，尝试直接访问元素属性（如 value, checked 等）
        if (attributeValue === null) {
            const directValue = (element as any)[attribute];
            if (directValue !== undefined) {
                attributeValue = String(directValue);
            }
        }
    }

    return attributeValue;
}
