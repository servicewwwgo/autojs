import { defineContentScript } from 'wxt/utils/define-content-script';
import { BackgroundScriptMessageType, ContentScriptMessageType, ElementTag } from '../types';
import { SendMessageToBackgroundScript, EscapeCSSSelector } from '../utils';

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

    console.log('navigator.webdriver property hidden');
  } catch (error) {
    console.warn('Failed to hide navigator.webdriver property:', error);
  }
}

/**
 * 执行脚本
 * @param script - 脚本字符串
 * @returns 执行结果
 */
function ExecuteScript(script: string): any {
  /*
  return eval(script);
  */
}

/**
 * 查找元素（使用 DOM API）
 * @param selector - 选择器字符串
 * @param selectorType - 选择器类型
 * @returns 找到的 DOM 元素节点，如果未找到则返回 null
 */
function FindElement(selector: string, selectorType: 'css' | 'xpath' | 'id'): HTMLElement | undefined {
  try {
    let element: HTMLElement | undefined;

    switch (selectorType) {
      case 'css':
        element = document.querySelector(selector) as HTMLElement;
        break;

      case 'xpath':
        {
          const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const node = result.singleNodeValue;
          element = node ? (node as HTMLElement) : undefined;
        }
        break;

      case 'id':
        element = document.getElementById(selector) as HTMLElement;
        break;

      default:
        console.error(`Unsupported selector type: ${selectorType}`);
        return undefined;
    }

    return element;
  } catch (error) {
    console.error(`Error finding element with selector "${selector}" (type: ${selectorType}):`, error);
    return undefined;
  }
}

/**
 * 使用標記查找元素(由 background script 設置的標記)
 * @param tag - 標記
 * @returns 找到的 DOM 元素节点，如果未找到则返回 undefined
 */
function FindElementByTag(tag: string): HTMLElement | undefined {
  if (!tag || typeof tag !== 'string') {
    console.error('Invalid tag parameter');
    return undefined;
  }

  // 转义 tag 中的特殊字符，防止 CSS 选择器注入
  const escapedTag = EscapeCSSSelector(tag);
  const element: HTMLElement | undefined = FindElement(`[${ElementTag}="${escapedTag}"]`, 'css');
  return element;
}

/**
 * 滚动到元素位置
 * @param tag - 元素标记（由 background script 设置的标记）
 * @returns 是否成功滚动到元素位置
 */
function ScrollIntoView(tag: string): boolean {
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (element === undefined) {
    console.error(`Element not found with tag: ${tag}`);
    return false;
  }

  try {
    // 滚动到元素位置，使用平滑滚动并居中显示
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
    return true;
  } catch (error) {
    console.error(`Error scrolling to element with tag "${tag}":`, error);
    return false;
  }
}

/**
 * 獲取元素的屬性
 * @param tag - 元素标记（由 background script 设置的标记）
 * @param attribute - 屬性名稱
 * @returns 屬性值
 */
function GetAttribute(tag: string, attribute: string): string | undefined {
  const element: HTMLElement | undefined = FindElementByTag(tag);
  return element?.getAttribute(attribute) ?? undefined;
}

/**
 * 获取元素文本
 * @param tag - 元素标记（由 background script 设置的标记）
 * @returns 元素文本
 */
function GetText(tag: string): string | undefined {
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (!element) {
    return undefined;
  }

  try {
    // 根据元素类型获取文本内容
    if (element instanceof HTMLInputElement) {
      return element.value || '';
    } else if (element instanceof HTMLTextAreaElement) {
      return element.value || '';
    } else if (element instanceof HTMLSelectElement) {
      // 对于 select 元素，返回选中的 option 的文本
      const selectedOption = element.options[element.selectedIndex];
      return selectedOption ? (selectedOption.textContent || selectedOption.value || '') : '';
    } else if (element instanceof HTMLButtonElement) {
      // button 元素的 value 属性可能不存在，优先使用 textContent
      return element.textContent || element.value || element.innerText || '';
    } else if (element instanceof HTMLAnchorElement) {
      return element.textContent || element.innerText || '';
    } else if (element instanceof HTMLImageElement) {
      // 对于图片，优先返回 alt 文本，如果没有则返回 src
      return element.alt || element.src || '';
    } else if (element instanceof HTMLVideoElement) {
      // 对于视频，返回文本内容或 poster
      return element.textContent || element.poster || '';
    } else if (element instanceof HTMLAudioElement) {
      // 对于音频，返回文本内容或 src
      return element.textContent || element.src || '';
    } else {
      // 对于其他元素，优先使用 textContent，如果没有则使用 innerText
      return element.textContent || element.innerText || '';
    }
  } catch (error) {
    console.error(`Error getting text for element with tag "${tag}":`, error);
    return undefined;
  }
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
      console.warn('Cannot get computed style for parent element:', error);
    }

    parent = parent.parentElement;
  }

  return true;
}

/**
 * 判断元素是否可见（采用权威且全面的检查方法）
 * @param tag - 元素标记（由 background script 设置的标记）
 * @returns 是否可见
 */
function IsVisible(tag: string): boolean {
  const element: HTMLElement | undefined = FindElementByTag(tag);

  if (!element) {
    return false;
  }

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
    console.warn('Cannot get computed style for element:', error);
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
    console.warn('Cannot get bounding rect for element:', error);
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
 * 处理来自popup的消息
 * @param message - 消息
 * @param sender - 发送者
 * @param sendResponse - 发送响应
 * @returns 处理结果
 */
async function handleMessage(message: ContentScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
  console.log('Received message:', message);

  try {
    switch (message.type) {
      case 'execute_script':
        // 执行脚本
        const executeScriptResult = ExecuteScript(
          message.params.script
        );
        sendResponse({ success: executeScriptResult !== undefined, data: executeScriptResult });
        break;

      case 'find_element':
        // 查找元素（作为 CDP 查找失败时的回退方案）
        if (!message.params?.selector || !message.params?.selectorType) {
          sendResponse({ success: false, error: 'Missing selector or selectorType parameter' });
          break;
        }
        const element = FindElement(
          message.params.selector,
          message.params.selectorType
        );
        sendResponse({ success: element !== undefined, data: element });
        break;

      case 'scroll_into_view':
        // 滚动到元素位置
        if (!message.params?.tag) {
          sendResponse({ success: false, error: 'Missing tag parameter' });
          break;
        }
        const scrollResult = ScrollIntoView(message.params.tag);
        sendResponse({ success: scrollResult, data: scrollResult });
        break;

      case 'get_attribute':
        // 获取元素属性
        if (!message.params?.tag || !message.params?.attribute) {
          sendResponse({ success: false, error: 'Missing tag or attribute parameter' });
          break;
        }
        const attributeValue = GetAttribute(
          message.params.tag,
          message.params.attribute
        );
        sendResponse({ success: attributeValue !== undefined, data: attributeValue });
        break;

      case 'get_text':
        // 获取元素文本
        if (!message.params?.tag) {
          sendResponse({ success: false, error: 'Missing tag parameter' });
          break;
        }
        const text = GetText(message.params.tag);
        sendResponse({ success: text !== undefined, data: text });
        break;

      case 'is_visible':
        // 判断元素是否可见
        if (!message.params?.tag) {
          sendResponse({ success: false, error: 'Missing tag parameter' });
          break;
        }
        const isVisible = IsVisible(message.params.tag);
        sendResponse({ success: isVisible, data: isVisible });
        break;

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
        break;
    }
  } catch (error) {
    sendResponse({ success: false, error: `Failed to handle message: ${error instanceof Error ? error.message : String(error)}` });
  }
}

/**
 * 通知 background script 内容脚本已加载完成
 */
async function notifyContentScriptReady() {
  const response = await SendMessageToBackgroundScript({ type: 'contentScriptReady', params: { url: window.location.href } } as BackgroundScriptMessageType);

  if (response.success) {
    console.log('Notified background script successfully');
  } else {
    console.error('Failed to notify background script:', response.error);
  }
}

/**
 * Content script入口
 * 配置 runAt: 'document_start' 确保内容脚本在 document 加载前被加载
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    console.log('Content script loaded (document_start)');

    // 立即隐藏 navigator.webdriver 属性（在页面脚本运行之前）
    hideWebdriver();

    // 监听来自popup和background script的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message as ContentScriptMessageType, sender, sendResponse).catch(console.error);
    });

    // 等待 DOM 加载完成后再通知 background script
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        notifyContentScriptReady().catch(console.error);
      });
    } else {
      // DOM 已经加载完成
      notifyContentScriptReady().catch(console.error);
    }
  }
});
