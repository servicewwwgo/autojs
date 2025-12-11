/**
 * 内容脚本消息類型
 */
export interface ContentScriptMessageType {
    type: 'scroll_into_view' | 'get_attribute' | 'execute_script' | 'get_text' | 'is_visible';
    params?: any;
  }
  