import { ElementObject } from './Element';

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

/**
 * 基础指令接口
 */
export interface BaseInstruction {
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
  
  /** 验证方法 */
  validate(): boolean;
  /** 执行方法 */
  execute(): Promise<ExecutionResult>;
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

  constructor(config: {
    type: string;
    id: string;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    this.type = config.type;
    this.id = config.id;
    this.delay = config.delay || 0;
    this.retry = config.retry || 0;
    this.timeout = config.timeout || 30;
    this.waitVisible = config.waitVisible || false;
  }

  /**
   * 验证指令配置
   */
  validate(): boolean {
    if (!this.type || !this.id) {
      console.error('Instruction type and id are required');
      return false;
    }
    return true;
  }

  /**
   * 执行指令（抽象方法，子类必须实现）
   */
  abstract execute(): Promise<ExecutionResult>;

  /**
   * 等待指定时间
   */
  protected async wait(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  /**
   * 重试执行
   */
  protected async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i <= this.retry; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < this.retry) {
          console.warn(`Retry ${i + 1}/${this.retry} for instruction ${this.id}`);
          await this.wait(1); // 重试前等待1秒
        }
      }
    }
    
    throw lastError || new Error('Execution failed after retries');
  }
}

/**
 * 页面导航指令
 */
export class NavigateInstruction extends BaseInstructionImpl {
  public url: string;

  constructor(config: {
    id: string;
    url: string;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'navigate' });
    this.url = config.url;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.url) {
      console.error('URL is required for navigate instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid navigate instruction');
      }

      await this.wait(this.delay);
      
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

  constructor(config: {
    id: string;
    element: ElementObject;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'locate_element' });
    this.element = config.element;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.element) {
      console.error('Element is required for locate instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid locate element instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        const success = this.element.validate();
        if (!success) {
          throw new Error(`Element "${this.element.name}" not found or not valid`);
        }
        return { success: true, element: this.element };
      });

      return {
        instructionID: this.id,
        success: true,
        duration: Date.now() - startTime,
        data: { elementName: this.element.name }
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

  constructor(config: {
    id: string;
    elementName: string;
    button?: 'left' | 'middle' | 'right';
    clickType?: 'single' | 'double';
    offsetX?: number;
    offsetY?: number;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'click' });
    this.elementName = config.elementName;
    this.button = config.button || 'left';
    this.clickType = config.clickType || 'single';
    this.offsetX = config.offsetX || 0;
    this.offsetY = config.offsetY || 0;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.elementName) {
      console.error('Element name is required for click instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid click instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        // 这里需要从元素管理器中获取元素
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
          clickType: this.clickType
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

  constructor(config: {
    id: string;
    sourceName: string;
    targetName: string;
    duration?: number;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'drag' });
    this.sourceName = config.sourceName;
    this.targetName = config.targetName;
    this.duration = config.duration || 1;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.sourceName || !this.targetName) {
      console.error('Source and target names are required for drag instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid drag instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        // 实现拖拽逻辑
        return { success: true };
      });

      return {
        instructionID: this.id,
        success: true,
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

  constructor(config: {
    id: string;
    elementName: string;
    text: string;
    clearFirst?: boolean;
    timeDelay?: number;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'input_text' });
    this.elementName = config.elementName;
    this.text = config.text;
    this.clearFirst = config.clearFirst || false;
    this.timeDelay = config.timeDelay || 0.1;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.elementName) {
      console.error('Element name is required for input text instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid input text instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        // 实现文本输入逻辑
        return { success: true };
      });

      return {
        instructionID: this.id,
        success: true,
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

  constructor(config: {
    id: string;
    elementName: string;
    key: string;
    modifiers?: string[];
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'key_press' });
    this.elementName = config.elementName;
    this.key = config.key;
    this.modifiers = config.modifiers || [];
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.elementName || !this.key) {
      console.error('Element name and key are required for key press instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid key press instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        // 实现按键逻辑
        return { success: true };
      });

      return {
        instructionID: this.id,
        success: true,
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

  constructor(config: {
    id: string;
    waitType: 'time' | 'element' | 'visible' | 'condition' | 'network' | 'function';
    value: any;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'wait' });
    this.waitType = config.waitType;
    this.value = config.value;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.waitType || this.value === undefined) {
      console.error('Wait type and value are required for wait instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid wait instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        switch (this.waitType) {
          case 'time':
            await this.wait(this.value);
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

  constructor(config: {
    id: string;
    elementName: string;
    textType?: 'innerText' | 'textContent' | 'value';
    includeHTML?: boolean;
    delay?: number;
    retry?: number;
    timeout?: number;
    waitVisible?: boolean;
  }) {
    super({ ...config, type: 'get_text' });
    this.elementName = config.elementName;
    this.textType = config.textType || 'innerText';
    this.includeHTML = config.includeHTML || false;
  }

  validate(): boolean {
    if (!super.validate()) return false;
    if (!this.elementName) {
      console.error('Element name is required for get text instruction');
      return false;
    }
    return true;
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.validate()) {
        throw new Error('Invalid get text instruction');
      }

      await this.wait(this.delay);
      
      const result = await this.executeWithRetry(async () => {
        // 实现文本获取逻辑
        return { success: true, text: '' };
      });

      return {
        instructionID: this.id,
        success: true,
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
