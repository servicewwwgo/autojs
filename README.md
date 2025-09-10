# Web自动化爬虫Chrome扩展

基于WXT+Vue 3技术栈开发的Chrome浏览器扩展爬虫系统，支持通过JSON配置文件定义和执行Web自动化操作。

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动开发环境
```bash
# Chrome浏览器（默认）
npm run dev

# 或指定浏览器
npm run dev -- -b chrome
```

### 3. 安装扩展
1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `.output/chrome-mv3` 目录

## 功能特性

- 🎯 **元素管理**: 支持CSS选择器、XPath、ID定位
- 🤖 **指令系统**: 8种指令类型（导航、点击、输入、等待等）
- 📊 **执行控制**: 批量执行、重试、超时控制
- 🔧 **配置驱动**: JSON格式的指令配置
- 📱 **用户界面**: 现代化的Vue 3控制台
- 🔍 **实时监控**: 执行日志和结果展示

## 支持的指令类型

- **页面导航**: 控制页面跳转
- **元素定位**: 定位和验证页面元素
- **鼠标操作**: 点击、拖拽等操作
- **键盘操作**: 文本输入、按键模拟
- **等待操作**: 多种等待条件
- **数据获取**: 提取页面文本内容

## 开发命令

```bash
# 开发模式
npm run dev          # Chrome（默认）
npm run dev:firefox  # Firefox
npm run dev:edge     # Edge

# 构建
npm run build        # Chrome（默认）
npm run build:firefox # Firefox
npm run build:edge   # Edge

# 打包
npm run zip          # Chrome（默认）
npm run zip:firefox  # Firefox
npm run zip:edge     # Edge
```

## 文档

- [系统架构文档](docs/README.md)
- [API文档](docs/API.md)
- [Chrome安装指南](docs/CHROME_SETUP.md)

## 技术栈

- **WXT**: Chrome扩展开发框架
- **Vue 3**: 现代化前端框架
- **TypeScript**: 类型安全的JavaScript
- **Chrome Extension API**: 浏览器扩展API

## 推荐IDE设置

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
