/**
 * 指令执行器状态
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