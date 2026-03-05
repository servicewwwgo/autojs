# CDP JSON 数据结构文档

本文档描述了通过 WebSocket 发送的 CDP（Chrome DevTools Protocol）消息所需的 JSON 数据结构。

## CDP 消息类型汇总

本系统支持以下 17 种 CDP 消息类型：

| 序号 | 消息类型                        | type 值                   | 说明                 |
| ---- | ------------------------------- | ------------------------- | -------------------- |
| 1    | CdpConnectMessage               | `cdp_connect`             | 建立 CDP 连接        |
| 2    | CdpDisconnectMessage            | `cdp_disconnect`          | 断开 CDP 连接        |
| 3    | CdpListTargetsMessage           | `list_targets`            | 列出所有标签页目标   |
| 4    | CdpExecuteJavaScriptMessage     | `execute_javascript`      | 执行 JavaScript 代码 |
| 5    | CdpTakeElementScreenshotMessage | `take_element_screenshot` | 元素截图             |
| 6    | CdpSendCommandMessage           | `send_command`            | 发送 CDP 命令        |
| 7    | CdpGrepSourceMessage            | `grep_source`             | 搜索页面源码         |
| 8    | CdpGetNetworkLogsMessage        | `get_network_logs`        | 获取网络日志         |
| 9    | CdpInitNetworkLogsMessage       | `init_network_logs`       | 初始化网络日志收集   |
| 10   | CdpCloseNetworkLogsMessage      | `close_network_logs`      | 关闭网络日志收集     |
| 11   | CdpGetConsoleLogsMessage        | `get_console_logs`        | 获取控制台日志       |
| 12   | CdpInitConsoleLogsMessage       | `init_console_logs`       | 初始化控制台日志收集 |
| 13   | CdpCloseConsoleLogsMessage      | `close_console_logs`      | 关闭控制台日志收集   |
| 14   | CdpCreateTabAndNavigateMessage  | `create_tab_and_navigate` | 创建标签页并导航     |
| 15   | CdpUpdateNodeNameMessage        | `update_node_name`        | 更新节点名称         |
| 16   | CdpCloseTabMessage              | `close_tab`               | 关闭标签页           |

---

## 基础字段（所有消息共有）

所有 CDP 消息都继承自 `CdpMessage`，包含以下基础字段：

```json
{
  "type": "消息类型", // 必需 - 消息类型（string）
  "id": "unique-id", // 必需 - 请求唯一标识符（string）
  "data": {} // 可选 - 消息参数（any）
}
```

所有 CDP 结果都继承自 `CdpResult`，包含以下基础字段：

```json
{
  "type": "消息类型", // 必需 - 消息类型（string）
  "id": "unique-id", // 必需 - 请求唯一标识符（string）
  "success": true, // 必需 - 执行是否成功（boolean）
  "error": "错误信息", // 可选 - 错误信息（string）
  "data": {} // 可选 - 响应数据（any）
}
```

---

## 1. CdpConnectMessage（建立 CDP 连接）

建立与指定标签页的 CDP 连接，这是执行所有 CDP 操作的前提条件。

### JSON 结构

```json
{
  "type": "cdp_connect",
  "id": "connect-001",
  "data": {
    "tabId": 123
  }
}
```

### 字段说明

- **data.tabId** (必需): 要连接的标签页 ID（number）

### 示例

```json
{
  "type": "cdp_connect",
  "id": "connect-tab-1",
  "data": {
    "tabId": 1
  }
}
```

### 响应结果（CdpConnectResult）

```json
{
  "type": "cdp_connect",
  "id": "connect-tab-1",
  "success": true,
  "data": {
    "tabId": 1
  }
}
```

---

## 2. CdpDisconnectMessage（断开 CDP 连接）

断开与指定标签页的 CDP 连接，释放调试资源。

### JSON 结构

```json
{
  "type": "cdp_disconnect",
  "id": "disconnect-001",
  "data": {
    "tabId": 123
  }
}
```

### 字段说明

- **data.tabId** (必需): 要断开的标签页 ID（number）

### 示例

```json
{
  "type": "cdp_disconnect",
  "id": "disconnect-tab-1",
  "data": {
    "tabId": 1
  }
}
```

### 响应结果（CdpDisconnectResult）

```json
{
  "type": "cdp_disconnect",
  "id": "disconnect-tab-1",
  "success": true,
  "data": {
    "tabId": 1
  }
}
```

---

## 3. CdpListTargetsMessage（列出所有标签页目标）

获取所有可用的标签页信息，包括标签页 ID、索引和 URL。

### JSON 结构

```json
{
  "type": "list_targets",
  "id": "list-001"
}
```

### 字段说明

- 无需 data 字段，直接返回所有标签页信息

### 示例

```json
{
  "type": "list_targets",
  "id": "list-all-tabs"
}
```

### 响应结果（CdpListTargetsResult）

```json
{
  "type": "list_targets",
  "id": "list-all-tabs",
  "success": true,
  "data": [
    {
      "tabId": 1,
      "tabIndex": 0,
      "url": "https://example.com"
    },
    {
      "tabId": 2,
      "tabIndex": 1,
      "url": "https://google.com"
    }
  ]
}
```

---

## 4. CdpExecuteJavaScriptMessage（执行 JavaScript 代码）

在指定标签页的页面上下文中执行 JavaScript 代码，获取页面数据或执行自定义逻辑。

### JSON 结构

```json
{
  "type": "execute_javascript",
  "id": "execute-001",
  "data": {
    "tabId": 123,
    "params": {
      "expression": "document.title",
      "returnByValue": true,
      "awaitPromise": true
    }
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.params** (必需): CDP Runtime.evaluate 命令的参数对象（any）
  - **expression** (必需): 要执行的 JavaScript 表达式或代码（string）
  - **returnByValue** (可选): 是否按值返回（boolean，默认：false）
  - **awaitPromise** (可选): 是否等待 Promise 完成（boolean，默认：false）
  - 其他参数请参考 Chrome DevTools Protocol 的 Runtime.evaluate 方法文档

### 示例

```json
{
  "type": "execute_javascript",
  "id": "get-title",
  "data": {
    "tabId": 1,
    "params": {
      "expression": "document.title",
      "returnByValue": true,
      "awaitPromise": true
    }
  }
}
```

### 响应结果（CdpExecuteJavaScriptResult）

```json
{
  "type": "execute_javascript",
  "id": "get-title",
  "success": true,
  "data": {
    "result": "Example Domain"
  }
}
```

---

## 5. CdpTakeElementScreenshotMessage（元素截图）

捕获指定元素的截图，支持多种选择器类型定位元素。

### JSON 结构

```json
{
  "type": "take_element_screenshot",
  "id": "screenshot-001",
  "data": {
    "tabId": 123,
    "selector": "#element-id",
    "selectorType": "css"
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.selector** (必需): 元素选择器（string）
- **data.selectorType** (可选): 选择器类型，可选值：`"css"` | `"xpath"` | `"id"` 等（string，默认：`"css"`）

### 示例

```json
{
  "type": "take_element_screenshot",
  "id": "screenshot-element",
  "data": {
    "tabId": 1,
    "selector": "#search-input",
    "selectorType": "css"
  }
}
```

### 响应结果（CdpTakeElementScreenshotResult）

```json
{
  "type": "take_element_screenshot",
  "id": "screenshot-element",
  "success": true,
  "data": {
    "image": "iVBORw0KGgoAAAANSUhEUgAA...",
    "format": "png",
    "x": 100,
    "y": 200,
    "width": 300,
    "height": 50
  }
}
```

---

## 6. CdpSendCommandMessage（发送 CDP 命令）

执行任意 CDP 命令，提供最大的灵活性，支持所有 CDP Domain 的方法。

### JSON 结构

```json
{
  "type": "send_command",
  "id": "command-001",
  "data": {
    "tabId": 123,
    "method": "DOM.querySelector",
    "params": {
      "nodeId": 1,
      "selector": "#element"
    }
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.method** (必需): CDP 方法名（string），例如：
  - `"DOM.querySelector"`: 查询元素
  - `"Input.dispatchMouseEvent"`: 发送鼠标事件
  - `"Page.navigate"`: 页面导航
  - 其他 CDP 方法请参考 Chrome DevTools Protocol 文档
- **data.params** (可选): 命令参数（any），根据具体命令而定

### 示例

#### 查询元素

```json
{
  "type": "send_command",
  "id": "query-element",
  "data": {
    "tabId": 1,
    "method": "DOM.querySelector",
    "params": {
      "nodeId": 1,
      "selector": "#search-input"
    }
  }
}
```

#### 发送鼠标事件

```json
{
  "type": "send_command",
  "id": "mouse-click",
  "data": {
    "tabId": 1,
    "method": "Input.dispatchMouseEvent",
    "params": {
      "type": "mousePressed",
      "x": 100,
      "y": 200,
      "button": "left",
      "clickCount": 1
    }
  }
}
```

### 响应结果（CdpSendCommandResult）

```json
{
  "type": "send_command",
  "id": "query-element",
  "success": true,
  "data": {
    "nodeId": 5
  }
}
```

---

## 7. CdpGrepSourceMessage（搜索页面源码）

在页面的所有资源（HTML、CSS、JavaScript）中搜索匹配的文本模式，用于代码分析和调试。

### JSON 结构

```json
{
  "type": "grep_source",
  "id": "grep-001",
  "data": {
    "tabId": 123,
    "pattern": "search",
    "caseSensitive": false
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.pattern** (必需): 搜索模式（正则表达式或普通字符串）（string）
- **data.caseSensitive** (可选): 是否区分大小写（boolean，默认：false）

### 示例

```json
{
  "type": "grep_source",
  "id": "grep-search",
  "data": {
    "tabId": 1,
    "pattern": "function.*search",
    "caseSensitive": false
  }
}
```

### 响应结果（CdpGrepSourceResult）

```json
{
  "type": "grep_source",
  "id": "grep-search",
  "success": true,
  "data": {
    "matches": [
      {
        "url": "https://example.com/app.js",
        "line": 42,
        "content": "function search(query) {"
      },
      {
        "url": "https://example.com/utils.js",
        "line": 15,
        "content": "function advancedSearch(params) {"
      }
    ],
    "pattern": "function.*search",
    "count": 2
  }
}
```

---

## 8. CdpGetNetworkLogsMessage（获取网络日志）

获取指定标签页的网络请求日志，支持过滤、分页和分组，用于网络监控和调试。

### JSON 结构

```json
{
  "type": "get_network_logs",
  "id": "network-logs-001",
  "data": {
    "tabId": 123,
    "clear": false,
    "filter": {},
    "limit": 100,
    "offset": 0,
    "requestId": null,
    "groupByRequest": false
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.clear** (可选): 是否清空日志（boolean，默认：false）
- **data.filter** (可选): 过滤条件（any）
- **data.limit** (可选): 返回数量限制（number）
- **data.offset** (可选): 偏移量（number，默认：0）
- **data.requestId** (可选): 特定请求 ID（string）
- **data.groupByRequest** (可选): 是否按请求分组（boolean，默认：false）

### 示例

```json
{
  "type": "get_network_logs",
  "id": "get-network-logs",
  "data": {
    "tabId": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### 响应结果（CdpGetNetworkLogsResult）

```json
{
  "type": "get_network_logs",
  "id": "get-network-logs",
  "success": true,
  "data": {
    "tabId": 1,
    "logs": [
      {
        "requestId": "123.1",
        "url": "https://example.com/api/data",
        "method": "GET",
        "status": 200
      }
    ],
    "count": 1,
    "total": 1,
    "grouped": false
  }
}
```

---

## 9. CdpInitNetworkLogsMessage（初始化网络日志收集）

开始收集指定标签页的网络请求日志，启用 Network 域的事件监听。

### JSON 结构

```json
{
  "type": "init_network_logs",
  "id": "init-network-001",
  "data": {
    "tabId": 123,
    "clear": false
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.clear** (可选): 是否清空已有日志（boolean，默认：false）

### 示例

```json
{
  "type": "init_network_logs",
  "id": "init-network",
  "data": {
    "tabId": 1,
    "clear": true
  }
}
```

### 响应结果（CdpInitNetworkLogsResult）

```json
{
  "type": "init_network_logs",
  "id": "init-network",
  "success": true,
  "data": {
    "tabId": 1,
    "message": "Network logs initialized"
  }
}
```

---

## 10. CdpCloseNetworkLogsMessage（关闭网络日志收集）

停止收集指定标签页的网络请求日志，释放资源。

### JSON 结构

```json
{
  "type": "close_network_logs",
  "id": "close-network-001",
  "data": {
    "tabId": 123,
    "clear": false
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.clear** (可选): 是否清空已有日志（boolean，默认：false）

### 示例

```json
{
  "type": "close_network_logs",
  "id": "close-network",
  "data": {
    "tabId": 1,
    "clear": false
  }
}
```

### 响应结果（CdpCloseNetworkLogsResult）

```json
{
  "type": "close_network_logs",
  "id": "close-network",
  "success": true,
  "data": {
    "tabId": 1,
    "message": "Network logs closed"
  }
}
```

---

## 11. CdpGetConsoleLogsMessage（获取控制台日志）

获取指定标签页的控制台日志，支持过滤和分页，用于调试和问题排查。

### JSON 结构

```json
{
  "type": "get_console_logs",
  "id": "console-logs-001",
  "data": {
    "tabId": 123,
    "clear": false,
    "filter": {},
    "limit": 100,
    "offset": 0
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.clear** (可选): 是否清空日志（boolean，默认：false）
- **data.filter** (可选): 过滤条件（any）
- **data.limit** (可选): 返回数量限制（number）
- **data.offset** (可选): 偏移量（number，默认：0）

### 示例

```json
{
  "type": "get_console_logs",
  "id": "get-console-logs",
  "data": {
    "tabId": 1,
    "limit": 50
  }
}
```

### 响应结果（CdpGetConsoleLogsResult）

```json
{
  "type": "get_console_logs",
  "id": "get-console-logs",
  "success": true,
  "data": {
    "tabId": 1,
    "logs": [
      {
        "level": "info",
        "text": "Page loaded",
        "timestamp": 1703123456789
      }
    ],
    "count": 1,
    "total": 1
  }
}
```

---

## 12. CdpInitConsoleLogsMessage（初始化控制台日志收集）

开始收集指定标签页的控制台日志，启用 Runtime 域的控制台事件监听。

### JSON 结构

```json
{
  "type": "init_console_logs",
  "id": "init-console-001",
  "data": {
    "tabId": 123,
    "clear": false
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.clear** (可选): 是否清空已有日志（boolean，默认：false）

### 示例

```json
{
  "type": "init_console_logs",
  "id": "init-console",
  "data": {
    "tabId": 1,
    "clear": true
  }
}
```

### 响应结果（CdpInitConsoleLogsResult）

```json
{
  "type": "init_console_logs",
  "id": "init-console",
  "success": true,
  "data": {
    "tabId": 1,
    "message": "Console logs initialized"
  }
}
```

---

## 13. CdpCloseConsoleLogsMessage（关闭控制台日志收集）

停止收集指定标签页的控制台日志，释放资源。

### JSON 结构

```json
{
  "type": "close_console_logs",
  "id": "close-console-001",
  "data": {
    "tabId": 123,
    "clear": false
  }
}
```

### 字段说明

- **data.tabId** (必需): 目标标签页 ID（number）
- **data.clear** (可选): 是否清空已有日志（boolean，默认：false）

### 示例

```json
{
  "type": "close_console_logs",
  "id": "close-console",
  "data": {
    "tabId": 1,
    "clear": false
  }
}
```

### 响应结果（CdpCloseConsoleLogsResult）

```json
{
  "type": "close_console_logs",
  "id": "close-console",
  "success": true,
  "data": {
    "tabId": 1,
    "message": "Console logs closed"
  }
}
```

---

## 14. CdpCreateTabAndNavigateMessage（创建标签页并导航）

创建新标签页并导航到指定 URL，支持在当前窗口或新窗口中打开；可选在导航前设置 cookie（先打开 about:blank，通过 CDP Network.setCookies 设置后再导航，首请求即带 cookie）。

### JSON 结构

```json
{
  "type": "create_tab_and_navigate",
  "id": "create-tab-001",
  "data": {
    "url": "https://example.com",
    "active": true,
    "newWindow": false,
    "cookies": [
      { "name": "session", "value": "abc123" },
      { "name": "token", "value": "xyz", "path": "/", "secure": true }
    ]
  }
}
```

### 字段说明

- **data.url** (必需): 目标 URL（string）
- **data.active** (可选): 是否激活新标签页（boolean，默认：true）
- **data.newWindow** (可选): 是否在新窗口中打开（boolean，默认：false）
- **data.cookies** (可选): 导航前要设置的 cookie 数组；若提供则先创建 about:blank、连接 CDP、设置 cookie 后再导航到 url。每项为对象：
  - **name** (必需): Cookie 名称（string）
  - **value** (必需): Cookie 值（string）
  - **url** (可选): 请求 URI，用于确定 domain/path；不传时使用 data.url
  - **domain** (可选): Cookie 的 domain（string）
  - **path** (可选): Cookie 的 path（string）
  - **secure** (可选): 是否仅 HTTPS（boolean）
  - **httpOnly** (可选): 是否 HttpOnly（boolean）
  - **sameSite** (可选): `"Strict"` | `"Lax"` | `"None"`（string）
  - **expires** (可选): 过期时间戳（number，TimeSinceEpoch）

### 示例

不带 cookie（直接打开目标 URL）：

```json
{
  "type": "create_tab_and_navigate",
  "id": "create-tab",
  "data": {
    "url": "https://www.google.com",
    "active": true,
    "newWindow": false
  }
}
```

带 cookie（先设置 cookie 再导航）：

```json
{
  "type": "create_tab_and_navigate",
  "id": "create-tab-with-cookies",
  "data": {
    "url": "https://example.com/dashboard",
    "active": true,
    "newWindow": false,
    "cookies": [
      { "name": "session_id", "value": "sess_abc123" },
      { "name": "pref", "value": "lang=zh", "path": "/" }
    ]
  }
}
```

### 响应结果（CdpCreateTabAndNavigateResult）

```json
{
  "type": "create_tab_and_navigate",
  "id": "create-tab",
  "success": true,
  "data": {
    "tabId": 2,
    "tabIndex": 1,
    "url": "https://www.google.com"
  }
}
```

---

## 15. CdpUpdateNodeNameMessage（更新节点名称）

更新浏览器扩展的节点名称，用于节点管理和标识。

### JSON 结构

```json
{
  "type": "update_node_name",
  "id": "update-node-001",
  "data": {
    "node_name": "节点名称"
  }
}
```

### 字段说明

- **data.node_name** (必需): 新的节点名称（string）

### 示例

```json
{
  "type": "update_node_name",
  "id": "update-node",
  "data": {
    "node_name": "测试节点-001"
  }
}
```

### 响应结果（CdpUpdateNodeNameResult）

```json
{
  "type": "update_node_name",
  "id": "update-node",
  "success": true,
  "data": {
    "node_name": "测试节点-001"
  }
}
```

---

## 16. CdpCloseTabMessage（关闭标签页）

关闭指定的标签页，释放资源。

### JSON 结构

```json
{
  "type": "close_tab",
  "id": "close-tab-001",
  "data": {
    "tabId": 123
  }
}
```

### 字段说明

- **data.tabId** (必需): 要关闭的标签页 ID（number）

### 示例

```json
{
  "type": "close_tab",
  "id": "close-tab",
  "data": {
    "tabId": 1
  }
}
```

### 响应结果（CdpCloseTabResult）

```json
{
  "type": "close_tab",
  "id": "close-tab",
  "success": true,
  "data": {
    "tabId": 1
  }
}
```

---

## 完整示例：CDP 操作流程

以下是一个完整的 CDP 操作流程示例，展示了如何组合使用多个消息：

```json
[
  {
    "type": "list_targets",
    "id": "list-tabs-1"
  },
  {
    "type": "cdp_connect",
    "id": "connect-1",
    "data": {
      "tabId": 1
    }
  },
  {
    "type": "init_network_logs",
    "id": "init-network-1",
    "data": {
      "tabId": 1,
      "clear": true
    }
  },
  {
    "type": "init_console_logs",
    "id": "init-console-1",
    "data": {
      "tabId": 1,
      "clear": true
    }
  },
  {
    "type": "execute_javascript",
    "id": "get-title-1",
    "data": {
      "tabId": 1,
      "params": {
        "expression": "document.title",
        "returnByValue": true,
        "awaitPromise": true
      }
    }
  },
  {
    "type": "take_element_screenshot",
    "id": "screenshot-1",
    "data": {
      "tabId": 1,
      "selector": "#main-content",
      "selectorType": "css"
    }
  },
  {
    "type": "get_network_logs",
    "id": "get-network-1",
    "data": {
      "tabId": 1,
      "limit": 10
    }
  },
  {
    "type": "get_console_logs",
    "id": "get-console-1",
    "data": {
      "tabId": 1,
      "limit": 10
    }
  },
  {
    "type": "close_network_logs",
    "id": "close-network-1",
    "data": {
      "tabId": 1
    }
  },
  {
    "type": "close_console_logs",
    "id": "close-console-1",
    "data": {
      "tabId": 1
    }
  },
  {
    "type": "cdp_disconnect",
    "id": "disconnect-1",
    "data": {
      "tabId": 1
    }
  }
]
```

---

## 注意事项

1. **消息 ID 唯一性**：每个消息的 `id` 应该是唯一的，用于匹配请求和响应。

2. **连接状态**：在执行大多数 CDP 操作之前，必须先通过 `cdp_connect` 建立连接。只有 `list_targets` 和 `create_tab_and_navigate` 可以在未连接状态下执行。

3. **标签页 ID**：确保 `tabId` 对应的标签页存在且已连接 CDP（如果需要）。

4. **错误处理**：所有响应都包含 `success` 字段，如果为 `false`，则 `error` 字段会包含错误信息。

5. **日志收集**：网络日志和控制台日志需要先通过 `init_network_logs` 或 `init_console_logs` 初始化，才能收集日志。使用完毕后应通过 `close_network_logs` 或 `close_console_logs` 关闭。

6. **CDP 命令**：`send_command` 消息支持所有 CDP Domain 的方法，参数结构请参考 Chrome DevTools Protocol 官方文档。

7. **JavaScript 执行**：`execute_javascript` 的 `params` 字段直接传递给 CDP 的 `Runtime.evaluate` 方法，支持所有该方法的参数。

8. **选择器类型**：`take_element_screenshot` 和 `grep_source` 支持多种选择器类型，具体支持的类型取决于实现。

9. **WebSocket 通信**：所有消息通过 WebSocket 发送，响应也通过 WebSocket 返回，`id` 字段用于匹配请求和响应。

10. **资源清理**：使用完毕后应及时断开连接和关闭日志收集，以释放资源。
