# Chrome扩展安装和使用指南

## 开发环境设置

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式运行
```bash
# 在Chrome中运行开发版本
npm run dev

# 或者指定Chrome浏览器
npm run dev -- -b chrome
```

### 3. 构建生产版本
```bash
# 构建Chrome扩展
npm run build

# 或者指定Chrome浏览器
npm run build -- -b chrome
```

## Chrome扩展安装

### 方法1: 开发模式安装

1. 运行 `npm run dev` 启动开发服务器
2. 打开Chrome浏览器
3. 访问 `chrome://extensions/`
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择项目的 `.output/chrome-mv3` 目录
7. 扩展安装完成

### 方法2: 生产版本安装

1. 运行 `npm run build` 构建生产版本
2. 运行 `npm run zip` 创建zip包
3. 在Chrome扩展管理页面选择zip文件安装

## 使用说明

### 1. 激活扩展
- 安装后，扩展图标会出现在Chrome工具栏
- 点击图标打开爬虫控制台

### 2. 配置指令
- 在控制台输入JSON格式的指令配置
- 可以使用"加载示例"按钮加载示例配置
- 支持的指令类型包括：
  - 页面导航
  - 元素定位
  - 鼠标操作
  - 键盘操作
  - 文本输入
  - 等待操作
  - 数据获取

### 3. 执行指令
- 点击"开始执行"按钮开始自动化操作
- 可以随时暂停或停止执行
- 查看实时执行日志和结果

### 4. 导出结果
- 执行完成后可以导出结果数据
- 支持JSON格式的结果导出

## 权限说明

扩展需要以下权限：
- `activeTab`: 访问当前活动标签页
- `tabs`: 管理标签页
- `storage`: 存储配置数据
- `scripting`: 注入脚本到页面
- `<all_urls>`: 访问所有网站

## 故障排除

### 1. 扩展无法加载
- 确保Chrome版本支持Manifest V3
- 检查是否有语法错误
- 查看Chrome扩展页面的错误信息

### 2. 指令执行失败
- 检查目标网站是否允许脚本注入
- 验证元素选择器是否正确
- 查看控制台日志获取详细错误信息

### 3. 权限问题
- 确保扩展有足够权限访问目标网站
- 检查host_permissions配置

## 开发调试

### 1. 查看日志
- 打开Chrome开发者工具
- 查看Console标签页的日志输出
- 检查Network标签页的网络请求

### 2. 调试Content Script
- 在扩展管理页面点击"检查视图"
- 选择"content.js"进行调试

### 3. 调试Popup
- 右键点击扩展图标
- 选择"检查弹出内容"

## 构建和发布

### 1. 构建扩展
```bash
npm run build
```

### 2. 创建发布包
```bash
npm run zip
```

### 3. 发布到Chrome Web Store
1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. 上传zip文件
3. 填写扩展信息
4. 提交审核

## 注意事项

1. **安全性**: 确保只在可信网站上使用爬虫功能
2. **性能**: 避免在大型网站上执行过多指令
3. **合规性**: 遵守目标网站的使用条款和robots.txt
4. **更新**: 定期更新扩展以获取最新功能和安全修复

## 支持

如果遇到问题，请检查：
1. Chrome版本是否支持
2. 扩展权限是否正确
3. 指令配置是否有效
4. 目标网站是否可访问
