import { WebCrawler } from '../src/core/WebCrawler';

// Chrome扩展API类型声明
declare const chrome: any;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',
  main() {
    console.log('Web爬虫系统已加载');
    
    try {
      // 初始化爬虫系统
      const crawler = new WebCrawler();
      
      // 将爬虫实例暴露到全局，供popup使用
      (window as any).webCrawler = crawler;
      
      // 监听来自popup和background script的消息
      chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
        console.log('收到消息:', message);
        // 异步处理消息
        handleMessage(message, crawler, sendResponse).catch(error => {
          console.error('处理消息时发生错误:', error);
          sendResponse({ success: false, error: error.message || '处理消息时发生未知错误' });
        });
        return true; // 保持消息通道开放，等待异步响应
      });
      
      console.log('爬虫系统初始化完成');
    } catch (error) {
      console.error('爬虫系统初始化失败:', error);
    }
  },
});

/**
 * 处理来自popup的消息
 */
async function handleMessage(message: any, crawler: WebCrawler, sendResponse: (response?: any) => void) {
  console.log('处理消息:', message.action);
  
  try {
    if (!message || !message.action) {
      sendResponse({ success: false, error: '无效的消息格式' });
      return;
    }

    switch (message.action) {
      case 'executeInstructions':
        console.log('执行指令:', message.data);
        try {
          await crawler.loadAndExecuteInstructions(message.data);
          sendResponse({ success: true, results: crawler.getResults() });
        } catch (error) {
          console.error('执行指令失败:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : '执行指令时发生未知错误',
            results: crawler.getResults()
          });
        }
        break;
        
      case 'executeFromFile':
        console.log('从文件执行:', message.filePath);
        await crawler.loadAndExecuteFromFile(message.filePath);
        sendResponse({ success: true, results: crawler.getResults() });
        break;
        
      case 'getStatistics':
        console.log('获取统计信息');
        sendResponse({ success: true, data: crawler.getStatistics() });
        break;
        
      case 'pauseExecution':
        console.log('暂停执行');
        crawler.pause();
        sendResponse({ success: true });
        break;
        
      case 'stopExecution':
        console.log('停止执行');
        crawler.stop();
        sendResponse({ success: true });
        break;
        
      case 'exportResults':
        console.log('导出结果');
        sendResponse({ success: true, data: crawler.exportResults() });
        break;
        
      case 'exportElements':
        console.log('导出元素');
        sendResponse({ success: true, data: crawler.exportElements() });
        break;
        
      case 'importElements':
        console.log('导入元素:', message.data);
        const success = crawler.importElements(message.data);
        sendResponse({ success, data: crawler.getElementManager().getStatistics() });
        break;
        
      case 'validateAll':
        console.log('验证所有');
        const validation = crawler.validateAll();
        sendResponse({ success: true, data: validation });
        break;
        
      case 'executeTask':
        console.log('执行来自background script的任务:', message.task);
        try {
          // 执行任务逻辑
          await executeTaskFromBackground(message.task, crawler);
          
          // 向background script报告任务完成
          chrome.runtime.sendMessage({
            action: 'taskCompleted',
            taskId: message.task.id || 'unknown'
          });
          
          sendResponse({ success: true, message: '任务执行完成' });
        } catch (error) {
          console.error('执行任务失败:', error);
          
          // 向background script报告任务失败
          chrome.runtime.sendMessage({
            action: 'taskFailed',
            taskId: message.task.id || 'unknown',
            error: error instanceof Error ? error.message : '未知错误'
          });
          
          sendResponse({ success: false, error: error instanceof Error ? error.message : '任务执行失败' });
        }
        break;
        
      default:
        console.warn('未知的操作类型:', message.action);
        sendResponse({ success: false, error: `未知的操作类型: ${message.action}` });
    }
  } catch (error) {
    console.error('处理消息失败:', error);
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : '未知错误' 
    });
  }
}

/**
 * 执行来自background script的任务
 */
async function executeTaskFromBackground(task: any, crawler: WebCrawler) {
  console.log('开始执行任务:', task);
  
  // 根据任务类型执行不同的操作
  switch (task.type) {
    case 'crawl':
      // 执行爬虫任务
      if (task.instructions) {
        await crawler.loadAndExecuteInstructions(task.instructions);
      }
      break;
      
    case 'click':
      // 执行点击任务
      if (task.selector) {
        const element = document.querySelector(task.selector);
        if (element) {
          (element as HTMLElement).click();
          console.log('点击元素:', task.selector);
        } else {
          throw new Error(`找不到元素: ${task.selector}`);
        }
      }
      break;
      
    case 'input':
      // 执行输入任务
      if (task.selector && task.value) {
        const element = document.querySelector(task.selector) as HTMLInputElement;
        if (element) {
          element.value = task.value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('输入内容:', task.value);
        } else {
          throw new Error(`找不到输入元素: ${task.selector}`);
        }
      }
      break;
      
    case 'wait':
      // 执行等待任务
      if (task.duration) {
        await new Promise(resolve => setTimeout(resolve, task.duration));
        console.log('等待完成:', task.duration + 'ms');
      }
      break;
      
    case 'navigate':
      // 执行导航任务
      if (task.url) {
        window.location.href = task.url;
        console.log('导航到:', task.url);
      }
      break;
      
    default:
      console.warn('未知的任务类型:', task.type);
      throw new Error(`未知的任务类型: ${task.type}`);
  }
  
  console.log('任务执行完成:', task.id || 'unknown');
}
