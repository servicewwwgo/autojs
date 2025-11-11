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

const INSTRUCTION_MAP = {
  'navigate': NavigateInstruction,
  'locate_element': LocateElementInstruction,
  'click': ClickInstruction,
  'drag': DragInstruction,
  'input_text': InputTextInstruction,
  'key_press': KeyPressInstruction,
  'wait': WaitInstruction,
  'get_text': GetTextInstruction
};

/**
 * 指令对象解析器 - 从JSON文件中解析指令对象
 */
export class InstructionParser {
  private elementManager: any; // 元素管理器引用

  constructor(elementManager?: any) {
    this.elementManager = elementManager;
  }

  /**
   * 解析单个指令
   */
  private parseInstruction(data: any): BaseInstruction {
    const InstructionClass = INSTRUCTION_MAP[data.type as keyof typeof INSTRUCTION_MAP];

    if (!InstructionClass) {
      throw new Error(`未知的指令类型: ${data.type}`);
    }

    return new InstructionClass(data);
  }

  /**
   * 设置元素管理器
   */
  setElementManager(elementManager: any): void {
    this.elementManager = elementManager;
  }

  /*
   * 从JSON字符串解析单个指令
   */
  parseFromJSONString(jsonString: string): BaseInstruction {
    const data = JSON.parse(jsonString);
    const instruction = this.parseInstruction(data);

    if (!instruction) {
      throw new Error('解析指令失败');
    }

    return instruction;
  }

  /**
   * 从JSON字符串解析指令
   */
  parseFromJSON(jsonString: string): BaseInstruction[] {
    const data = JSON.parse(jsonString);

    if (!Array.isArray(data)) {
      throw new Error('JSON数据必须是数组格式');
    }

    const instructions: BaseInstruction[] = [];

    for (const item of data) {
      const instruction = this.parseInstruction(item);

      if (!instruction) {
        throw new Error('解析指令失败');
      }

      instructions.push(instruction);
    }

    console.log(`成功解析 ${instructions.length} 个指令`);
    return instructions;
  }

  /**
   * 从文件解析指令
   */
  async parseFromFile(filePath: string): Promise<BaseInstruction[]> {
    const response = await fetch(filePath);
    const jsonString = await response.text();
    return this.parseFromJSON(jsonString);
  }

  /**
   * 将指令序列化为 JSON
   */
  serializeToJSON(instructions: BaseInstruction[]): string {
    return JSON.stringify(instructions.map(instruction => instruction.ToObject()), null, 2);
  }
}
