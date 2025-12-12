/**
 * 元素对象成员类型
 */
export interface ElementData {
  dom?: HTMLElement;                      // 元素DOM
  nodeId?: number;                        // CDP节点ID
  tag?: string;                           // 元素标签 - 由 background script 脚本在定位到元素后設置
  tabId?: number;                         // 标签页ID
  name: string;                           // 元素名称
  description: string;                    // 元素描述
  backup?: string;                        // 元素備注
  selector: string;                       // 元素选择器
  selectorType: 'css' | 'xpath' | 'id';   // 元素选择器类型
  parentName?: string;                    // 父元素名称 - 儅存在多個元素匹配時, 使用父元素名称來區分, 通過 elementManager 來獲取這個元素的父元素對象, 並通過相對關係匹配
  childrenName?: string;                  // 子元素名称 - 儅存在多個元素匹配時, 使用子元素名称來區分, 通過 elementManager 來獲取這個元素的子元素對象, 並通過相對關係匹配
  siblingName?: string;                   // 兄弟元素名称 - 儅存在多個元素匹配時, 使用兄弟元素名称來區分, 通過 elementManager 來獲取這個元素的兄弟元素對象, 並通過相對關係匹配
  siblingOffset?: number;                 // 兄弟元素偏移量 - 儅存在多個元素匹配時, 使用兄弟元素偏移量來區分
}

/**
 * 指令结果类型
 */
export interface InstructionResult {
  instructionID: string;
  success: boolean;
  error?: string;
  duration: number;
  data?: any;
}

/**
 * 基础指令对象类型
 */
export interface BaseInstruction {
  tabId: number;  // 标签页ID
  type: string;  // 指令类型
  instructionID: string;  // 指令ID
  delay?: number;  // 延迟时间
  retry?: number;  // 重试次数
  timeout?: number;  // 超时时间
  ignoreError?: boolean;  // 是否忽略错误
  created_at: number;  // 创建时间
}

/**
 * 页面导航指令
 */
export interface NavigateInstruction extends BaseInstruction {
  type: 'navigate';
  url: string;
}

/**
 * 页面JavaScript执行指令
 */
export interface ExecuteScriptInstruction extends BaseInstruction {
  type: 'execute_script';
  expression: string;
  objectGroup?: string;
  includeCommandLineAPI?: boolean;
  silent?: boolean;
  contextId?: any;
  returnByValue?: boolean;
  generatePreview?: boolean;
  userGesture?: boolean;
  awaitPromise?: boolean;
  throwOnSideEffect?: boolean;
  disableBreaks?: boolean;
  replMode?: boolean;
  allowUnsafeEvalBlockedByCSP?: boolean;
  uniqueContextId?: string;
  serializationOptions?: any;
}

/**
 * 元素查找指令
 */
export interface FindElementInstruction extends BaseInstruction {
  type: 'find_element';
  element: ElementData;
}

/**
 * 文本输入指令
 */
export interface InputInstruction extends BaseInstruction {
  type: 'input';
  elementName: string;
  text: string;
  clear?: boolean;
}

/**
 * 键盘操作指令
 */
export interface KeyboardInstruction extends BaseInstruction {
  type: 'keyboard';
  elementName?: string;
  action: 'press' | 'type' | 'keydown' | 'keyup';
  key: string;
}

/**
 * 鼠标操作指令
 */
export interface MouseInstruction extends BaseInstruction {
  type: 'mouse';
  action: 'click' | 'dblclick' | 'rightclick' | 'hover' | 'left_mousedown' | 'left_mouseup' | 'right_mousedown' | 'right_mouseup' | 'move_to';
  simulate?: 'calculated' | 'simulated' | 'none';
  elementName?: string;
  x?: number;
  y?: number;
}

/**
 * 获取元素属性指令
 */
export interface GetAttributeInstruction extends BaseInstruction {
  type: 'get_attribute';
  elementName: string;
  attribute?: string;
}

/**
 * 设置元素属性指令
 */
export interface SetAttributeInstruction extends BaseInstruction {
  type: 'set_attribute';
  elementName: string;
  attribute: string;
  value: string;
}

/**
 * 页面截图指令
 */
export interface ScreenshotInstruction extends BaseInstruction {
  type: 'screenshot';
  format?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
}

/**
 * 指令联合类型
 */
export type Instruction =
  | BaseInstruction
  | FindElementInstruction
  | KeyboardInstruction
  | MouseInstruction
  | InputInstruction
  | GetAttributeInstruction
  | SetAttributeInstruction
  | NavigateInstruction
  | ScreenshotInstruction
  | ExecuteScriptInstruction;