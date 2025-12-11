/**
 * 背景脚本消息類型
 */
export interface BackgroundScriptMessageType {
    type: 'get_tabs' | 'get_node_profile' | 'update_node_profile' | 'contentScriptReady' | 'add_instructions' | 'execute_instructions' | 'pause_execution' | 'stop_execution' | 'get_executor_status' | 'get_results' | 'clear_results' | 'connect_websocket' | 'disconnect_websocket' | 'test_websocket' | 'send_results_to_server';
    params?: any;
  }
  