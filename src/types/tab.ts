/**
 * 业务逻辑：定义浏览器标签页的基本信息结构，用于在 UI 中显示标签页列表、选择目标标签页执行指令，以及通过 WebSocket 向服务器发送标签页信息
 *
 * 实现方式：使用 TypeScript 接口定义标签页信息，包含标签页 ID、索引和 URL 三个必需字段，所有字段均为 number 或 string 类型
 *
 * 注意事项：
 * - tabId 为标签页的唯一标识符，由浏览器 API 分配，用于后续的 CDP 操作和指令执行
 * - tabIndex 表示标签页在浏览器窗口中的位置索引（从 0 开始），用于排序和显示
 * - url 为标签页的当前 URL，可能为 'about:blank' 或特殊页面（如 chrome://），需要处理空值情况
 * - 此类型从 browser.tabs.query() 返回的 Tab 对象转换而来，仅保留必要的字段以简化数据结构
 * - 在 popup UI 中，此类型用于下拉列表显示，用户可以选择目标标签页
 *
 * 相关代码：src/entrypoints/background.ts - get_tabs() 函数（获取并转换标签页信息），src/entrypoints/popup/components/InstructionConfig.vue - loadTabs() 函数（选择标签页）
 */
export interface TabInfo {
  tabId: number;
  tabIndex: number;
  url: string;
}

