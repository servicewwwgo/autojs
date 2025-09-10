@echo off
echo 启动Chrome扩展开发环境...
echo.

echo 1. 安装依赖...
call npm install

echo.
echo 2. 启动开发服务器...
call npm run dev

echo.
echo 3. 请在Chrome中访问 chrome://extensions/
echo 4. 开启开发者模式
echo 5. 点击"加载已解压的扩展程序"
echo 6. 选择 .output/chrome-mv3 目录
echo.
pause
