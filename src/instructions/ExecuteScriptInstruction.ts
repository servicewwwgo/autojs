import type { ExecuteScriptInstruction, ExecuteScriptInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 页面JavaScript执行指令
 */
export class ExecuteScriptInstructionClass extends BaseInstructionClass {
  public params: any;

  constructor(instruction: ExecuteScriptInstruction) {
    super(instruction);
    this.params = instruction.params;
  }

  public async Execute(): Promise<ExecuteScriptInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: ExecuteScriptInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

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
