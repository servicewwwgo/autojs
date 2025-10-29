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

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });

  // 存储JWT token
  let authToken: string | null = null;
  // 存储节点配置信息
  let nodeProfile: NodeProfile = {
    node_id: '',
    node_name: '',
    node_token: '',
    node_type: ''
  };

  // 存储host
  let host: string = 'http://127.0.0.1:5000';
  // 存储auth token路径
  let crawler_auth_path: string = '/api/auth/login/crawler';
  // 存储任务列表路径
  let crawler_task_path: string = '/api/task/realtime/list';
  // 存储指令回复路径
  let crawler_task_reply_path: string = '/api/task/realtime/reply';
  // 存储指令回复路径
  let crawler_instruction_reply_path: string = '/api/instruction/realtime/reply';

  // 生成UUID的函数
  function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // 获取节点配置信息
  async function GetNodeProfile(): Promise<NodeProfile> {
    try {
      if (nodeProfile.node_id === '') {
        let node_id = await browser.storage.local.get(['node_id']);

        if (node_id) {
          nodeProfile.node_id = node_id.node_id;
        }else{
          nodeProfile.node_id = generateUUID();
          await browser.storage.local.set({ node_id: nodeProfile.node_id });
        }
      }

      if (nodeProfile.node_name === '') {
        let node_name = await browser.storage.local.get(['node_name']);

        if (node_name) {
          nodeProfile.node_name = node_name.node_name;
        }else{
          nodeProfile.node_name = 'node';
          await browser.storage.local.set({ node_name: nodeProfile.node_name });
        }
      }

      if (nodeProfile.node_token === '') {
        let node_token = await browser.storage.local.get(['node_token']);

        if (node_token) {
          nodeProfile.node_token = node_token.node_token;
        }else{
          nodeProfile.node_token = 'fP1QjF8CJlDGe8yscsY5hz7ncPpLkBHQVxczXu67T1E';
          await browser.storage.local.set({ node_token: nodeProfile.node_token });
        }
      }

      if (nodeProfile.node_type === '') {
        let node_type = await browser.storage.local.get(['node_type']);

        if (node_type) {
          nodeProfile.node_type = node_type.node_type;
        }else{
          nodeProfile.node_type = 'crawler';
          await browser.storage.local.set({ node_type: nodeProfile.node_type });
        }
      }

      return nodeProfile;
    } catch (error) {
      console.error('获取节点配置失败:', error);
      throw error;
    }
  }

  // 更新节点配置信息
  async function updateNodeProfile(data: { node_name?: string; node_token?: string }): Promise<void> {
    try {
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
    } catch (error) {
      console.error('更新节点配置失败:', error);
      throw error;
    }
  }

  // ==================== 指令管理器 ====================
  
  // 添加指令到指定标签页索引的队列
  async function addInstructions(newInstructions: Instruction[]): Promise<number> {
    try {
      const now = Date.now();
      
      // 按index分组指令
      const instructionsByIndex: { [key: number]: Instruction[] } = {};
      
      for (const instruction of newInstructions) {
        if (!instructionsByIndex[instruction.index]) {
          instructionsByIndex[instruction.index] = [];
        }
        instructionsByIndex[instruction.index].push({
          ...instruction,
          created_at: now
        });
      }
      
      // 为每个index的指令队列添加新指令
      for (const [index, instructions] of Object.entries(instructionsByIndex)) {
        const storageKey = `instructions_${index}`;
        const result = await browser.storage.local.get([storageKey]);
        const existingInstructions: Instruction[] = result[storageKey] || [];
        
        // 添加到队列末尾（先进先出）
        existingInstructions.push(...instructions);
        
        // 保存到存储
        await browser.storage.local.set({ [storageKey]: existingInstructions });
        
        console.log(`添加 ${instructions.length} 个指令到标签页 ${index} 队列`);
      }
      
      console.log('添加新指令完成，总数:', newInstructions.length);
      return newInstructions.length;
    } catch (error) {
      console.error('添加指令失败:', error);
      return -1;
    }
  }

  // 获取指定标签页索引的第一个指令并删除（先进先出）
  async function getFirstInstructionByIndexAndDelete(index: number): Promise<Instruction | null> {
    try {
      const storageKey = `instructions_${index}`;
      const result = await browser.storage.local.get([storageKey]);
      const instructions: Instruction[] = result[storageKey] || [];
      
      if (instructions.length === 0) {
        console.log(`标签页 ${index} 没有待执行指令`);
        return null;
      }
      
      // 获取第一个指令（先进先出）
      const firstInstruction = instructions.shift();
      
      // 保存更新后的指令列表
      await browser.storage.local.set({ [storageKey]: instructions });
      
      console.log(`获取标签页 ${index} 的第一个指令，剩余: ${instructions.length} 个`);
      return firstInstruction || null;
    } catch (error) {
      
      console.error(`获取标签页 ${index} 指令失败:`, error);
      return null;
    }
  }

  // 获取指定标签页索引的所有指令并删除
  async function getInstructionsByIndexAndDelete(index: number): Promise<Instruction[]> {
    try {
      const storageKey = `instructions_${index}`;
      const result = await browser.storage.local.get([storageKey]);
      const instructions: Instruction[] = result[storageKey] || [];
      
      if (instructions.length > 0) {
        // 清空该标签页的指令队列
        await browser.storage.local.set({ [storageKey]: [] });
        console.log(`获取标签页 ${index} 的所有指令，数量: ${instructions.length} 个，已清空队列`);

      } else {
        console.log(`标签页 ${index} 没有待执行指令`);
      }
      
      return instructions;
    } catch (error) {

      console.error(`获取标签页 ${index} 指令失败:`, error);
      return [];
    }
  }

  // 获取指定标签页索引的指令数量
  async function getInstructionsCountByIndex(index: number): Promise<number> {
    try {
      const storageKey = `instructions_${index}`;
      const result = await browser.storage.local.get([storageKey]);
      const instructions: Instruction[] = result[storageKey] || [];
      
      console.log(`标签页 ${index} 的指令数量: ${instructions.length} 个`);
      return instructions.length;
    } catch (error) {

      console.error(`获取标签页 ${index} 指令数量失败:`, error);
      return -1;
    }
  }

  // 获取所有标签页的指令统计信息
  async function getAllInstructionsStats(): Promise<{ [key: number]: number }> {
    try {
      const result = await browser.storage.local.get();
      const stats: { [key: number]: number } = {};
      
      // 遍历所有存储的键，查找指令相关的键
      for (const [key, value] of Object.entries(result)) {
        if (key.startsWith('instructions_') && Array.isArray(value)) {
          const index = parseInt(key.replace('instructions_', ''));
          stats[index] = value.length;
        }
      }
      
      console.log('所有标签页指令统计:', stats);
      return stats;
    } catch (error) {

      console.error('获取指令统计失败:', error);
      return {};
    }
  }

  // 清空指定标签页索引的指令队列
  async function clearInstructionsByIndex(index: number): Promise<boolean> {
    try {
      const storageKey = `instructions_${index}`;
      await browser.storage.local.set({ [storageKey]: [] });
      console.log(`清空标签页 ${index} 的指令队列`);
      return true;
    } catch (error) {
      console.error(`清空标签页 ${index} 指令队列失败:`, error);
      return false;
    }
  }

  // 删除创建时间超过指定时间的指令
  async function deleteInstructionsByCreatedAt(elapsedTime: number = 1000 * 60 * 60 * 1): Promise<number> {
    try {
      const now = Date.now();
      const result = await browser.storage.local.get();
      let totalDeleted = 0;
      
      // 遍历所有指令存储键
      for (const [key, value] of Object.entries(result)) {
        if (key.startsWith('instructions_') && Array.isArray(value)) {
          const instructions: Instruction[] = value;
          const remainingInstructions = instructions.filter(instruction => 
            now - instruction.created_at < elapsedTime
          );
          
          if (instructions.length > remainingInstructions.length) {
            const deletedCount = instructions.length - remainingInstructions.length;
            totalDeleted += deletedCount;
            
            // 保存剩余指令
            await browser.storage.local.set({ [key]: remainingInstructions });
            
            const index = key.replace('instructions_', '');
            console.log(`标签页 ${index} 删除过期指令: ${deletedCount} 个，剩余: ${remainingInstructions.length} 个`);
          }
        }
      }
      
      if (totalDeleted > 0) {
        console.log(`总共删除过期指令: ${totalDeleted} 个`);
      }
      
      return totalDeleted;
    } catch (error) {
      console.error('删除过期指令失败:', error);
      return -1;
    }
  }

  // 检查新标签页个数, 如果不够, 创建新标签页
  async function newTabIfNeeded(index: number, url: string): Promise<void> {
    try {
      const currentWindowTabs = await browser.tabs.query({ currentWindow: true });
      for(let i = currentWindowTabs.length; i < index + 1; i++) {
        await browser.tabs.create({ url: url });
      }
      console.log('创建新标签页完成:', index, '个');
    } catch (error) {
      console.error('检查新标签页个数失败:', error);
    }
  }

  // 执行任务
  async function executeTask(task: Task): Promise<void> {
    try 
    {
      console.log('开始执行任务:', task.type, '，数据:', JSON.stringify(task.data));

      const startTime = Date.now();
      
      switch(task.type) {
        case 'open':
          // 打开新标签页
          await newTabIfNeeded(task.data.index, task.data.url);
          break;
        case 'execute':
          // 执行 javascript 代码
          // eval(task.data.javascript);
          console.log('执行 javascript 代码:', task.data.javascript);
          break;
        default:
          console.log('未知的任务类型:', task.type, '，不执行');
          break;
      }
      
      console.log('任务执行完成:', task.type, '，数据:', JSON.stringify(task.data), '，耗时:', Date.now() - startTime, '毫秒');
    } catch (error) {

      console.error('执行任务失败:', task.type, '，数据:', JSON.stringify(task.data), '，错误:', error);
    }
  }

  // 定时任务主函数 - 获取任务列表，指令列表
  async function TaskPeriodicAlarm() {
    console.log('定时任务开始执行');

    try {
      // 第一步：清理过期指令
      await deleteInstructionsByCreatedAt();

      // 第二步：检查登录状态，如果未登录则登录
      if (!authToken && await login() === false) {
        console.error('登录失败，跳过本次任务执行');
        return;
      }

      // 第三步：获取任务列表，指令列表
      if (await getTaskListAndInstructions() === false) {
        console.error('获取任务列表，指令列表失败');
        return;
      }
      
      console.log('定时任务执行完成');
    } catch (error) {
      console.error('定时任务执行出错:', error);
      authToken = null;
    }
  }

  // 第二步：登录函数
  async function login(): Promise<boolean> {
    try {
      console.log('开始登录...');

      // 获取节点配置信息
      const profile = await GetNodeProfile();
      
      const response = await fetch(host + crawler_auth_path, {
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

      if (response.ok === false) {
        throw new Error(`登录失败: ${response.status}`);
      }

      const responseData = await response.json();
      authToken = responseData.data.token;

      console.log('登录成功，获得token!' + responseData.data);
      return true;
    } catch (error) {
      authToken = null;

      console.error('登录失败:', error);
      return false;
    }
  }

  // 第二步：获取任务列表, 并执行任务, 并下发指令 
  async function getTaskListAndInstructions(): Promise<boolean> {
    try {
      console.log('获取任务列表，指令列表...');

      if(!authToken) {

        console.error('未登录，无法获取任务列表，指令列表失败');
        return false;
      }

      const profile = await GetNodeProfile();

      const url = new URL(host + crawler_task_path + '?node_id=' + profile.node_id);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken || '',
        },
      });

      if (!response.ok) {
        authToken = null;
        throw new Error(`获取任务列表，指令列表失败: ${ response.status } ${ response.statusText }`);
      }

      const responseData = await response.json();

      const tasks = responseData.data.tasks;

      if(tasks && tasks.length > 0) {
        for(const task of tasks) {
          await executeTask(task);
        }
      }

      const instructions: Instruction[] = responseData.data.instructions;

      if(instructions && instructions.length > 0) {
        await addInstructions(instructions);
      }

      // 计算 index 范围
      const indexRange: number[] = instructions.map(instruction => instruction.index);

      for(const index of indexRange) {
        const tabs = await browser.tabs.query({ index: index as number, currentWindow: true });

        if (tabs.length === 1 && tabs[0].id) {
          browser.tabs.sendMessage(tabs[0].id, { action: 'executeInstructions' });
        }else{
          // 回复结果到服务器
          await replyResultToServer(crawler_instruction_reply_path, -1, {
            index: index,
            success: false,
            error: '标签页不存在或未加载!',
            created_at: Date.now(),
          });
        }
      }

      console.log('任务列表，指令列表获取成功!', responseData);
      return true;
    } catch (error) {

      console.error('获取任务列表，指令列表失败! 错误:', error);
      return false;
    }
  }

  // 回复结果到服务器
  async function replyResultToServer(api: string, index: number, data: any): Promise<boolean> {
    try {
      console.log('回复结果到服务器...');

      const profile = await GetNodeProfile();

      const reply: Reply = {
        node_id: profile.node_id,
        node_name: profile.node_name,
        node_type: profile.node_type,
        index: index,
        data: data,
        created_at: Date.now()
      }

      const response = await fetch(host + api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': authToken || '',
        },
        body: JSON.stringify(reply),
      });

      if (!response.ok) {
        throw new Error(`回复结果到服务器失败: ${ response.status } ${ response.statusText }`);
      }
      const responseData = await response.json();
      return responseData.success;
    } catch (error) {
      authToken = null;
      console.error('回复结果到服务器失败! 错误:', error);
      return false;
    }
  }

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('收到消息:', request.action, request.data);
    const sender_index = sender.tab?.index || -1;

    switch(request.action) {
      case 'taskReply':
        replyResultToServer(crawler_task_reply_path, sender_index, request.data).then(success => {
          console.log('任务返回结果完成!');
        }).catch(error => {
          console.log('任务返回结果失败:', error);
        });
        break;
      case 'instructionReply':
        replyResultToServer(crawler_instruction_reply_path, sender_index, request.data).then(success => {
          console.log('指令返回结果完成!');
        }).catch(error => {
          console.log('指令返回结果失败:', error);
        });
        break;
        case 'getNodeProfile':
          // 获取节点配置信息
          GetNodeProfile().then(profile => {
            sendResponse({ success: true, data: profile });
          }).catch(error => {
            console.error('获取节点配置信息失败:', error);
          });
          break;
        case 'updateNodeProfile':
          updateNodeProfile(request.data).then(success => {
            console.log('节点配置更新完成:', success);
          }).catch(error => {
            console.error('节点配置更新失败:', error);
          });
          break;
           case 'getInstructions':
             getInstructionsByIndexAndDelete(sender_index).then(instructions => {
               sendResponse({ success: true, data: instructions });
             }).catch(error => {
               console.error('获取指令列表失败:', error);
               sendResponse({ success: false, error: error.message });
             });
             return true; // 保持消息通道开放
             
           case 'getFirstInstruction':
             getFirstInstructionByIndexAndDelete(sender_index).then(instruction => {
               sendResponse({ success: true, data: instruction });
             }).catch(error => {
               console.error('获取第一个指令失败:', error);
               sendResponse({ success: false, error: error.message });
             });
             return true; // 保持消息通道开放
           case 'getInstructionsCount':
             getInstructionsCountByIndex(sender_index).then(count => {
               sendResponse({ success: true, data: { count } });
             }).catch(error => {
               console.error('获取指令数量失败:', error);
               sendResponse({ success: false, error: error.message });
             });
             return true; // 保持消息通道开放
             
           case 'getAllInstructionsStats':
             getAllInstructionsStats().then(stats => {
               sendResponse({ success: true, data: stats });
             }).catch(error => {
               console.error('获取指令统计失败:', error);
               sendResponse({ success: false, error: error.message });
             });
             return true; // 保持消息通道开放
             
           case 'clearInstructions':
             clearInstructionsByIndex(sender_index).then(success => {
               sendResponse({ success, message: success ? '指令队列已清空' : '清空失败' });
             }).catch(error => {
               console.error('清空指令队列失败:', error);
               sendResponse({ success: false, error: error.message });
             });
             return true; // 保持消息通道开放
        default:
          console.log('未知消息:', request.action);
          break;
    }
    console.log('消息处理完成:', request.action);
    return true; // 保持消息通道开放
  });

  // 监听扩展安装完成
  browser.runtime.onInstalled.addListener(() => { 
    console.log('扩展安装完成');

    // 创建定时器
    browser.alarms.create('TaskPeriodicAlarm', { periodInMinutes: 1, delayInMinutes: 10 * 1000 });
    console.log('定时器创建完成');
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

