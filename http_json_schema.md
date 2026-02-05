# HTTP JSON 数据结构文档

本文档描述了通过 WebSocket 发送的 HTTP 请求消息和响应结果的 JSON 数据结构。

## 概述

HTTP 请求功能允许通过 WebSocket 远程控制浏览器扩展执行 HTTP 请求。系统支持所有标准 HTTP 方法（GET、POST、PUT、DELETE 等），并自动处理 JSON 响应解析。

---

## HTTP 请求消息结构

HTTP 请求消息通过 WebSocket 发送，用于执行 HTTP 请求。

### JSON 结构

```json
{
  "type": "http_request",
  "id": "request-001",
  "data": {
    "method": "GET",
    "url": "https://api.example.com/users",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer token123"
    },
    "body": "请求体内容",
    "timeout": 180
  }
}
```

### 字段说明

#### 基础字段（必需）

- **type** (必需): 消息类型，固定为 `"http_request"`（string）
- **id** (必需): 请求唯一标识符，用于匹配请求和响应（string）

#### data 字段（可选但实际使用时必需）

- **method** (必需): HTTP 请求方法（string）
  - 支持的值：`"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`, `"HEAD"`, `"OPTIONS"` 等
  - 会自动转换为大写
- **url** (必需): 目标 URL 地址（string）
  - 必须是有效的 URL 格式
  - 支持 HTTP 和 HTTPS 协议
- **headers** (可选): 请求头对象（Record<string, string>）
  - 键值对形式，键为请求头名称，值为请求头值
  - 示例：`{ "Content-Type": "application/json", "Authorization": "Bearer token" }`
- **body** (可选): 请求体内容（string | object）
  - 字符串类型：直接作为请求体发送
  - 对象类型：自动转换为 JSON 字符串，并设置 `Content-Type: application/json` 请求头
  - **注意**：`GET`、`HEAD`、`DELETE`、`OPTIONS` 方法不应包含请求体，如果包含会记录警告但继续执行
- **timeout** (可选): 请求超时时间，单位：秒（number）
  - 默认值：180 秒
  - 超时后会返回错误结果

### 示例

#### GET 请求示例

```json
{
  "type": "http_request",
  "id": "get-users",
  "data": {
    "method": "GET",
    "url": "https://api.example.com/users",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "timeout": 30
  }
}
```

#### POST 请求示例（字符串 body）

```json
{
  "type": "http_request",
  "id": "create-user",
  "data": {
    "method": "POST",
    "url": "https://api.example.com/users",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer token123"
    },
    "body": "{\"name\":\"John\",\"email\":\"john@example.com\"}",
    "timeout": 60
  }
}
```

#### POST 请求示例（对象 body）

```json
{
  "type": "http_request",
  "id": "create-user-object",
  "data": {
    "method": "POST",
    "url": "https://api.example.com/users",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "body": {
      "name": "John",
      "email": "john@example.com",
      "age": 30
    },
    "timeout": 60
  }
}
```

**注意**：当 `body` 为对象时，系统会自动：

1. 将对象转换为 JSON 字符串
2. 如果没有设置 `Content-Type` 请求头，自动添加 `Content-Type: application/json`

#### PUT 请求示例

```json
{
  "type": "http_request",
  "id": "update-user",
  "data": {
    "method": "PUT",
    "url": "https://api.example.com/users/123",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "body": {
      "name": "John Updated",
      "email": "john.updated@example.com"
    },
    "timeout": 60
  }
}
```

#### DELETE 请求示例

```json
{
  "type": "http_request",
  "id": "delete-user",
  "data": {
    "method": "DELETE",
    "url": "https://api.example.com/users/123",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "timeout": 30
  }
}
```

#### 表单数据请求示例

```json
{
  "type": "http_request",
  "id": "submit-form",
  "data": {
    "method": "POST",
    "url": "https://api.example.com/form",
    "headers": {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    "body": "name=John&email=john@example.com&age=30",
    "timeout": 60
  }
}
```

---

## HTTP 响应结果结构

HTTP 请求执行完成后，会通过 WebSocket 返回响应结果。

### JSON 结构

#### 成功响应

```json
{
  "type": "http_request",
  "id": "request-001",
  "success": true,
  "data": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "application/json",
      "content-length": "1234"
    },
    "body": {
      "id": 1,
      "name": "John",
      "email": "john@example.com"
    },
    "url": "https://api.example.com/users"
  }
}
```

#### 失败响应

```json
{
  "type": "http_request",
  "id": "request-001",
  "success": false,
  "error": "Request timeout after 180000ms"
}
```

### 字段说明

#### 基础字段（必需）

- **type** (必需): 消息类型，与请求消息的 `type` 对应，通常为 `"http_request"`（string）
- **id** (必需): 请求唯一标识符，与请求消息的 `id` 对应，用于匹配请求和响应（string）
- **success** (必需): 执行是否成功（boolean）
  - `true`: 请求执行成功（包括 HTTP 状态码 4xx、5xx，只要请求成功发送并收到响应）
  - `false`: 请求执行失败（网络错误、超时、参数错误等）

#### 成功时的 data 字段（可选，success 为 true 时存在）

- **status** (必需): HTTP 状态码（number）
  - 示例：`200`（成功）、`201`（已创建）、`400`（错误请求）、`404`（未找到）、`500`（服务器错误）等
- **statusText** (必需): HTTP 状态文本（string）
  - 示例：`"OK"`、`"Created"`、`"Not Found"`、`"Internal Server Error"` 等
- **headers** (必需): 响应头对象（Record<string, string>）
  - 键值对形式，键为响应头名称（小写），值为响应头值
  - 示例：`{ "content-type": "application/json", "content-length": "1234" }`
- **body** (必需): 响应体内容（string | object）
  - 如果响应头 `Content-Type` 包含 `application/json`，会自动解析为对象
  - 否则返回文本字符串
  - 空响应体返回空字符串 `""`
- **url** (必需): 最终请求的 URL（string）
  - 可能与原始 URL 不同（如果发生了重定向）
  - 示例：`"https://api.example.com/users"`

#### 失败时的 error 字段（可选，success 为 false 时存在）

- **error** (可选): 错误信息（string）
  - 描述请求失败的原因
  - 常见错误：
    - `"Request timeout after 180000ms"`: 请求超时
    - `"method is required and must be a string in http_request"`: 缺少 method 参数
    - `"url is required and must be a string in http_request"`: 缺少 url 参数
    - `"data is undefined in http_request"`: 缺少 data 字段
    - `"Failed to fetch"`: 网络错误或 CORS 错误
    - 其他网络或解析错误

### 示例

#### 成功响应示例（JSON 响应）

```json
{
  "type": "http_request",
  "id": "get-users",
  "success": true,
  "data": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "application/json; charset=utf-8",
      "content-length": "156"
    },
    "body": {
      "users": [
        {
          "id": 1,
          "name": "John",
          "email": "john@example.com"
        },
        {
          "id": 2,
          "name": "Jane",
          "email": "jane@example.com"
        }
      ]
    },
    "url": "https://api.example.com/users"
  }
}
```

#### 成功响应示例（文本响应）

```json
{
  "type": "http_request",
  "id": "get-html",
  "success": true,
  "data": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "text/html; charset=utf-8",
      "content-length": "1024"
    },
    "body": "<html><body><h1>Hello World</h1></body></html>",
    "url": "https://example.com/page"
  }
}
```

#### HTTP 错误状态码响应示例（4xx）

```json
{
  "type": "http_request",
  "id": "get-user-404",
  "success": true,
  "data": {
    "status": 404,
    "statusText": "Not Found",
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "error": "User not found"
    },
    "url": "https://api.example.com/users/999"
  }
}
```

**注意**：即使 HTTP 状态码为 4xx 或 5xx，只要请求成功发送并收到响应，`success` 字段仍为 `true`。需要根据 `data.status` 判断实际的 HTTP 状态。

#### 超时错误示例

```json
{
  "type": "http_request",
  "id": "slow-request",
  "success": false,
  "error": "Request timeout after 180000ms"
}
```

#### 参数错误示例

```json
{
  "type": "http_request",
  "id": "invalid-request",
  "success": false,
  "error": "url is required and must be a string in http_request"
}
```

#### 网络错误示例

```json
{
  "type": "http_request",
  "id": "network-error",
  "success": false,
  "error": "Failed to fetch"
}
```

---

## 完整示例：用户管理 API 调用流程

以下是一个完整的用户管理 API 调用流程示例，展示了如何组合使用多个 HTTP 请求：

### 1. 获取用户列表（GET）

**请求：**

```json
{
  "type": "http_request",
  "id": "get-users-list",
  "data": {
    "method": "GET",
    "url": "https://api.example.com/users",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "timeout": 30
  }
}
```

**响应：**

```json
{
  "type": "http_request",
  "id": "get-users-list",
  "success": true,
  "data": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "users": [
        { "id": 1, "name": "John", "email": "john@example.com" },
        { "id": 2, "name": "Jane", "email": "jane@example.com" }
      ]
    },
    "url": "https://api.example.com/users"
  }
}
```

### 2. 创建新用户（POST）

**请求：**

```json
{
  "type": "http_request",
  "id": "create-user",
  "data": {
    "method": "POST",
    "url": "https://api.example.com/users",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "body": {
      "name": "Bob",
      "email": "bob@example.com",
      "age": 25
    },
    "timeout": 60
  }
}
```

**响应：**

```json
{
  "type": "http_request",
  "id": "create-user",
  "success": true,
  "data": {
    "status": 201,
    "statusText": "Created",
    "headers": {
      "content-type": "application/json",
      "location": "/users/3"
    },
    "body": {
      "id": 3,
      "name": "Bob",
      "email": "bob@example.com",
      "age": 25,
      "created_at": "2026-02-05T10:00:00Z"
    },
    "url": "https://api.example.com/users"
  }
}
```

### 3. 更新用户（PUT）

**请求：**

```json
{
  "type": "http_request",
  "id": "update-user",
  "data": {
    "method": "PUT",
    "url": "https://api.example.com/users/3",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "body": {
      "name": "Bob Updated",
      "email": "bob.updated@example.com"
    },
    "timeout": 60
  }
}
```

**响应：**

```json
{
  "type": "http_request",
  "id": "update-user",
  "success": true,
  "data": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "id": 3,
      "name": "Bob Updated",
      "email": "bob.updated@example.com",
      "age": 25,
      "updated_at": "2026-02-05T10:05:00Z"
    },
    "url": "https://api.example.com/users/3"
  }
}
```

### 4. 删除用户（DELETE）

**请求：**

```json
{
  "type": "http_request",
  "id": "delete-user",
  "data": {
    "method": "DELETE",
    "url": "https://api.example.com/users/3",
    "headers": {
      "Authorization": "Bearer token123"
    },
    "timeout": 30
  }
}
```

**响应：**

```json
{
  "type": "http_request",
  "id": "delete-user",
  "success": true,
  "data": {
    "status": 204,
    "statusText": "No Content",
    "headers": {},
    "body": "",
    "url": "https://api.example.com/users/3"
  }
}
```

---

## 注意事项

1. **请求 ID 唯一性**：每个请求的 `id` 应该是唯一的，用于匹配请求和响应。

2. **HTTP 方法大小写**：`method` 字段会自动转换为大写，但建议使用大写形式（如 `"GET"`、`"POST"`）。

3. **请求体处理**：

   - `GET`、`HEAD`、`DELETE`、`OPTIONS` 方法不应包含请求体
   - 如果为这些方法提供了 `body`，系统会记录警告但继续执行
   - 对象类型的 `body` 会自动转换为 JSON 字符串

4. **Content-Type 自动设置**：

   - 当 `body` 为对象时，如果没有设置 `Content-Type` 请求头，系统会自动添加 `Content-Type: application/json`
   - 如果已设置 `Content-Type`，则使用设置的值

5. **超时时间单位**：`timeout` 字段的单位是**秒**，不是毫秒。默认值为 180 秒。

6. **响应体解析**：

   - 如果响应头 `Content-Type` 包含 `application/json`，响应体会自动解析为对象
   - 否则返回文本字符串
   - 解析失败时返回原始文本

7. **HTTP 状态码判断**：

   - `success: true` 表示请求成功发送并收到响应（包括 4xx、5xx 状态码）
   - 需要根据 `data.status` 判断实际的 HTTP 状态
   - `success: false` 表示请求执行失败（网络错误、超时、参数错误等）

8. **重定向处理**：如果请求发生重定向，`data.url` 字段会包含最终请求的 URL。

9. **CORS 限制**：由于使用浏览器 `fetch` API，可能会受到 CORS 策略限制。如果遇到 CORS 错误，需要在服务器端配置 CORS 响应头。

10. **错误处理**：所有错误都会通过 `error` 字段返回，不会抛出异常。建议始终检查 `success` 字段和 `error` 字段。

11. **响应头大小写**：响应头名称在返回时会被转换为小写（如 `Content-Type` 变为 `content-type`）。

12. **空响应体**：某些 HTTP 方法（如 `HEAD`、`204 No Content`）可能没有响应体，此时 `body` 字段为空字符串 `""`。
