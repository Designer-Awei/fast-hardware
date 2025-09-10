#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

/**
 * 跨平台脚本运行器
 * 自动检测操作系统并执行相应的命令
 */

// 获取命令行参数
const args = process.argv.slice(2);
const scriptName = args[0] || 'dev';
const extraArgs = args.slice(1);

// 定义不同平台的命令映射
const platformCommands = {
  win32: {
    dev: ['cmd', ['/c', 'chcp 65001 >nul && node dev-runner.js']],
    'dev-simple': ['cmd', ['/c', 'chcp 65001 >nul && electron .']],
    'dev-debug': ['cmd', ['/c', 'chcp 65001 >nul && electron . --enable-logging']],
    'dev-no-reload': ['cmd', ['/c', 'chcp 65001 >nul && node dev-runner-no-reload.js']]
  },
  darwin: {
    dev: ['node', ['dev-runner.js']],
    'dev-simple': ['electron', ['.']],
    'dev-debug': ['electron', ['.', '--enable-logging']],
    'dev-no-reload': ['node', ['dev-runner-no-reload.js']]
  },
  linux: {
    dev: ['node', ['dev-runner.js']],
    'dev-simple': ['electron', ['.']],
    'dev-debug': ['electron', ['.', '--enable-logging']],
    'dev-no-reload': ['node', ['dev-runner-no-reload.js']]
  }
};

// 获取当前平台
const platform = process.platform;

// 检查平台是否支持
if (!platformCommands[platform]) {
  console.error(`❌ 不支持的平台: ${platform}`);
  console.error('支持的平台: win32, darwin, linux');
  process.exit(1);
}

// 获取要执行的命令
const commandConfig = platformCommands[platform][scriptName];

if (!commandConfig) {
  console.error(`❌ 未找到脚本: ${scriptName}`);
  console.error(`支持的脚本: ${Object.keys(platformCommands[platform]).join(', ')}`);
  process.exit(1);
}

// 执行命令
const [command, commandArgs] = commandConfig;
console.log(`🚀 在 ${platform} 平台上执行: ${command} ${commandArgs.join(' ')}`);

// 创建子进程
const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: platform === 'win32' // Windows需要shell来执行cmd
});

// 处理子进程事件
child.on('error', (error) => {
  console.error(`❌ 执行失败: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n👋 正在终止子进程...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n👋 正在终止子进程...');
  child.kill('SIGTERM');
});
