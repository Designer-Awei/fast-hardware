/**
 * Fast Hardware - Electron主进程
 * 纯Electron实现，无React框架
 */

/**
 * 开发模式下关闭渲染进程控制台中的 Electron 安全提示（含「未设置 CSP / unsafe-eval」等）。
 * 官方说明：打包后该提示默认不出现；此变量仅影响开发态日志，不删除任何 CSP 配置（本项目 HTML 未设 CSP meta）。
 * @see https://www.electronjs.org/docs/latest/tutorial/security#checklist-security-recommendations
 */
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog, nativeTheme } = require('electron');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const fsSync = require('fs');
const fs = fsSync.promises;
const https = require('https');
const { readSupabaseConfig } = require('./supabase/config');
const {
  getAuthState: getSupabaseAuthState,
  getOAuthRedirectUrl: getSupabaseOAuthRedirectUrl,
  handleOAuthCallbackUrl: handleSupabaseOAuthCallbackUrl,
  signInWithOAuth: supabaseSignInWithOAuth,
  updateProfile: supabaseUpdateProfile,
  uploadAvatar: supabaseUploadAvatar,
  getProjectBackups: supabaseGetProjectBackups,
  uploadProjectBackup: supabaseUploadProjectBackup,
  deleteProjectBackup: supabaseDeleteProjectBackup,
  downloadProjectBackup: supabaseDownloadProjectBackup,
  signUpWithPassword: supabaseSignUpWithPassword,
  signInWithPassword: supabaseSignInWithPassword,
  signOut: supabaseSignOut
} = require('./supabase/auth-service');
const { setupSkillsEngineBridge } = require('./scripts/skills/renderer-engine-bridge');
const { executeSkillInMain } = require('./scripts/skills/main-skill-executor');
const { runSkillsAgentLoop } = require('./scripts/agent/skills-agent-loop');
const { clearAbort, requestAbort } = require('./scripts/agent/skills-agent-loop-abort');
const { executeProjectWorkspaceToolCall } = require('./scripts/agent/project-workspace-tools');

setupSkillsEngineBridge();

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
const MODEL_SYNC_TIMEOUT_MS = 5000;
const SUPABASE_AUTH_CALLBACK_CHANNEL = 'supabase-auth-callback';
const SUPABASE_OAUTH_LOOPBACK_HOST = '127.0.0.1';
const SUPABASE_OAUTH_LOOPBACK_PORT = 38129;
let pendingSupabaseAuthCallbackUrl = '';
let pendingSupabaseAuthCallbackPayload = null;
let supabaseOAuthCallbackServer = null;

/**
 * @returns {void}
 */
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

/**
 * 注册昵称更新与头像上传 IPC（在应用 ready 时执行，避免旧主进程未加载到最新 handler）。
 * @returns {void}
 */
function registerSupabaseProfileAndAvatarIpcHandlers() {
  try {
    ipcMain.removeHandler('supabase-auth-update-profile');
  } catch {
    /* 首次启动可能尚未注册过该 channel */
  }
  try {
    ipcMain.removeHandler('supabase-auth-upload-avatar');
  } catch {
    /* 首次启动可能尚未注册过该 channel */
  }
  ipcMain.handle('supabase-auth-update-profile', async (event, payload) => {
    try {
      return await supabaseUpdateProfile(payload || {});
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  });
  ipcMain.handle('supabase-auth-upload-avatar', async (event, payload) => {
    try {
      return await supabaseUploadAvatar(payload || {});
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  });
}

/**
 * @returns {string}
 */
function getSupabaseAuthRedirectUrl() {
  return String(getSupabaseOAuthRedirectUrl() || 'fasthardware://auth/callback').trim();
}

/**
 * @returns {string}
 */
function getSupabaseAuthProtocolScheme() {
  const redirectUrl = getSupabaseAuthRedirectUrl();
  try {
    return String(new URL(redirectUrl).protocol || '').replace(/:$/, '').trim();
  } catch {
    return 'fasthardware';
  }
}

/**
 * @param {string[]} argv
 * @returns {string}
 */
function extractSupabaseAuthDeepLinkFromArgv(argv) {
  const schemePrefix = `${getSupabaseAuthProtocolScheme()}://`;
  return String((argv || []).find((item) => String(item || '').startsWith(schemePrefix)) || '').trim();
}

/**
 * @returns {void}
 */
function registerSupabaseProtocolClient() {
  const scheme = getSupabaseAuthProtocolScheme();
  if (!scheme) {
    return;
  }
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1] || '.')]);
    return;
  }
  app.setAsDefaultProtocolClient(scheme);
}

/**
 * @param {{ success: boolean, message: string, state?: unknown, error?: string }} payload
 * @returns {void}
 */
function emitSupabaseAuthCallbackPayload(payload) {
  pendingSupabaseAuthCallbackPayload = payload;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoadingMainFrame()) {
    return;
  }
  mainWindow.webContents.send(SUPABASE_AUTH_CALLBACK_CHANNEL, payload);
  pendingSupabaseAuthCallbackPayload = null;
}

/**
 * @param {string} callbackUrl
 * @returns {Promise<void>}
 */
async function processSupabaseAuthCallbackUrl(callbackUrl) {
  const normalizedUrl = String(callbackUrl || '').trim();
  if (!normalizedUrl) {
    return;
  }
  const result = await handleSupabaseOAuthCallbackUrl(normalizedUrl);
  emitSupabaseAuthCallbackPayload(result);
}

/**
 * @param {string} callbackUrl
 * @returns {Promise<void>}
 */
async function queueOrProcessSupabaseAuthCallbackUrl(callbackUrl) {
  pendingSupabaseAuthCallbackUrl = String(callbackUrl || '').trim();
  if (!pendingSupabaseAuthCallbackUrl || !app.isReady()) {
    return;
  }
  const nextUrl = pendingSupabaseAuthCallbackUrl;
  pendingSupabaseAuthCallbackUrl = '';
  await processSupabaseAuthCallbackUrl(nextUrl);
}

/**
 * @returns {string}
 */
function getSupabaseLoopbackRedirectUrl() {
  return `http://${SUPABASE_OAUTH_LOOPBACK_HOST}:${SUPABASE_OAUTH_LOOPBACK_PORT}/auth/callback`;
}

/**
 * @param {{ success: boolean, message: string, error?: string }} payload
 * @returns {string}
 */
function buildSupabaseOAuthCallbackPage(payload) {
  const isSuccess = Boolean(payload?.success);
  const title = isSuccess ? '登录成功' : '登录失败';
  const message = String(payload?.message || (isSuccess ? '已完成登录，请返回应用。' : '登录失败，请返回应用重试。'));
  const tone = isSuccess ? '#1f7a4c' : '#b42318';
  const background = isSuccess ? '#ecfdf3' : '#fef3f2';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f6f8fc;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1f2937;
    }
    .card {
      width: min(92vw, 460px);
      box-sizing: border-box;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 28px 24px;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: ${tone};
      background: ${background};
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
    }
    p {
      margin: 0;
      line-height: 1.7;
      color: #475467;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">${title}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
}

/**
 * @returns {Promise<boolean>}
 */
async function ensureSupabaseOAuthCallbackServer() {
  if (supabaseOAuthCallbackServer) {
    return true;
  }
  return await new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(String(req.url || '/'), getSupabaseLoopbackRedirectUrl());
        if (requestUrl.pathname !== '/auth/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
          return;
        }
        const result = await handleSupabaseOAuthCallbackUrl(requestUrl.toString());
        emitSupabaseAuthCallbackPayload(result);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildSupabaseOAuthCallbackPage(result));
      } catch (error) {
        const payload = {
          success: false,
          message: error?.message || String(error),
          error: 'oauth_loopback_server_failed'
        };
        emitSupabaseAuthCallbackPayload(payload);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildSupabaseOAuthCallbackPage(payload));
      }
    });
    server.on('error', (error) => {
      console.warn('[supabase] OAuth 本地回调服务启动失败:', error?.message || error);
      resolve(false);
    });
    server.listen(SUPABASE_OAUTH_LOOPBACK_PORT, SUPABASE_OAUTH_LOOPBACK_HOST, () => {
      supabaseOAuthCallbackServer = server;
      resolve(true);
    });
  });
}

/**
 * 懒加载 `mcporter`，并兼容打包后被解包到 `app.asar.unpacked` 的场景。
 * `mcporter` 是 ESM-only 包，不能再用 `require.resolve()` 做启动预探测，否则会在启动期产生 exports 告警。
 * @returns {Promise<any>}
 */
async function importMcporterModule() {
  /** @type {unknown} */
  let lastError = null;
  const fileCandidates = [path.join(__dirname, 'node_modules', 'mcporter', 'dist', 'index.js')];
  if (process.resourcesPath) {
    fileCandidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'mcporter', 'dist', 'index.js'),
      path.join(process.resourcesPath, 'app.asar', 'node_modules', 'mcporter', 'dist', 'index.js')
    );
  }

  try {
    return await import('mcporter');
  } catch (error) {
    lastError = error;
  }

  for (const candidate of fileCandidates) {
    try {
      if (!fsSync.existsSync(candidate)) {
        continue;
      }
      return await import(pathToFileURL(candidate).href);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('mcporter 加载失败');
}

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

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', async (_event, commandLine) => {
  focusMainWindow();
  const deepLinkUrl = extractSupabaseAuthDeepLinkFromArgv(commandLine || []);
  if (deepLinkUrl) {
    await queueOrProcessSupabaseAuthCallbackUrl(deepLinkUrl);
  }
});

app.on('open-url', async (event, url) => {
  event.preventDefault();
  await queueOrProcessSupabaseAuthCallbackUrl(url);
});

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
let modelSyncState = {
  source: 'builtin',
  fetchedAt: null,
  lastAttemptAt: null,
  error: null,
  modelCount: 0,
  hasApiKey: false
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
    /** SiliconFlow Chat Completions：与 `resolveSiliconFlowEnableThinking` / 设置页「模型思考」一致 */
    siliconFlowEnableThinking: 'SILICONFLOW_ENABLE_THINKING=',
    autoCheckUpdates: 'AUTO_CHECK_UPDATES='
  };
}

/**
 * 获取设置项的默认路径（主要用于首次安装/历史空值迁移兜底）
 * @param {'storagePath'|'componentLibPath'} key
 * @returns {string|undefined}
 */
function getDefaultPathForSettingKey(key) {
  if (app.isPackaged) {
    if (key === 'storagePath') {
      return path.join(process.resourcesPath, 'data', 'projects').replace(/\\/g, '/');
    }
    if (key === 'componentLibPath') {
      return path.join(process.resourcesPath, 'data', 'system-components').replace(/\\/g, '/');
    }
  }
  if (key === 'storagePath') {
    return path.join(userDataPath, 'projects').replace(/\\/g, '/');
  }
  if (key === 'componentLibPath') {
    return undefined;
  }
  return undefined;
}

/**
 * 读取设置值
 * @param {string} key - 设置键
 * @returns {Promise<string|undefined>} 设置值
 */
async function readSettingValue(key) {
  try {
    const envContent = await fs.readFile(getEnvPath(), 'utf8');
    /** @type {string[]} */
    const lines = envContent.split(/\r?\n/);
    const envKey = getSettingsKeyMap()[key];
    if (!envKey) {
      return undefined;
    }

    for (const line of lines) {
      const t = line.replace(/^\uFEFF/, '').trimStart();
      if (t.startsWith(envKey)) {
        const value = t.substring(envKey.length).trim();
        return value || undefined;
      }
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * 从 env.local 解析 SiliconFlow「模型思考」开关（`SILICONFLOW_ENABLE_THINKING`），与设置页「模型思考」一致。
 * 缺省为 false；接受 true/false、1/0、yes/no（大小写不敏感）。
 * @returns {Promise<boolean>}
 */
async function resolveSiliconFlowEnableThinking() {
  const raw = await readSettingValue('siliconFlowEnableThinking');
  if (raw === undefined || raw === null) {
    return false;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') {
    return true;
  }
  return false;
}

/**
 * 将当前「模型思考」偏好写入 `process.env.SILICONFLOW_ENABLE_THINKING`，便于子进程/日志与其它读取 env 的逻辑一致。
 * @param {boolean} enabled
 * @returns {void}
 */
function applySiliconFlowEnableThinkingToProcessEnv(enabled) {
  process.env.SILICONFLOW_ENABLE_THINKING = enabled ? 'true' : 'false';
}

/**
 * 获取模型增强配置文件候选路径
 * @returns {string[]} 模型增强配置文件路径列表
 */
function getModelConfigCandidatePaths() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  return isDev
    ? [path.join(__dirname, 'model_config.json')]
    : Array.from(new Set([
        path.join(path.dirname(app.getPath('exe')), 'model_config.json'),
        path.join(process.resourcesPath, 'model_config.json'),
        path.join(__dirname, 'model_config.json')
      ]));
}

/**
 * 获取模型缓存文件路径
 * @returns {string} 模型缓存文件路径
 */
function getModelCachePath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'remoteModelsCache.json');
  }

  return path.join(app.getPath('temp'), 'fast-hardware-dev', 'remoteModelsCache.json');
}

/**
 * 获取内置模型增强配置
 * @returns {object} 内置模型增强配置
 */
function getDefaultModelEnhancementConfig() {
  return {
    version: '2.0.0',
    defaults: {
      chat: 'Qwen/Qwen3.5-27B',
      thinking: 'Qwen/Qwen3-8B',
      visual: 'Qwen/Qwen3.5-27B'
    },
    filters: {
      allowedTypes: ['chat', 'thinking', 'visual'],
      allowedProviders: ['Kimi', 'Hunyuan', 'DeepSeek', 'GLM', 'Qwen', 'MiniMax'],
      excludeIds: [],
      excludeNamePatterns: [
        'embedding',
        'reranker',
        'text-to-image',
        'image-to-image',
        'speech-to-text',
        'text-to-video',
        'tts',
        'asr'
      ],
      preferFree: false,
      maxCostLevel: 'high'
    },
    overrides: {
      'Qwen/Qwen3.5-27B': {
        displayName: 'Qwen3.5-27B',
        appType: 'chat',
        capabilities: ['text', 'image', 'code', 'long_context'],
        description: '默认对话模型（支持多模态）',
        priority: 100,
        costLevel: 'medium',
        pricing: {
          inputPerMillion: null,
          outputPerMillion: null,
          currency: 'CNY'
        }
      },
      'THUDM/GLM-4-9B-0414': {
        displayName: 'GLM-4-9B',
        appType: 'chat',
        capabilities: ['text', 'code'],
        description: '备选小尺寸对话模型',
        priority: 72,
        costLevel: 'low',
        pricing: {
          inputPerMillion: null,
          outputPerMillion: null,
          currency: 'CNY'
        }
      },
      'Qwen/Qwen3-8B': {
        displayName: 'Qwen3-8B',
        appType: 'thinking',
        capabilities: ['text', 'code', 'thinking'],
        description: '默认思考模型',
        priority: 96,
        costLevel: 'low',
        pricing: {
          inputPerMillion: null,
          outputPerMillion: null,
          currency: 'CNY'
        }
      },
      'THUDM/GLM-4.1V-9B-Thinking': {
        displayName: 'GLM-4.1V',
        appType: 'visual',
        capabilities: ['text', 'image', 'code', 'thinking'],
        description: '视觉思考模型',
        priority: 92,
        costLevel: 'medium',
        pricing: {
          inputPerMillion: null,
          outputPerMillion: null,
          currency: 'CNY'
        }
      },
      'Qwen/Qwen2.5-VL-32B-Instruct': {
        displayName: 'Qwen2.5-VL-32B',
        appType: 'visual',
        capabilities: ['text', 'image', 'long_context'],
        description: '默认视觉模型',
        priority: 90,
        costLevel: 'high',
        pricing: {
          inputPerMillion: null,
          outputPerMillion: null,
          currency: 'CNY'
        }
      },
      'Qwen/Qwen3-VL-30B-A3B-Instruct': {
        displayName: 'Qwen3-VL-30B',
        appType: 'visual',
        capabilities: ['text', 'image', 'long_context'],
        description: 'Qwen3 视觉长文本模型',
        priority: 84,
        costLevel: 'high',
        pricing: {
          inputPerMillion: null,
          outputPerMillion: null,
          currency: 'CNY'
        }
      }
    }
  };
}

/**
 * 将旧版静态模型配置转换为增强配置结构
 * @param {object} legacyConfig - 旧版模型配置
 * @returns {object} 转换后的增强配置
 */
function convertLegacyModelConfig(legacyConfig) {
  const baseConfig = getDefaultModelEnhancementConfig();
  if (!Array.isArray(legacyConfig?.models)) {
    return baseConfig;
  }

  const overrides = { ...baseConfig.overrides };
  const defaults = { ...baseConfig.defaults };

  legacyConfig.models.forEach((model) => {
    if (!model?.name) {
      return;
    }

    const appType = model.appType || model.type || 'chat';
    overrides[model.name] = {
      displayName: model.displayName,
      appType,
      capabilities: Array.isArray(model.capabilities) ? model.capabilities : undefined,
      description: model.description,
      priority: model.priority,
      costLevel: model.costLevel,
      pricing: model.pricing,
      enabled: model.enabled !== false
    };

    if (!defaults[appType]) {
      defaults[appType] = model.name;
    }
  });

  return {
    version: legacyConfig.version || baseConfig.version,
    defaults,
    filters: { ...baseConfig.filters },
    overrides
  };
}

/**
 * 规范化模型增强配置
 * @param {object} rawConfig - 原始模型增强配置
 * @returns {object} 规范化后的模型增强配置
 */
function normalizeModelEnhancementConfig(rawConfig) {
  if (Array.isArray(rawConfig?.models)) {
    return convertLegacyModelConfig(rawConfig);
  }

  const defaultConfig = getDefaultModelEnhancementConfig();
  return {
    version: rawConfig?.version || defaultConfig.version,
    defaults: {
      ...defaultConfig.defaults,
      ...(rawConfig?.defaults || {})
    },
    filters: {
      ...defaultConfig.filters,
      ...(rawConfig?.filters || {})
    },
    overrides: {
      ...defaultConfig.overrides,
      ...(rawConfig?.overrides || {})
    }
  };
}

/**
 * 加载本地模型增强配置
 * @returns {Promise<object>} 模型增强配置
 */
async function loadModelEnhancementConfig() {
  const candidatePaths = getModelConfigCandidatePaths();
  let lastError = null;

  for (const configPath of candidatePaths) {
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      console.log('✅ 模型增强配置加载成功:', configPath);
      return normalizeModelEnhancementConfig(config);
    } catch (error) {
      lastError = error;
      console.warn('⚠️ 模型增强配置读取失败，继续尝试下一个路径:', {
        configPath,
        message: error.message
      });
    }
  }

  if (lastError) {
    console.error('❌ 加载模型增强配置失败，使用内置默认配置:', lastError.message);
  }
  return getDefaultModelEnhancementConfig();
}

/**
 * 读取 SiliconFlow API Key
 * @returns {Promise<string|null>} API Key
 */
async function readSiliconFlowApiKey() {
  const apiKey = await readSettingValue('apiKey');
  return apiKey || null;
}

/**
 * 发起 SiliconFlow JSON 请求
 * @param {object} options - 请求配置
 * @param {string} options.method - HTTP 方法
 * @param {string} options.path - 请求路径
 * @param {string|null} options.apiKey - API Key
 * @param {object|null} [options.body=null] - 请求体
 * @returns {Promise<any>} 解析后的响应 JSON
 */
async function requestSiliconFlowJson({ method, path: requestPath, apiKey, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request({
      hostname: 'api.siliconflow.cn',
      port: 443,
      path: requestPath,
      method,
      headers
    }, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = responseBody ? JSON.parse(responseBody) : {};
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }

          reject(new Error(parsed?.error?.message || `请求失败: ${res.statusCode}`));
        } catch (error) {
          reject(new Error(`响应解析失败: ${error.message}`));
        }
      });
    });

    req.setTimeout(MODEL_SYNC_TIMEOUT_MS, () => {
      req.destroy(new Error(`请求超时 (${MODEL_SYNC_TIMEOUT_MS}ms)`));
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

/**
 * 获取 SiliconFlow 在线模型列表
 * @param {string} apiKey - API Key
 * @returns {Promise<Array<object>>} 在线模型列表
 */
async function fetchRemoteModelCatalog(apiKey) {
  const response = await requestSiliconFlowJson({
    method: 'GET',
    path: '/v1/models',
    apiKey
  });

  if (!Array.isArray(response?.data)) {
    throw new Error('模型列表响应格式无效');
  }

  return response.data;
}

/**
 * 获取公开页面文本内容
 * @param {object} options - 请求配置
 * @param {string} options.hostname - 域名
 * @param {string} options.path - 路径
 * @returns {Promise<string>} 页面文本
 */
async function fetchPublicPageText({ hostname, path: requestPath }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      port: 443,
      path: requestPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Fast-Hardware/0.2.8'
      }
    }, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
          return;
        }

        reject(new Error(`页面请求失败: ${res.statusCode}`));
      });
    });

    req.setTimeout(MODEL_SYNC_TIMEOUT_MS, () => {
      req.destroy(new Error(`页面请求超时 (${MODEL_SYNC_TIMEOUT_MS}ms)`));
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * 转义正则字符串
 * @param {string} value - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解码常见 HTML 实体
 * @param {string} html - HTML 文本
 * @returns {string} 解码后的文本
 */
function decodeHtmlEntities(html) {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * 将 HTML 转换为便于解析的纯文本
 * @param {string} html - 原始 HTML
 * @returns {string} 纯文本
 */
function convertHtmlToPlainText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * 获取模型名称的价格匹配候选
 * @param {string} modelName - 模型名称
 * @returns {string[]} 匹配候选
 */
function buildPricingNameCandidates(modelName) {
  const withoutTierPrefix = modelName.replace(/^(Pro|LoRA)\//i, '');
  const shortName = withoutTierPrefix.split('/').pop() || withoutTierPrefix;
  return Array.from(new Set([
    modelName,
    withoutTierPrefix,
    shortName
  ].filter(Boolean)));
}

/**
 * 从文本中提取指定模型的官方价格
 * @param {string} plainText - 价格页纯文本
 * @param {string} modelName - 模型名称
 * @returns {{inputPerMillion: number, outputPerMillion: number, currency: string, source: string}|null} 官方价格
 */
function extractOfficialPricingForModel(plainText, modelName) {
  const candidates = buildPricingNameCandidates(modelName);
  for (const candidate of candidates) {
    const pattern = new RegExp(
      `${escapeRegExp(candidate)}\\s+[0-9]{1,4}K[\\s\\S]{0,120}?\\$\\s*([0-9.]+)\\s*[\\s\\S]{0,40}?\\$\\s*([0-9.]+)`,
      'i'
    );
    const match = plainText.match(pattern);
    if (match) {
      return {
        inputPerMillion: Number(match[1]),
        outputPerMillion: Number(match[2]),
        currency: 'USD',
        source: 'official-pricing-page'
      };
    }
  }

  return null;
}

/**
 * 从官网价格页提取模型价格映射
 * @param {Array<object>} rawModels - 原始模型列表
 * @returns {Promise<Map<string, {inputPerMillion: number, outputPerMillion: number, currency: string, source: string}>>} 价格映射
 */
async function fetchOfficialPricingMap(rawModels) {
  const pricingPageHtml = await fetchPublicPageText({
    hostname: 'www.siliconflow.com',
    path: '/pricing'
  });
  const pricingPageText = convertHtmlToPlainText(pricingPageHtml);
  const pricingMap = new Map();

  rawModels.forEach((rawModel) => {
    const modelName = rawModel?.id;
    if (!modelName || pricingMap.has(modelName)) {
      return;
    }

    const officialPricing = extractOfficialPricingForModel(pricingPageText, modelName);
    if (officialPricing) {
      pricingMap.set(modelName, officialPricing);
    }
  });

  return pricingMap;
}

/**
 * 推断模型显示名称（与 SiliconFlow `id` 对齐：保留 MoE 等后缀如 -A3B/-A17B，避免与同名稠密模型混淆）
 * @param {string} modelName - 原始模型名称
 * @returns {string} 显示名称
 */
function deriveDisplayName(modelName) {
  const rawName = modelName.split('/').pop() || modelName;
  return rawName
    .replace(/-Instruct$/i, '')
    .replace(/-Chat$/i, '')
    .replace(/-\d{4,8}$/i, '');
}

/**
 * 推断模型所属服务商分组
 * @param {string} modelName - 模型名称
 * @param {string} displayName - 显示名称
 * @returns {string} 服务商分组名称
 */
function deriveProviderGroup(modelName, displayName) {
  const sourceText = `${modelName} ${displayName}`.toLowerCase();
  const providerAliases = [
    ['GLM', /(glm|zai-org|thudm)/i],
    ['Qwen', /qwen/i],
    ['DeepSeek', /deepseek/i],
    ['Kimi', /(kimi|moonshot)/i],
    ['MiniMax', /minimax/i],
    ['Hunyuan', /hunyuan/i],
    ['ERNIE', /(ernie|baidu)/i],
    ['GPT', /(gpt|openai)/i],
    ['Ling', /ling-/i]
  ];

  for (const [providerName, pattern] of providerAliases) {
    if (pattern.test(sourceText)) {
      return providerName;
    }
  }

  const normalizedName = modelName.replace(/^(Pro|LoRA)\//i, '');
  const rawProvider = normalizedName.includes('/') ? normalizedName.split('/')[0] : normalizedName;
  return rawProvider || 'Other';
}

/**
 * 推断项目业务模型类型
 * @param {string} modelName - 模型名称
 * @param {object} override - 覆盖配置
 * @returns {string} 项目业务模型类型
 */
function inferAppType(modelName, override = {}) {
  if (override.appType || override.type) {
    return override.appType || override.type;
  }

  const normalizedName = modelName.toLowerCase();
  if (/(vl|vision|vlm|glm-4\.1v|qvq|image)/.test(normalizedName)) {
    return 'visual';
  }

  if (/(thinking|reason|reasoning|deepseek-r1|qwq|o1|o3)/.test(normalizedName)) {
    return 'thinking';
  }

  return 'chat';
}

/**
 * 推断模型能力标签
 * @param {string} appType - 项目业务模型类型
 * @param {object} override - 覆盖配置
 * @returns {string[]} 能力标签
 */
function inferCapabilities(appType, override = {}) {
  if (Array.isArray(override.capabilities) && override.capabilities.length > 0) {
    return override.capabilities;
  }

  if (appType === 'visual') {
    return ['text', 'image'];
  }

  if (appType === 'thinking') {
    return ['text', 'code', 'thinking'];
  }

  return ['text', 'code'];
}

/**
 * 将成本等级转换为排序权重
 * @param {string} costLevel - 成本等级
 * @returns {number} 排序权重
 */
function getCostLevelWeight(costLevel) {
  const weights = {
    free: 0,
    low: 1,
    medium: 2,
    high: 3,
    unknown: 4
  };
  return weights[costLevel] ?? weights.unknown;
}

/**
 * 判断模型成本是否超出允许范围
 * @param {string} costLevel - 模型成本等级
 * @param {string} maxCostLevel - 最大允许成本等级
 * @returns {boolean} 是否超出范围
 */
function isCostLevelExcluded(costLevel, maxCostLevel) {
  if (!maxCostLevel || maxCostLevel === 'unknown' || costLevel === 'unknown') {
    return false;
  }

  return getCostLevelWeight(costLevel) > getCostLevelWeight(maxCostLevel);
}

/**
 * 根据价格推导成本等级
 * @param {{inputPerMillion?: number, outputPerMillion?: number}|null} pricing - 价格信息
 * @returns {string} 成本等级
 */
function deriveCostLevelFromPricing(pricing) {
  if (!pricing || !Number.isFinite(pricing.inputPerMillion) || !Number.isFinite(pricing.outputPerMillion)) {
    return 'unknown';
  }

  const peakPrice = Math.max(pricing.inputPerMillion, pricing.outputPerMillion);
  if (peakPrice === 0) {
    return 'free';
  }

  if (peakPrice <= 0.2) {
    return 'low';
  }

  if (peakPrice <= 1) {
    return 'medium';
  }

  return 'high';
}

/**
 * 获取模型排序用价格
 * @param {{inputPerMillion?: number, outputPerMillion?: number}|null} pricing - 价格信息
 * @returns {number} 排序价格
 */
function getPricingSortValue(pricing) {
  if (!pricing || !Number.isFinite(pricing.inputPerMillion) || !Number.isFinite(pricing.outputPerMillion)) {
    return Number.POSITIVE_INFINITY;
  }

  return pricing.inputPerMillion + pricing.outputPerMillion;
}

/**
 * 判断模型名是否命中过滤规则
 * @param {string} modelName - 模型名称
 * @param {string[]} patterns - 过滤模式
 * @returns {boolean} 是否命中
 */
function matchesExcludePatterns(modelName, patterns = []) {
  const normalizedName = modelName.toLowerCase();
  return patterns.some((pattern) => normalizedName.includes(String(pattern).toLowerCase()));
}

/**
 * 从增强配置生成内置模型列表
 * @param {object} enhancementConfig - 模型增强配置
 * @returns {Array<object>} 内置模型列表
 */
function buildBuiltinRawModels(enhancementConfig) {
  return Object.keys(enhancementConfig.overrides || {}).map((name) => ({
    id: name,
    object: 'model',
    owned_by: name.split('/')[0] || '',
    created: 0
  }));
}

/**
 * 生成推荐描述
 * @param {string} appType - 业务模型类型
 * @param {object} override - 覆盖配置
 * @returns {string} 模型描述
 */
function getModelDescription(appType, override = {}) {
  if (override.description) {
    return override.description;
  }

  if (appType === 'visual') {
    return '适合图片理解与多模态问答';
  }

  if (appType === 'thinking') {
    return '适合复杂推理与方案分析';
  }

  return '适合日常对话与代码辅助';
}

/**
 * 确保默认模型存在于当前候选列表中
 * @param {string} preferredName - 首选模型名
 * @param {Array<object>} models - 候选模型列表
 * @param {string} appType - 业务模型类型
 * @returns {string|null} 可用默认模型名
 */
function resolveDefaultModelName(preferredName, models, appType) {
  if (preferredName && models.some((model) => model.name === preferredName)) {
    return preferredName;
  }

  const fallbackModel = models.find((model) => model.appType === appType) || models[0];
  return fallbackModel ? fallbackModel.name : null;
}

/**
 * 将远程模型列表解析为前端可直接使用的模型配置
 * @param {Array<object>} rawModels - 远程原始模型列表
 * @param {object} enhancementConfig - 模型增强配置
 * @param {string} source - 数据来源
 * @param {string|null} fetchedAt - 拉取时间
 * @param {Map<string, {inputPerMillion: number, outputPerMillion: number, currency: string, source: string}>} [officialPricingMap] - 官网价格映射
 * @returns {object} 解析后的模型配置
 */
function buildResolvedModelConfig(rawModels, enhancementConfig, source, fetchedAt, officialPricingMap = new Map()) {
  const filters = enhancementConfig.filters || {};
  const allowedTypes = Array.isArray(filters.allowedTypes) ? filters.allowedTypes : ['chat', 'thinking', 'visual'];
  const allowedProviders = Array.isArray(filters.allowedProviders) && filters.allowedProviders.length > 0
    ? filters.allowedProviders
    : ['Kimi', 'Hunyuan', 'DeepSeek', 'GLM', 'Qwen', 'MiniMax'];
  const excludeIds = Array.isArray(filters.excludeIds) ? filters.excludeIds : [];
  const excludeNamePatterns = Array.isArray(filters.excludeNamePatterns) ? filters.excludeNamePatterns : [];
  const preferFree = filters.preferFree === true;
  const maxCostLevel = filters.maxCostLevel || 'high';
  const overrides = enhancementConfig.overrides || {};
  const uniqueModels = new Map();

  rawModels.forEach((rawModel) => {
    const modelName = rawModel?.id;
    if (!modelName || uniqueModels.has(modelName)) {
      return;
    }

    const override = overrides[modelName] || {};
    const appType = inferAppType(modelName, override);
    if (!allowedTypes.includes(appType)) {
      return;
    }

    if (excludeIds.includes(modelName) || matchesExcludePatterns(modelName, excludeNamePatterns)) {
      return;
    }

    const officialPricing = officialPricingMap.get(modelName) || null;
    const resolvedPricing = officialPricing || override.pricing || null;
    const costLevel = override.costLevel || deriveCostLevelFromPricing(resolvedPricing);
    if (isCostLevelExcluded(costLevel, maxCostLevel)) {
      return;
    }

    const capabilityFit = appType === 'visual' ? 3 : appType === 'thinking' ? 2 : 1;
    const priority = Number.isFinite(override.priority) ? override.priority : (appType === 'chat' ? 80 : appType === 'thinking' ? 78 : 76);
    const costPenalty = getCostLevelWeight(costLevel);
    const freeBonus = preferFree && costLevel === 'free' ? 40 : 0;
    const score = capabilityFit * 50 + priority * 30 - costPenalty * 20 + freeBonus;
    const displayName = override.displayName || deriveDisplayName(modelName);
    const providerGroup = override.providerGroup || deriveProviderGroup(modelName, displayName);
    if (!allowedProviders.includes(providerGroup)) {
      return;
    }
    const model = {
      id: override.id || modelName,
      name: modelName,
      displayName,
      providerType: rawModel.type || 'text',
      providerSubType: rawModel.sub_type || 'chat',
      providerGroup,
      appType,
      type: appType,
      capabilities: inferCapabilities(appType, override),
      description: getModelDescription(appType, override),
      enabled: override.enabled !== false,
      costLevel,
      priority,
      pricing: resolvedPricing,
      hasKnownPricing: Number.isFinite(resolvedPricing?.inputPerMillion) && Number.isFinite(resolvedPricing?.outputPerMillion),
      pricingSortValue: getPricingSortValue(resolvedPricing),
      status: 'available',
      source,
      score,
      ownedBy: rawModel.owned_by || '',
      created: rawModel.created || 0
    };

    uniqueModels.set(modelName, model);
  });

  const models = Array.from(uniqueModels.values())
    .filter((model) => model.enabled)
    .sort((a, b) => {
      if (a.appType !== b.appType) {
        return a.appType.localeCompare(b.appType);
      }

      if (a.providerGroup !== b.providerGroup) {
        return a.providerGroup.localeCompare(b.providerGroup, 'en', { sensitivity: 'base' });
      }

      if (a.hasKnownPricing !== b.hasKnownPricing) {
        return a.hasKnownPricing ? -1 : 1;
      }

      if (a.hasKnownPricing && a.pricingSortValue !== b.pricingSortValue) {
        return a.pricingSortValue - b.pricingSortValue;
      }

      if (a.score !== b.score) {
        return b.score - a.score;
      }

      return a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' });
    });

  const defaults = {
    chat: resolveDefaultModelName(enhancementConfig.defaults?.chat, models, 'chat'),
    thinking: resolveDefaultModelName(enhancementConfig.defaults?.thinking, models, 'thinking'),
    visual: resolveDefaultModelName(enhancementConfig.defaults?.visual, models, 'visual')
  };

  return {
    version: enhancementConfig.version || '2.0.0',
    fetchedAt,
    source,
    defaults,
    filters,
    models
  };
}

/**
 * 写入远程模型缓存
 * @param {Array<object>} rawModels - 原始模型列表
 * @param {string} fetchedAt - 拉取时间
 */
async function writeRemoteModelCache(rawModels, fetchedAt) {
  const cachePath = getModelCachePath();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({
    version: '1.0.0',
    fetchedAt,
    rawModels
  }, null, 2), 'utf8');
}

/**
 * 读取远程模型缓存
 * @returns {Promise<{fetchedAt: string|null, rawModels: Array<object>}|null>} 缓存内容
 */
async function readRemoteModelCache() {
  try {
    const cacheContent = await fs.readFile(getModelCachePath(), 'utf8');
    const cache = JSON.parse(cacheContent);
    if (!Array.isArray(cache?.rawModels)) {
      return null;
    }

    return {
      fetchedAt: cache.fetchedAt || null,
      rawModels: cache.rawModels
    };
  } catch (error) {
    return null;
  }
}

/**
 * 更新模型同步状态
 * @param {Partial<typeof modelSyncState>} patch - 状态补丁
 */
function updateModelSyncState(patch) {
  modelSyncState = {
    ...modelSyncState,
    ...patch
  };
}

/**
 * 解析模型目录，优先在线拉取，失败时回退缓存和内置配置
 * @param {object} [options={}] - 解析选项
 * @param {boolean} [options.forceRefresh=false] - 是否强制刷新在线数据
 * @returns {Promise<object>} 解析后的模型配置
 */
async function resolveModelCatalog(options = {}) {
  const { forceRefresh = false } = options;
  const enhancementConfig = await loadModelEnhancementConfig();
  const attemptAt = new Date().toISOString();
  updateModelSyncState({
    lastAttemptAt: attemptAt,
    error: null
  });
  let officialPricingMap = new Map();

  const apiKey = await readSiliconFlowApiKey();
  updateModelSyncState({
    hasApiKey: Boolean(apiKey)
  });
  if (apiKey) {
    try {
      const remoteModels = await fetchRemoteModelCatalog(apiKey);
      try {
        officialPricingMap = await fetchOfficialPricingMap(remoteModels);
      } catch (pricingError) {
        console.warn('⚠️ 官网价格页解析失败，继续使用本地价格兜底:', pricingError.message);
      }
      const fetchedAt = new Date().toISOString();
      await writeRemoteModelCache(remoteModels, fetchedAt);
      const resolvedConfig = buildResolvedModelConfig(remoteModels, enhancementConfig, 'remote', fetchedAt, officialPricingMap);
      updateModelSyncState({
        source: 'remote',
        fetchedAt,
        error: null,
        modelCount: resolvedConfig.models.length
      });
      return resolvedConfig;
    } catch (error) {
      console.warn('⚠️ 在线模型列表拉取失败，准备回退缓存:', error.message);
      updateModelSyncState({
        error: error.message
      });
      if (forceRefresh) {
        console.warn('⚠️ 当前为手动刷新，在线失败后仍尝试使用缓存结果');
      }
    }
  } else {
    /** 无密钥时允许直接回退缓存/内置模型；这不是“错误”，否则首次安装会给人一种模型列表被阻塞的感觉 */
    updateModelSyncState({
      error: null
    });
  }

  const cachedCatalog = await readRemoteModelCache();
  if (cachedCatalog) {
    if (apiKey) {
      try {
        officialPricingMap = await fetchOfficialPricingMap(cachedCatalog.rawModels);
      } catch (pricingError) {
        console.warn('⚠️ 缓存模型价格补全失败，继续使用本地价格兜底:', pricingError.message);
      }
    }
    const resolvedConfig = buildResolvedModelConfig(cachedCatalog.rawModels, enhancementConfig, 'cache', cachedCatalog.fetchedAt, officialPricingMap);
    updateModelSyncState({
      source: 'cache',
      fetchedAt: cachedCatalog.fetchedAt,
      modelCount: resolvedConfig.models.length
    });
    return resolvedConfig;
  }

  const builtinModels = buildBuiltinRawModels(enhancementConfig);
  if (apiKey) {
    try {
      officialPricingMap = await fetchOfficialPricingMap(builtinModels);
    } catch (pricingError) {
      console.warn('⚠️ 内置模型价格补全失败，继续使用本地价格兜底:', pricingError.message);
    }
  }
  const resolvedConfig = buildResolvedModelConfig(builtinModels, enhancementConfig, 'builtin', null, officialPricingMap);
  updateModelSyncState({
    source: 'builtin',
    fetchedAt: null,
    modelCount: resolvedConfig.models.length
  });
  return resolvedConfig;
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
  return Boolean(autoUpdater) && (process.platform === 'win32' || process.platform === 'darwin');
}

/**
 * 获取自动更新不可用的原因
 * @returns {'missing-module'|'unsupported-platform'|'available'} 不可用原因
 */
function getAutoUpdateUnavailableReason() {
  if (!autoUpdater) {
    return 'missing-module';
  }

  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return 'unsupported-platform';
  }

  return 'available';
}

/**
 * 比较两个版本号大小
 * @param {string} currentVersion - 当前版本
 * @param {string} targetVersion - 目标版本
 * @returns {number} 1 表示当前版本更高，-1 表示目标版本更高，0 表示相同
 */
function compareVersions(currentVersion, targetVersion) {
  const normalizeVersion = (version) => String(version || '')
    .split('-')[0]
    .split('.')
    .map((segment) => Number.parseInt(segment, 10) || 0);

  const currentSegments = normalizeVersion(currentVersion);
  const targetSegments = normalizeVersion(targetVersion);
  const maxLength = Math.max(currentSegments.length, targetSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const currentValue = currentSegments[index] || 0;
    const targetValue = targetSegments[index] || 0;
    if (currentValue > targetValue) {
      return 1;
    }
    if (currentValue < targetValue) {
      return -1;
    }
  }

  return 0;
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
  autoUpdater.forceDevUpdateConfig = !app.isPackaged;

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

  autoUpdater.on('update-not-available', (info) => {
    const currentVersion = app.getVersion();
    const latestVersion = info?.version || currentVersion;
    const versionCompareResult = compareVersions(currentVersion, latestVersion);

    if (versionCompareResult > 0) {
      broadcastUpdateStatus({
        status: 'up-to-date',
        latestVersion,
        downloadedFile: null,
        message: '当前为开发版本'
      });
      return;
    }

    broadcastUpdateStatus({
      status: 'up-to-date',
      latestVersion,
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
 * 等待 Splash 页面完成首帧渲染
 * @returns {Promise<void>} 首帧渲染完成
 */
async function waitForSplashVisualReady() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }

  try {
    await splashWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const completeRender = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        };

        const logo = document.getElementById('splash-logo');
        if (!logo || !logo.getAttribute('src')) {
          completeRender();
          return;
        }

        if (logo.complete) {
          completeRender();
          return;
        }

        const fallbackTimer = setTimeout(() => {
          completeRender();
        }, 400);

        const handleComplete = () => {
          clearTimeout(fallbackTimer);
          completeRender();
        };

        logo.addEventListener('load', handleComplete, { once: true });
        logo.addEventListener('error', handleComplete, { once: true });
      });
    `, true);
  } catch (error) {
    logStartupStage('splash:visual-wait-failed', {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 创建启动 Splash 窗口
 * @returns {Promise<void>} Splash 窗口进入可继续启动主窗口的状态
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
    paintWhenInitiallyHidden: true,
    backgroundColor: '#061822',
    icon: path.join(__dirname, 'assets/icon.png')
  });

    splashWindow.webContents.once('did-finish-load', async () => {
      await waitForSplashVisualReady();
      if (!splashWindow || splashWindow.isDestroyed() || splashWindow.isVisible()) {
        resolveOnce();
        return;
      }

      splashShownAt = Date.now();
      splashWindow.show();
      splashWindow.focus();
      logStartupStage('splash:did-finish-load-and-show');
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
        logStartupStage('splash:show-timeout');
      }
      resolveOnce();
    }, 1500);
  });

  return splashReadyPromise;
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

# SiliconFlow：是否在 Chat Completions 中启用 enable_thinking（与设置页「模型思考」一致，默认关）
SILICONFLOW_ENABLE_THINKING=false
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
  let hasInitializedWindowAfterFirstLoad = false;
  let reloadWindowSnapshot = null;
  mainWindow.webContents.on('did-start-loading', () => {
    if (!hasInitializedWindowAfterFirstLoad || mainWindow.isDestroyed()) {
      return;
    }
    reloadWindowSnapshot = {
      isMaximized: mainWindow.isMaximized(),
      bounds: mainWindow.getBounds()
    };
  });
  mainWindow.webContents.on('did-finish-load', async () => {
    if (hasInitializedWindowAfterFirstLoad) {
      logStartupStage('webContents:did-finish-load:reload-skip-window-restore', {
        url: mainWindow.webContents.getURL()
      });
      if (reloadWindowSnapshot && !mainWindow.isDestroyed()) {
        if (reloadWindowSnapshot.isMaximized) {
          if (!mainWindow.isMaximized()) {
            mainWindow.maximize();
          }
        } else {
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          }
          mainWindow.setBounds(reloadWindowSnapshot.bounds, true);
        }
        reloadWindowSnapshot = null;
      }
      return;
    }
    hasInitializedWindowAfterFirstLoad = true;
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
    if (pendingSupabaseAuthCallbackPayload) {
      mainWindow.webContents.send(SUPABASE_AUTH_CALLBACK_CHANNEL, pendingSupabaseAuthCallbackPayload);
      pendingSupabaseAuthCallbackPayload = null;
    }

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
  registerSupabaseProfileAndAvatarIpcHandlers();
  registerSupabaseProtocolClient();
  pendingSupabaseAuthCallbackUrl = extractSupabaseAuthDeepLinkFromArgv(process.argv);
  await ensureSupabaseOAuthCallbackServer();

  await createSplashWindow();

  // 初始化用户配置文件
  await initializeUserConfig();

  applySiliconFlowEnableThinkingToProcessEnv(await resolveSiliconFlowEnableThinking());

  setupAutoUpdater();
  createWindow();
  if (pendingSupabaseAuthCallbackUrl) {
    await queueOrProcessSupabaseAuthCallbackUrl(pendingSupabaseAuthCallbackUrl);
  }

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
app.on('activate', async () => {
  console.log('应用程序被激活');
  if (BrowserWindow.getAllWindows().length === 0) {
    await createSplashWindow();
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

/**
 * 主进程执行 skill（`skills/skills/<skillId>/index.js`）；`CircuitSkillsEngine` 经 `skills-engine-invoke` 在渲染进程执行。
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {{ skillName: string, args?: unknown, ctxPayload?: { userRequirement?: string, canvasSnapshot?: unknown } }} payload
 * @returns {Promise<unknown>}
 */
ipcMain.handle('execute-skill', async (event, payload) => {
  try {
    return await executeSkillInMain(event.sender, payload);
  } catch (e) {
    console.error('[execute-skill]', e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
});

/**
 * 主进程 Skills Agent 多轮循环（原渲染进程 `runSkillsAgentLoop` 编排逻辑）。
 * 进度经 `webContents.send('skills-agent-loop-progress', detail)` 发往渲染进程。
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {{ userMessage?: string, model?: string, temperature?: number, canvasSnapshot?: unknown }} payload
 * @returns {Promise<{ success: boolean, ok?: boolean, outcome?: string, assistantMessages?: Array<{type:string, content?:string}>, error?: string, errorMessage?: string }>}
 */
ipcMain.on('skills-agent-loop-abort', (event) => {
  try {
    if (!event.sender.isDestroyed()) {
      requestAbort(event.sender.id);
    }
  } catch (e) {
    console.warn('[skills-agent-loop-abort]', e?.message || e);
  }
});

ipcMain.handle('run-skills-agent-loop', async (event, payload) => {
  const wcId = event.sender.id;
  clearAbort(wcId);

  const p = payload && typeof payload === 'object' ? payload : {};
  const userMessage = String(p.userMessage || '');
  const model = String(p.model || '');
  const temperature = typeof p.temperature === 'number' ? p.temperature : 0.2;
  const canvasSnapshot = p.canvasSnapshot;
  const projectPath = String(p.projectPath || '').trim();

  try {
    const result = await runSkillsAgentLoop(event.sender, {
      userMessage,
      model,
      temperature,
      canvasSnapshot,
      projectPath,
      callLLM: async (messages, mdl, temp, meta) => {
        const temperature = typeof temp === 'number' ? temp : 0.2;
        if (meta && meta.mode === 'stream_markdown') {
          const sr = await callSiliconFlowAPIStream(event.sender, messages, mdl, {
            temperature,
            longOutput: true,
            chunkChannel: 'skills-agent-loop-final-stream-chunk'
          });
          if (!sr.success) {
            throw new Error(sr.error || 'LLM 流式调用失败');
          }
          return { content: sr.content || '' };
        }
        const r = await callSiliconFlowAPI(messages, mdl, {
          temperature,
          longOutput: true
        });
        if (!r.success) {
          throw new Error(r.error || 'LLM API 调用失败');
        }
        return { content: r.content };
      }
    });
    return { success: true, ...result };
  } catch (e) {
    console.error('[run-skills-agent-loop]', e?.message || e);
    return {
      success: false,
      error: e?.message || String(e)
    };
  } finally {
    clearAbort(wcId);
  }
});

/**
 * 渲染进程直连对话：执行项目工作区读盘工具（与主进程 `project-workspace-tools` 同源实现）。
 */
ipcMain.handle('execute-project-workspace-tool', async (event, payload) => {
  const p = payload && typeof payload === 'object' ? payload : {};
  const projectRoot = String(p.projectRoot || '').trim();
  const toolName = String(p.toolName || '');
  const args = p.args && typeof p.args === 'object' ? p.args : {};
  try {
    return await executeProjectWorkspaceToolCall(toolName, args, projectRoot);
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});

/**
 * 渲染进程 skills / agent 进度：由 preload `publishAgentSkillProgress` 发来，原路 `agent-skill-progress` 广播回同一 webContents，
 * 便于 `onAgentSkillProgress` 订阅（与聊天区内联进度文案同源）。
 */
ipcMain.on('agent-skill-progress-emit', (event, detail) => {
  try {
    if (event.sender.isDestroyed()) return;
    event.sender.send('agent-skill-progress', detail == null ? {} : detail);
  } catch (e) {
    console.warn('[ipc] agent-skill-progress-emit failed:', e?.message || e);
  }
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
  return resolveModelCatalog();
});

/**
 * 加载解析后的在线模型配置
 */
ipcMain.handle('load-resolved-model-config', async () => {
  return resolveModelCatalog();
});

/**
 * 手动刷新在线模型列表
 */
ipcMain.handle('refresh-model-list', async () => {
  return resolveModelCatalog({ forceRefresh: true });
});

/**
 * 获取模型同步状态
 */
ipcMain.handle('get-model-sync-status', async () => {
  return {
    ...modelSyncState,
    hasApiKey: Boolean(await readSiliconFlowApiKey())
  };
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
    if (key === 'siliconFlowEnableThinking') {
      return (await resolveSiliconFlowEnableThinking()) ? 'true' : 'false';
    }
    const value = await readSettingValue(key);
    if (value !== undefined && String(value).trim() !== '') {
      return value;
    }

    if (key === 'storagePath' || key === 'componentLibPath') {
      const fallback = getDefaultPathForSettingKey(key);
      if (fallback && String(fallback).trim() !== '') return fallback;
    }
    return value;
  } catch (error) {
    console.log('读取设置失败:', error.message);
    return undefined;
  }
});

ipcMain.handle('get-supabase-config-status', async () => {
  try {
    const config = readSupabaseConfig();
    return {
      envPath: config.envPath,
      url: config.url,
      isConfigured: config.isConfigured,
      hasPublishableKey: Boolean(config.publishableKey)
    };
  } catch (error) {
    return {
      envPath: '',
      url: '',
      isConfigured: false,
      hasPublishableKey: false,
      error: error.message || String(error)
    };
  }
});

ipcMain.handle('supabase-auth-get-state', async () => {
  try {
    return await getSupabaseAuthState();
  } catch (error) {
    return {
      isAuthenticated: false,
      email: '',
      id: '',
      displayName: '',
      role: 'user',
      error: error.message || String(error)
    };
  }
});

ipcMain.handle('supabase-auth-sign-up-password', async (event, payload) => {
  try {
    return await supabaseSignUpWithPassword(payload || {});
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('supabase-auth-sign-in-password', async (event, payload) => {
  try {
    return await supabaseSignInWithPassword(payload || {});
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('supabase-auth-sign-in-oauth', async (event, payload) => {
  try {
    const hasLoopbackServer = await ensureSupabaseOAuthCallbackServer();
    const redirectTo = hasLoopbackServer ? getSupabaseLoopbackRedirectUrl() : getSupabaseAuthRedirectUrl();
    const result = await supabaseSignInWithOAuth({
      ...(payload || {}),
      redirectTo
    });
    if (!result?.success) {
      return result;
    }
    await shell.openExternal(String(result.launchUrl || '').trim());
    return {
      success: true,
      message: result.message || '已打开浏览器，请完成第三方登录。'
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('supabase-auth-sign-out', async () => {
  try {
    return await supabaseSignOut();
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('supabase-project-backup-list', async (event, payload) => {
  try {
    return await supabaseGetProjectBackups(payload || {});
  } catch (error) {
    return { success: false, error: error.message || String(error), backups: [] };
  }
});

ipcMain.handle('supabase-project-backup-upload', async (event, payload) => {
  try {
    return await supabaseUploadProjectBackup(payload || {});
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('supabase-project-backup-delete', async (event, payload) => {
  try {
    return await supabaseDeleteProjectBackup(payload || {});
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('supabase-project-backup-download', async (event, payload) => {
  try {
    return await supabaseDownloadProjectBackup(payload || {});
  } catch (error) {
    return { success: false, error: error.message || String(error) };
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
      const defaultStoragePath = getDefaultPathForSettingKey('storagePath') || '';
      const defaultComponentLibPath = getDefaultPathForSettingKey('componentLibPath') || '';
      envContent = `# Fast Hardware Environment Configuration
# This file contains sensitive configuration data
# DO NOT commit this file to version control

# SiliconFlow API Key
SILICONFLOW_API_KEY=

# SiliconFlow：是否在 Chat Completions 中启用 enable_thinking（true/false，默认 false）
SILICONFLOW_ENABLE_THINKING=false

# Project Storage Path
PROJECT_STORAGE_PATH=${defaultStoragePath}

# Component Library Path
COMPONENT_LIB_PATH=${defaultComponentLibPath}

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
    if (key === 'siliconFlowEnableThinking') {
      applySiliconFlowEnableThinkingToProcessEnv(await resolveSiliconFlowEnableThinking());
    }
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

/**
 * 将 SiliconFlow API 密钥写入 `env.local`；传入空串时表示清空。
 * 路径按运行环境自动区分：开发环境写项目根目录，生产环境写用户数据目录。
 * @param {string} apiKey
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
async function persistSiliconFlowApiKey(apiKey) {
  try {
    const envPath = getEnvPath();
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    console.log(
      `📝 ${isDev ? '开发' : '生产'}环境：${apiKey ? '保存' : '清空'}API密钥 ->`,
      envPath
    );

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

SILICONFLOW_API_KEY=

# SiliconFlow：模型思考 enable_thinking（与设置页一致，默认关）
SILICONFLOW_ENABLE_THINKING=false
`;
    }

    // 更新或添加API密钥
    const lines = envContent.split('\n');
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('SILICONFLOW_API_KEY=')) {
        lines[i] = `SILICONFLOW_API_KEY=${String(apiKey || '').trim()}`;
        found = true;
        break;
      }
    }

    // 如果没找到，添加新行
    if (!found) {
      lines.push(`SILICONFLOW_API_KEY=${String(apiKey || '').trim()}`);
    }

    const newContent = lines.join('\n');

    // 写入文件
    await fs.writeFile(envPath, newContent, 'utf8');

    console.log(`✅ API密钥已${apiKey ? '保存' : '清空'}到env.local文件`);
    return { success: true, path: envPath };
  } catch (error) {
    console.error(`❌ ${apiKey ? '保存' : '清空'}API密钥失败:`, error);
    return { success: false, error: error.message };
  }
}

// 保存API密钥到env.local文件
ipcMain.handle('save-api-key', async (event, apiKey) => {
  return persistSiliconFlowApiKey(String(apiKey || '').trim());
});

// 清空API密钥（开发/生产环境路径与 save-api-key 同源）
ipcMain.handle('clear-api-key', async () => {
  return persistSiliconFlowApiKey('');
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
 * 从 SiliconFlow Chat Completions 的 choice.message 提取正文（兼容数组型 content；无 content 时回退 reasoning_content）
 * @param {object|null|undefined} message
 * @returns {string}
 */
function extractSiliconFlowChoiceMessageContent(message) {
  if (!message || typeof message !== 'object') return '';
  const c = message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (part.type === 'text' && typeof part.text === 'string') return part.text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * 从 Chat Completions **流式** SSE chunk 的 JSON 提取增量文本（OpenAI 兼容 `choices[0].delta`）
 * @param {object|null|undefined} obj - `data: {...}` 解析后的对象
 * @param {{ userFacingOnly?: boolean }} [options] - `userFacingOnly` 默认 true：不把 `reasoning_content` 混入用户可见流/最终结果，避免直连气泡先闪「未读盘/思考」再被正文覆盖。
 * @returns {string}
 */
function extractSiliconFlowStreamDelta(obj, options = {}) {
  const userFacingOnly = options.userFacingOnly !== false;
  if (!obj || typeof obj !== 'object') return '';
  const choice = obj.choices && obj.choices[0];
  if (!choice || typeof choice !== 'object') return '';
  const delta = choice.delta;
  if (!delta || typeof delta !== 'object') return '';
  if (typeof delta.content === 'string') return delta.content;
  if (Array.isArray(delta.content)) {
    return delta.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string') return part.text;
          if (part.type === 'text' && typeof part.text === 'string') return part.text;
        }
        return '';
      })
      .join('');
  }
  if (!userFacingOnly && typeof delta.reasoning_content === 'string') return delta.reasoning_content;
  return '';
}

/**
 * 从 SiliconFlow HTTP 错误 JSON 提取可读说明（兼容 OpenAI 风格 `error: { message, code }` 与 SiliconCloud 顶层 `code`/`message`）
 * @param {object|null|undefined} responseData - `JSON.parse` 后的响应体
 * @returns {{ message: string, code: string|number|null }}
 */
function parseSiliconFlowErrorPayload(responseData) {
  if (!responseData || typeof responseData !== 'object') {
    return { message: '', code: null };
  }
  const nested = responseData.error;
  if (nested && typeof nested === 'object') {
    const m = typeof nested.message === 'string' ? nested.message.trim() : '';
    const c = nested.code != null ? nested.code : null;
    if (m || c != null) {
      return { message: m || '未知错误', code: c };
    }
  }
  const topMsg = typeof responseData.message === 'string' ? responseData.message.trim() : '';
  const topCode = responseData.code != null ? responseData.code : null;
  if (topMsg || topCode != null) {
    return { message: topMsg || '未知错误', code: topCode };
  }
  return { message: '', code: null };
}

/** 普通对话默认最大生成 token（与文档示例量级一致；过大易触发服务端 500 / code 50507） */
const SILICONFLOW_DEFAULT_CHAT_MAX_TOKENS = 8192;

/** Skills Agent 等长输出场景的上限（仍须低于多数模型输出上限，避免顶满上下文） */
const SILICONFLOW_LONG_OUTPUT_MAX_TOKENS = 32768;

/** 请求体允许的单次 max_tokens 硬顶（历史上误用 100000 曾导致 SiliconFlow 返回未知错误） */
const SILICONFLOW_MAX_TOKENS_HARD_CAP = 32768;

/**
 * 解析本次请求的 max_tokens（禁止再使用 100000 级「顶格」值）
 * @param {{ temperature?: number, max_tokens?: number, longOutput?: boolean }} [options]
 * @returns {number}
 */
function resolveSiliconFlowMaxTokens(options = {}) {
  if (typeof options.max_tokens === 'number' && options.max_tokens > 0) {
    return Math.min(Math.floor(options.max_tokens), SILICONFLOW_MAX_TOKENS_HARD_CAP);
  }
  if (options.longOutput === true) {
    return SILICONFLOW_LONG_OUTPUT_MAX_TOKENS;
  }
  return SILICONFLOW_DEFAULT_CHAT_MAX_TOKENS;
}

/**
 * 将模型 ID 中的易混 Unicode 规范为 ASCII，便于与官方 `model` 字符串匹配（避免全角「．」导致误判）。
 * @param {string} modelName
 * @returns {string}
 */
function normalizeModelIdForSiliconFlowChecks(modelName) {
  return String(modelName || '')
    .trim()
    .replace(/\uFEFF/g, '')
    .replace(/\uFF0E/g, '.');
}

/**
 * 是否允许在请求体中带 `enable_thinking`（**仅白名单**）。
 * SiliconFlow 仅部分模型支持该字段；未列出的模型（含 **Qwen2.5-VL** 等）带上会 **400**。
 * 与 `docs.siliconflow.com` Chat Completions 说明一致，并包含已验证的 **Qwen3.5-27B** 文本线。
 * @param {string} modelName - `model` 字段
 * @returns {boolean} 仅在为 true 时写入 `enable_thinking`
 */
function modelAllowsSiliconFlowEnableThinkingParameter(modelName) {
  const m = normalizeModelIdForSiliconFlowChecks(modelName);
  if (!m) return false;
  const lower = m.toLowerCase();

  // 视觉 / Qwen-VL：一律不传（与是否发图无关，避免时序与 ID 变体问题）
  if (lower.includes('qwen2.5-vl') || lower.includes('qwen2-vl')) return false;
  if (lower.includes('qwen3.5-vl') || lower.includes('qwen3-vl')) return false;
  if (lower.includes('qwen3-') && lower.includes('-vl')) return false;

  /** @type {string[]} 前缀匹配（小写） */
  const allowedPrefixes = [
    'qwen/qwen3-8b',
    'qwen/qwen3-14b',
    'qwen/qwen3-32b',
    'qwen/qwen3-30b-a3b',
    'qwen/qwen3-235b-a22b',
    'qwen/qwen3.5-',
    'tencent/hunyuan-a13b-instruct',
    'zai-org/glm-4.6v',
    'zai-org/glm-4.5v',
    'deepseek-ai/deepseek-v3.1',
    'deepseek-ai/deepseek-v3.2'
  ];

  for (const p of allowedPrefixes) {
    if (lower === p || lower.startsWith(p)) {
      return true;
    }
  }
  return false;
}

/**
 * SiliconFlow 流式 Chat Completions（SSE）；增量经 `webContents.send(chunkChannel)` 发往渲染进程（默认 `siliconflow-chat-stream-chunk`）
 * @param {import('electron').WebContents} webContents
 * @param {Array} messages
 * @param {string} model
 * @param {{ temperature?: number, max_tokens?: number, longOutput?: boolean, siliconFlowEnableThinking?: boolean, chunkChannel?: string }} [options] - `chunkChannel` 缺省为 `siliconflow-chat-stream-chunk`；Agent 最终 synthesis 用 `skills-agent-loop-final-stream-chunk`
 * @returns {Promise<{ success: boolean, content?: string, error?: string, statusCode?: number, errorType?: string, debugInfo?: object }>}
 */
function callSiliconFlowAPIStream(webContents, messages, model, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    /** @type {NodeJS.Timeout|null} */
    let timeoutId = null;
    /** @param {any} r */
    const finish = (r) => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      resolve(r);
    };

    const temperature = typeof options.temperature === 'number' ? options.temperature : 0.7;
    /** 不 await：在 Promise executor 内同步拉起请求 */
    readSiliconFlowApiKey()
      .then((apiKey) => {
        if (!apiKey) {
          finish({ success: false, error: '未找到SiliconFlow API密钥，请在设置中配置' });
          return;
        }
        return (async () => {
          let enableThinking = await resolveSiliconFlowEnableThinking();
          if (typeof options.siliconFlowEnableThinking === 'boolean') {
            enableThinking = options.siliconFlowEnableThinking;
          }
          const thinkingParamAllowed = modelAllowsSiliconFlowEnableThinkingParameter(model);
          const requestData = {
            model: model,
            messages: messages,
            stream: true,
            max_tokens: resolveSiliconFlowMaxTokens(options),
            temperature
          };
          if (thinkingParamAllowed) {
            requestData.enable_thinking = enableThinking;
          }
          if (!thinkingParamAllowed) {
            delete requestData.enable_thinking;
          }

          const thinkingBodySummary = thinkingParamAllowed
            ? `已写入 enable_thinking=${requestData.enable_thinking}（${enableThinking ? '开启思考' : '关闭思考'}）`
            : '未写入 enable_thinking（本模型不在白名单，避免无效字段/400）';
          console.log(
            '[chat-api] SiliconFlow 流式请求 stream=true |',
            thinkingBodySummary,
            '| 渲染层覆盖 siliconFlowEnableThinking:',
            typeof options.siliconFlowEnableThinking === 'boolean' ? options.siliconFlowEnableThinking : '—',
            '| 模型:',
            model
          );

          const data = JSON.stringify(requestData);
          /** @type {import('https').ClientRequest|undefined} */
          let req;
          timeoutId = setTimeout(() => {
            try {
              req?.destroy();
            } catch {
              /* empty */
            }
            finish({ success: false, error: 'API请求超时 (180秒)' });
          }, 180000);

          const httpOptions = {
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

          req = https.request(httpOptions, (res) => {
            if (res.statusCode !== 200) {
              let body = '';
              res.setEncoding('utf8');
              res.on('data', (chunk) => {
                body += chunk;
              });
              res.on('end', () => {
                let responseData = null;
                try {
                  responseData = JSON.parse(body);
                } catch {
                  /* empty */
                }
                const { message: sfErrMsg, code: sfErrCode } = parseSiliconFlowErrorPayload(responseData);
                const friendlyErr = sfErrMsg || body.substring(0, 200) || '未知错误';
                finish({
                  success: false,
                  statusCode: res.statusCode,
                  errorType: responseData?.error?.type || '未知',
                  error:
                    sfErrCode != null
                      ? `API请求失败: ${res.statusCode} - ${friendlyErr} (code: ${sfErrCode})`
                      : `API请求失败: ${res.statusCode} - ${friendlyErr}`
                });
              });
              return;
            }

            let sseBuffer = '';
            let fullContent = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              sseBuffer += chunk;
              const parts = sseBuffer.split('\n');
              sseBuffer = parts.pop() || '';
              for (const line of parts) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const dataStr = trimmed.slice(5).trim();
                if (dataStr === '[DONE]') continue;
                try {
                  const json = JSON.parse(dataStr);
                  const delta = extractSiliconFlowStreamDelta(json);
                  if (delta) {
                    fullContent += delta;
                    try {
                      if (webContents && !webContents.isDestroyed()) {
                        const ch =
                          typeof options.chunkChannel === 'string' && options.chunkChannel.trim()
                            ? options.chunkChannel.trim()
                            : 'siliconflow-chat-stream-chunk';
                        webContents.send(ch, { delta });
                      }
                    } catch {
                      /* empty */
                    }
                  }
                } catch {
                  /* 单行解析失败则跳过 */
                }
              }
            });
            res.on('end', () => {
              const chunkChan =
                typeof options.chunkChannel === 'string' && options.chunkChannel.trim()
                  ? options.chunkChannel.trim()
                  : 'siliconflow-chat-stream-chunk';
              if (sseBuffer.trim()) {
                for (const line of sseBuffer.split('\n')) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith('data:')) continue;
                  const dataStr = trimmed.slice(5).trim();
                  if (dataStr === '[DONE]') continue;
                  try {
                    const json = JSON.parse(dataStr);
                    const delta = extractSiliconFlowStreamDelta(json);
                    if (delta) {
                      fullContent += delta;
                      try {
                        if (webContents && !webContents.isDestroyed()) {
                          webContents.send(chunkChan, { delta });
                        }
                      } catch {
                        /* empty */
                      }
                    }
                  } catch {
                    /* empty */
                  }
                }
              }
              const text = String(fullContent || '').trim();
              finish({
                success: true,
                content: text || '无响应内容'
              });
            });
          });

          req.on('error', (error) => {
            finish({ success: false, error: `网络请求失败: ${error.message}` });
          });

          req.write(data);
          req.end();
        })();
      })
      .catch((e) => {
        finish({ success: false, error: `调用AI API失败: ${e?.message || String(e)}` });
      });
  });
}

/**
 * 调用SiliconFlow AI API
 * @param {Array} messages - 消息数组
 * @param {string} model - 使用的模型
 * @param {{ temperature?: number, max_tokens?: number, longOutput?: boolean, siliconFlowEnableThinking?: boolean }} [options] - `longOutput:true` 用于 Agent 多轮等长输出；`siliconFlowEnableThinking` 若传入则覆盖设置（如寒暄强制 `false`）
 * @returns {Promise<Object>} API响应结果
 */
async function callSiliconFlowAPI(messages, model, options = {}) {
  try {
    console.log('🔑 正在读取API密钥...');

    const apiKey = await readSiliconFlowApiKey();
    if (!apiKey) {
      console.log('❌ 未找到有效的API密钥');
      throw new Error('未找到SiliconFlow API密钥，请在设置中配置');
    }

    console.log('✅ API密钥读取成功');

    let enableThinking = await resolveSiliconFlowEnableThinking();
    if (typeof options.siliconFlowEnableThinking === 'boolean') {
      enableThinking = options.siliconFlowEnableThinking;
    }
    const thinkingParamAllowed = modelAllowsSiliconFlowEnableThinkingParameter(model);
    console.log('🧠 SiliconFlow enable_thinking 偏好:', enableThinking, '白名单允许带参:', thinkingParamAllowed);

    const temperature = typeof options.temperature === 'number' ? options.temperature : 0.7;

    const requestData = {
      model: model,
      messages: messages,
      stream: false, // 先实现非流式，后续添加流式
      max_tokens: resolveSiliconFlowMaxTokens(options),
      temperature
    };
    if (thinkingParamAllowed) {
      requestData.enable_thinking = enableThinking;
    }
    if (!thinkingParamAllowed) {
      delete requestData.enable_thinking;
    }

    const thinkingBodySummary = thinkingParamAllowed
      ? `已写入 enable_thinking=${requestData.enable_thinking}（${enableThinking ? '开启思考' : '关闭思考'}）`
      : '未写入 enable_thinking（本模型不在白名单，避免无效字段/400）';
    console.log(
      '[chat-api] SiliconFlow 请求体:',
      thinkingBodySummary,
      '| 渲染层覆盖 siliconFlowEnableThinking:',
      typeof options.siliconFlowEnableThinking === 'boolean' ? options.siliconFlowEnableThinking : '—',
      '| 模型:',
      model
    );

    // 发起HTTP请求
    console.log('🌐 正在发送HTTP请求到SiliconFlow API...');
    console.log('📊 请求数据大小:', `${Buffer.byteLength(JSON.stringify(requestData))} bytes`);

    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify(requestData);
      /** 勿命名为 `options`，避免遮蔽 `callSiliconFlowAPI` 的第三参 */
      const httpOptions = {
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

      const req = https.request(httpOptions, (res) => {
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
              const msg = responseData.choices[0]?.message;
              let content = extractSiliconFlowChoiceMessageContent(msg);
              if (!String(content || '').trim() && msg && typeof msg.reasoning_content === 'string') {
                content = msg.reasoning_content;
              }
              if (!String(content || '').trim()) {
                content = '无响应内容';
              }
              resolve({
                success: true,
                content,
                usage: responseData.usage
              });
            } else {
              const { message: sfErrMsg, code: sfErrCode } = parseSiliconFlowErrorPayload(responseData);
              const friendlyErr = sfErrMsg || '未知错误';
              // 详细的错误日志
              console.error('❌ API返回错误状态 - 详细信息:');
              console.error('📊 状态码:', res.statusCode);
              console.error('📊 完整响应体:', JSON.stringify(responseData, null, 2));
              console.error('📊 响应体原始内容 (前1000字符):', body.substring(0, 1000));
              console.error('📊 错误类型:', responseData.error?.type || '未知');
              console.error('📊 错误代码:', responseData.error?.code ?? sfErrCode ?? '未知');
              console.error('📊 错误消息:', responseData.error?.message || friendlyErr);
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
              
              const apiErrorText =
                sfErrCode != null
                  ? `API请求失败: ${res.statusCode} - ${friendlyErr} (code: ${sfErrCode})`
                  : `API请求失败: ${res.statusCode} - ${friendlyErr}`;

              resolve({
                success: false,
                statusCode: res.statusCode,
                errorType: responseData.error?.type || '未知',
                error: apiErrorText,
                rawError: responseData.error ?? responseData,
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
/**
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {Array<{role:string, content: unknown}>} messages
 * @param {string} model
 * @param {{ siliconFlowEnableThinking?: boolean, stream?: boolean }} [apiOptions] - `stream:false` 关闭 SSE（上下文压缩、内部 LLM 等）
 */
ipcMain.handle('chatWithAI', async (event, messages, model, apiOptions = {}) => {
  const startTime = Date.now();
  const callOpts = apiOptions && typeof apiOptions === 'object' ? apiOptions : {};
  const useStream = callOpts.stream !== false;
  console.log('🔄 开始调用SiliconFlow AI API...', useStream ? '(流式)' : '(非流式)');
  console.log('📝 模型:', model);
  console.log('💬 消息数量:', messages.length);
  console.log('⏱️ 开始时间:', new Date(startTime).toLocaleTimeString());

  // 设置120秒超时（VLM处理多图需要更长时间）
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('API请求超时 (120秒)')), 180000);
  });

  try {
    const result = await Promise.race([
      useStream
        ? callSiliconFlowAPIStream(event.sender, messages, model, callOpts)
        : callSiliconFlowAPI(messages, model, callOpts),
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

/**
 * 通过 ClawHub 的 Exa MCP（exa-web-search-free skill 的底层能力）提供免费 web search
 * 分发说明：该实现使用 `mcporter` 的 npm 依赖 JS API，避免要求用户本机额外安装 mcporter CLI。
 * @param {string} query - 搜索查询
 * @param {{numResults?: number, type?: 'auto'|'fast'|'deep'}} [options]
 * @returns {Promise<{success: boolean, results: Array<any>, raw?: string, error?: string}>}
 */
ipcMain.handle('web-search-exa', async (event, query, options = {}) => {
  const safeQuery = String(query || '').trim().replace(/\s+/g, ' ');
  const numResults = typeof options.numResults === 'number' ? options.numResults : 5;
  const type = options.type || 'fast';

  if (!safeQuery) {
    return { success: false, results: [], error: 'query 不能为空' };
  }

  const exaServerName = 'exa';
  const exaMcpUrl = 'https://mcp.exa.ai/mcp';

  try {
    const mcporter = await importMcporterModule();
    const runtime = await mcporter.createRuntime({
      servers: [
        {
          name: exaServerName,
          description: 'Exa Web Search (free) MCP',
          command: { kind: 'http', url: new URL(exaMcpUrl) }
        }
      ]
    });

    try {
      const args = {
        query: safeQuery,
        numResults
      };
      if (type && type !== 'auto') {
        args.type = type;
      }

      const raw = await runtime.callTool(exaServerName, 'web_search_exa', {
        args,
        timeoutMs: 45000
      });

      const wrapped = mcporter.wrapCallResult(raw);
      const callResult = wrapped?.callResult;
      const contentBlocks = callResult?.content?.() ?? null;

      const text = Array.isArray(contentBlocks)
        ? contentBlocks.map(b => b?.text).filter(Boolean).join('\n')
        : '';

      const results = [];
      const textStr = String(text || '').trim();
      if (textStr) {
        const chunks = textStr
          .split(/(?=Title:\s*)/g)
          .map(s => s.trim())
          .filter(s => s.startsWith('Title:'));

        for (const chunk of chunks.slice(0, numResults)) {
          const title = (chunk.match(/^Title:\s*(.+)$/m) || [])[1] || '';
          const url = (chunk.match(/^URL:\s*(.+)$/m) || [])[1] || '';
          const idx = chunk.indexOf('Text:');
          const snippetRaw = idx >= 0 ? chunk.slice(idx + 'Text:'.length).trim() : '';
          const snippet = snippetRaw
            ? String(snippetRaw).replace(/\s+/g, ' ').slice(0, 240)
            : '';

          if (title || url || snippet) {
            results.push({ title: title.trim(), url: url.trim(), snippet });
          }
        }
      }

      return { success: true, results, raw: textStr };
    } finally {
      await runtime.close();
    }
  } catch (error) {
    console.error('❌ web-search-exa 调用失败:', error?.message || error);
    return {
      success: false,
      results: [],
      error: error?.message || String(error)
    };
  }
});

console.log('主进程脚本加载完成');