/**
 * 开发环境运行脚本
 * 提供热重载和自动重启功能
 */

const { spawn } = require('child_process');
const { watch } = require('fs');
const path = require('path');

/**
 * 当前electron进程
 */
let electronProcess = null;

/**
 * 需要监控的文件扩展名
 */
const watchExtensions = ['.js', '.html', '.css', '.json'];

/**
 * 需要忽略的目录
 */
const ignoreDirs = ['node_modules', 'dist', '.git'];

/**
 * 启动Electron应用
 */
function startElectron() {
  console.log('🚀 启动Electron应用...');
  
  // Windows环境下使用正确的命令
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'electron-dev'];
  
  electronProcess = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
    shell: true
  });

  electronProcess.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.log(`⚠️  Electron进程退出，代码: ${code}`);
    }
  });

  electronProcess.on('error', (error) => {
    console.error('❌ Electron启动失败:', error);
  });
}

/**
 * 重启Electron应用
 */
function restartElectron() {
  console.log('🔄 重启Electron应用...');
  
  if (electronProcess) {
    electronProcess.kill();
    electronProcess = null;
  }
  
  // 稍微延迟后重启，确保进程完全关闭
  setTimeout(startElectron, 1000);
}

/**
 * 检查文件是否需要监控
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否需要监控
 */
function shouldWatch(filePath) {
  // 检查是否为需要监控的文件扩展名
  const ext = path.extname(filePath);
  if (!watchExtensions.includes(ext)) {
    return false;
  }
  
  // 检查是否在忽略目录中
  const relativePath = path.relative(process.cwd(), filePath);
  for (const ignoreDir of ignoreDirs) {
    if (relativePath.includes(ignoreDir)) {
      return false;
    }
  }
  
  return true;
}

/**
 * 启动文件监控
 */
function startWatcher() {
  console.log('👀 启动文件监控...');
  console.log(`📁 监控目录: ${process.cwd()}`);
  console.log(`📄 监控扩展名: ${watchExtensions.join(', ')}`);
  
  let restartTimer = null;
  
  watch(process.cwd(), { recursive: true }, (eventType, filename) => {
    if (!filename || !shouldWatch(path.join(process.cwd(), filename))) {
      return;
    }
    
    console.log(`📝 文件变更: ${filename} (${eventType})`);
    
    // 防抖处理，避免频繁重启
    if (restartTimer) {
      clearTimeout(restartTimer);
    }
    
    restartTimer = setTimeout(() => {
      restartElectron();
    }, 500);
  });
}

/**
 * 处理进程退出
 */
function handleExit() {
  console.log('\n👋 正在关闭开发服务器...');
  
  if (electronProcess) {
    electronProcess.kill();
  }
  
  process.exit(0);
}

// 监听进程退出信号
process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
process.on('exit', handleExit);

// 启动开发环境
console.log('🔧 启动Electron开发环境');
console.log('💡 提示: 修改文件后应用会自动重载');
console.log('⏹️  按 Ctrl+C 停止开发服务器\n');

startWatcher();
startElectron();
