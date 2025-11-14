// 节点配置
export interface NodeProfile {
  node_id: string;
  node_name: string;
  node_token: string;
  node_type: string;
}

// 指令接口
export interface Instruction {
  tabId: number;      // 标签页ID
  instruction: any;   // 指令文本，json格式
  created_at: number; // 创建时间戳, 超时时间一小时也会删除
}

// 回复類型
export type ReplyType = 'instruction' | 'connections' | 'expire' | 'notify';

// 回复接口
export interface Reply {
  node_id: string; // 节点ID
  node_name: string; // 节点名称
  node_type: string; // 节点类型
  tabId: number;  // 标签页ID
  type: ReplyType; // 类型
  data: any; // 数据
  created_at: number; // 创建时间
}

// 存储已连接的 content script 信息
interface ConnectedContentScript {
  tabId: number;
  tabIndex: number;
  connectedAt: number;
  lastPingAt: number;
  url?: string;
}

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });

  // default index
  let DEFAULT_INDEX: number = 0;
  // default url
  let DEFAULT_URL: string = 'https://www.facebook.com';

  // 存储host
  let CONN_HOST: string = 'http://127.0.0.1:5000';
  // 存储auth token路径
  let CRAWLER_AUTH_PATH: string = '/api/auth/login/crawler';
  // 存储指令列表路径
  let CRAWLER_INSTRUCTION_PATH: string = '/api/instruction/list';
  // 存储指令回复路径
  let CRAWLER_INSTRUCTION_REPLY_PATH: string = '/api/instruction/reply';

  // ==================== 节点配置管理器 ====================

  // 存储 JWT token
  let authToken: string | null = null;

  // 存储节点配置信息
  let nodeProfile: NodeProfile = {
    node_id: '',
    node_name: '',
    node_token: '',
    node_type: ''
  };

  // 生成UUID的函数
  function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // 获取节点配置信息
  async function GetNodeProfile(): Promise<NodeProfile> {
    if (nodeProfile.node_id === '') {
      let node_id = await browser.storage.local.get(['node_id']);

      if (node_id) {
        nodeProfile.node_id = node_id.node_id;
      } else {
        nodeProfile.node_id = generateUUID();
        await browser.storage.local.set({ node_id: nodeProfile.node_id });
      }
    }

    if (nodeProfile.node_name === '') {
      let node_name = await browser.storage.local.get(['node_name']);

      if (node_name) {
        nodeProfile.node_name = node_name.node_name;
      } else {
        nodeProfile.node_name = 'node';
        await browser.storage.local.set({ node_name: nodeProfile.node_name });
      }
    }

    if (nodeProfile.node_token === '') {
      let node_token = await browser.storage.local.get(['node_token']);

      if (node_token) {
        nodeProfile.node_token = node_token.node_token;
      } else {
        nodeProfile.node_token = 'rjxu1QtB8z_N-WmeIHFEvmTAMmCyyseStW-_UPrMzgk';
        await browser.storage.local.set({ node_token: nodeProfile.node_token });
      }
    }

    if (nodeProfile.node_type === '') {
      let node_type = await browser.storage.local.get(['node_type']);

      if (node_type) {
        nodeProfile.node_type = node_type.node_type;
      } else {
        nodeProfile.node_type = 'crawler';
        await browser.storage.local.set({ node_type: nodeProfile.node_type });
      }
    }

    return nodeProfile;
  }

  // 更新节点配置信息
  async function updateNodeProfile(data: { node_name?: string; node_token?: string }): Promise<void> {
    const updates: any = {};

    if (data.node_name !== undefined) {
      updates.node_name = data.node_name;
    }

    if (data.node_token !== undefined) {
      updates.node_token = data.node_token;
    }

    if (Object.keys(updates).length > 0) {
      await browser.storage.local.set(updates);

      nodeProfile.node_name = updates.node_name ?? nodeProfile.node_name;
      nodeProfile.node_token = updates.node_token ?? nodeProfile.node_token;
    }

    console.log('节点配置已更新:', updates);
  }
 
  // ==================== 指令管理器 ====================

  // 使用内存 Map 存储指令列表（按标签页ID分组）
  const instructionsMap = new Map<number, Instruction[]>();

  // 添加指令到指定标签页ID的队列
  function addInstructions(newInstructions: Instruction[]): number {
    const now = Date.now();

    // 按 tabId 分组指令
    const instructionsByTabId: { [key: number]: Instruction[] } = {};
    let addedCount = 0; // 实际添加的指令数量

    for (const instruction of newInstructions) {

      // 指令必须包含 tabId
      if (!instruction.tabId) {
        console.warn(`指令缺少 tabId，跳过该指令`);
        continue;
      }

      const tabId = instruction.tabId;
      
      if (!instructionsByTabId[tabId]) {
        instructionsByTabId[tabId] = [];
      }

      instructionsByTabId[tabId].push({ ...instruction, created_at: now }); // 添加到队列末尾（先进先出）
      addedCount++;
    }

    // 为每个tabId的指令队列添加新指令
    for (const [tabIdStr, instructions] of Object.entries(instructionsByTabId)) {
      const tabId = parseInt(tabIdStr);
      const existingInstructions = instructionsMap.get(tabId) || [];
      existingInstructions.push(...instructions); // 添加到队列末尾（先进先出）
      instructionsMap.set(tabId, existingInstructions);
      console.log(`添加 ${instructions.length} 个指令到标签页 ${tabId} 队列，总数: ${existingInstructions.length} 个`);
    }

    console.log(`添加新指令完成，总数: ${newInstructions.length} 个，实际添加: ${addedCount} 个`);
    return addedCount; // 返回实际添加的指令数量
  }

  // 獲取指令的總數量
  function getInstructionsTotalCount(): number {
    return instructionsMap.size;
  }

  // 获取指定标签页ID的第一个指令并删除（先进先出）
  function getFirstInstructionByTabIdAndDelete(tabId: number): Instruction | null {
    const instructions = instructionsMap.get(tabId) || [];

    if (instructions.length === 0) {
      console.log(`标签页 ${tabId} 没有待执行指令`);
      return null;
    }

    const firstInstruction = instructions.shift(); // 获取第一个指令（先进先出）
    instructionsMap.set(tabId, instructions); // 保存更新后的指令列表

    console.log(`获取标签页 ${tabId} 的第一个指令，剩余: ${instructions.length} 个`);
    return firstInstruction || null;
  }

  // 获取指定标签页ID的所有指令并删除
  function getInstructionsByTabIdAndDelete(tabId: number): Instruction[] {
    const instructions = instructionsMap.get(tabId) || [];

    if (instructions.length > 0) {
      instructionsMap.set(tabId, []); // 清空队列
    }

    console.log(`获取标签页 ${tabId} 的所有指令，数量: ${instructions.length} 个，已清空队列`);
    return instructions;
  }

  // 获取指定标签页ID的指令数量
  function getInstructionsCountByTabId(tabId: number): number {
    const instructions = instructionsMap.get(tabId) || [];
    console.log(`标签页 ${tabId} 的指令数量: ${instructions.length} 个`);
    return instructions.length;
  }

  // 获取所有标签页的指令统计信息
  function getAllInstructionsStats(): { [key: number]: number } {
    const stats: { [key: number]: number } = {};

    // 遍历所有tabId，获取每个tabId的指令数量
    for (const [tabId, instructions] of instructionsMap.entries()) {
      stats[tabId] = instructions.length;
    }

    console.log('所有标签页指令统计:', stats);
    return stats;
  }

  // 清空指定标签页ID的指令队列
  function clearInstructionsByTabId(tabId: number): boolean {
    instructionsMap.set(tabId, []);
    console.log(`清空标签页 ${tabId} 的指令队列`);
    return true;
  }

  // 删除创建时间超过指定时间的指令
  function deleteInstructionsByCreatedAt(elapsedTime: number = 1000 * 60 * 60 * 1): number {
    let totalDeleted = 0; // 删除指令总数
    const now = Date.now();

    // 遍历所有tabId
    for (const [tabId, allInstructions] of instructionsMap.entries()) {
      const remainingInstructions = allInstructions.filter(instruction => now - instruction.created_at < elapsedTime); // 剩余指令
      const deletedCount = allInstructions.length - remainingInstructions.length; // 删除指令数量

      if (deletedCount > 0) {
        totalDeleted += deletedCount; // 累加删除指令数量
        instructionsMap.set(tabId, remainingInstructions); // 保存剩余指令
        console.log(`标签页 ${tabId} 删除过期指令 ${deletedCount} 个，剩余 ${remainingInstructions.length} 个`);
      }
    }

    if (totalDeleted > 0) {
      console.log(`总共删除过期指令: ${totalDeleted} 个`);
    }

    return totalDeleted; // 返回总共删除过期指令数量
  }

  // ==================== 連接管理器 ====================

  const connectedContentScripts = new Map<number, ConnectedContentScript>();

  // 记录 content script 连接信息
  async function recordContentScriptConnection(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId); // 获取标签页信息
    const now = Date.now();

    const connectionInfo: ConnectedContentScript = {
      tabId: tabId,
      tabIndex: tab.index,
      connectedAt: connectedContentScripts.has(tabId)
        ? connectedContentScripts.get(tabId)!.connectedAt
        : now,
      lastPingAt: now,
      url: tab.url
    };

    connectedContentScripts.set(tabId, connectionInfo); // 记录 content script 连接信息
    console.log(`记录 content script 连接: 标签页 ${tabId} (index: ${tab.index})`);
  }

  // 移除 content script 连接信息
  function removeContentScriptConnection(tabId: number): void {
    if (connectedContentScripts.has(tabId)) {
      connectedContentScripts.delete(tabId);
      console.log(`移除 content script 连接记录: 标签页 ${tabId}`);
    }
  }

  // 獲取所有已連接的 content script 的 tabId
  function getAllConnectedContentScriptTabIds(): number[] {
    return Array.from(connectedContentScripts.keys());
  }

  // 獲取所有已連接的 content script 的 tabId, index, url
  function getAllConnectedContentScriptTabIdsAndIndexAndUrl(): { tabId: number, index: number, url: string }[] {
    return Array.from(connectedContentScripts.values()).map(connInfo => ({ tabId: connInfo.tabId, index: connInfo.tabIndex, url: connInfo.url ?? '' }));
  }

  // 检查指定标签页是否已连接
  function isContentScriptConnected(tabId: number): boolean {
    return connectedContentScripts.has(tabId);
  }

  // 获取所有已连接的 content script 信息
  function getConnectedContentScripts(): ConnectedContentScript[] {
    return Array.from(connectedContentScripts.values());
  }

  // 根據tabid獲取對象
  function getConnectedContentScriptByTabId(tabId: number): ConnectedContentScript | undefined {
    return connectedContentScripts.get(tabId);
  }

  // 根據tabid獲取url
  function getUrlByTabId(tabId: number): string | undefined {
    return getConnectedContentScriptByTabId(tabId)?.url ?? undefined;
  }

  // 根據tabid獲取index
  function getIndexByTabId(tabId: number): number | undefined {
    return getConnectedContentScriptByTabId(tabId)?.tabIndex ?? undefined;
  }

  // 根据 index 获取对应的 tabId
  function getTabIdByIndex(index: number): number | null {
    return Array.from(connectedContentScripts.values()).find(connInfo => connInfo.tabIndex === index)?.tabId ?? null;
  }

  // ==================== 任务管理器 ====================

  // 检查新标签页个数, 如果不够, 创建新标签页
  async function newTabIfNeeded(index: number, url: string): Promise<void> {
    // 獲取所有標籤頁
    const allTabs = await browser.tabs.query({ windowType: 'normal' });

    for (let i = allTabs.length; i < index + 1; i++) {
      await browser.tabs.create({ url: url }); // 创建新标签页
      console.log(`创建新标签页 ${i} 完成`); // 打印创建新标签页完成
    }
  }

  // 判斷是否存在打開的標籤頁, 如果不存在，則打開默認URL
  async function checkAndNewTabIfNeeded(index: number, url: string): Promise<void> {
    if (getConnectedContentScripts().length === 0) {
      await newTabIfNeeded(index, url);
    }
  }

  // 测试 content script 连接
  async function testContentScriptConnection(tabId: number): Promise<boolean> {
    try {
      const response = await browser.tabs.sendMessage(tabId, { action: 'ping' });
      const isConnected = response && response.success !== false;

      if (isConnected) {
        await recordContentScriptConnection(tabId); // 如果连接成功，记录连接信息
      } else {
        removeContentScriptConnection(tabId); // 如果连接失败，移除记录
      }

      return isConnected;
    } catch (error: any) {
      if (error.message && error.message.includes('Receiving end does not exist')) {
        removeContentScriptConnection(tabId); // 连接不存在，移除记录
        console.log(`标签页 ${tabId} content script 连接不存在，移除记录`); // 打印标签页 content script 连接不存在，移除记录
        return false;
      }

      console.error(`标签页 ${tabId} 测试 content script 连接失败:`, error); // 打印标签页 content script 连接失败
      throw error;
    }
  }

  // 向已连接的 content script 发送通知（不测试连接，直接发送）
  async function sendNotifyToConnected(tabId: number, maxRetries: number = 1): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`向已连接的标签页 ${tabId} 发送通知 (第 ${attempt}/${maxRetries} 次)`);

        const response = await browser.tabs.sendMessage(tabId, { action: 'notify' }); // 直接发送通知消息（已连接的标签页不需要测试连接）

        if (response && response.success === false) {
          console.error(`标签页 ${tabId} 处理通知失败:`, response.error);
          removeContentScriptConnection(tabId); // 移除连接记录
          return false;
        }

        console.log(`标签页 ${tabId} 通知发送成功`);
        return true;
      } catch (error: any) {
        console.error(`标签页 ${tabId} 发送通知失败 (第 ${attempt}/${maxRetries} 次):`, error);

        if (error.message && error.message.includes('Receiving end does not exist')) {
          removeContentScriptConnection(tabId); // 移除连接记录
          return false;
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 等待后重试
        } else {
          console.error(`标签页 ${tabId} 发送通知失败，已达最大重试次数`);
          removeContentScriptConnection(tabId); // 移除连接记录
          throw new Error(`标签页 ${tabId} 发送通知失败，已达最大重试次数，移除连接记录`); // 打印标签页发送通知失败，已达最大重试次数，移除连接记录
        }
      }
    }

    return false;
  }

  // 执行 service worker 任务
  async function executeTask(task: any): Promise<void> {
    console.log('开始执行任务:', task.type, '，数据:', JSON.stringify(task.data));

    const startTime = Date.now();

    switch (task.type) {
      case 'newTab':
        await newTabIfNeeded(task.data.index, task.data.url); // 创建新标签页
        break;
      case 'execute':
        console.log('执行 javascript 代码，不执行');
        break;
      case 'clear':
        {
          // task.data 必须包含 tabId
          const tabId = task.data.tabId;
          if (tabId) {
            clearInstructionsByTabId(tabId); // 清空指定标签页ID的指令队列
          } else {
            console.warn(`任务缺少 tabId，跳过清空操作`);
          }
        }
        break;
      case 'expire':
        {
          deleteInstructionsByCreatedAt(task.data.elapsedTime); // 删除过期指令
        }
        break;
      case 'connections':
        {
          replyResultToServer(CRAWLER_INSTRUCTION_REPLY_PATH, -1, 'connections', { connections: getConnectedContentScripts() });
        }
        break;
      default:
        console.log('未知的任务类型:', task.type, '，不执行'); // 打印未知的任务类型，不执行
        break;
    }

    console.log('任务执行完成:', task.type, '，数据:', JSON.stringify(task.data), '，耗时:', Date.now() - startTime, '毫秒');
  }

  // 定时任务主函数 - 获取任务列表，指令列表
  async function TaskPeriodicAlarm() {
    console.log('定时任务开始执行');

    try {
      // 第一步：检查登录状态，如果未登录则登录
      if (await login() === false) {
        console.error('登录失败，跳过本次任务执行');
        return;
      }

      // 第二步：查看是否有待执行的指令
      let pendingInstructionsCount: number = check();

      if (pendingInstructionsCount > 0) {
        // 通知 content script 处理待执行指令
        if (await notify() === false) {
          console.error('通知 content script 处理待执行指令失败');
        }
        return;
      }

      if (pendingInstructionsCount === 0) {
        // 获取任务列表，指令列表
        pendingInstructionsCount = await task();
        // 执行 service worker 任务
        await execute();
      }

      if (getInstructionsTotalCount() > 0) {
        // 通知 content script 处理待执行指令
        if (await notify() === false) {
          console.error('通知 content script 处理待执行指令失败');
          return;
        }
      }

      console.log('定时任务执行完成');
    } catch (error) {
      console.error('定时任务执行出错:', error);
    }
  }

  // 第一步: 判斷是否存在待执行的指令
  function check(): number {
    console.log('检查是否还有待执行的指令...');

    // 获取所有标签页的指令统计信息
    const stats = getAllInstructionsStats();

    // 计算所有标签页的指令总数
    let totalCount = 0;
    for (const count of Object.values(stats)) {
      totalCount += count;
    }

    if (totalCount > 0) {
      console.log(`发现 ${totalCount} 个待执行的指令，分布在 ${Object.keys(stats).length} 个标签页`);
    } else {
      console.log('没有待执行的指令');
    }

    return totalCount;
  }

  // 第二步：登录函数
  async function login(): Promise<boolean> {
    console.log('开始登录...');

    if (authToken) {
      console.log('已登录，跳过本次登录操作');
      return true;
    }

    // 获取节点配置信息
    const profile = await GetNodeProfile();

    const response = await fetch(CONN_HOST + CRAWLER_AUTH_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        node_id: profile.node_id,
        node_name: profile.node_name,
        node_token: profile.node_token,
        node_type: profile.node_type
      })
    });

    if (!response.ok) {
      throw new Error(`登录失败: ${response.status}`);
    }

    const responseData = await response.json();
    authToken = responseData.data.token;

    console.log('登录成功，获得token:', responseData.data);
    return true;
  }

  // 第三步：获取指令列表
  async function task(): Promise<number> {
    console.log('获取任务列表，指令列表...');

    const profile = await GetNodeProfile();

    const data = getAllConnectedContentScriptTabIdsAndIndexAndUrl();

    const response = await fetch(CONN_HOST + CRAWLER_INSTRUCTION_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (authToken || ''),
      },
      body: JSON.stringify({
        node_id: profile.node_id,
        tabs: data
      }),
    });

    if (!response.ok) {
      authToken = null;
      throw new Error(`获取任务列表，指令列表失败: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    console.log('任务列表，指令列表获取成功!', responseData);

    // 添加指令
    return addInstructions(responseData.data.instructions); // 返回添加的指令数量
  }

  // 第三步: 通知 content script 获取消息
  async function notify(): Promise<boolean> {
    console.log('开始通知 content script...');

    const results: { tabId: number; success: boolean; error?: string }[] = [];

    const instructionsStats = getAllInstructionsStats();  // 获取所有标签页的指令统计信息

    const tabIdsWithInstructions = Object.keys(instructionsStats).map(tabId => parseInt(tabId)).filter(tabId => instructionsStats[tabId] > 0); // 找出有待执行指令的标签页ID（指令数量 > 0）

    if (tabIdsWithInstructions.length === 0) {
      console.log('没有待执行的指令，无需通知 content script');
      return true;
    }

    console.log(`有待执行指令的标签页ID: ${tabIdsWithInstructions.join(', ')}`);

    const connectedScripts = getConnectedContentScripts();  // 获取所有已连接的 content script 信息
    console.log(`已连接的 content script 列表:`, connectedScripts.map(cs => `标签页 ${cs.tabId} (index: ${cs.tabIndex})`).join(', '));

    const tabIdToConnection = new Map<number, typeof connectedScripts[0]>();  // 创建tabId到连接信息的映射

    for (const connInfo of connectedScripts) {
      tabIdToConnection.set(connInfo.tabId, connInfo);
    }

    if (tabIdToConnection.size === 0) {
      console.log('没有已连接的 content script，无需通知');
      return true;
    }

    // 只通知有待执行指令的标签页
    for (const tabId of tabIdsWithInstructions) {

      if(tabId === -1){
        continue;
      }

      const connInfo = tabIdToConnection.get(tabId);

      if (!connInfo) {
        console.warn(`标签页ID ${tabId} 有待执行指令，但未找到已连接的 content script`);
        results.push({ tabId, success: false, error: '未找到已连接的 content script' });
        continue;
      }

      try {
        // 验证标签页是否仍然存在
        let tab: Browser.tabs.Tab;

        try {
          tab = await browser.tabs.get(tabId);
        } catch (error) {
          console.warn(`标签页 ${tabId} 不存在，移除连接记录`);
          removeContentScriptConnection(tabId);
          results.push({ tabId, success: false, error: '标签页不存在' });
          continue;
        }

        // 检查标签页状态
        if (tab.status !== 'complete') {
          console.warn(`标签页 ${tabId} 状态: ${tab.status}, 等待加载完成...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 直接向已连接的标签页发送通知（无需测试连接）
        const success = await sendNotifyToConnected(tabId, 3);
        results.push({ tabId, success: success, error: success ? undefined : '发送通知失败' });
        console.log(`标签页 ${tabId} 通知结果:`, results.find(r => r.tabId === tabId));
      } catch (error: any) {
        console.error(`处理已连接标签页 ${tabId} 时出错:`, error);
        results.push({ tabId, success: false, error: error.message || '处理标签页时发生未知错误' });
      }
    }

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`通知完成: 成功 ${successCount} 个, 失败 ${failureCount} 个`);
    console.log(`详细结果:`, results);

    if (failureCount > 0) {
      await replyResultToServer(CRAWLER_INSTRUCTION_REPLY_PATH, -1, 'notify', { success: false, error: 'content script 通知失败', results: results });
    }

    return successCount > 0;
  }

  // 第四步: 執行服務器下發的指令
  async function execute(): Promise<void> {
    console.log('开始执行服务器下发的指令...');

    const profile = await GetNodeProfile();

    // 获取所有服务器下发的指令, tabId 為 -1 的指令
    const instructions = getInstructionsByTabIdAndDelete(-1);

    for (const instruction of instructions) {
      await executeTask(instruction);
    }
  }

  // 回复结果到服务器
  async function replyResultToServer(api: string, tabId: number, type: ReplyType, data: any): Promise<boolean> {
    try {
      console.log('开始回复结果到服务器...', api, tabId, type, data);
      return true;

      const profile = await GetNodeProfile();

      const reply: Reply = {
        node_id: profile.node_id,
        node_name: profile.node_name,
        node_type: profile.node_type,
        tabId: tabId,
        type: type,
        data: data,
        created_at: Date.now()
      }

      const response = await fetch(CONN_HOST + api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (authToken || ''),
        },
        body: JSON.stringify(reply),
      });

      if (!response.ok) {
        throw new Error(`回复结果到服务器失败: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      return responseData.success !== false;
    } catch (error) {
      authToken = null;
      console.error('回复结果到服务器失败! 错误:', error);
      return false;
    }
  }

  // 监听扩展安装完成
  browser.runtime.onInstalled.addListener(() => {
    console.log('扩展安装完成');

    // 判斷是否已經有打開的標籤頁
    checkAndNewTabIfNeeded(DEFAULT_INDEX, DEFAULT_URL).catch(error => {
      console.error('判斷是否已經有打開的標籤頁失败:', error);
    });

    // 创建定时器
    // browser.alarms.create('TaskPeriodicAlarm', { periodInMinutes: 10, delayInMinutes: 1 });
    // console.log('定时器创建完成'); // 打印定时器创建完成
  });

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {

    try {
      console.log('收到消息:', request.action, request.data);
      const sender_tabId = sender.tab?.id ?? -1;

      switch (request.action) {
        case 'contentScriptReady':
          {
            // 先立即响应，保持消息通道开放
            console.log(`收到内容脚本就绪消息，标签页 ${sender_tabId}`);
            sendResponse({ success: true, message: '连接已记录' });
            break;
          }
        case 'instructionReply':
          {
            console.log('指令返回结果开始...');
            replyResultToServer(CRAWLER_INSTRUCTION_REPLY_PATH, sender_tabId, 'instruction', request.data).then((success: boolean) => {
              sendResponse({ success: success, message: success ? '指令返回结果完成' : '指令返回结果失败' });
            }).catch((error: any) => {
              sendResponse({ success: false, error: error.message || '指令返回结果失败', message: '指令返回结果失败' });
            }); 
            break;
          }
        case 'getNodeProfile':
          {
            console.log('获取节点配置信息开始...');
            GetNodeProfile().then((profile: NodeProfile) => {
              sendResponse({ success: true, data: profile, message: '节点配置信息获取完成' });
            }).catch((error: any) => {
              sendResponse({ success: false, error: error.message || '节点配置信息获取失败', message: '节点配置信息获取失败' });
            });
            break;
          }
        case 'updateNodeProfile':
          {
            console.log('节点配置更新开始...');
            updateNodeProfile(request.data).then(() => {
              sendResponse({ success: true, message: '节点配置更新完成' });
            }).catch((error: any) => {
              sendResponse({ success: false, error: error.message || '节点配置更新失败', message: '节点配置更新失败' });
            });
            break;
          }
        case 'getInstructions':
          {
            console.log('获取指令列表开始...');
            const instructions = getInstructionsByTabIdAndDelete(sender_tabId);
            sendResponse({ success: true, data: instructions, message: '指令列表获取完成' });
            break;
          }
        case 'getSingleInstruction':
          {
            console.log('获取第一个指令开始...');
            const instruction = getFirstInstructionByTabIdAndDelete(sender_tabId);
            sendResponse({ success: true, data: instruction, message: '第一个指令获取完成' });
            break;
          }
        case 'getInstructionsCount':
          {
            console.log('获取指令数量开始...');
            const count = getInstructionsCountByTabId(sender_tabId);
            sendResponse({ success: true, data: { count: count }, message: '指令数量获取完成' });
            break;
          }
        case 'getAllInstructionsStats':
          {
            console.log('获取指令统计开始...');
            const stats = getAllInstructionsStats();
            sendResponse({ success: true, data: stats, message: '指令统计获取完成' });
            break;
          }
        case 'clearInstructions':
          {
            console.log('清空指令队列开始...');
            const success = clearInstructionsByTabId(sender_tabId);
            sendResponse({ success: success, message: success ? '指令队列已清空' : '清空失败' });
            break;
          }
        case 'getConnectedContentScripts':
          {
            console.log('获取所有已连接的 content script 信息开始...');
            const connectedScripts = getConnectedContentScripts();
            sendResponse({ success: true, data: connectedScripts, message: '所有已连接的 content script 信息获取完成' });
            break;
          }
        default:
          console.log('未知消息:', request.action);
          sendResponse({ success: false, error: `未知消息: ${request.action}`, message: `未知消息: ${request.action}` });
          break;
      }

      if (sender_tabId > 0 && sender.tab) {
        recordContentScriptConnection(sender_tabId).catch(error => {
          console.error('记录连接失败:', error);
        });
      }

      console.log('消息处理完成:', request.action);

    } catch (error: any) {
      console.error('处理消息时发生错误:', error);
      sendResponse({ success: false, error: error.message || '处理消息时发生未知错误', message: `处理消息时发生未知错误: ${error.message}` });
    }

    return true; // 保持消息通道开放
  });

  // 监听标签页更新事件，清理已关闭标签页的连接记录
  browser.tabs.onRemoved.addListener((tabId: number) => {
    removeContentScriptConnection(tabId);
  });

  // 监听标签页更新事件（URL变化、刷新等），可能需要重新验证连接
  browser.tabs.onUpdated.addListener((tabId: number, changeInfo: any) => {
    // 如果URL发生变化或页面重新加载，移除旧的连接记录
    if (changeInfo.url || changeInfo.status === 'loading') {
      // 延迟一下再移除，因为可能很快会重新连接
      setTimeout(() => {
        // 如果页面加载完成但连接不存在，则移除记录
        if (connectedContentScripts.has(tabId)) {
          testContentScriptConnection(tabId).catch(() => {
            // 连接失败已经在testContentScriptConnection中处理
          });
        }
      }, 5000);
    }
  });

  // 监听定时器触发
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'TaskPeriodicAlarm') {
      TaskPeriodicAlarm().catch(error => {
        console.error('定时任务执行失败:', error);
      });
    }
  });
});