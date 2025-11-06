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
const watchExtensions = ['.js', '.html', '.css', '.json', '.mjs', '.txt'];

/**
 * 需要忽略的目录
 * 注意：data 文件夹完全忽略，避免项目保存时触发热重载
 */
const ignoreDirs = ['node_modules', 'dist', '.git', 'data'];

/**
 * 启动Electron应用
 */
function startElectron() {
  // 检查是否已有进程在运行
  if (electronProcess && !electronProcess.killed) {
    console.log('⚠️  已有Electron进程在运行，跳过启动');
    return;
  }
  
  console.log('🚀 启动Electron应用...');
  
  // Windows环境下使用正确的命令
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['electron', '.'];
  
  electronProcess = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
    shell: true,
    detached: false  // 确保子进程与父进程关联
  });

  console.log(`📋 Electron进程ID: ${electronProcess.pid}`);

  electronProcess.on('close', (code) => {
    console.log(`🔚 Electron进程关闭，代码: ${code}`);
    electronProcess = null;
  });

  electronProcess.on('error', (error) => {
    console.error('❌ Electron启动失败:', error);
    electronProcess = null;
  });
}

/**
 * 重启Electron应用
 */
function restartElectron() {
  console.log('🔄 重启Electron应用...');

  if (electronProcess) {
    console.log('⏹️  关闭旧进程...');
    
    // Windows下需要强制终止整个进程树
    if (process.platform === 'win32') {
      try {
        // 使用taskkill强制终止进程树
        spawn('taskkill', ['/pid', electronProcess.pid, '/t', '/f'], {
          stdio: 'ignore'
        });
      } catch (error) {
        console.warn('⚠️  taskkill失败，使用普通kill');
        electronProcess.kill('SIGKILL');
      }
    } else {
      electronProcess.kill('SIGTERM');
    }
    
    electronProcess = null;
  }

  // 延迟重启，确保进程完全关闭
  setTimeout(() => {
    console.log('✨ 启动新进程...');
    startElectron();
  }, 2000);
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

  // 检查是否在忽略目录中（更严格的检查）
  const relativePath = path.relative(process.cwd(), filePath);
  for (const ignoreDir of ignoreDirs) {
    // 检查是否以忽略目录开头，或者包含忽略目录路径
    if (relativePath.startsWith(ignoreDir + path.sep) ||
        relativePath.startsWith(ignoreDir + '/') ||
        relativePath.includes(path.sep + ignoreDir + path.sep) ||
        relativePath.includes('/' + ignoreDir + '/') ||
        relativePath === ignoreDir) {
      console.log(`🚫 忽略文件: ${relativePath} (在忽略目录 ${ignoreDir} 中)`);
      return false;
    }
  }

  console.log(`👀 监控文件: ${relativePath}`);
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
    console.log('🔪 强制终止Electron进程...');
    
    // Windows下强制终止进程树
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', electronProcess.pid, '/t', '/f'], {
          stdio: 'ignore'
        });
      } catch (error) {
        electronProcess.kill('SIGKILL');
      }
    } else {
      electronProcess.kill('SIGKILL');
    }
    
    electronProcess = null;
  }
  
  console.log('✅ 开发服务器已关闭');
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
