import { BackgroundScriptMessageType, Instruction } from '../../../types';
import { InstructionExecutor } from '../../../executor';
import { BaseInstructionClass, InstructionFactory } from '../../../instructions';
import { LogLevel, OutputLogToFile } from '../../../utils';

/** 执行指令前的延迟（毫秒），确保指令添加完成后再开始执行 */
const EXECUTE_DELAY_MS = 5000;

/**
 * 业务逻辑：创建添加指令集的处理器函数，将用户配置的指令集添加到指令执行器中等待执行
 * 
 * 实现方式：接收 JSON 字符串格式的指令数组，反序列化后为每条指令设置必要的属性（tabId、instructionID、created_at），
 * 使用 InstructionFactory 创建指令实例，添加到指令执行器的未过滤指令列表中
 * 
 * 注意事项：
 * - 指令必须为数组格式，否则返回错误
 * - 如果指令缺少 tabId，使用消息参数中的 tabId
 * - 如果指令缺少 instructionID，自动生成唯一 ID（格式：inst_时间戳_索引）
 * - 如果指令缺少 created_at，使用当前时间加索引，确保指令按创建时间排序
 * 
 * @param instructionExecutor - 指令执行器实例
 * 
 * 相关代码：src/executor/InstructionExecutor.ts - InstructionExecutor，src/instructions/ - 指令工厂和指令类
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
 * 业务逻辑：创建执行指令集的处理器函数，启动指令执行流程，在后台异步执行所有已添加的指令
 * 
 * 实现方式：立即返回成功响应给调用方，然后使用 setTimeout 延迟 EXECUTE_DELAY_MS 后调用指令执行器的 ExecuteAll 方法，
 * 在后台循环执行所有指令直到完成或被停止
 * 
 * 注意事项：
 * - 执行是异步的，立即返回响应避免阻塞消息通道
 * - 延迟 5 秒执行是为了确保指令添加完成后再开始执行
 * - 执行过程中可以通过暂停或停止消息中断执行
 * 
 * @param instructionExecutor - 指令执行器实例
 * 
 * 相关代码：src/executor/InstructionExecutor.ts - InstructionExecutor.ExecuteAll()
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
            }, EXECUTE_DELAY_MS);
        } else {
            OutputLogToFile(`[Background] Failed to execute instructions: missing tabId`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'Missing tabId' });
        }
    };
}

/**
 * 业务逻辑：创建获取执行结果的处理器函数，返回所有已执行的指令结果，用于在 popup 界面显示执行历史
 * 
 * 实现方式：调用指令执行器的结果管理器的 GetAllResults() 方法，返回所有结果数组
 * 
 * 注意事项：结果包括成功和失败的所有指令执行结果
 * 
 * @param instructionExecutor - 指令执行器实例
 * 
 * 相关代码：src/executor/InstructionExecutor.ts - InstructionExecutor.GetResultManager()
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
 * 业务逻辑：创建清空执行结果的处理器函数，清除所有已保存的指令执行结果，释放内存
 * 
 * 实现方式：调用指令执行器的结果管理器的 ClearAll() 方法，清空结果列表
 * 
 * 注意事项：清空操作不可恢复，执行前需要确认用户意图
 * 
 * @param instructionExecutor - 指令执行器实例
 * 
 * 相关代码：src/executor/InstructionExecutor.ts - InstructionExecutor.GetResultManager()
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
