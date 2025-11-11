// 节点配置
export interface NodeProfile {
  node_id: string;
  node_name: string;
  node_token: string;
  node_type: string;
}

// 指令接口
export interface Instruction {
  index: number;      // 标签页索引，从0开始
  instruction: any;   // 指令文本，json格式
  created_at: number; // 创建时间戳, 超时时间一小时也会删除
}

// 任务接口
export interface Task {
  type: string;
  data: any;
}

// 回复接口
export interface Reply {
  node_id: string;
  node_name: string;
  node_type: string;
  index: number;
  data: any;
  created_at: number;
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
  // 存储任务列表路径
  let CRAWLER_TASK_PATH: string = '/api/instruction/list';
  // 存储指令回复路径
  let CRAWLER_TASK_REPLY_PATH: string = '/api/task/reply';
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
      console.log('节点配置已更新:', updates);
    }
  }

  // ==================== 指令管理器 ====================

  // 使用内存 Map 存储指令列表（按标签页索引分组）
  const instructionsMap = new Map<number, Instruction[]>();

  // 添加指令到指定标签页索引的队列
  function addInstructions(newInstructions: Instruction[]): number {
    const now = Date.now();

    // 按index分组指令
    const instructionsByIndex: { [key: number]: Instruction[] } = {};

    for (const instruction of newInstructions) {
      if (!instructionsByIndex[instruction.index]) {
        instructionsByIndex[instruction.index] = [];
      }
      instructionsByIndex[instruction.index].push({ ...instruction, created_at: now }); // 添加到队列末尾（先进先出）
    }

    // 为每个index的指令队列添加新指令
    for (const [indexStr, instructions] of Object.entries(instructionsByIndex)) {
      const index = parseInt(indexStr);
      const existingInstructions = instructionsMap.get(index) || [];
      existingInstructions.push(...instructions); // 添加到队列末尾（先进先出）
      instructionsMap.set(index, existingInstructions);
      console.log(`添加 ${instructions.length} 个指令到标签页 ${index} 队列，总数: ${existingInstructions.length} 个`);
    }

    console.log(`添加新指令完成，总数: ${newInstructions.length} 个`);
    return newInstructions.length;
  }

  // 获取指定标签页索引的第一个指令并删除（先进先出）
  function getFirstInstructionByIndexAndDelete(index: number): Instruction | null {
    const instructions = instructionsMap.get(index) || [];

    if (instructions.length === 0) {
      console.log(`标签页 ${index} 没有待执行指令`);
      return null;
    }

    const firstInstruction = instructions.shift(); // 获取第一个指令（先进先出）
    instructionsMap.set(index, instructions); // 保存更新后的指令列表

    console.log(`获取标签页 ${index} 的第一个指令，剩余: ${instructions.length} 个`);
    return firstInstruction || null;
  }

  // 获取指定标签页索引的所有指令并删除
  function getInstructionsByIndexAndDelete(index: number): Instruction[] {
    const instructions = instructionsMap.get(index) || [];

    if (instructions.length > 0) {
      instructionsMap.set(index, []); // 清空队列
    }

    console.log(`获取标签页 ${index} 的所有指令，数量: ${instructions.length} 个，已清空队列`);
    return instructions;
  }

  // 获取指定标签页索引的指令数量
  function getInstructionsCountByIndex(index: number): number {
    const instructions = instructionsMap.get(index) || [];
    console.log(`标签页 ${index} 的指令数量: ${instructions.length} 个`);
    return instructions.length;
  }

  // 获取所有标签页的指令统计信息
  function getAllInstructionsStats(): { [key: number]: number } {
    const stats: { [key: number]: number } = {};

    // 遍历所有索引，获取每个索引的指令数量
    for (const [index, instructions] of instructionsMap.entries()) {
      stats[index] = instructions.length;
    }

    console.log('所有标签页指令统计:', stats);
    return stats;
  }

  // 清空指定标签页索引的指令队列
  function clearInstructionsByIndex(index: number): boolean {
    instructionsMap.set(index, []);
    console.log(`清空标签页 ${index} 的指令队列`);
    return true;
  }

  // 删除创建时间超过指定时间的指令
  function deleteInstructionsByCreatedAt(elapsedTime: number = 1000 * 60 * 60 * 1): number {
    let totalDeleted = 0; // 删除指令总数
    const now = Date.now();

    // 遍历所有索引
    for (const [index, allInstructions] of instructionsMap.entries()) {
      const remainingInstructions = allInstructions.filter(instruction => now - instruction.created_at < elapsedTime); // 剩余指令
      const deletedCount = allInstructions.length - remainingInstructions.length; // 删除指令数量

      if (deletedCount > 0) {
        totalDeleted += deletedCount; // 累加删除指令数量
        instructionsMap.set(index, remainingInstructions); // 保存剩余指令
        console.log(`标签页 ${index} 删除过期指令 ${deletedCount} 个，剩余 ${remainingInstructions.length} 个`);
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

  // 获取所有已连接的 content script 信息
  function getConnectedContentScripts(): ConnectedContentScript[] {
    return Array.from(connectedContentScripts.values());
  }

  // 检查指定标签页是否已连接
  function isContentScriptConnected(tabId: number): boolean {
    return connectedContentScripts.has(tabId);
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

  // 执行任务
  async function executeTask(task: Task): Promise<void> {
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
        clearInstructionsByIndex(task.data.index); // 清空指定标签页索引的指令队列
        break;
      case 'expire':
        deleteInstructionsByCreatedAt(task.data.elapsedTime); // 删除过期指令
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
      }

      if (pendingInstructionsCount > 0) {
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

    console.log('登录成功，获得token!' + responseData.data);
    return true;
  }

  // 第三步：获取任务列表, 并执行任务, 并保存指令
  async function task(): Promise<number> {
    console.log('获取任务列表，指令列表...');

    const profile = await GetNodeProfile();

    const url = new URL(CONN_HOST + CRAWLER_TASK_PATH + '?node_id=' + profile.node_id);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (authToken || ''),
      },
    });

    if (!response.ok) {
      authToken = null;
      throw new Error(`获取任务列表，指令列表失败: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    const tasks = responseData.data.tasks;

    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        await executeTask(task);
      }
    }

    const instructions: Instruction[] = responseData.data.instructions;

    if (instructions && instructions.length > 0) {
      addInstructions(instructions);
    }

    console.log('任务列表，指令列表获取成功!', responseData);
    return instructions ? instructions.length : 0;
  }

  // 第三步: 通知 content script 获取消息
  async function notify(): Promise<boolean> {
    console.log('开始通知 content script...');

    const results: { index: number; success: boolean; error?: string }[] = [];

    const instructionsStats = getAllInstructionsStats();  // 获取所有标签页的指令统计信息

    const indexesWithInstructions = Object.keys(instructionsStats).map(index => parseInt(index)).filter(index => instructionsStats[index] > 0); // 找出有待执行指令的标签页索引（指令数量 > 0）

    if (indexesWithInstructions.length === 0) {
      console.log('没有待执行的指令，无需通知 content script');
      return true;
    }

    console.log(`有待执行指令的标签页索引: ${indexesWithInstructions.join(', ')}`);

    const connectedScripts = getConnectedContentScripts();  // 获取所有已连接的 content script 信息
    console.log(`已连接的 content script 列表:`, connectedScripts.map(cs => `标签页 ${cs.tabId} (index: ${cs.tabIndex})`).join(', '));

    const indexToConnection = new Map<number, typeof connectedScripts[0]>();  // 创建索引到连接信息的映射

    for (const connInfo of connectedScripts) {
      indexToConnection.set(connInfo.tabIndex, connInfo);
    }

    if (indexToConnection.size === 0) {
      console.log('没有已连接的 content script，无需通知');
      return true;
    }

    // 只通知有待执行指令的标签页
    for (const index of indexesWithInstructions) {
      const connInfo = indexToConnection.get(index);

      if (!connInfo) {
        console.warn(`标签页索引 ${index} 有待执行指令，但未找到已连接的 content script`);
        results.push({ index, success: false, error: '未找到已连接的 content script' });
        continue;
      }

      try {
        // 验证标签页是否仍然存在
        let tab: Browser.tabs.Tab;

        try {
          tab = await browser.tabs.get(connInfo.tabId);
        } catch (error) {
          console.warn(`标签页 ${connInfo.tabId} 不存在，移除连接记录`);
          removeContentScriptConnection(connInfo.tabId);
          results.push({ index, success: false, error: '标签页不存在' });
          continue;
        }

        // 检查标签页状态
        if (tab.status !== 'complete') {
          console.warn(`标签页 ${connInfo.tabId} 状态: ${tab.status}, 等待加载完成...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 直接向已连接的标签页发送通知（无需测试连接）
        const success = await sendNotifyToConnected(connInfo.tabId, 3);

        if (success) {
          console.log(`标签页 ${connInfo.tabId} (index: ${index}, 指令数: ${instructionsStats[index]}) 通知成功`);
          results.push({ index, success: true });
        } else {
          console.error(`标签页 ${connInfo.tabId} (index: ${index}) 通知失败`);
          results.push({ index, success: false, error: '发送通知失败' });
        }

      } catch (error: any) {
        console.error(`处理已连接标签页 ${connInfo.tabId} (index: ${index}) 时出错:`, error);
        results.push({ index, success: false, error: error.message || '处理标签页时发生未知错误' });
      }
    }

    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`通知完成: 成功 ${successCount} 个, 失败 ${failureCount} 个`);
    console.log(`详细结果:`, results);

    if (failureCount > 0) {
      await replyResultToServer(CRAWLER_INSTRUCTION_REPLY_PATH, -1, { success: false, error: 'content script 连接失败', results: results });
    }

    return successCount > 0;
  }

  // 回复结果到服务器
  async function replyResultToServer(api: string, index: number, data: any): Promise<boolean> {
    try {
      console.log('回复结果到服务器...');
      return true;

      const profile = await GetNodeProfile();

      const reply: Reply = {
        node_id: profile.node_id,
        node_name: profile.node_name,
        node_type: profile.node_type,
        index: index,
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
      return responseData.success;
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
    browser.alarms.create('TaskPeriodicAlarm', { periodInMinutes: 10, delayInMinutes: 1 });
    console.log('定时器创建完成'); // 打印定时器创建完成
  });

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {

    try {
      console.log('收到消息:', request.action, request.data);
      const sender_index = sender.tab?.index ?? -1;
      const sender_tabId = sender.tab?.id;

      switch (request.action) {
        case 'contentScriptReady':
          {
            // 先立即响应，保持消息通道开放
            console.log(`收到内容脚本就绪消息，标签页 ${sender_tabId} (index: ${sender_index})`);
            sendResponse({ success: true, message: '连接已记录' });
            break;
          }
        case 'taskReply':
          {
            console.log('任务返回结果开始...');
            replyResultToServer(CRAWLER_TASK_REPLY_PATH, sender_index, request.data).then((success: boolean) => {
              sendResponse({ success: success, message: success ? '任务返回结果完成' : '任务返回结果失败' });
            }).catch((error: any) => {
              sendResponse({ success: false, error: error.message || '任务返回结果失败', message: '任务返回结果失败' });
            });
            break;
          }
        case 'instructionReply':
          {
            console.log('指令返回结果开始...');
            replyResultToServer(CRAWLER_INSTRUCTION_REPLY_PATH, sender_index, request.data).then((success: boolean) => {
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
            const instructions = getInstructionsByIndexAndDelete(sender_index);
            sendResponse({ success: true, data: instructions, message: '指令列表获取完成' });
            break;
          }
        case 'getSingleInstruction':
          {
            console.log('获取第一个指令开始...');
            const instruction = getFirstInstructionByIndexAndDelete(sender_index);
            sendResponse({ success: true, data: instruction, message: '第一个指令获取完成' });
            break;
          }
        case 'getInstructionsCount':
          {
            console.log('获取指令数量开始...');
            const count = getInstructionsCountByIndex(sender_index);
            sendResponse({ success: true, data: { count }, message: '指令数量获取完成' });
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
            const success = clearInstructionsByIndex(sender_index);
            sendResponse({ success, message: success ? '指令队列已清空' : '清空失败' });
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

      if (sender_tabId && sender.tab) {
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