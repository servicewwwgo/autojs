import { ContentScriptMessageType } from '../../../types';
import { findElementByTag, isVisible, getElementAttribute } from '../utils';

/**
 * 业务逻辑：滚动页面使指定元素进入视口，用于确保元素可见以便进行后续操作
 * 
 * 实现方式：根据消息参数中的 tag 查找元素，使用 Element.scrollIntoView() 方法滚动到元素位置，
 * 使用平滑滚动动画并将元素居中显示
 * 
 * 注意事项：
 * - 元素不存在时返回错误响应
 * - 滚动使用平滑动画，提升用户体验
 * - block: 'center' 和 inline: 'center' 确保元素在视口中居中显示
 * 
 * 相关代码：src/entrypoints/content/utils/element.ts - findElementByTag()
 */
export async function scrollIntoView(
    message: ContentScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const tag = message.params.tag;
    const element = findElementByTag(tag);

    if (!element) {
        sendResponse({ success: false, error: 'Element not found' });
        return;
    }

    // 滚动到元素位置，使用平滑滚动并居中显示
    element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
    });

    sendResponse({ success: true });
}

/**
 * 业务逻辑：获取指定元素的属性值，支持标准 HTML 属性、计算样式属性和特殊属性（如图片 URL）
 * 
 * 实现方式：根据消息参数中的 tag 和 attribute 查找元素，调用 getElementAttribute() 工具函数获取属性值
 * 
 * 注意事项：
 * - 元素不存在时返回错误响应
 * - attribute 参数默认为 'text'，如果未指定则获取文本内容
 * - 支持的属性类型包括：标准 HTML 属性、CSS 计算样式、图片相关属性（src、background-image）
 * 
 * 相关代码：src/entrypoints/content/utils/element.ts - findElementByTag(),
 * src/entrypoints/content/utils/attribute.ts - getElementAttribute()
 */
export async function getAttribute(
    message: ContentScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const tag = message.params.tag;
    const attribute = message.params.attribute || 'text';
    const element = findElementByTag(tag);

    if (!element) {
        sendResponse({ success: false, error: 'Element not found' });
        return;
    }

    const attributeValue = getElementAttribute(element, attribute);

    sendResponse({
        success: attributeValue !== null && attributeValue !== undefined,
        data: attributeValue ?? undefined
    });
}

/**
 * 业务逻辑：获取指定元素的文本内容，用于提取页面上的文本信息
 * 
 * 实现方式：根据消息参数中的 tag 查找元素，使用 textContent 或 innerText 属性获取文本内容
 * 
 * 注意事项：
 * - 元素不存在时返回错误响应
 * - 优先使用 textContent（包含隐藏元素文本），如果为空则使用 innerText（仅可见文本）
 * - 文本内容可能为空字符串，需要调用方处理
 * 
 * 相关代码：src/entrypoints/content/utils/element.ts - findElementByTag()
 */
export async function getText(
    message: ContentScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const tag = message.params.tag;
    const element = findElementByTag(tag);

    if (!element) {
        sendResponse({ success: false, error: 'Element not found' });
        return;
    }

    const text = element.textContent || element.innerText || '';
    sendResponse({ success: text !== undefined, data: text ?? undefined });
}

/**
 * 业务逻辑：检查指定元素是否在页面上可见，用于判断元素是否可以被用户交互
 * 
 * 实现方式：根据消息参数中的 tag 查找元素，调用 isVisible() 工具函数进行全面的可见性检查
 * 
 * 注意事项：
 * - 元素不存在时返回错误响应
 * - 可见性检查包括：display、visibility、opacity、父元素可见性、尺寸、位置等多个维度
 * - 返回的 success 字段与 visible 值一致，true 表示可见，false 表示不可见
 * 
 * 相关代码：src/entrypoints/content/utils/element.ts - findElementByTag(),
 * src/entrypoints/content/utils/visibility.ts - isVisible()
 */
export async function checkElementVisible(
    message: ContentScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    const tag = message.params.tag;
    const element = findElementByTag(tag);

    if (!element) {
        sendResponse({ success: false, error: 'Element not found' });
        return;
    }

    const visible = isVisible(element);
    sendResponse({ success: visible, data: visible });
}

/**
 * 业务逻辑：在页面上下文中执行 JavaScript 脚本，用于执行自定义的页面操作逻辑
 * 
 * 实现方式：当前未实现，返回未实现错误
 * 
 * 注意事项：此功能计划实现但当前暂不可用，需要安全考虑避免执行恶意代码
 * 
 * 相关代码：待实现
 */
export async function executeScript(
    message: ContentScriptMessageType,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
): Promise<void> {
    // TODO: 实现脚本执行功能
    // const script = message.params.script;
    // const result = await eval(script);
    // sendResponse({ success: result !== undefined, data: result ?? undefined });
    sendResponse({ success: false, error: 'Not implemented' });
}
