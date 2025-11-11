/**
 * 元素对象 - 用来管理需要操作的页面元素
 */
export interface ElementObject {
  /** DOM对象，用于表示具体的目标元素 */
  dom: HTMLElement | null;
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
  childrenNames: string[];
  /** 关联元素名称列表 */
  relatedNames: string[];

  /** 验证方法 */
  Validate(): boolean;
  /** 执行方法 */
  Execute(): Promise<boolean>;
  /** 對象 */
  ToObject(): object;
}

/**
 * 元素对象实现类
 */
export class Element implements ElementObject {
  public dom: HTMLElement | null = null;
  public name: string;
  public description: string;
  public text: string;
  public selector: string;
  public selectorType: 'css' | 'xpath' | 'id';
  public parentName?: string;
  public childrenNames: string[] = [];
  public relatedNames: string[] = [];

  constructor(config: {
    name: string;
    description: string;
    selector: string;
    selectorType: 'css' | 'xpath' | 'id';
    parentName?: string;
    childrenNames?: string[];
    relatedNames?: string[];
  }) {
    this.name = config.name;
    this.description = config.description;
    this.selector = config.selector;
    this.selectorType = config.selectorType;
    this.parentName = config.parentName;
    this.childrenNames = config.childrenNames || [];
    this.relatedNames = config.relatedNames || [];
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
          this.dom = result.singleNodeValue as HTMLElement;
          break;
        case 'id':
          this.dom = document.getElementById(this.selector) as HTMLElement;
          break;
        default:
          console.error(`Unsupported selector type: ${this.selectorType}`);
      }
    } catch (error) {
      console.error(`Error finding element "${this.name}":`, error);
    }

    return this.dom !== null;
  }

  /**
   * 验证元素是否存在且可操作
   */
  Validate(): boolean {
    if (!this.dom) {
      this.FindElement();
    }

    if (!this.dom) {
      console.error(`Element "${this.name}" not found with selector: ${this.selector}`);
      return false;
    }

    if (!this.dom.offsetParent || this.dom.style.display === 'none') {
      console.warn(`Element "${this.name}" is not visible, selector: ${this.selector}`);
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
  async Execute(): Promise<boolean> {

    if (!this.dom || !this.Validate()) {
      console.error(`Element "${this.name}" not found or not valid, selector: ${this.selector}, validate failed`);
      return false;
    }

    return this.UpdateText(); // 更新文本内容
  }

  /**
   * 更新元素文本内容
   */
  private UpdateText(): boolean {

    if (!this.dom || !this.Validate()) {
      console.error(`Element "${this.name}" not found or not valid, selector: ${this.selector}, validate failed, update text failed`);
      return false;
    }

    this.text = this.dom.innerText || this.dom.textContent || '';
    return true;
  }

  /**
   * 获取元素位置信息
   */
  GetBoundingRect(): DOMRect | null {
    if (!this.dom || !this.Validate()) {
      console.error(`Element "${this.name}" not found or not valid, selector: ${this.selector}, validate failed, get bounding rect failed`);
      return null;
    }
    return this.dom.getBoundingClientRect();
  }

  /**
   * 检查元素是否可见
   */
  IsVisible(): boolean {

    if (!this.dom || !this.Validate()) {
      console.error(`Element "${this.name}" not found or not valid, selector: ${this.selector}, validate failed, is visible failed`);
      return false
    }

    const rect = this.GetBoundingRect();

    if (!rect) {
      console.error(`Element "${this.name}" bounding rect not found with selector: ${this.selector}`);
      return false;
    }

    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth; // 元素可见
  }

  /**
   * 滚动到元素位置
   */
  ScrollIntoView(): boolean {

    if (!this.dom || !this.Validate()) {
      console.error(`Element "${this.name}" not found or not valid, selector: ${this.selector}, validate failed, scroll into view failed`);
      return false;
    }

    try {
      this.dom.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); // 滚动到元素位置
      return true;
    } catch (error) {
      console.error(`Error scrolling to element "${this.name}":`, error);
      return false;
    }
  }
}
