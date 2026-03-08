import { defineBackground } from 'wxt/utils/define-background';
import { WEBSOCKET_CONN_URL } from '../consts';
import { CdpExecutor, HttpExecutor, InstructionExecutor, WebSocketConnector } from '../executor';
import { elementManager } from '../managers';
import { BackgroundScriptMessageType } from '../types';
import { LogLevel, OutputLogToFile, setGlobalWebSocketConnector } from '../utils';
import {
    getTabs,
    getNodeProfile,
    updateNodeProfile,
    createAddInstructionsHandler,
    createExecuteInstructionsHandler,
    createGetResultsHandler,
    createClearResultsHandler,
    createConnectWebSocketHandler,
    createDisconnectWebSocketHandler,
    createTestWebSocketHandler,
    createSendResultsToServerHandler,
    createGetWsLogsHandler,
    createClearWsLogsHandler
} from './background/handlers';
import { WebSocketService, CdpEventService, InitializationService } from './background/services';

/**
 * Background script 入口点
 * 
 * 业务逻辑：作为浏览器扩展的后台脚本入口，负责初始化各种执行器和服务，处理来自 popup 和 content script 的消息，
 * 管理 WebSocket 连接，监听浏览器生命周期事件，确保扩展在安装、启动、休眠等场景下正常工作
 * 
 * 实现方式：使用 WXT 框架的 defineBackground 定义后台脚本，创建指令执行器、CDP 执行器、HTTP 执行器和 WebSocket 连接器，
 * 通过消息路由机制将不同类型的消息分发到对应的处理器函数，监听浏览器运行时事件（启动、安装、暂停、定时任务）进行初始化
 * 
 * 注意事项：
 * - Service Worker 在 Manifest V3 中可能会休眠，导致 WebSocket 连接断开，需要通过定时任务（alarm）定期检查并重连
 * - 消息处理器返回 true 以保持消息通道开放，支持异步响应
 * - 所有错误都会被捕获并记录日志，避免未处理的异常导致扩展崩溃
 * 
 * 相关代码：src/entrypoints/background/handlers/ - 各种消息处理器，src/entrypoints/background/services/ - 后台服务
 */
/// <reference types="chrome" />

// @ts-ignore - WXT会自动注入defineBackground
export default defineBackground(() => {
    // 初始化管理器
    const instructionExecutor = new InstructionExecutor();
    const cdpExecutor = new CdpExecutor();
    const httpExecutor = new HttpExecutor();
    const wsConnector: WebSocketConnector = new WebSocketConnector(WEBSOCKET_CONN_URL);

    // 设置全局 WebSocketConnector 引用，使 OutputLogToFile 能够发送日志
    setGlobalWebSocketConnector(wsConnector);

    // 初始化服务
    const webSocketService = new WebSocketService(wsConnector, instructionExecutor, cdpExecutor, httpExecutor);
    const cdpEventService = new CdpEventService(cdpExecutor);
    const initializationService = new InitializationService(webSocketService);

    // 初始化CDP事件监听
    cdpEventService.initialize();

    /**
     * 业务逻辑：当内容脚本加载完成时，通知后台脚本进行初始化，确保扩展服务准备就绪
     * 
     * 实现方式：接收来自 content script 的 'content_script_loaded' 消息，调用初始化服务进行扩展初始化
     * 
     * 注意事项：此函数在 content script 加载时被调用，需要确保初始化服务已准备好
     * 
     * 相关代码：src/entrypoints/content.ts - content script 入口，src/entrypoints/background/services/initialization.ts - 初始化服务
     */
    async function contentScriptLoaded(
        message: BackgroundScriptMessageType,
        sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        OutputLogToFile('[Background] Content script loaded', { level: LogLevel.INFO });
        await initializationService.initialize();
        sendResponse({ success: true });
    }

    /**
     * 业务逻辑：设置 WebSocket 服务的回调函数，建立执行器与 WebSocket 连接器之间的消息传递机制
     * 
     * 实现方式：调用 WebSocketService 的 setCallbacks 方法，注册指令、CDP、HTTP 消息处理器和结果发送回调
     * 
     * 注意事项：回调设置需要在 WebSocket 连接之前完成，确保消息能够正确路由和处理
     * 
     * 相关代码：src/entrypoints/background/services/websocket.ts - WebSocketService.setCallbacks()
     */
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
        'get_results': createGetResultsHandler(instructionExecutor),
        'clear_results': createClearResultsHandler(instructionExecutor),
        'connect_websocket': createConnectWebSocketHandler(webSocketService.getConnector()),
        'disconnect_websocket': createDisconnectWebSocketHandler(webSocketService.getConnector()),
        'test_websocket': createTestWebSocketHandler(webSocketService.getConnector()),
        'send_results_to_server': createSendResultsToServerHandler(webSocketService.getConnector(), instructionExecutor),
        'get_ws_logs': createGetWsLogsHandler(webSocketService.getConnector()),
        'clear_ws_logs': createClearWsLogsHandler(webSocketService.getConnector()),
        'content_script_loaded': contentScriptLoaded,
        'setCallbacks': setCallbacks,
    };

    /**
     * 业务逻辑：统一处理来自 popup 和 content script 的消息，根据消息类型路由到对应的处理器
     * 
     * 实现方式：使用消息类型映射表（mapTypeToFunction）查找对应的处理器函数，异步执行并捕获错误
     * 
     * 注意事项：
     * - 返回 true 保持消息通道开放，支持异步响应
     * - 所有错误都会被捕获并记录日志，返回错误响应给调用方
     * - 未知消息类型会记录警告日志并返回错误响应
     * 
     * 相关代码：src/entrypoints/background/handlers/ - 各种消息处理器实现
     */
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

    /**
     * 业务逻辑：监听 Chrome 浏览器启动事件，在浏览器启动时初始化扩展服务
     * 
     * 实现方式：使用 browser.runtime.onStartup 监听器，调用初始化服务进行扩展初始化
     * 
     * 注意事项：此事件仅在浏览器启动时触发，不包含扩展安装或更新场景
     * 
     * 相关代码：src/entrypoints/background/services/initialization.ts - InitializationService.initialize()
     */
    browser.runtime.onStartup.addListener(async () => {
        OutputLogToFile('[Background] Chrome program started, initializing', { level: LogLevel.INFO });
        await initializationService.initialize();
    });

    /**
     * 业务逻辑：监听 Service Worker 暂停事件，记录 WebSocket 连接可能丢失的警告
     * 
     * 实现方式：使用 browser.runtime.onSuspend 监听器，记录警告日志
     * 
     * 注意事项：
     * - Manifest V3 中 Service Worker 会在空闲时休眠，导致 WebSocket 连接断开
     * - 当 Service Worker 被唤醒时（通过 alarm），会通过定时任务检查并重新连接 WebSocket
     * 
     * 相关代码：src/entrypoints/background/services/initialization.ts - InitializationService.handleAlarm()
     */
    browser.runtime.onSuspend.addListener(async () => {
        OutputLogToFile('[Background] Service Worker suspended, WebSocket connection may be lost', { level: LogLevel.WARN });
        // 注意：Service Worker 休眠时，WebSocket 连接会被断开
        // 当 Service Worker 被唤醒时（通过 alarm），会通过 ws_check() 重新连接
    });

    /**
     * 业务逻辑：监听扩展安装或更新事件，在扩展安装或更新时初始化扩展服务
     * 
     * 实现方式：使用 browser.runtime.onInstalled 监听器，根据安装原因（install/update/reload）进行初始化
     * 
     * 注意事项：此事件在扩展首次安装、更新或重新加载时触发，需要确保初始化逻辑幂等
     * 
     * 相关代码：src/entrypoints/background/services/initialization.ts - InitializationService.initialize()
     */
    browser.runtime.onInstalled.addListener(async (details) => {
        // 输出日志
        OutputLogToFile(`[Background] Extension installed/updated, reason: ${details.reason}, initializing`, { level: LogLevel.INFO });
        // 初始化
        await initializationService.initialize();
    });

    /**
     * 业务逻辑：监听标签页关闭事件，释放该标签页占用的所有资源，防止因多次开关标签页导致内存膨胀
     *
     * 实现方式：在 tabs.onRemoved 中调用各管理器的按 tab 清理方法：InstructionExecutor.cleanupTab、ElementManager.ClearTabElements、CdpExecutor 的 clearConsoleLogs/clearNetworkLogs
     *
     * 注意事项：
     * - 用户直接关闭标签页时不会走 close_tab 指令，若不在此清理，ElementManager/ResultManager/InstructionManager/CdpExecutor 中按 tabId 存储的数据会永久保留，造成内存泄漏
     * - 与执行器内的 cleanupTab、ClearTabElements、clearConsoleLogs、clearNetworkLogs 配合使用
     *
     * 相关代码：src/executor/InstructionExecutor.ts - cleanupTab()，src/managers/ElementManager.ts - ClearTabElements()，src/executor/CdpExecutor.ts - clearConsoleLogs/clearNetworkLogs
     */
    browser.tabs.onRemoved.addListener((tabId: number) => {
        OutputLogToFile(`[Background] Tab removed: ${tabId}, cleaning up resources`, { level: LogLevel.INFO });
        instructionExecutor.cleanupTab(tabId);
        elementManager.ClearTabElements(tabId);
        cdpExecutor.clearConsoleLogs(tabId);
        cdpExecutor.clearNetworkLogs(tabId);
    });

    /**
     * 业务逻辑：监听定时任务（alarm）事件，定期检查并维护 WebSocket 连接状态
     *
     * 实现方式：使用 browser.alarms.onAlarm 监听器，将 alarm 事件委托给初始化服务处理
     *
     * 注意事项：定时任务主要用于在 Service Worker 休眠后唤醒时检查 WebSocket 连接状态并重连
     *
     * 相关代码：src/entrypoints/background/services/initialization.ts - InitializationService.handleAlarm()
     */
    browser.alarms.onAlarm.addListener(async (alarm) => {
        await initializationService.handleAlarm(alarm);
    });

    /**
     * 业务逻辑：在后台脚本加载时立即进行初始化，确保扩展服务在启动时即可使用
     * 
     * 实现方式：调用初始化服务的 initialize 方法，捕获并记录初始化错误
     * 
     * 注意事项：初始化失败不会阻止后台脚本继续运行，但可能导致部分功能不可用
     * 
     * 相关代码：src/entrypoints/background/services/initialization.ts - InitializationService.initialize()
     */
    initializationService.initialize().catch(error => {
        console.log('[Background] Failed to initialize:', error);
    });
});
