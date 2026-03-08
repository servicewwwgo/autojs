<template>
    <div class="ws-log">
        <div class="header-actions">
            <h2>WebSocket 日志</h2>
            <div class="actions">
                <button @click="clearLogs" class="btn btn-danger">清空</button>
            </div>
        </div>

        <div class="filter">
            <label>
                <input v-model="filterDirection" type="radio" value="all" />
                全部
            </label>
            <label>
                <input v-model="filterDirection" type="radio" value="sent" />
                发送
            </label>
            <label>
                <input v-model="filterDirection" type="radio" value="received" />
                接收
            </label>
        </div>

        <div class="log-list">
            <div v-for="(entry, index) in filteredLogs" :key="`${entry.timestamp}-${index}`"
                :class="['log-item', entry.direction]">
                <div class="log-header" @click="toggleExpand(entry.timestamp)">
                    <span class="log-direction">{{ entry.direction === 'sent' ? '↑ 发送' : '↓ 接收' }}</span>
                    <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
                    <span class="log-toggle">{{ expanded.has(entry.timestamp) ? '▼' : '▶' }}</span>
                </div>
                <div v-show="expanded.has(entry.timestamp)" class="log-raw">
                    <pre>{{ entry.raw }}</pre>
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
import { BackgroundScriptMessageType, WSLogEntry } from '../../../types';
import { SendMessageToBackgroundScript, OutputLogToFile, LogLevel } from '../../../utils';

const WS_LOG_POLL_INTERVAL_MS = 2000;

let pollTimer: ReturnType<typeof setInterval> | null = null;

const logs = ref<WSLogEntry[]>([]);
const filterDirection = ref<'all' | 'sent' | 'received'>('all');
const expanded = ref<Set<number>>(new Set());

const filteredLogs = computed(() => {
    let list = logs.value;
    if (filterDirection.value !== 'all') {
        list = list.filter((e) => e.direction === filterDirection.value);
    }
    return [...list].reverse();
});

function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function toggleExpand(ts: number): void {
    const next = new Set(expanded.value);
    if (next.has(ts)) {
        next.delete(ts);
    } else {
        next.add(ts);
    }
    expanded.value = next;
}

const loadLogs = async () => {
    try {
        const response = await SendMessageToBackgroundScript({
            type: 'get_ws_logs'
        } as BackgroundScriptMessageType);

        if (response?.success && Array.isArray(response.data)) {
            logs.value = response.data as WSLogEntry[];
        }
    } catch (error) {
        OutputLogToFile(`[ExecutionLog] Failed to load WS logs: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
    }
};

const clearLogs = async () => {
    if (confirm('确定要清空 WebSocket 日志吗？')) {
        try {
            const response = await SendMessageToBackgroundScript({
                type: 'clear_ws_logs'
            } as BackgroundScriptMessageType);

            if (response?.success) {
                logs.value = [];
            }
        } catch (error) {
            OutputLogToFile(`[ExecutionLog] Failed to clear WS logs: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
        }
    }
};

onMounted(() => {
    loadLogs();
    pollTimer = setInterval(loadLogs, WS_LOG_POLL_INTERVAL_MS);
});

onUnmounted(() => {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
    }
});
</script>

<style scoped>
.ws-log {
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

.log-item.sent {
    border-left: 4px solid #667eea;
}

.log-item.received {
    border-left: 4px solid #28a745;
}

.log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    cursor: pointer;
}

.log-direction {
    font-weight: bold;
    font-size: 14px;
}

.log-item.sent .log-direction {
    color: #667eea;
}

.log-item.received .log-direction {
    color: #28a745;
}

.log-time {
    font-size: 12px;
    color: #666;
    font-family: 'Courier New', monospace;
}

.log-toggle {
    font-size: 12px;
    color: #999;
}

.log-raw {
    margin-top: 8px;
    padding: 8px;
    background: #f5f5f5;
    border-radius: 4px;
}

.log-raw pre {
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
