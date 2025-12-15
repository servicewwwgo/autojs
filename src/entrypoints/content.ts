import { defineContentScript } from 'wxt/utils/define-content-script';
import { ElementTag } from '../consts';
import { BackgroundScriptMessageType, ContentScriptMessageType } from '../types';
import { SendMessageToBackgroundScript, EscapeCSSSelector, OutputLogToFile, LogLevel } from '../utils';

/**
 * 隐藏 navigator.webdriver 属性
 * 用于防止网站检测到自动化工具
 * 
 * 注意：由于 webdriver 属性可能是只读的，我们使用多种方法来尝试隐藏它
 */
function hideWebdriver(): void {
  try {
    // 方法1: 使用 Object.defineProperty 重新定义 webdriver 属性为 undefined
    // 这是最常用的方法，可以覆盖原有的只读属性
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
      enumerable: true
    });

    OutputLogToFile('[Content] navigator.webdriver property hidden', { level: LogLevel.INFO });
  } catch (error) {
    OutputLogToFile(`[Content] Failed to hide navigator.webdriver property: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
  }
}

/**
 * 查找元素（使用 DOM API）
 * @param selector - 选择器字符串
 * @param selectorType - 选择器类型
 * @returns 找到的 DOM 元素节点，如果未找到则返回 null
 */
function FindElement(selector: string, selectorType: 'css' | 'xpath' | 'id'): HTMLElement | undefined {

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
function FindElementByTag(tag: any): HTMLElement | undefined {
  if (!tag || typeof tag !== 'string') {
    return undefined;
  }
  const escapedTag = EscapeCSSSelector(tag);
  return FindElement(`[${ElementTag}="${escapedTag}"]`, 'css');
}

/**
 * 执行脚本
 * @param message - 消息
 * @param sender - 发送者
 * @param sendResponse - 发送响应
 */
async function ExecuteScript(message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
  /*
  const script = message.params.script;
  const result = await eval(script);
  sendResponse({ success: result !== undefined, data: result ?? undefined });
  */
}

/**
 * 滚动到元素位置
 * @param message - 消息
 * @param sender - 发送者
 * @param sendResponse - 发送响应
 */
async function ScrollIntoView(message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
  const tag = message.params.tag;
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (!element) {
    sendResponse({ success: false, error: 'Element not found' });
    return;
  }

  // 滚动到元素位置，使用平滑滚动并居中显示
  element?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center'
  });

  sendResponse({ success: true });
}

/**
 * 獲取元素的屬性
 * @param message - 消息
 * @param sender - 发送者
 * @param sendResponse - 发送响应
 * @remarks
 * 支持的属性类型：
 * 1. 标准 HTML 属性：使用 element.getAttribute() 获取
 * 2. 图片相关：
 *    - 'src' 或 'image' - 获取 <img> 标签的 src 属性
 *    - 'background-image' 或 'backgroundImage' - 从计算样式中获取背景图片 URL
 *    - 'image' - 智能检测：优先获取 src，如果没有则获取 background-image
 * 3. 计算样式属性：使用 window.getComputedStyle() 获取
 */
async function GetAttribute(message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
  const tag = message.params.tag;
  const attribute = message.params.attribute || 'text';
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (!element) {
    sendResponse({ success: false, error: 'Element not found' });
    return;
  }

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

  sendResponse({
    success: attributeValue !== null && attributeValue !== undefined,
    data: attributeValue ?? undefined
  });
}

/**
 * 获取元素文本
 * @param message - 消息
 * @param sender - 发送者
 * @param sendResponse - 发送响应
 */
async function GetText(message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
  const tag = message.params.tag;
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (!element) {
    sendResponse({ success: false, error: 'Element not found' });
    return;
  }

  const text = element.textContent || element.innerText || '';
  sendResponse({ success: text !== undefined, data: text ?? undefined });
}

/**
 * 检查父元素链是否可见（递归检查）
 * @param element - 要检查的元素
 * @returns 父元素链是否都可见
 */
function checkParentVisibility(element: HTMLElement): boolean {
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
 * 判断元素是否可见（采用权威且全面的检查方法）
 * @param element - 元素
 * @returns 是否可见
 */
function IsVisible(element: HTMLElement): boolean {

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
  if (isNaN(opacity) || opacity <= 0) {
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

/**
 * 检查元素是否可见
 * @param message - 消息
 * @param sender - 发送者
 * @param sendResponse - 发送响应
 */
async function CheckElementVisible(message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<void> {
  const tag = message.params.tag;
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (!element) {
    sendResponse({ success: false, error: 'Element not found' });
    return;
  }

  const isVisible = IsVisible(element);
  sendResponse({ success: isVisible, data: isVisible });
}

/**
 * Content script入口
 * 配置 runAt: 'document_start' 确保内容脚本在 document 加载前被加载
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    OutputLogToFile('[Content] Content script loaded (document_start)', { level: LogLevel.INFO });

    // 立即隐藏 navigator.webdriver 属性（在页面脚本运行之前）
    hideWebdriver();

    let mapTypeToFunction: { [key: string]: (message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => Promise<void> } = {
      'scroll_into_view': ScrollIntoView,
      'get_attribute': GetAttribute,
      'get_text': GetText,
      'is_visible': CheckElementVisible,
      'execute_script': ExecuteScript
    };

    // 监听来自popup和background script的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const handler = mapTypeToFunction[message.type as keyof typeof mapTypeToFunction];

      if (handler) {
        handler(message, sender, sendResponse).catch((error) => sendResponse({ success: false, error: `Failed to handle message: ${error instanceof Error ? error.message : String(error)}` }));
      } else {
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      }
    });
  }
});
