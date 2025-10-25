// 节点配置
export interface NodeProfile {
  node_id: string;
  node_name: string;
  node_token: string;
  node_type: string;
}

// 任务管理器

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
        node_token = 'P7SgH0gNoKdISoqnyx72YOcUWmium6GGSdG0SL49w';
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

  
  

  // 定时任务主函数
  async function TaskPeriodicAlarm() {
    console.log('定时任务开始执行');
    
    try {

      // 第一步：检查登录状态，如果未登录则登录
      if (!authToken && await login() === false) {
        console.error('登录失败，跳过本次任务执行');
        return;
      }

      // 第二步：获取任务列表
      if (await tasks() === false) {
        console.error('获取任务列表失败');
        return;
      }

      // 第三步：配置任务环境
      if (await configure() === false) {
        console.error('配置任务环境失败');
        return;
      }
      
      
      console.log('定时任务执行完成');
    } catch (error) {

      console.error('定时任务执行出错:', error);
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

  // 第二步：获取任务列表
  async function tasks(): Promise<boolean> {
    try {
      console.log('获取任务列表...');

      if(!authToken) {

        console.error('未登录，无法获取任务列表');
        return false;
      }

      // 判断任务列表是否过期
      const tasksResult = await browser.storage.local.get('tasks');
      const tasksExpire = await browser.storage.local.get('expire');

      if(tasksResult && tasksResult.tasks && tasksResult.tasks.length > 0 && tasksExpire && tasksExpire.tasksExpire && tasksExpire.tasksExpire > Date.now()) {
        console.log('任务列表获取成功:', tasksResult.tasks);
        return true;
      }

      if(tasksResult && tasksResult.tasks && tasksResult.tasks.length > 0) {
        browser.storage.local.set({ tasks: [] });
        browser.storage.local.set({ expire: 0 });
      }

      const nodeProfile = await GetNodeProfile();

      const url = new URL(host + crawler_task_path);
      url.searchParams.append('node_id', nodeProfile.node_id);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': authToken || '',
      };

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        authToken = null;
        throw new Error(`获取任务失败: ${ response.status }`);
      }

      const responseData = await response.json();

      if (responseData.data.tasks && responseData.data.tasks.length > 0) {  
        await browser.storage.local.set({ expire: responseData.data.expire || Date.now() + 1000 * 60 * 60 * 1 });
        await browser.storage.local.set({ tasks: responseData.data.tasks });
      }

      console.log('任务列表获取成功:', responseData);
      return true;
    } catch (error) {

      console.error('获取任务列表失败:', error);
      return false;
    }
  }

  // 第三步：配置任务环境
  async function configure(): Promise<boolean> {
    try {
      console.log('配置任务环境...');

      if(!authToken) {
        console.error('未登录，无法配置任务环境');
        return false;
      }


      return true;
    } catch (error) {
      console.error('配置任务环境失败:', error);
      return false;
    }
  }

  // 第三步：执行任务 - 向 content script 发送消息
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

  // 监听来自 content script 和 popup 的消息
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('收到消息:', request.action, request.data);

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
    } else if (request.action === 'updateNodeProfile') {
      // 更新节点配置信息
      updateNodeProfile(request.data).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    } else {
      console.error('未知的操作类型:', request.action);
    }

    return true;
  });

  // 监听扩展安装完成
  browser.runtime.onInstalled.addListener(() => { 
    console.log('扩展安装完成');

    setInterval(() => {
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
});

