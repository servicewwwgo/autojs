import { ElementObject, Element, ElementMember } from './Element';
import { elementManager } from '../core/ElementManager';

/**
 * 执行指令结果对象
 */
export interface ExecutionResult {
  /** 指令ID */
  instructionID: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 执行时间(毫秒) */
  duration: number;
  /** 数据 */
  data?: any;
}


export interface BaseInstructionMembers {
  /** 指令类型 */
  type: string;
  /** 指令ID */
  id: string;
  /** 延迟时间(秒) */
  delay: number;
  /** 重试次数 */
  retry: number;
  /** 超时时间(秒) */
  timeout: number;
  /** 是否等待元素可见 */
  waitVisible: boolean;
}

/**
 * 基础指令接口
 */
export interface BaseInstruction extends BaseInstructionMembers {
  /** 验证方法 */
  Validate(): boolean;

  /** 执行方法 */
  Execute(): Promise<ExecutionResult>;

  /* 對象 */
  ToObject(): object;
}

/**
 * 基础指令实现类
 */
export abstract class BaseInstructionImpl implements BaseInstruction {
  public type: string;
  public id: string;
  public delay: number;
  public retry: number;
  public timeout: number;
  public waitVisible: boolean;

  constructor(config: BaseInstructionMembers) {
    this.type = config.type;
    this.id = config.id;
    this.delay = config.delay;
    this.retry = config.retry;
    this.timeout = config.timeout;
    this.waitVisible = config.waitVisible;
  }

  /**
   * 對象
   */
  ToObject(): object {
    return {
      type: this.type,
      id: this.id,
      delay: this.delay,
      retry: this.retry,
      timeout: this.timeout,
      waitVisible: this.waitVisible
    };
  }

  /**
   * 验证指令配置
   */
  Validate(): boolean {
    if (!this.type || !this.id) {
      console.error('Instruction type and id are required');
      return false;
    }
    return true;
  }

  /**
   * 执行指令（抽象方法，子类必须实现）
   */
  abstract Execute(): Promise<ExecutionResult>;

  /**
   * 等待指定时间
   */
  protected async Delay(time: number): Promise<void> {
    const delay_time = time || this.delay;

    if (delay_time > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, delay_time * 1000));
    }
  }

  /**
   * 等待元素可见
   */
  protected async WaitForElementVisible(element: any, elementName: string, timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let isResolved = false;
      const checkVisible = setInterval(() => {
        // 刷新 DOM 引用，确保获取最新状态
        element.RefreshDom();
        if (element.IsVisible()) {
          if (!isResolved) {
            isResolved = true;
            clearInterval(checkVisible);
            resolve();
          }
        }
      }, 100);
      // 超时处理
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          clearInterval(checkVisible);
          // 超时后再次检查元素是否可见
          element.RefreshDom();
          if (element.IsVisible()) {
            resolve();
          } else {
            reject(new Error(`等待元素 "${elementName}" 可见超时（${timeout}秒）`));
          }
        }
      }, timeout * 1000);
    });
  }

  /**
   * 重试执行
   */
  protected async ExecuteWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    // 确保至少执行一次，即使 retry 为 0
    const maxAttempts = Math.max(1, this.retry || 1);

    for (let i = 1; i <= maxAttempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < maxAttempts) {
          console.warn(`Retry ${i}/${maxAttempts} for instruction ${this.id}`);
          await this.Delay(1); // 重试前等待1秒
        }
      }
    }

    throw lastError || new Error('Execution failed after retries');
  }
}

/**
 * 页面导航指令
 * url: 页面地址
 */
export class NavigateInstruction extends BaseInstructionImpl {
  public url: string;

  constructor(config: BaseInstructionMembers & { url: string }) {
    super(config);
    this.url = config.url;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      url: this.url
    };
  }

  Validate(): boolean {

    if (!super.Validate()) {
      return false;
    }

    if (!this.url) {
      console.error('URL is required for navigate instruction');
      return false;
    }

    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.Validate()) {
        throw new Error('Invalid navigate instruction');
      }

      await this.Delay(this.delay);

      // 对于导航指令，直接跳转页面
      // 注意：这会导致content script重新加载
      console.log(`导航到: ${this.url}`);
      window.location.href = this.url;

      // 返回成功结果，但注意页面会跳转
      return {
        instructionID: this.id,
        success: true,
        duration: Date.now() - startTime,
        data: { url: this.url }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 元素定位指令
 */
export class LocateElementInstruction extends BaseInstructionImpl {
  public element: ElementObject;

  constructor(config: BaseInstructionMembers & { element: ElementMember }) {
    super(config);

    this.element = new Element({
      name: config.element.name,
      description: config.element.description,
      selector: config.element.selector,
      selectorType: config.element.selectorType,
      text: '',
      parentName: config.element.parentName,
      childrenNames: config.element.childrenNames,
      relatedNames: config.element.relatedNames,
    });
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      element: this.element.ToObject()
    };
  }

  Validate(): boolean {
    if (!super.Validate()) {
      return false;
    }

    if (!this.element) {
      console.error(`Element is not valid for locate instruction`);
      return false;
    }

    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {

      if (!this.Validate()) {
        throw new Error('Invalid locate element instruction');
      }

      await this.Delay(this.delay);

      const success = await this.ExecuteWithRetry(async () => {
        return this.element.Validate();
      });

      if (success) {
        elementManager.setElement(this.element);
      }

      return {
        instructionID: this.id,
        success: success,
        duration: Date.now() - startTime,
        data: { element: success ? this.element.ToObject() : undefined }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 鼠标点击指令
 */
export class ClickInstruction extends BaseInstructionImpl {
  public elementName: string;
  public button: 'left' | 'middle' | 'right';
  public clickType: 'single' | 'double';
  public offsetX: number;
  public offsetY: number;

  constructor(config: BaseInstructionMembers & {
    elementName: string;
    button?: 'left' | 'middle' | 'right';
    clickType?: 'single' | 'double';
    offsetX?: number;
    offsetY?: number;
  }) {
    super(config);
    this.elementName = config.elementName;
    this.button = config.button || 'left';
    this.clickType = config.clickType || 'single';
    this.offsetX = config.offsetX || 0;
    this.offsetY = config.offsetY || 0;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      elementName: this.elementName,
      button: this.button,
      clickType: this.clickType,
      offsetX: this.offsetX,
      offsetY: this.offsetY
    };
  }

  validate(): boolean {
    if (!super.Validate()) {
      return false;
    }

    if (!this.elementName) {
      console.error('Element name is required for click instruction');
      return false;
    }

    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.Validate()) {
        throw new Error('Invalid click instruction');
      }

      await this.Delay(this.delay);

      const result = await this.ExecuteWithRetry(async () => {
        // 从元素管理器中获取元素
        const element = elementManager.getElement(this.elementName);

        if (!element) {
          throw new Error(`元素 "${this.elementName}" 不存在`);
        }
 
        // 验证元素是否存在且可见
        if (!element.Validate()) {
          throw new Error(`元素 "${this.elementName}" 验证失败`);
        }

        // 如果需要等待元素可见
        if (this.waitVisible && !element.IsVisible()) {
          element.ScrollIntoView();
          await this.WaitForElementVisible(element, this.elementName, this.timeout);
        }
        // 计算点击位置（元素中心 + 偏移量）
        const rect = element.GetBoundingRect();
        
        if (!rect) {
          throw new Error(`无法获取元素 "${this.elementName}" 的位置信息`);
        }

        const x = rect.left + rect.width / 2 + this.offsetX;
        const y = rect.top + rect.height / 2 + this.offsetY;

        // 创建鼠标事件
        const mouseEventOptions: MouseEventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          button: this.button === 'left' ? 0 : this.button === 'middle' ? 1 : 2,
          clientX: x,
          clientY: y
        };

        // 执行点击
        if (this.clickType === 'double') {
          element.dom?.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('click', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('click', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('dblclick', mouseEventOptions));
        } else {
          element.dom?.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
          element.dom?.dispatchEvent(new MouseEvent('click', mouseEventOptions));
        }

        return { success: true };
      });

      return {
        instructionID: this.id,
        success: result.success,
        duration: Date.now() - startTime,
        data: {
          elementName: this.elementName,
          button: this.button,
          clickType: this.clickType,
          offsetX: this.offsetX,
          offsetY: this.offsetY
        }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 鼠标拖拽指令
 */
export class DragInstruction extends BaseInstructionImpl {
  public sourceName: string;
  public targetName: string;
  public duration: number;

  constructor(config: BaseInstructionMembers & {
    type: string;
    sourceName: string;
    targetName: string;
    duration?: number;
  }) {
    super(config);
    this.sourceName = config.sourceName;
    this.targetName = config.targetName;
    this.duration = config.duration || 1;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      sourceName: this.sourceName,
      targetName: this.targetName,
      duration: this.duration
    };
  }

  Validate(): boolean {
    if (!super.Validate()) {
      return false;
    }

    if (!this.sourceName || !this.targetName) {
      console.error('Source and target names are required for drag instruction');
      return false;
    }

    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.Validate()) {
        throw new Error('Invalid drag instruction');
      }

      await this.Delay(this.delay);

      const result = await this.ExecuteWithRetry(async () => {
        // 从元素管理器中获取源元素和目标元素
        const sourceElement = elementManager.getElement(this.sourceName);
        const targetElement = elementManager.getElement(this.targetName);

        if (!sourceElement) {
          throw new Error(`源元素 "${this.sourceName}" 不存在`);
        }
        if (!targetElement) {
          throw new Error(`目标元素 "${this.targetName}" 不存在`);
        }

        // 刷新DOM引用
        sourceElement.RefreshDom();
        targetElement.RefreshDom();

        // 验证元素
        if (!sourceElement.Validate()) {
          throw new Error(`源元素 "${this.sourceName}" 验证失败`);
        }
        if (!targetElement.Validate()) {
          throw new Error(`目标元素 "${this.targetName}" 验证失败`);
        }

        // 确保元素可见
        if (!sourceElement.IsVisible()) {
          sourceElement.ScrollIntoView();
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (!targetElement.IsVisible()) {
          targetElement.ScrollIntoView();
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // 再次刷新DOM引用并获取位置
        sourceElement.RefreshDom();
        targetElement.RefreshDom();

        const sourceRect = sourceElement.GetBoundingRect();
        const targetRect = targetElement.GetBoundingRect();

        if (!sourceRect || !targetRect) {
          throw new Error('无法获取元素位置信息');
        }

        if (!sourceElement.dom || !targetElement.dom) {
          throw new Error('元素的DOM引用不存在');
        }

        const sourceX = sourceRect.left + sourceRect.width / 2;
        const sourceY = sourceRect.top + sourceRect.height / 2;
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;

        console.log(`开始拖拽: 从 (${sourceX}, ${sourceY}) 到 (${targetX}, ${targetY})`);

        // 保存原始属性
        const originalSourceDraggable = sourceElement.dom.draggable;
        const originalSourceDragStart = sourceElement.dom.ondragstart;
        const originalSourceStyle = sourceElement.dom.style.userSelect;
        
        // 创建共享的 DataTransfer 对象
        const dataTransfer = new DataTransfer();
        dataTransfer.effectAllowed = 'move';
        dataTransfer.setData('text/plain', sourceElement.name || '');
        dataTransfer.setData('text/html', sourceElement.dom.outerHTML || '');

        // 设置源元素为可拖拽
        sourceElement.dom.draggable = true;
        sourceElement.dom.style.userSelect = 'none';

        // 在目标元素上添加监听器，确保 dragover 和 dragenter 调用 preventDefault
        const preventDefaultHandler = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
          }
        };

        const dragOverHandler = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
          }
        };

        const dragEnterHandler = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
          }
        };

        // 添加事件监听器
        targetElement.dom.addEventListener('dragover', dragOverHandler, true);
        targetElement.dom.addEventListener('dragenter', dragEnterHandler, true);
        document.addEventListener('dragover', preventDefaultHandler, true);
        document.addEventListener('drop', preventDefaultHandler, true);

        try {
          // 步骤1: 在源元素上按下鼠标
          const mouseDownEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1,
            button: 0,
            buttons: 1,
            clientX: sourceX,
            clientY: sourceY,
            screenX: sourceX + window.screenX,
            screenY: sourceY + window.screenY,
            which: 1
          });
          sourceElement.dom.dispatchEvent(mouseDownEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤2: 触发 dragstart 事件
          // 注意：DragEvent 的 dataTransfer 在构造时可能无法设置，我们需要通过监听器来设置
          const dragStartEvent = new DragEvent('dragstart', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: sourceX,
            clientY: sourceY,
            dataTransfer: dataTransfer
          });
          
          // 使用 Object.defineProperty 尝试设置 dataTransfer（如果浏览器允许）
          try {
            Object.defineProperty(dragStartEvent, 'dataTransfer', {
              value: dataTransfer,
              writable: false,
              configurable: false
            });
          } catch (e) {
            console.warn('无法设置 dragStartEvent.dataTransfer:', e);
          }

          sourceElement.dom.dispatchEvent(dragStartEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤3: 模拟鼠标移动到目标位置
          const steps = Math.max(5, Math.floor(this.duration * 10));
          for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const currentX = sourceX + (targetX - sourceX) * progress;
            const currentY = sourceY + (targetY - sourceY) * progress;

            // 在文档上触发 mousemove
            const mouseMoveEvent = new MouseEvent('mousemove', {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 1,
              clientX: currentX,
              clientY: currentY,
              screenX: currentX + window.screenX,
              screenY: currentY + window.screenY
            });
            document.dispatchEvent(mouseMoveEvent);
            sourceElement.dom.dispatchEvent(mouseMoveEvent);

            // 在目标元素上触发 dragover
            const dragOverEvent = new DragEvent('dragover', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: currentX,
              clientY: currentY,
              dataTransfer: dataTransfer
            });
            
            try {
              Object.defineProperty(dragOverEvent, 'dataTransfer', {
                value: dataTransfer,
                writable: false,
                configurable: false
              });
            } catch (e) {
              // 忽略
            }

            targetElement.dom.dispatchEvent(dragOverEvent);
            await new Promise(resolve => setTimeout(resolve, Math.max(10, 100 / steps)));
          }

          // 步骤4: 触发 dragenter 事件
          const dragEnterEvent = new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY,
            dataTransfer: dataTransfer
          });
          
          try {
            Object.defineProperty(dragEnterEvent, 'dataTransfer', {
              value: dataTransfer,
              writable: false,
              configurable: false
            });
          } catch (e) {
            // 忽略
          }

          targetElement.dom.dispatchEvent(dragEnterEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤5: 最后一次 dragover（在目标位置）
          const finalDragOverEvent = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY,
            dataTransfer: dataTransfer
          });
          
          try {
            Object.defineProperty(finalDragOverEvent, 'dataTransfer', {
              value: dataTransfer,
              writable: false,
              configurable: false
            });
          } catch (e) {
            // 忽略
          }

          targetElement.dom.dispatchEvent(finalDragOverEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤6: 释放鼠标（在目标位置）
          const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1,
            button: 0,
            buttons: 0,
            clientX: targetX,
            clientY: targetY,
            screenX: targetX + window.screenX,
            screenY: targetY + window.screenY,
            which: 1
          });
          targetElement.dom.dispatchEvent(mouseUpEvent);
          document.dispatchEvent(mouseUpEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤7: 触发 drop 事件
          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY,
            dataTransfer: dataTransfer
          });
          
          try {
            Object.defineProperty(dropEvent, 'dataTransfer', {
              value: dataTransfer,
              writable: false,
              configurable: false
            });
          } catch (e) {
            // 忽略
          }

          targetElement.dom.dispatchEvent(dropEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤8: 触发 dragend 事件（在源元素上）
          const dragEndEvent = new DragEvent('dragend', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY,
            dataTransfer: dataTransfer
          });
          
          try {
            Object.defineProperty(dragEndEvent, 'dataTransfer', {
              value: dataTransfer,
              writable: false,
              configurable: false
            });
          } catch (e) {
            // 忽略
          }

          sourceElement.dom.dispatchEvent(dragEndEvent);
          await new Promise(resolve => setTimeout(resolve, 50));

          // 步骤9: 触发 click 事件（某些情况下需要）
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 1,
            button: 0,
            clientX: targetX,
            clientY: targetY
          });
          targetElement.dom.dispatchEvent(clickEvent);

          console.log('拖拽操作完成');
        } finally {
          // 清理事件监听器
          targetElement.dom.removeEventListener('dragover', dragOverHandler, true);
          targetElement.dom.removeEventListener('dragenter', dragEnterHandler, true);
          document.removeEventListener('dragover', preventDefaultHandler, true);
          document.removeEventListener('drop', preventDefaultHandler, true);

          // 恢复原始属性
          sourceElement.dom.draggable = originalSourceDraggable;
          sourceElement.dom.style.userSelect = originalSourceStyle;
          if (originalSourceDragStart) {
            sourceElement.dom.ondragstart = originalSourceDragStart;
          }
        }

        return { success: true };
      });

      return {
        instructionID: this.id,
        success: result.success,
        duration: Date.now() - startTime,
        data: {
          sourceName: this.sourceName,
          targetName: this.targetName,
          duration: this.duration
        }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 文本输入指令
 */
export class InputTextInstruction extends BaseInstructionImpl {
  public elementName: string;
  public text: string;
  public clearFirst: boolean;
  public timeDelay: number;

  constructor(config: BaseInstructionMembers & {
    elementName: string;
    text: string;
    clearFirst?: boolean;
    timeDelay?: number;
  }) {
    super(config);
    this.elementName = config.elementName;
    this.text = config.text;
    this.clearFirst = config.clearFirst || false;
    this.timeDelay = config.timeDelay || 0.1;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      elementName: this.elementName,
      text: this.text,
      clearFirst: this.clearFirst,
      timeDelay: this.timeDelay
    };
  }

  Validate(): boolean {
    if (!super.Validate()) {
      return false;
    }

    if (!this.elementName) {
      console.error('Element name is required for input text instruction');
      return false;
    }

    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.Validate()) {
        throw new Error('Invalid input text instruction');
      }

      await this.Delay(this.delay);

      const result = await this.ExecuteWithRetry(async () => {
        // 从元素管理器中获取元素
        const element = elementManager.getElement(this.elementName);
        
        if (!element) {
          throw new Error(`元素 "${this.elementName}" 不存在`);
        }

        // 验证元素
        if (!element.Validate()) {
          throw new Error(`元素 "${this.elementName}" 验证失败`);
        }

        // 如果需要等待元素可见
        if (this.waitVisible && !element.IsVisible()) {
          element.ScrollIntoView();
          await this.WaitForElementVisible(element, this.elementName, this.timeout);
        }

        if (!element.dom) {
          throw new Error(`元素 "${this.elementName}" 的DOM引用不存在`);
        }

        // 检查元素是否为输入框
        const inputElement = element.dom as HTMLInputElement | HTMLTextAreaElement;
        if (inputElement.tagName !== 'INPUT' && inputElement.tagName !== 'TEXTAREA' && !inputElement.isContentEditable) {
          throw new Error(`元素 "${this.elementName}" 不是可输入元素`);
        }

        // 聚焦元素
        inputElement.focus();

        // 如果需要先清空
        if (this.clearFirst) {
          if (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA') {
            inputElement.value = '';
          } else if (inputElement.isContentEditable) {
            inputElement.textContent = '';
          }
        }

        // 逐字符输入文本
        for (let i = 0; i < this.text.length; i++) {
          const char = this.text[i];
          
          // 触发键盘事件
          inputElement.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: char,
            code: `Key${char.toUpperCase()}`
          }));

          // 输入字符
          if (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA') {
            inputElement.value += char;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (inputElement.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(char));
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }

          inputElement.dispatchEvent(new KeyboardEvent('keyup', {
            bubbles: true,
            cancelable: true,
            key: char,
            code: `Key${char.toUpperCase()}`
          }));

          // 字符间延迟
          if (i < this.text.length - 1 && this.timeDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.timeDelay * 1000));
          }
        }

        // 触发change事件
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true };
      });

      return {
        instructionID: this.id,
        success: result.success,
        duration: Date.now() - startTime,
        data: {
          elementName: this.elementName,
          text: this.text,
          clearFirst: this.clearFirst
        }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 按键指令
 */
export class KeyPressInstruction extends BaseInstructionImpl {
  public elementName: string;
  public key: string;
  public modifiers: string[];

  constructor(config: BaseInstructionMembers & {
    elementName: string;
    key: string;
    modifiers?: string[];
  }) {
    super(config);
    this.elementName = config.elementName;
    this.key = config.key;
    this.modifiers = config.modifiers || [];
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      elementName: this.elementName,
      key: this.key,
      modifiers: this.modifiers
    };
  }

  Validate(): boolean {
    if (!super.Validate()) {
      return false;
    }
    if (!this.elementName || !this.key) {
      console.error('Element name and key are required for key press instruction');
      return false;
    }
    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.Validate()) {
        throw new Error('Invalid key press instruction');
      }

      await this.Delay(this.delay);

      const result = await this.ExecuteWithRetry(async () => {
        // 从元素管理器中获取元素
        const element = elementManager.getElement(this.elementName);
        if (!element) {
          throw new Error(`元素 "${this.elementName}" 不存在`);
        }

        // 验证元素
        if (!element.Validate()) {
          throw new Error(`元素 "${this.elementName}" 验证失败`);
        }

        // 如果需要等待元素可见
        if (this.waitVisible && !element.IsVisible()) {
          element.ScrollIntoView();
          await this.WaitForElementVisible(element, this.elementName, this.timeout);
        }

        if (!element.dom) {
          throw new Error(`元素 "${this.elementName}" 的DOM引用不存在`);
        }

        // 计算实际要输入的字符（考虑修饰键）
        let actualKey = this.key;
        const hasShift = this.modifiers.includes('shift') || this.modifiers.includes('Shift');
        
        // 如果按下了 Shift 键，将小写字母转换为大写
        if (hasShift && this.key.length === 1 && /[a-z]/.test(this.key)) {
          actualKey = this.key.toUpperCase();
        }

        // 计算 keyCode 和 code
        const keyCode = actualKey.charCodeAt(0);
        let code = `Key${actualKey.toUpperCase()}`;
        
        // 处理特殊键的 code
        const keyCodeMap: { [key: string]: string } = {
          ' ': 'Space',
          'Enter': 'Enter',
          'Tab': 'Tab',
          'Escape': 'Escape',
          'Backspace': 'Backspace',
          'Delete': 'Delete',
          'ArrowUp': 'ArrowUp',
          'ArrowDown': 'ArrowDown',
          'ArrowLeft': 'ArrowLeft',
          'ArrowRight': 'ArrowRight'
        };
        
        if (keyCodeMap[actualKey]) {
          code = keyCodeMap[actualKey];
        }

        // 创建键盘事件选项
        const keyEventOptions: KeyboardEventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          key: actualKey,
          code: code,
          keyCode: keyCode,
          which: keyCode
        };

        // 设置修饰键
        if (this.modifiers.includes('ctrl') || this.modifiers.includes('Control')) {
          keyEventOptions.ctrlKey = true;
        }
        if (this.modifiers.includes('alt') || this.modifiers.includes('Alt')) {
          keyEventOptions.altKey = true;
        }
        if (hasShift) {
          keyEventOptions.shiftKey = true;
        }
        if (this.modifiers.includes('meta') || this.modifiers.includes('Meta')) {
          keyEventOptions.metaKey = true;
        }

        // 聚焦元素
        element.dom.focus();
        await new Promise(resolve => setTimeout(resolve, 10));

        // 检查元素是否为可输入元素
        const inputElement = element.dom as HTMLInputElement | HTMLTextAreaElement;
        const isInputElement = inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA';
        const isContentEditable = inputElement.isContentEditable;

        // 触发 keydown 事件
        element.dom.dispatchEvent(new KeyboardEvent('keydown', keyEventOptions));

        // 如果是可输入元素且不是控制键，实际输入字符
        if ((isInputElement || isContentEditable) && actualKey.length === 1 && !keyEventOptions.ctrlKey && !keyEventOptions.altKey && !keyEventOptions.metaKey) {
          // 触发 keypress 事件
          element.dom.dispatchEvent(new KeyboardEvent('keypress', keyEventOptions));

          // 实际输入字符
          if (isInputElement) {
            // 获取当前光标位置
            const start = (inputElement as HTMLInputElement).selectionStart ?? inputElement.value.length;
            const end = (inputElement as HTMLInputElement).selectionEnd ?? inputElement.value.length;
            
            // 插入字符
            const value = inputElement.value;
            inputElement.value = value.substring(0, start) + actualKey + value.substring(end);
            
            // 设置光标位置
            const newPosition = start + 1;
            (inputElement as HTMLInputElement).setSelectionRange(newPosition, newPosition);
            
            // 触发 input 事件
            inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          } else if (isContentEditable) {
            // 对于 contentEditable 元素
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const textNode = document.createTextNode(actualKey);
              range.insertNode(textNode);
              range.setStartAfter(textNode);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              
              // 触发 input 事件
              inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            }
          }
        } else {
          // 对于非输入字符（如控制键），只触发 keypress
          element.dom.dispatchEvent(new KeyboardEvent('keypress', keyEventOptions));
        }

        // 触发 keyup 事件
        element.dom.dispatchEvent(new KeyboardEvent('keyup', keyEventOptions));

        // 如果是输入元素，触发 change 事件（在某些情况下）
        if (isInputElement && actualKey.length === 1) {
          // 延迟触发 change，模拟真实行为
          setTimeout(() => {
            inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          }, 0);
        }

        return { success: true };
      });

      return {
        instructionID: this.id,
        success: result.success,
        duration: Date.now() - startTime,
        data: {
          elementName: this.elementName,
          key: this.key,
          modifiers: this.modifiers
        }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 等待指令
 */
export class WaitInstruction extends BaseInstructionImpl {
  public waitType: 'time' | 'element' | 'visible' | 'condition' | 'network' | 'function';
  public value: any;

  constructor(config: BaseInstructionMembers & {
    waitType: 'time' | 'element' | 'visible' | 'condition' | 'network' | 'function';
    value: any;
  }) {
    super(config);
    this.waitType = config.waitType;
    this.value = config.value;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      waitType: this.waitType,
      value: this.value
    };
  }

  validate(): boolean {

    if (!super.Validate()) {
      return false;
    }

    if (!this.waitType || this.value === undefined) {
      console.error('Wait type and value are required for wait instruction');
      return false;
    }
    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate()) {
        throw new Error('Invalid wait instruction');
      }

      await this.Delay(this.delay);

      const result = await this.ExecuteWithRetry(async () => {
        switch (this.waitType) {
          case 'time':
            await this.Delay(this.value);
            break;
          case 'element':
            // 等待元素出现
            if (typeof this.value === 'string') {
              // value是元素名称
              const elementName = this.value;
              const maxWaitTime = this.timeout * 1000;
              const startTime = Date.now();
              
              while (Date.now() - startTime < maxWaitTime) {
                const element = elementManager.getElement(elementName);
                if (element && element.Validate()) {
                  return { success: true };
                }
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              throw new Error(`等待元素 "${elementName}" 出现超时`);
            } else {
              throw new Error('等待元素类型需要提供元素名称');
            }
          case 'visible':
            // 等待元素可见
            if (typeof this.value === 'string') {
              const elementName = this.value;
              const maxWaitTime = this.timeout * 1000;
              const startTime = Date.now();
              
              while (Date.now() - startTime < maxWaitTime) {
                const element = elementManager.getElement(elementName);
                if (element && element.Validate() && element.IsVisible()) {
                  return { success: true };
                }
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              throw new Error(`等待元素 "${elementName}" 可见超时`);
            } else {
              throw new Error('等待可见类型需要提供元素名称');
            }
          case 'condition':
            // 等待条件满足
            if (typeof this.value === 'function') {
              const condition = this.value;
              const maxWaitTime = this.timeout * 1000;
              const startTime = Date.now();
              
              while (Date.now() - startTime < maxWaitTime) {
                try {
                  if (await condition()) {
                    return { success: true };
                  }
                } catch (error) {
                  // 忽略条件执行错误，继续等待
                }
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              throw new Error('等待条件满足超时');
            } else {
              throw new Error('等待条件类型需要提供函数');
            }
          case 'network':
            // 等待网络请求完成
            const maxWaitTime = this.timeout * 1000;
            const startTime = Date.now();
            
            // 检查是否有未完成的fetch请求
            while (Date.now() - startTime < maxWaitTime) {
              // 检查performance API中的网络请求
              const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
              const pendingRequests = entries.filter(entry => {
                const duration = entry.responseEnd - entry.startTime;
                return duration === 0 || entry.responseEnd === 0;
              });
              
              if (pendingRequests.length === 0) {
                // 等待一小段时间确保没有新的请求
                await new Promise(resolve => setTimeout(resolve, 200));
                return { success: true };
              }
              
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 超时但不算失败，因为可能只是请求较慢
            console.warn('等待网络请求完成超时，但继续执行');
            return { success: true };
          case 'function':
            // 等待函数返回true
            if (typeof this.value === 'function') {
              const func = this.value;
              const maxWaitTime = this.timeout * 1000;
              const startTime = Date.now();
              
              while (Date.now() - startTime < maxWaitTime) {
                try {
                  const result = await func();
                  if (result === true) {
                    return { success: true };
                  }
                } catch (error) {
                  // 忽略函数执行错误，继续等待
                }
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              throw new Error('等待函数返回true超时');
            } else {
              throw new Error('等待函数类型需要提供函数');
            }
          default:
            throw new Error(`未知的等待类型: ${this.waitType}`);
        }
        return { success: true };
      });

      return {
        instructionID: this.id,
        success: true,
        duration: Date.now() - startTime,
        data: {
          waitType: this.waitType,
          value: this.value
        }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 文本获取输出指令
 */
export class GetTextInstruction extends BaseInstructionImpl {
  public elementName: string;
  public textType: 'innerText' | 'textContent' | 'value';
  public includeHTML: boolean;

  constructor(config: BaseInstructionMembers & {
    elementName: string;
    textType?: 'innerText' | 'textContent' | 'value';
    includeHTML?: boolean;
  }) {
    super(config);
    this.elementName = config.elementName;
    this.textType = config.textType || 'innerText';
    this.includeHTML = config.includeHTML || false;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      elementName: this.elementName,
      textType: this.textType,
      includeHTML: this.includeHTML
    };
  }

  Validate(): boolean {
    if (!super.Validate()) {
      return false;
    }
    if (!this.elementName) {
      console.error('Element name is required for get text instruction');
      return false;
    }
    return true;
  }

  async Execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.Validate()) {
        throw new Error('Invalid get text instruction');
      }

      await this.Delay(this.delay);

      const result = await this.ExecuteWithRetry(async () => {
        // 从元素管理器中获取元素
        const element = elementManager.getElement(this.elementName);
        if (!element) {
          throw new Error(`元素 "${this.elementName}" 不存在`);
        }

        // 验证元素
        if (!element.Validate()) {
          throw new Error(`元素 "${this.elementName}" 验证失败`);
        }

        // 如果需要等待元素可见
        if (this.waitVisible && !element.IsVisible()) {
          element.ScrollIntoView();
          await this.WaitForElementVisible(element, this.elementName, this.timeout);
        }

        if (!element.dom) {
          throw new Error(`元素 "${this.elementName}" 的DOM引用不存在`);
        }

        // 根据textType获取文本
        let text = '';
        if (this.textType === 'innerText') {
          text = element.dom.innerText || '';
        } else if (this.textType === 'textContent') {
          text = element.dom.textContent || '';
        } else if (this.textType === 'value') {
          const inputElement = element.dom as HTMLInputElement | HTMLTextAreaElement;
          text = inputElement.value || '';
        }

        // 如果需要包含HTML
        if (this.includeHTML && this.textType !== 'value') {
          text = element.dom.innerHTML;
        }

        // 更新元素的text属性
        element.text = text;

        return { success: true, text };
      });

      return {
        instructionID: this.id,
        success: result.success,
        duration: Date.now() - startTime,
        data: {
          elementName: this.elementName,
          textType: this.textType,
          includeHTML: this.includeHTML,
          text: result.text
        }
      };
    } catch (error) {
      return {
        instructionID: this.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }
}

/**
 * 指令映射
 * 用于根据指令类型创建指令对象
 */
export const INSTRUCTION_MAP = {
  'navigate': NavigateInstruction,
  'locate': LocateElementInstruction,
  'click': ClickInstruction,
  'drag': DragInstruction,
  'input_text': InputTextInstruction,
  'key_press': KeyPressInstruction,
  'wait': WaitInstruction,
  'get_text': GetTextInstruction
};