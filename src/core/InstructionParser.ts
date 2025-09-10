import { ElementObject, Element } from '../types/Element';
import { 
  BaseInstruction,
  NavigateInstruction,
  LocateElementInstruction,
  ClickInstruction,
  DragInstruction,
  InputTextInstruction,
  KeyPressInstruction,
  WaitInstruction,
  GetTextInstruction
} from '../types/Instructions';

/**
 * 指令对象解析器 - 从JSON文件中解析指令对象
 */
export class InstructionParser {
  private elementManager: any; // 元素管理器引用

  constructor(elementManager?: any) {
    this.elementManager = elementManager;
  }

  /**
   * 设置元素管理器
   */
  setElementManager(elementManager: any): void {
    this.elementManager = elementManager;
  }

  /**
   * 从JSON字符串解析指令
   */
  parseFromJSON(jsonString: string): BaseInstruction[] {
    try {
      const data = JSON.parse(jsonString);
      
      if (!Array.isArray(data)) {
        throw new Error('JSON数据必须是数组格式');
      }
      
      const instructions: BaseInstruction[] = [];
      
      for (const item of data) {
        const instruction = this.parseInstruction(item);
        if (instruction) {
          instructions.push(instruction);
        }
      }
      
      console.log(`成功解析 ${instructions.length} 个指令`);
      return instructions;
    } catch (error) {
      console.error('解析JSON失败:', error);
      throw error;
    }
  }

  /**
   * 从文件解析指令
   */
  async parseFromFile(filePath: string): Promise<BaseInstruction[]> {
    try {
      const response = await fetch(filePath);
      const jsonString = await response.text();
      return this.parseFromJSON(jsonString);
    } catch (error) {
      console.error('从文件解析指令失败:', error);
      throw error;
    }
  }

  /**
   * 解析单个指令
   */
  private parseInstruction(data: any): BaseInstruction | null {
    if (!data.type || !data.id) {
      console.error('指令缺少必要字段: type 和 id');
      return null;
    }

    try {
      switch (data.type) {
        case 'navigate':
          return this.parseNavigateInstruction(data);
        case 'locate_element':
          return this.parseLocateElementInstruction(data);
        case 'click':
          return this.parseClickInstruction(data);
        case 'drag':
          return this.parseDragInstruction(data);
        case 'input_text':
          return this.parseInputTextInstruction(data);
        case 'key_press':
          return this.parseKeyPressInstruction(data);
        case 'wait':
          return this.parseWaitInstruction(data);
        case 'get_text':
          return this.parseGetTextInstruction(data);
        default:
          console.error(`未知的指令类型: ${data.type}`);
          return null;
      }
    } catch (error) {
      console.error(`解析指令失败 (${data.type}):`, error);
      return null;
    }
  }

  /**
   * 解析页面导航指令
   */
  private parseNavigateInstruction(data: any): NavigateInstruction {
    return new NavigateInstruction({
      id: data.id,
      url: data.url,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析元素定位指令
   */
  private parseLocateElementInstruction(data: any): LocateElementInstruction {
    let element: ElementObject;
    
    if (data.element) {
      // 如果提供了完整的元素数据
      element = new Element({
        name: data.element.name,
        description: data.element.description,
        selector: data.element.selector,
        selectorType: data.element.selectorType,
        parentName: data.element.parentName,
        childrenNames: data.element.childrenNames,
        relatedNames: data.element.relatedNames
      });
    } else if (data.elementName && this.elementManager) {
      // 如果只提供了元素名称，从管理器中获取
      const managedElement = this.elementManager.getElement(data.elementName);
      if (!managedElement) {
        throw new Error(`元素 "${data.elementName}" 在管理器中不存在`);
      }
      element = managedElement;
    } else {
      throw new Error('元素定位指令缺少元素信息');
    }
    
    return new LocateElementInstruction({
      id: data.id,
      element: element,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析鼠标点击指令
   */
  private parseClickInstruction(data: any): ClickInstruction {
    return new ClickInstruction({
      id: data.id,
      elementName: data.elementName || data.name,
      button: data.button,
      clickType: data.clickType,
      offsetX: data.offsetX,
      offsetY: data.offsetY,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析鼠标拖拽指令
   */
  private parseDragInstruction(data: any): DragInstruction {
    return new DragInstruction({
      id: data.id,
      sourceName: data.sourceName,
      targetName: data.targetName,
      duration: data.duration,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析文本输入指令
   */
  private parseInputTextInstruction(data: any): InputTextInstruction {
    return new InputTextInstruction({
      id: data.id,
      elementName: data.elementName || data.name,
      text: data.text,
      clearFirst: data.clearFirst,
      timeDelay: data.timeDelay,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析按键指令
   */
  private parseKeyPressInstruction(data: any): KeyPressInstruction {
    return new KeyPressInstruction({
      id: data.id,
      elementName: data.elementName || data.name,
      key: data.key,
      modifiers: data.modifiers,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析等待指令
   */
  private parseWaitInstruction(data: any): WaitInstruction {
    return new WaitInstruction({
      id: data.id,
      waitType: data.waitType,
      value: data.value,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 解析文本获取指令
   */
  private parseGetTextInstruction(data: any): GetTextInstruction {
    return new GetTextInstruction({
      id: data.id,
      elementName: data.elementName || data.name,
      textType: data.textType,
      includeHTML: data.includeHTML,
      delay: data.delay,
      retry: data.retry,
      timeout: data.timeout,
      waitVisible: data.waitVisible
    });
  }

  /**
   * 将指令序列化为JSON
   */
  serializeToJSON(instructions: BaseInstruction[]): string {
    const serializedInstructions = instructions.map(instruction => {
      const baseData = {
        type: instruction.type,
        id: instruction.id,
        delay: instruction.delay,
        retry: instruction.retry,
        timeout: instruction.timeout,
        waitVisible: instruction.waitVisible
      };

      // 根据指令类型添加特定字段
      switch (instruction.type) {
        case 'navigate':
          const navInst = instruction as NavigateInstruction;
          return { ...baseData, url: navInst.url };
          
        case 'locate_element':
          const locInst = instruction as LocateElementInstruction;
          return { 
            ...baseData, 
            element: {
              name: locInst.element.name,
              description: locInst.element.description,
              selector: locInst.element.selector,
              selectorType: locInst.element.selectorType,
              parentName: locInst.element.parentName,
              childrenNames: locInst.element.childrenNames,
              relatedNames: locInst.element.relatedNames
            }
          };
          
        case 'click':
          const clickInst = instruction as ClickInstruction;
          return { 
            ...baseData, 
            elementName: clickInst.elementName,
            button: clickInst.button,
            clickType: clickInst.clickType,
            offsetX: clickInst.offsetX,
            offsetY: clickInst.offsetY
          };
          
        case 'drag':
          const dragInst = instruction as DragInstruction;
          return { 
            ...baseData, 
            sourceName: dragInst.sourceName,
            targetName: dragInst.targetName,
            duration: dragInst.duration
          };
          
        case 'input_text':
          const inputInst = instruction as InputTextInstruction;
          return { 
            ...baseData, 
            elementName: inputInst.elementName,
            text: inputInst.text,
            clearFirst: inputInst.clearFirst,
            timeDelay: inputInst.timeDelay
          };
          
        case 'key_press':
          const keyInst = instruction as KeyPressInstruction;
          return { 
            ...baseData, 
            elementName: keyInst.elementName,
            key: keyInst.key,
            modifiers: keyInst.modifiers
          };
          
        case 'wait':
          const waitInst = instruction as WaitInstruction;
          return { 
            ...baseData, 
            waitType: waitInst.waitType,
            value: waitInst.value
          };
          
        case 'get_text':
          const getTextInst = instruction as GetTextInstruction;
          return { 
            ...baseData, 
            elementName: getTextInst.elementName,
            textType: getTextInst.textType,
            includeHTML: getTextInst.includeHTML
          };
          
        default:
          return baseData;
      }
    });

    return JSON.stringify(serializedInstructions, null, 2);
  }

  /**
   * 验证指令数据格式
   */
  validateInstructionData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data.type) {
      errors.push('缺少指令类型 (type)');
    }
    
    if (!data.id) {
      errors.push('缺少指令ID (id)');
    }
    
    // 根据指令类型验证特定字段
    switch (data.type) {
      case 'navigate':
        if (!data.url) errors.push('导航指令缺少URL');
        break;
      case 'locate_element':
        if (!data.element && !data.elementName) {
          errors.push('元素定位指令缺少元素信息');
        }
        break;
      case 'click':
        if (!data.elementName && !data.name) {
          errors.push('点击指令缺少元素名称');
        }
        break;
      case 'drag':
        if (!data.sourceName) errors.push('拖拽指令缺少源元素名称');
        if (!data.targetName) errors.push('拖拽指令缺少目标元素名称');
        break;
      case 'input_text':
        if (!data.elementName && !data.name) {
          errors.push('文本输入指令缺少元素名称');
        }
        if (data.text === undefined) {
          errors.push('文本输入指令缺少文本内容');
        }
        break;
      case 'key_press':
        if (!data.elementName && !data.name) {
          errors.push('按键指令缺少元素名称');
        }
        if (!data.key) errors.push('按键指令缺少按键名称');
        break;
      case 'wait':
        if (!data.waitType) errors.push('等待指令缺少等待类型');
        if (data.value === undefined) errors.push('等待指令缺少等待值');
        break;
      case 'get_text':
        if (!data.elementName && !data.name) {
          errors.push('文本获取指令缺少元素名称');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 批量验证指令数据
   */
  validateInstructionsData(data: any[]): { valid: boolean; errors: string[] } {
    const allErrors: string[] = [];
    
    data.forEach((item, index) => {
      const validation = this.validateInstructionData(item);
      if (!validation.valid) {
        validation.errors.forEach(error => {
          allErrors.push(`指令 ${index}: ${error}`);
        });
      }
    });
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
}
