import type { BaseInstructionClass } from '../instructions';

/**
 * 指令对象管理器
 * 用于保存每一个待执行的指令，按标签页ID分组，根据created_at排序
 * 
 * 职责：
 * - 管理所有待执行的指令
 * - 按标签页分组存储指令
 * - 确保指令按创建时间排序（FIFO 队列）
 */
export class InstructionManager {
  // 使用 Map 存储每个标签页的指令列表
  // key: 标签页ID, value: 该标签页的指令列表（按 created_at 排序）
  private instructionsMap: Map<number, BaseInstructionClass[]> = new Map();

  /**
   * 添加未过滤的指令列表（自动按标签页分组）
   * @param instructions - 指令列表，可能包含多个标签页的指令
   * @remarks
   * 自动将指令按 tabId 分组，然后调用 AddInstructions 添加到对应标签页
   */
  public AddUnfilteredInstructions(instructions: BaseInstructionClass[]): void {
    // 按标签页分组指令
    const instructionsByTab: Map<number, BaseInstructionClass[]> = new Map();

    for (const instruction of instructions) {
      if (instruction.tabId) {
        if (!instructionsByTab.has(instruction.tabId)) {
          instructionsByTab.set(instruction.tabId, []);
        }
        instructionsByTab.get(instruction.tabId)!.push(instruction);
      }
    }

    // 将分组后的指令存储到指令管理器
    for (const [tabId, instructions] of instructionsByTab) {
      this.AddInstructions(tabId, instructions);
    }
  }

  /**
   * 添加指令列表到指定标签页
   * @param tabId - 标签页ID
   * @param instructions - 要添加的指令列表
   * @remarks
   * 指令会根据 created_at 排序，时间越早的越靠前（FIFO 队列）
   * 确保指令按创建顺序执行
   */
  public AddInstructions(tabId: number, instructions: BaseInstructionClass[]): void {
    // 如果该标签页还没有指令列表，创建一个空列表
    if (!this.instructionsMap.has(tabId)) {
      this.instructionsMap.set(tabId, []);
    }
    // 根据 created_at 排序，时间越早的越靠前（FIFO 队列）
    instructions.sort((a, b) => a.created_at - b.created_at);
    // 将排序后的指令添加到该标签页的指令列表
    this.instructionsMap.get(tabId)!.push(...instructions);
  }

  /**
   * 获取所有标签页ID
   */
  public GetAllTabIds(): number[] {
    return Array.from(this.instructionsMap.keys());
  }

  /**
   * 获取指定标签页的指令数量
   */
  public GetCountByTabId(tabId: number): number {
    return this.instructionsMap.get(tabId)?.length || 0;
  }

  /**
   * 获取指定标签页的所有指令
   */
  public GetInstructionsByTabId(tabId: number): BaseInstructionClass[] {
    return this.instructionsMap.get(tabId) || [];
  }

  /**
   * 获取指定标签页的第一个指令（FIFO 队列），并从列表中删除
   * @param tabId - 标签页ID
   * @returns 第一个指令，如果列表为空则返回 undefined
   * @remarks
   * 使用 shift() 方法从数组头部取出第一个元素（FIFO）
   * 由于指令已按 created_at 排序，这确保按创建顺序执行
   */
  public GetFirstInstructionByTabId(tabId: number): BaseInstructionClass | undefined {
    const instructions = this.instructionsMap.get(tabId);
    if (instructions && instructions.length > 0) {
      // 从数组头部取出第一个指令（FIFO）
      const instruction = instructions.shift();
      if (instruction) {
        // 更新指令列表（shift 已修改原数组，这里确保 Map 中的引用正确）
        this.instructionsMap.set(tabId, instructions);
        return instruction;
      }
    }
    return undefined;
  }

  /**
   * 清除指定标签页的所有指令
   */
  public DeleteInstructionsByTabId(tabId: number): void {
    this.instructionsMap.delete(tabId);
  }

  /**
   * 删除指定创建时间之前的指令
   */
  public DeleteInstructionsByCreatedAtBefore(tabId: number, created_at: number): void {
    const instructions = this.instructionsMap.get(tabId);
    if (instructions) {
      const filtered = instructions.filter(inst => inst.created_at > created_at);
      this.instructionsMap.set(tabId, filtered);
    }
  }
}