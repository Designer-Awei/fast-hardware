/**
 * Fast Hardware - Electron主进程
 * 纯Electron实现，无React框架
 */

const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs').promises;
const https = require('https');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  console.warn('自动更新模块加载失败:', error.message);
}

const APP_START_TIME = Date.now();
const STARTUP_DEBUG_ENABLED = process.argv.includes('--enable-startup-debug') ||
  process.argv.includes('--enable-logging') ||
  process.env.STARTUP_DEBUG === '1';
const UPDATE_STATUS_CHANNEL = 'update-status';

/**
 * 记录启动阶段日志，便于排查首屏闪烁问题
 * @param {string} stage - 启动阶段
 * @param {Record<string, unknown>} [extra={}] - 附加信息
 */
function logStartupStage(stage, extra = {}) {
  if (!STARTUP_DEBUG_ENABLED) {
    return;
  }
  const elapsedMs = Date.now() - APP_START_TIME;
  console.log(`[startup][main][+${elapsedMs}ms] ${stage}`, extra);
}

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

// Windows 上 GPU 进程崩溃会导致首屏黑白闪烁，直接禁用硬件加速规避。
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
  logStartupStage('app:disableHardwareAcceleration', { platform: process.platform });
}

/**
 * 主窗口对象
 */
let mainWindow = null;
let splashWindow = null;
let splashShownAt = 0;
let splashReadyPromise = Promise.resolve();
let autoUpdaterInitialized = false;
let updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  autoCheckEnabled: true,
  downloadedFile: null,
  message: ''
};

/**
 * 获取 env.local 路径
 * @returns {string} env.local 文件路径
 */
function getEnvPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'env.local')
    : path.join(__dirname, 'env.local');
}

/**
 * 获取设置键到 env 变量的映射
 * @returns {Record<string, string>} 设置映射表
 */
function getSettingsKeyMap() {
  return {
    storagePath: 'PROJECT_STORAGE_PATH=',
    componentLibPath: 'COMPONENT_LIB_PATH=',
    apiKey: 'SILICONFLOW_API_KEY=',
    autoCheckUpdates: 'AUTO_CHECK_UPDATES='
  };
}

/**
 * 读取设置值
 * @param {string} key - 设置键
 * @returns {Promise<string|undefined>} 设置值
 */
async function readSettingValue(key) {
  try {
    const envContent = await fs.readFile(getEnvPath(), 'utf8');
    const lines = envContent.split('\n');
    const envKey = getSettingsKeyMap()[key];
    if (!envKey) {
      return undefined;
    }

    for (const line of lines) {
      if (line.startsWith(envKey)) {
        const value = line.substring(envKey.length).trim();
        return value || undefined;
      }
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * 向渲染进程广播更新状态
 * @param {Partial<typeof updateState>} [patch={}] - 状态补丁
 */
function broadcastUpdateStatus(patch = {}) {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion()
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATE_STATUS_CHANNEL, updateState);
  }
}

/**
 * 自动更新是否可用
 * @returns {boolean} 是否支持自动更新
 */
function isAutoUpdateAvailable() {
  return Boolean(autoUpdater) && app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
}

/**
 * 获取自动更新不可用的原因
 * @returns {'missing-module'|'development'|'unsupported-platform'|'available'} 不可用原因
 */
function getAutoUpdateUnavailableReason() {
  if (!autoUpdater) {
    return 'missing-module';
  }

  if (!app.isPackaged) {
    return 'development';
  }

  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return 'unsupported-platform';
  }

  return 'available';
}

/**
 * 获取自动更新不可用时的提示文案
 * @returns {string} 提示文案
 */
function getAutoUpdateUnavailableMessage() {
  const reason = getAutoUpdateUnavailableReason();

  if (reason === 'missing-module') {
    return '自动更新模块未正确打包，请重新构建应用';
  }

  if (reason === 'development') {
    return '开发环境无法检查线上更新';
  }

  if (reason === 'unsupported-platform') {
    return '当前平台暂不支持自动更新';
  }

  return '';
}

/**
 * 获取运行时 assets 目录
 * @returns {string} assets 目录绝对路径
 */
function getAssetsPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, 'assets');
  }

  return path.join(path.dirname(app.getPath('exe')), 'assets');
}

/**
 * 将更新错误转换为更友好的状态
 * @param {Error} error - 原始错误
 * @returns {{status: string, message: string}} 规范化后的状态
 */
function normalizeUpdateError(error) {
  const rawMessage = error?.message || String(error || '');
  const lowerMessage = rawMessage.toLowerCase();

  if (lowerMessage.includes('latest.yml') && lowerMessage.includes('404')) {
    return {
      status: 'idle',
      message: '更新源尚未准备完成，已跳过本次自动检查'
    };
  }

  const isNetworkIssue =
    lowerMessage.includes('net::') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('socket hang up') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('eai_again') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('unable to verify') ||
    lowerMessage.includes('certificate') ||
    lowerMessage.includes('github.com') ||
    lowerMessage.includes('releases/download');

  if (isNetworkIssue) {
    return {
      status: 'error',
      message: '更新检查失败，请挂上梯子后重新打开软件，或稍后在网络可用时再试'
    };
  }

  return {
    status: 'error',
    message: `更新检查失败：${rawMessage}`
  };
}

/**
 * 初始化自动更新器
 */
function setupAutoUpdater() {
  if (autoUpdaterInitialized) {
    return;
  }

  autoUpdaterInitialized = true;

  if (!autoUpdater) {
    broadcastUpdateStatus({
      status: app.isPackaged ? 'error' : 'idle',
      message: app.isPackaged ? getAutoUpdateUnavailableMessage() : '',
      latestVersion: null
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  if (!isAutoUpdateAvailable()) {
    broadcastUpdateStatus({
      status: 'idle',
      message: '',
      latestVersion: null
    });
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateStatus({
      status: 'checking',
      message: '正在检查更新...'
    });
  });

  autoUpdater.on('update-available', (info) => {
    broadcastUpdateStatus({
      status: 'available',
      latestVersion: info.version,
      downloadedFile: null,
      message: `发现新版本 v${info.version}`
    });
  });

  autoUpdater.on('update-not-available', () => {
    broadcastUpdateStatus({
      status: 'up-to-date',
      latestVersion: app.getVersion(),
      downloadedFile: null,
      message: '当前无需更新，已是最新版本'
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateStatus({
      status: 'downloading',
      message: `正在下载更新 ${Math.round(progress.percent || 0)}%`,
      downloadProgress: progress
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateStatus({
      status: 'downloaded',
      latestVersion: info.version,
      message: `新版本 v${info.version} 已下载完成`
    });
  });

  autoUpdater.on('error', (error) => {
    broadcastUpdateStatus(normalizeUpdateError(error));
  });
}

/**
 * 等待指定时长
 * @param {number} ms - 毫秒
 * @returns {Promise<void>} 等待完成
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建启动 Splash 窗口
 */
function createSplashWindow() {
  splashReadyPromise = new Promise((resolve) => {
    let resolved = false;
    const resolveOnce = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

  splashWindow = new BrowserWindow({
    width: 620,
    height: 360,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: false,
    backgroundColor: '#061822',
    icon: path.join(__dirname, 'assets/icon.png')
  });

    splashWindow.once('ready-to-show', () => {
      splashShownAt = Date.now();
      splashWindow.show();
      splashWindow.focus();
      logStartupStage('splash:ready-to-show');
      resolveOnce();
    });

    splashWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Splash 页面加载失败:', errorCode, errorDescription);
      resolveOnce();
    });

  const splashLogoPath = pathToFileURL(path.join(getAssetsPath(), 'Fast Hardware.png')).toString();
  splashWindow.loadFile('splash.html', {
    query: {
      logoPath: splashLogoPath
    }
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });

    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed() && !splashWindow.isVisible()) {
        splashShownAt = Date.now();
        splashWindow.show();
      }
      resolveOnce();
    }, 1500);
  });
}

/**
 * 关闭启动 Splash 窗口
 */
function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

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
 * 获取自定义元件库路径
 * @returns {Promise<string|null>} 自定义元件库路径，如果未设置则返回null
 */
async function getCustomComponentLibPath() {
  try {
    const envPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'env.local')
      : path.join(__dirname, 'env.local');

    const envContent = await fs.readFile(envPath, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('COMPONENT_LIB_PATH=')) {
        const pathValue = trimmedLine.substring('COMPONENT_LIB_PATH='.length);
        if (pathValue && pathValue.trim()) {
          return pathValue.trim();
        }
      }
    }
  } catch (error) {
    // 如果文件不存在或读取失败，返回null
    console.log('未找到自定义元件库路径设置');
  }
  return null;
}

/**
 * 确保元件库目录结构存在
 * @param {string} baseDir - 基础目录路径
 */
async function ensureComponentLibStructure(baseDir) {
  try {
    // 确保基础目录存在
    await fs.mkdir(baseDir, { recursive: true });

    // 确保standard和custom子目录存在
    const standardDir = path.join(baseDir, 'standard');
    const customDir = path.join(baseDir, 'custom');

    await fs.mkdir(standardDir, { recursive: true });
    await fs.mkdir(customDir, { recursive: true });

    console.log(`元件库目录结构已创建: ${baseDir}`);
  } catch (error) {
    console.error('创建元件库目录结构失败:', error);
    throw error;
  }
}

/**
 * 初始化用户配置文件
 * 在用户数据目录中创建默认的env.local文件（如果不存在）
 */
async function initializeUserConfig() {
  try {
    // 根据运行环境选择不同的env文件路径
    const envPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'env.local')  // 生产环境：用户数据目录
      : path.join(__dirname, 'env.local');              // 开发环境：项目目录

    console.log(`[main.js] 初始化用户配置: 环境=${app.isPackaged ? '生产' : '开发'}, 路径=${envPath}`);

    // 检查env.local文件是否已存在
    try {
      await fs.access(envPath);
      console.log('用户配置文件已存在:', envPath);
      return;
    } catch (error) {
      // 文件不存在，创建默认配置文件
      console.log('创建默认用户配置文件:', envPath);
    }

    // 确保用户数据目录存在
    await fs.mkdir(userDataPath, { recursive: true });

    // 根据运行环境设置默认项目存储路径
    let defaultProjectsPath;
    let defaultComponentLibPath;
    if (app.isPackaged) {
      // 打包后的应用：使用程序目录下的data文件夹
      const appPath = path.dirname(app.getPath('exe'));
      defaultProjectsPath = path.join(appPath, 'resources', 'data', 'projects');
      defaultComponentLibPath = path.join(appPath, 'resources', 'data', 'system-components');
    } else {
      // 开发环境：使用用户数据目录
      defaultProjectsPath = path.join(userDataPath, 'projects');
      defaultComponentLibPath = null; // 开发环境使用默认的data/system-components
    }

    // 创建默认的env.local内容（不包含敏感信息）
    const defaultConfig = `# Fast Hardware 用户配置文件
# 此文件存储用户的个人设置 / This file stores user personal settings
# 可以安全地包含在备份中 / Can be safely included in backups

# 项目存储路径 / Project Storage Path
# 设置默认的项目保存位置 / Set the default project storage location
PROJECT_STORAGE_PATH=${defaultProjectsPath.replace(/\\/g, '/')}

# 元件库路径 / Component Library Path
# 设置系统元件库的保存位置 / Set the system component library storage location
${defaultComponentLibPath ? `COMPONENT_LIB_PATH=${defaultComponentLibPath.replace(/\\/g, '/')}` : '# COMPONENT_LIB_PATH='}

# Auto update check / 自动检查更新
AUTO_CHECK_UPDATES=true

# SiliconFlow API 密钥 / SiliconFlow API Key
# 请通过应用程序设置页面配置 / Please configure through application settings page
# SILICONFLOW_API_KEY=your_api_key_here
`;

    // 写入默认配置文件
    await fs.writeFile(envPath, defaultConfig, 'utf8');
    console.log('默认用户配置文件已创建');

    // 创建默认的项目目录
    await fs.mkdir(defaultProjectsPath, { recursive: true });
    console.log('默认项目目录已创建:', defaultProjectsPath);

  } catch (error) {
    console.error('初始化用户配置文件失败:', error);
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
  logStartupStage('createWindow:start', {
    isPackaged: app.isPackaged,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors
  });

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
    minWidth: 800,
    backgroundColor: '#f5f5f5',
    title: `Fast Hardware v${app.getVersion()} —— 智能硬件开发助手`,
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
  logStartupStage('BrowserWindow:created', {
    bounds: {
      width: windowOptions.width,
      height: windowOptions.height,
      x: windowOptions.x,
      y: windowOptions.y
    }
  });

  mainWindow.on('show', () => {
    logStartupStage('window:show');
  });

  mainWindow.on('focus', () => {
    logStartupStage('window:focus');
  });

  mainWindow.on('maximize', () => {
    logStartupStage('window:maximize');
  });

  // 加载主页面
  console.log('加载主页面: index.html');
  logStartupStage('window:loadFile:index.html');
  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-start-loading', () => {
    logStartupStage('webContents:did-start-loading');
  });

  mainWindow.webContents.on('dom-ready', () => {
    logStartupStage('webContents:dom-ready');
  });

  mainWindow.once('ready-to-show', () => {
    logStartupStage('window:ready-to-show');
  });

  // 页面加载完成后显示窗口
  mainWindow.webContents.on('did-finish-load', async () => {
    console.log('页面加载完成');
    logStartupStage('webContents:did-finish-load', {
      url: mainWindow.webContents.getURL()
    });

    await splashReadyPromise;

    const minSplashDuration = 2500;
    const elapsedSinceSplashShown = splashShownAt ? Date.now() - splashShownAt : 0;
    const remainingSplashTime = Math.max(0, minSplashDuration - elapsedSinceSplashShown);
    if (remainingSplashTime > 0) {
      await delay(remainingSplashTime);
    }

    // 如果配置要求最大化，则最大化窗口
    if (savedConfig.isMaximized) {
      mainWindow.maximize();
    }

    // 显示窗口
    mainWindow.show();

    // 聚焦窗口
    mainWindow.focus();

    broadcastUpdateStatus();

    setTimeout(() => {
      closeSplashWindow();
    }, 160);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
    logStartupStage('webContents:did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL
    });
    // 即使加载失败也显示窗口
    mainWindow.show();
    closeSplashWindow();
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
app.whenReady().then(async () => {
  console.log('Electron应用程序已准备就绪');

  createSplashWindow();

  // 初始化用户配置文件
  await initializeUserConfig();

  setupAutoUpdater();
  createWindow();

  const autoCheckUpdates = await readSettingValue('autoCheckUpdates');
  const shouldAutoCheckUpdates = autoCheckUpdates !== 'false';
  broadcastUpdateStatus({
    autoCheckEnabled: shouldAutoCheckUpdates
  });

  if (shouldAutoCheckUpdates && isAutoUpdateAvailable()) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        broadcastUpdateStatus(normalizeUpdateError(error));
      });
    }, 2500);
  }
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
    createSplashWindow();
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

ipcMain.handle('get-update-state', async () => {
  const autoCheckUpdates = await readSettingValue('autoCheckUpdates');
  return {
    ...updateState,
    currentVersion: app.getVersion(),
    autoCheckEnabled: autoCheckUpdates !== 'false'
  };
});

ipcMain.handle('check-for-updates', async (event, isManual = false) => {
  const autoCheckUpdates = await readSettingValue('autoCheckUpdates');
  broadcastUpdateStatus({
    autoCheckEnabled: autoCheckUpdates !== 'false'
  });

  if (!isAutoUpdateAvailable()) {
    return {
      success: false,
      message: getAutoUpdateUnavailableMessage()
    };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    const normalizedState = normalizeUpdateError(error);
    const message = normalizedState.status === 'error'
      ? `${isManual ? '手动' : '自动'}检查更新失败：${error.message}`
      : normalizedState.message;
    broadcastUpdateStatus(normalizedState);
    return { success: false, message };
  }
});

ipcMain.handle('download-update', async () => {
  if (!isAutoUpdateAvailable()) {
    return { success: false, message: getAutoUpdateUnavailableMessage() };
  }

  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    const message = `下载更新失败：${error.message}`;
    broadcastUpdateStatus({
      status: 'error',
      message
    });
    return { success: false, message };
  }
});

ipcMain.handle('install-update', async () => {
  if (updateState.status !== 'downloaded') {
    return { success: false, message: '更新尚未下载完成' };
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });
  return { success: true };
});

ipcMain.handle('get-assets-path', () => {
  return getAssetsPath();
});

/**
 * 加载模型配置文件
 */
ipcMain.handle('loadModelConfig', async () => {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    let configPath;
    
    if (isDev) {
      // 开发环境：从项目根目录读取
      configPath = path.join(__dirname, 'model_config.json');
    } else {
      // 生产环境：从程序根目录读取
      configPath = path.join(path.dirname(app.getPath('exe')), 'model_config.json');
    }
    
    console.log('📂 读取模型配置文件:', configPath);
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    console.log('✅ 模型配置加载成功:', config.models.length, '个模型');
    return config;
  } catch (error) {
    console.error('❌ 加载模型配置失败:', error);
    // 返回默认配置
    return {
      version: '1.0.0',
      models: [
        {
          id: 'glm-4-9b',
          name: 'THUDM/GLM-4-9B-0414',
          displayName: 'GLM-4-9B',
          type: 'chat',
          capabilities: ['text', 'code'],
          description: '默认对话模型',
          enabled: true
        },
        {
          id: 'glm-4v-thinking',
          name: 'THUDM/GLM-4.1V-9B-Thinking',
          displayName: 'GLM-4.1V',
          type: 'visual',
          capabilities: ['text', 'image', 'code', 'thinking'],
          description: '视觉思考模型',
          enabled: true
        }
      ],
      autoDispatch: {
        enabled: false,
        fallback: 'glm-4-9b'
      }
    };
  }
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

    // 处理data文件夹路径（配置为松散文件，直接在resources目录下）
    let fullDirectory;
    if (app.isPackaged) {
      // 打包后的应用：替换data路径为resources/data
      const resourcesPath = process.resourcesPath;
      if (directory.startsWith('data/')) {
        // 将'data/system-components/standard/'替换为'resources/data/system-components/standard/'
        const relativePath = directory.substring(5); // 移除'data/'前缀
        fullDirectory = path.join(resourcesPath, 'data', relativePath);
      } else {
        fullDirectory = path.join(resourcesPath, 'data', directory);
      }
      console.log(`打包模式，使用松散文件路径: ${fullDirectory}`);
    } else {
      // 开发模式：从项目根目录读取
      fullDirectory = path.join(__dirname, directory);
      console.log(`开发模式，使用项目路径: ${fullDirectory}`);
    }

    // 检查目录是否存在
    try {
      await fs.access(fullDirectory);
    } catch (error) {
      console.error(`目录不存在: ${fullDirectory}`);
      return []; // 返回空数组而不是错误对象
    }

    // 读取目录下的所有.json文件
    const files = await fs.readdir(fullDirectory);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'README.md');

    const components = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(fullDirectory, file);
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

// 读取目录内容（通用方法）
ipcMain.handle('read-directory', async (event, directoryPath) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    console.log(`读取目录内容: ${directoryPath}`);

    // 检查目录是否存在
    try {
      await fs.access(directoryPath);
    } catch (error) {
      console.error(`目录不存在: ${directoryPath}`);
      return { success: false, error: '目录不存在', files: [] };
    }

    // 读取目录内容
    const items = await fs.readdir(directoryPath, { withFileTypes: true });

    // 分类文件和文件夹
    const files = [];
    const directories = [];

    for (const item of items) {
      if (item.isFile()) {
        files.push({
          name: item.name,
          type: 'file',
          path: path.join(directoryPath, item.name)
        });
      } else if (item.isDirectory()) {
        directories.push({
          name: item.name,
          type: 'directory',
          path: path.join(directoryPath, item.name)
        });
      }
    }

    console.log(`目录读取完成: ${files.length}个文件, ${directories.length}个文件夹`);

    return {
      success: true,
      files: files,
      directories: directories,
      all: [...files, ...directories]
    };

  } catch (error) {
    console.error('读取目录失败:', error.message);
    return { success: false, error: error.message, files: [], directories: [], all: [] };
  }
});

// 删除文件
ipcMain.handle('delete-file', async (event, filePath) => {
  const fs = require('fs').promises;

  try {
    console.log(`删除文件: ${filePath}`);

    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch (error) {
      console.warn(`文件不存在，无需删除: ${filePath}`);
      return { success: true, message: '文件不存在，无需删除' };
    }

    // 删除文件
    await fs.unlink(filePath);
    console.log(`文件删除成功: ${filePath}`);

    return { success: true, message: '文件删除成功' };

  } catch (error) {
    console.error('删除文件失败:', error.message);
    return { success: false, error: error.message };
  }
});

// 保存元件（带重复检查）
ipcMain.handle('saveComponent', async (event, component, savePath) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    console.log(`保存元件: ${component.name}, 路径: ${savePath}`);

    // 确定保存目录 - 优先使用自定义元件库路径
    let baseDir;
    const customLibPath = await getCustomComponentLibPath();
    if (customLibPath) {
      baseDir = customLibPath;
      console.log(`使用自定义元件库路径: ${baseDir}`);
    } else {
      // 使用正确的路径解析（支持打包环境）
      if (app.isPackaged) {
        // 打包后的应用：使用resources目录
        baseDir = path.join(process.resourcesPath, 'data', 'system-components');
        console.log(`使用打包环境默认路径: ${baseDir}`);
      } else {
        // 开发环境：使用项目目录
        baseDir = path.join(__dirname, 'data', 'system-components');
        console.log(`使用开发环境默认路径: ${baseDir}`);
      }
    }

    // 确保基础目录存在
    await ensureComponentLibStructure(baseDir);

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

    // 确定保存目录 - 优先使用自定义元件库路径
    let baseDir;
    const customLibPath = await getCustomComponentLibPath();
    if (customLibPath) {
      baseDir = customLibPath;
      console.log(`使用自定义元件库路径: ${baseDir}`);
    } else {
      // 使用正确的路径解析（支持打包环境）
      if (app.isPackaged) {
        // 打包后的应用：使用resources目录
        baseDir = path.join(process.resourcesPath, 'data', 'system-components');
        console.log(`使用打包环境默认路径: ${baseDir}`);
      } else {
        // 开发环境：使用项目目录
        baseDir = path.join(__dirname, 'data', 'system-components');
        console.log(`使用开发环境默认路径: ${baseDir}`);
      }
    }

    // 确保基础目录存在
    await ensureComponentLibStructure(baseDir);

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

    // 确定基础目录 - 优先使用自定义元件库路径
    let baseDir;
    const customLibPath = await getCustomComponentLibPath();

    if (customLibPath) {
      baseDir = customLibPath;
      console.log(`编辑模式使用自定义元件库路径: ${baseDir}`);
    } else {
      // 使用正确的路径解析（支持打包环境）
      if (app.isPackaged) {
        // 打包后的应用：使用resources目录
        baseDir = path.join(process.resourcesPath, 'data', 'system-components');
      } else {
        // 开发环境：使用项目目录
        baseDir = path.join(__dirname, 'data', 'system-components');
      }
    }

    // 确保基础目录存在
    await ensureComponentLibStructure(baseDir);

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
        // 如果两个库中都没有该文件，作为最后的后备方案，尝试在默认路径下查找
        const defaultBaseDir = path.join(__dirname, 'data', 'system-components');
        const defaultTargetDir = path.join(defaultBaseDir, 'standard');
        const defaultFilePath = path.join(defaultTargetDir, originalFileName);

        try {
          await fs.access(defaultFilePath);
          console.log(`在默认路径找到原文件: ${defaultFilePath}`);
          baseDir = defaultBaseDir;
          targetDir = defaultTargetDir;
          filePath = defaultFilePath;
          prefix = 'std';
        } catch {
          // 如果所有路径都找不到该文件，报错
          throw new Error(`找不到原元件文件: ${component.id}`);
        }
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

    // 使用正确的路径解析（支持打包环境）
    let baseDir;
    if (app.isPackaged) {
      // 打包后的应用：使用resources目录
      baseDir = path.join(process.resourcesPath, 'data', 'system-components');
      console.log(`删除元件使用打包环境路径: ${baseDir}`);
    } else {
      // 开发环境：使用项目目录
      baseDir = path.join(__dirname, 'data', 'system-components');
      console.log(`删除元件使用开发环境路径: ${baseDir}`);
    }
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
    return await readSettingValue(key);
  } catch (error) {
    console.log('读取设置失败:', error.message);
    return undefined;
  }
});

// 保存设置值（到env.local文件）
ipcMain.handle('save-settings', async (event, key, value) => {
  console.log(`[main.js] 开始保存设置: key=${key}, value=${value}`);

  try {
    const envPath = getEnvPath();

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
PROJECT_STORAGE_PATH=

# Component Library Path
COMPONENT_LIB_PATH=

# Auto update check
AUTO_CHECK_UPDATES=true`;
    }

    // 更新或添加设置
    const lines = envContent.split('\n');

    const envKey = getSettingsKeyMap()[key];
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
    if (key === 'autoCheckUpdates') {
      broadcastUpdateStatus({
        autoCheckEnabled: value !== 'false'
      });
    }
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
    // 区分开发环境和生产环境
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    let envPath;
    
    if (isDev) {
      // 开发环境：写入项目根目录的 env.local
      envPath = path.join(__dirname, 'env.local');
      console.log('📝 开发环境：保存API密钥到项目根目录:', envPath);
    } else {
      // 生产环境：写入 AppData 的 env.local
      envPath = path.join(app.getPath('userData'), 'env.local');
      console.log('📝 生产环境：保存API密钥到用户数据目录:', envPath);
    }
    
    let envContent = '';

    // 尝试读取现有文件内容
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch {
      // 如果文件不存在，使用默认内容
      envContent = `# Fast Hardware 环境配置文件 / Fast Hardware Environment Configuration
# 此文件包含敏感的配置数据 / This file contains sensitive configuration data
# 不要将此文件提交到版本控制中 / DO NOT commit this file to version control


# SiliconFlow API 密钥 / SiliconFlow API Key
# 用于访问SiliconFlow AI服务的API密钥 / API key for accessing SiliconFlow AI services

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

    console.log('✅ API密钥已保存到env.local文件');
    return { success: true, path: envPath };
  } catch (error) {
    console.error('❌ 保存API密钥失败:', error);
    return { success: false, error: error.message };
  }
});

// 从env.local文件读取API密钥
ipcMain.handle('load-api-key', async () => {
  try {
    // 区分开发环境和生产环境
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    let envPath;
    
    if (isDev) {
      // 开发环境：从项目根目录读取 env.local
      envPath = path.join(__dirname, 'env.local');
      console.log('📖 开发环境：从项目根目录读取API密钥:', envPath);
    } else {
      // 生产环境：从 AppData 读取 env.local
      envPath = path.join(app.getPath('userData'), 'env.local');
      console.log('📖 生产环境：从用户数据目录读取API密钥:', envPath);
    }

    // 读取文件内容
    const envContent = await fs.readFile(envPath, 'utf8');
    const lines = envContent.split('\n');

    // 查找API密钥
    for (const line of lines) {
      if (line.startsWith('SILICONFLOW_API_KEY=')) {
        const apiKey = line.substring('SILICONFLOW_API_KEY='.length).trim();
        console.log('✅ API密钥读取成功');
        return { success: true, apiKey: apiKey || null };
      }
    }

    // 如果没找到，返回null
    console.log('⚠️ 未找到API密钥配置');
    return { success: true, apiKey: null };
  } catch (error) {
    console.log('❌ 读取API密钥失败:', error.message);
    return { success: false, error: error.message, apiKey: null };
  }
});

/**
 * 调用SiliconFlow AI API
 * @param {Array} messages - 消息数组
 * @param {string} model - 使用的模型
 * @returns {Promise<Object>} API响应结果
 */
async function callSiliconFlowAPI(messages, model) {
  try {
    console.log('🔑 正在读取API密钥...');

    // 获取API密钥
    const envPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'env.local')
      : path.join(__dirname, 'env.local');

    const envContent = await fs.readFile(envPath, 'utf8');
    const lines = envContent.split('\n');
    let apiKey = '';

    for (const line of lines) {
      if (line.startsWith('SILICONFLOW_API_KEY=')) {
        apiKey = line.substring('SILICONFLOW_API_KEY='.length).trim();
        break;
      }
    }

    if (!apiKey) {
      console.log('❌ 未找到有效的API密钥');
      throw new Error('未找到SiliconFlow API密钥，请在设置中配置');
    }

    console.log('✅ API密钥读取成功');

    // API请求数据
    const requestData = {
      model: model,
      messages: messages,
      stream: false, // 先实现非流式，后续添加流式
      max_tokens: 4096,
      temperature: 0.7
    };

    // 发起HTTP请求
    console.log('🌐 正在发送HTTP请求到SiliconFlow API...');
    console.log('📊 请求数据大小:', `${Buffer.byteLength(JSON.stringify(requestData))} bytes`);

    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify(requestData);
      const options = {
        hostname: 'api.siliconflow.cn',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        console.log('📡 HTTP响应状态码:', res.statusCode);
        console.log('📡 HTTP响应头:', res.headers['content-type']);

        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          console.log('📦 响应数据大小:', `${body.length} bytes`);

          try {
            const responseData = JSON.parse(body);

            if (res.statusCode === 200) {
              console.log('✅ API响应解析成功');
              resolve({
                success: true,
                content: responseData.choices[0]?.message?.content || '无响应内容',
                usage: responseData.usage
              });
            } else {
              // 详细的错误日志
              console.error('❌ API返回错误状态 - 详细信息:');
              console.error('📊 状态码:', res.statusCode);
              console.error('📊 完整响应体:', JSON.stringify(responseData, null, 2));
              console.error('📊 响应体原始内容 (前1000字符):', body.substring(0, 1000));
              console.error('📊 错误类型:', responseData.error?.type || '未知');
              console.error('📊 错误代码:', responseData.error?.code || '未知');
              console.error('📊 错误消息:', responseData.error?.message || '未知错误');
              console.error('📊 错误参数:', responseData.error?.param || '无');
              console.error('📊 响应头:', JSON.stringify(res.headers));
              
              // 特别针对500错误 - 收集详细分析数据
              let debugInfo = null;
              if (res.statusCode === 500) {
                // 统计图片信息
                let imageCount = 0;
                let totalImageSize = 0;
                const imageDetails = [];
                
                requestData.messages.forEach(msg => {
                  if (Array.isArray(msg.content)) {
                    msg.content.forEach(c => {
                      if (c.type === 'image_url' && c.image_url?.url) {
                        imageCount++;
                        const imageData = c.image_url.url;
                        const sizeInBytes = (imageData.length * 3) / 4;
                        const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
                        totalImageSize += sizeInBytes;
                        imageDetails.push({
                          index: imageCount,
                          sizeInMB: sizeInMB,
                          sizeInBytes: sizeInBytes
                        });
                      }
                    });
                  }
                });
                
                const requestBodySize = Buffer.byteLength(JSON.stringify(requestData));
                
                debugInfo = {
                  hasImages: imageCount > 0,
                  imageCount: imageCount,
                  imageDetails: imageDetails,
                  totalImageSizeInMB: (totalImageSize / 1024 / 1024).toFixed(2),
                  totalImageSizeInBytes: totalImageSize,
                  requestBodySizeInMB: (requestBodySize / 1024 / 1024).toFixed(2),
                  requestBodySizeInBytes: requestBodySize,
                  messageCount: requestData.messages.length,
                  model: requestData.model,
                  maxTokens: requestData.max_tokens,
                  responseBody: body.substring(0, 1000),
                  responseHeaders: res.headers
                };
              }
              
              resolve({
                success: false,
                statusCode: res.statusCode,
                errorType: responseData.error?.type || '未知',
                error: `API请求失败: ${res.statusCode} - ${responseData.error?.message || '未知错误'}`,
                rawError: responseData.error,
                debugInfo: debugInfo // 500错误的详细调试信息
              });
            }
          } catch (parseError) {
            console.error('❌ 响应数据解析失败:', parseError.message);
            console.error('🔍 原始响应内容 (前500字符):', body.substring(0, 500));
            console.error('🔍 响应内容长度:', body.length);
            resolve({
              success: false,
              statusCode: res.statusCode,
              error: `解析响应失败: ${parseError.message}`,
              rawResponse: body.substring(0, 500)
            });
          }
        });
      });

      req.on('error', (error) => {
        console.log('❌ HTTP请求失败:', error.message);
        resolve({
          success: false,
          error: `网络请求失败: ${error.message}`
        });
      });

      req.write(data);
      req.end();

      console.log('📤 HTTP请求已发送，等待响应...');
    });

    return response;

  } catch (error) {
    return {
      success: false,
      error: `调用AI API失败: ${error.message}`
    };
  }
}

// IPC通信处理
ipcMain.handle('chatWithAI', async (event, messages, model) => {
  const startTime = Date.now();
  console.log('🔄 开始调用SiliconFlow AI API...');
  console.log('📝 模型:', model);
  console.log('💬 消息数量:', messages.length);
  console.log('⏱️ 开始时间:', new Date(startTime).toLocaleTimeString());

  // 设置120秒超时（VLM处理多图需要更长时间）
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('API请求超时 (120秒)')), 180000);
  });

  try {
    const result = await Promise.race([
      callSiliconFlowAPI(messages, model),
      timeoutPromise
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log('⏱️ 结束时间:', new Date(endTime).toLocaleTimeString());
    console.log('⏱️ 请求耗时:', `${duration}ms (${(duration / 1000).toFixed(1)}s)`);

    if (result.success) {
      console.log('✅ AI API调用成功，获得回复');
      console.log('📏 回复长度:', result.content.length);
    } else {
      console.log('❌ AI API调用失败:', result.error);
    }

    return result;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log('⏱️ 异常结束时间:', new Date(endTime).toLocaleTimeString());
    console.log('⏱️ 异常时耗时:', `${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    console.log('⏰ API请求超时或出错:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
});

console.log('主进程脚本加载完成');