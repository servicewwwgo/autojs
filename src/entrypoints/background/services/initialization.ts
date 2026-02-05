import { LogLevel, OutputLogToFile } from '../../../utils';
import { WebSocketService } from './websocket';

/**
 * 初始化服务
 * 
 * 业务逻辑：负责扩展的初始化逻辑，包括创建定时任务检查 WebSocket 连接、设置消息回调函数，
 * 确保扩展在安装、启动、Service Worker 唤醒等场景下能够正常工作
 * 
 * 实现方式：使用浏览器 alarms API 创建定时任务，定期检查 WebSocket 连接状态，通过 WebSocketService 设置消息回调
 * 
 * 注意事项：
 * - 定时任务每分钟执行一次，用于在 Service Worker 休眠后唤醒时检查并重连 WebSocket
 * - 初始化逻辑需要幂等，多次调用不应产生副作用
 * - 所有错误都会被捕获并记录日志，避免初始化失败导致扩展无法使用
 * 
 * 相关代码：src/entrypoints/background/services/websocket.ts - WebSocketService，src/entrypoints/background.ts - 后台脚本入口
 */
export class InitializationService {
    private webSocketService: WebSocketService;

    constructor(webSocketService: WebSocketService) {
        this.webSocketService = webSocketService;
    }

    /**
     * 业务逻辑：初始化扩展服务，创建定时任务并设置 WebSocket 回调，确保扩展功能可用
     * 
     * 实现方式：检查是否存在 WebSocket 连接检查定时任务，如果不存在则创建每分钟执行一次的定时任务，
     * 然后调用 WebSocketService 设置消息回调函数
     * 
     * 注意事项：
     * - 定时任务创建前会检查是否已存在，避免重复创建
     * - 设置回调需要在 WebSocket 连接之前完成，确保消息能够正确路由
     * - 初始化失败不会抛出异常，而是记录错误日志
     * 
     * 相关代码：src/entrypoints/background/services/websocket.ts - WebSocketService.setCallbacks()
     */
    async initialize(): Promise<void> {
        try {
            // 检查定时任务是否已存在
            const existingAlarm = await browser.alarms.get('connect_websocket');

            if (!existingAlarm) {
                // 如果不存在，创建定时任务
                browser.alarms.create('connect_websocket', { periodInMinutes: 1, delayInMinutes: 0 });
                OutputLogToFile('[Background] Created connect_websocket alarm', { level: LogLevel.INFO });
            }

            // 设置回调
            await this.webSocketService.setCallbacks();
        } catch (error) {
            OutputLogToFile(`[Background] Failed to ensure alarms exist: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        }
    }

    /**
     * 业务逻辑：处理定时任务触发事件，根据任务名称执行相应的维护操作（如检查 WebSocket 连接）
     * 
     * 实现方式：根据 alarm.name 匹配对应的处理逻辑，目前支持 'connect_websocket' 任务，用于检查并重连 WebSocket
     * 
     * 注意事项：
     * - Service Worker 休眠后 WebSocket 连接会被断开，需要通过定时任务定期检查并重连
     * - 如果 WebSocket 已连接，则跳过连接操作，避免不必要的重连
     * 
     * 相关代码：src/entrypoints/background/services/websocket.ts - WebSocketService.checkAndConnect()
     */
    async handleAlarm(alarm: Browser.alarms.Alarm): Promise<void> {
        OutputLogToFile(`[Background] Alarm triggered: ${alarm.name}`, { level: LogLevel.INFO });

        switch (alarm.name) {
            case 'connect_websocket':
                {
                    // Service Worker 可能刚从休眠中唤醒，检查并修复连接状态
                    OutputLogToFile('[Background] Checking WebSocket connection after Service Worker wake-up', { level: LogLevel.INFO });
                    await this.webSocketService.checkAndConnect();
                    break;
                }
            default:
                break;
        }
    }
}
