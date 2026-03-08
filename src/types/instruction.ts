/**
 * 业务逻辑：定义 DOM 元素的完整信息结构，用于元素查找、定位和操作，支持多种选择器类型和相对关系定位，确保在复杂页面中准确找到目标元素
 *
 * 实现方式：使用 TypeScript 接口定义元素数据，包含必需字段（tabId、name、description、selector、selectorType）和可选字段（dom、nodeId、tag、backup、text、相对关系字段）
 *
 * 注意事项：
 * - dom：元素 DOM 对象，由 content script 自动生成，仅在 content script 上下文中可用
 * - nodeId：CDP 节点 ID，由系统在定位元素后自动生成，用于 CDP 操作
 * - tag：元素唯一标记，由 background script 在定位后设置，用于在 content script 中快速查找元素
 * - tabId：标签页 ID，必需字段，指定元素所在的标签页
 * - name：元素名称，必需字段，用于在 ElementManager 中标识和管理元素
 * - description：元素描述，必需字段，用于说明元素的用途
 * - selector：元素选择器，必需字段，根据 selectorType 使用不同的选择器语法
 * - selectorType：选择器类型，支持 'css'、'id'、'tag'、'text'、'ledby' 五种类型（注意：代码中实际支持六种，包括 'xpath'，但 xpath 在 ElementManager 中未实现）
 * - 相对关系字段（parentName、childrenName、siblingName、siblingOffset）：当存在多个元素匹配时，用于进一步筛选和定位
 * - 系统自动生成的字段（dom、nodeId、tag）用户不可手动设置
 *
 * 相关代码：src/managers/ElementManager.ts - ElementClass 类（使用此类型），src/instructions/FindElementInstruction.ts - 查找元素指令（使用此类型）
 */
export interface ElementData {
  dom?: HTMLElement;                      // 元素DOM - 由系统自动生成
  nodeId?: number;                        // CDP节点ID - 由系统自动生成
  tag?: string;                           // 元素标签 - 由 background script 脚本在定位到元素后設置 - 由系统自动生成, 用户不可设置
  tabId: number;                          // 标签页ID
  name: string;                           // 元素名称
  description: string;                    // 元素描述
  backup?: string;                        // 元素備注
  text?: string;                           // 元素文本
  selector: string;                       // 元素选择器
  selectorType: 'css' | 'id' | 'tag' | 'text' | 'ledby';   // 元素选择器类型
  parentName?: string;                    // 父元素名称 - 儅存在多個元素匹配時, 使用父元素名称來區分, 通過 elementManager 來獲取這個元素的父元素對象, 並通過相對關係匹配
  childrenName?: string;                  // 子元素名称 - 儅存在多個元素匹配時, 使用子元素名称來區分, 通過 elementManager 來獲取這個元素的子元素對象, 並通過相對關係匹配
  siblingName?: string;                   // 兄弟元素名称 - 儅存在多個元素匹配時, 使用兄弟元素名称來區分, 通過 elementManager 來獲取這個元素的兄弟元素對象, 並通過相對關係匹配
  siblingOffset?: number;                 // 兄弟元素偏移量 - 儅存在多個元素匹配時, 使用兄弟元素偏移量來區分
}

/**
 * 业务逻辑：定义指令执行结果的基础结构，用于记录指令执行状态、错误信息和执行数据，支持指令执行统计、错误追踪和结果传递
 *
 * 实现方式：使用 TypeScript 接口定义结果结构，包含必需字段（tabId、id、success、duration）和可选字段（error、data）
 *
 * 注意事项：
 * - tabId：标签页 ID，标识指令执行的标签页
 * - id：指令唯一标识符，与指令的 id 字段对应
 * - success：执行是否成功，布尔值，用于快速判断执行状态
 * - error：错误信息，可选字段，仅在执行失败时设置
 * - duration：执行耗时（毫秒），用于性能分析和监控
 * - data：执行结果数据，可选字段，根据不同的指令类型，data 的结构会有所不同
 * - 所有具体的指令结果类型（如 FindElementInstructionResult、NavigateInstructionResult 等）都继承自此接口
 * - 结果会被保存到 InstructionResultManager 中，可通过 WebSocket 发送给服务器
 *
 * 相关代码：src/managers/InstructionResultManager.ts - ResultManager 类（保存和管理结果），src/executor/InstructionExecutor.ts - ExecuteAll() 函数（收集执行结果），src/instructions/ - 各种指令类（返回此类型的结果）
 */
export interface InstructionResult {
  tabId: number;
  id: string;
  success: boolean;
  error?: string;
  duration: number;
  data?: any;
}

/**
 * 业务逻辑：定义页面导航指令的执行结果，记录导航的目标 URL，用于确认导航是否成功
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 url 字符串
 *
 * 注意事项：data.url 为导航的目标 URL，用于验证导航是否到达预期页面
 *
 * 相关代码：src/instructions/NavigateInstruction.ts - NavigateInstructionClass 类（返回此类型结果）
 */
export interface NavigateInstructionResult extends InstructionResult {
  data?: {
    url: string;
  };
}

/**
 * 业务逻辑：定义元素查找指令的执行结果，返回找到的元素完整信息（包括 nodeId、tag 等），用于后续的元素操作
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段为 ElementData 类型
 *
 * 注意事项：data 包含定位后的元素信息，包括系统自动生成的 nodeId 和 tag，可用于后续的点击、输入等操作
 *
 * 相关代码：src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（返回此类型结果）
 */
export interface FindElementInstructionResult extends InstructionResult {
  data?: ElementData;
}

/**
 * 业务逻辑：定义文本输入指令的执行结果，记录输入的文本内容，用于确认输入操作是否成功
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 text 字符串
 *
 * 注意事项：data.text 为实际输入的文本内容，可能与指令中的文本不完全一致（如清空后输入）
 *
 * 相关代码：src/instructions/InputInstruction.ts - InputInstructionClass 类（返回此类型结果）
 */
export interface InputInstructionResult extends InstructionResult {
  data?: {
    text: string;
  };
}

/**
 * 业务逻辑：定义键盘操作指令的执行结果，记录按键操作的类型和内容，用于确认键盘操作是否成功
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 action、key、text 字段
 *
 * 注意事项：action 为操作类型（press、type、keydown、keyup），key 用于特殊按键（如 Enter、Tab），text 用于多字符输入
 *
 * 相关代码：src/instructions/KeyboardInstruction.ts - KeyboardInstructionClass 类（返回此类型结果）
 */
export interface KeyboardInstructionResult extends InstructionResult {
  data?: {
    key?: string;
    text?: string;
    action: 'press' | 'type' | 'keydown' | 'keyup';
  };
}

/**
 * 业务逻辑：定义鼠标操作指令的执行结果，记录鼠标操作的坐标和动作类型，用于确认鼠标操作是否成功
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 x、y 坐标和 action 动作类型
 *
 * 注意事项：x、y 为鼠标操作的坐标位置，action 为操作类型（click、dblclick、hover 等），坐标可能经过计算或模拟
 *
 * 相关代码：src/instructions/MouseInstruction.ts - MouseInstructionClass 类（返回此类型结果）
 */
export interface MouseInstructionResult extends InstructionResult {
  data?: {
    x: number;
    y: number;
    action: 'click' | 'dblclick' | 'rightclick' | 'hover' | 'left_mousedown' | 'left_mouseup' | 'right_mousedown' | 'right_mouseup' | 'move_to';
  };
}

/**
 * 业务逻辑：定义获取元素属性指令的执行结果，返回获取到的属性值和用途标识，用于数据提取和变量赋值
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 usage 和 value 字段
 *
 * 注意事项：usage 标识属性值的用途（variable 用于变量赋值、data 用于数据返回、none 仅获取），value 为获取到的属性值
 *
 * 相关代码：src/instructions/GetAttributeInstruction.ts - GetAttributeInstructionClass 类（返回此类型结果）
 */
export interface GetAttributeInstructionResult extends InstructionResult {
  data?: {
    usage?: "variable" | "data" | "none";
    value?: string;
  };
}

/**
 * 业务逻辑：定义设置元素属性指令的执行结果，记录设置的属性信息，用于确认属性设置是否成功
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 elementName、attribute、value 字段
 *
 * 注意事项：elementName 为元素名称，attribute 为属性名，value 为设置的属性值
 *
 * 相关代码：src/instructions/SetAttributeInstruction.ts - SetAttributeInstructionClass 类（返回此类型结果）
 */
export interface SetAttributeInstructionResult extends InstructionResult {
  data?: {
    elementName: string;
    attribute: string;
    value: string;
  };
}

/**
 * 业务逻辑：定义页面截图指令的执行结果，返回截图的 Base64 编码数据 URL，用于页面状态记录和验证
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 dataUrl、format、quality 字段
 *
 * 注意事项：dataUrl 为 Base64 编码的图片数据 URL，format 为图片格式（png 或 jpeg），quality 为 JPEG 质量（0-100）
 *
 * 相关代码：src/instructions/ScreenshotInstruction.ts - ScreenshotInstructionClass 类（返回此类型结果）
 */
export interface ScreenshotInstructionResult extends InstructionResult {
  data?: {
    dataUrl: string;
    format: 'png' | 'jpeg';
    quality: number;
  };
}

/**
 * 业务逻辑：定义等待标题包含指令的执行结果，记录匹配到的页面标题，用于确认等待条件是否满足
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 title 字符串
 *
 * 注意事项：data.title 为匹配到的页面标题，用于验证等待是否成功
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（返回此类型结果）
 */
export interface WaitTitleContainsResult extends InstructionResult {
  data?: {
    title: string;
  };
}

/**
 * 业务逻辑：定义等待元素存在指令的执行结果，记录找到的元素名称，用于确认元素是否已出现在 DOM 中
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 elementName 字符串
 *
 * 注意事项：data.elementName 为找到的元素名称，用于验证等待是否成功
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（返回此类型结果）
 */
export interface WaitElementExistsResult extends InstructionResult {
  data?: {
    elementName: string;
  };
}

/**
 * 业务逻辑：定义等待元素可见指令的执行结果，记录可见的元素名称，用于确认元素是否已可见
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 elementName 字符串
 *
 * 注意事项：data.elementName 为可见的元素名称，用于验证等待是否成功
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（返回此类型结果）
 */
export interface WaitElementVisibleResult extends InstructionResult {
  data?: {
    elementName: string;
  };
}

/**
 * 业务逻辑：定义等待属性包含指令的执行结果，记录匹配到的元素和属性信息，用于确认元素属性是否包含指定文本
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 elementName、attribute、attributeValue 字段
 *
 * 注意事项：elementName 为元素名称，attribute 为属性名，attributeValue 为匹配到的属性值
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（返回此类型结果）
 */
export interface WaitAttributeContainsResult extends InstructionResult {
  data?: {
    elementName: string;
    attribute: string;
    attributeValue: string;
  };
}

/**
 * 业务逻辑：定义等待页面加载完成指令的执行结果，记录页面的 readyState 状态，用于确认页面是否已完全加载
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 readyState 字符串
 *
 * 注意事项：data.readyState 为页面的 readyState 值（如 'complete'），用于验证页面加载状态
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（返回此类型结果）
 */
export interface WaitPageLoadResult extends InstructionResult {
  data?: {
    readyState: string;
  };
}

/**
 * 业务逻辑：定义等待指令结果的联合类型，涵盖所有等待类型的执行结果，用于类型安全的等待结果处理
 *
 * 实现方式：使用 TypeScript 联合类型，包含所有等待指令结果类型
 *
 * 注意事项：此类型用于类型检查和类型推断，确保等待指令返回正确的结果类型
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（返回此联合类型的结果）
 */
export type WaitInstructionResult =
  | WaitTitleContainsResult
  | WaitElementExistsResult
  | WaitElementVisibleResult
  | WaitAttributeContainsResult
  | WaitPageLoadResult;

/**
 * 业务逻辑：get_url 指令返回的单个 cookie 信息（与扩展 cookies API 对齐，便于序列化）
 */
export interface GetUrlCookieItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'no_restriction' | 'lax' | 'strict';
  expirationDate?: number;
  hostOnly?: boolean;
  session?: boolean;
}

/**
 * 业务逻辑：定义获取当前标签页 URL 指令的执行结果，返回当前页面的 URL、用途标识及当前站点的全部 cookie，用于数据提取和变量赋值
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 usage、url 和 cookies 字段
 *
 * 注意事项：usage 标识 URL 的用途（variable 用于变量赋值、data 用于数据返回、none 仅获取），url 为当前页面的 URL，cookies 为当前 URL 对应站点的全部 cookie（需扩展具备 cookies 权限；无权限或非 http(s) 页面时可能为空数组）
 *
 * 相关代码：src/instructions/GetUrlInstruction.ts - GetUrlInstructionClass 类（返回此类型结果）
 */
export interface GetUrlInstructionResult extends InstructionResult {
  data?: {
    usage?: "variable" | "data" | "none";
    url: string;
    /** 当前网站（当前标签页 URL 对应域名）下的全部 cookie */
    cookies?: GetUrlCookieItem[];
  };
}

/**
 * 业务逻辑：定义激活标签页指令的执行结果，记录激活的标签页 ID，用于确认标签页切换是否成功
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 tabId 数字
 *
 * 注意事项：data.tabId 为激活的标签页 ID，与指令的 tabId 字段相同
 *
 * 相关代码：src/instructions/ActivateTabInstruction.ts - ActivateTabInstructionClass 类（返回此类型结果）
 */
export interface ActivateTabInstructionResult extends InstructionResult {
  data?: {
    tabId: number;
  };
}

/**
 * 业务逻辑：定义页面 JavaScript 执行指令的执行结果，返回脚本执行的返回值，用于获取页面数据和执行自定义逻辑
 *
 * 实现方式：继承自 InstructionResult 接口，data 字段包含 results 字段（任意类型）
 *
 * 注意事项：data.results 为脚本执行的返回值，类型取决于脚本内容，可能是任何可序列化的 JavaScript 值
 *
 * 相关代码：src/instructions/ExecuteScriptInstruction.ts - ExecuteScriptInstructionClass 类（返回此类型结果）
 */
export interface ExecuteScriptInstructionResult extends InstructionResult {
  data?: {
    results: any;
  };
}

/**
 * 业务逻辑：定义所有指令结果的联合类型，涵盖所有指令类型的执行结果，用于类型安全的指令结果处理
 *
 * 实现方式：使用 TypeScript 联合类型，包含所有具体指令结果类型
 *
 * 注意事项：此类型用于类型检查和类型推断，确保指令返回正确的结果类型，便于统一处理和类型安全
 *
 * 相关代码：src/instructions/ - 各种指令类（返回此联合类型的结果），src/managers/InstructionResultManager.ts - 结果管理器（处理此类型的结果）
 */
export type TypedInstructionResult =
  | NavigateInstructionResult
  | FindElementInstructionResult
  | InputInstructionResult
  | KeyboardInstructionResult
  | MouseInstructionResult
  | GetAttributeInstructionResult
  | SetAttributeInstructionResult
  | ScreenshotInstructionResult
  | WaitInstructionResult
  | GetUrlInstructionResult
  | ActivateTabInstructionResult
  | ExecuteScriptInstructionResult;

/**
 * 业务逻辑：定义同一标签页的多个指令执行结果集合，用于批量管理和传输指令结果，支持按标签页分组，便于结果统计和批量发送
 *
 * 实现方式：使用 TypeScript 接口定义结果集合，包含 tabId 字段和 results 数组字段
 *
 * 注意事项：
 * - tabId：标签页 ID，标识结果所属的标签页
 * - results：指令结果数组，包含该标签页下所有已执行的指令结果
 * - 结果按执行顺序排列，遵循 FIFO（先进先出）原则
 * - 结果集合在指令执行完成后，会通过 WebSocket 发送给服务器
 * - 发送后，结果会从 InstructionResultManager 中删除，避免重复发送
 *
 * 相关代码：src/executor/InstructionExecutor.ts - ExecuteAll() 函数（生成结果集合），src/executor/WebSocketConnector.ts - sendMessage() 函数（发送结果集合）
 */
export interface InstructionResults {
  tabId: number;
  results: InstructionResult[];
}

/**
 * 业务逻辑：定义 instructions 请求的 WSMessage.data 负载，与 CDP/HTTP 一致，负载内包含 id 与指令列表
 *
 * 注意事项：
 * - id：请求唯一标识，与响应负载的 id 对应，用于请求-响应匹配
 * - data：指令数组（BaseInstruction[]）
 */
export interface InstructionsRequestPayload {
  id: string;
  data: BaseInstruction[];
}

/**
 * 业务逻辑：定义 instructions 响应的 WSMessage.data 负载，与 CDP/HTTP 一致，负载内包含 id 与结果
 *
 * 注意事项：
 * - id：与请求负载的 id 对应，用于请求-响应匹配
 * - tabId、results：与 InstructionResults 相同
 */
export interface InstructionsResponsePayload {
  id: string;
  tabId: number;
  results: InstructionResult[];
}

/**
 * 业务逻辑：定义所有指令的基础结构，提供通用的指令属性（延迟、重试、超时等），确保指令执行的可靠性和可控性，所有具体指令类型都继承自此接口
 *
 * 实现方式：使用 TypeScript 接口定义基础指令结构，包含必需字段（tabId、type、id）和可选字段（delay、retry、timeout、ignoreError、created_at、params）
 *
 * 注意事项：
 * - tabId：标签页 ID，必需字段，指定指令执行的标签页
 * - type：指令类型，必需字段，用于识别指令类型并路由到对应的执行器
 * - id：指令唯一标识符，必需字段，用于追踪和标识指令
 * - delay：延迟时间（秒），可选字段，指令执行前的等待时间
 * - retry：重试次数，可选字段，执行失败时的重试次数，默认不重试
 * - timeout：超时时间（毫秒），可选字段，指令执行的最大等待时间
 * - ignoreError：是否忽略错误，可选字段，设置为 true 时，即使执行失败也不会中断后续指令
 * - created_at：创建时间戳，可选字段，用于指令排序和优先级控制
 * - params：指令参数，可选字段，根据不同的指令类型，params 的结构会有所不同
 * - 所有具体的指令类型（如 NavigateInstruction、FindElementInstruction 等）都继承自此接口
 *
 * 相关代码：src/instructions/BaseInstruction.ts - BaseInstructionClass 类（指令基类实现），src/managers/InstructionManager.ts - 指令管理器（管理指令队列）
 */
export interface BaseInstruction {
  tabId: number;  // 标签页ID
  type: string;  // 指令类型
  id: string;  // 指令ID
  delay?: number;  // 延迟时间
  retry?: number;  // 重试次数
  timeout?: number;  // 超时时间
  ignoreError?: boolean;  // 是否忽略错误
  created_at?: number;  // 创建时间
  params?: any; // 指令参数
}

/**
 * 业务逻辑：定义页面导航指令，用于跳转到指定 URL，支持页面间的导航和 URL 变更
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'navigate'，params 包含 url 字段
 *
 * 注意事项：params.url 为目标 URL，必须是有效的 URL 格式，支持 http、https、file 等协议
 *
 * 相关代码：src/instructions/NavigateInstruction.ts - NavigateInstructionClass 类（执行此指令）
 */
export interface NavigateInstruction extends BaseInstruction {
  type: 'navigate';
  params: {
    url: string;
  };
}

/**
 * 业务逻辑：定义页面 JavaScript 执行指令，用于在页面上下文中执行自定义 JavaScript 代码，获取页面数据或执行复杂逻辑
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'execute_script'，params 可以是任意类型（通常为脚本字符串或对象）
 *
 * 注意事项：params 为要执行的脚本内容，可以是字符串形式的 JavaScript 代码，执行在页面上下文中，可以访问页面的 DOM 和全局变量
 *
 * 相关代码：src/instructions/ExecuteScriptInstruction.ts - ExecuteScriptInstructionClass 类（执行此指令）
 */
export interface ExecuteScriptInstruction extends BaseInstruction {
  type: 'execute_script';
  params: any;
}

/**
 * 业务逻辑：定义元素查找指令，用于在页面中定位和查找 DOM 元素，为后续操作（点击、输入等）做准备
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'find_element'，params 包含 element 字段（ElementData 类型）
 *
 * 注意事项：params.element 为要查找的元素信息，包含选择器、选择器类型等，定位成功后会设置 nodeId 和 tag
 *
 * 相关代码：src/instructions/FindElementInstruction.ts - FindElementInstructionClass 类（执行此指令）
 */
export interface FindElementInstruction extends BaseInstruction {
  type: 'find_element';
  params: {
    element: ElementData;
  };
}

/**
 * 业务逻辑：定义文本输入指令，用于向输入框、文本域等元素输入文本内容，支持清空后输入
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'input'，params 包含 elementName、text、clear 字段
 *
 * 注意事项：elementName 为元素名称（需先通过 find_element 指令定位），text 为要输入的文本，clear 为是否先清空再输入（默认 false）
 *
 * 相关代码：src/instructions/InputInstruction.ts - InputInstructionClass 类（执行此指令）
 */
export interface InputInstruction extends BaseInstruction {
  type: 'input';
  params: {
    elementName: string;
    text: string;
    clear?: boolean;
  };
}

/**
 * 业务逻辑：定义键盘操作指令，用于模拟键盘按键操作，支持单字符按键和多字符文本输入
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'keyboard'，params 包含 action、key、text、elementName 字段
 *
 * 注意事项：action 为操作类型（press 按下、type 输入、keydown 按下、keyup 释放），key 用于特殊按键（如 Enter、Tab、Escape），text 用于多字符输入，elementName 为可选的目标元素
 *
 * 相关代码：src/instructions/KeyboardInstruction.ts - KeyboardInstructionClass 类（执行此指令）
 */
export interface KeyboardInstruction extends BaseInstruction {
  type: 'keyboard';
  params: {
    elementName?: string;
    action: 'press' | 'type' | 'keydown' | 'keyup';
    key?: string; // 单字符输入按键(主要是用于特殊按键, 如 Enter, Tab, Escape 等)
    text?: string; // 多字符输入文本
  };
}

/**
 * 业务逻辑：定义鼠标操作指令，用于模拟鼠标点击、悬停、移动等操作，支持多种鼠标动作和坐标计算方式
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'mouse'，params 包含 action、simulate、elementName、x、y 字段
 *
 * 注意事项：action 为操作类型（click、dblclick、hover、move_to 等），simulate 为模拟方式（calculated 计算坐标、simulated 模拟事件、none 不模拟），elementName 为可选的目标元素，x、y 为可选坐标
 *
 * 相关代码：src/instructions/MouseInstruction.ts - MouseInstructionClass 类（执行此指令）
 */
export interface MouseInstruction extends BaseInstruction {
  type: 'mouse';
  params: {
    action: 'click' | 'dblclick' | 'rightclick' | 'hover' | 'left_mousedown' | 'left_mouseup' | 'right_mousedown' | 'right_mouseup' | 'move_to';
    simulate?: 'calculated' | 'simulated' | 'none';
    elementName?: string;
    x?: number;
    y?: number;
  };
}

/**
 * 业务逻辑：定义获取元素属性指令，用于读取 DOM 元素的属性值，支持标准属性、计算样式和图片数据，用于数据提取
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'get_attribute'，params 包含 elementName、attribute、usage 字段
 *
 * 注意事项：elementName 为元素名称（需先通过 find_element 指令定位），attribute 为要获取的属性名，usage 标识属性值的用途（variable 用于变量赋值、data 用于数据返回、none 仅获取）
 *
 * 相关代码：src/instructions/GetAttributeInstruction.ts - GetAttributeInstructionClass 类（执行此指令）
 */
export interface GetAttributeInstruction extends BaseInstruction {
  type: 'get_attribute';
  params: {
    elementName: string;
    attribute: string;
    usage?: "variable" | "data" | "none";
  };
}

/**
 * 业务逻辑：定义设置元素属性指令，用于修改 DOM 元素的属性值，支持动态修改页面元素状态
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'set_attribute'，params 包含 elementName、attribute、value 字段
 *
 * 注意事项：elementName 为元素名称（需先通过 find_element 指令定位），attribute 为要设置的属性名，value 为要设置的属性值
 *
 * 相关代码：src/instructions/SetAttributeInstruction.ts - SetAttributeInstructionClass 类（执行此指令）
 */
export interface SetAttributeInstruction extends BaseInstruction {
  type: 'set_attribute';
  params: {
    elementName: string;
    attribute: string;
    value: string;
  };
}

/**
 * 业务逻辑：定义页面截图指令，用于捕获当前页面或元素的截图，支持全页面截图、指定元素截图和指定格式
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'screenshot'，params 包含 format、quality、fullPage、elementName 字段
 *
 * 注意事项：format 为图片格式（png 或 jpeg，默认 png），quality 为 JPEG 质量（0-100，默认 90），fullPage 为是否截取整个页面（默认 false，仅截取可视区域），elementName 为可选元素名称（需先通过 find_element 指令定位），指定时仅截取该元素区域
 *
 * 相关代码：src/instructions/ScreenshotInstruction.ts - ScreenshotInstructionClass 类（执行此指令），src/managers/ElementManager.ts - GetElementByName() 方法（按名称获取元素）
 */
export interface ScreenshotInstruction extends BaseInstruction {
  type: 'screenshot';
  params: {
    format?: 'png' | 'jpeg';
    quality?: number;
    fullPage?: boolean;
    /** 元素名称，需先通过 find_element 指令定位；指定时仅截取该元素区域，优先级高于 fullPage */
    elementName?: string;
  };
}

/**
 * 业务逻辑：定义等待指令，用于等待特定条件满足后再继续执行，支持等待标题、元素、属性、页面加载等多种等待类型
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'wait'，params 包含 waitType 和相应的等待参数
 *
 * 注意事项：waitType 为等待类型（wait_title_contains、wait_element_exists、wait_element_visible、wait_attribute_contains、wait_page_load），根据不同的 waitType，需要提供相应的参数（titleText、element、elementName、attribute、attributeText）
 *
 * 相关代码：src/instructions/WaitInstruction.ts - WaitInstructionClass 类（执行此指令）
 */
export interface WaitInstruction extends BaseInstruction {
  type: 'wait';
  params: {
    waitType: 'wait_title_contains' | 'wait_element_exists' | 'wait_element_visible' | 'wait_attribute_contains' | 'wait_page_load';
    // wait_title_contains 参数
    titleText?: string;
    // wait_element_exists 和 wait_element_visible 参数
    element?: ElementData;
    elementName?: string;
    // wait_attribute_contains 参数
    attribute?: string;
    attributeText?: string;
  };
}

/**
 * 业务逻辑：定义获取当前标签页 URL 指令，用于读取当前页面的 URL，用于数据提取和页面状态验证
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'get_url'，params 包含 usage 字段
 *
 * 注意事项：usage 标识 URL 的用途（variable 用于变量赋值、data 用于数据返回、none 仅获取），默认值为 "data"
 *
 * 相关代码：src/instructions/GetUrlInstruction.ts - GetUrlInstructionClass 类（执行此指令）
 */
export interface GetUrlInstruction extends BaseInstruction {
  type: 'get_url';
  params: {
    usage?: "variable" | "data" | "none";
  };
}

/**
 * 业务逻辑：定义激活标签页指令，用于将指定标签页切换到前台，使其成为活动标签页
 *
 * 实现方式：继承自 BaseInstruction 接口，固定 type 为 'activate_tab'，params 为空对象（使用指令的 tabId 属性）
 *
 * 注意事项：无需额外参数，直接使用指令的 tabId 字段作为要激活的标签页 ID
 *
 * 相关代码：src/instructions/ActivateTabInstruction.ts - ActivateTabInstructionClass 类（执行此指令）
 */
export interface ActivateTabInstruction extends BaseInstruction {
  type: 'activate_tab';
  params?: {};  // 无需额外参数，使用指令的 tabId 属性
}

/**
 * 业务逻辑：定义所有指令的联合类型，涵盖所有指令类型，用于类型安全的指令处理和指令工厂模式
 *
 * 实现方式：使用 TypeScript 联合类型，包含所有具体指令类型
 *
 * 注意事项：此类型用于类型检查和类型推断，确保指令类型正确，便于指令工厂（InstructionFactory）根据 type 字段创建对应的指令实例
 *
 * 相关代码：src/instructions/InstructionFactory.ts - InstructionFactory 类（使用此类型创建指令），src/managers/InstructionManager.ts - 指令管理器（管理此类型的指令队列）
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
  | ExecuteScriptInstruction
  | WaitInstruction
  | GetUrlInstruction
  | ActivateTabInstruction;