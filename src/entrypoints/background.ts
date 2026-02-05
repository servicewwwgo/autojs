import { defineBackground } from 'wxt/utils/define-background';
import { WEBSOCKET_CONN_URL } from '../consts';
import { CdpExecutor, HttpExecutor, InstructionExecutor, WebSocketConnector } from '../executor';
import { BackgroundScriptMessageType, ExecutorStatus } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import {
    getTabs,
    getNodeProfile,
    updateNodeProfile,
    createAddInstructionsHandler,
    createExecuteInstructionsHandler,
    createPauseExecutionHandler,
    createStopExecutionHandler,
    createGetExecutorStatusHandler,
    createGetResultsHandler,
    createClearResultsHandler,
    createConnectWebSocketHandler,
    createDisconnectWebSocketHandler,
    createTestWebSocketHandler,
    createSendResultsToServerHandler
} from './background/handlers';
import { WebSocketService, CdpEventService, InitializationService } from './background/services';

// Background script entry point
/// <reference types="chrome" />

// @ts-ignore - WXT会自动注入defineBackground
export default defineBackground(() => {
    // 初始化管理器
    const instructionExecutor = new InstructionExecutor();
    const cdpExecutor = new CdpExecutor();
    const httpExecutor = new HttpExecutor();
    const wsConnector: WebSocketConnector = new WebSocketConnector(WEBSOCKET_CONN_URL);

    // 初始化服务
    const webSocketService = new WebSocketService(wsConnector, instructionExecutor, cdpExecutor, httpExecutor);
    const cdpEventService = new CdpEventService(cdpExecutor);
    const initializationService = new InitializationService(webSocketService);

    // 初始化CDP事件监听
    cdpEventService.initialize();

    // 内容脚本加载完成处理
    async function contentScriptLoaded(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        OutputLogToFile('[Background] Content script loaded', { level: LogLevel.INFO });
        await initializationService.initialize();
        sendResponse({ success: true });
    }

    // 设置回调处理
    async function setCallbacks(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        await webSocketService.setCallbacks();
        sendResponse({ success: true });
    }

    // 创建消息处理器映射
    const mapTypeToFunction: {
        [key: string]: (
            message: BackgroundScriptMessageType,
            sender: Browser.runtime.MessageSender,
            sendResponse: (response?: any) => void
        ) => Promise<void>;
    } = {
        'get_tabs': getTabs,
        'get_node_profile': getNodeProfile,
        'update_node_profile': updateNodeProfile,
        'add_instructions': createAddInstructionsHandler(instructionExecutor),
        'execute_instructions': createExecuteInstructionsHandler(instructionExecutor),
        'pause_execution': createPauseExecutionHandler(instructionExecutor),
        'stop_execution': createStopExecutionHandler(instructionExecutor),
        'get_executor_status': createGetExecutorStatusHandler(instructionExecutor),
        'get_results': createGetResultsHandler(instructionExecutor),
        'clear_results': createClearResultsHandler(instructionExecutor),
        'connect_websocket': createConnectWebSocketHandler(webSocketService.getConnector()),
        'disconnect_websocket': createDisconnectWebSocketHandler(webSocketService.getConnector()),
        'test_websocket': createTestWebSocketHandler(webSocketService.getConnector()),
        'send_results_to_server': createSendResultsToServerHandler(webSocketService.getConnector(), instructionExecutor),
        'content_script_loaded': contentScriptLoaded,
        'setCallbacks': setCallbacks,
    };

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

    // 监听 Chrome 程序启动
    browser.runtime.onStartup.addListener(async () => {
        OutputLogToFile('[Background] Chrome program started, initializing', { level: LogLevel.INFO });
        await initializationService.initialize();
    });

    // Chrome Service Worker 暂停时（Manifest V3）
    browser.runtime.onSuspend.addListener(async () => {
        OutputLogToFile('[Background] Service Worker suspended, WebSocket connection may be lost', { level: LogLevel.WARN });
        // 注意：Service Worker 休眠时，WebSocket 连接会被断开
        // 当 Service Worker 被唤醒时（通过 alarm），会通过 ws_check() 重新连接
    });

    // 扩展安装时的初始化
    browser.runtime.onInstalled.addListener(async (details) => {
        // 输出日志
        OutputLogToFile(`[Background] Extension installed/updated, reason: ${details.reason}, initializing`, { level: LogLevel.INFO });
        // 初始化
        await initializationService.initialize();
    });

    // alarms定时任务
    browser.alarms.onAlarm.addListener(async (alarm) => {
        await initializationService.handleAlarm(alarm);
    });

    // 初始化
    initializationService.initialize().catch(error => {
        console.log('[Background] Failed to initialize:', error);
    });
});
