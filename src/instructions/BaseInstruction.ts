import type { BaseInstruction, InstructionResult, ContentScriptMessageType } from '../types';
import { SendMessageToContentScript, ExecuteCDPCommand, OutputLogToFile, LogLevel } from '../utils';

/**
 * 业务逻辑：定义所有指令的基类，提供通用的指令执行框架（延迟、重试、CDP命令执行、消息发送等），确保所有指令类具有统一的执行模式和错误处理机制
 *
 * 实现方式：使用抽象类实现 BaseInstruction 接口，提供延迟执行、重试机制、CDP命令执行、内容脚本消息发送等通用方法，子类只需实现 Execute() 方法
 *
 * 注意事项：
 * - 所有具体指令类必须继承此类并实现 Execute() 方法
 * - delay 属性单位为秒，Delay() 方法会自动转换为毫秒
 * - retry 属性表示重试次数，retry=0 表示不重试但仍执行一次，retry=1 表示最多执行2次（初始+1次重试）
 * - timeout 属性单位为秒，在 CDP 命令执行时会转换为毫秒
 * - Retry() 方法会在每次重试前等待1秒，避免频繁重试
 * - ExecuteCDPCommand() 和 SendMessageToContentScript() 方法封装了底层调用，简化子类实现
 *
 * 相关代码：src/types/instruction.ts - BaseInstruction 接口（指令基础结构），src/instructions/ - 各种具体指令类（继承此类）
 */
export abstract class BaseInstructionClass implements BaseInstruction {
    public tabId: number;
    public type: string;
    public id: string;
    public delay?: number;
    public retry?: number;
    public timeout?: number;
    public ignoreError?: boolean;
    public created_at?: number;
    public params?: any;
    /** 所属请求 id，用于结果上报时与请求匹配 */
    public requestId?: string;

    constructor(instruction: BaseInstruction) {
        this.tabId = instruction.tabId;
        this.type = instruction.type;
        this.id = instruction.id;
        this.delay = instruction.delay;
        this.retry = instruction.retry;
        this.timeout = instruction.timeout;
        this.ignoreError = instruction.ignoreError;
        this.created_at = instruction.created_at;
        this.params = instruction.params;
    }

    /**
     * 业务逻辑：将指令对象转换为普通对象，用于序列化和传输，确保指令数据可以安全地转换为 JSON 格式
     *
     * 实现方式：返回包含所有指令属性的对象，排除方法，只保留数据字段
     *
     * 注意事项：转换后的对象不包含类方法，仅包含数据字段，适合 JSON 序列化
     *
     * 相关代码：src/instructions/index.ts - InstructionFactory.toObject() 方法（使用此方法）
     */
    ToObject(): object {
        return {
            tabId: this.tabId,
            type: this.type,
            id: this.id,
            delay: this.delay,
            retry: this.retry,
            timeout: this.timeout,
            created_at: this.created_at,
            params: this.params
        } as object;
    }

    /**
     * 业务逻辑：执行指令的核心方法，由子类实现具体的指令逻辑，返回执行结果供后续处理和统计
     *
     * 实现方式：抽象方法，子类必须实现，返回 Promise<InstructionResult>，包含执行状态、错误信息和结果数据
     *
     * 注意事项：
     * - 子类实现时应使用 Retry() 方法包装执行逻辑，以支持重试机制
     * - 执行前应调用 Delay() 方法处理延迟
     * - 执行失败时应返回包含 error 字段的结果对象
     * - 执行成功时应返回包含 data 字段的结果对象
     *
     * 相关代码：src/instructions/ - 各种具体指令类（实现此方法），src/executor/InstructionExecutor.ts - ExecuteAll() 函数（调用此方法）
     */
    public abstract Execute(): Promise<InstructionResult>;

    /**
     * 业务逻辑：在执行指令前或执行过程中等待指定时间，用于控制指令执行节奏，避免操作过快导致页面响应不及时
     *
     * 实现方式：使用 Promise 和 setTimeout 实现异步等待，将秒转换为毫秒（乘以1000）
     *
     * 注意事项：
     * - time 参数单位为秒，如果未提供则使用指令的 delay 属性
     * - delay 属性单位为秒，方法内部会自动转换为毫秒
     * - 如果 time 或 delay 为 0 或负数，则不等待直接返回
     * - 例如：delay = 1 表示等待 1 秒（1000毫秒）
     *
     * 相关代码：src/instructions/ - 各种具体指令类（使用此方法实现延迟）
     */
    protected async Delay(time?: number): Promise<void> {
        const delay_time = time || this.delay;

        if (delay_time && delay_time > 0) {
            // 将秒转换为毫秒：delay_time 是秒，需要乘以 1000
            await new Promise<void>(resolve => setTimeout(resolve, delay_time * 1000));
        }
    }

    /**
     * 业务逻辑：在指令执行失败时自动重试，提高指令执行的可靠性，减少因网络波动或页面加载延迟导致的失败
     *
     * 实现方式：根据指令的 retry 属性计算最大尝试次数，循环执行函数直到成功或达到最大次数，每次重试前等待1秒
     *
     * 注意事项：
     * - retry 属性表示重试次数，retry=0 表示不重试但仍执行一次，retry=1 表示最多执行2次（初始+1次重试）
     * - 每次重试前会等待1秒，避免频繁重试导致资源浪费
     * - 所有重试都失败时，返回最后一次的错误结果
     * - 结果中的 duration 字段包含从开始到结束的总执行时间（包括所有重试）
     * - 重试过程中会记录警告日志，便于问题排查
     *
     * 相关代码：src/instructions/ - 各种具体指令类（使用此方法包装执行逻辑）
     */
    protected async Retry(fn: () => Promise<InstructionResult>): Promise<InstructionResult> {
        let lastError: Error | null = null;
        const startTime = Date.now();

        // 确保至少执行一次，即使 retry 为 0 或未设置
        // retry = 0 表示不重试，但仍需执行一次
        // retry = 1 表示最多执行 2 次（初始 + 1次重试）
        const maxAttempts = Math.max(1, (this.retry || 0) + 1);

        for (let i = 1; i <= maxAttempts; i++) {
            try {
                const result = await fn();
                // 计算总执行时间（包括重试）
                result.duration = Date.now() - startTime;
                return result;
            } catch (error) {
                lastError = error as Error;
                // 如果不是最后一次尝试，等待后重试
                if (i < maxAttempts) {
                    OutputLogToFile(`[BaseInstruction] Instruction ${this.id} execution failed, retrying (${i}/${maxAttempts}): ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
                    await this.Delay(1); // 重试前等待 1 秒
                }
            }
        }

        // 所有重试都失败，返回错误结果
        return {
            id: this.id,
            tabId: this.tabId,
            success: false,
            error: lastError?.message || `Execution failed after ${maxAttempts} attempts`,
            duration: Date.now() - startTime
        } as InstructionResult;
    }

    /**
     * 业务逻辑：执行 Chrome DevTools Protocol (CDP) 命令，用于与浏览器页面进行底层交互（DOM操作、输入事件、页面信息等），是大多数指令的核心实现方式
     *
     * 实现方式：调用 utils 模块的 ExecuteCDPCommand 函数，通过 browser.debugger API 发送 CDP 命令到指定标签页
     *
     * 注意事项：
     * - 需要确保标签页已通过 debugger.attach 连接，否则会抛出错误
     * - method 参数为 CDP 方法名，如 'Input.dispatchKeyEvent'、'DOM.focus'、'Page.captureScreenshot' 等
     * - params 参数为 CDP 命令的参数对象，根据不同的方法有不同的参数结构
     * - 如果 CDP 命令执行失败，会抛出错误，应由调用方处理或使用 Retry() 方法包装
     * - 某些 CDP 命令需要先启用对应的域（如 Runtime.enable、DOM.enable），否则会失败
     *
     * 相关代码：src/utils/index.ts - ExecuteCDPCommand() 函数（实际执行 CDP 命令），src/instructions/ - 各种具体指令类（使用此方法执行 CDP 命令）
     */
    protected async ExecuteCDPCommand(method: string, params?: any): Promise<any> {
        return await ExecuteCDPCommand(this.tabId, method, params);
    }

    /**
     * 业务逻辑：发送消息到内容脚本（Content Script），用于与页面中的 JavaScript 环境通信，获取元素信息、执行 DOM 操作等需要页面上下文的功能
     *
     * 实现方式：调用 utils 模块的 SendMessageToContentScript 函数，通过 browser.tabs.sendMessage API 发送消息到指定标签页的内容脚本
     *
     * 注意事项：
     * - 需要确保标签页已加载内容脚本，否则消息发送会失败
     * - message 参数为消息对象，包含消息类型和数据
     * - 内容脚本需要监听消息并返回响应，否则 Promise 会一直等待
     * - 如果消息发送失败或超时，会抛出错误，应由调用方处理或使用 Retry() 方法包装
     * - 内容脚本运行在页面上下文中，可以访问页面的 DOM 和全局变量
     *
     * 相关代码：src/utils/index.ts - SendMessageToContentScript() 函数（实际发送消息），src/entrypoints/content.ts - 内容脚本（接收和处理消息），src/instructions/ - 各种具体指令类（使用此方法与页面通信）
     */
    protected async SendMessageToContentScript(message: ContentScriptMessageType): Promise<any> {
        return await SendMessageToContentScript(this.tabId, message);
    }
}