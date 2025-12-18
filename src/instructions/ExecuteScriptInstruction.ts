import type { ExecuteScriptInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 页面JavaScript执行指令
 * 
 */
export class ExecuteScriptInstructionClass extends BaseInstructionClass {
  public params: any;

  constructor(instruction: ExecuteScriptInstruction) {
    super(instruction);

    this.params = instruction.params;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),

      params: this.params
    } as object;
  }

  public async Execute(): Promise<InstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 执行JavaScript代码
      let results: any = await this.ExecuteCDPCommand('Runtime.evaluate', this.params);

      return { ...defaultResult, success: true, data: { results } };
    });

    return result;
  }
}
