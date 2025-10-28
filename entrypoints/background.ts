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
  
  // 添加指令
  async function addInstructions(newInstructions: Instruction[]): Promise<number> {
    try {
      const now = Date.now();

      // 获取现有指令列表
      const result = await browser.storage.local.get(['instructions']);
      const instructions: Instruction[] = result.instructions || [];

      // 添加新指令
      instructions.push(...newInstructions);

      // 保存到存储
      await browser.storage.local.set({ instructions });
      
      console.log('添加新指令:', newInstructions);
      return newInstructions.length;
    } catch (error) {
      console.error('添加指令失败:', error);
      return -1;
    }
  }

  // 获取所有指令并删除
  async function getAllInstructionsAndDelete(): Promise<Instruction[]> {
    try {
      // 获取所有指令
      const result = await browser.storage.local.get(['instructions']);
      const instructions: Instruction[] = result.instructions || [];
      
      console.log('获取所有指令:', instructions.length, '个');
      
      if(instructions.length > 0) {
        // 删除指令
        await browser.storage.local.set({ instructions: [] });
        console.log('已删除指令列表');
      }

      return instructions;
    } catch (error) {
      console.error('获取所有指令失败:', error);
      return [];
    }
  }

  // 根据index获取指令并删除
  async function getInstructionsByIndexAndDelete(index: number): Promise<Instruction[]> {
    try {
      // 获取现有指令列表
      const result = await browser.storage.local.get(['tasks']);
      const instructions: Instruction[] = result.instructions || [];
      
      // 过滤出指定index的指令
      const matchedInstructions = instructions.filter(instruction => instruction.index === index);
      
      if(matchedInstructions.length > 0) {
        // 过滤掉匹配的指令（删除匹配的指令）
        const remainingInstructions = instructions.filter(instruction => instruction.index !== index);

        // 保存更新后的指令列表
        await browser.storage.local.set({ instructions: remainingInstructions });
      }

      console.log(`获取index为${index}的指令，数量:`, matchedInstructions.length, '个，已删除');
      return matchedInstructions;
    } catch (error) {
      
      console.error('获取指令失败:', error);
      return [];
    }
  }

  // 获取所有指令（不删除）
  async function getAllInstructions(): Promise<Instruction[]> {
    try {
      const result = await browser.storage.local.get(['instructions']);
      const instructions: Instruction[] = result.instructions || [];
      
      console.log('获取所有指令，数量:', instructions.length, '个');
      return instructions;
    } catch (error) {

      console.error('获取所有指令失败:', error);
      return [];
    }
  }

  // 根据 index 获取指令数量
  async function getInstructionsCountByIndex(index: number): Promise<number> {
    try {
      const result = await browser.storage.local.get(['instructions']);
      const instructions: Instruction[] = result.instructions || [];
      const count = instructions.filter(instruction => instruction.index === index).length;

      console.log(`获取 index 为${ index }的指令，数量: ${ count } 个`);
      return count;
    } catch (error) {

      console.error('获取指令数量失败:', error);
      return -1;
    }
  }

  // 删除创建时间超过一个小时的指令
  async function deleteInstructionsByCreatedAt(elapsedTime: number=1000 * 60 * 60 * 1): Promise<number> {
    try {
      const now = Date.now();
      const result: { instructions: Instruction[] } = await browser.storage.local.get(['instructions']);
      const instructions: Instruction[] = result.instructions || [];

      const remainingInstructions: Instruction[] = instructions.filter(instruction => now - instruction.created_at < elapsedTime);

      if(instructions.length > remainingInstructions.length) {
        // 保存剩余指令
        await browser.storage.local.set({ instructions: remainingInstructions });
        console.log(`删除创建时间超过${elapsedTime}毫秒的指令，数量: ${instructions.length - remainingInstructions.length} 个，剩余: ${remainingInstructions.length} 个`);
      }
      return instructions.length - remainingInstructions.length;
    } catch (error) {

      console.error('删除任务失败:', error);
      return -1;
    }
  }

  // 检查新标签页个数, 如果不够, 并创建新标签页
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
      
      // 第一步：检查登录状态，如果未登录则登录
      if (!authToken && await login() === false) {
        console.error('登录失败，跳过本次任务执行');
        return;
      }

      // 第二步：获取任务列表，指令列表
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
        if(tabs.length > 0 && tabs[0].id) {
          browser.tabs.sendMessage(tabs[0].id, { action: 'executeInstructions' });
        }else{
          // 回复结果到服务器
          await replyResultToServer(crawler_instruction_reply_path, {
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
  async function replyResultToServer(api: string, data: any): Promise<boolean> {
    try {
      console.log('回复结果到服务器...');

      const profile = await GetNodeProfile();
      data.node_id = profile.node_id;
      data.node_name = profile.node_name;
      data.node_type = profile.node_type;
      data.created_at = Date.now();

      const response = await fetch(host + api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': authToken || '',
        },
        body: JSON.stringify(data),
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

    switch(request.action) {
      case 'taskReply':
        replyResultToServer(crawler_task_reply_path, request.data).then(success => {
          console.log('任务返回结果完成!');
        }).catch(error => {
          console.log('任务返回结果失败:', error);
        });
        break;
      case 'instructionReply':
        replyResultToServer(crawler_instruction_reply_path, request.data).then(success => {
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
            const index = sender.tab?.index || -1;
            getInstructionsByIndexAndDelete(index).then(instructions => {
              sendResponse({ success: true, data: instructions });
            }).catch(error => {
              console.error('获取指令列表失败:', error);
            });
            break;
        default:
          console.log('未知消息:', request.action);
          break;
    }
    console.log('消息处理完成:', request.action);
    return true;
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

