<template>
  <div class="app">
    <header class="header">
      <h1>SemiAutoJs</h1>
      <p class="subtitle">Web自动化爬虫扩展</p>
    </header>

    <nav class="tabs">
      <button v-for="tab in tabs" :key="tab.id" :class="['tab-button', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </nav>

    <main class="content">
      <NodeConfig v-if="activeTab === 'node'" />
      <InstructionConfig v-if="activeTab === 'instruction'" />
      <ExecutionControl v-if="activeTab === 'control'" />
      <ExecutionLog v-if="activeTab === 'log'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import NodeConfig from './components/NodeConfig.vue';
import InstructionConfig from './components/InstructionConfig.vue';
import ExecutionControl from './components/ExecutionControl.vue';
import ExecutionLog from './components/ExecutionLog.vue';

const activeTab = ref('node');

const tabs = [
  { id: 'node', label: '节点配置' },
  { id: 'instruction', label: '指令配置' },
  { id: 'control', label: '执行控制' },
  { id: 'log', label: '执行日志' }
];
</script>

<style scoped>
.app {
  width: 100%;
  min-width: 400px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.header {
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  flex-shrink: 0;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
}

.subtitle {
  margin: 5px 0 0 0;
  font-size: 12px;
  opacity: 0.9;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  background: #f5f5f5;
  flex-shrink: 0;
}

.tab-button {
  flex: 1;
  padding: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: all 0.3s;
}

.tab-button:hover {
  background: #e8e8e8;
}

.tab-button.active {
  color: #667eea;
  border-bottom: 2px solid #667eea;
  background: white;
}

.content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  /* 确保flex布局正确计算高度 */
}
</style>