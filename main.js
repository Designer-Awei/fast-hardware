/**
 * Fast Hardware - Electron主进程
 * 纯Electron实现，无React框架
 */

const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog } = require('electron');
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

  // 设置窗口位置
  if (windowBounds) {
    // 使用保存的有效位置
    windowOptions.x = windowBounds.x;
    windowOptions.y = windowBounds.y;
  } else {
    // 没有有效位置时，将窗口居中显示
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const windowWidth = windowOptions.width;
    const windowHeight = windowOptions.height;

    windowOptions.x = Math.round((screenWidth - windowWidth) / 2);
    windowOptions.y = Math.round((screenHeight - windowHeight) / 2);
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
ipcMain.handle('save-file', async (event, filePath, content, createDir = false) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    // 如果需要创建目录且内容为空，只创建目录
    if (createDir && (!content || content === '')) {
      await fs.mkdir(filePath, { recursive: true });
      return { success: true };
    }

    // 如果需要创建目录，先创建父目录
    if (createDir) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
    }

    // 写入文件内容
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

    // 确定保存目录和前缀
    const baseDir = path.join(__dirname, 'data', 'system-components');
    const targetDir = path.join(baseDir, savePath === 'standard' ? 'standard' : 'custom');
    const prefix = savePath === 'standard' ? 'std' : 'ctm';

    // 确保目录存在
    await fs.mkdir(targetDir, { recursive: true });

    // 重新生成ID（确保格式统一）
    const newComponent = { ...component };
    newComponent.id = generateStructuredComponentId(component.name, prefix);

    // 生成文件名
    const fileName = `${newComponent.id}.json`;
    const filePath = path.join(targetDir, fileName);

    // 保存文件（强制覆盖）
    const jsonContent = JSON.stringify(newComponent, null, 2);
    await fs.writeFile(filePath, jsonContent, 'utf8');

    console.log(`元件强制保存成功: ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    console.error('强制保存元件失败:', error);
    return { success: false, error: error.message };
  }
});

// 编辑模式保存元件（智能查找原文件位置）
ipcMain.handle('saveComponentEditMode', async (event, component) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    console.log(`编辑模式保存元件: ${component.name}, ID: ${component.id}`);

    const baseDir = path.join(__dirname, 'data', 'system-components');
    const originalFileName = `${component.id}.json`;

    // 首先尝试在标准库中查找原文件
    let targetDir = path.join(baseDir, 'standard');
    let filePath = path.join(targetDir, originalFileName);
    let prefix = 'std';

    try {
      await fs.access(filePath);
      console.log(`找到原文件在标准库: ${filePath}`);
    } catch {
      // 如果标准库中没有，尝试在自定义库中查找
      targetDir = path.join(baseDir, 'custom');
      filePath = path.join(targetDir, originalFileName);
      prefix = 'ctm';

      try {
        await fs.access(filePath);
        console.log(`找到原文件在自定义库: ${filePath}`);
      } catch {
        // 如果两个库中都没有该文件，报错
        throw new Error(`找不到原元件文件: ${component.id}`);
      }
    }

    // 确保目录存在
    await fs.mkdir(targetDir, { recursive: true });

    // 重新生成ID（确保格式统一）
    const newComponent = { ...component };
    newComponent.id = generateStructuredComponentId(component.name, prefix);

    // 如果ID发生变化，需要重命名文件
    const newFileName = `${newComponent.id}.json`;
    const newFilePath = path.join(targetDir, newFileName);

    // 保存文件（强制覆盖）
    const jsonContent = JSON.stringify(newComponent, null, 2);
    await fs.writeFile(newFilePath, jsonContent, 'utf8');

    // 如果文件名发生变化，删除旧文件
    if (originalFileName !== newFileName) {
      try {
        await fs.unlink(filePath);
        console.log(`删除旧文件: ${filePath}`);
      } catch (deleteError) {
        console.warn(`删除旧文件失败: ${deleteError.message}`);
      }
    }

    console.log(`编辑模式元件保存成功: ${newFilePath}`);
    return { success: true, filePath: newFilePath };
  } catch (error) {
    console.error('编辑模式保存元件失败:', error);
    return { success: false, error: error.message };
  }
});

// 生成结构化元件ID
function generateStructuredComponentId(componentName, prefix) {
  let baseName = '';

  if (componentName && componentName.trim()) {
    // 如果有名称，使用名称生成基础ID
    baseName = componentName
      .trim()
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '') // 移除特殊字符（支持中文）
      .replace(/[\u4e00-\u9fa5]/g, (match) => {
        // 将中文字符转换为拼音首字母（简化版）
        const pinyinMap = {
          '传感器': 'sensor', '模块': 'module', '控制器': 'ctrl',
          '驱动': 'driver', '接口': 'interface', '转换器': 'converter',
          '放大器': 'amp', '开关': 'switch', '显示器': 'display',
          '电机': 'motor', '舵机': 'servo', '灯': 'led'
        };
        return pinyinMap[match] || match.charAt(0);
      })
      .replace(/\s+/g, '-') // 替换空格为-
      .replace(/-+/g, '-') // 合并多个-
      .replace(/^-|-$/g, '') // 移除开头和结尾的-
      .substring(0, 15); // 限制长度
  } else {
    // 如果没有名称，使用默认名称
    baseName = 'component';
  }

  // 生成时间戳
  const now = new Date();
  const timeString = now.getHours().toString().padStart(2, '0') +
                     now.getMinutes().toString().padStart(2, '0') +
                     now.getSeconds().toString().padStart(2, '0');

  // 生成最终的ID（使用简化的前缀）
  const finalId = `${prefix}-${baseName}-${timeString}`;
  console.log(`生成结构化ID: ${finalId} (名称: "${componentName}", 前缀: ${prefix})`);
  return finalId;
}

// 删除元件
ipcMain.handle('deleteComponent', async (event, component) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    console.log(`删除元件: ${component.name}, ID: ${component.id}`);

    const baseDir = path.join(__dirname, 'data', 'system-components');
    const fileName = `${component.id}.json`;

    // 尝试在标准库中查找并删除
    let targetDir = path.join(baseDir, 'standard');
    let filePath = path.join(targetDir, fileName);

    try {
      await fs.access(filePath);
      console.log(`在标准库中找到元件文件: ${filePath}`);
      await fs.unlink(filePath);
      console.log(`元件 ${component.name} 删除成功`);
      return { success: true, filePath };
    } catch {
      // 如果标准库中没有，尝试在自定义库中查找
      targetDir = path.join(baseDir, 'custom');
      filePath = path.join(targetDir, fileName);

      try {
        await fs.access(filePath);
        console.log(`在自定义库中找到元件文件: ${filePath}`);
        await fs.unlink(filePath);
        console.log(`元件 ${component.name} 删除成功`);
        return { success: true, filePath };
      } catch {
        // 如果两个库中都没有该文件
        throw new Error(`找不到元件文件: ${component.id}`);
      }
    }
  } catch (error) {
    console.error('删除元件失败:', error);
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

// 设置相关IPC处理器（现在使用env.local文件）

// 获取设置值（从env.local文件）
ipcMain.handle('get-settings', async (event, key) => {
  try {
    const envPath = path.join(__dirname, 'env.local');

    // 读取文件内容
    const envContent = await fs.readFile(envPath, 'utf8');
    const lines = envContent.split('\n');

    // 根据key查找对应的值
    const keyMap = {
      'storagePath': 'PROJECT_STORAGE_PATH=',
      'apiKey': 'SILICONFLOW_API_KEY='
    };

    const envKey = keyMap[key];
    if (!envKey) {
      return undefined;
    }

    for (const line of lines) {
      if (line.startsWith(envKey)) {
        const value = line.substring(envKey.length).trim();
        return value || undefined;
      }
    }

    // 如果没找到，返回undefined
    return undefined;
  } catch (error) {
    console.log('读取设置失败:', error.message);
    return undefined;
  }
});

// 保存设置值（到env.local文件）
ipcMain.handle('save-settings', async (event, key, value) => {
  try {
    const envPath = path.join(__dirname, 'env.local');
    let envContent = '';

    // 尝试读取现有文件内容
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch {
      // 如果文件不存在，使用默认内容
      envContent = `# Fast Hardware Environment Configuration
# This file contains sensitive configuration data
# DO NOT commit this file to version control

# SiliconFlow API Key
SILICONFLOW_API_KEY=

# Project Storage Path
PROJECT_STORAGE_PATH=`;
    }

    // 更新或添加设置
    const lines = envContent.split('\n');

    const keyMap = {
      'storagePath': 'PROJECT_STORAGE_PATH=',
      'apiKey': 'SILICONFLOW_API_KEY='
    };

    const envKey = keyMap[key];
    if (!envKey) {
      return { success: false, error: '不支持的设置键' };
    }

    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(envKey)) {
        lines[i] = `${envKey}${value}`;
        found = true;
        break;
      }
    }

    // 如果没找到，添加新行
    if (!found) {
      lines.push(`${envKey}${value}`);
    }

    const newContent = lines.join('\n');

    // 写入文件
    await fs.writeFile(envPath, newContent, 'utf8');

    console.log(`${key}已保存到env.local文件`);
    return { success: true };
  } catch (error) {
    console.error('保存设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 选择目录对话框
ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目存储位置',
      buttonLabel: '选择文件夹'
    });

    return result;
  } catch (error) {
    console.error('选择目录对话框失败:', error);
    return { canceled: true, error: error.message };
  }
});

// 在外部浏览器中打开链接
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('打开外部链接失败:', error);
    return { success: false, error: error.message };
  }
});

// 保存API密钥到env.local文件
ipcMain.handle('save-api-key', async (event, apiKey) => {
  try {
    const envPath = path.join(__dirname, 'env.local');
    let envContent = '';

    // 尝试读取现有文件内容
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch {
      // 如果文件不存在，使用默认内容
      envContent = `# Fast Hardware Environment Configuration
# This file contains sensitive configuration data
# DO NOT commit this file to version control

# SiliconFlow API Key
SILICONFLOW_API_KEY=`;
    }

    // 更新或添加API密钥
    const lines = envContent.split('\n');
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('SILICONFLOW_API_KEY=')) {
        lines[i] = `SILICONFLOW_API_KEY=${apiKey}`;
        found = true;
        break;
      }
    }

    // 如果没找到，添加新行
    if (!found) {
      lines.push(`SILICONFLOW_API_KEY=${apiKey}`);
    }

    const newContent = lines.join('\n');

    // 写入文件
    await fs.writeFile(envPath, newContent, 'utf8');

    console.log('API密钥已保存到env.local文件');
    return { success: true };
  } catch (error) {
    console.error('保存API密钥失败:', error);
    return { success: false, error: error.message };
  }
});

// 从env.local文件读取API密钥
ipcMain.handle('load-api-key', async () => {
  try {
    const envPath = path.join(__dirname, 'env.local');

    // 读取文件内容
    const envContent = await fs.readFile(envPath, 'utf8');
    const lines = envContent.split('\n');

    // 查找API密钥
    for (const line of lines) {
      if (line.startsWith('SILICONFLOW_API_KEY=')) {
        const apiKey = line.substring('SILICONFLOW_API_KEY='.length).trim();
        return { success: true, apiKey: apiKey || null };
      }
    }

    // 如果没找到，返回null
    return { success: true, apiKey: null };
  } catch (error) {
    console.log('读取API密钥失败:', error.message);
    return { success: false, error: error.message, apiKey: null };
  }
});

console.log('主进程脚本加载完成');