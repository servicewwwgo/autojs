import type { ExecuteScriptInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 页面JavaScript执行指令
 * 
 */
export class ExecuteScriptInstructionClass extends BaseInstructionClass {
  public expression: string;
  public objectGroup?: string;
  public includeCommandLineAPI?: boolean;
  public silent?: boolean;
  public contextId?: any;
  public returnByValue?: boolean;
  public generatePreview?: boolean;
  public userGesture?: boolean;
  public awaitPromise?: boolean;
  public throwOnSideEffect?: boolean;
  public disableBreaks?: boolean;
  public replMode?: boolean;
  public allowUnsafeEvalBlockedByCSP?: boolean;
  public uniqueContextId?: string;
  public serializationOptions?: any;

  constructor(instruction: ExecuteScriptInstruction) {
    super(instruction);

    this.expression = instruction.expression;
    this.objectGroup = instruction.objectGroup;
    this.includeCommandLineAPI = instruction.includeCommandLineAPI;
    this.silent = instruction.silent;
    this.contextId = instruction.contextId;
    this.returnByValue = instruction.returnByValue;
    this.generatePreview = instruction.generatePreview;
    this.userGesture = instruction.userGesture;
    this.awaitPromise = instruction.awaitPromise;
    this.throwOnSideEffect = instruction.throwOnSideEffect;
    this.disableBreaks = instruction.disableBreaks;
    this.replMode = instruction.replMode;
    this.allowUnsafeEvalBlockedByCSP = instruction.allowUnsafeEvalBlockedByCSP;
    this.uniqueContextId = instruction.uniqueContextId;
    this.serializationOptions = instruction.serializationOptions;
  }

  ToObject(): object {
    return {
      ...super.ToObject(),
      expression: this.expression,
      objectGroup: this.objectGroup,
      includeCommandLineAPI: this.includeCommandLineAPI,
      silent: this.silent,
      contextId: this.contextId,
      returnByValue: this.returnByValue,
      generatePreview: this.generatePreview,
      userGesture: this.userGesture,
      awaitPromise: this.awaitPromise,
      throwOnSideEffect: this.throwOnSideEffect,
      disableBreaks: this.disableBreaks,
      replMode: this.replMode,
      allowUnsafeEvalBlockedByCSP: this.allowUnsafeEvalBlockedByCSP,
      uniqueContextId: this.uniqueContextId,
      serializationOptions: this.serializationOptions
    } as object;
  }

  public async Execute(): Promise<InstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 构建 Runtime.evaluate 参数对象，尽可能原样还原 CDP 接口
      const params: any = {
        expression: this.expression
      };

      // 添加所有可选参数（仅当已定义时）
      if (this.objectGroup !== undefined) params.objectGroup = this.objectGroup;
      if (this.includeCommandLineAPI !== undefined) params.includeCommandLineAPI = this.includeCommandLineAPI;
      if (this.silent !== undefined) params.silent = this.silent;
      if (this.contextId !== undefined) params.contextId = this.contextId;
      if (this.returnByValue !== undefined) params.returnByValue = this.returnByValue;
      if (this.generatePreview !== undefined) params.generatePreview = this.generatePreview;
      if (this.userGesture !== undefined) params.userGesture = this.userGesture;
      if (this.awaitPromise !== undefined) params.awaitPromise = this.awaitPromise;
      if (this.throwOnSideEffect !== undefined) params.throwOnSideEffect = this.throwOnSideEffect;
      if (this.disableBreaks !== undefined) params.disableBreaks = this.disableBreaks;
      if (this.replMode !== undefined) params.replMode = this.replMode;
      if (this.allowUnsafeEvalBlockedByCSP !== undefined) params.allowUnsafeEvalBlockedByCSP = this.allowUnsafeEvalBlockedByCSP;
      if (this.uniqueContextId !== undefined) params.uniqueContextId = this.uniqueContextId;
      if (this.serializationOptions !== undefined) params.serializationOptions = this.serializationOptions;
      if (this.timeout !== undefined) params.timeout = this.timeout;

      // 执行JavaScript代码
      let results: any = await this.ExecuteCDPCommand('Runtime.evaluate', params);

      return { ...defaultResult, success: true, data: { results } };
    });

    return result;
  }
}
