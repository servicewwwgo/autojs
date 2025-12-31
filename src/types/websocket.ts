import type { NodeProfile } from './node';

/**
 * WebSocket消息类型
 */
export interface WSMessage {
  type: 'login' | 'heartbeat' | 'tabs' | 'error' | 'instructions' | 'cdp' | 'http';
  data?: any;
}

/**
 * WebSocket错误消息
 */
export interface WSErrorMessage extends WSMessage {
  type: 'error';
  data: { error: string; message?: string; code?: number };
}

/**
 * WebSocket登录消息
 */
export interface WSLoginMessage extends WSMessage {
  type: 'login';
  data: NodeProfile;
}

/**
 * WebSocket登录回复
 */
export interface WSLoginResponse extends WSMessage {
  type: 'login';
  data: { success: boolean; message?: string; error?: string; node_id?: string };
}

/**
 * WebSocket心跳消息
 */
export interface WSHeartbeatMessage extends WSMessage {
  type: 'heartbeat';
  data: { timestamp: number };
}

/**
 * WebSocket心跳回复
 */
export interface WSHeartbeatResponse extends WSMessage {
  type: 'heartbeat';
  data: { success: boolean };
}

