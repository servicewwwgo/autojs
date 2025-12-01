import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保数据目录存在
const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
const ERRORS_DIR = path.join(DATA_DIR, 'errors');

// 初始化目录
function ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(RESULTS_DIR)) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    if (!fs.existsSync(ERRORS_DIR)) {
        fs.mkdirSync(ERRORS_DIR, { recursive: true });
    }
}

// 获取时间戳文件名
function getTimestampFilename(prefix = 'data') {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${prefix}-${dateStr}.json`;
}

/**
 * 保存结果数据
 * @param {any} results - 结果数据
 * @param {string} nodeId - 节点ID（可选）
 */
export function saveResults(results, nodeId = 'unknown') {
    ensureDirectories();

    try {
        const filename = getTimestampFilename(`result-${nodeId}`);
        const filepath = path.join(RESULTS_DIR, filename);

        const data = {
            timestamp: Date.now(),
            nodeId: nodeId,
            results: results
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`结果已保存到: ${filepath}`);
        return filepath;
    } catch (error) {
        console.error('保存结果失败:', error);
        throw error;
    }
}

/**
 * 保存错误数据
 * @param {any} error - 错误数据
 * @param {string} nodeId - 节点ID（可选）
 */
export function saveError(error, nodeId = 'unknown') {
    ensureDirectories();

    try {
        const filename = getTimestampFilename(`error-${nodeId}`);
        const filepath = path.join(ERRORS_DIR, filename);

        const data = {
            timestamp: Date.now(),
            nodeId: nodeId,
            error: error
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`错误已保存到: ${filepath}`);
        return filepath;
    } catch (error) {
        console.error('保存错误失败:', error);
        throw error;
    }
}

// 初始化目录
ensureDirectories();

