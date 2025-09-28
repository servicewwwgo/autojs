import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  // 默认使用Chrome浏览器
  browser: 'chrome',
  // 配置manifest版本
  manifest: {
    version: '1.0.0',
    name: 'Web自动化爬虫',
    description: '基于WXT+Vue的Chrome浏览器扩展爬虫系统',
    permissions: [
      'activeTab',
      'tabs',
      'storage',
      'scripting'
    ],
    host_permissions: [
      '<all_urls>'
    ]
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
