/**
 * Fast Hardware - Electron主进程
 * 纯Electron实现，无React框架
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

// 设置控制台编码为UTF-8
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('chcp 65001', { stdio: 'inherit' });
  } catch (error) {
    // 忽略编码设置错误
  }
}

// Fast Hardware主进程启动
console.log('Fast Hardware主进程启动...');

/**
 * 主窗口对象
 */
let mainWindow = null;

/**
 * 创建主窗口
 */
function createWindow() {
  console.log('正在创建主窗口...');
  
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: true,
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // 加载主页面
  console.log('加载主页面: index.html');
  mainWindow.loadFile('index.html');

  // 开发模式下打开开发者工具
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    console.log('主窗口已关闭');
    mainWindow = null;
  });
  
  // 页面加载完成事件
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('页面加载完成');
  });
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
  });
}

// 应用程序准备就绪时创建窗口
app.whenReady().then(() => {
  console.log('Electron应用程序已准备就绪');
  createWindow();
}).catch((error) => {
  console.error('应用程序初始化失败:', error);
});

// 当所有窗口关闭时退出应用程序
app.on('window-all-closed', () => {
  console.log('所有窗口已关闭');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 当应用程序被激活时
app.on('activate', () => {
  console.log('应用程序被激活');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC通信处理
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// 文件操作IPC
ipcMain.handle('save-file', async (event, filePath, content) => {
  const fs = require('fs').promises;
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-file', async (event, filePath) => {
  const fs = require('fs').promises;
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 读取元件文件夹
ipcMain.handle('read-component-files', async (event, directory) => {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    console.log(`读取元件文件夹: ${directory}`);
    
    // 读取目录下的所有.json文件
    const files = await fs.readdir(directory);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'README.md');
    
    const components = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(directory, file);
        const content = await fs.readFile(filePath, 'utf8');
        const component = JSON.parse(content);
        
        // 确保组件有必要的标签字段
        if (!component.tags) {
          component.tags = [component.name?.toLowerCase() || '', component.category || ''];
        }
        
        components.push(component);
        console.log(`加载元件: ${component.name}`);
      } catch (error) {
        console.error(`解析文件 ${file} 失败:`, error.message);
      }
    }
    
    console.log(`成功加载 ${components.length} 个元件`);
    return components;
  } catch (error) {
    console.error('读取元件文件夹失败:', error.message);
    return [];
  }
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

console.log('主进程脚本加载完成');