import type { TabInfo } from '../types';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 标签页管理器
 * 用于管理已连接的标签页对象
 */
export class TabManager {
  private tabs: Map<number, TabInfo> = new Map();

  /**
 * 记录激活的标签页
 */
  public RecordActivatedTab(tabId: number, index: number, url: string): void {
    const tabInfo: TabInfo | undefined = this.tabs.get(tabId);
    const now = Date.now();

    const newTabInfo: TabInfo = {
      tabId,
      tabIndex: index,
      connectAt: tabInfo?.connectAt ?? now,
      lastPingAt: now,
      url
    };

    this.tabs.set(tabId, newTabInfo);
    OutputLogToFile(`标签页已记录: ${JSON.stringify(newTabInfo)}`, { level: LogLevel.INFO });
  }

  /**
   * 移除激活的标签页
   */
  public RemoveActivatedTab(tabId: number): void {
    this.tabs.delete(tabId);
  }

  /**
   * 获取所有标签页
   */
  public GetAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values());
  }

  /**
   * 获取所有标签页ID
   */
  public GetAllTabIds(): number[] {
    return Array.from(this.tabs.keys());
  }

  /**
   * 获取所有标签页的ID、索引和URL
   */
  public GetAllTabIdsAndIndexAndUrl(): Array<{ tabId: number; tabIndex: number; url: string }> {
    return Array.from(this.tabs.values()).map(tab => ({
      tabId: tab.tabId,
      tabIndex: tab.tabIndex,
      url: tab.url
    }));
  }

  /**
   * 检查标签页是否已激活
   */
  public IsActivated(tabId: number): boolean {
    return this.tabs.has(tabId);
  }

  /**
   * 根据标签页ID获取标签页信息
   */
  public GetTabInfoByTabId(tabId: number): TabInfo | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * 根据标签页ID获取索引
   */
  public GetIndexByTabId(tabId: number): number | undefined {
    return this.GetTabInfoByTabId(tabId)?.tabIndex;
  }

  /**
   * 根据标签页ID获取URL
   */
  public GetUrlByTabId(tabId: number): string | undefined {
    return this.GetTabInfoByTabId(tabId)?.url;
  }

  /**
   * 根据索引获取标签页ID
   */
  public GetTabIdByTabIndex(tabIndex: number): number | undefined {
    for (const tab of this.tabs.values()) {
      if (tab.tabIndex === tabIndex) {
        return tab.tabId;
      }
    }
    return undefined;
  }
}

/**
 * 导出全局标签页管理器
 */
export let tabManager: TabManager = new TabManager();