import { LogLevel, OutputLogToFile } from '../../../utils';
import { findElementByTag } from './element';

/**
 * 业务逻辑：获取 DOM 元素的属性值，支持多种属性类型（标准 HTML 属性、计算样式、图片 URL 等），
 * 用于提取元素的各类信息以满足自动化操作需求
 * 
 * 实现方式：根据属性名称判断属性类型，使用不同的方法获取：
 * - 图片相关属性：优先从 <img> 标签的 src 获取，其次从计算样式的 background-image 获取
 * - 计算样式属性：使用 window.getComputedStyle() 获取，支持连字符和驼峰命名
 * - 标准 HTML 属性：使用 element.getAttribute()，如果为 null 则尝试直接访问元素属性
 * 
 * 注意事项：
 * - 图片属性支持多种数据源：src、data-src、data-lazy-src、background-image
 * - 计算样式属性需要处理连字符和驼峰命名的转换
 * - 某些属性（如 value、checked）需要通过直接访问元素属性获取
 * - 所有错误都会被捕获并记录警告日志，返回 null
 * 
 * @param element - DOM 元素
 * @param attribute - 属性名称
 * @returns 属性值，如果属性不存在或获取失败则返回 null 或 undefined
 * 
 * 相关代码：src/entrypoints/content/utils/element.ts - findElementByTag()
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
