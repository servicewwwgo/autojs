import { BaseInstruction, ExecutionResult } from '../types/Instructions';

/**
 * 执行器对象 - 用来管理执行过程和保存执行结果
 */
export class Executor {
  /** 指令对象列表 */
  public instructions: BaseInstruction[] = [];
  /** 执行指令结果列表 */
  public results: ExecutionResult[] = [];
  /** 当前执行状态 */
  public isRunning: boolean = false;
  /** 当前执行索引 */
  public currentIndex: number = 0;

  constructor(instructions: BaseInstruction[] = []) {
    this.instructions = instructions;
  }

  /**
   * 添加指令
   */
  addInstruction(instruction: BaseInstruction): void {
    this.instructions.push(instruction);
  }

  /**
   * 批量添加指令
   */
  addInstructions(instructions: BaseInstruction[]): void {
    this.instructions.push(...instructions);
  }

  /**
   * 清空所有指令
   */
  clearInstructions(): void {
    this.instructions = [];
    this.results = [];
    this.currentIndex = 0;
  }

  /**
   * 执行所有指令
   */
  async executeAll(): Promise<ExecutionResult[]> {
    this.isRunning = true;
    this.currentIndex = 0;
    this.results = [];

    console.log(`开始执行 ${this.instructions.length} 个指令`);

    for (let i = 0; i < this.instructions.length; i++) {
      if (!this.isRunning) {
        console.log('执行被中断');
        break;
      }

      this.currentIndex = i;
      const instruction = this.instructions[i];
      
      console.log(`执行指令 ${i + 1}/${this.instructions.length}: ${instruction.type} (${instruction.id})`);
      
      try {
        const result = await instruction.execute();
        this.results.push(result);
        
        if (result.success) {
          console.log(`指令 ${instruction.id} 执行成功`);
          
          // 如果是导航指令，页面会跳转，后续指令无法执行
          if (instruction.type === 'navigate') {
            console.log('检测到导航指令，页面将跳转，停止执行后续指令');
            break;
          }
        } else {
          console.error(`指令 ${instruction.id} 执行失败: ${result.error}`);
        }
      } catch (error) {
        const errorResult: ExecutionResult = {
          instructionID: instruction.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0
        };
        this.results.push(errorResult);
        console.error(`指令 ${instruction.id} 执行异常:`, error);
      }
    }

    this.isRunning = false;
    console.log(`执行完成，成功: ${this.getSuccessCount()}, 失败: ${this.getFailureCount()}`);
    
    return this.results;
  }

  /**
   * 执行单个指令
   */
  async executeInstruction(index: number): Promise<ExecutionResult | null> {
    if (index < 0 || index >= this.instructions.length) {
      console.error(`指令索引 ${index} 超出范围`);
      return null;
    }

    const instruction = this.instructions[index];
    console.log(`执行单个指令: ${instruction.type} (${instruction.id})`);
    
    try {
      const result = await instruction.execute();
      this.results[index] = result;
      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        instructionID: instruction.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      };
      this.results[index] = errorResult;
      return errorResult;
    }
  }

  /**
   * 暂停执行
   */
  pause(): void {
    this.isRunning = false;
    console.log('执行已暂停');
  }

  /**
   * 停止执行
   */
  stop(): void {
    this.isRunning = false;
    this.currentIndex = 0;
    console.log('执行已停止');
  }

  /**
   * 获取成功执行的指令数量
   */
  getSuccessCount(): number {
    return this.results.filter(result => result.success).length;
  }

  /**
   * 获取失败的指令数量
   */
  getFailureCount(): number {
    return this.results.filter(result => !result.success).length;
  }

  /**
   * 获取总执行时间
   */
  getTotalDuration(): number {
    return this.results.reduce((total, result) => total + result.duration, 0);
  }

  /**
   * 获取执行统计信息
   */
  getStatistics(): {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    totalDuration: number;
    averageDuration: number;
  } {
    const total = this.results.length;
    const success = this.getSuccessCount();
    const failure = this.getFailureCount();
    const totalDuration = this.getTotalDuration();
    
    return {
      total,
      success,
      failure,
      successRate: total > 0 ? (success / total) * 100 : 0,
      totalDuration,
      averageDuration: total > 0 ? totalDuration / total : 0
    };
  }

  /**
   * 获取失败的结果
   */
  getFailedResults(): ExecutionResult[] {
    return this.results.filter(result => !result.success);
  }

  /**
   * 获取成功的结果
   */
  getSuccessfulResults(): ExecutionResult[] {
    return this.results.filter(result => result.success);
  }

  /**
   * 导出执行结果
   */
  exportResults(): string {
    return JSON.stringify({
      statistics: this.getStatistics(),
      results: this.results
    }, null, 2);
  }

  /**
   * 验证所有指令
   */
  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    this.instructions.forEach((instruction, index) => {
      if (!instruction.validate()) {
        errors.push(`指令 ${index} (${instruction.id}): 验证失败`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
