import { LogLevel, OutputLogToFile } from '../../../utils';
import { WebSocketService } from './websocket';

/**
 * 初始化服务
 * 负责扩展的初始化逻辑
 */
export class InitializationService {
    private webSocketService: WebSocketService;

    constructor(webSocketService: WebSocketService) {
        this.webSocketService = webSocketService;
    }

    /**
     * 初始化扩展
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
     * 处理定时任务
     */
    async handleAlarm(alarm: browser.alarms.Alarm): Promise<void> {
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
