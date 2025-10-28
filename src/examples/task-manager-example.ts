/**
 * 任务管理器使用示例
 * 展示如何在 Chrome 扩展中使用任务管理器
 */

// 任务管理器使用示例
export class TaskManagerExample {
  
  // 添加任务示例
  static async addTaskExample() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'addTask',
        data: {
          media_url: 'https://example.com/video1.mp4',
          task_text: '处理视频文件'
        }
      });
      
      if (response.success) {
        console.log('任务添加成功:', response.message);
      } else {
        console.error('任务添加失败:', response.error);
      }
    } catch (error) {
      console.error('添加任务异常:', error);
    }
  }

  // 获取所有任务并删除示例
  static async getAllTasksAndDeleteExample() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getAllTasksAndDelete'
      });
      
      if (response.success) {
        console.log('获取到任务:', response.data);
        console.log('任务数量:', response.data.length);
        // 处理获取到的任务...
      } else {
        console.error('获取任务失败:', response.error);
      }
    } catch (error) {
      console.error('获取任务异常:', error);
    }
  }

  // 根据media_url获取任务并删除示例
  static async getTasksByMediaUrlAndDeleteExample() {
    try {
      const mediaUrl = 'https://example.com/video1.mp4';
      const response = await chrome.runtime.sendMessage({
        action: 'getTasksByMediaUrlAndDelete',
        mediaUrl: mediaUrl
      });
      
      if (response.success) {
        console.log(`获取到media_url为${mediaUrl}的任务:`, response.data);
        console.log('匹配任务数量:', response.data.length);
        // 处理获取到的任务...
      } else {
        console.error('获取任务失败:', response.error);
      }
    } catch (error) {
      console.error('获取任务异常:', error);
    }
  }

  // 获取所有任务（不删除）示例
  static async getAllTasksExample() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getAllTasks'
      });
      
      if (response.success) {
        console.log('当前所有任务:', response.data);
        console.log('任务数量:', response.data.length);
        // 查看任务但不删除...
      } else {
        console.error('获取任务失败:', response.error);
      }
    } catch (error) {
      console.error('获取任务异常:', error);
    }
  }

  // 批量添加任务示例
  static async batchAddTasksExample() {
    const tasks = [
      {
        media_url: 'https://example.com/video1.mp4',
        task_text: '处理视频1'
      },
      {
        media_url: 'https://example.com/video2.mp4',
        task_text: '处理视频2'
      },
      {
        media_url: 'https://example.com/audio1.mp3',
        task_text: '处理音频1'
      }
    ];

    for (const task of tasks) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'addTask',
          data: task
        });
        
        if (response.success) {
          console.log(`任务添加成功: ${task.media_url}`);
        } else {
          console.error(`任务添加失败: ${task.media_url}`, response.error);
        }
      } catch (error) {
        console.error(`添加任务异常: ${task.media_url}`, error);
      }
    }
  }

  // 完整工作流程示例
  static async completeWorkflowExample() {
    console.log('=== 任务管理器完整工作流程示例 ===');
    
    // 1. 添加一些任务
    console.log('1. 添加任务...');
    await this.batchAddTasksExample();
    
    // 2. 查看所有任务
    console.log('2. 查看所有任务...');
    await this.getAllTasksExample();
    
    // 3. 根据特定media_url获取任务并删除
    console.log('3. 获取特定任务并删除...');
    await this.getTasksByMediaUrlAndDeleteExample();
    
    // 4. 再次查看剩余任务
    console.log('4. 查看剩余任务...');
    await this.getAllTasksExample();
    
    // 5. 获取所有剩余任务并删除
    console.log('5. 获取所有剩余任务并删除...');
    await this.getAllTasksAndDeleteExample();
    
    console.log('=== 工作流程完成 ===');
  }
}

// 使用示例
// TaskManagerExample.completeWorkflowExample();
