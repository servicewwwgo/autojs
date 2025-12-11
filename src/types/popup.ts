/**
 * 彈出窗口消息類型
 */
export interface PopupScriptMessageType {
    type: 'get_results' | 'clear_results' | 'send_results_to_server' | 'instruction_result' | 'connect_websocket' | 'disconnect_websocket' | 'execute_instructions' | 'pause_execution';
    params?: any;
  }