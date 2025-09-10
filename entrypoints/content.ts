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
      
      // 监听来自popup的消息
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
