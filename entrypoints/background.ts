export interface NodeProfile {
  node_id: string;
  node_name: string;
  node_token: string;
  node_type: string;
}

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });

  let host = 'http://127.0.0.1:5000';
  let crawler_auth_path = '/api/auth/login/crawler';
  let crawler_task_path = '/api/task/realtime/list';
  let crawler_data_path = '/api/task/realtime/data';

  // 存储JWT token
  let authToken: string | null = null;

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
      // 从chrome.storage.local获取存储的数据
      const result = await browser.storage.local.get(['node_id', 'node_name', 'node_token']);
      
      let node_id = result.node_id;
      let node_name = result.node_name;
      let node_token = result.node_token;

      // 如果node_id不存在，生成一个随机UUID并保存
      if (!node_id) {
        node_id = generateUUID();
        await browser.storage.local.set({ node_id });
        console.log('生成新的node_id:', node_id);
      }

      // 如果node_name不存在，设置为默认值并保存
      if (!node_name) {
        node_name = 'node';
        await browser.storage.local.set({ node_name });
        console.log('设置默认node_name:', node_name);
      }

      // 如果node_token不存在，设置为默认值并保存
      if (!node_token) {
        node_token = 'token';
        await browser.storage.local.set({ node_token });
        console.log('设置默认node_token:', node_token);
      }

      const profile: NodeProfile = {
        node_id,
        node_name,
        node_token,
        node_type: 'crawler'
      };

      console.log('获取节点配置:', profile);
      return profile;
    } catch (error) {
      console.error('获取节点配置失败:', error);
      // 返回默认配置
      return {
        node_id: generateUUID(),
        node_name: 'node',
        node_token: 'token',
        node_type: 'crawler'
      };
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

  browser.runtime.onInstalled.addListener(() => { 
    console.log('扩展安装完成');

    setTimeout(() => {
      login();
    }, 10 * 1000);

    //// 创建定时器
    //browser.alarms.create('TaskPeriodicAlarm', {
    //    periodInMinutes: 1,
    //});
    //
    //console.log('定时器创建完成');
  });

  // 监听定时器触发
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'TaskPeriodicAlarm') {
      TaskPeriodicAlarm().catch(error => {
        console.error('定时任务执行失败:', error);
      });
    }
  });

  // 定时任务主函数
  async function TaskPeriodicAlarm() {
    console.log('定时任务开始执行');
    
    try {
      // 第一步：检查登录状态，如果未登录则登录
      if (!authToken) {
        const loginSuccess = await login();
        if (!loginSuccess) {
          console.error('登录失败，跳过本次任务执行');
          return;
        }
      }

      // 第二步：获取任务列表
      const tasks = await fetchTaskList();
      if (tasks.length === 0) {
        console.log('没有待执行的任务');
        return;
      }

      // 第三步：执行任务
      await executeTasks(tasks);
      
      console.log('定时任务执行完成');
    } catch (error) {
      console.error('定时任务执行出错:', error);
      // 如果出错，清除token，下次重新登录
      authToken = null;
    }
  }

  // 第一步：登录函数
  async function login(): Promise<boolean> {
    try {
      console.log('开始登录...');
      
      // 获取节点配置信息
      const nodeProfile = await GetNodeProfile();
      
      const response = await fetch(host + crawler_auth_path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          node_id: nodeProfile.node_id,
          node_name: nodeProfile.node_name,
          node_token: nodeProfile.node_token,
          node_type: nodeProfile.node_type
        })
      });

      if (!response.ok) {
        throw new Error(`登录失败: ${response.status}`);
      }

      const data = await response.json();
      authToken = data.token; // 假设API返回token字段
      console.log('登录成功，获得token');
      return true;
    } catch (error) {
      console.error('登录失败:', error);
      return false;
    }
  }

  // 第二步：获取任务列表
  async function fetchTaskList(): Promise<any[]> {
    try {
      console.log('获取任务列表...');
      const url = new URL(host + crawler_task_path);
      url.searchParams.append('media_account_id', '1001');
      url.searchParams.append('page', '1');
      url.searchParams.append('per_page', '10');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // 如果有token，添加到header
      if (authToken) {
        headers['token'] = authToken;
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`获取任务失败: ${response.status}`);
      }

      const data = await response.json();
      console.log('任务列表获取成功:', data);
      return data.tasks || data.data || []; // 根据API返回结构调整
    } catch (error) {
      console.error('获取任务列表失败:', error);
      return [];
    }
  }

  // 第三步：执行任务 - 向content script发送消息
  async function executeTasks(tasks: any[]): Promise<void> {
    try {
      console.log(`开始执行 ${tasks.length} 个任务`);
      
      for (const task of tasks) {
        try {
          // 向所有活动标签页的content script发送任务
          const tabs = await browser.tabs.query({ active: true });
          
          for (const tab of tabs) {
            if (tab.id) {
              await browser.tabs.sendMessage(tab.id, {
                action: 'executeTask',
                task: task
              });
              console.log(`任务已发送到标签页 ${tab.id}:`, task);
            }
          }
        } catch (error) {
          console.error(`执行任务失败:`, task, error);
        }
      }
    } catch (error) {
      console.error('批量执行任务失败:', error);
    }
  }

  // 回复数据到服务器
  async function replyDataToServer(data: any): Promise<void> {
    try {
      console.log('回复数据到服务器...');
      const response = await fetch(host + crawler_data_path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': authToken || '',
        },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('回复数据到服务器失败:', error);
    }
  }

  // 监听来自content script和popup的消息
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'taskCompleted') {
      console.log('任务执行完成:', request.taskId);
    } else if (request.action === 'dataCompleted') {
      console.log('数据执行完成:', request.taskId);
    } else if (request.action === 'getNodeProfile') {
      // 获取节点配置信息
      GetNodeProfile().then(profile => {
        sendResponse({ success: true, data: profile });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // 保持消息通道开放
    } else if (request.action === 'updateNodeProfile') {
      // 更新节点配置信息
      updateNodeProfile(request.data).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // 保持消息通道开放
    } else {
      console.error('未知的操作类型:', request.action);
    }
  });

});

