import type { InstructionResult } from '../types';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 业务逻辑：管理指令执行结果，按标签页分组存储，用于收集执行统计、错误追踪和结果上报
 *
 * 实现方式：使用 Map 数据结构按标签页ID分组存储结果数组，每个结果包含执行状态、错误信息和执行数据
 *
 * 注意事项：
 * - 结果按标签页分组，便于批量处理和上报
 * - 支持获取并删除操作，避免重复上报
 * - 结果会记录到日志文件，便于问题排查
 *
 * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（保存执行结果），src/types/instruction.ts - InstructionResult 接口（结果类型定义）
 */
export class ResultManager {
  private results: Map<number, InstructionResult[]> = new Map();

  /**
   * 业务逻辑：保存单个指令的执行结果，用于记录执行状态和统计信息
   *
   * 实现方式：从 Map 中获取或创建标签页的结果数组，将新结果追加到数组末尾
   *
   * 注意事项：
   * - 结果会按标签页分组存储，便于后续批量获取
   * - 每次保存都会记录日志，包含成功/失败状态
   *
   * @param result - 指令执行结果对象
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（执行指令后调用此方法）
   */
  public SaveResult(result: InstructionResult): void {
    let tabResults = this.results.get(result.tabId) ?? [];
    tabResults.push(result);
    this.results.set(result.tabId, tabResults);
    OutputLogToFile(`[ResultManager] Saved tab result successfully, tabId: ${result.tabId}, success: ${result.success}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：获取指定标签页的所有执行结果（不删除），用于查看和调试
   *
   * 实现方式：从 Map 中获取指定标签页的结果数组
   *
   * 注意事项：返回的是数组引用，修改会影响内部状态，建议只读使用；标签页不存在时返回 undefined
   *
   * @param tabId - 标签页ID
   * @returns 结果数组，如果标签页不存在则返回 undefined
   */
  public GetResult(tabId: number): InstructionResult[] | undefined {
    return this.results.get(tabId);
  }

  /**
   * 业务逻辑：获取指定标签页的所有执行结果并删除，用于一次性获取并上报结果，避免重复处理
   *
   * 实现方式：从 Map 中获取结果数组，若该 tabId 存在条目则从 Map 中移除（含空数组），然后返回结果
   *
   * 注意事项：
   * - 只要该标签页在 Map 中有条目就会删除，空数组也会从 Map 中移除，避免残留键
   * - 返回 undefined 表示该标签页没有结果或结果已被删除
   *
   * @param tabId - 标签页ID
   * @returns 结果数组（可能为空数组），如果标签页不存在则返回 undefined
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（获取结果后通过 WebSocket 上报）
   */
  public GetResultAndDelete(tabId: number): InstructionResult[] | undefined {
    const results = this.results.get(tabId);

    if (results !== undefined) {
      this.results.delete(tabId);
    }

    return results;
  }

  /**
   * 业务逻辑：清除指定标签页的所有执行结果，用于标签页关闭或重置时清理资源
   *
   * 实现方式：从 Map 中删除指定标签页的键值对
   *
   * 注意事项：删除操作会记录日志，便于监控和调试
   *
   * @param tabId - 标签页ID
   */
  public ClearResult(tabId: number): void {
    this.results.delete(tabId);
    OutputLogToFile(`[ResultManager] Cleared tab result successfully, tabId: ${tabId}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：获取所有标签页的执行结果，用于全局统计和监控
   *
   * 实现方式：将 Map 的所有值（数组）提取出来，使用 flat() 方法展平为一维数组
   *
   * 注意事项：返回的是新数组，不会影响内部状态
   *
   * @returns 所有标签页的结果数组（展平后的一维数组）
   */
  public GetAllResults(): InstructionResult[] {
    return Array.from(this.results.values()).flat();
  }

  /**
   * 业务逻辑：清除所有标签页的执行结果，用于系统重置或清理内存
   *
   * 实现方式：使用 Map.clear() 方法清空所有键值对
   *
   * 注意事项：清空前会记录标签页数量，便于监控和调试
   */
  public ClearAll(): void {
    const count = this.results.size;
    this.results.clear();
    OutputLogToFile(`[ResultManager] Cleared all tab results successfully, count: ${count}`, { level: LogLevel.INFO });
  }
}