<template>
  <div class="node-config">
    <h2>节点配置</h2>

    <div class="form-group">
      <label>节点类型</label>
      <input v-model="profile.node_type" type="text" disabled class="input" />
      <small>节点类型固定为 crawler</small>
    </div>

    <div class="form-group">
      <label>节点ID</label>
      <input v-model="profile.node_id" type="text" disabled class="input" />
      <small>节点ID自动生成，不可修改</small>
    </div>

    <div class="form-group">
      <label>节点名称</label>
      <input v-model="profile.node_name" type="text" class="input" placeholder="请输入节点名称" />
    </div>

    <div class="form-group">
      <label>节点令牌</label>
      <input v-model="profile.node_token" type="text" class="input" placeholder="请输入节点令牌" />
    </div>

    <div class="actions">
      <button @click="loadProfile" class="btn btn-secondary">刷新</button>
      <button @click="saveProfile" class="btn btn-primary">保存</button>
    </div>

    <div v-if="message" :class="['message', messageType]">
      {{ message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { BackgroundScriptMessageType, NodeProfile } from '../../../types';
import { SendMessageToBackgroundScript } from '../../../utils';

const profile = ref<NodeProfile>({
  node_type: 'crawler',
  node_id: '',
  node_name: '',
  node_token: ''
});

const message = ref('');
const messageType = ref<'success' | 'error'>('success');

const loadProfile = async () => {
  try {
    const response = await SendMessageToBackgroundScript({
      type: 'get_node_profile'
    } as BackgroundScriptMessageType);

    if (response.success) {
      profile.value = response.data;
      showMessage('配置加载成功', 'success');
    } else {
      showMessage('加载配置失败: ' + response.error, 'error');
    }
  } catch (error) {
    showMessage('加载配置失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  }
};

const saveProfile = async () => {
  try {

    const response = await SendMessageToBackgroundScript({
      type: 'update_node_profile',
      params: {
        node_name: profile.value.node_name as string,
        node_token: profile.value.node_token as string
      }
    } as BackgroundScriptMessageType);

    if (response.success) {
      showMessage('配置保存成功', 'success');
    } else {
      showMessage('保存配置失败: ' + response.error, 'error');
    }
  } catch (error) {
    showMessage('保存配置失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  }
};

const showMessage = (msg: string, type: 'success' | 'error') => {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
};

onMounted(() => {
  loadProfile();
});
</script>

<style scoped>
.node-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h2 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #333;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-size: 14px;
  font-weight: 500;
  color: #555;
}

.input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.input:disabled {
  background: #f5f5f5;
  color: #999;
}

small {
  font-size: 12px;
  color: #999;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-secondary:hover {
  background: #d0d0d0;
}

.message {
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
</style>