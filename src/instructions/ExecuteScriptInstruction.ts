import type { ExecuteScriptInstruction, ExecuteScriptInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：在页面上下文中执行自定义 JavaScript 代码，用于获取页面数据、执行复杂逻辑、操作页面 DOM 等需要页面上下文的功能
 *
 * 实现方式：继承自 BaseInstructionClass，使用 CDP 的 Runtime.evaluate 方法在页面上下文中执行 JavaScript 代码
 *
 * 注意事项：
 * - 代码执行在页面上下文中，可以访问页面的 DOM、全局变量和 JavaScript 对象
 * - 需要先启用 Runtime 域（Runtime.enable），如果已启用会忽略错误
 * - params.expression 为必需参数，包含要执行的 JavaScript 代码字符串
 * - 支持设置超时时间（timeout 属性），单位为秒，会自动转换为毫秒
 * - 如果代码执行出错，会返回包含异常信息的错误结果
 * - 执行结果可以是任何可序列化的 JavaScript 值（对象、数组、字符串等）
 *
 * 相关代码：src/types/instruction.ts - ExecuteScriptInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
 */
export class ExecuteScriptInstructionClass extends BaseInstructionClass {
  public params: any;

  constructor(instruction: ExecuteScriptInstruction) {
    super(instruction);
    this.params = instruction.params;
  }

  /**
   * 业务逻辑：执行页面 JavaScript 代码，获取执行结果并返回，用于数据提取、页面操作和自定义逻辑执行
   *
   * 实现方式：先验证参数，启用 Runtime 域，然后使用 Runtime.evaluate 执行代码，检查异常并返回结果
   *
   * 注意事项：
   * - 执行前会先调用 Delay() 方法处理延迟
   * - params 和 params.expression 为必需参数，缺少会返回错误
   * - Runtime.enable 如果已启用会忽略错误，不影响执行
   * - 如果代码执行出错（exceptionDetails），会返回包含异常描述的错误结果
   * - timeout 属性单位为秒，会转换为毫秒传递给 Runtime.evaluate
   * - 执行成功后会记录日志，便于调试和监控
   * - 返回结果包含执行结果（results 字段），类型取决于代码返回值
   *
   * 相关代码：src/types/instruction.ts - ExecuteScriptInstructionResult 接口（结果数据结构），src/instructions/BaseInstruction.ts - ExecuteCDPCommand() 方法（执行 CDP 命令）
   */
  public async Execute(): Promise<ExecuteScriptInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: ExecuteScriptInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

      // 如果设置了延迟，先等待
      await this.Delay(this.delay);

      // 验证参数
      if (!this.params || typeof this.params !== 'object') {
        return { ...defaultResult, error: 'params is required and must be an object' } as ExecuteScriptInstructionResult;
      }

      if (!this.params.expression || typeof this.params.expression !== 'string') {
        return { ...defaultResult, error: 'params.expression is required and must be a string' } as ExecuteScriptInstructionResult;
      }

      // 启用 Runtime 域（如果尚未启用）
      try {
        await this.ExecuteCDPCommand('Runtime.enable');
      } catch (error) {
        // 如果已经启用，忽略错误
        OutputLogToFile(`[ExecuteScriptInstruction] Runtime.enable warning: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
      }

      // 执行JavaScript代码
      const evalResult = await this.ExecuteCDPCommand('Runtime.evaluate', {
        ...this.params,
        timeout: this.timeout ? this.timeout * 1000 : undefined // 将秒转换为毫秒
      });

      // 检查是否有异常
      if (evalResult?.exceptionDetails) {
        const exceptionText = evalResult.exceptionDetails.exception?.description || evalResult.exceptionDetails.text || 'Unknown JavaScript error';
        return { ...defaultResult, error: `JavaScript execution error: ${exceptionText}` } as ExecuteScriptInstructionResult;
      }

      OutputLogToFile(`[ExecuteScriptInstruction] JavaScript executed successfully`, { level: LogLevel.INFO });

      return { ...defaultResult, success: true, data: { results: evalResult } } as ExecuteScriptInstructionResult;
    });

    return result as ExecuteScriptInstructionResult;
  }
}
