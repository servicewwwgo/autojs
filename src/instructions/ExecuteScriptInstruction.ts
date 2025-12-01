import type { ExecuteScriptInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { ElementManager } from '../managers';

/**
 * 页面JavaScript执行指令
 */
export class ExecuteScriptInstructionClass extends BaseInstructionClass {
  public script: string;
  public args?: any[];

  constructor(instruction: ExecuteScriptInstruction, elementManager: ElementManager) {
    super(instruction, elementManager);
    this.script = instruction.script;
    this.args = instruction.args;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      script: this.script
    } as object;
  }

  public async Execute(): Promise<InstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: InstructionResult = { instructionID: this.instructionID, success: false, duration: 0 };

      // 执行JavaScript代码
      let results: any;

      if (typeof this.script === 'string') {
        // 先启用 Runtime 域
        await this.ExecuteCDPCommand('Runtime.enable', {});

        let wrappedScript = this.script;

        // 如果有参数，将脚本包装成函数调用
        if (this.args && this.args.length > 0) {
          // 将参数序列化为 JSON，然后在脚本中解析
          wrappedScript = `(function() { const args = ${JSON.stringify(this.args)}; return ${wrappedScript} })()`;
        }

        const evalResult = await this.ExecuteCDPCommand('Runtime.evaluate', { expression: wrappedScript, returnByValue: true, timeout: this.timeout });

        if (evalResult?.result?.value !== undefined) {
          results = [{ result: evalResult.result.value }];
        } else if (evalResult?.result) {
          results = [{ result: evalResult.result }];
        } else {
          throw new Error('Failed to execute script: no result returned');
        }
      } else {
        // 如果是函数对象，使用 browser.scripting.executeScript
        // 函数对象不需要序列化，可以直接传递
        results = await browser.scripting.executeScript({ target: { tabId: this.tabId }, func: this.script as any, args: this.args || [] });
      }

      return { ...defaultResult, success: true, data: { results } };
    });

    return result;
  }
}
