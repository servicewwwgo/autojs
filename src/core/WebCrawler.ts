import { ElementManager, elementManager } from './ElementManager';
import { Executor } from './Executor';
import { InstructionParser } from './Parser';
import { BaseInstruction } from '../types/Instructions';

/**
 * Web爬虫主控制器
 * 整合元素管理器、指令解析器和执行器
 */
export class WebCrawler {
  private manager: ElementManager;
  private executor: Executor;
  private parser: InstructionParser;

  constructor() {
    this.manager = elementManager;
    this.executor = new Executor();
    this.parser = new InstructionParser();
  }

  /**
   * 获取元素管理器
   */
  getManager(): ElementManager {
    return this.manager;
  }

  /**
   * 获取执行器
   */
  getExecutor(): Executor {
    return this.executor;
  }

  /**
   * 获取指令解析器
   */
  getParser(): InstructionParser {
    return this.parser;
  }

  /**
   * 从JSON文件加载指令并执行
   */
  async loadAndExecuteInstructions(jsonData: string): Promise<void> {
    try {
      console.log('开始加载指令...');

      // 解析指令
      const instructions = this.parser.parseFromJSON(jsonData);

      // 清空现有指令
      this.executor.clearInstructions();

      // 添加新指令
      this.executor.addInstructions(instructions);

      console.log(`成功加载 ${instructions.length} 个指令`);

      // 执行指令
      console.log('开始执行指令...');
      const results = await this.executor.executeAll();

      console.log('指令执行完成');
      console.log('执行结果:', this.executor.getStatistics());

    } catch (error) {

      console.error('加载和执行指令失败:', error);
      throw error;
    }
  }

  /**
   * 从文件加载指令并执行
   */
  async loadAndExecuteFromFile(filePath: string): Promise<void> {
    try {
      const response = await fetch(filePath);
      const jsonData = await response.text();
      await this.loadAndExecuteInstructions(jsonData);
    } catch (error) {
      console.error('从文件加载指令失败:', error);
      throw error;
    }
  }

  /**
   * 从JSON字符串加载指令并执行
   */
  async loadAndExecuteFromJSONString(jsonString: string): Promise<void> {
    const instruction = this.parser.parseFromJSONString(jsonString);
    this.executor.addInstruction(instruction);
    await this.executor.executeInstruction(this.executor.instructions.length - 1);
    console.log('指令执行完成');
  }

  /**
   * 清除所有指令
   */
  clearInstructions(): void {
    this.executor.clearInstructions();
    console.log('所有指令已清除');
  }

  /**
   * 添加单个指令
   */
  addInstruction(instruction: BaseInstruction): void {
    this.executor.addInstruction(instruction);
  }

  /**
   * 添加多个指令
   */
  addInstructions(instructions: BaseInstruction[]): void {
    this.executor.addInstructions(instructions);
  }

  /**
   * 执行所有指令
   */
  async executeAll(): Promise<void> {
    await this.executor.executeAll();
  }

  /**
   * 执行最后一条指令
   */
  async execute(): Promise<void> {
    await this.executor.executeInstruction(this.executor.instructions.length - 1);
  }

  /**
   * 暂停执行
   */
  pause(): void {
    this.executor.pause();
  }

  /**
   * 停止执行
   */
  stop(): void {
    this.executor.stop();
  }

  /**
   * 获取执行统计信息
   */
  getStatistics() {
    return this.executor.getStatistics();
  }

  /**
   * 获取执行结果
   */
  getResults() {
    return this.executor.results;
  }

  /**
   * 导出执行结果
   */
  exportResults(): string {
    return this.executor.exportResults();
  }

  /**
   * 导出元素配置
   */
  exportElements(): string {
    return this.manager.exportElements();
  }

  /**
   * 导入元素配置
   */
  importElements(jsonData: string): boolean {
    return this.manager.importElements(jsonData);
  }

  /**
   * 序列化指令为JSON
   */
  serializeInstructions(): string {
    return this.parser.serializeToJSON(this.executor.instructions);
  }

  /**
   * 刷新所有元素
   */
  refreshElements(): void {
    this.manager.refreshAllElements();
  }

  /**
   * 验证所有元素和指令
   */
  validateAll(): {
    elements: { valid: boolean; errors: string[] };
    instructions: { valid: boolean; errors: string[] };
  } {
    return {
      elements: this.manager.validateAllElements(),
      instructions: this.executor.validateAll()
    };
  }

  /**
   * 验证最后一条指令
   */
  validateLastInstruction(): boolean {
    return this.executor.validateLastInstruction();
  }
}