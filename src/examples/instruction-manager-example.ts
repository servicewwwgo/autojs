/**
 * 指令管理器使用示例
 * 展示如何使用按标签页索引分别存储的指令管理器
 */

// 指令管理器使用示例
export class InstructionManagerExample {
  
  // 添加指令示例
  static async addInstructionsExample() {
    const instructions = [
      {
        index: 0,
        instruction: { type: 'click', selector: '#button1' }
      },
      {
        index: 0,
        instruction: { type: 'input', selector: '#input1', value: 'test' }
      },
      {
        index: 1,
        instruction: { type: 'navigate', url: 'https://example.com' }
      },
      {
        index: 2,
        instruction: { type: 'wait', duration: 3000 }
      }
    ];

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'addInstructions',
        data: instructions
      });
      
      if (response.success) {
        console.log('指令添加成功:', response.data);
      } else {
        console.error('指令添加失败:', response.error);
      }
    } catch (error) {
      console.error('添加指令异常:', error);
    }
  }

  // 获取第一个指令并删除示例（先进先出）
  static async getFirstInstructionExample(tabIndex: number = 0) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getFirstInstruction',
        tabIndex: tabIndex
      });
      
      if (response.success) {
        if (response.data) {
          console.log(`标签页 ${tabIndex} 的第一个指令:`, response.data);
          // 执行指令...
        } else {
          console.log(`标签页 ${tabIndex} 没有待执行指令`);
        }
      } else {
        console.error('获取第一个指令失败:', response.error);
      }
    } catch (error) {
      console.error('获取第一个指令异常:', error);
    }
  }

  // 获取所有指令并删除示例
  static async getAllInstructionsExample(tabIndex: number = 0) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getInstructions',
        tabIndex: tabIndex
      });
      
      if (response.success) {
        console.log(`标签页 ${tabIndex} 的所有指令:`, response.data);
        console.log(`指令数量: ${response.data.length}`);
        
        // 批量执行指令...
        for (const instruction of response.data) {
          console.log('执行指令:', instruction.instruction);
        }
      } else {
        console.error('获取指令失败:', response.error);
      }
    } catch (error) {
      console.error('获取指令异常:', error);
    }
  }

  // 获取指令数量示例
  static async getInstructionsCountExample(tabIndex: number = 0) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getInstructionsCount',
        index: tabIndex
      });
      
      if (response.success) {
        console.log(`标签页 ${tabIndex} 的指令数量:`, response.data.count);
      } else {
        console.error('获取指令数量失败:', response.error);
      }
    } catch (error) {
      console.error('获取指令数量异常:', error);
    }
  }

  // 获取所有标签页指令统计示例
  static async getAllInstructionsStatsExample() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getAllInstructionsStats'
      });
      
      if (response.success) {
        console.log('所有标签页指令统计:', response.data);
        
        // 显示统计信息
        for (const [index, count] of Object.entries(response.data)) {
          console.log(`标签页 ${index}: ${count} 个指令`);
        }
      } else {
        console.error('获取指令统计失败:', response.error);
      }
    } catch (error) {
      console.error('获取指令统计异常:', error);
    }
  }

  // 清空指定标签页指令示例
  static async clearInstructionsExample(tabIndex: number = 0) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'clearInstructions',
        index: tabIndex
      });
      
      if (response.success) {
        console.log(`标签页 ${tabIndex} 指令队列已清空`);
      } else {
        console.error('清空指令队列失败:', response.error);
      }
    } catch (error) {
      console.error('清空指令队列异常:', error);
    }
  }

  // 完整工作流程示例
  static async completeWorkflowExample() {
    console.log('=== 指令管理器完整工作流程示例 ===');
    
    // 1. 添加指令到不同标签页
    console.log('1. 添加指令到不同标签页...');
    await this.addInstructionsExample();
    
    // 2. 查看所有标签页的指令统计
    console.log('2. 查看指令统计...');
    await this.getAllInstructionsStatsExample();
    
    // 3. 查看标签页0的指令数量
    console.log('3. 查看标签页0的指令数量...');
    await this.getInstructionsCountExample(0);
    
    // 4. 获取标签页0的第一个指令（先进先出）
    console.log('4. 获取标签页0的第一个指令...');
    await this.getFirstInstructionExample(0);
    
    // 5. 再次查看标签页0的指令数量
    console.log('5. 再次查看标签页0的指令数量...');
    await this.getInstructionsCountExample(0);
    
    // 6. 获取标签页1的所有指令
    console.log('6. 获取标签页1的所有指令...');
    await this.getAllInstructionsExample(1);
    
    // 7. 清空标签页2的指令
    console.log('7. 清空标签页2的指令...');
    await this.clearInstructionsExample(2);
    
    // 8. 最终统计
    console.log('8. 最终统计...');
    await this.getAllInstructionsStatsExample();
    
    console.log('=== 工作流程完成 ===');
  }

  // 模拟指令执行器
  static async instructionExecutor(tabIndex: number) {
    console.log(`开始处理标签页 ${tabIndex} 的指令...`);
    
    while (true) {
      try {
        // 获取第一个指令
        const response = await chrome.runtime.sendMessage({
          action: 'getFirstInstruction',
          tabIndex: tabIndex
        });
        
        if (response.success && response.data) {
          console.log(`标签页 ${tabIndex} 执行指令:`, response.data.instruction);
          
          // 模拟指令执行
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log(`标签页 ${tabIndex} 指令执行完成`);
        } else {
          console.log(`标签页 ${tabIndex} 没有更多指令，退出`);
          break;
        }
      } catch (error) {
        console.error(`标签页 ${tabIndex} 指令执行失败:`, error);
        break;
      }
    }
  }
}

// 使用示例
// InstructionManagerExample.completeWorkflowExample();

// 启动指令执行器（需要在content script中调用）
// InstructionManagerExample.instructionExecutor(0);
