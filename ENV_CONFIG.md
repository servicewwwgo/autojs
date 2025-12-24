# 环境变量配置说明

## 概述

本项目使用环境变量来管理需要经常更改的配置项。环境变量文件位于项目根目录 `autojs/` 下。

## 快速开始

### 1. 创建环境变量文件

复制模板文件创建你的 `.env` 文件：

```bash
# Windows PowerShell
Copy-Item .env.example .env

# 或者手动创建 .env 文件
```

### 2. 编辑 `.env` 文件

打开 `.env` 文件，根据你的需求修改配置：

```env
# WebSocket 连接配置
# 默认 WebSocket 服务器地址
VITE_WEBSOCKET_CONN_URL=ws://localhost:8000/ws

# 调试模式
# 设置为 true 启用调试日志，false 禁用
VITE_DEBUG_MODE=true
```

## 配置项说明

### VITE_WEBSOCKET_CONN_URL

- **类型**: 字符串
- **说明**: WebSocket 服务器的连接地址
- **默认值**: `ws://localhost:8000/ws`
- **示例**:

  ```env
  # 本地开发环境
  VITE_WEBSOCKET_CONN_URL=ws://localhost:8000/ws

  # 测试环境
  VITE_WEBSOCKET_CONN_URL=ws://test.caiyisong.net:8000/ws

  # 生产环境
  VITE_WEBSOCKET_CONN_URL=wss://api.example.com/ws
  ```

### VITE_DEBUG_MODE

- **类型**: 布尔值（字符串形式）
- **说明**: 控制是否启用调试日志输出
- **默认值**: `true`（如果未设置）
- **有效值**:
  - `true` - 启用调试日志
  - `false` - 禁用调试日志
- **示例**:

  ```env
  # 开发环境 - 启用调试
  VITE_DEBUG_MODE=true

  # 生产环境 - 禁用调试
  VITE_DEBUG_MODE=false
  ```

## 不同环境的配置

WXT/Vite 支持多个环境变量文件，按优先级从高到低：

1. `.env.[mode].local` - 本地环境特定配置（不会被 Git 跟踪）
2. `.env.local` - 本地环境配置（不会被 Git 跟踪）
3. `.env.[mode]` - 特定模式配置（如 `.env.development`, `.env.production`）
4. `.env` - 默认配置

### 开发环境配置示例

创建 `.env.development` 文件：

```env
VITE_WEBSOCKET_CONN_URL=ws://localhost:8000/ws
VITE_DEBUG_MODE=true
```

### 生产环境配置示例

创建 `.env.production` 文件：

```env
VITE_WEBSOCKET_CONN_URL=wss://api.example.com/ws
VITE_DEBUG_MODE=false
```

## 重要提示

1. **不要提交 `.env` 文件**: `.env` 文件已添加到 `.gitignore`，不会被提交到 Git 仓库
2. **提交 `.env.example`**: `.env.example` 文件应该提交到 Git，作为配置模板
3. **环境变量前缀**: 在 WXT/Vite 中，只有以 `VITE_` 开头的环境变量才能在客户端代码中通过 `import.meta.env` 访问
4. **修改后重启**: 修改 `.env` 文件后，需要重启开发服务器才能生效

## 验证配置

配置完成后，可以在代码中通过以下方式访问：

```typescript
import { WEBSOCKET_CONN_URL, DEBUG_MODE } from "./consts";

console.log("WebSocket URL:", WEBSOCKET_CONN_URL);
console.log("Debug Mode:", DEBUG_MODE);
```

## 故障排除

### 配置不生效

1. 确保环境变量以 `VITE_` 开头
2. 确保 `.env` 文件在项目根目录 `autojs/` 下
3. 重启开发服务器：`npm run dev`
4. 检查 `.env` 文件格式是否正确（没有多余的空格，每行一个变量）

### 类型错误

如果遇到 TypeScript 类型错误，确保 `src/vite-env.d.ts` 文件存在并包含正确的类型定义。
