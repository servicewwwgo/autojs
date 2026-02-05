import { resolve } from 'node:path';
import { defineConfig } from 'wxt';
import { readFileSync } from 'node:fs';

// 从 package.json 读取版本号作为单一数据源
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

// See https://wxt.dev/api/config.html
export default defineConfig({
  entrypointsDir: './src/entrypoints',
  modules: ['@wxt-dev/module-vue'],
  // 默认使用Chrome浏览器
  browser: 'chrome',
  // 配置manifest版本
  manifest: {
    version: appVersion,
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
      'cookies',
      'background'
    ],
    host_permissions: [
      '<all_urls>'
    ],
    action: {
      default_title: '打开SemiAutoJs'
    },
    background: {
      persistent: true,  // 保持后台页面常驻
      type: 'module'
    }
  },
  dev: {
    server: {
      port: 3000,
    },
  },
  vite: () => ({
    base: '', // 使用空字符串作为 base，生成相对路径
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          // 确保资源路径是相对路径
          assetFileNames: 'assets/[name].[hash][extname]',
          chunkFileNames: 'chunks/[name].[hash].js',
        },
      },
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
