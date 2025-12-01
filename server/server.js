import { WebSocketServer } from 'ws';
import { saveResults, saveError } from './storage.js';

// 服务器配置
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// 存储连接的客户端信息
const clients = new Map();

/**
 * 验证登录信息
 * @param {any} profile - 节点配置信息
 * @returns {boolean} 是否验证通过
 */
function validateLogin(profile) {
    // 这里可以实现实际的验证逻辑
    // 目前简单验证必需字段是否存在
    if (!profile || typeof profile !== 'object') {
        return false;
    }

    const requiredFields = ['node_type', 'node_id', 'node_name', 'node_token'];
    return requiredFields.every(field => profile[field] && typeof profile[field] === 'string');
}

/**
 * 发送消息给客户端
 * @param {WebSocket} ws - WebSocket连接
 * @param {string} type - 消息类型
 * @param {any} data - 消息数据
 */
function sendMessage(ws, type, data) {
    if (ws.readyState === ws.OPEN) {
        const message = JSON.stringify({ type, data });
        ws.send(message);
    }
}

/**
 * 处理登录消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - 登录数据
 */
function handleLogin(ws, data) {
    const clientInfo = clients.get(ws);

    if (validateLogin(data)) {
        // 保存客户端信息
        clients.set(ws, {
            ...clientInfo,
            nodeId: data.node_id,
            nodeName: data.node_name,
            nodeType: data.node_type,
            isLoggedIn: true,
            loginTime: Date.now()
        });

        console.log(`[登录成功] 节点ID: ${data.node_id}, 节点名称: ${data.node_name}`);

        // 发送登录成功响应
        sendMessage(ws, 'login', {
            success: true,
            message: '登录成功',
            node_id: data.node_id
        });
    } else {
        console.log(`[登录失败] 无效的登录信息`);

        // 发送登录失败响应
        sendMessage(ws, 'login', {
            success: false,
            error: '无效的登录信息，缺少必需字段'
        });

        // 关闭连接
        ws.close(1008, 'Authentication failed');
    }
}

/**
 * 处理心跳消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - 心跳数据
 */
function handleHeartbeat(ws, data) {
    const clientInfo = clients.get(ws);

    if (clientInfo) {
        clientInfo.lastHeartbeat = Date.now();
        clients.set(ws, clientInfo);
    }

    // 可以发送心跳响应（可选）
    // sendMessage(ws, 'heartbeat', { timestamp: Date.now() });

    console.log(`[心跳] 节点ID: ${clientInfo?.nodeId || 'unknown'}, 时间戳: ${data?.timestamp || 'N/A'}`);
}

/**
 * 处理指令消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - 指令数据
 */
function handleInstructions(ws, data) {
    const clientInfo = clients.get(ws);

    if (!Array.isArray(data)) {
        console.warn(`[指令] 收到无效的指令数据（不是数组）`);
        sendMessage(ws, 'error', {
            type: 'invalid_instructions',
            message: '指令数据必须是数组'
        });
        return;
    }

    console.log(`[指令] 节点ID: ${clientInfo?.nodeId || 'unknown'}, 指令数量: ${data.length}`);

    // 这里可以处理指令，比如保存到数据库、转发给其他服务等
    // 目前只是记录日志
    if (data.length > 0) {
        console.log(`[指令] 第一条指令ID: ${data[0].instructionID || 'N/A'}, 类型: ${data[0].type || 'N/A'}`);
    }

    // 可以发送确认消息（可选）
    // sendMessage(ws, 'instructions', { received: true, count: data.length });
}

/**
 * 处理结果消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - 结果数据
 */
function handleResult(ws, data) {
    const clientInfo = clients.get(ws);
    const nodeId = clientInfo?.nodeId || 'unknown';

    if (!Array.isArray(data)) {
        console.warn(`[结果] 收到无效的结果数据（不是数组）`);
        return;
    }

    console.log(`[结果] 节点ID: ${nodeId}, 结果数量: ${data.length}`);

    try {
        // 保存结果到文件
        saveResults(data, nodeId);

        // 可以发送确认消息（可选）
        // sendMessage(ws, 'result', { saved: true, count: data.length });
    } catch (error) {
        console.error(`[结果] 保存结果失败:`, error);
        sendMessage(ws, 'error', {
            type: 'save_result_error',
            message: error.message
        });
    }
}

/**
 * 处理错误消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - 错误数据
 */
function handleError(ws, data) {
    const clientInfo = clients.get(ws);
    const nodeId = clientInfo?.nodeId || 'unknown';

    console.error(`[错误] 节点ID: ${nodeId}, 错误类型: ${data?.type || 'unknown'}, 消息: ${data?.message || JSON.stringify(data)}`);

    try {
        // 保存错误到文件
        saveError(data, nodeId);
    } catch (error) {
        console.error(`[错误] 保存错误失败:`, error);
    }
}

/**
 * 处理标签页消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - 标签页数据
 */
function handleTabs(ws, data) {
    const clientInfo = clients.get(ws);

    // 更新客户端标签页信息
    if (clientInfo) {
        clientInfo.tabs = Array.isArray(data) ? data : [data];
        clients.set(ws, clientInfo);
    }

    const tabCount = Array.isArray(data) ? data.length : (data ? 1 : 0);
    console.log(`[标签页] 节点ID: ${clientInfo?.nodeId || 'unknown'}, 标签页数量: ${tabCount}`);

    // 可以发送确认消息（可选）
    // sendMessage(ws, 'tabs', { received: true, count: tabCount });
}

/**
 * 处理CDP消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {any} data - CDP响应数据
 */
function handleCDP(ws, data) {
    const clientInfo = clients.get(ws);

    // CDP消息可能是单个响应或批量响应
    const isBatch = Array.isArray(data);
    const responses = isBatch ? data : [data];

    console.log(`[CDP] 节点ID: ${clientInfo?.nodeId || 'unknown'}, 响应数量: ${responses.length}`);

    // 记录CDP响应信息
    responses.forEach((response, index) => {
        if (response.error) {
            console.error(`[CDP] 响应 ${index + 1} 错误:`, response.error);
        } else {
            console.log(`[CDP] 响应 ${index + 1} 成功, ID: ${response.id || 'N/A'}`);
        }
    });

    // 可以发送确认消息（可选）
    // sendMessage(ws, 'cdp', { received: true, count: responses.length });
}

/**
 * 处理WebSocket消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {string} message - 消息字符串
 */
function handleMessage(ws, message) {
    try {
        const parsed = JSON.parse(message);

        if (!parsed || typeof parsed !== 'object' || !parsed.type) {
            console.warn(`[消息] 收到格式无效的消息:`, message.substring(0, 100));
            return;
        }

        const { type, data } = parsed;

        switch (type) {
            case 'login':
                handleLogin(ws, data);
                break;

            case 'heartbeat':
                handleHeartbeat(ws, data);
                break;

            case 'instructions':
                handleInstructions(ws, data);
                break;

            case 'result':
                handleResult(ws, data);
                break;

            case 'error':
                handleError(ws, data);
                break;

            case 'tabs':
                handleTabs(ws, data);
                break;

            case 'cdp':
                handleCDP(ws, data);
                break;

            default:
                console.warn(`[消息] 未知消息类型: ${type}`);
        }
    } catch (error) {
        console.error(`[消息] 解析消息失败:`, error.message);
        console.error(`[消息] 原始消息:`, message.substring(0, 200));

        // 发送解析错误响应
        sendMessage(ws, 'error', {
            type: 'parse_error',
            message: error.message
        });
    }
}

// 创建WebSocket服务器
const wss = new WebSocketServer({
    port: PORT,
    host: HOST
});

console.log(`WebSocket服务器启动在 ${HOST}:${PORT}`);

// 处理新连接
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[连接] 新客户端连接: ${clientIp}`);

    // 初始化客户端信息
    clients.set(ws, {
        ip: clientIp,
        connectTime: Date.now(),
        isLoggedIn: false,
        lastHeartbeat: null
    });

    // 处理消息
    ws.on('message', (message) => {
        handleMessage(ws, message.toString());
    });

    // 处理错误
    ws.on('error', (error) => {
        console.error(`[错误] 客户端 ${clientIp} 连接错误:`, error.message);
    });

    // 处理关闭
    ws.on('close', (code, reason) => {
        const clientInfo = clients.get(ws);
        console.log(`[断开] 客户端断开: ${clientIp}, 节点ID: ${clientInfo?.nodeId || 'unknown'}, 代码: ${code}, 原因: ${reason.toString()}`);
        clients.delete(ws);
    });
});

// 处理服务器错误
wss.on('error', (error) => {
    console.error(`[服务器错误]:`, error);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n[关闭] 正在关闭服务器...');

    // 关闭所有连接
    wss.clients.forEach((ws) => {
        ws.close(1001, 'Server shutting down');
    });

    // 关闭服务器
    wss.close(() => {
        console.log('[关闭] 服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[关闭] 正在关闭服务器...');

    wss.clients.forEach((ws) => {
        ws.close(1001, 'Server shutting down');
    });

    wss.close(() => {
        console.log('[关闭] 服务器已关闭');
        process.exit(0);
    });
});

