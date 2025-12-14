/**
 * CDP 消息数据映射类型
 */
export interface CdpMessage {
    type: 'cdp_connect' | 'cdp_disconnect' | 'list_targets' | 'take_element_screenshot' | 'send_command' | 'grep_source' | 'get_network_logs' | 'get_console_logs' | 'execute_javascript' | 'init_network_logs' | 'init_console_logs';
    id: string;
    data?: any;
}

/**
 * CDP 结果数据映射类型
 */
export interface CdpResult {
    type: string;
    id: string;
    success: boolean;
    error?: string;
    data?: any;
}

/**
 * CDP connect 消息数据映射类型
 */
export interface CdpConnectMessage extends CdpMessage {
    type: 'cdp_connect';
}

/**
 * CDP connect 结果数据映射类型
 */
export interface CdpConnectResult extends CdpResult {
    data?: {
        tabId: number;
    };
}

/**
 * CDP disconnect 消息数据映射类型
 */
export interface CdpDisconnectMessage extends CdpMessage {
    type: 'cdp_disconnect';
}

/**
 * CDP disconnect 结果数据映射类型
 */
export interface CdpDisconnectResult extends CdpResult {
    data?: {
        tabId: number;
    };
}

/**
 * CDP list_targets 消息数据映射类型
 */
export interface CdpListTargetsMessage extends CdpMessage {
    type: 'list_targets';
}

/**
 * CDP list_targets 结果数据映射类型
 */
export interface CdpListTargetsResult extends CdpResult {
    data?: {
        tabId: number;
        tabIndex: number;
        url: string;
    }[];
}

/**
 * CDP execute_javascript 消息数据映射类型
 */
export interface CdpExecuteJavaScriptMessage extends CdpMessage {
    type: 'execute_javascript';
    data?: {
        tabId: number;
        expression: string;
        returnByValue?: boolean;
        awaitPromise?: boolean;
        userGesture?: boolean;
        silent?: boolean;
        contextId?: any;
        objectGroup?: string;
        generatePreview?: boolean;
        includeCommandLineAPI?: boolean;
        throwOnSideEffect?: boolean;
        timeout?: number;
        disableBreaks?: boolean;
        replMode?: boolean;
        allowUnsafeEvalBlockedByCSP?: boolean;
        uniqueContextId?: string;
        serializationOptions?: any;
    };
}

/**
 * CDP execute_javascript 结果数据映射类型
 */
export interface CdpExecuteJavaScriptResult extends CdpResult {
    data?: {
        result: any;
        exceptionDetails?: any;
    }
}

/**
 * CDP take_element_screenshot 消息数据映射类型
 */
export interface CdpTakeElementScreenshotMessage extends CdpMessage {
    type: 'take_element_screenshot';
    data?: {
        tabId: number;
        selector: string;
        selectorType?: string;
    };
}

/**
 * CDP take_element_screenshot 结果数据映射类型
 */
export interface CdpTakeElementScreenshotResult extends CdpResult {
    data?: {
        image: string;
        format: string;
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

/**
 * CDP send_command 消息数据映射类型
 */
export interface CdpSendCommandMessage extends CdpMessage {
    type: 'send_command';
    data?: {
        tabId: number;
        method: string;
        params: any;
    };
}

/**
 * CDP send_command 结果数据映射类型
 */
export interface CdpSendCommandResult extends CdpResult {
    data?: any;
}

/**
 * CDP grep_source 消息数据映射类型
 */
export interface CdpGrepSourceMessage extends CdpMessage {
    type: 'grep_source';
    data?: {
        tabId: number;
        pattern: string;
        caseSensitive?: boolean;
    };
}

/**
 * CDP grep_source 结果数据映射类型
 */
export interface CdpGrepSourceResult extends CdpResult {
    data?: {
        matches: Array<{ url: string; line: number; content: string }>;
        pattern: string;
        count: number;
    };
}

/**
 * CDP get_network_logs 消息数据映射类型
 */
export interface CdpGetNetworkLogsMessage extends CdpMessage {
    type: 'get_network_logs';
    data?: {
        tabId: number;
        clear?: boolean;
        filter?: any;
        limit?: number;
        offset?: number;
        requestId?: string;
        groupByRequest?: boolean;
    };
}

/**
 * CDP get_network_logs 结果数据映射类型
 */
export interface CdpGetNetworkLogsResult extends CdpResult {
    data?: {
        tabId: number;
        logs: any[];
        count: number;
        total: number;
        grouped: boolean;
    };
}

/**
 * CDP init_network_logs 消息数据映射类型
 */
export interface CdpInitNetworkLogsMessage extends CdpMessage {
    type: 'init_network_logs';
    data?: {
        tabId: number;
        clear?: boolean;
    };
}

/**
 * CDP init_network_logs 结果数据映射类型
 */
export interface CdpInitNetworkLogsResult extends CdpResult {
    data?: {
        tabId: number;
        message: string;
    };
}

/**
 * CDP get_console_logs 消息数据映射类型
 */
export interface CdpGetConsoleLogsMessage extends CdpMessage {
    type: 'get_console_logs';
    data?: {
        tabId: number;
        clear?: boolean;
        filter?: any;
        limit?: number;
        offset?: number;
    };
}

/**
 * CDP get_console_logs 结果数据映射类型
 */
export interface CdpGetConsoleLogsResult extends CdpResult {
    data?: {
        tabId: number;
        logs: any[];
        count: number;
        total: number;
    };
}

/**
 * CDP init_console_logs 消息数据映射类型
 */
export interface CdpInitConsoleLogsMessage extends CdpMessage {
    type: 'init_console_logs';
    data?: {
        tabId: number;
        clear?: boolean;
    };
}

/**
 * CDP init_console_logs 结果数据映射类型
 */
export interface CdpInitConsoleLogsResult extends CdpResult {
    data?: {
        tabId: number;
        message: string;
    };
}
