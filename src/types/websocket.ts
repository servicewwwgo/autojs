import type { NodeProfile } from './node';

/**
 * WebSocket消息类型
 */
export interface WSMessage {
  type: 'login' | 'heartbeat' | 'tabs' | 'error' | 'instructions' | 'cdp';
  data?: any;
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