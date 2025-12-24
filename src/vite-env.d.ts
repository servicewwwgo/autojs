/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * WebSocket 连接 URL
     */
    readonly VITE_WEBSOCKET_CONN_URL?: string;

    /**
     * 调试模式开关
     */
    readonly VITE_DEBUG_MODE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

