/**
 * 业务逻辑：统一导出所有指令类和指令工厂，提供统一的指令创建和管理接口，简化指令的使用和管理
 *
 * 实现方式：导出所有指令类和指令工厂类，使用工厂模式根据指令类型创建对应的指令实例
 *
 * 注意事项：
 * - 所有指令类都继承自 BaseInstructionClass
 * - InstructionFactory 使用工厂模式根据指令的 type 字段创建对应的指令实例
 * - 如果指令类型未知，会抛出错误
 * - 支持将指令对象转换为普通对象（toObject 方法），用于序列化
 *
 * 相关代码：src/instructions/ - 各种指令类（导出的指令类），src/types/instruction.ts - Instruction 联合类型（指令类型定义）
 */
import type { ActivateTabInstruction, ExecuteScriptInstruction, FindElementInstruction, GetAttributeInstruction, GetUrlInstruction, InputInstruction, Instruction, KeyboardInstruction, MouseInstruction, NavigateInstruction, ScreenshotInstruction, SetAttributeInstruction, WaitInstruction } from '../types';

import { ActivateTabInstructionClass } from './ActivateTabInstruction';
import { BaseInstructionClass } from './BaseInstruction';
import { ExecuteScriptInstructionClass } from './ExecuteScriptInstruction';
import { FindElementInstructionClass } from './FindElementInstruction';
import { GetAttributeInstructionClass } from './GetAttributeInstruction';
import { GetUrlInstructionClass } from './GetUrlInstruction';
import { InputInstructionClass } from './InputInstruction';
import { KeyboardInstructionClass } from './KeyboardInstruction';
import { MouseInstructionClass } from './MouseInstruction';
import { NavigateInstructionClass } from './NavigateInstruction';
import { ScreenshotInstructionClass } from './ScreenshotInstruction';
import { SetAttributeInstructionClass } from './SetAttributeInstruction';
import { WaitInstructionClass } from './WaitInstruction';

// 导出基础类
export { BaseInstructionClass } from './BaseInstruction';

// 导出具体指令类
export { ActivateTabInstructionClass } from './ActivateTabInstruction';
export { ExecuteScriptInstructionClass } from './ExecuteScriptInstruction';
export { FindElementInstructionClass } from './FindElementInstruction';
export { GetAttributeInstructionClass } from './GetAttributeInstruction';
export { GetUrlInstructionClass } from './GetUrlInstruction';
export { InputInstructionClass } from './InputInstruction';
export { KeyboardInstructionClass } from './KeyboardInstruction';
export { MouseInstructionClass } from './MouseInstruction';
export { NavigateInstructionClass } from './NavigateInstruction';
export { ScreenshotInstructionClass } from './ScreenshotInstruction';
export { SetAttributeInstructionClass } from './SetAttributeInstruction';
export { WaitInstructionClass } from './WaitInstruction';

/**
 * 业务逻辑：指令工厂类，根据指令类型创建对应的指令执行类实例，使用工厂模式确保类型安全和统一管理
 *
 * 实现方式：使用 switch 语句根据指令的 type 字段创建对应的指令类实例，支持所有指令类型
 *
 * 注意事项：
 * - 使用工厂模式统一管理指令创建逻辑，避免在多个地方重复代码
 * - 根据指令的 type 字段路由到对应的指令类，确保类型安全
 * - 如果指令类型未知，会抛出包含未知类型的错误
 * - 支持将指令对象转换为普通对象（toObject 方法），用于序列化和传输
 * - 所有指令类都继承自 BaseInstructionClass，具有统一的接口
 *
 * 相关代码：src/types/instruction.ts - Instruction 联合类型（指令类型定义），src/instructions/ - 各种指令类（创建的指令实例），src/managers/InstructionManager.ts - 指令管理器（使用此工厂创建指令）
 */
export class InstructionFactory {
  /**
   * 业务逻辑：根据指令对象创建对应的指令执行类实例，使用工厂模式确保类型安全和统一管理
   *
   * 实现方式：使用 switch 语句根据指令的 type 字段创建对应的指令类实例，使用类型断言确保类型正确
   *
   * 注意事项：
   * - instruction 参数必须是有效的 Instruction 类型
   * - 根据 type 字段路由到对应的指令类，支持所有指令类型（find_element、keyboard、mouse、input 等）
   * - 如果指令类型未知，会抛出包含未知类型的错误，便于问题排查
   * - 返回的指令实例继承自 BaseInstructionClass，具有统一的执行接口
   * - 使用类型断言（as）确保类型正确，TypeScript 会在编译时进行类型检查
   *
   * 相关代码：src/types/instruction.ts - Instruction 联合类型（指令类型定义），src/instructions/ - 各种指令类（创建的指令实例），src/managers/InstructionManager.ts - 指令管理器（使用此方法创建指令）
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
      case 'wait':
        return new WaitInstructionClass(instruction as WaitInstruction);
      case 'get_url':
        return new GetUrlInstructionClass(instruction as GetUrlInstruction);
      case 'activate_tab':
        return new ActivateTabInstructionClass(instruction as ActivateTabInstruction);
      default:
        // 使用类型守卫确保类型安全
        const unknownType = (instruction as any).type;
        throw new Error(`Unknown instruction type: ${unknownType}`);
    }
  }

  /**
   * 业务逻辑：将指令对象转换为普通对象，用于序列化和传输，确保指令数据可以安全地转换为 JSON 格式
   *
   * 实现方式：先使用 create() 方法创建指令实例，然后调用 ToObject() 方法转换为普通对象
   *
   * 注意事项：
   * - instruction 参数必须是有效的 Instruction 类型
   * - 转换后的对象不包含类方法，仅包含数据字段，适合 JSON 序列化
   * - 此方法用于指令的序列化和传输，确保指令数据可以安全地保存和传输
   *
   * 相关代码：src/instructions/BaseInstruction.ts - ToObject() 方法（实际转换逻辑），create() 方法（创建指令实例）
   */
  public static toObject(instruction: Instruction): object {
    return InstructionFactory.create(instruction).ToObject();
  }
}