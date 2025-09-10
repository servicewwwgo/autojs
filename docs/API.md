# Web爬虫系统 API 文档

## 核心类和方法

### ElementObject (元素对象)

#### 属性
- `dom: HTMLElement | null` - DOM对象引用
- `name: string` - 元素名称
- `description: string` - 元素描述
- `text: string` - 元素文本内容
- `selector: string` - 选择器表达式
- `selectorType: 'css' | 'xpath' | 'id'` - 选择器类型
- `parentName?: string` - 父元素名称
- `childrenNames: string[]` - 子元素名称列表
- `relatedNames: string[]` - 关联元素名称列表

#### 方法
- `validate(): boolean` - 验证元素是否存在且可操作
- `execute(): Promise<boolean>` - 执行元素操作
- `getBoundingRect(): DOMRect | null` - 获取元素位置信息
- `isVisible(): boolean` - 检查元素是否可见
- `scrollIntoView(): boolean` - 滚动到元素位置

### BaseInstruction (基础指令)

#### 属性
- `type: string` - 指令类型
- `id: string` - 指令ID
- `delay: number` - 延迟时间(秒)
- `retry: number` - 重试次数
- `timeout: number` - 超时时间(秒)
- `waitVisible: boolean` - 是否等待元素可见

#### 方法
- `validate(): boolean` - 验证指令配置
- `execute(): Promise<ExecutionResult>` - 执行指令

### 指令类型

#### NavigateInstruction (页面导航指令)
```typescript
new NavigateInstruction({
  id: string,
  url: string,
  delay?: number,
  retry?: number,
  timeout?: number,
  waitVisible?: boolean
})
```

#### ClickInstruction (鼠标点击指令)
```typescript
new ClickInstruction({
  id: string,
  elementName: string,
  button?: 'left' | 'middle' | 'right',
  clickType?: 'single' | 'double',
  offsetX?: number,
  offsetY?: number,
  delay?: number,
  retry?: number,
  timeout?: number,
  waitVisible?: boolean
})
```

#### InputTextInstruction (文本输入指令)
```typescript
new InputTextInstruction({
  id: string,
  elementName: string,
  text: string,
  clearFirst?: boolean,
  timeDelay?: number,
  delay?: number,
  retry?: number,
  timeout?: number,
  waitVisible?: boolean
})
```

#### WaitInstruction (等待指令)
```typescript
new WaitInstruction({
  id: string,
  waitType: 'time' | 'element' | 'visible' | 'condition' | 'network' | 'function',
  value: any,
  delay?: number,
  retry?: number,
  timeout?: number,
  waitVisible?: boolean
})
```

### Executor (执行器)

#### 方法
- `addInstruction(instruction: BaseInstruction): void` - 添加单个指令
- `addInstructions(instructions: BaseInstruction[]): void` - 批量添加指令
- `executeAll(): Promise<ExecutionResult[]>` - 执行所有指令
- `executeInstruction(index: number): Promise<ExecutionResult | null>` - 执行单个指令
- `pause(): void` - 暂停执行
- `stop(): void` - 停止执行
- `getStatistics()` - 获取执行统计信息
- `exportResults(): string` - 导出执行结果
- `validateAll()` - 验证所有指令

### ElementManager (元素管理器)

#### 方法
- `getElement(name: string): ElementObject | null` - 获取元素对象
- `setElement(element: ElementObject): void` - 保存元素对象
- `setElements(elements: ElementObject[]): void` - 批量保存元素对象
- `removeElement(name: string): boolean` - 删除元素对象
- `hasElement(name: string): boolean` - 检查元素是否存在
- `getAllElementNames(): string[]` - 获取所有元素名称
- `getAllElements(): ElementObject[]` - 获取所有元素对象
- `clearAll(): void` - 清空所有元素
- `exportElements(): string` - 导出元素配置
- `importElements(jsonData: string): boolean` - 导入元素配置
- `validateAllElements()` - 验证所有元素

### InstructionParser (指令解析器)

#### 方法
- `parseFromJSON(jsonString: string): BaseInstruction[]` - 从JSON解析指令
- `parseFromFile(filePath: string): Promise<BaseInstruction[]>` - 从文件解析指令
- `serializeToJSON(instructions: BaseInstruction[]): string` - 序列化指令为JSON
- `validateInstructionData(data: any)` - 验证指令数据格式
- `validateInstructionsData(data: any[])` - 批量验证指令数据

### WebCrawler (爬虫控制器)

#### 方法
- `loadAndExecuteInstructions(jsonData: string): Promise<void>` - 加载并执行指令
- `loadAndExecuteFromFile(filePath: string): Promise<void>` - 从文件加载并执行指令
- `addInstruction(instruction: BaseInstruction): void` - 添加单个指令
- `addInstructions(instructions: BaseInstruction[]): void` - 添加多个指令
- `executeAll(): Promise<void>` - 执行所有指令
- `pause(): void` - 暂停执行
- `stop(): void` - 停止执行
- `getStatistics()` - 获取执行统计信息
- `getResults()` - 获取执行结果
- `exportResults(): string` - 导出执行结果
- `exportElements(): string` - 导出元素配置
- `importElements(jsonData: string): boolean` - 导入元素配置
- `serializeInstructions(): string` - 序列化指令为JSON
- `refreshElements(): void` - 刷新所有元素
- `validateAll()` - 验证所有元素和指令

## 使用示例

### 基本使用
```typescript
import { WebCrawler } from './core/WebCrawler';

const crawler = new WebCrawler();
await crawler.loadAndExecuteInstructions(jsonData);
```

### 元素管理
```typescript
import { Element } from './types/Element';

const element = new Element({
  name: 'search_input',
  description: '搜索输入框',
  selector: '#search-input',
  selectorType: 'css'
});

crawler.getElementManager().setElement(element);
```

### 指令创建
```typescript
import { NavigateInstruction, ClickInstruction } from './types/Instructions';

const navInst = new NavigateInstruction({
  id: 'nav_1',
  url: 'https://example.com'
});

const clickInst = new ClickInstruction({
  id: 'click_1',
  elementName: 'search_button'
});
```

## JSON配置格式

### 指令配置
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
  }
]
```

### 元素配置
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
