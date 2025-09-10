/**
 * 无热重载开发运行脚本
 * 专门用于测试覆盖功能，避免重启问题
 */

const { spawn } = require('child_process');

console.log('🚀 启动Electron应用（无热重载模式）...');
console.log('💡 此模式下不会因为文件变化而重启应用');
console.log('💡 适合测试元件覆盖功能');
console.log('⏹️  按 Ctrl+C 停止应用\n');

// Windows环境下使用正确的命令
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['electron', '.'];

const electronProcess = spawn(command, args, {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
  shell: true,
  detached: false
});

console.log(`📋 Electron进程ID: ${electronProcess.pid}`);

electronProcess.on('close', (code) => {
  console.log(`🔚 Electron进程关闭，代码: ${code}`);
  process.exit(code);
});

electronProcess.on('error', (error) => {
  console.error('❌ Electron启动失败:', error);
  process.exit(1);
});

// 处理进程退出信号
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭应用...');

  if (electronProcess) {
    console.log('🔪 终止Electron进程...');

    if (process.platform === 'win32') {
      try {
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
  }

  console.log('✅ 应用已关闭');
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (electronProcess) {
    electronProcess.kill('SIGKILL');
  }
  process.exit(0);
});
