/**
 * 业务逻辑：定义指令执行器的运行状态和统计信息，用于监控指令执行进度、状态控制和性能分析，在 UI 中实时显示执行情况
 *
 * 实现方式：使用 TypeScript 接口定义状态结构，包含运行状态字段（stopRequested、isRunning、isPaused）和统计字段（executedCount、successCount、errorCount、startTime）
 *
 * 注意事项：
 * - stopRequested：是否已请求停止执行，布尔值，设置为 true 后执行器会在当前指令完成后停止
 * - isRunning：是否正在运行，布尔值，表示执行器当前是否在执行指令队列
 * - isPaused：是否已暂停，布尔值，暂停时执行器会等待恢复，不会执行新指令
 * - executedCount：已执行的指令总数，数字，包括成功和失败的指令
 * - successCount：成功执行的指令数量，数字，用于计算成功率
 * - errorCount：执行失败的指令数量，数字，用于错误分析和统计
 * - startTime：开始执行的时间戳（毫秒），数字或 null，用于计算执行时长
 * - 状态信息由 InstructionExecutor 的 GetStatus() 方法返回，会定期更新
 * - 在 popup UI 中，这些字段用于显示执行进度和状态，帮助用户了解自动化任务的执行情况
 *
 * 相关代码：src/executor/InstructionExecutor.ts - GetStatus() 方法（返回此类型状态），src/entrypoints/popup/components/ExecutionControl.vue - 执行控制组件（显示状态信息）
 */
export interface ExecutorStatus {
  stopRequested: boolean;
  isRunning: boolean;
  isPaused: boolean;
  executedCount: number;
  successCount: number;
  errorCount: number;
  startTime: number | null;
}