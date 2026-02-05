import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 业务逻辑：递归检查元素的父元素链是否可见，因为父元素隐藏会导致子元素不可见
 * 
 * 实现方式：从元素的直接父元素开始，向上遍历父元素链直到 document.body 或 document.documentElement，
 * 检查每个父元素的 display、visibility 和 opacity 属性
 * 
 * 注意事项：
 * - 如果任何父元素的 display 为 none、visibility 为 hidden/collapse 或 opacity 为 0，返回 false
 * - 在 document_start 阶段可能无法获取计算样式，此时跳过检查继续向上遍历
 * - 遍历到 document.body 或 document.documentElement 时停止
 * 
 * @param element - 要检查的元素
 * @returns 父元素链是否都可见，true 表示所有父元素可见，false 表示至少有一个父元素不可见
 * 
 * 相关代码：src/entrypoints/content/utils/visibility.ts - isVisible()
 */
export function checkParentVisibility(element: HTMLElement): boolean {
    let parent = element.parentElement;

    while (parent && parent !== document.body && parent !== document.documentElement) {
        try {
            const parentStyle = window.getComputedStyle(parent);

            // 检查父元素的 display
            if (parentStyle.display === 'none') {
                return false;
            }

            // 检查父元素的 visibility
            if (parentStyle.visibility === 'hidden' || parentStyle.visibility === 'collapse') {
                return false;
            }

            // 检查父元素的 opacity
            const parentOpacity = parseFloat(parentStyle.opacity);
            if (!isNaN(parentOpacity) && parentOpacity <= 0) {
                return false;
            }
        } catch (error) {
            // 如果无法获取计算样式（例如在 document_start 阶段），跳过此检查
            OutputLogToFile(`[Content] Cannot get computed style for parent element: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        }

        parent = parent.parentElement;
    }

    return true;
}

/**
 * 业务逻辑：全面检查元素是否在页面上可见，采用多维度检查确保判断准确性，用于判断元素是否可以被用户交互
 * 
 * 实现方式：进行 13 个维度的可见性检查：
 * 1. 检查元素是否已连接到 DOM
 * 2. 获取计算样式（最权威的方法）
 * 3-5. 检查 display、visibility、opacity 属性
 * 6. 检查父元素链的可见性
 * 7. 检查 transform 属性（scale(0) 会使元素不可见）
 * 8. 获取元素的边界框
 * 9. 检查元素是否有有效的尺寸（width > 0 && height > 0）
 * 10. 检查元素是否在视口内
 * 11. 检查 clip 属性（已废弃但为兼容性保留）
 * 12. 检查 clip-path 属性（现代方法）
 * 13. 检查 offsetWidth 和 offsetHeight（辅助检查）
 * 
 * 注意事项：
 * - 所有检查都必须通过，任何一项失败都返回 false
 * - 在 document_start 阶段可能无法获取计算样式，此时返回 false
 * - 视口检查允许 50px 的边距，用于处理部分可见的元素
 * - 内联元素（span 等）的尺寸可能为 0，需要特殊处理
 * 
 * @param element - 要检查的元素
 * @returns 是否可见，true 表示元素完全可见，false 表示元素不可见
 * 
 * 相关代码：src/entrypoints/content/utils/visibility.ts - checkParentVisibility(),
 * src/entrypoints/content/handlers/element.ts - checkElementVisible()
 */
export function isVisible(element: HTMLElement): boolean {
    // 1. 检查元素是否已连接到 DOM
    if (!element.isConnected) {
        return false;
    }

    // 2. 获取计算样式（最权威的方法）
    let style: CSSStyleDeclaration;
    try {
        style = window.getComputedStyle(element);
    } catch (error) {
        // 如果无法获取计算样式（例如在 document_start 阶段），返回 false
        OutputLogToFile(`[Content] Cannot get computed style for element: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        return false;
    }

    // 3. 检查 display 属性
    if (style.display === 'none') {
        return false;
    }

    // 4. 检查 visibility 属性
    if (style.visibility === 'hidden' || style.visibility === 'collapse') {
        return false;
    }

    // 5. 检查 opacity 属性（完全透明视为不可见）
    const opacity = parseFloat(style.opacity);
    if (!isNaN(opacity) && opacity <= 0) {
        return false;
    }

    // 6. 检查父元素链的可见性（重要：父元素隐藏会导致子元素不可见）
    if (!checkParentVisibility(element)) {
        return false;
    }

    // 7. 检查 transform 属性（scale(0) 会使元素不可见）
    const transform = style.transform;
    if (transform && transform !== 'none') {
        // 检查是否包含 scale(0) 或 scaleX(0) 或 scaleY(0)
        if (transform.includes('scale(0') ||
            transform.includes('scaleX(0') ||
            transform.includes('scaleY(0')) {
            return false;
        }
    }

    // 8. 获取元素的边界框（最权威的位置和尺寸信息）
    let rect: DOMRect;
    try {
        rect = element.getBoundingClientRect();
    } catch (error) {
        OutputLogToFile(`[Content] Cannot get bounding rect for element: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
        return false;
    }

    // 9. 检查元素是否有有效的尺寸
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }

    // 10. 检查元素是否在视口内（使用 getBoundingClientRect 的结果）
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    // 检查元素是否完全在视口外（允许一定的边距，因为元素可能部分可见）
    const margin = 50; // 允许 50px 的边距，用于处理部分可见的元素
    const isInViewport = !(
        rect.right < -margin ||
        rect.bottom < -margin ||
        rect.left > viewportWidth + margin ||
        rect.top > viewportHeight + margin
    );

    if (!isInViewport) {
        return false;
    }

    // 11. 检查元素的 clip 属性（如果设置了 clip，可能被裁剪）
    const clip = style.clip;
    if (clip && clip !== 'auto' && clip !== 'none') {
        // clip 属性已废弃，但为了兼容性仍检查
        // 如果 clip 设置为 rect(0px, 0px, 0px, 0px)，元素被完全裁剪
        const clipRect = clip.match(/rect\(([^)]+)\)/);
        if (clipRect) {
            const values = clipRect[1].split(/\s*,\s*/);
            if (values.length === 4) {
                const top = parseFloat(values[0]);
                const right = parseFloat(values[1]);
                const bottom = parseFloat(values[2]);
                const left = parseFloat(values[3]);
                // 如果裁剪区域完全为0，元素不可见
                if (right <= left || bottom <= top) {
                    return false;
                }
            }
        }
    }

    // 12. 检查 clip-path 属性（现代方法）
    const clipPath = style.clipPath;
    if (clipPath && clipPath !== 'none') {
        // 检查各种完全裁剪的情况
        if (clipPath.includes('inset(100%') ||
            clipPath.includes('circle(0') ||
            clipPath.includes('ellipse(0') ||
            clipPath.includes('polygon(0% 0%, 0% 0%, 0% 0%)')) {
            return false;
        }
    }

    // 13. 检查 offsetWidth 和 offsetHeight（辅助检查）
    // 如果 offsetWidth 和 offsetHeight 都为 0，元素可能不可见
    // 但要注意某些元素（如 span）可能天然为 0，所以只作为辅助检查
    if (element.offsetWidth === 0 && element.offsetHeight === 0) {
        // 进一步检查：如果 clientWidth 和 clientHeight 也为 0，更可能是不可见
        if (element.clientWidth === 0 && element.clientHeight === 0) {
            // 但对于某些内联元素，这是正常的，需要检查 display
            if (style.display !== 'inline' && style.display !== 'inline-block' && style.display !== 'inline-flex') {
                return false;
            }
        }
    }

    // 所有检查通过，元素可见
    return true;
}
