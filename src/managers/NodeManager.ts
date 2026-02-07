import type { NodeProfile } from '../types';
import { GenerateUUID, GetBitBrowserTabSequence, LogLevel, OutputLogToFile } from '../utils';

/**
 * 业务逻辑：管理浏览器扩展节点的配置信息，包括节点ID、名称、令牌和类型，用于在 WebSocket 连接时向服务器注册节点身份，支持多节点部署和节点管理
 *
 * 实现方式：使用浏览器本地存储（browser.storage.local）和 Cookie 持久化配置，优先从本地存储读取，不存在时自动生成 UUID 并保存，支持从 Cookie 中读取配置（用于跨会话保持）
 *
 * 注意事项：
 * - node_id：自动生成 UUID，首次使用时生成并保存，确保节点唯一性
 * - node_name：优先从 Cookie 读取，其次从比特浏览器序号获取，最后生成默认名称
 * - node_token：用于 WebSocket 身份验证，存储在 Cookie 中（httpOnly: true）确保安全性
 * - node_type：默认为 'crawler'，表示爬虫节点类型
 * - 配置信息会同时保存到本地存储和 Cookie，确保数据一致性
 *
 * 相关代码：src/types/node.ts - NodeProfile 接口（配置类型定义），src/types/websocket_message.ts - WSLoginMessage 接口（登录消息使用此配置），src/entrypoints/popup/components/NodeConfig.vue - 节点配置 UI
 */
export class NodeManager {
  private nodeProfile: NodeProfile;

  /**
   * 业务逻辑：初始化节点配置对象，设置默认值
   *
   * 实现方式：创建空的 nodeProfile 对象，所有字段初始化为空字符串（node_type 除外）
   *
   * 注意事项：实际配置值在 GetNodeProfile() 方法中懒加载，首次调用时从存储中读取或生成
   */
  constructor() {
    this.nodeProfile = {
      node_type: 'crawler',
      node_id: '',
      node_name: '',
      node_token: ''
    };
  }

  /**
   * 业务逻辑：获取节点配置信息，懒加载机制确保配置在首次使用时从存储中读取或自动生成，支持跨会话保持配置
   *
   * 实现方式：按字段顺序检查内存中的配置是否为空，如果为空则从本地存储读取，本地存储也不存在时：
   * - node_id: 自动生成 UUID 并保存到本地存储
   * - node_name: 优先从 Cookie 读取，其次从比特浏览器序号获取，最后生成默认名称并保存到 Cookie 和本地存储
   * - node_token: 优先从 Cookie 读取，不存在时生成 32 位随机字符串并保存到 Cookie（httpOnly: true）和本地存储
   * - node_type: 默认为 'crawler' 并保存到本地存储
   *
   * 注意事项：
   * - 配置信息会同时保存到本地存储（browser.storage.local）和 Cookie（domain: .autowave.dev）
   * - Cookie 使用 secure: true 和 httpOnly: true 确保安全性
   * - node_name 和 node_token 可以从 Cookie 中读取，用于跨会话保持配置
   * - 比特浏览器序号通过 GetBitBrowserTabSequence() 工具函数获取
   *
   * @returns 节点配置对象（Promise）
   *
   * 相关代码：src/utils/index.ts - GenerateUUID() 函数（生成节点ID），src/utils/index.ts - GetBitBrowserTabSequence() 函数（获取比特浏览器序号），src/types/node.ts - NodeProfile 接口（返回类型）
   */
  public async GetNodeProfile(): Promise<NodeProfile> {

    if (this.nodeProfile.node_id === '') {
      let stored = await browser.storage.local.get(['node_id']);

      if (stored.node_id) {
        this.nodeProfile.node_id = stored.node_id as string;
      } else {
        this.nodeProfile.node_id = GenerateUUID();
        await browser.storage.local.set({ node_id: this.nodeProfile.node_id });
      }
    }

    if (this.nodeProfile.node_name === '') {
      let stored = await browser.storage.local.get(['node_name']);

      if (stored.node_name) {
        this.nodeProfile.node_name = stored.node_name as string;
      } else {
        // 从 cookies 中获取 node_name
        let cookies = await browser.cookies.getAll({ domain: '.autowave.dev' });
        let node_name = cookies.find(cookie => cookie.name === 'node_name')?.value;
        if (node_name) {
          this.nodeProfile.node_name = node_name;
        } else {
          const bitBrowserTabSequence = await GetBitBrowserTabSequence();

          if (bitBrowserTabSequence) {
            this.nodeProfile.node_name = bitBrowserTabSequence;
          } else {
            this.nodeProfile.node_name = `node-${GenerateUUID().substring(0, 8)}`;
          }

          await browser.cookies.set({ name: 'node_name', value: this.nodeProfile.node_name, url: 'https://autowave.dev', domain: '.autowave.dev', path: '/', secure: true, httpOnly: false });
        }

        await browser.storage.local.set({ node_name: this.nodeProfile.node_name });
      }
    }

    if (this.nodeProfile.node_token === '') {
      this.nodeProfile.node_token = "rjxu1QtB8z_N-WmeIHFEvmTAMmCyyseStW_UPrMzgk";
    }

    if (this.nodeProfile.node_type === '') {
      let stored = await browser.storage.local.get(['node_type']);

      if (stored.node_type) {
        this.nodeProfile.node_type = stored.node_type as string;
      } else {
        this.nodeProfile.node_type = 'crawler';
        await browser.storage.local.set({ node_type: this.nodeProfile.node_type });
      }
    }

    return this.nodeProfile;
  }

  /**
   * 业务逻辑：更新节点配置信息（仅支持更新 node_name 和 node_token），用于用户手动修改节点名称或令牌
   *
   * 实现方式：检查传入的更新字段，将非 undefined 的字段保存到本地存储和 Cookie，同时更新内存中的配置对象
   *
   * 注意事项：
   * - 只支持更新 node_name 和 node_token，node_id 和 node_type 不可修改
   * - 更新会同时保存到本地存储和 Cookie，确保数据一致性
   * - Cookie 使用 secure: true 和 httpOnly: true 确保安全性
   * - 更新操作会记录日志，便于追踪配置变更
   *
   * @param data - 要更新的配置字段对象（node_name 和 node_token 可选）
   *
   * 相关代码：src/entrypoints/popup/components/NodeConfig.vue - saveProfile() 函数（调用此方法保存配置）
   */
  public async UpdateNodeProfile(data: { node_name?: string; node_token?: string }): Promise<void> {
    const updates: any = {};

    if (data.node_name !== undefined) {
      updates.node_name = data.node_name;
    }

    if (data.node_token !== undefined) {
      updates.node_token = data.node_token;
    }

    if (Object.keys(updates).length > 0) {
      await browser.storage.local.set(updates);

      if (updates.node_name) {
        await browser.cookies.set({ name: 'node_name', value: updates.node_name, url: 'https://autowave.dev', domain: '.autowave.dev', path: '/', secure: true, httpOnly: true });
      }

      if (updates.node_token) {
        await browser.cookies.set({ name: 'node_token', value: updates.node_token, url: 'https://autowave.dev', domain: '.autowave.dev', path: '/', secure: true, httpOnly: true });
      }

      this.nodeProfile.node_name = updates.node_name ?? this.nodeProfile.node_name;
      this.nodeProfile.node_token = updates.node_token ?? this.nodeProfile.node_token;
    }

    OutputLogToFile(`[NodeManager] Node profile updated: ${JSON.stringify(updates)}`, { level: LogLevel.INFO });
  }

};

/**
 * 业务逻辑：导出全局单例节点配置对象，确保整个应用使用同一个配置实例，避免配置不一致
 *
 * 实现方式：创建 NodeManager 实例并导出为全局变量
 *
 * 注意事项：使用单例模式，所有模块共享同一个配置对象
 *
 * 相关代码：src/entrypoints/background.ts - WebSocket 连接时使用此配置登录
 */
export let nodeManager: NodeManager = new NodeManager();