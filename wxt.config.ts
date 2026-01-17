import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  entrypointsDir: './src/entrypoints',
  modules: ['@wxt-dev/module-vue'],
  // 默认使用Chrome浏览器
  browser: 'chrome',
  // 配置manifest版本
  manifest: {
    version: '1.1.0',
    name: '自动化网页',
    description: '基于WXT+Vue的Chrome浏览器自动化系统',
    permissions: [
      'activeTab',
      'tabs',
      'storage',
      'scripting',
      'alarms',
      'debugger',
      'nativeMessaging',
      'sidePanel'
    ],
    host_permissions: [
      '<all_urls>'
    ],
    side_panel: {
      default_path: 'sidepanel.html'
    },
    action: {
      default_title: '打开SemiAutoJs侧边栏'
    }
  },
  dev: {
    server: {
      port: 3000,
    },
  },
  vite: () => ({
    build: {
      sourcemap: true,
    },
  }),
  webExt: {
    binaries: {
      chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
    startUrls: ['https://www.facebook.com'],
    // 使用 WXT 的专用配置来指定用户数据目录
    chromiumProfile: resolve('.chrome-profile'),
    keepProfileChanges: true,
    chromiumArgs: [
      '--remote-debugging-port=9222',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=VizDisplayCompositor'
    ],
  },
});
