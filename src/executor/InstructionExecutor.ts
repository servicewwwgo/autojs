import { BaseInstructionClass, InstructionFactory } from '../instructions';
import { InstructionManager, ResultManager } from '../managers';
import { BaseInstruction, ExecutorStatus, InstructionResult, InstructionResults, WSMessage } from '../types';
import { DisconnectCDP, EnsureCDPConnected, LogLevel, OutputLogToFile } from '../utils';

/**
 * 指令执行器
 * 用于管理指令执行，使用CDP协议来执行指令
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
   * 设置发送指令结果的函数
   * @param sendResult - 发送指令结果的函数
   */
  public setSendResult(sendResult: (result: InstructionResults) => void): void {
    this.sendResult = sendResult;
  }

  /**
   * 获取指令管理器
   * @returns 指令管理器
   */
  public GetInstructionManager(): InstructionManager {
    return this.instructionManager;
  }

  /**
   * 获取结果管理器
   * @returns 结果管理器
   */
  public GetResultManager(): ResultManager {
    return this.resultManager;
  }

  /**
   * 暂停执行
   */
  public Pause(): void {
    if (this.isRunning) {
      this.isPaused = true;
      OutputLogToFile(`[InstructionExecutor] Execution paused`, { level: LogLevel.INFO });
    }
  }

  /**
   * 恢复执行
   */
  public Resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      OutputLogToFile(`[InstructionExecutor] Execution resumed`, { level: LogLevel.INFO });
    }
  }

  /**
   * 获取执行统计信息
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
   * 是否正在执行指令
   */
  public IsExecuting(): boolean {
    return this.isRunning && !this.stopRequested;
  }

  /**
   * 停止执行
   */
  public async Stop(): Promise<void> {
    this.stopRequested = true;
    this.isRunning = false;
    this.isPaused = false;
    this.resultManager.ClearAll();
    OutputLogToFile(`[InstructionExecutor] Execution stopped, statistics: total=${this.executedCount}, success=${this.successCount}, failed=${this.errorCount}`, { level: LogLevel.INFO });
  }

  /**
   * 执行所有指令
   * @param instructions - 要执行的指令列表
   * @returns void
   * @remarks
   * 1. 将指令列表添加到指令管理器
   * 2. 初始化执行器状态
   * 3. 执行指令循环（FIFO 队列）
   * 4. 如果执行器被暂停，等待恢复
   * 5. 如果没有标签页，则等待 100 毫秒后再次检查
   * 6. 如果标签页有指令，则执行指令
   * 7. 如果指令执行成功，则更新执行统计信息
   */
  public async ExecuteAll(instructions: BaseInstructionClass[]): Promise<void> {

    this.instructionManager.AddUnfilteredInstructions(instructions);

    if (this.isRunning === true) {
      return;
    }

    // 初始化执行器状态
    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;

    OutputLogToFile(`[InstructionExecutor] Execution started, pending instructions: ${instructions.length}`, { level: LogLevel.INFO });

    try {
      // 执行指令循环（FIFO 队列）
      for (let i = 0; i < 10; i++) {
        // 如果请求停止，则退出循环
        if (this.stopRequested) {
          break;
        }

        // 如果执行器被暂停，等待恢复
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

            // 确保 CDP 已连接到标签页（执行 CDP 命令的前提条件）
            await EnsureCDPConnected(tabId);

            while (true) {
              // 从指令管理器获取第一个待执行的指令（FIFO）
              const instruction = this.instructionManager.GetFirstInstructionByTabId(tabId);

              if (!instruction) {
                break;
              }

              // 执行指令，获取执行结果
              const result: InstructionResult = await instruction.Execute();

              // 更新执行统计信息
              this.executedCount++; // 总执行数 +1

              if (result.success) {
                this.successCount++; // 成功数 +1
                OutputLogToFile(`[InstructionExecutor] Instruction executed successfully: ${instruction.instructionID} (${instruction.type}), duration: ${result.duration}ms`, { level: LogLevel.INFO });
              } else {
                this.errorCount++; // 失败数 +1
                OutputLogToFile(`[InstructionExecutor] Instruction execution failed: ${instruction.instructionID} (${instruction.type}), error: ${result.error || 'unknown error'}, duration: ${result.duration}ms`, { level: LogLevel.ERROR });
              }

              this.resultManager.SaveResult(result);
            }

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
          } finally {
            await DisconnectCDP(tabId);
          }
        }
      }
    } catch (error) {
      OutputLogToFile(`[InstructionExecutor] Execution error: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
    } finally {
      // 确保无论是否发生异常，都重置执行状态
      this.isRunning = false;
      this.isPaused = false;
      this.stopRequested = false;
      OutputLogToFile(`[InstructionExecutor] Execution finished, statistics: total=${this.executedCount}, success=${this.successCount}, failed=${this.errorCount}`, { level: LogLevel.INFO });
    }
  }

  /**
   * 执行指令（通过 WebSocket 消息）
   * @param message - WebSocket 消息
   * @returns void
   * @remarks
   * 1. 判斷 message.data 是否是 BaseInstructionClass[]
   * 2. 如果是，則將 message.data 轉換為 BaseInstruction[]
   * 3. 將 BaseInstruction[] 轉換為 BaseInstructionClass[]
   * 3. 調用 ExecuteAll 方法執行指令
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
   * 等待指定时间（用于暂停检查循环）
   * @param time - 延迟时间（毫秒），默认 100 毫秒
   * @remarks
   * 注意：这里的单位是毫秒，与 BaseInstruction.Delay 不同（BaseInstruction 使用秒）
   * 用于在暂停状态下定期检查是否恢复执行
   */
  public async Delay(time?: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, time || 100));
  }
}