import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '.');

// 读取 package.json 中的版本号
const packageJson = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf-8')
);
const version = packageJson.version;

// 读取 .env 文件
const envPath = resolve(rootDir, '.env');
let envContent = readFileSync(envPath, 'utf-8');

// 更新或添加 VITE_APP_VERSION
if (envContent.includes('VITE_APP_VERSION=')) {
  // 替换现有的版本号
  envContent = envContent.replace(
    /VITE_APP_VERSION=.*/,
    `VITE_APP_VERSION=${version}`
  );
} else {
  // 如果不存在，添加到文件末尾
  envContent += `\nVITE_APP_VERSION=${version}\n`;
}

// 写回 .env 文件
writeFileSync(envPath, envContent, 'utf-8');

console.log(`✅ 版本号已同步到 .env: ${version}`);
