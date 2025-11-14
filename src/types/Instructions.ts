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
        // TODO: 这里需要从元素管理器中获取元素
        // 暂时返回模拟结果
        return { success: true };
      });

      return {
        instructionID: this.id,
        success: true,
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
        // TODO: 这里需要从元素管理器中获取元素
        // 暂时返回模拟结果
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
        // 实现文本输入逻辑



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
        // TODO: 这里需要从元素管理器中获取元素
        // 暂时返回模拟结果
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
            break;
          case 'visible':
            // 等待元素可见
            break;
          case 'condition':
            // 等待条件满足
            break;
          case 'network':
            // 等待网络请求完成
            break;
          case 'function':
            // 等待函数返回true
            break;
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
        // TODO: 这里需要从元素管理器中获取元素
        // 暂时返回模拟结果
        return { success: true, text: '' };
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