<script lang="ts" setup>
import { ref, onMounted } from 'vue';

// 响应式数据
const isRunning = ref(false);
const instructionText = ref('');
const results = ref<any[]>([]);
const statistics = ref<any>(null);
const logMessages = ref<string[]>([]);

// 示例指令
const sampleInstructions = ref(`[
  {
    "type": "navigate",
    "id": "nav_1",
    "url": "https://www.google.com",
    "delay": 1,
    "retry": 1,
    "timeout": 30,
    "waitVisible": true
  }
]`);

// 复杂示例指令（包含多个操作）
const complexSampleInstructions = ref(`[
  {
    "type": "navigate",
    "id": "nav_1",
    "url": "https://www.google.com",
    "delay": 1,
    "retry": 1,
    "timeout": 30,
    "waitVisible": true
  },
  {
    "type": "wait",
    "id": "wait_1",
    "waitType": "time",
    "value": 3,
    "delay": 0,
    "retry": 0,
    "timeout": 5,
    "waitVisible": false
  }
]`);

// 组件挂载时初始化
onMounted(async () => {
  instructionText.value = sampleInstructions.value;
  addLog('爬虫系统已准备就绪');
  
  // 测试与content script的连接，使用重试机制
  await retryConnection();
});

// 添加日志消息
function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  logMessages.value.push(`[${timestamp}] ${message}`);
  // 保持最多100条日志
  if (logMessages.value.length > 100) {
    logMessages.value.shift();
  }
}

// 发送消息到content script
async function sendMessage(action: string, data?: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action, data }, (response) => {
          // 检查响应是否存在，如果不存在则返回错误
          if (chrome.runtime.lastError) {
            console.error('消息发送失败:', chrome.runtime.lastError);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else if (response) {
            resolve(response);
          } else {
            resolve({ success: false, error: 'Content script未响应' });
          }
        });
      } else {
        resolve({ success: false, error: '无法获取当前标签页' });
      }
    });
  });
}

// 执行指令
async function executeInstructions() {
  if (!instructionText.value.trim()) {
    addLog('错误: 请输入指令JSON');
    return;
  }

  // 先检查连接
  addLog('检查连接状态...');
  const connected = await testConnection();
  if (!connected) {
    addLog('❌ 无法连接到Content Script，请先解决连接问题');
    return;
  }

  isRunning.value = true;
  addLog('开始执行指令...');

  try {
    const response = await sendMessage('executeInstructions', instructionText.value);
    
    // 确保response存在且有success属性
    if (response && response.success) {
      results.value = response.results || [];
      addLog(`执行完成，共 ${results.value.length} 个指令`);
      
      // 检查是否有导航指令
      const hasNavigate = results.value.some((result: any) => 
        result.instructionID === 'nav_1' && result.success
      );
      
      if (hasNavigate) {
        addLog('⚠️ 检测到导航指令，页面已跳转');
        addLog('如需执行后续指令，请在新页面重新运行');
      }
      
      await getStatistics();
    } else {
      const errorMsg = response?.error || '未知错误';
      addLog(`执行失败: ${errorMsg}`);
      
      // 即使失败也显示部分结果
      if (response?.results) {
        results.value = response.results;
        addLog(`部分执行结果: ${results.value.length} 个指令`);
      }
    }
  } catch (error) {
    addLog(`执行异常: ${error}`);
  } finally {
    isRunning.value = false;
  }
}

// 暂停执行
async function pauseExecution() {
  const response = await sendMessage('pauseExecution');
  if (response && response.success) {
    addLog('执行已暂停');
    isRunning.value = false;
  } else {
    addLog(`暂停失败: ${response?.error || '未知错误'}`);
  }
}

// 停止执行
async function stopExecution() {
  const response = await sendMessage('stopExecution');
  if (response && response.success) {
    addLog('执行已停止');
    isRunning.value = false;
  } else {
    addLog(`停止失败: ${response?.error || '未知错误'}`);
  }
}

// 获取统计信息
async function getStatistics() {
  const response = await sendMessage('getStatistics');
  if (response && response.success) {
    statistics.value = response.data;
    addLog(`统计信息: 成功 ${statistics.value.success}, 失败 ${statistics.value.failure}`);
  } else {
    addLog(`获取统计失败: ${response?.error || '未知错误'}`);
  }
}

// 导出结果
async function exportResults() {
  const response = await sendMessage('exportResults');
  if (response && response.success) {
    const blob = new Blob([response.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crawler-results.json';
    a.click();
    URL.revokeObjectURL(url);
    addLog('结果已导出');
  } else {
    addLog(`导出失败: ${response?.error || '未知错误'}`);
  }
}

// 清空日志
function clearLogs() {
  logMessages.value = [];
}

// 加载示例指令
function loadSampleInstructions() {
  instructionText.value = sampleInstructions.value;
  addLog('已加载简单示例指令（仅导航）');
}

// 加载复杂示例指令
function loadComplexSample() {
  instructionText.value = complexSampleInstructions.value;
  addLog('已加载复杂示例指令（导航+等待）');
}

// 测试与content script的连接
async function testConnection() {
  addLog('正在测试连接...');
  
  try {
    const response = await sendMessage('getStatistics');
    if (response && response.success) {
      addLog('✅ 与Content Script连接正常');
      return true;
    } else {
      addLog('❌ Content Script连接失败: ' + (response?.error || '未知错误'));
      return false;
    }
  } catch (error) {
    addLog('❌ 连接测试失败: ' + error);
    return false;
  }
}

// 检查当前页面类型
async function checkCurrentPage() {
  try {
    const tabs = await new Promise<any[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    
    if (tabs[0]) {
      const url = tabs[0].url;
      addLog(`当前页面: ${url}`);
      
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) {
        addLog('❌ 当前页面不支持Content Script');
        addLog('请访问普通网页（如 https://www.google.com）');
        return false;
      }
      
      if (url.startsWith('file://')) {
        addLog('⚠️ 本地文件页面，可能有限制');
      }
      
      return true;
    }
  } catch (error) {
    addLog('无法获取当前页面信息');
  }
  
  return true;
}

// 重试连接
async function retryConnection(maxRetries = 3) {
  // 先检查页面类型
  const pageValid = await checkCurrentPage();
  if (!pageValid) {
    return false;
  }
  
  for (let i = 0; i < maxRetries; i++) {
    addLog(`连接重试 ${i + 1}/${maxRetries}...`);
    
    const success = await testConnection();
    if (success) {
      return true;
    }
    
    if (i < maxRetries - 1) {
      // 等待1秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  addLog('❌ 连接重试失败，请检查：');
  addLog('1. 确保在普通网页上使用（非chrome://页面）');
  addLog('2. 刷新页面后重试');
  addLog('3. 检查扩展是否正确加载');
  addLog('4. 尝试点击"重试连接"按钮');
  return false;
}
</script>

<template>
  <div class="crawler-popup">
    <header class="header">
      <h1>Web爬虫控制台</h1>
      <div class="status" :class="{ running: isRunning }">
        {{ isRunning ? '运行中' : '已停止' }}
      </div>
    </header>

    <div class="content">
      <!-- 指令输入区域 -->
      <div class="section">
        <h3>指令配置</h3>
        <div class="input-group">
          <textarea 
            v-model="instructionText" 
            placeholder="请输入JSON格式的指令配置..."
            :disabled="isRunning"
            class="instruction-input"
          ></textarea>
        </div>
        <div class="button-group">
          <button @click="loadSampleInstructions" :disabled="isRunning" class="btn btn-secondary">
            简单示例
          </button>
          <button @click="loadComplexSample" :disabled="isRunning" class="btn btn-secondary">
            复杂示例
          </button>
        </div>
      </div>

      <!-- 控制按钮 -->
      <div class="section">
        <h3>执行控制</h3>
        <div class="button-group">
          <button 
            @click="executeInstructions" 
            :disabled="isRunning || !instructionText.trim()" 
            class="btn btn-primary"
          >
            开始执行
          </button>
          <button 
            @click="pauseExecution" 
            :disabled="!isRunning" 
            class="btn btn-warning"
          >
            暂停
          </button>
          <button 
            @click="stopExecution" 
            :disabled="!isRunning" 
            class="btn btn-danger"
          >
            停止
          </button>
          <button @click="getStatistics" class="btn btn-info">
            刷新统计
          </button>
          <button @click="testConnection" class="btn btn-secondary">
            测试连接
          </button>
          <button @click="retryConnection" class="btn btn-warning">
            重试连接
          </button>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="section" v-if="statistics">
        <h3>执行统计</h3>
        <div class="stats">
          <div class="stat-item">
            <span class="label">总计:</span>
            <span class="value">{{ statistics.total }}</span>
          </div>
          <div class="stat-item">
            <span class="label">成功:</span>
            <span class="value success">{{ statistics.success }}</span>
          </div>
          <div class="stat-item">
            <span class="label">失败:</span>
            <span class="value error">{{ statistics.failure }}</span>
          </div>
          <div class="stat-item">
            <span class="label">成功率:</span>
            <span class="value">{{ statistics.successRate.toFixed(1) }}%</span>
          </div>
          <div class="stat-item">
            <span class="label">总耗时:</span>
            <span class="value">{{ statistics.totalDuration }}ms</span>
          </div>
        </div>
      </div>

      <!-- 执行结果 -->
      <div class="section" v-if="results.length > 0">
        <h3>执行结果</h3>
        <div class="results">
          <div 
            v-for="(result, index) in results" 
            :key="index"
            class="result-item"
            :class="{ success: result.success, error: !result.success }"
          >
            <div class="result-header">
              <span class="result-id">{{ result.instructionID }}</span>
              <span class="result-status">{{ result.success ? '成功' : '失败' }}</span>
              <span class="result-duration">{{ result.duration }}ms</span>
            </div>
            <div v-if="result.error" class="result-error">
              {{ result.error }}
            </div>
          </div>
        </div>
        <div class="button-group">
          <button @click="exportResults" class="btn btn-secondary">
            导出结果
          </button>
        </div>
      </div>

      <!-- 日志区域 -->
      <div class="section">
        <div class="log-header">
          <h3>执行日志</h3>
          <button @click="clearLogs" class="btn btn-small">清空</button>
        </div>
        <div class="log-container">
          <div 
            v-for="(message, index) in logMessages" 
            :key="index"
            class="log-message"
          >
            {{ message }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crawler-popup {
  width: 500px;
  max-height: 600px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #6c757d;
  color: white;
}

.status.running {
  background: #28a745;
}

.content {
  padding: 16px;
  max-height: 500px;
  overflow-y: auto;
}

.section {
  margin-bottom: 20px;
}

.section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #333;
  font-weight: 600;
}

.instruction-input {
  width: 100%;
  height: 120px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  resize: vertical;
}

.button-group {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-warning {
  background: #ffc107;
  color: #212529;
}

.btn-warning:hover:not(:disabled) {
  background: #e0a800;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c82333;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #138496;
}

.btn-small {
  padding: 4px 8px;
  font-size: 11px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: #f8f9fa;
  border-radius: 4px;
}

.stat-item .label {
  font-weight: 500;
}

.stat-item .value.success {
  color: #28a745;
  font-weight: 600;
}

.stat-item .value.error {
  color: #dc3545;
  font-weight: 600;
}

.results {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.result-item {
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.result-item:last-child {
  border-bottom: none;
}

.result-item.success {
  background: #d4edda;
}

.result-item.error {
  background: #f8d7da;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.result-id {
  font-weight: 600;
}

.result-status {
  font-weight: 600;
}

.result-error {
  margin-top: 4px;
  font-size: 11px;
  color: #721c24;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.log-container {
  height: 150px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  background: #f8f9fa;
}

.log-message {
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 2px;
  font-family: 'Courier New', monospace;
}
</style>
