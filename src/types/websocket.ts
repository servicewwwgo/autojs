/**
 * WebSocket消息类型
 */
export interface WSMessage {
    type: 'login' | 'heartbeat' | 'tabs' | 'error' | 'instructions' | 'cdp';
    data?: any;
  }