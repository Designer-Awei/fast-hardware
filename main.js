/**
 * Fast Hardware - Electron主进程
 * 纯Electron实现，无React框架
 */

const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;

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
 * 窗口配置存储路径
 */
const WINDOW_CONFIG_PATH = path.join(app.getPath('userData'), 'window-config.json');

/**
 * 默认窗口配置
 */
const DEFAULT_WINDOW_CONFIG = {
  width: 1000,
  height: 650,
  x: null, // 居中显示
  y: null, // 居中显示
  isMaximized: false
};

/**
 * 保存窗口配置
 */
async function saveWindowConfig(window) {
  try {
    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();

    const config = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: isMaximized,
      timestamp: Date.now()
    };

    // 确保配置目录存在
    const configDir = path.dirname(WINDOW_CONFIG_PATH);
    await fs.mkdir(configDir, { recursive: true });

    await fs.writeFile(WINDOW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log('窗口配置已保存:', config);
  } catch (error) {
    console.error('保存窗口配置失败:', error);
  }
}

/**
 * 读取窗口配置
 */
async function loadWindowConfig() {
  try {
    const configData = await fs.readFile(WINDOW_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);

    // 验证配置数据的有效性
    if (config.width && config.height) {
      return config;
    }
  } catch (error) {
    console.log('读取窗口配置失败，使用默认配置:', error.message);
  }

  return DEFAULT_WINDOW_CONFIG;
}

/**
 * 验证窗口位置是否在有效范围内
 */
function validateWindowBounds(bounds) {
  try {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    // 检查窗口是否至少部分在某个显示器上
    const isVisible = displays.some(display => {
      const displayBounds = display.bounds;
      return !(bounds.x + bounds.width < displayBounds.x ||
               bounds.y + bounds.height < displayBounds.y ||
               bounds.x > displayBounds.x + displayBounds.width ||
               bounds.y > displayBounds.y + displayBounds.height);
    });

    if (!isVisible) {
      console.log('窗口位置超出屏幕范围，使用默认位置');
      return null;
    }

    return bounds;
  } catch (error) {
    console.error('验证窗口边界失败:', error);
    return null;
  }
}

/**
 * 创建主窗口
 */
async function createWindow() {
  console.log('正在创建主窗口...');

  // 读取保存的窗口配置
  const savedConfig = await loadWindowConfig();

  // 验证窗口位置是否有效
  let windowBounds = null;
  if (savedConfig.x !== null && savedConfig.y !== null) {
    windowBounds = validateWindowBounds({
      x: savedConfig.x,
      y: savedConfig.y,
      width: savedConfig.width,
      height: savedConfig.height
    });
  }

  // 创建浏览器窗口
  const windowOptions = {
    width: windowBounds ? windowBounds.width : savedConfig.width,
    height: windowBounds ? windowBounds.height : savedConfig.height,
    minHeight: 400,
    minWidth: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // 先隐藏，等配置完成后显示
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets/icon.png')
  };

  // 如果有有效的窗口位置，设置位置
  if (windowBounds) {
    windowOptions.x = windowBounds.x;
    windowOptions.y = windowBounds.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // 加载主页面
  console.log('加载主页面: index.html');
  mainWindow.loadFile('index.html');

  // 页面加载完成后显示窗口
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('页面加载完成');

    // 如果配置要求最大化，则最大化窗口
    if (savedConfig.isMaximized) {
      mainWindow.maximize();
    }

    // 显示窗口
    mainWindow.show();

    // 聚焦窗口
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
    // 即使加载失败也显示窗口
    mainWindow.show();
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }

  // 窗口尺寸变化事件 - 防抖保存
  let saveTimeout;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        saveWindowConfig(mainWindow);
      }
    }, 500); // 500ms防抖
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('maximize', () => {
    setTimeout(() => saveWindowConfig(mainWindow), 100);
  });
  mainWindow.on('unmaximize', () => {
    setTimeout(() => saveWindowConfig(mainWindow), 100);
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    console.log('主窗口已关闭');
    // 最后一次保存配置
    if (saveTimeout) clearTimeout(saveTimeout);
    mainWindow = null;
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

// 保存元件（带重复检查）
ipcMain.handle('saveComponent', async (event, component, savePath) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    console.log(`保存元件: ${component.name}, 路径: ${savePath}`);

    // 确定保存目录
    const baseDir = path.join(__dirname, 'data', 'system-components');
    const targetDir = path.join(baseDir, savePath === 'standard' ? 'standard' : 'custom');

    // 确保目录存在
    await fs.mkdir(targetDir, { recursive: true });

    // 生成文件名
    const fileName = `${component.id}.json`;
    const filePath = path.join(targetDir, fileName);

    // 检查文件是否已存在
    try {
      await fs.access(filePath);
      // 文件存在，返回重复标记
      return { duplicate: true, filePath };
    } catch {
      // 文件不存在，直接保存
      const jsonContent = JSON.stringify(component, null, 2);
      await fs.writeFile(filePath, jsonContent, 'utf8');

      console.log(`元件保存成功: ${filePath}`);
      return { success: true, filePath };
    }
  } catch (error) {
    console.error('保存元件失败:', error);
    return { success: false, error: error.message };
  }
});

// 强制保存元件（覆盖现有文件）
ipcMain.handle('saveComponentForce', async (event, component, savePath) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    console.log(`强制保存元件: ${component.name}, 路径: ${savePath}`);

    // 确定保存目录
    const baseDir = path.join(__dirname, 'data', 'system-components');
    const targetDir = path.join(baseDir, savePath === 'standard' ? 'standard' : 'custom');

    // 确保目录存在
    await fs.mkdir(targetDir, { recursive: true });

    // 生成文件名
    const fileName = `${component.id}.json`;
    const filePath = path.join(targetDir, fileName);

    // 保存文件（强制覆盖）
    const jsonContent = JSON.stringify(component, null, 2);
    await fs.writeFile(filePath, jsonContent, 'utf8');

    console.log(`元件强制保存成功: ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    console.error('强制保存元件失败:', error);
    return { success: false, error: error.message };
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