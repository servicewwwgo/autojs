import { defineBackground } from 'wxt/utils/define-background';
import { BackgroundScriptMessageType, ExecutorStatus, TabInfo, Instruction, WSMessage, CdpMessage, CdpResult } from '../types';
import { InstructionFactory, BaseInstructionClass } from '../instructions';
import { nodeConfig, tabManager } from '../managers';
import { InstructionExecutor, CdpExecutor, wsConnector } from '../executor';
import { example } from '../example';
import { OutputLogToFile, LogLevel } from '../utils';

// Background script entry point
/// <reference types="chrome" />

// @ts-ignore - WXT会自动注入defineBackground
export default defineBackground(() => {
    // 初始化管理器
    const instructionExecutor = new InstructionExecutor();
    const cdpExecutor = new CdpExecutor();

    async function add_example_instructions(tabId: number) {
        const now = Date.now();

        const processedInstructions: BaseInstructionClass[] = example.map((inst, index) => {
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
    }

    async function get_tabs(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取所有标签页
        const tabs = await tabManager.GetAllTabs();
        OutputLogToFile(`获取标签页列表成功，数量: ${tabs.length}`, { level: LogLevel.INFO });
        sendResponse({ success: true, data: tabs });
    }

    async function get_node_profile(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取节点配置
        const profile = await nodeConfig.GetNodeProfile();
        OutputLogToFile(`获取节点配置成功`, { level: LogLevel.INFO });
        sendResponse({ success: true, data: profile });
    }

    async function update_node_profile(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 更新节点配置
        await nodeConfig.UpdateNodeProfile(message.params as { node_name?: string; node_token?: string });
        OutputLogToFile(`更新节点配置成功`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function contentScriptReady(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 内容脚本上线，在标签页管理器中添加标签页对象
        if (sender.tab?.id) {
            const tabId = sender.tab.id;
            const tabIndex = sender.tab.index;
            const url = message.params?.url as string || sender.tab.url as string || '';
            tabManager.RecordActivatedTab(tabId, tabIndex, url);
            // 添加測試指令
            instructionExecutor.GetInstructionManager().DeleteInstructionsByTabId(tabId);
            await add_example_instructions(tabId);
            OutputLogToFile(`内容脚本已就绪，标签页ID: ${tabId}, URL: ${url}`, { level: LogLevel.INFO });

            sendResponse({ success: true, data: { tabId, tabIndex, url } });
        } else {
            OutputLogToFile(`内容脚本就绪失败: 无法获取标签页ID`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: '无法获取标签页ID' });
        }
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
                sendResponse({ success: false, error: '指令集必须是数组格式' });
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
            OutputLogToFile(`添加指令集成功，标签页ID: ${tabId}, 指令数量: ${processedInstructions.length}`, { level: LogLevel.INFO });

            sendResponse({ success: true, count: processedInstructions.length });
        } else {
            OutputLogToFile(`添加指令集失败: 缺少tabId或instructionsJsonString参数`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: '缺少tabId或instructionsJsonString参数' });
        }
    }

    async function execute_instructions(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 执行指令集
        if (message.params?.tabId) {
            const tabId = message.params.tabId as number;
            OutputLogToFile(`开始执行指令集，标签页ID: ${tabId}`, { level: LogLevel.INFO });

            // 立即返回响应，然后在后台循环执行所有指令
            sendResponse({ success: true });

            // 循环执行指令，直到没有更多指令或执行被停止
            setTimeout(async () => {
                await instructionExecutor.ExecuteAll([]);
            }, 1000);
        } else {
            OutputLogToFile(`执行指令集失败: 缺少tabId`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: '缺少tabId' });
        }
    }

    async function pause_execution(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 暂停执行
        instructionExecutor.Pause();
        OutputLogToFile(`暂停执行指令`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function stop_execution(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 停止执行
        instructionExecutor.Stop();
        OutputLogToFile(`停止执行指令`, { level: LogLevel.INFO });
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
        OutputLogToFile(`获取执行结果成功，结果数量: ${results.length}`, { level: LogLevel.INFO });
        sendResponse({ success: true, data: results });
    }

    async function clear_results(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 清空执行结果
        instructionExecutor.GetResultManager().ClearAll();
        OutputLogToFile(`清空执行结果成功`, { level: LogLevel.INFO });
        sendResponse({ success: true });
    }

    async function connect_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 连接WebSocket
        if (message.params?.url) {
            const url = message.params.url as string;
            if (wsConnector) {
                await wsConnector.connect();
                OutputLogToFile(`WebSocket 连接成功，URL: ${url}`, { level: LogLevel.INFO });
            } else {
                OutputLogToFile(`WebSocket 连接失败: wsConnector 未初始化`, { level: LogLevel.ERROR });
            }

            sendResponse({ success: true });
        } else {
            OutputLogToFile(`WebSocket 连接失败: 缺少URL`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: '缺少WebSocket URL' });
        }
    }

    async function disconnect_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 断开WebSocket
        if (wsConnector) {
            wsConnector.disconnect();
            OutputLogToFile(`WebSocket 已断开连接`, { level: LogLevel.INFO });
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
            sendResponse({ success: false, error: '缺少WebSocket URL' });
        }
    }

    async function send_results_to_server(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 发送执行结果到服务器
        if (wsConnector && wsConnector.isConnected()) {
            const results = instructionExecutor.GetResultManager().GetAllResults();
            const message: WSMessage = { type: 'instructions', data: results };
            wsConnector.sendMessage(message);
            OutputLogToFile(`发送执行结果到服务器成功，结果数量: ${results.length}`, { level: LogLevel.INFO });
            sendResponse({ success: true });
        } else {
            OutputLogToFile(`发送执行结果到服务器失败: WebSocket未连接`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: 'WebSocket未连接' });
        }
    }

    let mapTypeToFunction: { [key: string]: (message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => Promise<void> } = {
        'get_tabs': get_tabs,
        'get_node_profile': get_node_profile,
        'update_node_profile': update_node_profile,
        'contentScriptReady': contentScriptReady,
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
    };

    // 监听来自 popup 和 content script 的消息
    browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {

        try {
            const handler = mapTypeToFunction[message.type];

            if (handler) {
                handler(message, sender, sendResponse).catch((error) => {
                    OutputLogToFile(`处理消息时发生错误: ${error instanceof Error ? error.message : String(error)}, 消息类型: ${message.type}`, { level: LogLevel.ERROR });
                    sendResponse({ success: false, error: `处理消息时发生错误: ${error} ${JSON.stringify(message)}` });
                });
            } else {
                OutputLogToFile(`未知的消息类型: ${message.type}`, { level: LogLevel.WARN });
                sendResponse({ success: false, error: `未知的消息类型: ${message.type} ${JSON.stringify(message)}` });
            }
        } catch (error) {
            OutputLogToFile(`处理消息时发生未捕获的错误: ${error instanceof Error ? error.message : String(error)}, 消息类型: ${message.type}`, { level: LogLevel.ERROR });
            sendResponse({ success: false, error: `处理消息时发生未捕获的错误: ${error} ${JSON.stringify(message)}` });
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

    // 扩展安装时的初始化
    browser.runtime.onInstalled.addListener(async () => {
        // 输出日志
        OutputLogToFile('扩展安装时的初始化', { level: LogLevel.INFO });

        // 获取节点配置
        await nodeConfig.GetNodeProfile();

        // 注册消息类型处理器 - 执行指令（通过 WebSocket 消息）
        wsConnector.registerMessageTypeHandler('instructions', instructionExecutor.handleMessage.bind(instructionExecutor));

        // 注册 cdp 执行器的统一消息处理器（所有 CDP 相关消息都通过 handleMessage 处理）
        wsConnector.registerMessageTypeHandler('cdp', async (message: WSMessage): Promise<void> => {
            // WSMessage.data 包含 CdpMessage
            const cdpMessage = message.data as CdpMessage;
            await cdpExecutor.handleMessage(cdpMessage);
        });

        // 设置 CDP 执行器的结果发送回调
        cdpExecutor.setSendResult(async (result: CdpResult): Promise<void> => {
            // 通过 WebSocket 发送 CDP 结果
            const message: WSMessage = { type: 'cdp', data: result };
            wsConnector.sendMessage(message);
        });
    });

    // 监听标签页激活
    browser.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await browser.tabs.get(activeInfo.tabId);
        if (tab && tab.url) {
            tabManager.RecordActivatedTab(activeInfo.tabId, tab.index, tab.url);
            OutputLogToFile(`标签页已激活，标签页ID: ${activeInfo.tabId}, URL: ${tab.url}`, { level: LogLevel.INFO });
        }

        // 发送标签页激活消息到服务器
        const message: WSMessage = { type: "tabs", data: { tabId: activeInfo.tabId as number, tabIndex: tab.index, url: tab.url as string } as TabInfo };
        wsConnector.sendMessage(message);
    });

    // 监听标签页更新
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab && tab.url) {
            tabManager.RecordActivatedTab(tabId, tab.index, tab.url);
            OutputLogToFile(`标签页已更新，标签页ID: ${tabId}, URL: ${tab.url}`, { level: LogLevel.INFO });
        }
        // 发送标签页更新消息到服务器
        const message: WSMessage = { type: "tabs", data: { tabId: tabId as number, tabIndex: tab.index, url: tab.url as string } as TabInfo };
        wsConnector.sendMessage(message);
    });

    // 监听标签页关闭
    browser.tabs.onRemoved.addListener((tabId) => {
        tabManager.RemoveActivatedTab(tabId);
        instructionExecutor.GetInstructionManager().DeleteInstructionsByTabId(tabId);
        // 清理该标签页的日志
        cdpExecutor.clearConsoleLogs(tabId);
        cdpExecutor.clearNetworkLogs(tabId);
        OutputLogToFile(`标签页已关闭，标签页ID: ${tabId}`, { level: LogLevel.INFO });
        // 发送标签页关闭消息到服务器
        const message: WSMessage = { type: "tabs", data: { tabId: tabId as number, tabIndex: -1, url: '' } as TabInfo };
        wsConnector.sendMessage(message);
    });
});
