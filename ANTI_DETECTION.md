# 反自动化检测说明

## 网页 JavaScript 如何检测 CDP 鼠标事件

网页可以通过以下方式检测到 CDP 发送的鼠标事件：

### 1. `event.isTrusted` 属性检测

**检测方法**：
```javascript
document.addEventListener('click', (event) => {
  if (!event.isTrusted) {
    console.log('检测到自动化工具：事件不是用户真实操作触发的');
    // 阻止操作或标记为可疑
  }
});
```

**说明**：
- CDP 发送的鼠标事件 `isTrusted` 属性为 `false`
- 真实用户操作的事件 `isTrusted` 属性为 `true`
- 这是最常用的检测方法

**我们的应对**：
- 在 `content.ts` 中拦截所有鼠标事件监听器
- 伪造 `isTrusted` 属性为 `true`
- 在页面脚本运行之前就设置好，确保所有监听器都能收到伪造的值

### 2. 鼠标位置不一致检测

**检测方法**：
```javascript
let lastMousePosition = { x: 0, y: 0 };

document.addEventListener('mousemove', (event) => {
  const currentPosition = { x: event.clientX, y: event.clientY };
  
  // 检查鼠标位置是否突然跳跃（CDP 事件可能导致位置不一致）
  const distance = Math.sqrt(
    Math.pow(currentPosition.x - lastMousePosition.x, 2) +
    Math.pow(currentPosition.y - lastMousePosition.y, 2)
  );
  
  if (distance > 100) {
    console.log('检测到异常鼠标移动：位置跳跃过大');
  }
  
  lastMousePosition = currentPosition;
});
```

**说明**：
- CDP 的 `mouseMoved` 事件不会更新浏览器窗口中实际的鼠标指针位置
- 但事件会正确触发，`event.clientX` 和 `event.clientY` 会是 CDP 指定的坐标
- 如果网页检测到鼠标事件触发了，但实际的鼠标指针位置没有变化，就可以判断这是自动化工具

**我们的应对**：
- 使用轨迹模拟，让鼠标移动更平滑
- 增加延迟时间，模拟真实的鼠标移动速度
- 但这无法完全解决，因为 CDP 就是不能移动实际的鼠标指针

### 3. 鼠标移动轨迹检测

**检测方法**：
```javascript
const mouseTrail = [];

document.addEventListener('mousemove', (event) => {
  mouseTrail.push({
    x: event.clientX,
    y: event.clientY,
    timestamp: Date.now()
  });
  
  // 只保留最近 10 个点
  if (mouseTrail.length > 10) {
    mouseTrail.shift();
  }
  
  // 检查轨迹是否过于规律（自动化工具可能产生规律的轨迹）
  if (mouseTrail.length >= 5) {
    const distances = [];
    for (let i = 1; i < mouseTrail.length; i++) {
      const dist = Math.sqrt(
        Math.pow(mouseTrail[i].x - mouseTrail[i-1].x, 2) +
        Math.pow(mouseTrail[i].y - mouseTrail[i-1].y, 2)
      );
      distances.push(dist);
    }
    
    // 如果距离变化太小，可能是自动化工具
    const variance = calculateVariance(distances);
    if (variance < threshold) {
      console.log('检测到异常鼠标轨迹：过于规律');
    }
  }
});
```

**说明**：
- 真实用户的鼠标移动轨迹是不规律的
- 自动化工具可能产生过于规律的轨迹
- 可以通过分析轨迹的方差来判断

**我们的应对**：
- 使用贝塞尔曲线模拟真实轨迹
- 添加随机抖动（jitter）
- 使用速度曲线（ease-in-out）
- 添加随机延迟

### 4. 鼠标事件时序检测

**检测方法**：
```javascript
const eventTimings = [];

document.addEventListener('mousemove', (event) => {
  eventTimings.push(Date.now());
  
  // 检查事件间隔是否过于规律
  if (eventTimings.length >= 5) {
    const intervals = [];
    for (let i = 1; i < eventTimings.length; i++) {
      intervals.push(eventTimings[i] - eventTimings[i-1]);
    }
    
    // 如果间隔过于规律，可能是自动化工具
    const variance = calculateVariance(intervals);
    if (variance < threshold) {
      console.log('检测到异常事件时序：过于规律');
    }
  }
});
```

**说明**：
- 真实用户的鼠标移动间隔是不规律的
- 自动化工具可能产生过于规律的间隔

**我们的应对**：
- 使用随机延迟
- 根据距离动态调整延迟时间
- 添加速度曲线，让间隔更自然

## 我们的反检测措施

### 1. 隐藏 `navigator.webdriver` 属性

**位置**：`content.ts` 的 `hideWebdriver()` 函数

**方法**：
- 使用 `Object.defineProperty` 重新定义 `webdriver` 属性为 `undefined`
- 在 `document_start` 阶段运行，确保在页面脚本之前执行

### 2. 伪造 `event.isTrusted` 属性

**位置**：`content.ts` 的 `fakeMouseEventIsTrusted()` 函数

**方法**：
- 拦截 `EventTarget.prototype.addEventListener`
- 对于鼠标相关事件，包装监听器函数
- 在事件对象上伪造 `isTrusted` 属性为 `true`

### 3. 真实的鼠标轨迹模拟

**位置**：`MouseInstruction.ts` 的轨迹模拟方法

**方法**：
- 使用贝塞尔曲线模拟真实轨迹
- 添加随机抖动
- 使用速度曲线（ease-in-out）
- 根据距离动态调整延迟时间

## 限制和注意事项

### 1. CDP 的限制

**无法移动实际的鼠标指针**：
- Chrome DevTools Protocol 的 `Input.dispatchMouseEvent` 发送 `mouseMoved` 事件时，不会更新浏览器窗口中实际的鼠标指针位置
- 这是 Chrome 的安全特性，无法绕过
- 虽然事件会正确触发，但视觉上鼠标指针不会移动

### 2. 检测的局限性

**无法完全避免检测**：
- 某些网站可能使用更复杂的检测方法
- 某些检测方法可能无法完全绕过
- 完全避免检测是不可能的

### 3. 建议

**合理使用**：
- 不要过于频繁地执行自动化操作
- 添加适当的延迟，模拟真实用户行为
- 使用真实的鼠标轨迹模拟
- 避免在短时间内执行大量操作

## 总结

网页 JavaScript **可以**检测到 CDP 鼠标事件，并且**可以**用这个特性来反自动化。但我们已经实现了以下反检测措施：

1. ✅ 隐藏 `navigator.webdriver` 属性
2. ✅ 伪造 `event.isTrusted` 属性
3. ✅ 真实的鼠标轨迹模拟
4. ✅ 随机延迟和抖动

虽然无法完全避免检测，但这些措施可以大大降低被检测的风险。

