/**
 * Fast Hardware - 预加载脚本
 * 在渲染进程中安全地暴露API
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 暴露给渲染进程的API
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 是否启用启动调试日志
   * @returns {boolean} 是否启用启动调试
   */
  isStartupDebugEnabled: () => {
    return process.argv.includes('--enable-startup-debug') ||
      process.argv.includes('--enable-logging') ||
      process.env.STARTUP_DEBUG === '1';
  },

  /**
   * 获取应用程序版本
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * 获取操作系统平台
   */
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  /**
   * 保存文件
   */
  saveFile: async (filePath, content, createDir = false) => {
    const result = await ipcRenderer.invoke('save-file', filePath, content, createDir);
    if (result.success) {
      return result;
    } else {
      throw new Error(result.error);
    }
  },

  /**
   * 加载文件
   */
  loadFile: async (filePath) => {
    const result = await ipcRenderer.invoke('load-file', filePath);
    if (result.success) {
      return result.content;
    } else {
      throw new Error(result.error);
    }
  },

  /**
   * 读取元件文件夹
   */
  readComponentFiles: (directory) => ipcRenderer.invoke('read-component-files', directory),

  /**
   * 读取目录内容
   */
  readDirectory: (directoryPath) => ipcRenderer.invoke('read-directory', directoryPath),

  /**
   * 删除文件
   */
  deleteFile: async (filePath) => {
    const result = await ipcRenderer.invoke('delete-file', filePath);
    if (result.success) {
      return result;
    } else {
      throw new Error(result.error);
    }
  },

  /**
   * 保存元件（带重复检查）
   */
  saveComponent: (component, path) => ipcRenderer.invoke('saveComponent', component, path),

  /**
   * 强制保存元件（覆盖现有文件）
   */
  saveComponentForce: (component, path) => ipcRenderer.invoke('saveComponentForce', component, path),

  /**
   * 编辑模式保存元件（智能查找原文件位置）
   */
  saveComponentEditMode: (component) => ipcRenderer.invoke('saveComponentEditMode', component),

  /**
   * 删除元件
   */
  deleteComponent: (component) => ipcRenderer.invoke('deleteComponent', component),

  /**
   * 发送消息到主进程
   */
  sendToMain: (channel, ...args) => {
    const validChannels = ['canvas-update', 'component-add', 'project-save'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  /**
   * 监听来自主进程的消息
   */
  onMainMessage: (channel, callback) => {
    const validChannels = ['canvas-render', 'project-loaded'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },

  /**
   * 移除监听器
   */
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * 选择目录对话框
   */
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  /**
   * 在外部浏览器中打开链接
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * 获取设置值
   */
  getSettings: (key) => ipcRenderer.invoke('get-settings', key),

  /**
   * 保存设置值
   */
  saveSettings: (key, value) => ipcRenderer.invoke('save-settings', key, value),

  /**
   * 保存API密钥到env.local
   */
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),

  /**
   * 从env.local加载API密钥
   */
  loadApiKey: () => ipcRenderer.invoke('load-api-key'),

  /**
   * 与AI对话
   */
  chatWithAI: (messages, model) => ipcRenderer.invoke('chatWithAI', messages, model),

  /**
   * 获取assets文件夹路径
   */
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),

  /**
   * 加载模型配置文件
   */
  loadModelConfig: () => ipcRenderer.invoke('loadModelConfig'),

  /**
   * 获取当前应用更新状态
   */
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),

  /**
   * 检查应用更新
   * @param {boolean} [isManual=false] - 是否为手动检查
   */
  checkForUpdates: (isManual = false) => ipcRenderer.invoke('check-for-updates', isManual),

  /**
   * 下载更新包
   */
  downloadUpdate: () => ipcRenderer.invoke('download-update'),

  /**
   * 安装已下载的更新
   */
  installUpdate: () => ipcRenderer.invoke('install-update'),

  /**
   * 监听自动更新状态变化
   * @param {(payload: any) => void} callback - 更新状态回调
   */
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_, payload) => callback(payload));
  },

  /**
   * 移除自动更新状态监听
   * @param {(payload: any) => void} callback - 原始回调
   */
  removeUpdateStatusListener: (callback) => {
    ipcRenderer.removeAllListeners('update-status');
  }
});