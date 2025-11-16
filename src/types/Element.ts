/**
 * 元素对象成员
 */
export interface ElementMember {
  /** DOM对象，用于表示具体的目标元素 */
  dom?: HTMLElement;
  /** 名称 */
  name: string;
  /** 描述，便于日志记录和调试 */
  description: string;
  /** 文本，用于表示元素中的文本内容 */
  text: string;
  /** 选择器表达式 */
  selector: string;
  /** 选择器类型 (css, xpath, id) */
  selectorType: 'css' | 'xpath' | 'id';
  /** 父元素名称 */
  parentName?: string;
  /** 子元素名称列表 */
  childrenNames?: string[];
  /** 关联元素名称列表 */
  relatedNames?: string[];
}

/**
 * 元素对象 - 用来管理需要操作的页面元素
 */
export interface ElementObject extends ElementMember {
  /** 验证方法 */
  Validate(): boolean;
  /** 执行方法 */
  Execute(): boolean;
  /** 對象 */
  ToObject(): object;
  /** 刷新dom */
  RefreshDom(): void;
  /** 获取元素文本 */
  GetText(): string;
  /** 获取元素位置信息 */
  GetBoundingRect(): DOMRect | null;
  /** 检查元素是否可见 */
  IsVisible(): boolean;
  /** 滚动到元素位置 */
  ScrollIntoView(): boolean;
}

/**
 * 元素对象实现类
 */
export class Element implements ElementObject {
  public dom?: HTMLElement;
  public name: string;
  public description: string;
  public text: string;
  public selector: string;
  public selectorType: 'css' | 'xpath' | 'id';
  public parentName?: string;
  public childrenNames?: string[];
  public relatedNames?: string[];

  constructor(config: ElementMember) {

    // 校驗
    if (!config.name) {
      throw new Error('Element name is required');
    }
    if (!config.selector) {
      throw new Error('Element selector is required');
    }
    if (!config.selectorType) {
      throw new Error('Element selector type is required');
    }
    
    if (!['css', 'xpath', 'id'].includes(config.selectorType)) {
      throw new Error('Element selector type is invalid');
    }

    this.dom = undefined;
    this.name = config.name;
    this.description = config.description;
    this.selector = config.selector;
    this.selectorType = config.selectorType;
    this.parentName = config.parentName;
    this.childrenNames = config.childrenNames;
    this.relatedNames = config.relatedNames;
    this.text = '';
  }

  /**
   * 查找DOM元素
   */
  private FindElement(): boolean {
    try {
      switch (this.selectorType) {
        case 'css':
          this.dom = document.querySelector(this.selector) as HTMLElement;
          break;
        case 'xpath':
          const result = document.evaluate(
            this.selector,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          const node = result.singleNodeValue;
          this.dom = node ? (node as HTMLElement) : undefined;
          break;
        case 'id':
          this.dom = document.getElementById(this.selector) as HTMLElement;
          break;
        default:
          console.error(`Unsupported selector type: ${this.selectorType} for element "${this.name}"`);
          return false;
      }
    } catch (error) {
      console.error(`Error finding element "${this.name}" with selector "${this.selector}":`, error);
      this.dom = undefined;
      return false;
    }

    // 检查是否找到元素（null 或 undefined 都表示未找到）
    return this.dom != null;
  }

  /**
   * 验证元素是否存在且可操作
   */
  Validate(): boolean {
    // 如果dom不存在，尝试查找
    if (!this.dom) {
      this.FindElement();
    }

    // 检查是否找到元素
    if (!this.dom) {
      console.error(`Element "${this.name}" not found with selector: ${this.selector}`);
      return false;
    }

    return true;
  }

  /**
   * 對象
   */
  ToObject(): object {
    return {
      name: this.name,
      description: this.description,
      text: this.text,
      selector: this.selector,
      selectorType: this.selectorType,
      parentName: this.parentName,
      childrenNames: this.childrenNames,
      relatedNames: this.relatedNames,
    };
  }

  /**
   * 执行元素操作（基础方法，子类可重写）
   */
  Execute(): boolean {
    return this.FindElement();
  }

  /**
   * 获取元素文本
   */
  GetText(): string {
    // 如果dom不存在，尝试查找
    if (!this.dom) {
      this.FindElement();
    }

    // 如果仍然不存在，返回空字符串
    if (!this.dom) {
      console.error(`Element "${this.name}" not found, selector: ${this.selector}`);
      return '';
    }

    try {
      // 优先使用 innerText（会忽略隐藏元素），否则使用 textContent
      this.text = this.dom.innerText || this.dom.textContent || '';
      return this.text;
    } catch (error) {
      console.error(`Error getting text for element "${this.name}":`, error);
      return '';
    }
  }

  /**
   * 获取元素位置信息
   */
  GetBoundingRect(): DOMRect | null {
    // 如果dom不存在，尝试查找
    if (!this.dom) {
      this.FindElement();
    }

    // 如果仍然不存在，返回null
    if (!this.dom) {
      console.error(`Element "${this.name}" not found, selector: ${this.selector}`);
      return null;
    }

    try {
      const rect = this.dom.getBoundingClientRect();
      
      // 对于 input 元素，如果 width 或 height 为 0，使用 offsetWidth/offsetHeight 作为后备
      if ((rect.width === 0 || rect.height === 0) && 
          (this.dom.tagName === 'INPUT' || this.dom.tagName === 'TEXTAREA' || this.dom.tagName === 'SELECT' || this.dom.tagName === 'BUTTON')) {
        const offsetWidth = this.dom.offsetWidth;
        const offsetHeight = this.dom.offsetHeight;
        
        // 如果 offsetWidth/offsetHeight 有值，创建一个修正的 rect
        if (offsetWidth > 0 || offsetHeight > 0) {
          return {
            ...rect,
            width: offsetWidth || rect.width || 1,
            height: offsetHeight || rect.height || 1,
            // 保持原有的位置信息
            left: rect.left,
            top: rect.top,
            right: rect.left + (offsetWidth || rect.width || 1),
            bottom: rect.top + (offsetHeight || rect.height || 1),
            x: rect.left,
            y: rect.top
          } as DOMRect;
        }
      }
      
      return rect;
    } catch (error) {
      console.error(`Error getting bounding rect for element "${this.name}":`, error);
      
      // 如果 getBoundingClientRect 失败，尝试使用 offsetWidth/offsetHeight 作为后备
      // 注意：这只能提供尺寸信息，位置信息可能不准确
      try {
        const offsetWidth = this.dom.offsetWidth;
        const offsetHeight = this.dom.offsetHeight;
        
        if (offsetWidth > 0 || offsetHeight > 0) {
          // 使用 offsetLeft/offsetTop 计算位置（相对于 offsetParent）
          // 这是一个简化的后备方案
          let left = this.dom.offsetLeft;
          let top = this.dom.offsetTop;
          let parent = this.dom.offsetParent as HTMLElement | null;
          
          // 累加所有父元素的偏移
          while (parent) {
            left += parent.offsetLeft;
            top += parent.offsetTop;
            parent = parent.offsetParent as HTMLElement | null;
          }
          
          // 转换为视口坐标（减去滚动位置）
          left -= (window.scrollX || window.pageXOffset || 0);
          top -= (window.scrollY || window.pageYOffset || 0);
          
          return {
            width: offsetWidth,
            height: offsetHeight,
            left: left,
            top: top,
            right: left + offsetWidth,
            bottom: top + offsetHeight,
            x: left,
            y: top
          } as DOMRect;
        }
      } catch (fallbackError) {
        console.error(`Fallback method also failed for element "${this.name}":`, fallbackError);
      }
      
      return null;
    }
  }

  /**
   * 检查元素是否可见
   */
  IsVisible(): boolean {
    // 如果dom不存在，尝试查找
    if (!this.dom) {
      this.FindElement();
    }

    if (!this.dom) {
      return false;
    }

    try {
      // 检查 offsetParent - 如果为 null，元素可能不可见（除非是 body 或 html）
      // 但某些情况下 offsetParent 可能为 null 但元素仍然可见，所以只作为辅助检查
      if (this.dom.offsetParent === null && 
          this.dom.tagName !== 'BODY' && 
          this.dom.tagName !== 'HTML' &&
          !this.dom.isConnected) {
        return false;
      }

      // 获取计算样式
      const style = window.getComputedStyle(this.dom);
      
      // 检查 display 是否为 none
      if (style.display === 'none') {
        return false;
      }

      // 检查 visibility 是否为 hidden
      if (style.visibility === 'hidden') {
        return false;
      }

      // 检查 opacity 是否为 0（完全透明视为不可见）
      const opacity = parseFloat(style.opacity);
      if (isNaN(opacity) || opacity === 0) {
        return false;
      }

      // 获取元素位置信息
      const rect = this.GetBoundingRect();
      if (!rect) {
        return false;
      }

      // 检查元素是否有尺寸
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      // 检查元素是否在视口内（更宽松的判断）
      // 只要元素的任何部分在视口内或接近视口就认为可见
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // 放宽判断：允许元素稍微超出视口（比如滚动后可见）
      const margin = 100; // 允许100px的边距
      const isInViewport = !(
        rect.right < -margin || 
        rect.bottom < -margin || 
        rect.left > viewportWidth + margin || 
        rect.top > viewportHeight + margin
      );

      return isInViewport;
    } catch (error) {
      console.error(`检查元素 "${this.name}" 可见性时出错:`, error);
      // 出错时返回 false，但尝试使用更简单的方法
      try {
        // 使用 offsetParent 作为后备检查
        return this.dom.offsetParent !== null || 
               this.dom.tagName === 'BODY' || 
               this.dom.tagName === 'HTML';
      } catch {
        return false;
      }
    }
  }

  /**
   * 滚动到元素位置
   */
  ScrollIntoView(): boolean {
    // 如果dom不存在，尝试查找
    if (!this.dom) {
      this.FindElement();
    }

    // 如果仍然不存在，返回false
    if (!this.dom) {
      console.error(`Element "${this.name}" not found, selector: ${this.selector}`);
      return false;
    }

    try {
      // 滚动到元素位置，使用平滑滚动并居中显示
      this.dom.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center', 
        inline: 'center' 
      });
      return true;
    } catch (error) {
      console.error(`Error scrolling to element "${this.name}":`, error);
      return false;
    }
  }

  /**
   * 刷新dom
   */
  RefreshDom(): void {
    this.dom = undefined;
    this.Validate();
  }
}
