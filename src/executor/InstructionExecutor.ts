import { BaseInstructionClass, InstructionFactory } from '../instructions';
import { InstructionManager, ResultManager } from '../managers';
import { BaseInstruction, InstructionResult, InstructionResults, InstructionsRequestPayload, InstructionsResponsePayload, WSMessage } from '../types';
import { EnsureCDPConnected, ExecuteCDPCommand, LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：管理和执行自动化指令队列，按照 FIFO 顺序在指定标签页中执行指令，统计执行结果并发送给服务器
 *
 * 实现方式：使用 InstructionManager 管理指令队列，通过 CDP 协议执行指令，使用 ResultManager 收集和发送执行结果
 *
 * 注意事项：
 * - 执行器采用 FIFO（先进先出）队列模式，按标签页分组执行指令
 * - 执行前会确保 CDP 连接并启用必要的 CDP 域（DOM、CSS、Page、Runtime）
 * - 如果标签页不存在，会自动清理该标签页的所有待执行指令，避免重复尝试
 * - 主循环在「无待执行标签页」时退出；每轮内各标签页并发执行，互不阻塞
 * - 执行结果会通过 sendResult 回调函数发送（通常发送到 WebSocket）
 *
 * 相关代码：src/managers/InstructionManager.ts - 指令管理器，src/managers/InstructionResultManager.ts - 结果管理器，src/instructions/ - 各种指令实现，src/utils/index.ts - CDP 工具函数
 */
export class InstructionExecutor {
  private instructionManager: InstructionManager;
  private resultManager: ResultManager;

  private executedCount: number = 0;
  private successCount: number = 0;
  private errorCount: number = 0;

  private startTime: number = Date.now();

  private sendResult: ((result: InstructionsResponsePayload) => void) | undefined;

  /** 当前正在执行 runTabLoop 的 tabId 集合，用于避免同一标签页被并发执行 */
  private runningTabIds: Set<number> = new Set();

  constructor() {
    this.instructionManager = new InstructionManager();
    this.resultManager = new ResultManager();
  }

  /**
   * 业务逻辑：设置执行结果的回调函数，用于将指令执行结果发送到外部（如 WebSocket 服务器），实现执行结果的实时传递
   *
   * 实现方式：将回调函数保存到私有属性 sendResult 中，在执行完成后通过此回调发送结果
   *
   * 注意事项：
   * - 必须在执行指令前设置此回调，否则结果无法发送
   * - 回调函数会在 ExecuteAll() 方法中，每个标签页的指令执行完成后调用
   * - 如果未设置回调，执行结果仍会保存到 ResultManager，但不会主动发送
   *
   * @param sendResult - 发送指令结果的函数，接收 InstructionsResponsePayload（含 id、tabId、results）
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（调用此回调），src/entrypoints/background.ts - 设置 WebSocket 发送回调
   */
  public setSendResult(sendResult: (result: InstructionsResponsePayload) => void): void {
    this.sendResult = sendResult;
  }

  /**
   * 业务逻辑：获取指令管理器实例，允许外部代码访问和管理指令队列，用于查询、修改指令状态等操作
   *
   * 实现方式：返回私有属性 instructionManager 的引用
   *
   * 注意事项：返回的是同一个实例的引用，外部修改会影响执行器的内部状态
   *
   * @returns 指令管理器实例
   *
   * 相关代码：src/managers/InstructionManager.ts - InstructionManager 类
   */
  public GetInstructionManager(): InstructionManager {
    return this.instructionManager;
  }

  /**
   * 业务逻辑：获取结果管理器实例，允许外部代码访问执行结果，用于查询历史结果、清空结果等操作
   *
   * 实现方式：返回私有属性 resultManager 的引用
   *
   * 注意事项：返回的是同一个实例的引用，外部修改会影响执行器的内部状态
   *
   * @returns 结果管理器实例
   *
   * 相关代码：src/managers/InstructionResultManager.ts - ResultManager 类
   */
  public GetResultManager(): ResultManager {
    return this.resultManager;
  }

  /**
   * 业务逻辑：在标签页被关闭时清理该标签页相关的所有资源，避免内存泄漏；由 browser.tabs.onRemoved 触发调用
   *
   * 实现方式：从 InstructionManager 删除该 tab 的待执行指令、从 ResultManager 清除该 tab 的结果、从 runningTabIds 移除该 tabId
   *
   * 注意事项：
   * - 必须在标签页关闭时调用，否则指令队列、结果缓存和 runningTabIds 会持续保留已关闭 tab 的条目，导致内存膨胀
   * - 与 ElementManager.ClearTabElements、CdpExecutor 的 clearConsoleLogs/clearNetworkLogs 一起在 onRemoved 中调用
   *
   * @param tabId - 已关闭的标签页 ID
   *
   * 相关代码：src/entrypoints/background.ts - tabs.onRemoved 监听器中调用
   */
  public cleanupTab(tabId: number): void {
    this.instructionManager.DeleteInstructionsByTabId(tabId);
    this.resultManager.ClearResult(tabId);
    this.runningTabIds.delete(tabId);
    OutputLogToFile(`[InstructionExecutor] Cleaned up resources for closed tab: ${tabId}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：按“当前仍存在的标签页”清理指令队列、结果缓存和运行中标记，用于长期运行时回收已关闭标签页占用的内存（兜底）
   *
   * 实现方式：委托 InstructionManager/ResultManager 按 liveTabIds 清理；从 runningTabIds 中移除已不存在的 tabId
   *
   * @param liveTabIds - 当前存在的标签页 ID 集合
   */
  public pruneStaleTabs(liveTabIds: Set<number>): void {
    this.instructionManager.pruneStaleTabs(liveTabIds);
    this.resultManager.pruneStaleTabs(liveTabIds);
    for (const id of [...this.runningTabIds]) {
      if (!liveTabIds.has(id)) this.runningTabIds.delete(id);
    }
  }

  /**
   * 业务逻辑：将新指令加入队列，并为「有待执行指令且当前未在运行」的标签页启动 runTabLoop；无主循环，依赖「新指令到达时再次调用 ExecuteAll」驱动执行。
   *
   * 实现方式：
   * 1. 将指令添加到 InstructionManager，按标签页分组管理
   * 2. 使用 queueMicrotask 将「取 tabId、启动 runTabLoop」推迟到下一微任务，保证本方法在本轮同步执行内立即返回
   * 3. 在微任务中：取有待执行指令的 tabId 列表，过滤已在 runningTabIds 中的，对每个可用 tabId 标记运行中并启动 runTabLoop（不 await），runTabLoop 结束时在 finally 中从 runningTabIds 移除
   * 4. 调用方无需等待；runTabLoop 在后台按 FIFO 执行该 tab 的指令，执行期间新加入该 tab 的指令会在同一 runTabLoop 的 while 循环中被取出
   *
   * 注意事项：
   * - 同一标签页同一时刻只会有一个 runTabLoop；新指令到达时若该 tab 已在运行则仅入队，由当前 runTabLoop 继续消费
   * - 方法保证马上返回，不阻塞调用方；新指令到来时由上层再次调用 ExecuteAll 即可为尚未运行的 tab 启动 runTabLoop
   *
   * @param instructions - 要执行的指令列表，每个指令必须包含 tabId 字段
   */
  public ExecuteAll(instructions: BaseInstructionClass[]): void {
    this.instructionManager.AddUnfilteredInstructions(instructions);

    OutputLogToFile(`[InstructionExecutor] Instructions added, count: ${instructions.length}`, { level: LogLevel.INFO });

    queueMicrotask(() => {
      const tabIds = this.instructionManager.GetAllTabIds();
      const availableTabIds = tabIds.filter(tabId => !this.runningTabIds.has(tabId));
      if (availableTabIds.length === 0) return;

      for (const tabId of availableTabIds) {
        this.runningTabIds.add(tabId);
        this.runTabLoop(tabId).finally(() => {
          this.runningTabIds.delete(tabId);
        });
      }
      OutputLogToFile(`[InstructionExecutor] Started runTabLoop for tabIds: ${availableTabIds.join(', ')}`, { level: LogLevel.INFO });
    });
  }

  /**
   * 业务逻辑：在单个标签页内按 FIFO 顺序执行该标签页的指令队列，确保 CDP 连接、启用域、收集结果并发送
   *
   * 实现方式：校验标签页存在 → 建立 CDP 并启用域 → 循环取指令、执行、更新统计与结果；调用方通过 runningTabIds 保证同一 tabId 不会并发执行
   *
   * 注意事项：
   * - 仅处理当前 tabId，不阻塞其它标签页；统计与 ResultManager 为多标签页共享，由 JS 单线程保证写入顺序；执行期间新加入该 tab 的指令会在本循环下一轮被取出，无需再次触发 runTabLoop
   * - 若某条指令执行失败且该指令不可忽略错误（ignoreError 为 false），则不再执行后续指令，并将该 tab 队列中剩余指令全部标记为失败结果（error 为 "Skipped due to previous instruction failure (cascading failure)"）并保存后发送
   *
   * @param tabId - 要执行指令的标签页 ID
   */
  private async runTabLoop(tabId: number): Promise<void> {
    try {
      let tab;

      try {
        tab = await browser.tabs.get(tabId);
      } catch (tabError) {
        const errorMsg = tabError instanceof Error ? tabError.message : String(tabError);
        if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
          const instructionCount = this.instructionManager.GetCountByTabId(tabId);
          this.instructionManager.DeleteInstructionsByTabId(tabId);
          OutputLogToFile(`[InstructionExecutor] Tab ${tabId} does not exist, removed ${instructionCount} pending instructions`, { level: LogLevel.WARN });
          return;
        }
        throw tabError;
      }

      if (!tab || tab.id !== tabId) {
        const instructionCount = this.instructionManager.GetCountByTabId(tabId);
        this.instructionManager.DeleteInstructionsByTabId(tabId);
        OutputLogToFile(`[InstructionExecutor] Tab not found or ID mismatch, tabId: ${tabId}, removed ${instructionCount} pending instructions`, { level: LogLevel.WARN });
        return;
      }

      await EnsureCDPConnected(tabId);
      await ExecuteCDPCommand(tabId, 'DOM.enable');
      await ExecuteCDPCommand(tabId, 'CSS.enable');
      await ExecuteCDPCommand(tabId, 'Page.enable');
      await ExecuteCDPCommand(tabId, 'Runtime.enable');

      while (true) {
        const instruction = this.instructionManager.GetFirstInstructionByTabId(tabId);

        if (!instruction) {
          break;
        }

        const result: InstructionResult = await instruction.Execute();
        result.requestId = instruction.requestId;

        this.executedCount++;
        if (result.success) {
          OutputLogToFile(`[InstructionExecutor] Instruction executed successfully: ${instruction.id} (${instruction.type}), duration: ${result.duration}ms`, { level: LogLevel.INFO });
          this.successCount++;
        } else {
          OutputLogToFile(`[InstructionExecutor] Instruction execution failed: ${instruction.id} (${instruction.type}), error: ${result.error || 'unknown error'}, duration: ${result.duration}ms`, { level: LogLevel.ERROR });
          this.errorCount++;
        }

        this.resultManager.SaveResult(result);

        if (!instruction.ignoreError && !result.success) {
          // 不可忽略的失败：不执行后续指令，将队列中剩余指令全部标记为失败并保存结果
          const remaining = this.instructionManager.GetInstructionsByTabId(tabId) ?? [];
          const remainingCopy = remaining.length > 0 ? [...remaining] : [];
          for (const inst of remainingCopy) {
            const failedResult: InstructionResult = {
              tabId: inst.tabId,
              id: inst.id,
              success: false,
              duration: 0,
              error: 'Skipped due to previous instruction failure (cascading failure)',
              requestId: inst.requestId,
            };
            this.executedCount++;
            this.errorCount++;
            this.resultManager.SaveResult(failedResult);
            OutputLogToFile(`[InstructionExecutor] Instruction marked as failed (skipped): ${inst.id} (${inst.type})`, { level: LogLevel.WARN });
          }
          this.instructionManager.DeleteInstructionsByTabId(tabId);
          break;
        }
      }

      // 正常结束或 cascading failure 后，按 requestId 分组上报该 tab 的结果（每条结果带 requestId 以与请求匹配）
      const results = this.resultManager.GetResultAndDelete(tabId) ?? [];
      const byRequestId = new Map<string, InstructionResult[]>();
      for (const r of results) {
        const rid = r.requestId ?? '';
        if (!byRequestId.has(rid)) byRequestId.set(rid, []);
        byRequestId.get(rid)!.push(r);
      }
      for (const [rid, arr] of byRequestId) {
        this.sendResult?.({ id: rid, tabId, results: arr });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
        const instructionCount = this.instructionManager.GetCountByTabId(tabId);
        this.instructionManager.DeleteInstructionsByTabId(tabId);
        OutputLogToFile(`[InstructionExecutor] Tab ${tabId} does not exist, removed ${instructionCount} pending instructions`, { level: LogLevel.WARN });
      } else {
        OutputLogToFile(`[InstructionExecutor] Error processing tab ${tabId}: ${errorMsg}`, { level: LogLevel.ERROR });
      }
    }
  }

  /**
   * 业务逻辑：处理来自 WebSocket 的指令消息，将消息数据转换为指令对象并执行，用于接收服务器发送的自动化任务指令
   *
   * 实现方式：
   * 1. 验证消息数据是否为指令数组格式
   * 2. 将消息中的 BaseInstruction 对象转换为 BaseInstructionClass 实例（通过 InstructionFactory）
   * 3. 调用 ExecuteAll() 方法执行转换后的指令队列
   *
   * 注意事项：
   * - 消息数据必须是 BaseInstruction[] 数组格式，否则会记录警告日志
   * - 使用 InstructionFactory.create() 将指令数据转换为可执行的指令对象
   * - 如果消息格式无效，会记录警告但不会抛出异常
   *
   * @param message - WebSocket 消息，message.data 为 InstructionsRequestPayload（{ id, data: BaseInstruction[] }）或兼容旧格式 BaseInstruction[] 数组
   *
   * 相关代码：src/instructions/index.ts - InstructionFactory 类（创建指令对象），src/executor/InstructionExecutor.ts - ExecuteAll() 方法（执行指令），src/types/instruction.ts - InstructionsRequestPayload
   */
  public async handleMessage(message: WSMessage): Promise<void> {
    const payload = message.data;
    let instructions: BaseInstruction[];
    let requestId: string = '';

    if (payload && typeof payload === 'object' && Array.isArray(payload.data) && typeof payload.id === 'string') {
      const req = payload as InstructionsRequestPayload;
      requestId = req.id;
      instructions = req.data;
    } else if (payload && Array.isArray(payload)) {
      instructions = payload as BaseInstruction[];
    } else {
      OutputLogToFile(`[InstructionExecutor] Received invalid WebSocket instruction message: ${JSON.stringify(message)}`, { level: LogLevel.WARN });
      return;
    }

    const instructionClasses: BaseInstructionClass[] = instructions.map(instruction => InstructionFactory.create(instruction));
    for (const ic of instructionClasses) {
      ic.requestId = requestId;
    }
    OutputLogToFile(`[InstructionExecutor] Received WebSocket instruction message, id: ${requestId || '(none)'}, count: ${instructionClasses.length}`, { level: LogLevel.INFO });
    this.ExecuteAll(instructionClasses);
  }
}