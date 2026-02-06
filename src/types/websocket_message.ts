import type { NodeProfile } from './node';
import type { LogLevel } from '../utils/index';

/**
 * 业务逻辑：定义 WebSocket 消息的基础结构，用于扩展与服务器之间的双向通信，统一消息格式，支持多种消息类型（错误、登录、心跳、指令、CDP、HTTP 等）
 *
 * 实现方式：使用 TypeScript 接口定义消息结构，包含 type 字段（消息类型）和可选的 data 字段（消息数据），type 字段使用联合类型限制为预定义的消息类型
 *
 * 注意事项：
 * - type 字段为必需字段，必须是预定义的消息类型之一
 * - data 字段为可选字段，根据不同的消息类型，data 的结构会有所不同
 * - 所有具体的消息类型（如 WSLoginMessage、WSErrorMessage 等）都继承自此接口
 * - 消息在传输前会被序列化为 JSON 字符串，接收后需要反序列化
 * - 消息大小限制为 10MB，超过限制的消息会被拒绝发送
 *
 * 相关代码：src/executor/WebSocketConnector.ts - handleMessage() 函数（处理接收到的消息），sendMessage() 函数（发送消息）
 */
export interface WSMessage {
  type: 'error' | 'login' | 'heartbeat' | 'tabs' | 'instructions' | 'cdp' | 'http' | 'log' | 'logger';
  data?: any;
}

/**
 * 业务逻辑：定义 WebSocket 错误消息的结构，用于服务器向客户端报告错误信息，包括连接错误、认证错误、业务逻辑错误等
 *
 * 实现方式：继承自 WSMessage 接口，固定 type 为 'error'，data 字段为必需且包含错误信息对象（error、message、code）
 *
 * 注意事项：
 * - type 字段固定为 'error'，不能为其他值
 * - data 字段为必需字段，必须包含 error 字符串（错误描述）
 * - message 字段为可选，用于提供更详细的错误信息
 * - code 字段为可选，用于提供错误代码，便于程序化处理错误
 * - 接收到错误消息后，WebSocketConnector 会调用 handleErrorMessage() 处理
 *
 * 相关代码：src/executor/WebSocketConnector.ts - handleErrorMessage() 函数（处理错误消息），handleMessage() 函数（路由错误消息）
 */
export interface WSErrorMessage extends WSMessage {
  type: 'error';
  data: { error: string; message?: string; code?: number };
}

/**
 * 业务逻辑：定义客户端向服务器发送的登录消息结构，用于身份认证和节点注册，建立客户端与服务器的信任关系
 *
 * 实现方式：继承自 WSMessage 接口，固定 type 为 'login'，data 字段为必需且类型为 NodeProfile（包含节点类型、ID、名称和令牌）
 *
 * 注意事项：
 * - type 字段固定为 'login'，不能为其他值
 * - data 字段为必需字段，必须包含完整的 NodeProfile 信息
 * - 登录消息在 WebSocket 连接建立后自动发送，无需手动调用
 * - 服务器验证节点信息后，会返回 WSLoginResponse 响应
 * - 登录失败时，服务器会返回错误消息，连接会被断开
 *
 * 相关代码：src/executor/WebSocketConnector.ts - sendLoginMessage() 函数（发送登录消息），src/managers/NodeManager.ts - GetNodeProfile() 函数（获取节点配置）
 */
export interface WSLoginMessage extends WSMessage {
  type: 'login';
  data: NodeProfile;
}

/**
 * 业务逻辑：定义服务器对客户端登录请求的响应结构，用于通知登录结果，成功时建立会话，失败时提供错误信息
 *
 * 实现方式：继承自 WSMessage 接口，固定 type 为 'login'，data 字段为必需且包含登录结果信息（success、message、error、node_id）
 *
 * 注意事项：
 * - type 字段固定为 'login'，与登录请求消息类型相同，通过消息方向区分请求和响应
 * - data.success 字段为必需，表示登录是否成功
 * - data.message 字段为可选，用于提供成功时的提示信息
 * - data.error 字段为可选，用于提供失败时的错误描述
 * - data.node_id 字段为可选，服务器可能返回确认的节点 ID
 * - 登录失败时，WebSocketConnector 会断开连接并安排重连
 *
 * 相关代码：src/executor/WebSocketConnector.ts - handleLoginResponse() 函数（处理登录响应），handleMessage() 函数（路由登录响应）
 */
export interface WSLoginResponse extends WSMessage {
  type: 'login';
  data: { success: boolean; message?: string; error?: string; node_id?: string };
}

/**
 * 业务逻辑：定义客户端向服务器发送的心跳消息结构，用于保持 WebSocket 连接活跃，检测连接状态，防止连接因超时被关闭
 *
 * 实现方式：继承自 WSMessage 接口，固定 type 为 'heartbeat'，data 字段为必需且包含时间戳（timestamp）
 *
 * 注意事项：
 * - type 字段固定为 'heartbeat'，不能为其他值
 * - data.timestamp 字段为必需，使用 Unix 时间戳（毫秒）表示发送时间
 * - 心跳消息由 WebSocketConnector 自动发送，默认间隔为 15 秒
 * - 服务器收到心跳消息后，会返回 WSHeartbeatResponse 响应
 * - 如果连续多次心跳无响应，可能表示连接已断开，会触发重连机制
 *
 * 相关代码：src/executor/WebSocketConnector.ts - sendHeartbeat() 函数（发送心跳消息），startHeartbeat() 函数（启动心跳定时器）
 */
export interface WSHeartbeatMessage extends WSMessage {
  type: 'heartbeat';
  data: { timestamp: number };
}

/**
 * 业务逻辑：定义服务器对客户端心跳消息的响应结构，用于确认连接正常，维持会话活跃状态
 *
 * 实现方式：继承自 WSMessage 接口，固定 type 为 'heartbeat'，data 字段为必需且包含成功标识（success）
 *
 * 注意事项：
 * - type 字段固定为 'heartbeat'，与心跳请求消息类型相同，通过消息方向区分请求和响应
 * - data.success 字段为必需，表示服务器是否成功处理心跳消息
 * - 收到心跳响应后，WebSocketConnector 会更新连接状态，确认连接正常
 * - 如果长时间未收到心跳响应，可能表示连接异常，会触发重连机制
 *
 * 相关代码：src/executor/WebSocketConnector.ts - handleHeartbeatResponse() 函数（处理心跳响应），handleMessage() 函数（路由心跳响应）
 */
export interface WSHeartbeatResponse extends WSMessage {
  type: 'heartbeat';
  data: { success: boolean };
}

/**
 * 业务逻辑：定义 WebSocket 日志消息的结构，用于客户端向服务器发送日志信息，以及服务器向客户端发送的 Logger 控制消息，便于服务器端统一管理和监控客户端运行状态
 *
 * 实现方式：继承自 WSMessage 接口，type 可以是 'log'（日志消息）或 'logger'（控制消息），data 字段为必需且包含日志信息对象或控制信息对象
 *
 * 注意事项：
 * - type 字段可以是 'log' 或 'logger'
 * - 当 type 为 'log' 时：
 *   - data.message 字段为必需，表示日志消息内容
 *   - data.level 字段为必需，使用 LogLevel 枚举值（DEBUG、INFO、WARN、ERROR）
 *   - data.timestamp 字段为可选，表示日志时间戳，未提供时由服务器端生成
 *   - data.source 字段为可选，表示日志来源（如模块名、函数名），便于定位问题
 * - 当 type 为 'logger' 时：
 *   - data.enable 字段为必需，true 表示开启 Logger，false 表示关闭 Logger
 * - 日志消息可用于远程调试、问题排查和运行状态监控
 * - 生产环境建议仅发送 WARN 和 ERROR 级别的日志，减少网络传输
 * - Logger 控制消息用于动态控制日志传输，减少不必要的网络流量
 *
 * 相关代码：src/utils/index.ts - LogLevel 枚举（日志级别定义），LogOptions 接口（日志选项），OutputLogToFile() 函数（日志输出），src/executor/WebSocketConnector.ts - handleLoggerMessage() 函数（处理 Logger 控制消息），sendLogMessage() 函数（根据 enableLogger 状态决定是否发送）
 */
export interface WSLogMessage extends WSMessage {
  type: 'log' | 'logger';
  data: {
    message?: string;
    level?: LogLevel;
    timestamp?: number;
    source?: string;
    enable?: boolean;
  };
}

