<template>
    <div class="execution-control">
        <h2>执行控制</h2>

        <div class="section">
            <h3>WebSocket连接</h3>
            <div class="form-group">
                <label>WebSocket URL</label>
                <input v-model="wsUrl" type="text" class="input" placeholder="ws://localhost:8080" />
            </div>
            <div class="actions">
                <button @click="testConnection" class="btn btn-secondary">测试连接</button>
                <button v-if="!isConnected" @click="connect" class="btn btn-primary">
                    连接
                </button>
                <button v-else @click="disconnect" class="btn btn-danger">
                    断开
                </button>
            </div>
            <div v-if="connectionStatus" :class="['status', connectionStatusType]">
                {{ connectionStatus }}
            </div>
        </div>

        <div class="section">
            <h3>指令执行</h3>
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
            <div class="actions">
                <button @click="startExecution" :disabled="!selectedTabId || executorStatus.isRunning"
                    class="btn btn-primary">
                    开始执行
                </button>
                <button @click="pauseExecution" :disabled="!executorStatus.isRunning || executorStatus.isPaused"
                    class="btn btn-warning">
                    暂停
                </button>
                <button @click="stopExecution" :disabled="!executorStatus.isRunning" class="btn btn-danger">
                    停止
                </button>
                <button @click="loadStatus" class="btn btn-secondary">刷新状态</button>
            </div>
        </div>

        <div class="section">
            <h3>执行状态</h3>
            <div class="status-info">
                <div class="status-item">
                    <span class="label">运行状态:</span>
                    <span :class="['value', executorStatus.isRunning ? 'running' : 'stopped']">
                        {{ executorStatus.isRunning ? '运行中' : '已停止' }}
                    </span>
                </div>
                <div class="status-item">
                    <span class="label">暂停状态:</span>
                    <span :class="['value', executorStatus.isPaused ? 'paused' : '']">
                        {{ executorStatus.isPaused ? '已暂停' : '未暂停' }}
                    </span>
                </div>
                <div class="status-item">
                    <span class="label">已执行:</span>
                    <span class="value">{{ executorStatus.executedCount }}</span>
                </div>
                <div class="status-item">
                    <span class="label">成功:</span>
                    <span class="value success">{{ executorStatus.successCount }}</span>
                </div>
                <div class="status-item">
                    <span class="label">失败:</span>
                    <span class="value error">{{ executorStatus.errorCount }}</span>
                </div>
            </div>
        </div>
        <div v-if="message" :class="['message', messageType]">
            {{ message }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { BackgroundScriptMessageType, ExecutorStatus, TabInfo } from '../../../types';
import { SendMessageToBackgroundScript } from '../../../utils';

const wsUrl = ref('ws://localhost:8080');
const message = ref('');
const messageType = ref<'success' | 'error'>('success');
const isConnected = ref(false);
const selectedTabId = ref<number | ''>('');
const tabs = ref<Array<{ tabId: number; url: string }>>([]);
const connectionStatus = ref('');
const connectionStatusType = ref<'success' | 'error' | 'info'>('info');
const executorStatus = ref<ExecutorStatus>({
    stopRequested: false,
    isRunning: false,
    isPaused: false,
    executedCount: 0,
    successCount: 0,
    errorCount: 0,
    startTime: null as number | null
});

let statusInterval: number | null = null;

const loadTabs = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'get_tabs'
        } as BackgroundScriptMessageType);

        if (response.success) {
            tabs.value = response.data?.map((tab: TabInfo) => ({
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

const testConnection = async () => {
    try {
        connectionStatus.value = '正在测试连接...';
        connectionStatusType.value = 'info';
        const response = await SendMessageToBackgroundScript({
            type: 'test_websocket',
            params: { url: wsUrl.value }
        } as BackgroundScriptMessageType);

        if (response.success) {
            if (response.data?.connected) {
                connectionStatus.value = '连接测试成功';
                connectionStatusType.value = 'success';
            } else {
                connectionStatus.value = '连接测试失败';
                connectionStatusType.value = 'error';
            }
        } else {
            connectionStatus.value = '测试失败: ' + response.error;
            connectionStatusType.value = 'error';
        }
    } catch (error) {
        connectionStatus.value = '测试失败: ' + (error instanceof Error ? error.message : String(error));
        connectionStatusType.value = 'error';
    }
};

const connect = async () => {
    try {
        connectionStatus.value = '正在连接...';
        connectionStatusType.value = 'info';
        const response = await SendMessageToBackgroundScript({
            type: 'connect_websocket',
            params: { url: wsUrl.value as string }
        } as BackgroundScriptMessageType);

        if (response.success) {
            isConnected.value = true;
            connectionStatus.value = '连接成功';
            connectionStatusType.value = 'success';
        } else {
            connectionStatus.value = '连接失败: ' + response.error;
            connectionStatusType.value = 'error';
        }
    } catch (error) {
        connectionStatus.value = '连接失败: ' + (error instanceof Error ? error.message : String(error));
        connectionStatusType.value = 'error';
    }
};

const disconnect = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'disconnect_websocket'
        } as BackgroundScriptMessageType);

        if (response.success) {
            isConnected.value = false;
            connectionStatus.value = '已断开连接';
            connectionStatusType.value = 'info';
        }
    } catch (error) {
        showMessage('断开连接失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const startExecution = async () => {

    try {
        if (!selectedTabId.value) {
            throw new Error('请选择标签页');
        }

        const response = await SendMessageToBackgroundScript({
            type: 'execute_instructions',
            params: { tabId: selectedTabId.value as number }
        } as BackgroundScriptMessageType);
        if (response.success) {
            await loadStatus();
        }
    } catch (error) {
        showMessage('开始执行失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const pauseExecution = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'pause_execution'
        } as BackgroundScriptMessageType);

        if (response.success) {
            await loadStatus();
        }
    } catch (error) {
        showMessage('暂停执行失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const stopExecution = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'stop_execution'
        } as BackgroundScriptMessageType);

        if (response.success) {
            await loadStatus();
        }
    } catch (error) {
        showMessage('停止执行失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

const loadStatus = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'get_executor_status'
        } as BackgroundScriptMessageType);

        if (response.success) {
            executorStatus.value = response.data;
        }
    } catch (error) {
        showMessage('加载状态失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
};

onMounted(() => {
    loadTabs();
    loadStatus();
    statusInterval = setInterval(() => {
        if (executorStatus.value.isRunning) {
            loadStatus();
        }
    }, 1000) as any;
});

onUnmounted(() => {
    if (statusInterval !== null) {
        clearInterval(statusInterval);
    }
});

const showMessage = (msg: string, type: 'success' | 'error') => {
    message.value = msg;
    messageType.value = type;
    setTimeout(() => {
        message.value = '';
    }, 5000);
};

</script>

<style scoped>
.execution-control {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #333;
}

h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #555;
}

.section {
    padding: 16px;
    background: #f9f9f9;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
}

label {
    font-size: 14px;
    font-weight: 500;
    color: #555;
}

.input,
.select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
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

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-small {
    padding: 6px 12px;
    font-size: 12px;
}

.btn-primary {
    background: #667eea;
    color: white;
}

.btn-primary:hover:not(:disabled) {
    background: #5568d3;
}

.btn-secondary {
    background: #e0e0e0;
    color: #333;
}

.btn-secondary:hover:not(:disabled) {
    background: #d0d0d0;
}

.btn-danger {
    background: #dc3545;
    color: white;
}

.btn-danger:hover:not(:disabled) {
    background: #c82333;
}

.btn-warning {
    background: #ffc107;
    color: #333;
}

.btn-warning:hover:not(:disabled) {
    background: #e0a800;
}

.status {
    padding: 10px;
    border-radius: 4px;
    font-size: 14px;
    margin-top: 10px;
}

.status.success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
}

.status.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
}

.status.info {
    background: #d1ecf1;
    color: #0c5460;
    border: 1px solid #bee5eb;
}

.status-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.status-item {
    display: flex;
    justify-content: space-between;
    padding: 8px;
    background: white;
    border-radius: 4px;
}

.label {
    font-weight: 500;
    color: #666;
}

.value {
    font-weight: bold;
}

.value.running {
    color: #28a745;
}

.value.stopped {
    color: #6c757d;
}

.value.paused {
    color: #ffc107;
}

.value.success {
    color: #28a745;
}

.value.error {
    color: #dc3545;
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