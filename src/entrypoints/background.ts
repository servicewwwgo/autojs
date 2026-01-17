import { defineBackground } from 'wxt/utils/define-background';
import { WEBSOCKET_CONN_URL } from '../consts';
import { CdpExecutor, HttpExecutor, InstructionExecutor, WebSocketConnector } from '../executor';
import { BaseInstructionClass, InstructionFactory } from '../instructions';
import { nodeConfig } from '../managers';
import { BackgroundScriptMessageType, CdpMessage, CdpResult, ExecutorStatus, HttpMessage, HttpResult, Instruction, InstructionResults, TabInfo, WSMessage } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';

// Background script entry point
/// <reference types="chrome" />

// @ts-ignore - WXT会自动注入defineBackground
export default defineBackground(() => {
    // 初始化管理器
    const instructionExecutor = new InstructionExecutor();
    const cdpExecutor = new CdpExecutor();
    const httpExecutor = new HttpExecutor();
    // 初始化WebSocket连接器
    const wsConnector: WebSocketConnector = new WebSocketConnector(WEBSOCKET_CONN_URL);

    // 立即设置回调，确保消息处理器在任何 WebSocket 连接建立之前就已经注册
    // 注意：set_callbacks 函数在后面定义，但这里先声明，稍后调用

    async function get_tabs(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取所有标签页
        const tabs = await browser.tabs.query({});
        OutputLogToFile(`[Background] Retrieved tabs list successfully, count: ${tabs.length}`, { level: LogLevel.INFO });
        sendResponse({
            success: true, data: tabs.map((tab) => ({
                tabId: tab.id as number,
                tabIndex: tab.index as number,
                url: tab.url as string,
            })) as TabInfo[]
        });
    }

    async function get_node_profile(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取节点配置
        const profile = await nodeConfig.GetNodeProfile();
        OutputLogToFile(`[Background] Retrieved node profile successfully`, { level: LogLevel.INFO });
        sendResponse({ success: true, data: profile });
    }

    async function update_node_profile(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 更新节点配置
        await nodeConfig.UpdateNodeProfile(message.params as { node_name?: string; node_token?: string });
        OutputLogToFile(`[Background] Updated node profile successfully`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function add_instructions(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 添加指令集
        // 参数：tabId (number) - 标签页ID, instructionsJsonString (string) - JSON格式的指令字符串
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
    }

    async function execute_instructions(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 执行指令集
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
    }

    async function pause_execution(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 暂停执行
        instructionExecutor.Pause();
        OutputLogToFile(`[Background] Execution paused`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function stop_execution(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 停止执行
        instructionExecutor.Stop();
        OutputLogToFile(`[Background] Execution stopped`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function get_executor_status(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取执行器状态
        const status: ExecutorStatus = instructionExecutor.GetStatus();
        sendResponse({ success: true, data: status });
    }

    async function get_results(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取执行结果
        const results = instructionExecutor.GetResultManager().GetAllResults();
        OutputLogToFile(`[Background] Retrieved execution results successfully, count: ${results.length}`, { level: LogLevel.INFO });
        sendResponse({ success: true, data: results });
    }

    async function clear_results(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 清空执行结果
        instructionExecutor.GetResultManager().ClearAll();
        OutputLogToFile(`[Background] Cleared execution results successfully`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function connect_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 连接WebSocket
        if (message.params?.url) {
            const url = message.params.url as string;
            if (wsConnector) {
                await wsConnector.connect();
                OutputLogToFile(`[Background] WebSocket connected successfully, URL: ${url}`, { level: LogLevel.INFO });
            } else {
                OutputLogToFile(`[Background] WebSocket connection failed: wsConnector not initialized`, { level: LogLevel.ERROR });
            }

            sendResponse({ success: true });
        } else {
            OutputLogToFile(`[Background] WebSocket connection failed: missing URL`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'Missing WebSocket URL' });
        }
    }

    async function disconnect_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 断开WebSocket
        if (wsConnector) {
            wsConnector.disconnect();
            OutputLogToFile(`[Background] WebSocket disconnected`, { level: LogLevel.INFO });
        }

        sendResponse({ success: true });
    }

    async function test_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 测试WebSocket连接
        if (message.params?.url && wsConnector) {
            const url = message.params.url as string;
            const connected = await wsConnector.testConnection(url);
            sendResponse({ success: true, data: { connected } });
        } else {
            sendResponse({ success: false, error: 'Missing WebSocket URL' });
        }
    }

    async function send_results_to_server(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 发送执行结果到服务器
        if (wsConnector && wsConnector.isConnected()) {
            const results = instructionExecutor.GetResultManager().GetAllResults();
            const message: WSMessage = { type: 'instructions', data: results };
            wsConnector.sendMessage(message);
            OutputLogToFile(`[Background] Sent execution results to server successfully, count: ${results.length}`, { level: LogLevel.INFO });
            sendResponse({ success: true });
        } else {
            OutputLogToFile(`[Background] Failed to send execution results to server: WebSocket not connected`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'WebSocket not connected' });
        }
    }

    async function set_callbacks(): Promise<void> {
        // 注册消息类型处理器 - 执行指令（通过 WebSocket 消息）
        wsConnector.registerMessageTypeHandler('instructions', async (message: WSMessage): Promise<void> => {
            await instructionExecutor.handleMessage(message);
        });

        // 设置指令执行器的结果发送回调
        instructionExecutor.setSendResult((result: InstructionResults): void => {
            // 通过 WebSocket 发送指令结果
            wsConnector.sendMessage({ type: 'instructions', data: result } as WSMessage);
        });

        // 注册 cdp 执行器的统一消息处理器（所有 CDP 相关消息都通过 handleMessage 处理）
        wsConnector.registerMessageTypeHandler('cdp', async (message: WSMessage): Promise<void> => {
            await cdpExecutor.handleMessage(message.data as CdpMessage);
        });

        // 设置 CDP 执行器的结果发送回调
        cdpExecutor.setSendResult((result: CdpResult): void => {
            // 通过 WebSocket 发送 CDP 结果
            wsConnector.sendMessage({ type: 'cdp', data: result } as WSMessage);
        });

        // 注册 http 执行器的统一消息处理器（所有 HTTP 相关消息都通过 handleMessage 处理）
        wsConnector.registerMessageTypeHandler('http', async (message: WSMessage): Promise<void> => {
            await httpExecutor.handleMessage(message.data as HttpMessage);
        });

        // 设置 HTTP 执行器的结果发送回调
        httpExecutor.setSendResult((result: HttpResult): void => {
            // 通过 WebSocket 发送 HTTP 结果
            wsConnector.sendMessage({ type: 'http', data: result } as WSMessage);
        });
    }

    let mapTypeToFunction: { [key: string]: (message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => Promise<void> } = {
        'get_tabs': get_tabs,
        'get_node_profile': get_node_profile,
        'update_node_profile': update_node_profile,
        'add_instructions': add_instructions,
        'execute_instructions': execute_instructions,
        'pause_execution': pause_execution,
        'stop_execution': stop_execution,
        'get_executor_status': get_executor_status,
        'get_results': get_results,
        'clear_results': clear_results,
        'connect_websocket': connect_websocket,
        'disconnect_websocket': disconnect_websocket,
        'test_websocket': test_websocket,
        'send_results_to_server': send_results_to_server,
        'setCallbacks': async (message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => {
            set_callbacks();
            sendResponse({ success: true });
        },
    };

    async function ws_check(): Promise<void> {
        // 实际检查 WebSocket 连接状态，防止 Service Worker 休眠后状态不一致
        // 如果已经连接且 WebSocket 实际处于 OPEN 状态，直接返回
        if (wsConnector.isConnected()) {
            OutputLogToFile('[Background] WebSocket already connected, skipping connection and send_tabs', { level: LogLevel.INFO });
            return;
        }

        OutputLogToFile('[Background] WebSocket not connected or connection lost, attempting to connect...', { level: LogLevel.INFO });

        // 启动连接（异步操作，不等待完成）
        wsConnector.connect().catch(error => {
            OutputLogToFile(`[Background] Failed to connect WebSocket: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        });
    }

    // 监听来自 popup 和 content script 的消息
    browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {

        try {
            const handler = mapTypeToFunction[message.type];

            if (handler) {
                handler(message, sender, sendResponse).catch((error) => {
                    OutputLogToFile(`[Background] Error processing message (type: ${message.type}): ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
                    sendResponse({ success: false, error: `Error processing message: ${error} ${JSON.stringify(message)}` });
                });
            } else {
                OutputLogToFile(`[Background] Unknown message type: ${message.type}`, { level: LogLevel.WARN });
                sendResponse({ success: false, error: `Unknown message type: ${message.type} ${JSON.stringify(message)}` });
            }
        } catch (error) {
            OutputLogToFile(`[Background] Uncaught error processing message (type: ${message.type}): ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: `Uncaught error processing message: ${error} ${JSON.stringify(message)}` });
        }

        return true; // 保持消息通道开放
    });

    // 监听 CDP 事件（控制台日志和网络日志）
    browser.debugger.onEvent.addListener((source, method, params) => {
        const tabId = source.tabId;
        if (tabId === undefined) return;

        // 处理控制台日志事件
        if (method === 'Runtime.consoleAPICalled') {
            const consoleParams = params as any;
            cdpExecutor.addConsoleLog(tabId, {
                type: consoleParams.type,
                args: consoleParams.args,
                timestamp: consoleParams.timestamp,
                executionContextId: consoleParams.executionContextId,
                stackTrace: consoleParams.stackTrace
            });
        }

        // 处理网络请求事件
        if (method === 'Network.requestWillBeSent') {
            const networkParams = params as any;
            cdpExecutor.addNetworkLog(tabId, {
                event: 'requestWillBeSent',
                requestId: networkParams.requestId,
                request: networkParams.request,
                timestamp: networkParams.timestamp,
                wallTime: networkParams.wallTime,
                initiator: networkParams.initiator,
                redirectResponse: networkParams.redirectResponse,
                type: networkParams.type,
                frameId: networkParams.frameId
            });
        }

        // 处理网络响应事件
        if (method === 'Network.responseReceived') {
            const networkParams = params as any;
            cdpExecutor.addNetworkLog(tabId, {
                event: 'responseReceived',
                requestId: networkParams.requestId,
                response: networkParams.response,
                timestamp: networkParams.timestamp,
                type: networkParams.type,
                frameId: networkParams.frameId
            });
        }

        // 处理网络请求完成事件
        if (method === 'Network.loadingFinished') {
            const networkParams = params as any;
            cdpExecutor.addNetworkLog(tabId, {
                event: 'loadingFinished',
                requestId: networkParams.requestId,
                timestamp: networkParams.timestamp,
                encodedDataLength: networkParams.encodedDataLength
            });
        }

        // 处理网络请求失败事件
        if (method === 'Network.loadingFailed') {
            const networkParams = params as any;
            cdpExecutor.addNetworkLog(tabId, {
                event: 'loadingFailed',
                requestId: networkParams.requestId,
                timestamp: networkParams.timestamp,
                type: networkParams.type,
                errorText: networkParams.errorText,
                canceled: networkParams.canceled,
                blockedReason: networkParams.blockedReason
            });
        }
    });

    async function initialize(): Promise<void> {
        try {
            // 检查定时任务是否已存在
            const existingAlarm = await browser.alarms.get('connect_websocket');

            if (!existingAlarm) {
                // 等待10秒后创建定时任务
                await new Promise(resolve => setTimeout(resolve, 10 * 1000));

                // 如果不存在，创建定时任务
                browser.alarms.create('connect_websocket', { periodInMinutes: 1, delayInMinutes: 0 });
                OutputLogToFile('[Background] Created connect_websocket alarm', { level: LogLevel.INFO });
            }

            // 设置回调
            set_callbacks().catch(error => OutputLogToFile(`[Background] Failed to set callbacks: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR }));
        } catch (error) {
            OutputLogToFile(`[Background] Failed to ensure alarms exist: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        }
    }

    // 监听 Chrome 程序启动
    browser.runtime.onStartup.addListener(async () => {
        OutputLogToFile('[Background] Chrome program started, initializing', { level: LogLevel.INFO });
        await initialize();
    });

    // Chrome Service Worker 暂停时（Manifest V3）
    browser.runtime.onSuspend.addListener(async () => {
        OutputLogToFile('[Background] Service Worker suspended, WebSocket connection may be lost', { level: LogLevel.WARN });
        // 注意：Service Worker 休眠时，WebSocket 连接会被断开
        // 当 Service Worker 被唤醒时（通过 alarm），会通过 ws_check() 重新连接
    });

    // 点击扩展图标时打开侧边栏
    browser.action.onClicked.addListener(async (tab) => {
        if (tab.id) {
            await browser.sidePanel.open({ tabId: tab.id });
            OutputLogToFile(`[Background] Side panel opened for tab ${tab.id}`, { level: LogLevel.INFO });
        }
    });

    // 扩展安装时的初始化
    browser.runtime.onInstalled.addListener(async (details) => {
        // 输出日志
        OutputLogToFile(`[Background] Extension installed/updated, reason: ${details.reason}, initializing`, { level: LogLevel.INFO });
        // 初始化
        await initialize();

        // 检查WebSocket连接
        await ws_check();
    });

    // alarms定时任务
    browser.alarms.onAlarm.addListener(async (alarm) => {
        OutputLogToFile(`[Background] Alarm triggered: ${alarm.name}`, { level: LogLevel.INFO });

        switch (alarm.name) {
            case 'connect_websocket':
                {
                    // Service Worker 可能刚从休眠中唤醒，检查并修复连接状态
                    OutputLogToFile('[Background] Checking WebSocket connection after Service Worker wake-up', { level: LogLevel.INFO });
                    await ws_check();
                    break;
                }
            default:
                break;
        }
    });

    // 在 background script 启动时立即设置回调，确保消息处理器在任何 WebSocket 连接建立之前就已经注册
    set_callbacks().catch(error => {
        OutputLogToFile(`[Background] Failed to set callbacks on startup: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
    });
});