<template>
    <div class="execution-log">
        <div class="header-actions">
            <h2>执行日志</h2>
            <div class="actions">
                <button @click="loadLogs" class="btn btn-secondary">刷新</button>
                <button @click="clearLogs" class="btn btn-danger">清空</button>
                <button @click="sendToServer" class="btn btn-primary">发送到服务器</button>
            </div>
        </div>

        <div class="filter">
            <label>
                <input v-model="filterSuccess" type="checkbox" />
                仅显示成功
            </label>
            <label>
                <input v-model="filterError" type="checkbox" />
                仅显示失败
            </label>
        </div>

        <div class="log-list">
            <div v-for="result in filteredLogs" :key="result.instructionID"
                :class="['log-item', result.success ? 'success' : 'error']">
                <div class="log-header">
                    <span class="log-id">{{ result.instructionID }}</span>
                    <span :class="['log-status', result.success ? 'success' : 'error']">
                        {{ result.success ? '✓ 成功' : '✗ 失败' }}
                    </span>
                    <span class="log-duration">{{ result.duration }}ms</span>
                </div>
                <div v-if="result.error" class="log-error">
                    {{ result.error }}
                </div>
                <div v-if="result.data" class="log-data">
                    <pre>{{ JSON.stringify(result.data, null, 2) }}</pre>
                </div>
            </div>
            <div v-if="filteredLogs.length === 0" class="empty">
                暂无日志
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { BackgroundScriptMessageType, InstructionResult } from '../../../types';
import { SendMessageToBackgroundScript, OutputLogToFile, LogLevel } from '../../../utils';

let logInterval: number | null = null;

const logs = ref<InstructionResult[]>([]);
const filterSuccess = ref(false);
const filterError = ref(false);

const filteredLogs = computed(() => {
    let filtered = logs.value;
    if (filterSuccess.value) {
        filtered = filtered.filter(log => log.success);
    }
    if (filterError.value) {
        filtered = filtered.filter(log => !log.success);
    }
    return filtered.reverse(); // 最新的在前
});

const loadLogs = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'get_results'
        } as BackgroundScriptMessageType);

        if (response.success) {
            logs.value = response.data as InstructionResult[];
        }
    } catch (error) {
        OutputLogToFile(`[ExecutionLog] Failed to load logs: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
    }
};

const clearLogs = async () => {
    if (confirm('确定要清空所有日志吗？')) {
        try {
            const response = await SendMessageToBackgroundScript({
                type: 'clear_results'
            } as BackgroundScriptMessageType);

            if (response.success) {
                logs.value = [] as InstructionResult[];
            }
        } catch (error) {
            OutputLogToFile(`[ExecutionLog] Failed to clear logs: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        }
    }
};

const sendToServer = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'send_results_to_server'
        } as BackgroundScriptMessageType);

        if (response.success) {
            alert('日志已发送到服务器');
        } else {
            alert('发送失败: ' + response.error);
        }
    } catch (error) {
        alert('发送失败: ' + (error instanceof Error ? error.message : String(error)));
    }
};

onMounted(() => {
    // 定期刷新日志
    logInterval = setInterval(() => {
        loadLogs().catch((error) => {
            OutputLogToFile(`[ExecutionLog] Failed to refresh logs: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        });
    }, 2000) as any;
});

onUnmounted(() => {
    if (logInterval !== null) {
        clearInterval(logInterval);
    }
});
</script>

<style scoped>
.execution-log {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

h2 {
    margin: 0;
    font-size: 18px;
    color: #333;
}

.actions {
    display: flex;
    gap: 10px;
}

.btn {
    padding: 8px 16px;
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

.btn-danger {
    background: #dc3545;
    color: white;
}

.btn-danger:hover {
    background: #c82333;
}

.filter {
    display: flex;
    gap: 16px;
    padding: 12px;
    background: #f5f5f5;
    border-radius: 4px;
}

.filter label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    cursor: pointer;
}

.log-list {
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.log-item {
    padding: 12px;
    border-radius: 4px;
    border: 1px solid #ddd;
    background: white;
}

.log-item.success {
    border-left: 4px solid #28a745;
}

.log-item.error {
    border-left: 4px solid #dc3545;
}

.log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.log-id {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #666;
}

.log-status {
    font-weight: bold;
    font-size: 14px;
}

.log-status.success {
    color: #28a745;
}

.log-status.error {
    color: #dc3545;
}

.log-duration {
    font-size: 12px;
    color: #999;
}

.log-error {
    padding: 8px;
    background: #f8d7da;
    color: #721c24;
    border-radius: 4px;
    font-size: 13px;
    margin-top: 8px;
}

.log-data {
    margin-top: 8px;
    padding: 8px;
    background: #f5f5f5;
    border-radius: 4px;
}

.log-data pre {
    margin: 0;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.empty {
    text-align: center;
    padding: 40px;
    color: #999;
    font-size: 14px;
}
</style>