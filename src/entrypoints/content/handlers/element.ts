import { ContentScriptMessageType } from '../../../types';
import { findElementByTag, isVisible, getElementAttribute } from '../utils';

/**
 * 滚动到元素位置
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
 * 获取元素的屬性
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
 * 获取元素文本
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
 * 检查元素是否可见
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
 * 执行脚本
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
