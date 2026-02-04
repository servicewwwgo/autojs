---
name: code-comment-generator
description: Generate clear and comprehensive code comments covering business logic, implementation approach, special considerations, and related code locations. Use when the user asks to add comments, generate documentation, explain code, annotate functions, document classes, add inline docs, write JSDoc, create docstrings, or improve code readability.
---

# 代码注释生成器

## 快速开始

为代码生成注释时，始终包含以下四个要素：

1. **业务逻辑**：为什么进行此操作（业务需求或目的）
2. **实现方式**：如何实现该功能（使用的技术或方法）
3. **注意事项**：潜在问题、性能考量、边界情况等
4. **相关代码**：相关联的其他代码位置（文件路径或函数名）

## 注释模板

### TypeScript/JavaScript 函数注释

```typescript
/**
 * 业务逻辑：解释为什么进行此操作，说明业务需求或目的
 *
 * 实现方式：描述如何实现该功能，使用了哪些技术或方法
 *
 * 注意事项：提醒开发者注意潜在的边界情况、性能问题、特殊处理等
 *
 * 相关代码：如涉及其他函数或模块，注明相应的代码位置（文件路径或函数名）
 */
function exampleFunction(param1: string, param2: number): void {
  // 实际功能实现
}
```

### Python 函数注释

```python
def example_function(param1: str, param2: int) -> None:
    """
    业务逻辑：解释为什么进行此操作，说明业务需求或目的

    实现方式：描述如何实现该功能，使用了哪些技术或方法

    注意事项：提醒开发者注意潜在的边界情况、性能问题、特殊处理等

    相关代码：如涉及其他函数或模块，注明相应的代码位置（文件路径或函数名）
    """
    # 实际功能实现
    pass
```

### 单行注释

对于简单的代码行，使用紧凑格式：

```typescript
// 业务逻辑：为什么做这件事 | 实现方式：如何做的 | 注意事项：需要注意什么
```

### 类注释

```typescript
/**
 * 业务逻辑：类的业务目的和职责
 *
 * 实现方式：类的设计模式和主要技术实现
 *
 * 注意事项：使用该类时需要注意的事项
 *
 * 相关代码：相关的其他类或模块
 */
class ExampleClass {
  // 类实现
}
```

### 带参数说明的函数注释

对于复杂函数，可以在注释中包含参数说明：

```typescript
/**
 * 业务逻辑：处理用户订单，计算折扣并更新库存
 *
 * 实现方式：使用事务确保数据一致性，先计算折扣再更新库存
 *
 * 注意事项：
 * - userId 必须存在，否则抛出异常
 * - items 为空数组时返回空结果
 * - 库存不足时回滚整个事务
 *
 * @param userId - 用户ID，必须是已存在的用户
 * @param items - 订单项数组，每个项包含 productId 和 quantity
 * @param couponCode - 优惠券代码（可选），格式为 "COUPON_XXX"
 * @returns 订单ID和总金额的对象
 *
 * 相关代码：src/services/inventory.ts - updateStock() 函数
 */
async function processOrder(
  userId: number,
  items: OrderItem[],
  couponCode?: string
): Promise<OrderResult> {
  // 实现
}
```

## 生成规则

### 何时生成完整注释

为以下情况生成完整的四要素注释：

- 公共 API 函数/方法
- 复杂的业务逻辑
- 性能关键代码
- 容易出错的边界情况处理
- 涉及多个模块的集成代码

### 何时简化注释

对于以下情况，可以简化或省略部分要素：

- 自解释的简单代码（如 `return x + 1`）
- 私有辅助函数（可省略相关代码）
- 标准库调用（可省略实现方式）

### 注释质量要求

- **简洁性**：避免冗余，优先解释"为什么"而非"是什么"
- **准确性**：确保注释与代码实现一致
- **可操作性**：相关代码位置应具体到文件路径和函数名
- **技术细节**：对于非标准实现，说明技术选型原因

## 示例

### 示例 1：验证函数

```typescript
/**
 * 业务逻辑：验证用户输入的用户名是否符合规范，确保数据质量和安全性
 *
 * 实现方式：使用正则表达式匹配用户名规则（3-20个字符，仅字母数字下划线）
 *
 * 注意事项：空字符串会返回 false，会自动处理前后空格
 *
 * 相关代码：src/utils/validation.ts - validateEmail() 函数
 */
function validateUsername(username: string): boolean {
  const pattern = /^[a-zA-Z0-9_]{3,20}$/;
  return pattern.test(username.trim());
}
```

### 示例 2：会话管理类

```typescript
/**
 * 业务逻辑：管理用户会话状态，确保用户登录状态的一致性和安全性
 *
 * 实现方式：使用 localStorage 存储 token，通过事件机制通知状态变化
 *
 * 注意事项：token 过期需要自动刷新，并发请求时避免重复刷新（使用锁机制）
 *
 * 相关代码：src/api/auth.ts - login() 函数，src/utils/token.ts - refreshToken() 函数
 */
class SessionManager {
  private refreshLock = false;

  async refreshToken(): Promise<void> {
    // 实现
  }
}
```

### 示例 3：批量处理逻辑

```typescript
// 业务逻辑：批量处理用户数据，提高处理效率，避免单次处理超时
// 实现方式：将数据分批处理，每批 100 条，使用 Promise.all 并发执行
// 注意事项：单批失败不影响其他批次，需要记录失败批次以便重试
// 相关代码：src/utils/batchProcessor.ts - retryFailedBatch() 函数
const batchSize = 100;
for (let i = 0; i < data.length; i += batchSize) {
  const batch = data.slice(i, i + batchSize);
  await Promise.all(batch.map(processItem));
}
```

### 示例 4：Python 异步函数

```python
async def fetch_user_data(user_id: int) -> dict:
    """
    业务逻辑：异步获取用户数据，避免阻塞主线程，提升用户体验

    实现方式：使用 aiohttp 发起异步 HTTP 请求，配合 asyncio 实现并发

    注意事项：网络异常时返回空字典，调用方需要处理异常情况

    相关代码：src/api/user_service.py - update_user_cache() 函数
    """
    async with aiohttp.ClientSession() as session:
        async with session.get(f'/api/users/{user_id}') as response:
            return await response.json() if response.status == 200 else {}
```

### 示例 5：简单辅助函数（简化版）

```typescript
// 业务逻辑：格式化日期为 YYYY-MM-DD 格式，用于统一显示
// 实现方式：使用 Date 对象的方法提取年月日并格式化
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

### 示例 6：错误处理函数

```typescript
/**
 * 业务逻辑：安全地解析 JSON 字符串，避免解析错误导致程序崩溃
 *
 * 实现方式：使用 try-catch 捕获异常，返回 null 表示解析失败
 *
 * 注意事项：
 * - 输入为 null 或 undefined 时返回 null
 * - 无效 JSON 字符串返回 null，不抛出异常
 * - 空字符串返回 null（JSON.parse('') 会抛出异常）
 *
 * 相关代码：src/utils/json.ts - safeStringify() 函数
 */
function safeParseJSON<T>(jsonString: string | null | undefined): T | null {
  if (!jsonString || jsonString.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return null;
  }
}
```

## 不同语言的注释风格

### TypeScript/JavaScript

- 使用 JSDoc 格式：`/** ... */`
- 函数参数和返回值可在注释中说明类型（如果未使用 TypeScript）

### Python

- 使用 docstring：`""" ... """`
- 遵循 PEP 257 规范
- 第一行应为简短摘要

### Java

- 使用 JavaDoc 格式：`/** ... */`
- 包含 `@param`、`@return`、`@throws` 等标签

### Go

- 使用行注释：`// ...`
- 公共函数注释以函数名开头
- 简洁明了，避免冗余

## 常见场景处理

### 场景 1：用户要求为现有代码添加注释

- 分析代码上下文，理解业务逻辑
- 检查是否有相关的其他函数或模块
- 生成完整的四要素注释

### 场景 2：用户要求为新建函数生成注释

- 根据函数签名和实现推断业务逻辑
- 说明实现方式和技术选型
- 预测可能的边界情况和注意事项

### 场景 3：用户要求改进现有注释

- 检查现有注释是否包含四要素
- 补充缺失的要素
- 优化表达，使其更清晰准确

### 场景 4：批量生成注释

- 优先为公共 API 和复杂逻辑添加注释
- 简单函数可以使用简化版注释
- 保持注释风格一致

## 工作流程

1. **分析代码**：理解代码的业务目的和技术实现
2. **识别关键点**：找出需要特别说明的业务逻辑、技术细节和潜在问题
3. **查找关联**：确定相关的其他代码位置（搜索代码库中的相关函数）
4. **生成注释**：按照模板生成四要素注释，遵循对应语言的注释风格
5. **验证质量**：确保注释简洁、准确、可操作，与代码实现一致
