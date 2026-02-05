/**
 * 业务逻辑：定义浏览器扩展节点的配置信息结构，用于标识和管理扩展实例，在 WebSocket 登录时向服务器注册节点身份，支持多节点部署和节点管理
 *
 * 实现方式：使用 TypeScript 接口定义节点配置，包含四个必需字段（node_type、node_id、node_name、node_token），所有字段均为 string 类型
 *
 * 注意事项：
 * - node_type：节点类型，固定为 'crawler'，表示爬虫节点，用于区分不同类型的节点
 * - node_id：节点唯一标识符，自动生成 UUID 格式，存储在浏览器本地存储中，用于在服务器端唯一标识节点
 * - node_name：节点名称，可由用户自定义或自动生成（如从比特浏览器序号获取），用于在 UI 中显示和识别节点
 * - node_token：节点认证令牌，用于 WebSocket 连接时的身份验证，存储在本地存储和 Cookie 中，确保安全性
 * - 配置信息优先从浏览器本地存储读取，如果不存在则自动生成并保存
 * - node_name 和 node_token 可能从 Cookie 中读取（domain: .autowave.dev），用于跨会话保持配置
 * - 在 WebSocket 登录时，完整的 NodeProfile 会作为登录消息的 data 字段发送给服务器
 *
 * 相关代码：src/managers/NodeManager.ts - GetNodeProfile() 函数（获取和生成节点配置），src/types/websocket.ts - WSLoginMessage 接口（登录消息使用此类型），src/entrypoints/popup/components/NodeConfig.vue - 节点配置 UI（显示和编辑配置）
 */
export interface NodeProfile {
  node_type: string;
  node_id: string;
  node_name: string;
  node_token: string;
}
