import type { BaseInstructionClass } from '../instructions';
import { LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：管理所有待执行的指令，确保指令按创建时间顺序执行（FIFO队列），支持多标签页并发执行，为指令执行器提供有序的指令队列
 *
 * 实现方式：使用 Map 数据结构按标签页ID分组存储指令列表，每个标签页的指令数组按 created_at 字段排序，使用 shift() 方法实现 FIFO 队列
 *
 * 注意事项：
 * - 指令必须包含 tabId 字段才能被正确分组
 * - 指令按 created_at 排序，时间戳为 0 或未定义的指令会排在前面
 * - 使用 shift() 方法会修改原数组，需要确保线程安全
 * - 当标签页的指令列表为空时，会自动删除对应的 Map 键，避免内存泄漏
 * - 支持批量添加未过滤的指令（自动按标签页分组）
 *
 * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（从管理器获取指令执行），src/types/instruction.ts - BaseInstructionClass 接口（指令基类）
 */
export class InstructionManager {
  // 使用 Map 存储每个标签页的指令列表
  // key: 标签页ID, value: 该标签页的指令列表（按 created_at 排序）
  private instructionsMap: Map<number, BaseInstructionClass[]> = new Map();

  /**
   * 业务逻辑：批量添加未过滤的指令列表，自动按标签页分组，用于处理从服务器接收的混合指令列表
   *
   * 实现方式：遍历指令列表，按 tabId 字段分组到临时 Map，然后对每个标签页调用 AddInstructions 方法添加指令
   *
   * 注意事项：
   * - 没有 tabId 的指令会被忽略，不会添加到任何标签页
   * - 会自动记录日志，便于调试和监控
   * - 分组后的指令会按 created_at 排序（在 AddInstructions 中处理）
   *
   * @param instructions - 指令列表，可能包含多个标签页的指令
   *
   * 相关代码：src/managers/InstructionManager.ts - AddInstructions() 方法（实际添加指令到指定标签页）
   */
  public AddUnfilteredInstructions(instructions: BaseInstructionClass[]): void {
    // 按标签页分组指令
    const instructionsByTab: Map<number, BaseInstructionClass[]> = new Map();

    for (const instruction of instructions) {
      if (instruction.tabId) {
        if (!instructionsByTab.has(instruction.tabId)) {
          instructionsByTab.set(instruction.tabId, []);
        }
        OutputLogToFile(`[InstructionManager] Adding instruction to tab, tabId: ${instruction.tabId}, instruction: ${JSON.stringify(instruction)}`, { level: LogLevel.INFO });
        instructionsByTab.get(instruction.tabId)!.push(instruction);
      }
    }

    // 将分组后的指令存储到指令管理器
    for (const [tabId, instructions] of instructionsByTab) {
      this.AddInstructions(tabId, instructions);
    }
    OutputLogToFile(`[InstructionManager] Added unfiltered instructions successfully, total: ${instructions.length}, tabs: ${instructionsByTab.size}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：添加指令列表到指定标签页，确保指令按创建时间排序，维护 FIFO 队列顺序
   *
   * 实现方式：如果标签页不存在则创建空数组，对指令数组按 created_at 字段升序排序，然后使用扩展运算符追加到现有数组
   *
   * 注意事项：
   * - created_at 为 undefined 或 0 的指令会排在前面
   * - 排序操作会修改原数组，但不影响已存储的指令
   * - 每次添加都会记录日志，便于追踪指令添加情况
   *
   * @param tabId - 标签页ID
   * @param instructions - 要添加的指令列表
   *
   * 相关代码：src/managers/InstructionManager.ts - GetFirstInstructionByTabId() 方法（按顺序获取指令）
   */
  public AddInstructions(tabId: number, instructions: BaseInstructionClass[]): void {
    // 如果该标签页还没有指令列表，创建一个空列表
    if (!this.instructionsMap.has(tabId)) {
      this.instructionsMap.set(tabId, []);
    }
    // 根据 created_at 排序，时间越早的越靠前（FIFO 队列）
    instructions.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    // 将排序后的指令添加到该标签页的指令列表
    this.instructionsMap.get(tabId)!.push(...instructions);
    OutputLogToFile(`[InstructionManager] Added instructions to tab successfully, tabId: ${tabId}, count: ${instructions.length}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：获取所有包含待执行指令的标签页ID列表，用于确定需要执行指令的标签页
   *
   * 实现方式：使用 Array.from() 将 Map 的键集合转换为数组
   *
   * 注意事项：返回的数组不包含已清空指令的标签页ID
   *
   * @returns 标签页ID数组
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（遍历所有标签页执行指令）
   */
  public GetAllTabIds(): number[] {
    return Array.from(this.instructionsMap.keys());
  }

  /**
   * 业务逻辑：获取指定标签页的待执行指令数量，用于监控和统计
   *
   * 实现方式：从 Map 中获取指定标签页的指令数组，返回其长度，如果不存在则返回 0
   *
   * 注意事项：标签页不存在时返回 0，不会抛出异常
   *
   * @param tabId - 标签页ID
   * @returns 指令数量
   */
  public GetCountByTabId(tabId: number): number {
    return this.instructionsMap.get(tabId)?.length || 0;
  }

  /**
   * 业务逻辑：获取指定标签页的所有指令（不删除），用于查看和调试
   *
   * 实现方式：从 Map 中获取指定标签页的指令数组，如果不存在则返回空数组
   *
   * 注意事项：返回的是数组引用，修改会影响内部状态，建议只读使用
   *
   * @param tabId - 标签页ID
   * @returns 指令数组（可能为空）
   */
  public GetInstructionsByTabId(tabId: number): BaseInstructionClass[] {
    return this.instructionsMap.get(tabId) || [];
  }

  /**
   * 业务逻辑：从指定标签页获取第一个待执行的指令（FIFO队列），并从队列中移除，确保指令按创建顺序执行
   *
   * 实现方式：使用 shift() 方法从数组头部取出第一个元素，如果数组为空则删除对应的 Map 键，避免内存泄漏
   *
   * 注意事项：
   * - shift() 会修改原数组，确保线程安全使用
   * - 如果数组为空，会自动清理 Map 中的键值对
   * - 返回 undefined 表示该标签页没有待执行的指令
   *
   * @param tabId - 标签页ID
   * @returns 第一个指令，如果列表为空则返回 undefined
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（循环调用此方法获取指令执行）
   */
  public GetFirstInstructionByTabId(tabId: number): BaseInstructionClass | undefined {
    const instructions = this.instructionsMap.get(tabId);
    if (instructions && instructions.length > 0) {
      // 从数组头部取出第一个指令（FIFO）；shift 已修改原数组，Map 中仍为同一引用
      const instruction = instructions.shift();
      if (instruction) {
        if (instructions.length === 0) {
          this.instructionsMap.delete(tabId);
        }
        return instruction;
      }
    }
    return undefined;
  }

  /**
   * 业务逻辑：清除指定标签页的所有待执行指令，用于标签页关闭或重置时清理资源
   *
   * 实现方式：从 Map 中删除指定标签页的键值对，释放内存
   *
   * 注意事项：删除前会记录指令数量，便于监控和调试
   *
   * @param tabId - 标签页ID
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（标签页错误时清理指令）
   */
  public DeleteInstructionsByTabId(tabId: number): void {
    const count = this.instructionsMap.get(tabId)?.length || 0;
    this.instructionsMap.delete(tabId);
    OutputLogToFile(`[InstructionManager] Deleted tab instructions successfully, tabId: ${tabId}, count: ${count}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：删除指定创建时间之前的指令，用于清理过期或已执行的指令，保持队列整洁
   *
   * 实现方式：使用 filter() 方法过滤出 created_at 大于指定时间的指令，如果过滤后数组为空则删除 Map 键
   *
   * 注意事项：
   * - created_at 为 undefined 或 0 的指令会被保留（视为有效）
   * - 过滤后如果数组为空，会自动清理 Map 中的键值对
   *
   * @param tabId - 标签页ID
   * @param created_at - 创建时间戳，删除此时间之前的指令
   */
  public DeleteInstructionsByCreatedAtBefore(tabId: number, created_at: number): void {
    const instructions = this.instructionsMap.get(tabId);
    if (instructions) {
      const filtered = instructions.filter(inst => (inst.created_at ?? 0) > created_at);
      // 如果过滤后数组为空，删除对应的 key
      if (filtered.length === 0) {
        this.instructionsMap.delete(tabId);
      } else {
        this.instructionsMap.set(tabId, filtered);
      }
    }
  }

  /**
   * 业务逻辑：按“当前仍存在的标签页”清理指令 Map，用于长期运行时回收已关闭标签页占用的内存（兜底）
   *
   * 实现方式：删除 instructionsMap 中 tabId 不在 liveTabIds 内的所有键
   *
   * @param liveTabIds - 当前存在的标签页 ID 集合
   */
  public pruneStaleTabs(liveTabIds: Set<number>): void {
    for (const tabId of [...this.instructionsMap.keys()]) {
      if (!liveTabIds.has(tabId)) this.instructionsMap.delete(tabId);
    }
  }
}