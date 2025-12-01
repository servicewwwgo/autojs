<template>
    <div class="instruction-config">
        <h2>指令配置</h2>

        <div class="form-group">
            <label>选择标签页</label>
            <select v-model="selectedTabId" class="select">
                <option value="">请选择标签页</option>
                <option v-for="tab in tabs" :key="tab.tabId" :value="tab.tabId">
                    {{ tab.url }} (ID: {{ tab.tabId }})
                </option>
            </select>
            <button @click="loadTabs" class="btn btn-small">刷新标签页</button>
        </div>

        <div class="form-group">
            <label>指令集 (JSON格式)</label>
            <textarea v-model="instructionsJson" class="textarea" rows="15" placeholder='请输入指令集JSON，例如：
  [
    {
      "type": "navigate",
      "tabId": 123,
      "instructionID": "inst1",
      "url": "https://example.com",
      "created_at": 1234567890
    },
    {
      "type": "find_element",
      "tabId": 123,
      "instructionID": "inst2",
      "selector": "#search",
      "selectorType": "css",
      "name": "searchInput",
      "created_at": 1234567890
    }
  ]'></textarea>
        </div>

        <div class="actions">
            <button @click="validateJson" class="btn btn-secondary">验证JSON</button>
            <button @click="sendInstructions" class="btn btn-primary">发送指令</button>
            <button @click="loadExample" class="btn btn-secondary">加载示例</button>
        </div>

        <div v-if="message" :class="['message', messageType]">
            {{ message }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { BackgroundScriptMessageType, TabInfo } from '../../../types';
import { SendMessageToBackgroundScript } from '../../../utils';

import { example } from '../../../example';

const selectedTabId = ref<number | ''>('');
const instructionsJson = ref('');
const tabs = ref<Array<{ tabId: number; url: string }>>([]);
const message = ref('');
const messageType = ref<'success' | 'error'>('success');

const loadTabs = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'get_tabs'
        } as BackgroundScriptMessageType);

        if (response.success) {
            tabs.value = response.data.map((tab: TabInfo) => ({
                tabId: tab.tabId,
                url: tab.url || 'about:blank'
            }));
            showMessage('加载标签页成功', 'success');
        }
        else {
            showMessage('加载标签页失败: ' + (response.error || '未知错误'), 'error');
        }

    } catch (error) {
        showMessage('加载标签页失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const validateJson = () => {
    try {
        const parsed = JSON.parse(instructionsJson.value);

        if (Array.isArray(parsed)) {
            showMessage(`验证成功，共 ${parsed.length as number} 条指令`, 'success');
        } else {
            showMessage('JSON格式错误：必须是数组', 'error');
        }
    } catch (error) {
        showMessage('JSON格式错误: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const sendInstructions = async () => {
    try {
        if (!selectedTabId.value) {
            throw new Error('请先选择标签页');
        }

        // 验证JSON格式，但不解析
        const parsed = JSON.parse(instructionsJson.value);

        if (!Array.isArray(parsed)) {
            throw new Error('JSON格式错误：必须是数组');
        }

        const tabId = selectedTabId.value as number;
        const instructionsJsonString = instructionsJson.value as string;

        // 直接发送JSON字符串，不进行反序列化
        const response = await SendMessageToBackgroundScript({
            type: 'add_instructions',
            params: {
                tabId: tabId,
                instructionsJsonString: instructionsJsonString
            }
        } as BackgroundScriptMessageType);

        if (response.success) {
            showMessage(`成功发送 ${response.count as number} 条指令`, 'success');
        }
    } catch (error) {
        showMessage('发送指令失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const showMessage = (msg: string, type: 'success' | 'error') => {
    message.value = msg;
    messageType.value = type;
    setTimeout(() => {
        message.value = '';
    }, 5000);
};

const loadExample = () => {

    // 將 example 對象中，所有的子對象 tabId 設置為 當前選擇的 tabId, 遞歸處理
    const setTabId = (obj: any) => {
        if (obj.tabId) {
            obj.tabId = selectedTabId.value as number;
        }
        if (Array.isArray(obj)) {
            obj.forEach(setTabId);
        }
    };

    setTabId(example);

    instructionsJson.value = JSON.stringify(example, null, 2);
    showMessage(`已加载 ${example.length} 个测试用例，包含所有指令类型`, 'success');
};

onMounted(() => {
    loadTabs();
});

</script>

<style scoped>
.instruction-config {
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

.select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.textarea {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    resize: vertical;
}

.actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.btn {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.btn-small {
    padding: 6px 12px;
    font-size: 12px;
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