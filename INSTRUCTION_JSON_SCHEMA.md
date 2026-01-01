# 指令 JSON 数据结构文档

本文档描述了 `src/instructions` 目录下所有指令所需的 JSON 数据结构。

## 基础字段（所有指令共有）

所有指令都继承自 `BaseInstruction`，包含以下基础字段：

```json
{
  "tabId": 123, // 必需 - 标签页ID（number）
  "type": "指令类型", // 必需 - 指令类型（string）
  "instructionID": "unique-id", // 必需 - 指令唯一标识（string）
  "delay": 0.5, // 可选 - 延迟时间，单位：秒（number）
  "retry": 3, // 可选 - 重试次数（number）
  "timeout": 30, // 可选 - 超时时间，单位：秒（number）
  "ignoreError": false, // 可选 - 是否忽略错误（boolean）
  "created_at": 1234567890 // 必需 - 创建时间戳（number）
}
```

---

## 1. NavigateInstruction（页面导航指令）

导航到指定 URL。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "navigate",
  "instructionID": "nav-001",
  "params": {
    "url": "https://example.com"
  },
  "delay": 0,
  "retry": 0,
  "timeout": 30,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.url** (必需): 要导航到的 URL 地址（string）

### 示例

```json
{
  "tabId": 1,
  "type": "navigate",
  "instructionID": "nav-google",
  "params": {
    "url": "https://www.google.com"
  },
  "created_at": 1703123456789
}
```

---

## 2. ExecuteScriptInstruction（执行脚本指令）

在页面中执行 JavaScript 代码。该指令的参数直接传递给 CDP 的 `Runtime.evaluate` 方法。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "execute_script",
  "instructionID": "script-001",
  "params": {
    "expression": "document.title",
    "objectGroup": "console",
    "includeCommandLineAPI": false,
    "silent": false,
    "contextId": null,
    "returnByValue": true,
    "generatePreview": false,
    "userGesture": true,
    "awaitPromise": true,
    "throwOnSideEffect": false,
    "disableBreaks": false,
    "replMode": false,
    "allowUnsafeEvalBlockedByCSP": false,
    "uniqueContextId": null,
    "serializationOptions": null
  },
  "delay": 0,
  "retry": 0,
  "timeout": 30,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params** (必需): CDP Runtime.evaluate 方法的参数对象（any）
  - **expression** (必需): 要执行的 JavaScript 表达式或代码（string）
  - **returnByValue** (可选): 是否按值返回（boolean，默认：false）
  - **awaitPromise** (可选): 是否等待 Promise 完成（boolean，默认：false）
  - 其他参数请参考 Chrome DevTools Protocol 的 Runtime.evaluate 方法文档

### 示例

```json
{
  "tabId": 1,
  "type": "execute_script",
  "instructionID": "get-title",
  "params": {
    "expression": "document.title",
    "returnByValue": true,
    "awaitPromise": true
  },
  "created_at": 1703123456789
}
```

---

## 3. FindElementInstruction（查找元素指令）

查找页面中的元素。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "find_element",
  "instructionID": "find-001",
  "params": {
    "element": {
      "name": "searchInput",
      "description": "搜索输入框",
      "backup": "备用选择器",
      "selector": "#search-input",
      "selectorType": "css",
      "parentName": "searchContainer",
      "childrenName": "searchIcon",
      "siblingName": "searchButton",
      "siblingOffset": 1
    }
  },
  "delay": 0,
  "retry": 3,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.element** (必需): 元素数据对象（ElementData）
  - **name** (必需): 元素名称，用于后续引用（string）
  - **description** (必需): 元素描述（string）
  - **backup** (可选): 备用选择器或备注（string）
  - **selector** (必需): 元素选择器（string）
  - **selectorType** (必需): 选择器类型，可选值：`"css"` | `"id"` | `"tag"` | `"text"`（string）
  - **parentName** (可选): 父元素名称，用于区分多个匹配元素（string）
  - **childrenName** (可选): 子元素名称，用于区分多个匹配元素（string）
  - **siblingName** (可选): 兄弟元素名称，用于区分多个匹配元素（string）
  - **siblingOffset** (可选): 兄弟元素偏移量（number）

### 示例

#### CSS 选择器示例

```json
{
  "tabId": 1,
  "type": "find_element",
  "instructionID": "find-search-input",
  "params": {
    "element": {
      "name": "searchInput",
      "description": "搜索输入框",
      "selector": "#search-input",
      "selectorType": "css"
    }
  },
  "created_at": 1703123456789
}
```

#### ID 选择器示例

```json
{
  "tabId": 1,
  "type": "find_element",
  "instructionID": "find-submit-btn",
  "params": {
    "element": {
      "name": "submitButton",
      "description": "提交按钮",
      "selector": "submit-btn",
      "selectorType": "id"
    }
  },
  "created_at": 1703123456789
}
```

#### 带相对关系的示例

```json
{
  "tabId": 1,
  "type": "find_element",
  "instructionID": "find-specific-item",
  "params": {
    "element": {
      "name": "specificItem",
      "description": "特定项目",
      "selector": ".item",
      "selectorType": "css",
      "parentName": "container",
      "siblingName": "previousItem",
      "siblingOffset": 1
    }
  },
  "created_at": 1703123456789
}
```

---

## 4. InputInstruction（文本输入指令）

向输入框输入文本。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "input",
  "instructionID": "input-001",
  "params": {
    "elementName": "searchInput",
    "text": "Hello World",
    "clear": true
  },
  "delay": 0.1,
  "retry": 3,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.elementName** (必需): 元素名称，必须是已通过 `find_element` 指令找到的元素（string）
- **params.text** (必需): 要输入的文本内容（string）
- **params.clear** (可选): 是否在输入前清空输入框（boolean，默认：false）
- **delay** (可选): 每个字符输入之间的延迟时间，单位：秒（number）

### 示例

```json
{
  "tabId": 1,
  "type": "input",
  "instructionID": "input-search",
  "params": {
    "elementName": "searchInput",
    "text": "自动化测试",
    "clear": true
  },
  "delay": 0.05,
  "created_at": 1703123456789
}
```

---

## 5. KeyboardInstruction（键盘操作指令）

执行键盘按键操作。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "keyboard",
  "instructionID": "keyboard-001",
  "params": {
    "elementName": "searchInput",
    "action": "press",
    "key": "Enter"
  },
  "delay": 0.1,
  "retry": 0,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.elementName** (可选): 元素名称，如果指定则先聚焦该元素（string）
- **params.action** (必需): 操作类型，可选值：
  - `"press"`: 按下并释放（完整按键事件）
  - `"type"`: 逐个字符输入
  - `"keydown"`: 按下按键
  - `"keyup"`: 释放按键
- **params.key** (必需): 按键名称或字符（string）
  - 特殊按键：`Enter`, `Escape`, `Tab`, `Backspace`, `Delete`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `F1`-`F12`, `Control`, `Alt`, `Shift`, `Meta`
  - 普通字符：直接使用字符，如 `"a"`, `"1"`, `"A"` 等

### 示例

#### 按下 Enter 键

```json
{
  "tabId": 1,
  "type": "keyboard",
  "instructionID": "press-enter",
  "params": {
    "action": "press",
    "key": "Enter"
  },
  "created_at": 1703123456789
}
```

#### 在元素上按下 Ctrl+A

```json
{
  "tabId": 1,
  "type": "keyboard",
  "instructionID": "select-all",
  "params": {
    "elementName": "textInput",
    "action": "press",
    "key": "a"
  },
  "created_at": 1703123456789
}
```

#### 输入文本

```json
{
  "tabId": 1,
  "type": "keyboard",
  "instructionID": "type-text",
  "params": {
    "elementName": "inputField",
    "action": "type",
    "key": "Hello"
  },
  "delay": 0.05,
  "created_at": 1703123456789
}
```

---

## 6. MouseInstruction（鼠标操作指令）

执行鼠标操作。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "mouse",
  "instructionID": "mouse-001",
  "params": {
    "action": "click",
    "elementName": "submitButton",
    "x": 100,
    "y": 200,
    "simulate": "calculated"
  },
  "delay": 0.5,
  "retry": 3,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.action** (必需): 鼠标操作类型，可选值：
  - `"click"`: 左键单击
  - `"dblclick"`: 左键双击
  - `"rightclick"`: 右键单击
  - `"hover"`: 悬停
  - `"left_mousedown"`: 左键按下
  - `"left_mouseup"`: 左键释放
  - `"right_mousedown"`: 右键按下
  - `"right_mouseup"`: 右键释放
  - `"move_to"`: 移动到指定位置
- **params.elementName** (可选): 元素名称，如果指定则在该元素上执行操作（string）
- **params.x** (可选): 目标 X 坐标，如果指定了 `elementName` 则忽略此参数（number）
- **params.y** (可选): 目标 Y 坐标，如果指定了 `elementName` 则忽略此参数（number）
- **params.simulate** (可选): 鼠标轨迹模拟方式，可选值：
  - `"none"`: 不模拟，直接移动到目标位置
  - `"calculated"`: 使用贝塞尔曲线模拟（默认）
  - `"simulated"`: 使用更复杂的算法模拟

### 示例

#### 点击元素

```json
{
  "tabId": 1,
  "type": "mouse",
  "instructionID": "click-submit",
  "params": {
    "action": "click",
    "elementName": "submitButton",
    "simulate": "calculated"
  },
  "created_at": 1703123456789
}
```

#### 点击坐标位置

```json
{
  "tabId": 1,
  "type": "mouse",
  "instructionID": "click-coord",
  "params": {
    "action": "click",
    "x": 500,
    "y": 300,
    "simulate": "simulated"
  },
  "created_at": 1703123456789
}
```

#### 右键点击

```json
{
  "tabId": 1,
  "type": "mouse",
  "instructionID": "right-click",
  "params": {
    "action": "rightclick",
    "elementName": "contextMenu"
  },
  "created_at": 1703123456789
}
```

#### 悬停

```json
{
  "tabId": 1,
  "type": "mouse",
  "instructionID": "hover-menu",
  "params": {
    "action": "hover",
    "elementName": "menuItem"
  },
  "created_at": 1703123456789
}
```

---

## 7. GetAttributeInstruction（获取元素属性指令）

获取元素的属性值。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "get_attribute",
  "instructionID": "get-attr-001",
  "params": {
    "elementName": "searchInput",
    "attribute": "value",
    "usage": "variable"
  },
  "delay": 0,
  "retry": 3,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.elementName** (必需): 元素名称，必须是已通过 `find_element` 指令找到的元素（string）
- **params.attribute** (必需): 要获取的属性名称（string）
- **params.usage** (可选): 使用方式，可选值：`"variable"` | `"data"` | `"none"`（string，默认：`"data"`）

### 示例

```json
{
  "tabId": 1,
  "type": "get_attribute",
  "instructionID": "get-input-value",
  "params": {
    "elementName": "searchInput",
    "attribute": "value",
    "usage": "variable"
  },
  "created_at": 1703123456789
}
```

---

## 8. SetAttributeInstruction（设置元素属性指令）

设置元素的属性值。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "set_attribute",
  "instructionID": "set-attr-001",
  "params": {
    "elementName": "searchInput",
    "attribute": "value",
    "value": "新值"
  },
  "delay": 0,
  "retry": 3,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.elementName** (必需): 元素名称，必须是已通过 `find_element` 指令找到的元素（string）
- **params.attribute** (必需): 要设置的属性名称（string）
- **params.value** (必需): 要设置的属性值（string）

### 示例

```json
{
  "tabId": 1,
  "type": "set_attribute",
  "instructionID": "set-input-value",
  "params": {
    "elementName": "searchInput",
    "attribute": "value",
    "value": "搜索关键词"
  },
  "created_at": 1703123456789
}
```

---

## 9. ScreenshotInstruction（页面截图指令）

对页面进行截图。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "screenshot",
  "instructionID": "screenshot-001",
  "params": {
    "format": "png",
    "quality": 100,
    "fullPage": false
  },
  "delay": 0,
  "retry": 0,
  "timeout": 30,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.format** (可选): 图片格式，可选值：`"png"` | `"jpeg"`（默认：`"png"`）
- **params.quality** (可选): 图片质量，范围 0-100，仅对 JPEG 格式有效（默认：100）（number）
- **params.fullPage** (可选): 是否截取整个页面（boolean，默认：false）

### 示例

#### PNG 格式截图

```json
{
  "tabId": 1,
  "type": "screenshot",
  "instructionID": "screenshot-png",
  "params": {
    "format": "png",
    "fullPage": false
  },
  "created_at": 1703123456789
}
```

#### JPEG 格式全页截图

```json
{
  "tabId": 1,
  "type": "screenshot",
  "instructionID": "screenshot-jpeg-full",
  "params": {
    "format": "jpeg",
    "quality": 85,
    "fullPage": true
  },
  "created_at": 1703123456789
}
```

---

## 10. WaitInstruction（等待指令）

等待特定条件满足。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "wait",
  "instructionID": "wait-001",
  "params": {
    "waitType": "wait_element_visible",
    "elementName": "searchInput",
    "titleText": "页面标题",
    "element": {
      "name": "searchInput",
      "description": "搜索输入框",
      "selector": "#search-input",
      "selectorType": "css"
    },
    "attribute": "class",
    "attributeText": "visible"
  },
  "delay": 0,
  "retry": 0,
  "timeout": 30,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.waitType** (必需): 等待类型，可选值：
  - `"wait_title_contains"`: 等待页面标题包含指定文本
  - `"wait_element_exists"`: 等待元素存在于 DOM 中
  - `"wait_element_visible"`: 等待元素可见
  - `"wait_attribute_contains"`: 等待元素的某个属性值包含指定文本
- **params.titleText** (可选): 等待标题包含的文本，仅用于 `wait_title_contains`（string）
- **params.elementName** (可选): 元素名称，用于 `wait_element_exists`、`wait_element_visible`、`wait_attribute_contains`（string）
- **params.element** (可选): 元素数据对象，当 `elementName` 不存在时使用，用于 `wait_element_exists`、`wait_element_visible`、`wait_attribute_contains`（ElementData）
- **params.attribute** (可选): 属性名称，仅用于 `wait_attribute_contains`（string）
- **params.attributeText** (可选): 属性值应包含的文本，仅用于 `wait_attribute_contains`（string）

### 示例

#### 等待标题包含文本

```json
{
  "tabId": 1,
  "type": "wait",
  "instructionID": "wait-title",
  "params": {
    "waitType": "wait_title_contains",
    "titleText": "搜索结果"
  },
  "timeout": 30,
  "created_at": 1703123456789
}
```

#### 等待元素存在

```json
{
  "tabId": 1,
  "type": "wait",
  "instructionID": "wait-element-exists",
  "params": {
    "waitType": "wait_element_exists",
    "elementName": "searchInput"
  },
  "timeout": 10,
  "created_at": 1703123456789
}
```

#### 等待元素可见

```json
{
  "tabId": 1,
  "type": "wait",
  "instructionID": "wait-element-visible",
  "params": {
    "waitType": "wait_element_visible",
    "elementName": "submitButton"
  },
  "timeout": 10,
  "created_at": 1703123456789
}
```

#### 等待属性包含文本

```json
{
  "tabId": 1,
  "type": "wait",
  "instructionID": "wait-attribute",
  "params": {
    "waitType": "wait_attribute_contains",
    "elementName": "statusElement",
    "attribute": "class",
    "attributeText": "loaded"
  },
  "timeout": 30,
  "created_at": 1703123456789
}
```

---

## 11. GetUrlInstruction（获取当前标签页 URL 指令）

获取当前标签页的 URL。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "get_url",
  "instructionID": "get-url-001",
  "params": {
    "usage": "variable"
  },
  "delay": 0,
  "retry": 0,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params.usage** (可选): 使用方式，可选值：`"variable"` | `"data"` | `"none"`（string，默认：`"data"`）

### 示例

```json
{
  "tabId": 1,
  "type": "get_url",
  "instructionID": "get-current-url",
  "params": {
    "usage": "variable"
  },
  "created_at": 1703123456789
}
```

---

## 12. ActivateTabInstruction（激活标签页指令）

激活指定的标签页。

### JSON 结构

```json
{
  "tabId": 123,
  "type": "activate_tab",
  "instructionID": "activate-tab-001",
  "params": {},
  "delay": 0,
  "retry": 0,
  "timeout": 10,
  "ignoreError": false,
  "created_at": 1234567890
}
```

### 字段说明

- **params** (可选): 无需额外参数，使用指令的 `tabId` 属性来激活对应的标签页

### 示例

```json
{
  "tabId": 1,
  "type": "activate_tab",
  "instructionID": "activate-tab",
  "params": {},
  "created_at": 1703123456789
}
```

---

## 完整示例：自动化搜索流程

以下是一个完整的自动化搜索流程示例，展示了如何组合使用多个指令：

```json
[
  {
    "tabId": 1,
    "type": "navigate",
    "instructionID": "nav-google",
    "params": {
      "url": "https://www.google.com"
    },
    "created_at": 1703123456789
  },
  {
    "tabId": 1,
    "type": "find_element",
    "instructionID": "find-search-box",
    "params": {
      "element": {
        "name": "searchBox",
        "description": "Google 搜索框",
        "selector": "textarea[name='q']",
        "selectorType": "css"
      }
    },
    "retry": 3,
    "timeout": 10,
    "created_at": 1703123456790
  },
  {
    "tabId": 1,
    "type": "input",
    "instructionID": "input-search",
    "params": {
      "elementName": "searchBox",
      "text": "自动化测试",
      "clear": true
    },
    "delay": 0.05,
    "created_at": 1703123456791
  },
  {
    "tabId": 1,
    "type": "find_element",
    "instructionID": "find-search-button",
    "params": {
      "element": {
        "name": "searchButton",
        "description": "搜索按钮",
        "selector": "input[type='submit']",
        "selectorType": "css"
      }
    },
    "created_at": 1703123456792
  },
  {
    "tabId": 1,
    "type": "mouse",
    "instructionID": "click-search",
    "params": {
      "action": "click",
      "elementName": "searchButton",
      "simulate": "calculated"
    },
    "created_at": 1703123456793
  },
  {
    "tabId": 1,
    "type": "screenshot",
    "instructionID": "screenshot-results",
    "params": {
      "format": "png",
      "fullPage": true
    },
    "delay": 2,
    "created_at": 1703123456794
  }
]
```

---

## 注意事项

1. **参数结构**：所有指令的参数都应该放在 `params` 对象中，而不是直接在指令的根级别。

2. **元素引用顺序**：使用 `params.elementName` 的指令（如 `input`, `mouse`, `get_attribute`, `set_attribute`）必须在对应的 `find_element` 指令之后执行。

3. **延迟时间单位**：所有 `delay` 字段的单位都是**秒**，不是毫秒。

4. **重试机制**：`retry` 字段表示重试次数，`retry: 0` 表示不重试（但仍会执行一次），`retry: 3` 表示最多执行 4 次（初始 + 3 次重试）。

5. **时间戳**：`created_at` 字段应使用 Unix 时间戳（毫秒）。

6. **指令 ID 唯一性**：每个指令的 `instructionID` 应该是唯一的。

7. **标签页 ID**：确保 `tabId` 对应的标签页存在且已连接 CDP。

8. **选择器类型**：`selectorType` 支持的值是 `"css"` | `"id"` | `"tag"` | `"text"`，不支持 `"xpath"`。
