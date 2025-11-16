import { WebCrawler } from '../src/core/WebCrawler';

/*
 * 内容脚本
 * 负责处理来自 popup 和 background script 的消息
 * 负责处理爬虫系统的初始化、运行、暂停、停止、导出结果、导出元素、导入元素、验证所有、通知执行指令等操作
*/
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',
  main() {
    console.log('Web爬虫系统已加载');

    try {
      // 初始化爬虫系统
      const crawler = new WebCrawler();

      // 将爬虫实例暴露到全局，供 popup 和 background script 使用
      (window as any).webCrawler = crawler;

      // 监听来自popup和background script的消息
      browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
        return handleMessage(message, crawler, sendResponse); // 异步处理消息
      });

      // 内容脚本加载完成，立即向 background 发送消息通知连接已建立
      notifyBackgroundReady().catch(error => {
        console.error('向 background 发送就绪消息失败:', error);
        // 不自动重载页面，让用户决定是否重载
        // 重载页面会导致内容脚本重新加载，可能造成循环
      });

      console.log('爬虫系统初始化完成');
    } catch (error) {
      console.error('爬虫系统初始化失败:', error);
    }
  },
});

/**
 * 通知 background script 内容脚本已加载完成
 */
async function notifyBackgroundReady(): Promise<void> {
  console.log('向 background 发送就绪消息...');
  const response = await browser.runtime.sendMessage({ action: 'contentScriptReady', data: { url: window.location.href, timestamp: Date.now() } });

  if (response && response.success) {
    console.log('Background 已确认收到就绪消息');
  } else {
    console.warn('Background 响应异常:', response);
  }
}

/**
 * 处理来自popup的消息
 */
function handleMessage(message: any, crawler: WebCrawler, sendResponse: (response?: any) => void): boolean {

  try {
    console.log('处理消息:', message.action);

    if (!message || !message.action) {
      sendResponse({ success: false, error: '无效的消息格式', message: '无效的消息格式' });
      return true;
    }

    switch (message.action) {
      case 'ping':
        // 测试连接
        console.log('收到ping消息, 连接正常');
        sendResponse({ success: true, message: 'pong' });
        break;
      case 'executeInstructions':
        console.log('执行指令:', message.data);
        if (!message.data) {
          sendResponse({ success: false, error: '缺少指令数据', message: '缺少指令数据' });
          return true;
        }
        crawler.loadAndExecuteInstructions(message.data).then(() => {
          sendResponse({ success: true, results: crawler.getResults(), message: '指令执行完成' });
        }).catch((error: any) => {
          console.error('执行指令失败:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : '指令执行失败', 
            message: '指令执行失败' 
          });
        });
        return true; // 保持通道开放，等待异步响应
      case 'executeFromFile':
        console.log('从文件执行:', message.filePath);
        if (!message.filePath) {
          sendResponse({ success: false, error: '缺少文件路径', message: '缺少文件路径' });
          return true;
        }
        crawler.loadAndExecuteFromFile(message.filePath).then(() => {
          sendResponse({ success: true, results: crawler.getResults(), message: '文件执行完成' });
        }).catch((error: any) => {
          console.error('从文件执行失败:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : '文件执行失败', 
            message: '文件执行失败' 
          });
        });
        return true; // 保持通道开放，等待异步响应
      case 'getStatistics':
        console.log('获取统计信息');
        sendResponse({ success: true, data: crawler.getStatistics(), message: '统计信息获取完成' });
        break;
      case 'pauseExecution':
        console.log('暂停执行');
        crawler.pause();
        sendResponse({ success: true, message: '执行暂停完成' });
        break;
      case 'stopExecution':
        console.log('停止执行');
        crawler.stop();
        sendResponse({ success: true, message: '执行停止完成' });
        break;
      case 'exportResults':
        console.log('导出结果');
        sendResponse({ success: true, data: crawler.exportResults(), message: '结果导出完成' });
        break;
      case 'exportElements':
        console.log('导出元素');
        sendResponse({ success: true, data: crawler.exportElements(), message: '元素导出完成' });
        break;
      case 'importElements':
        console.log('导入元素:', message.data);
        if (!message.data) {
          sendResponse({ success: false, error: '缺少元素数据', message: '缺少元素数据' });
          return true;
        }
        if (crawler.importElements(message.data)) {
          sendResponse({ success: true, data: crawler.getManager().getStatistics(), message: '元素导入完成' });
        } else {
          sendResponse({ success: false, error: '元素导入失败', message: '元素导入失败, 请检查元素配置格式是否正确' });
        }
        break;
      case 'validateAll':
        console.log('验证所有');
        const validation = crawler.validateAll();
        if (validation.elements.valid && validation.instructions.valid) {
          sendResponse({ success: true, data: crawler.validateAll(), message: '验证所有完成' });
        } else {
          sendResponse({ success: false, error: validation.elements.errors.join(', ') + validation.instructions.errors.join(', '), message: '验证所有失败, 请检查指令配置格式是否正确' });
        }
        break;
      case 'notify':
        console.log('收到通知，开始执行指令');
        sendResponse({ success: true, message: '指令执行开始' });
        executeTaskFromBackground(message.data, crawler).then(() => {
          // 注意：这里不能再次调用 sendResponse，因为已经调用过了
          // 如果需要返回结果，应该在 executeTaskFromBackground 中处理
          console.log('指令执行完成');
        }).catch((error: any) => {
          console.error('执行任务失败:', error);
          // 注意：这里不能再次调用 sendResponse，因为已经调用过了
          // 错误应该通过其他方式通知（如日志或事件）
        });
        return true; // 保持通道开放，等待异步响应
      default:
        console.warn('未知的操作类型:', message.action);
        sendResponse({ success: false, error: `未知的操作类型: ${message.action}`, message: `未知的操作类型: ${message.action}` });
    }
  } catch (error) {
    console.error('处理消息失败:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : '处理消息时发生未知错误', message: '处理消息失败' });
  }

  return true;  // 保持消息通道开放，等待异步响应
}

/**
 * 执行来自 background script 的任务
 */
async function executeTaskFromBackground(task: any, crawler: WebCrawler) {
  try {
    console.log('开始执行任务');

    crawler.clearInstructions();

    // 向 background script 发送消息, 获取每一条指令，直到获取到所有指令
    let hasMore = true;
    let instructionCount = 0;
    const maxInstructions = 1000; // 防止无限循环

    while (hasMore && instructionCount < maxInstructions) {
      try {
        const response = await browser.runtime.sendMessage({ action: 'getSingleInstruction' });

        if (response && response.success && response.data) {
          const instruction = response.data;
          
          // 验证指令数据
          if (!instruction.instruction) {
            console.warn('收到无效指令数据，跳过');
            hasMore = false;
            break;
          }

          await crawler.loadAndExecuteFromJSONString(instruction.instruction);
          instructionCount++;
        } else {
          console.log('没有更多指令');
          hasMore = false;
        }
      } catch (error) {
        console.error('获取或执行指令时发生错误:', error);
        // 继续尝试下一条指令，而不是立即失败
        hasMore = false;
      }
    }

    if (instructionCount >= maxInstructions) {
      console.warn(`达到最大指令数量限制 (${maxInstructions})，停止执行`);
    }

    console.log(`任务执行完成，共执行 ${instructionCount} 条指令`);
  } catch (error) {
    console.error('执行任务时发生错误:', error);
    throw error;
  }
}