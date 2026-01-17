
/**
 * 元素標記
 */
export const ElementTag: string = 'cdp-locate-id';

/**
 * WebSocket 默认连接 URL
 * 从环境变量读取，如果没有设置则使用默认值
 * 环境变量名: VITE_WEBSOCKET_CONN_URL
 */
export const WEBSOCKET_CONN_URL: string =
    import.meta.env.VITE_WEBSOCKET_CONN_URL || 'wss://browser.autowave.dev/ws';

/**
 * 调试模式
 * 从环境变量读取，如果没有设置则默认为 true
 * 环境变量名: VITE_DEBUG_MODE
 * 有效值: 'true' (字符串) 表示启用，其他值或未设置表示禁用
 */
export const DEBUG_MODE: boolean =
    import.meta.env.VITE_DEBUG_MODE === undefined ||
    import.meta.env.VITE_DEBUG_MODE === '' ||
    import.meta.env.VITE_DEBUG_MODE === 'true';

/**
 * 应用版本号 从环境变量读取，如果没有设置则使用默认值
 * 环境变量名: VITE_APP_VERSION
 */
export const APP_VERSION: string =
    import.meta.env.VITE_APP_VERSION || '1.0.0';