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
      // 执行JavaScript代码
      let results: any;
      if (typeof this.script === 'string') {
        // 如果是字符串，直接执行
        results = await browser.scripting.executeScript({
          target: { tabId: this.tabId },
          func: new Function(...(this.args?.map((_: any, i: number) => `arg${i}`) || []), this.script) as (...args: any[]) => unknown,
          args: this.args || []
        });
      } else {
        // 如果是函数，直接使用
        results = await browser.scripting.executeScript({
          target: { tabId: this.tabId },
          func: this.script as any,
          args: this.args || []
        });
      }

      return {
        instructionID: this.instructionID,
        success: true,
        duration: 0,
        data: { results }
      } as InstructionResult;
    });

    return result;
  }
}
