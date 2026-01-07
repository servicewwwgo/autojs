import type { ExecuteScriptInstruction, ExecuteScriptInstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 页面JavaScript执行指令
 * 
 */
export class ExecuteScriptInstructionClass extends BaseInstructionClass {
  constructor(instruction: ExecuteScriptInstruction) {
    super(instruction);
  }

  public async Execute(): Promise<ExecuteScriptInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: ExecuteScriptInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 执行JavaScript代码
      let results: any = await this.ExecuteCDPCommand('Runtime.evaluate', this.params);

      return { ...defaultResult, success: true, data: { results } } as ExecuteScriptInstructionResult;
    });

    return result as ExecuteScriptInstructionResult;
  }
}
