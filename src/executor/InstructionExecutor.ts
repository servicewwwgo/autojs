import { BaseInstructionClass, InstructionFactory } from '../instructions';
import { InstructionManager, ResultManager } from '../managers';
import { BaseInstruction, ExecutorStatus, InstructionResult, InstructionResults, WSMessage } from '../types';
import { EnsureCDPConnected, ExecuteCDPCommand, LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：管理和执行自动化指令队列，按照 FIFO 顺序在指定标签页中执行指令，支持暂停、恢复、停止等控制操作，统计执行结果并发送给服务器
 *
 * 实现方式：使用 InstructionManager 管理指令队列，通过 CDP 协议执行指令，使用 ResultManager 收集和发送执行结果，通过状态标志位（isRunning、isPaused、stopRequested）控制执行流程
 *
 * 注意事项：
 * - 执行器采用 FIFO（先进先出）队列模式，按标签页分组执行指令
 * - 执行前会确保 CDP 连接并启用必要的 CDP 域（DOM、CSS、Page、Runtime）
 * - 如果标签页不存在，会自动清理该标签页的所有待执行指令，避免重复尝试
 * - 执行循环最多运行 10 次，每次处理完所有标签页的指令后继续下一轮
 * - 暂停状态下会等待 100ms 后继续检查，不会执行新指令
 * - 停止操作会清空所有结果，重置执行状态
 * - 执行结果会通过 sendResult 回调函数发送（通常发送到 WebSocket）
 *
 * 相关代码：src/managers/InstructionManager.ts - 指令管理器，src/managers/InstructionResultManager.ts - 结果管理器，src/instructions/ - 各种指令实现，src/utils/index.ts - CDP 工具函数
 */
export class InstructionExecutor {
  private instructionManager: InstructionManager;
  private resultManager: ResultManager;

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private stopRequested: boolean = false;

  private executedCount: number = 0;
  private successCount: number = 0;
  private errorCount: number = 0;

  private startTime: number = Date.now();

  private sendResult: ((result: InstructionResults) => void) | undefined;

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
   * @param sendResult - 发送指令结果的函数，接收 InstructionResults 类型参数
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（调用此回调），src/entrypoints/background.ts - 设置 WebSocket 发送回调
   */
  public setSendResult(sendResult: (result: InstructionResults) => void): void {
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
   * 业务逻辑：暂停指令执行，允许用户临时停止执行流程，用于调试、检查中间状态或等待外部条件满足
   *
   * 实现方式：设置 isPaused 标志为 true，执行循环会检测此标志并跳过指令执行，等待恢复
   *
   * 注意事项：
   * - 只有在执行中（isRunning === true）时才能暂停，否则调用无效
   * - 暂停后当前正在执行的指令会完成，但不会执行新的指令
   * - 暂停状态下执行循环会每 100ms 检查一次是否恢复
   * - 可以通过 Resume() 方法恢复执行
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（检查暂停状态），src/executor/InstructionExecutor.ts - Resume() 方法（恢复执行）
   */
  public Pause(): void {
    if (this.isRunning) {
      this.isPaused = true;
      OutputLogToFile(`[InstructionExecutor] Execution paused`, { level: LogLevel.INFO });
    }
  }

  /**
   * 业务逻辑：恢复暂停的指令执行，继续执行队列中的剩余指令
   *
   * 实现方式：清除 isPaused 标志，执行循环会继续执行指令
   *
   * 注意事项：
   * - 只有在已暂停（isPaused === true）时才能恢复，否则调用无效
   * - 恢复后会立即继续执行队列中的下一个指令
   * - 如果执行器未运行，恢复操作无效
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（检查暂停状态），src/executor/InstructionExecutor.ts - Pause() 方法（暂停执行）
   */
  public Resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      OutputLogToFile(`[InstructionExecutor] Execution resumed`, { level: LogLevel.INFO });
    }
  }

  /**
   * 业务逻辑：获取执行器的当前状态和统计信息，用于 UI 显示执行进度、状态和性能指标
   *
   * 实现方式：返回包含所有状态字段和统计字段的对象，实时反映执行器的运行状态
   *
   * 注意事项：
   * - 返回的状态是当前时刻的快照，不会自动更新
   * - executedCount、successCount、errorCount 会随着指令执行实时更新
   * - startTime 在 ExecuteAll() 开始时设置，停止后不会重置
   * - UI 组件需要定期调用此方法以获取最新状态
   *
   * @returns 执行器状态对象，包含运行状态和统计信息
   *
   * 相关代码：src/types/executor.ts - ExecutorStatus 接口（返回类型定义），src/entrypoints/popup/components/ExecutionControl.vue - 执行控制组件（显示状态）
   */
  public GetStatus(): ExecutorStatus {
    return {
      stopRequested: this.stopRequested,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      executedCount: this.executedCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      startTime: this.startTime
    };
  }

  /**
   * 业务逻辑：检查执行器是否正在执行指令，用于判断是否可以执行新的指令队列或进行其他操作
   *
   * 实现方式：检查 isRunning 为 true 且 stopRequested 为 false
   *
   * 注意事项：
   * - 暂停状态（isPaused === true）时仍返回 true，因为执行器仍在运行中
   * - 停止请求后（stopRequested === true）返回 false，即使 isRunning 仍为 true
   *
   * @returns 如果正在执行且未请求停止，返回 true；否则返回 false
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（设置运行状态）
   */
  public IsExecuting(): boolean {
    return this.isRunning && !this.stopRequested;
  }

  /**
   * 业务逻辑：停止指令执行，清空所有结果并重置状态，用于取消正在执行的自动化任务
   *
   * 实现方式：设置 stopRequested 和 isRunning 标志，清空结果管理器中的所有结果
   *
   * 注意事项：
   * - 停止操作会立即设置标志，执行循环会在当前指令完成后退出
   * - 停止后会清空所有已收集的执行结果
   * - 停止后需要重新调用 ExecuteAll() 才能开始新的执行
   * - 停止操作是异步的，但会立即设置停止标志
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（检查停止标志），src/managers/InstructionResultManager.ts - ClearAll() 方法（清空结果）
   */
  public async Stop(): Promise<void> {
    this.stopRequested = true;
    this.isRunning = false;
    this.isPaused = false;
    this.resultManager.ClearAll();
    OutputLogToFile(`[InstructionExecutor] Execution stopped, statistics: total=${this.executedCount}, success=${this.successCount}, failed=${this.errorCount}`, { level: LogLevel.INFO });
  }

  /**
   * 业务逻辑：执行所有指令，按照 FIFO 顺序在对应标签页中执行指令队列，收集执行结果并发送给服务器，支持暂停、恢复和停止控制
   *
   * 实现方式：
   * 1. 将指令添加到 InstructionManager，按标签页分组管理
   * 2. 初始化执行状态（isRunning、isPaused、stopRequested、统计计数器）
   * 3. 执行循环最多运行 10 轮，每轮处理所有标签页的指令
   * 4. 对每个标签页：确保 CDP 连接、启用必要的 CDP 域、按顺序执行该标签页的所有指令
   * 5. 执行每个指令后更新统计信息，保存结果到 ResultManager
   * 6. 每个标签页的指令执行完成后，通过 sendResult 回调发送结果
   * 7. 如果标签页不存在，自动清理该标签页的所有指令
   * 8. 暂停状态下等待恢复，停止请求时退出循环
   *
   * 注意事项：
   * - 如果执行器已在运行，重复调用会直接返回，不会执行新的指令
   * - 执行前会确保 CDP 连接并启用 DOM、CSS、Page、Runtime 域
   * - 标签页不存在时会自动清理该标签页的指令，避免重复尝试
   * - 执行循环最多 10 轮，防止无限循环
   * - 暂停状态下每 100ms 检查一次是否恢复
   * - 执行结果会在每个标签页的指令全部完成后统一发送
   * - 无论是否发生异常，finally 块都会重置执行状态
   *
   * @param instructions - 要执行的指令列表，每个指令必须包含 tabId 字段
   *
   * 相关代码：src/managers/InstructionManager.ts - AddUnfilteredInstructions() 方法（添加指令），src/managers/InstructionResultManager.ts - SaveResult() 方法（保存结果），src/utils/index.ts - EnsureCDPConnected() 和 ExecuteCDPCommand() 函数（CDP 操作）
   */
  public async ExecuteAll(instructions: BaseInstructionClass[]): Promise<void> {

    this.instructionManager.AddUnfilteredInstructions(instructions);

    if (this.isRunning === true) {
      return;
    }

    // 业务逻辑：初始化执行器状态，准备开始执行指令 | 实现方式：设置运行标志、重置暂停和停止标志 | 注意事项：必须在执行循环前设置，确保状态一致
    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;

    OutputLogToFile(`[InstructionExecutor] Execution started, pending instructions: ${instructions.length}`, { level: LogLevel.INFO });

    try {
      // 业务逻辑：执行指令循环，最多运行 10 轮，每轮处理所有标签页的指令 | 实现方式：使用 for 循环，每轮遍历所有标签页 | 注意事项：限制轮数防止无限循环，每轮处理完所有标签页后继续下一轮
      for (let i = 0; i < 10; i++) {
        // 业务逻辑：检查停止请求，如果已请求停止则退出执行循环 | 实现方式：检查 stopRequested 标志 | 注意事项：停止标志在 Stop() 方法中设置，当前指令完成后才会退出
        if (this.stopRequested) {
          break;
        }

        // 业务逻辑：检查暂停状态，如果已暂停则等待恢复 | 实现方式：检查 isPaused 标志，等待 100ms 后继续检查 | 注意事项：暂停时不会执行新指令，但会定期检查是否恢复
        if (this.isPaused) {
          await this.Delay(100);
          continue;
        }

        const tabIds = this.instructionManager.GetAllTabIds();

        if (tabIds.length === 0) {
          break;
        }

        for (const tabId of tabIds) {
          try {
            // 如果标签页不存在，则跳过并清理该 tab 的指令
            let tab;

            try {
              tab = await browser.tabs.get(tabId);
            } catch (tabError) {
              const errorMsg = tabError instanceof Error ? tabError.message : String(tabError);
              // 如果 tab 不存在，清理该 tab 的所有指令，避免重复尝试
              if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
                const instructionCount = this.instructionManager.GetCountByTabId(tabId);
                this.instructionManager.DeleteInstructionsByTabId(tabId);
                OutputLogToFile(`[InstructionExecutor] Tab ${tabId} does not exist, removed ${instructionCount} pending instructions`, { level: LogLevel.WARN });
                continue;
              }
              throw tabError;
            }

            if (!tab || tab.id !== tabId) {
              const instructionCount = this.instructionManager.GetCountByTabId(tabId);
              this.instructionManager.DeleteInstructionsByTabId(tabId);
              OutputLogToFile(`[InstructionExecutor] Tab not found or ID mismatch, tabId: ${tabId}, removed ${instructionCount} pending instructions`, { level: LogLevel.WARN });
              continue;
            }

            // 业务逻辑：确保 CDP 连接并启用必要的域，为执行指令做准备 | 实现方式：调用 EnsureCDPConnected 建立连接，然后启用 DOM、CSS、Page、Runtime 域 | 注意事项：CDP 连接是执行指令的前提条件，某些指令需要特定的域已启用
            await EnsureCDPConnected(tabId);

            // 启用必要的 CDP 域：DOM（元素查找和操作）、CSS（样式查询）、Page（页面导航和截图）、Runtime（JavaScript 执行）
            await ExecuteCDPCommand(tabId, 'DOM.enable');
            await ExecuteCDPCommand(tabId, 'CSS.enable');
            await ExecuteCDPCommand(tabId, 'Page.enable');
            await ExecuteCDPCommand(tabId, 'Runtime.enable');

            // 业务逻辑：按 FIFO 顺序执行该标签页的所有指令，直到队列为空 | 实现方式：循环获取并执行第一个指令，直到没有更多指令 | 注意事项：指令按添加顺序执行，每个指令执行完成后立即保存结果
            while (true) {
              // 从指令管理器获取第一个待执行的指令（FIFO 队列）
              const instruction = this.instructionManager.GetFirstInstructionByTabId(tabId);

              if (!instruction) {
                break; // 该标签页的指令已全部执行完成
              }

              // 业务逻辑：执行单个指令并获取结果 | 实现方式：调用指令的 Execute() 方法，该方法会返回执行结果 | 注意事项：执行是异步的，会等待指令完成
              const result: InstructionResult = await instruction.Execute();

              // 业务逻辑：更新执行统计信息，记录总执行数、成功数和失败数 | 实现方式：根据执行结果更新计数器 | 注意事项：统计信息用于 UI 显示和性能分析
              this.executedCount++; // 总执行数 +1

              if (result.success) {
                this.successCount++; // 成功数 +1
                OutputLogToFile(`[InstructionExecutor] Instruction executed successfully: ${instruction.instructionID} (${instruction.type}), duration: ${result.duration}ms`, { level: LogLevel.INFO });
              } else {
                this.errorCount++; // 失败数 +1
                OutputLogToFile(`[InstructionExecutor] Instruction execution failed: ${instruction.instructionID} (${instruction.type}), error: ${result.error || 'unknown error'}, duration: ${result.duration}ms`, { level: LogLevel.ERROR });
              }

              // 业务逻辑：保存执行结果到结果管理器，用于后续发送给服务器 | 实现方式：调用 ResultManager.SaveResult() 方法 | 注意事项：结果会按标签页分组保存
              this.resultManager.SaveResult(result);
            }

            // 业务逻辑：获取该标签页的所有执行结果并发送给服务器，然后清空结果缓存 | 实现方式：从 ResultManager 获取并删除结果，通过 sendResult 回调发送 | 注意事项：结果发送后会被删除，避免重复发送
            const results = this.resultManager.GetResultAndDelete(tabId) ?? [];
            this.sendResult?.({ tabId: tabId, results: results });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            // 如果是因为 tab 不存在导致的错误，清理该 tab 的指令
            if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
              const instructionCount = this.instructionManager.GetCountByTabId(tabId);
              this.instructionManager.DeleteInstructionsByTabId(tabId);
              OutputLogToFile(`[InstructionExecutor] Tab ${tabId} does not exist, removed ${instructionCount} pending instructions`, { level: LogLevel.WARN });
            } else {
              OutputLogToFile(`[InstructionExecutor] Error processing tab ${tabId}: ${errorMsg}`, { level: LogLevel.ERROR });
            }
          }
        }
      }
    } catch (error) {
      OutputLogToFile(`[InstructionExecutor] Execution error: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
    } finally {
      // 业务逻辑：确保无论是否发生异常，都重置执行状态，防止状态不一致 | 实现方式：在 finally 块中重置所有状态标志 | 注意事项：必须重置状态，否则下次执行可能无法正常启动
      this.isRunning = false;
      this.isPaused = false;
      this.stopRequested = false;
      OutputLogToFile(`[InstructionExecutor] Execution finished, statistics: total=${this.executedCount}, success=${this.successCount}, failed=${this.errorCount}`, { level: LogLevel.INFO });
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
   * @param message - WebSocket 消息，data 字段应包含 BaseInstruction[] 数组
   *
   * 相关代码：src/instructions/index.ts - InstructionFactory 类（创建指令对象），src/executor/InstructionExecutor.ts - ExecuteAll() 方法（执行指令），src/types/websocket_message.ts - WSMessage 接口（消息类型定义）
   */
  public async handleMessage(message: WSMessage): Promise<void> {
    // 判斷 message.data 是否是 BaseInstructionClass[]
    if (message.data && Array.isArray(message.data)) {
      const instructions: BaseInstruction[] = message.data as BaseInstruction[];
      const instructionClasses: BaseInstructionClass[] = instructions.map(instruction => InstructionFactory.create(instruction));
      OutputLogToFile(`[InstructionExecutor] Received WebSocket instruction message, count: ${instructionClasses.length}`, { level: LogLevel.INFO });
      await this.ExecuteAll(instructionClasses);
    } else {
      OutputLogToFile(`[InstructionExecutor] Received invalid WebSocket instruction message: ${JSON.stringify(message)}`, { level: LogLevel.WARN });
    }
  }

  /**
   * 业务逻辑：等待指定时间，用于暂停状态下的定期检查循环，避免 CPU 占用过高
   *
   * 实现方式：使用 Promise 和 setTimeout 实现异步延迟
   *
   * 注意事项：
   * - 时间单位是毫秒，与 BaseInstruction.Delay 不同（BaseInstruction 使用秒）
   * - 默认延迟 100ms，用于在暂停状态下定期检查是否恢复执行
   * - 延迟时间过短会导致 CPU 占用高，过长会导致响应延迟
   *
   * @param time - 延迟时间（毫秒），默认 100 毫秒
   *
   * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 方法（暂停检查时调用），src/instructions/BaseInstruction.ts - Delay() 方法（指令延迟，使用秒单位）
   */
  public async Delay(time?: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, time || 100));
  }
}