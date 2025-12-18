/**
 * 指令类统一导出
 */
import type { Instruction, FindElementInstruction, KeyboardInstruction, MouseInstruction, InputInstruction, GetAttributeInstruction, SetAttributeInstruction, NavigateInstruction, ScreenshotInstruction, ExecuteScriptInstruction } from '../types';

import { BaseInstructionClass } from './BaseInstruction';
import { FindElementInstructionClass } from './FindElementInstruction';
import { KeyboardInstructionClass } from './KeyboardInstruction';
import { MouseInstructionClass } from './MouseInstruction';
import { InputInstructionClass } from './InputInstruction';
import { GetAttributeInstructionClass } from './GetAttributeInstruction';
import { SetAttributeInstructionClass } from './SetAttributeInstruction';
import { NavigateInstructionClass } from './NavigateInstruction';
import { ScreenshotInstructionClass } from './ScreenshotInstruction';
import { ExecuteScriptInstructionClass } from './ExecuteScriptInstruction';

// 导出基础类
export { BaseInstructionClass } from './BaseInstruction';

// 导出具体指令类
export { FindElementInstructionClass } from './FindElementInstruction';
export { KeyboardInstructionClass } from './KeyboardInstruction';
export { MouseInstructionClass } from './MouseInstruction';
export { InputInstructionClass } from './InputInstruction';
export { GetAttributeInstructionClass } from './GetAttributeInstruction';
export { SetAttributeInstructionClass } from './SetAttributeInstruction';
export { NavigateInstructionClass } from './NavigateInstruction';
export { ScreenshotInstructionClass } from './ScreenshotInstruction';
export { ExecuteScriptInstructionClass } from './ExecuteScriptInstruction';

/**
 * 指令工厂类
 * 根据指令类型创建对应的指令执行类
 * 
 * 使用工厂模式来创建不同类型的指令实例，确保类型安全
 */
export class InstructionFactory {
  /**
   * 根据指令对象创建对应的指令执行类实例
   * @param instruction - 指令对象，必须是有效的 Instruction 类型
   * @returns 对应的指令执行类实例
   * @throws 如果指令类型未知，抛出错误
   */
  public static create(instruction: Instruction): BaseInstructionClass {
    switch (instruction.type) {
      case 'find_element':
        return new FindElementInstructionClass(instruction as FindElementInstruction);
      case 'keyboard':
        return new KeyboardInstructionClass(instruction as KeyboardInstruction);
      case 'mouse':
        return new MouseInstructionClass(instruction as MouseInstruction);
      case 'input':
        return new InputInstructionClass(instruction as InputInstruction);
      case 'get_attribute':
        return new GetAttributeInstructionClass(instruction as GetAttributeInstruction);
      case 'set_attribute':
        return new SetAttributeInstructionClass(instruction as SetAttributeInstruction);
      case 'navigate':
        return new NavigateInstructionClass(instruction as NavigateInstruction);
      case 'screenshot':
        return new ScreenshotInstructionClass(instruction as ScreenshotInstruction);
      case 'execute_script':
        return new ExecuteScriptInstructionClass(instruction as ExecuteScriptInstruction);
      default:
        // 使用类型守卫确保类型安全
        const unknownType = (instruction as any).type;
        throw new Error(`Unknown instruction type: ${unknownType}`);
    }
  }

  /**
 * 将指令对象转换为对象
 * @param instruction - 指令对象，必须是有效的 Instruction 类型
 * @returns 转换后的对象
 */
  public static toObject(instruction: Instruction): object {
    return InstructionFactory.create(instruction).ToObject();
  }
}