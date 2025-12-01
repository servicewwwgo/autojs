import { defineBackground } from 'wxt/utils/define-background';
import { BackgroundScriptMessageType, ExecutorStatus, TabInfo, Instruction } from '../types';
import { InstructionFactory, BaseInstructionClass } from '../instructions';
import { instructionManager, resultManager, elementManager, nodeConfig, tabManager } from '../managers';

// Background script entry point
/// <reference types="chrome" />

import { InstructionExecutor, WebSocketConnector } from '../managers';
import { example } from '../example';

// @ts-ignore - WXT会自动注入defineBackground
export default defineBackground(() => {
    // 初始化管理器
    const executor = new InstructionExecutor(instructionManager, resultManager, elementManager);

    // 初始化WebSocket连接器
    let wsConnector: WebSocketConnector | null = null;

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
            return InstructionFactory.create(instruction, executor.GetElementManager());
        });

        instructionManager.AddUnfilteredInstructions(processedInstructions);
    }

    async function get_tabs(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取所有标签页
        const tabs = await tabManager.GetAllTabs();
        sendResponse({ success: true, data: tabs });
    }

    async function get_node_profile(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取节点配置
        const profile = await nodeConfig.GetNodeProfile();
        sendResponse({ success: true, data: profile });
    }

    async function update_node_profile(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 更新节点配置
        await nodeConfig.UpdateNodeProfile(message.params as { node_name?: string; node_token?: string });
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
            instructionManager.DeleteInstructionsByTabId(tabId);
            await add_example_instructions(tabId);

            sendResponse({ success: true, data: { tabId, tabIndex, url } });
        } else {
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
                return InstructionFactory.create(instruction, executor.GetElementManager());
            });

            instructionManager.AddUnfilteredInstructions(processedInstructions);
            sendResponse({ success: true, count: processedInstructions.length });
        } else {
            sendResponse({ success: false, error: '缺少tabId或instructionsJsonString参数' });
        }
    }

    async function execute_instructions(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 执行指令集
        if (message.params?.tabId) {
            const tabId = message.params.tabId as number;
            await executor.Execute(tabId);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: '缺少tabId' });
        }
    }

    async function pause_execution(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 暂停执行
        executor.Pause();
        sendResponse({ success: true });
    }

    async function stop_execution(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 停止执行
        executor.Stop();
        sendResponse({ success: true });
    }

    async function get_executor_status(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取执行器状态
        const status: ExecutorStatus = executor.GetStatus();
        sendResponse({ success: true, data: status });
    }

    async function get_results(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 获取执行结果
        const results = resultManager.GetAllResults();
        sendResponse({ success: true, data: results });
    }

    async function clear_results(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 清空执行结果
        resultManager.ClearAll();
        sendResponse({ success: true });
    }

    async function connect_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 连接WebSocket
        if (message.params?.url) {

            if (wsConnector) { wsConnector.Disconnect(); }
            wsConnector = new WebSocketConnector(message.params.url as string, nodeConfig, instructionManager, resultManager);
            await wsConnector.Connect();
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: '缺少WebSocket URL' });
        }
    }

    async function disconnect_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 断开WebSocket
        if (wsConnector) {
            wsConnector.Disconnect();
            wsConnector = null;
        }
        sendResponse({ success: true });
    }

    async function test_websocket(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 测试WebSocket连接
        if (message.params?.url && wsConnector) {
            const url = message.params.url as string;
            const connected = await wsConnector.TestConnection(url);
            sendResponse({ success: true, data: { connected } });
        } else {
            sendResponse({ success: false, error: '缺少WebSocket URL' });
        }
    }

    async function send_results_to_server(message: BackgroundScriptMessageType, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) {
        // 发送执行结果到服务器
        if (wsConnector && wsConnector.IsConnected()) {
            wsConnector.SendResults();
            sendResponse({ success: true });
        } else {
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

    // 监听来自popup和content script的消息
    browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {

        try {
            const handler = mapTypeToFunction[message.type];

            if (handler) {
                handler(message, sender, sendResponse).catch((error) => sendResponse({ success: false, error: `处理消息时发生错误: ${error} ${JSON.stringify(message)}` }));
            } else {
                sendResponse({ success: false, error: `未知的消息类型: ${message.type} ${JSON.stringify(message)}` });
            }
        } catch (error) {
            sendResponse({ success: false, error: `处理消息时发生未捕获的错误: ${error} ${JSON.stringify(message)}` });
        }

        return true; // 保持消息通道开放
    });

    // 扩展安装时的初始化
    browser.runtime.onInstalled.addListener(async () => {
        await nodeConfig.GetNodeProfile();
    });

    // 监听标签页激活
    browser.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await browser.tabs.get(activeInfo.tabId);
        if (tab && tab.url) {
            tabManager.RecordActivatedTab(activeInfo.tabId, tab.index, tab.url);
        }
        // 发送标签页激活消息到服务器
        if (wsConnector && wsConnector.IsConnected()) {
            wsConnector.SendTabsMessage({ tabId: activeInfo.tabId as number, tabIndex: tab.index, url: tab.url as string } as TabInfo);
        }
    });

    // 监听标签页更新
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab && tab.url) {
            tabManager.RecordActivatedTab(tabId, tab.index, tab.url);
        }
        // 发送标签页更新消息到服务器
        if (wsConnector && wsConnector.IsConnected()) {
            wsConnector.SendTabsMessage({ tabId: tabId as number, tabIndex: tab.index, url: tab.url as string } as TabInfo);
        }
    });

    // 监听标签页关闭
    browser.tabs.onRemoved.addListener((tabId) => {
        tabManager.RemoveActivatedTab(tabId);
        instructionManager.DeleteInstructionsByTabId(tabId);
        // 发送标签页关闭消息到服务器
        if (wsConnector && wsConnector.IsConnected()) {
            wsConnector.SendTabsMessage({ tabId: tabId as number, tabIndex: -1, url: '' } as TabInfo);
        }
    });

    // 定期发送执行结果到服务器
    setInterval(() => {
        if (wsConnector && wsConnector.IsConnected()) {
            wsConnector.SendResults();
        }
    }, 10000); // 每10秒发送一次
});
