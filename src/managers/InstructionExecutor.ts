import type { BaseInstructionClass } from '../instructions';
import type { ExecutorStatus, InstructionResult } from '../types';
import { InstructionManager, ResultManager, ElementManager } from '.';

/**
 * 指令执行器
 * 用于管理指令执行，使用CDP协议来执行指令
 */
export class InstructionExecutor {

  private instructionManager: InstructionManager;
  private resultManager: ResultManager;
  private elementManager: ElementManager;

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentTabId: number | null = null;
  private executedCount: number = 0;
  private successCount: number = 0;
  private errorCount: number = 0;
  private startTime: number | null = null;
  private stopRequested: boolean = false;

  constructor(instructionManager: InstructionManager, resultManager: ResultManager, elementManager: ElementManager) {
    this.instructionManager = instructionManager;
    this.resultManager = resultManager;
    this.elementManager = elementManager;
  }

  /**
   * 获取元素管理器
   * @returns 元素管理器
   */
  public GetElementManager(): ElementManager {
    return this.elementManager;
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
   * 开始执行指定标签页的指令
   * @param tabId - 要执行指令的标签页ID
   * @throws 如果执行器已在运行中，抛出错误
   * @remarks
   * 执行流程：
   * 1. 检查执行器状态，如果已在运行则抛出错误
   * 2. 初始化执行器状态（运行中、未暂停、重置统计）
   * 3. 确保 CDP 已连接到标签页
   * 4. 循环执行指令，直到：
   *    - 收到停止请求（stopRequested = true）
   *    - 指令列表为空
   *    - 指令执行失败且未设置 ignoreError
   * 5. 如果执行器被暂停，等待恢复
   */
  public async Execute(tabId: number): Promise<void> {
    // 检查执行器是否已在运行
    if (this.isRunning) {
      throw new Error('指令执行器已在运行中');
    }

    // 初始化执行器状态
    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;
    this.currentTabId = tabId;
    this.executedCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();

    try {
      // 确保 CDP 已连接到标签页（执行 CDP 命令的前提条件）
      await this.ensureCDPConnected(tabId);

      // 执行指令循环（FIFO 队列）
      while (!this.stopRequested) {
        // 如果执行器被暂停，等待恢复
        if (this.isPaused) {
          await this.Delay(100); // 等待 100 毫秒后再次检查
          continue;
        }

        // 从指令管理器获取第一个待执行的指令（FIFO）
        const instruction = this.instructionManager.GetFirstInstructionByTabId(tabId);

        // 如果指令列表为空，退出循环
        if (!instruction) break;

        // 执行指令
        const success = await this.executeInstruction(instruction);

        // 如果指令执行失败且未设置 ignoreError，停止执行
        // ignoreError = true 表示即使失败也继续执行下一条指令
        // ignoreError = false 或 undefined 表示失败后停止执行
        if (success === false && instruction.ignoreError === undefined) {
          console.error('指令执行失败，停止执行:', instruction.ToObject());
          break;
        }
      }
    } catch (error) {
      console.error('指令执行错误:', error);
    } finally {
      // 无论成功或失败，都要重置执行器状态
      this.isRunning = false;
      this.isPaused = false;
    }
  }

  /**
   * 暂停执行
   */
  public Pause(): void {
    if (this.isRunning) {
      this.isPaused = true;
    }
  }

  /**
   * 恢复执行
   */
  public Resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
    }
  }

  /**
   * 停止执行
   */
  public Stop(): void {
    this.stopRequested = true;
    this.isPaused = false;
  }

  /**
   * 获取执行统计信息
   */
  public GetStatus(): ExecutorStatus {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentTabId: this.currentTabId,
      executedCount: this.executedCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      startTime: this.startTime
    };
  }

  /**
   * 执行单个指令
   * @param instruction - 要执行的指令对象
   * @returns 指令执行是否成功
   * @remarks
   * 1. 使用工厂模式创建指令执行类
   * 2. 执行指令并获取结果
   * 3. 保存结果到结果管理器
   * 4. 更新执行统计（总数、成功数、失败数）
   * 5. 发送结果通知到 popup 窗口
   */
  private async executeInstruction(instructionClass: BaseInstructionClass): Promise<boolean> {
    // 执行指令，获取执行结果
    const result: InstructionResult = await instructionClass.Execute();

    // 保存执行结果到结果管理器，用于后续查询和上报
    this.resultManager.SaveResult(result);

    // 更新执行统计信息
    this.executedCount++; // 总执行数 +1

    if (result.success) {
      this.successCount++; // 成功数 +1
    } else {
      this.errorCount++; // 失败数 +1
    }

    return result.success;
  }

  /**
   * 确保 Chrome DevTools Protocol (CDP) 已连接到指定标签页
   * @param tabId - 要连接的标签页 ID
   * @remarks
   * 使用 browser.debugger API 连接到标签页，版本为 1.3
   * 如果已经连接（可能是其他扩展或 DevTools），会忽略相关错误
   * 这是执行 CDP 命令的前提条件
   */
  private async ensureCDPConnected(tabId: number): Promise<void> {
    try {
      const target: Browser.debugger.Debuggee = { tabId };
      // 连接到标签页，使用 CDP 版本 1.3
      await browser.debugger.attach(target, '1.3');
    } catch (error) {
      // 如果已经连接，忽略错误（可能是其他扩展或 DevTools 已连接）
      if (browser.runtime.lastError) {
        const errorMsg = browser.runtime.lastError.message || '';
        // 忽略"另一个调试器已连接"的错误（可能是其他扩展或DevTools）
        if (!errorMsg.includes('Another debugger') && !errorMsg.includes('already attached')) {
          console.warn('CDP连接警告:', errorMsg);
        }
      }
    }
  }

  /**
   * 等待指定时间（用于暂停检查循环）
   * @param time - 延迟时间（毫秒），默认 100 毫秒
   * @remarks
   * 注意：这里的单位是毫秒，与 BaseInstruction.Delay 不同（BaseInstruction 使用秒）
   * 用于在暂停状态下定期检查是否恢复执行
   */
  private async Delay(time?: number): Promise<void> {
    const delay_time = time || 100; // 默认 100 毫秒
    await new Promise(resolve => setTimeout(resolve, delay_time));
  }
}

/**
 * 导出全局指令执行器
 */
export let instructionExecutor: InstructionExecutor | null = null;