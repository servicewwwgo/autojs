import type { InstructionResult } from '../types';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 指令结果管理器
 * 用于保存每一个指令执行后的结果
 */
export class ResultManager {
  private results: Map<number, InstructionResult[]> = new Map();

  /**
   * 保存指令结果
   */
  public SaveResult(result: InstructionResult): void {
    let tabResults = this.results.get(result.tabId) ?? [];
    tabResults.push(result);
    this.results.set(result.tabId, tabResults);
    OutputLogToFile(`[ResultManager] Saved tab result successfully, tabId: ${result.tabId}, success: ${result.success}`, { level: LogLevel.INFO });
  }

  /**
   * 获取标签页结果
   */
  public GetResult(tabId: number): InstructionResult[] | undefined {
    return this.results.get(tabId);
  }

  /**
   * 获取标签页结果
   */
  public GetResultAndDelete(tabId: number): InstructionResult[] | undefined {
    const results = this.results.get(tabId);

    if (results && results.length > 0) {
      this.results.delete(tabId);
    }

    return results;
  }

  /**
   * 清除指定标签页的结果
   */
  public ClearResult(tabId: number): void {
    this.results.delete(tabId);
    OutputLogToFile(`[ResultManager] Cleared tab result successfully, tabId: ${tabId}`, { level: LogLevel.INFO });
  }

  /**
   * 获取所有标签页结果
   */
  public GetAllResults(): InstructionResult[] {
    return Array.from(this.results.values()).flat();
  }

  /**
   * 清除所有标签页结果
   */
  public ClearAll(): void {
    const count = this.results.size;
    this.results.clear();
    OutputLogToFile(`[ResultManager] Cleared all tab results successfully, count: ${count}`, { level: LogLevel.INFO });
  }
}