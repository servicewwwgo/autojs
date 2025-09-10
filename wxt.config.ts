import { defineConfig } from 'wxt';

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
  }
});
