import { BackgroundScriptMessageType, Instruction } from '../../../types';
import { InstructionExecutor } from '../../../executor';
import { BaseInstructionClass, InstructionFactory } from '../../../instructions';
import { LogLevel, OutputLogToFile } from '../../../utils';

/**
 * 添加指令集
 * @param instructionExecutor - 指令执行器实例
 */
export function createAddInstructionsHandler(instructionExecutor: InstructionExecutor) {
    return async function addInstructions(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        if (message.params?.tabId && message.params?.instructionsJsonString) {
            const tabId = message.params.tabId as number;
            const instructionsJsonString = message.params.instructionsJsonString as string;

            // 在background脚本中反序列化指令集
            const instructions: any[] = JSON.parse(instructionsJsonString);

            if (!Array.isArray(instructions)) {
                sendResponse({ success: false, error: 'Instructions must be in array format' });
                return;
            }

            // 为每条指令设置必要的属性（tabId、instructionID、created_at）
            // 确保指令按创建时间排序，时间戳精确到毫秒
            const now = Date.now();

            const processedInstructions: BaseInstructionClass[] = instructions.map((inst, index) => {
                const instruction: Instruction = { ...inst } as Instruction;

                // 如果指令没有指定 tabId，使用传入的 tabId
                if (!instruction.tabId) {
                    instruction.tabId = tabId;
                }

                // 如果指令没有 instructionID，生成一个唯一的 ID
                // 格式：inst_时间戳_索引
                if (!instruction.instructionID) {
                    instruction.instructionID = `inst_${now}_${index}`;
                }

                // 如果指令没有 created_at，使用当前时间 + 索引（确保顺序）
                // 每个指令间隔 1 毫秒，保证排序正确
                if (!instruction.created_at) {
                    instruction.created_at = now + index;
                }

                // 使用工厂方法创建指令实例
                return InstructionFactory.create(instruction);
            });

            instructionExecutor.GetInstructionManager().AddUnfilteredInstructions(processedInstructions);
            OutputLogToFile(`[Background] Added instructions successfully, tabId: ${tabId}, count: ${processedInstructions.length}`, { level: LogLevel.INFO });

            sendResponse({ success: true, count: processedInstructions.length });
        } else {
            OutputLogToFile(`[Background] Failed to add instructions: missing tabId or instructionsJsonString parameter`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'Missing tabId or instructionsJsonString parameter' });
        }
    };
}

/**
 * 执行指令集
 * @param instructionExecutor - 指令执行器实例
 */
export function createExecuteInstructionsHandler(instructionExecutor: InstructionExecutor) {
    return async function executeInstructions(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        if (message.params?.tabId) {
            const tabId = message.params.tabId as number;
            OutputLogToFile(`[Background] Started executing instructions, tabId: ${tabId}`, { level: LogLevel.INFO });

            // 立即返回响应，然后在后台循环执行所有指令
            sendResponse({ success: true });

            // 循环执行指令，直到没有更多指令或执行被停止
            setTimeout(async () => {
                await instructionExecutor.ExecuteAll([]);
            }, 1000);
        } else {
            OutputLogToFile(`[Background] Failed to execute instructions: missing tabId`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'Missing tabId' });
        }
    };
}

/**
 * 暂停执行
 * @param instructionExecutor - 指令执行器实例
 */
export function createPauseExecutionHandler(instructionExecutor: InstructionExecutor) {
    return async function pauseExecution(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        instructionExecutor.Pause();
        OutputLogToFile(`[Background] Execution paused`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    };
}

/**
 * 停止执行
 * @param instructionExecutor - 指令执行器实例
 */
export function createStopExecutionHandler(instructionExecutor: InstructionExecutor) {
    return async function stopExecution(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        instructionExecutor.Stop();
        OutputLogToFile(`[Background] Execution stopped`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    };
}

/**
 * 获取执行器状态
 * @param instructionExecutor - 指令执行器实例
 */
export function createGetExecutorStatusHandler(instructionExecutor: InstructionExecutor) {
    return async function getExecutorStatus(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        const status = instructionExecutor.GetStatus();
        sendResponse({ success: true, data: status });
    };
}

/**
 * 获取执行结果
 * @param instructionExecutor - 指令执行器实例
 */
export function createGetResultsHandler(instructionExecutor: InstructionExecutor) {
    return async function getResults(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        const results = instructionExecutor.GetResultManager().GetAllResults();
        OutputLogToFile(`[Background] Retrieved execution results successfully, count: ${results.length}`, { level: LogLevel.INFO });
        sendResponse({ success: true, data: results });
    };
}

/**
 * 清空执行结果
 * @param instructionExecutor - 指令执行器实例
 */
export function createClearResultsHandler(instructionExecutor: InstructionExecutor) {
    return async function clearResults(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        instructionExecutor.GetResultManager().ClearAll();
        OutputLogToFile(`[Background] Cleared execution results successfully`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    };
}
