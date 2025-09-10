import { WebCrawler } from '../core/WebCrawler';
import { Element } from '../types/Element';
import { NavigateInstruction, ClickInstruction, InputTextInstruction } from '../types/Instructions';

/**
 * Web爬虫使用示例
 */
export class CrawlerExample {
  private crawler: WebCrawler;

  constructor() {
    this.crawler = new WebCrawler();
  }

  /**
   * 示例1: 基本使用流程
   */
  async basicExample(): Promise<void> {
    console.log('=== 基本使用示例 ===');
    
    try {
      // 1. 创建元素
      const searchInput = new Element({
        name: 'search_input',
        description: '搜索输入框',
        selector: '#search-input',
        selectorType: 'css'
      });
      
      const searchButton = new Element({
        name: 'search_button',
        description: '搜索按钮',
        selector: '#search-button',
        selectorType: 'css'
      });
      
      // 2. 将元素添加到管理器
      this.crawler.getElementManager().setElement(searchInput);
      this.crawler.getElementManager().setElement(searchButton);
      
      // 3. 创建指令
      const navigateInst = new NavigateInstruction({
        id: 'nav_1',
        url: 'https://www.example.com'
      });
      
      const inputInst = new InputTextInstruction({
        id: 'input_1',
        elementName: 'search_input',
        text: 'web automation'
      });
      
      const clickInst = new ClickInstruction({
        id: 'click_1',
        elementName: 'search_button'
      });
      
      // 4. 添加指令到执行器
      this.crawler.addInstruction(navigateInst);
      this.crawler.addInstruction(inputInst);
      this.crawler.addInstruction(clickInst);
      
      // 5. 执行指令
      await this.crawler.executeAll();
      
      // 6. 查看结果
      console.log('执行统计:', this.crawler.getStatistics());
      
    } catch (error) {
      console.error('执行失败:', error);
    }
  }

  /**
   * 示例2: 从JSON文件加载指令
   */
  async loadFromFileExample(): Promise<void> {
    console.log('=== 从文件加载示例 ===');
    
    try {
      // 从示例文件加载指令
      await this.crawler.loadAndExecuteFromFile('/src/examples/sample-instructions.json');
      
      console.log('执行完成');
      console.log('结果:', this.crawler.exportResults());
      
    } catch (error) {
      console.error('从文件加载失败:', error);
    }
  }

  /**
   * 示例3: 元素管理
   */
  async elementManagementExample(): Promise<void> {
    console.log('=== 元素管理示例 ===');
    
    try {
      // 导入元素配置
      const elementsData = `[
        {
          "name": "login_button",
          "description": "登录按钮",
          "selector": "#login-btn",
          "selectorType": "css"
        },
        {
          "name": "username_input",
          "description": "用户名输入框",
          "selector": "#username",
          "selectorType": "css"
        }
      ]`;
      
      this.crawler.importElements(elementsData);
      
      // 获取元素统计
      const stats = this.crawler.getElementManager().getStatistics();
      console.log('元素统计:', stats);
      
      // 获取特定元素
      const loginButton = this.crawler.getElementManager().getElement('login_button');
      if (loginButton) {
        console.log('找到登录按钮:', loginButton.description);
      }
      
    } catch (error) {
      console.error('元素管理失败:', error);
    }
  }

  /**
   * 示例4: 指令验证
   */
  async validationExample(): Promise<void> {
    console.log('=== 指令验证示例 ===');
    
    try {
      // 添加一些指令
      const validInst = new NavigateInstruction({
        id: 'valid_nav',
        url: 'https://example.com'
      });
      
      this.crawler.addInstruction(validInst);
      
      // 验证所有内容
      const validation = this.crawler.validateAll();
      console.log('验证结果:', validation);
      
      if (validation.elements.valid && validation.instructions.valid) {
        console.log('所有验证通过');
      } else {
        console.error('验证失败:', {
          elementErrors: validation.elements.errors,
          instructionErrors: validation.instructions.errors
        });
      }
      
    } catch (error) {
      console.error('验证失败:', error);
    }
  }

  /**
   * 示例5: 序列化和反序列化
   */
  async serializationExample(): Promise<void> {
    console.log('=== 序列化示例 ===');
    
    try {
      // 添加一些指令
      const navInst = new NavigateInstruction({
        id: 'nav_1',
        url: 'https://example.com'
      });
      
      const clickInst = new ClickInstruction({
        id: 'click_1',
        elementName: 'button1'
      });
      
      this.crawler.addInstruction(navInst);
      this.crawler.addInstruction(clickInst);
      
      // 序列化为JSON
      const jsonData = this.crawler.serializeInstructions();
      console.log('序列化结果:', jsonData);
      
      // 清空指令
      this.crawler.getExecutor().clearInstructions();
      
      // 从JSON重新加载
      await this.crawler.loadAndExecuteInstructions(jsonData);
      
      console.log('反序列化并执行完成');
      
    } catch (error) {
      console.error('序列化失败:', error);
    }
  }

  /**
   * 运行所有示例
   */
  async runAllExamples(): Promise<void> {
    console.log('开始运行所有示例...');
    
    await this.basicExample();
    await this.elementManagementExample();
    await this.validationExample();
    await this.serializationExample();
    
    console.log('所有示例运行完成');
  }
}

// 使用示例
// const example = new CrawlerExample();
// example.runAllExamples();
