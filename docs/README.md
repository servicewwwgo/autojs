# Web自动化爬虫系统

基于WXT+Vue的Chrome浏览器扩展爬虫系统，支持通过JSON配置文件定义和执行Web自动化操作。

## 系统架构

### 核心组件

1. **元素对象 (ElementObject)**
   - 管理页面元素的DOM引用和属性
   - 支持CSS选择器、XPath、ID定位
   - 提供元素验证和操作方法

2. **指令对象 (Instruction)**
   - 定义各种自动化操作指令
   - 支持页面导航、元素操作、鼠标键盘操作等
   - 包含重试、超时、延迟等控制机制

3. **执行器 (Executor)**
   - 管理指令执行流程
   - 提供执行状态控制和结果收集
   - 支持批量执行和单步调试

4. **元素管理器 (ElementManager)**
   - 统一管理所有页面元素
   - 支持元素关系维护
   - 提供元素的增删改查操作

5. **指令解析器 (InstructionParser)**
   - 支持JSON格式的指令序列化/反序列化
   - 提供指令验证功能
   - 支持从文件加载指令配置

## 支持的指令类型

### 基础指令
- **页面导航指令**: 控制页面跳转
- **元素定位指令**: 定位和验证页面元素
- **等待指令**: 等待特定条件满足

### 鼠标操作指令
- **点击指令**: 支持左键、右键、中键点击
- **拖拽指令**: 支持元素间拖拽操作

### 键盘操作指令
- **文本输入指令**: 在输入框中输入文本
- **按键指令**: 模拟键盘按键操作

### 数据获取指令
- **文本获取指令**: 提取页面元素文本内容

## 使用方法

### 1. 基本使用

```typescript
import { WebCrawler } from './core/WebCrawler';

const crawler = new WebCrawler();

// 从JSON加载并执行指令
await crawler.loadAndExecuteInstructions(jsonData);
```

### 2. 元素管理

```typescript
import { Element } from './types/Element';

// 创建元素
const element = new Element({
  name: 'search_input',
  description: '搜索输入框',
  selector: '#search-input',
  selectorType: 'css'
});

// 添加到管理器
crawler.getElementManager().setElement(element);
```

### 3. 指令创建

```typescript
import { NavigateInstruction, ClickInstruction } from './types/Instructions';

// 创建导航指令
const navInst = new NavigateInstruction({
  id: 'nav_1',
  url: 'https://example.com'
});

// 创建点击指令
const clickInst = new ClickInstruction({
  id: 'click_1',
  elementName: 'search_button'
});
```

## JSON配置格式

### 指令配置示例

```json
[
  {
    "type": "navigate",
    "id": "nav_1",
    "url": "https://www.example.com",
    "delay": 2,
    "retry": 1,
    "timeout": 30,
    "waitVisible": true
  },
  {
    "type": "click",
    "id": "click_1",
    "elementName": "search_button",
    "button": "left",
    "clickType": "single",
    "offsetX": 0,
    "offsetY": 0,
    "delay": 1,
    "retry": 2,
    "timeout": 10,
    "waitVisible": true
  }
]
```

### 元素配置示例

```json
[
  {
    "name": "search_input",
    "description": "搜索输入框",
    "selector": "#search-input",
    "selectorType": "css",
    "parentName": "search_form",
    "childrenNames": [],
    "relatedNames": ["search_button"]
  }
]
```

## 指令参数说明

### 基础参数
- `type`: 指令类型
- `id`: 指令唯一标识
- `delay`: 执行前延迟时间(秒)
- `retry`: 重试次数
- `timeout`: 超时时间(秒)
- `waitVisible`: 是否等待元素可见

### 页面导航指令
- `url`: 目标URL地址

### 元素定位指令
- `element`: 元素对象配置
- `elementName`: 元素名称(从管理器中获取)

### 鼠标操作指令
- `elementName`: 目标元素名称
- `button`: 鼠标按键 (left/middle/right)
- `clickType`: 点击类型 (single/double)
- `offsetX/offsetY`: 相对元素中心的偏移量

### 文本输入指令
- `elementName`: 目标元素名称
- `text`: 要输入的文本
- `clearFirst`: 是否先清空输入框
- `timeDelay`: 输入字符间延迟(秒)

### 等待指令
- `waitType`: 等待类型 (time/element/visible/condition/network/function)
- `value`: 等待值(时间、选择器或条件表达式)

## 扩展开发

### 添加新的指令类型

1. 在 `src/types/Instructions.ts` 中定义新的指令类
2. 继承 `BaseInstructionImpl` 基类
3. 实现 `validate()` 和 `execute()` 方法
4. 在 `InstructionParser` 中添加解析逻辑

### 自定义元素操作

1. 继承 `Element` 类
2. 重写 `execute()` 方法
3. 添加自定义的验证和操作方法

## 错误处理

系统提供完善的错误处理机制：

- 指令验证失败时会记录详细错误信息
- 执行失败时支持自动重试
- 提供详细的执行日志和统计信息
- 支持执行结果的导出和分析

## 性能优化

- 支持元素DOM引用的缓存和刷新
- 提供指令执行的并发控制
- 支持执行过程的暂停和恢复
- 提供详细的性能统计信息

## 注意事项

1. 确保选择器表达式的准确性
2. 合理设置延迟和超时时间
3. 注意页面加载和元素渲染的时机
4. 定期验证和更新元素选择器
5. 测试指令在不同网络环境下的稳定性
