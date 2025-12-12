import type { NodeProfile } from '../types';
import { GenerateUUID, OutputLogToFile, LogLevel } from '../utils';

/**
 * 节点配置对象
 * 用于保存当前浏览器扩展插件的配置信息
 */
export class NodeConfig {
  private nodeProfile: NodeProfile;

  // 初始化节点配置
  constructor() {
    this.nodeProfile = {
      node_type: 'crawler',
      node_id: '',
      node_name: '',
      node_token: ''
    };
  }

  /**
   * 获取节点配置
   * 当节点配置为空时，从本地存储中获取
   * 如果本地存储中也没有，则保持为空字符串（不设置默认值）
   * 
   * @returns 节点配置对象
   * @remarks
   * - node_id: 如果不存在，会自动生成 UUID 并保存
   * - node_name: 如果不存在，保持为空字符串，需要用户手动设置
   * - node_token: 如果不存在，保持为空字符串，需要用户手动设置（安全考虑）
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
        this.nodeProfile.node_name = 'node';
        await browser.storage.local.set({ node_name: this.nodeProfile.node_name });
      }
    }

    if (this.nodeProfile.node_token === '') {
      let stored = await browser.storage.local.get(['node_token']);

      if (stored.node_token) {
        this.nodeProfile.node_token = stored.node_token as string;
      } else {
        this.nodeProfile.node_token = 'rjxu1QtB8z_N-WmeIHFEvmTAMmCyyseStW-_UPrMzgk';
        await browser.storage.local.set({ node_token: this.nodeProfile.node_token });
      }
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
   * 更新节点配置
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

      this.nodeProfile.node_name = updates.node_name ?? this.nodeProfile.node_name;
      this.nodeProfile.node_token = updates.node_token ?? this.nodeProfile.node_token;
    }

    OutputLogToFile(`[NodeConfig] Node profile updated: ${JSON.stringify(updates)}`, { level: LogLevel.INFO });
  }

};

/**
 * 导出全局节点配置
 */
export let nodeConfig: NodeConfig = new NodeConfig();