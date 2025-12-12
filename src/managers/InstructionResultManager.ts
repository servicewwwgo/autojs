import type { InstructionResult } from '../types';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 指令结果管理器
 * 用于保存每一个指令执行后的结果
 */
export class ResultManager {
  private results: Map<string, InstructionResult> = new Map();

  /**
   * 保存指令结果
   */
  public SaveResult(result: InstructionResult): void {
    this.results.set(result.instructionID, result);
    OutputLogToFile(`结果管理器: 保存指令结果成功，指令ID: ${result.instructionID}, 成功: ${result.success}`, { level: LogLevel.INFO });
  }

  /**
   * 获取指令结果
   */
  public GetResult(instructionID: string): InstructionResult | undefined {
    return this.results.get(instructionID);
  }

  /**
   * 获取所有结果
   */
  public GetAllResults(): InstructionResult[] {
    return Array.from(this.results.values());
  }

  /**
   * 清除所有结果
   */
  public ClearAll(): void {
    const count = this.results.size;
    this.results.clear();
    OutputLogToFile(`结果管理器: 清除所有结果成功，清除数量: ${count}`, { level: LogLevel.INFO });
  }

  /**
   * 清除指定指令的结果
   */
  public ClearResult(instructionID: string): void {
    const deleted = this.results.delete(instructionID);
    if (deleted) {
      OutputLogToFile(`结果管理器: 清除指令结果成功，指令ID: ${instructionID}`, { level: LogLevel.INFO });
    }
  }

  /**
   * 批量获取结果
   */
  public GetResults(instructionIDs: string[]): InstructionResult[] {
    return instructionIDs
      .map(id => this.results.get(id))
      .filter((result): result is InstructionResult => result !== undefined);
  }
}