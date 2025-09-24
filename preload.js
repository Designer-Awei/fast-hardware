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
  chatWithAI: (messages, model) => ipcRenderer.invoke('chatWithAI', messages, model)
});