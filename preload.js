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
   * 获取 Supabase 配置状态（不返回明文 key）。
   * @returns {{ envPath: string, url: string, isConfigured: boolean, hasPublishableKey: boolean }}
   */
  getSupabaseConfigStatus: () => ipcRenderer.invoke('get-supabase-config-status'),

  /**
   * 获取当前 Supabase 登录态。
   */
  getSupabaseAuthState: () => ipcRenderer.invoke('supabase-auth-get-state'),

  /**
   * Supabase 邮箱密码注册。
   * @param {{ email: string, password: string, displayName?: string, rememberMe?: boolean }} payload
   */
  supabaseSignUpWithPassword: (payload) =>
    ipcRenderer.invoke('supabase-auth-sign-up-password', payload),

  /**
   * Supabase 邮箱密码登录。
   * @param {{ email: string, password: string, rememberMe?: boolean }} payload
   */
  supabaseSignInWithPassword: (payload) =>
    ipcRenderer.invoke('supabase-auth-sign-in-password', payload),

  /**
   * Supabase 第三方 OAuth 登录。
   * @param {{ provider: 'google' | 'github', rememberMe?: boolean }} payload
   */
  supabaseSignInWithOAuth: (payload) =>
    ipcRenderer.invoke('supabase-auth-sign-in-oauth', payload),

  /**
   * 更新账号资料（当前支持昵称）。
   * @param {{ displayName: string }} payload
   */
  supabaseUpdateProfile: (payload) =>
    ipcRenderer.invoke('supabase-auth-update-profile', payload),

  /**
   * 上传并覆盖当前用户头像。
   * @param {{ dataUrl: string }} payload
   */
  supabaseUploadAvatar: (payload) =>
    ipcRenderer.invoke('supabase-auth-upload-avatar', payload),

  /**
   * 读取当前用户项目备份状态。
   * @param {{ projectPaths: string[] }} payload
   */
  supabaseListProjectBackups: (payload) =>
    ipcRenderer.invoke('supabase-project-backup-list', payload),

  /**
   * 创客集市：批量读取当前用户项目发布状态。
   * @param {{ projectPaths: string[] }} payload
   */
  supabaseGetMarketplacePublishStatuses: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-publish-statuses', payload),

  /**
   * 上传或更新项目备份。
   * @param {{ projectPath: string, projectName?: string, lastModified?: string }} payload
   */
  supabaseUploadProjectBackup: (payload) =>
    ipcRenderer.invoke('supabase-project-backup-upload', payload),

  /**
   * 撤销当前项目的云端备份。
   * @param {{ projectPath: string }} payload
   */
  supabaseDeleteProjectBackup: (payload) =>
    ipcRenderer.invoke('supabase-project-backup-delete', payload),

  /**
   * 下载云端备份到本地项目目录。
   * @param {{ projectKey: string, projectName: string, storagePath: string }} payload
   */
  supabaseDownloadProjectBackup: (payload) =>
    ipcRenderer.invoke('supabase-project-backup-download', payload),

  /**
   * 通过项目编号查询可共享备份（用于创客集市复用）。
   * @param {{ projectKey: string }} payload
   */
  supabaseSearchSharedBackupProjectsByKey: (payload) =>
    ipcRenderer.invoke('supabase-project-backup-search-shared', payload),

  /**
   * 通过项目编号拉取共享备份 bundle（仅内存）。
   * @param {{ projectKey: string }} payload
   */
  supabaseGetSharedBackupBundleByProjectKey: (payload) =>
    ipcRenderer.invoke('supabase-project-backup-bundle-by-key', payload),

  /**
   * 超级管理员权限管理：读取用户统计。
   */
  supabaseGetPermissionManagementStats: () =>
    ipcRenderer.invoke('supabase-permission-management-stats'),

  /**
   * 超级管理员权限管理：按关键字查询用户列表。
   * @param {{ query?: string, page?: number, pageSize?: number }} payload
   */
  supabaseListUsersForPermissionManagement: (payload) =>
    ipcRenderer.invoke('supabase-permission-management-list-users', payload),

  /**
   * 超级管理员权限管理：更新目标用户角色。
   * @param {{ userId: string, role: 'user'|'admin' }} payload
   */
  supabaseUpdateUserRoleBySuperAdmin: (payload) =>
    ipcRenderer.invoke('supabase-permission-management-update-role', payload),

  /**
   * 创客集市：发布项目（进入待审核）。
   * @param {{ projectPath: string, projectName?: string, description?: string }} payload
   */
  supabasePublishMarketplacePost: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-publish', payload),

  /**
   * 创客集市：读取待审核项目（管理员/超级管理员）。
   */
  supabaseListMarketplacePendingPosts: () =>
    ipcRenderer.invoke('supabase-marketplace-list-pending'),

  /**
   * 创客集市：读取已通过项目列表。
   * @param {{ query?: string, sortBy?: 'likes'|'favorites'|'remixes' }} payload
   */
  supabaseListMarketplaceApprovedPosts: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-list-approved', payload),

  /**
   * 创客集市：读取项目详情（审核态/发布态）。
   * @param {{ postId: string }} payload
   */
  supabaseGetMarketplacePostDetail: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-post-detail', payload),

  /**
   * 创客集市：拉取并解析 project.bundle.json（仅内存，不落盘）。
   * @param {{ postId: string }} payload
   */
  supabaseGetMarketplaceProjectBundle: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-project-bundle', payload),

  /**
   * 创客集市：审核项目（通过/拒绝）。
   * @param {{ postId: string, action: 'approve'|'reject', rejectReason?: string }} payload
   */
  supabaseReviewMarketplacePost: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-review', payload),

  /**
   * 创客集市：互动（点赞/收藏/复刻）。
   * @param {{ postId: string, action: 'like'|'favorite'|'remix' }} payload
   */
  supabaseInteractMarketplacePost: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-interact', payload),

  /**
   * 创客集市：超级管理员删除已发布项目（Storage + 数据库）。
   * @param {{ postId: string }} payload
   */
  supabaseDeleteMarketplaceApprovedPost: (payload) =>
    ipcRenderer.invoke('supabase-marketplace-delete-approved', payload),

  /**
   * 监听创客集市数据变更广播（用于前端缓存失效与按需刷新）。
   * @param {(payload: { type: string, at: number }) => void} callback
   * @returns {() => void}
   */
  onSupabaseMarketplaceChanged: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const channel = 'supabase-marketplace-changed';
    const handler = (_evt, payload) => {
      callback(payload && typeof payload === 'object' ? payload : { type: '', at: Date.now() });
    };
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Supabase 登出。
   */
  supabaseSignOut: () => ipcRenderer.invoke('supabase-auth-sign-out'),

  /**
   * 监听 Supabase OAuth 回调结果。
   * @param {(payload: { success: boolean, message: string, state?: unknown, error?: string }) => void} callback
   * @returns {() => void}
   */
  onSupabaseAuthCallback: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const handler = (_evt, payload) => {
      callback(payload && typeof payload === 'object' ? payload : { success: false, message: '' });
    };
    ipcRenderer.on('supabase-auth-callback', handler);
    return () => ipcRenderer.removeListener('supabase-auth-callback', handler);
  },

  /**
   * 保存API密钥到env.local
   */
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),

  /**
   * 从env.local加载API密钥
   */
  loadApiKey: () => ipcRenderer.invoke('load-api-key'),

  /**
   * 清空本地存储的API密钥
   */
  clearApiKey: () => ipcRenderer.invoke('clear-api-key'),

  /**
   * 与AI对话
   * @param {Array<{role:string, content: unknown}>} messages
   * @param {string} model
   * @param {{ siliconFlowEnableThinking?: boolean, stream?: boolean }} [apiOptions] - `stream:false` 关闭 SSE；默认流式
   */
  chatWithAI: (messages, model, apiOptions) =>
    ipcRenderer.invoke('chatWithAI', messages, model, apiOptions ?? {}),

  /**
   * 订阅 SiliconFlow 流式增量（仅 `stream !== false` 时主进程会推送）
   * @param {(payload: { delta?: string }) => void} callback
   * @returns {() => void} 取消订阅
   */
  onSiliconflowChatStream: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    /** @param {unknown} _evt @param {{ delta?: string }} payload */
    const handler = (_evt, payload) => {
      callback(payload && typeof payload === 'object' ? payload : {});
    };
    ipcRenderer.on('siliconflow-chat-stream-chunk', handler);
    return () => ipcRenderer.removeListener('siliconflow-chat-stream-chunk', handler);
  },

  /**
   * 订阅 Skills Agent **最终合成** 的 SiliconFlow SSE 增量（channel `skills-agent-loop-final-stream-chunk`）
   * @param {(payload: { delta?: string }) => void} callback
   * @returns {() => void} 取消订阅
   */
  onSkillsAgentLoopFinalStream: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    /** @param {unknown} _evt @param {{ delta?: string }} payload */
    const handler = (_evt, payload) => {
      callback(payload && typeof payload === 'object' ? payload : {});
    };
    const ch = 'skills-agent-loop-final-stream-chunk';
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  },

  /**
   * Exa MCP Web Search（ClawHub 的 exa-web-search-free 底层能力）
   * @param {string} query - 搜索查询
   * @param {{numResults?: number, type?: 'auto'|'fast'|'deep'}} [options]
   * @returns {Promise<{success:boolean, results:Array<any>, raw?:string, error?:string}>}
   */
  webSearchExa: (query, options = {}) => ipcRenderer.invoke('web-search-exa', query, options),

  /**
   * 获取assets文件夹路径
   */
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),

  /**
   * 加载模型配置文件
   */
  loadModelConfig: () => ipcRenderer.invoke('loadModelConfig'),

  /**
   * 加载解析后的模型配置
   */
  loadResolvedModelConfig: () => ipcRenderer.invoke('load-resolved-model-config'),

  /**
   * 刷新在线模型列表
   */
  refreshModelList: () => ipcRenderer.invoke('refresh-model-list'),

  /**
   * 获取模型同步状态
   */
  getModelSyncStatus: () => ipcRenderer.invoke('get-model-sync-status'),

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
   * 将 skills / agent 进度从渲染进程发往主进程，再由主进程广播 `agent-skill-progress`（供 onAgentSkillProgress 订阅）
   * @param {Record<string, unknown>} detail - 建议含 type、phase、line、skillName 等
   */
  publishAgentSkillProgress: (detail) => {
    ipcRenderer.send('agent-skill-progress-emit', detail);
  },

  /**
   * 注册主进程 `execute-skill` 触发的引擎 RPC：主进程 `webContents.send('skills-engine-invoke')`，
   * 渲染进程在此执行真实 `CircuitSkillsEngine` 方法并回传结果。
   * @param {(detail: { op: string, args: unknown[] }) => Promise<unknown>} handler
   * @returns {void}
   */
  registerSkillsEngineRpcHandler: (handler) => {
    if (typeof handler !== 'function') {
      return;
    }
    ipcRenderer.removeAllListeners('skills-engine-invoke');
    ipcRenderer.on('skills-engine-invoke', async (_event, detail) => {
      const callId = detail && detail.callId;
      if (typeof callId !== 'string') {
        return;
      }
      try {
        const result = await handler({
          op: detail.op,
          args: Array.isArray(detail.args) ? detail.args : []
        });
        ipcRenderer.send('skills-engine-result', { callId, ok: true, result });
      } catch (e) {
        ipcRenderer.send('skills-engine-result', {
          callId,
          ok: false,
          error: String(e && e.message ? e.message : e)
        });
      }
    });
  },

  /**
   * 主进程执行 skill（见 `main.js` `execute-skill`）
   * @param {{ skillName: string, args?: unknown, ctxPayload?: { userRequirement?: string, canvasSnapshot?: unknown } }} payload
   * @returns {Promise<unknown>}
   */
  executeSkill: (payload) => ipcRenderer.invoke('execute-skill', payload),

  /**
   * 主进程 Skills Agent 多轮循环（`scripts/agent/skills-agent-loop.js`）
   * @param {{ userMessage?: string, model?: string, temperature?: number, canvasSnapshot?: unknown, projectPath?: string }} payload
   * @returns {Promise<{ success: boolean, ok?: boolean, outcome?: string, assistantMessages?: Array<{type:string, content?:string, isSkillFlow?:boolean}>, error?: string }>}
   */
  runSkillsAgentLoop: (payload) => ipcRenderer.invoke('run-skills-agent-loop', payload),

  /**
   * 项目工作区工具（list/read/grep/explore/verify），主进程读盘
   * @param {{ projectRoot: string, toolName: string, args?: Record<string, unknown> }} payload
   * @returns {Promise<{ success: boolean, data?: unknown, error?: string }>}
   */
  executeProjectWorkspaceTool: (payload) => ipcRenderer.invoke('execute-project-workspace-tool', payload),

  /**
   * 请求中断主进程 `runSkillsAgentLoop` 多轮循环（与渲染侧「中断」按钮配合）
   * @returns {void}
   */
  abortSkillsAgentLoop: () => {
    ipcRenderer.send('skills-agent-loop-abort');
  },

  /**
   * 订阅主进程 Agent 循环进度（与 `runSkillsAgentLoop` invoke 并发；`callback` 传 `null` 清除监听）
   * @param {((detail: Record<string, unknown>) => void) | null} callback
   * @returns {void}
   */
  registerSkillsAgentLoopProgress: (callback) => {
    const ch = 'skills-agent-loop-progress';
    ipcRenderer.removeAllListeners(ch);
    if (typeof callback === 'function') {
      ipcRenderer.on(ch, (_event, detail) => callback(detail));
    }
  },

  /**
   * 监听技能/工具调用进度（Cursor-like steps）
   * @param {(payload: any) => void} callback - 回调函数
   */
  onAgentSkillProgress: (callback) => {
    ipcRenderer.on('agent-skill-progress', (_, payload) => callback(payload));
  },

  /**
   * 移除技能/工具调用进度监听（会移除所有该 channel 的监听）
   */
  removeAgentSkillProgressListener: () => {
    ipcRenderer.removeAllListeners('agent-skill-progress');
  },

  /**
   * 监听 agent loop 最终结果
   * @param {(payload: any) => void} callback - 回调函数
   */
  onAgentSkillFinal: (callback) => {
    ipcRenderer.on('agent-skill-final', (_, payload) => callback(payload));
  },

  /**
   * 移除自动更新状态监听
   * @param {(payload: any) => void} callback - 原始回调
   */
  removeUpdateStatusListener: (callback) => {
    ipcRenderer.removeAllListeners('update-status');
  }
});