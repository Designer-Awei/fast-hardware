'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const { readSupabaseConfig } = require('./config');

const SESSION_STORAGE_KEY = 'supabase.auth.token';
const SESSION_PREFERENCE_KEY = 'supabase.auth.persistence';
const PENDING_OAUTH_PREFERENCE_KEY = 'supabase.auth.oauth.pending';
const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const USER_AVATAR_BUCKET = 'user-avatars';
const PROJECT_BACKUP_BUCKET = 'project-backups';
const PROJECT_BACKUP_TABLE = 'project_backups';
const PROJECT_BACKUP_LIMIT_PER_USER = 10;
const PROJECT_BACKUP_MAX_BYTES = 5 * 1024 * 1024;
/** 创客集市：单文件序列化项目（仅含 .json / .ino，与目录结构），便于一次下载完成预览与解压 */
const MARKETPLACE_PROJECT_BUNDLE_NAME = 'project.bundle.json';
const MARKETPLACE_PROJECT_BUNDLE_FORMAT = 'fast-hardware-marketplace-project-v1';
const MARKETPLACE_PENDING_BUCKET = 'marketplace-pending';
const MARKETPLACE_PUBLIC_BUCKET = 'marketplace-public';
const MARKETPLACE_POST_TABLE = 'marketplace_posts';
const MARKETPLACE_PROJECT_INDEX_TABLE = 'marketplace_projects';
const MARKETPLACE_DAILY_UPLOAD_TABLE = 'daily_marketplace_uploads';
const MARKETPLACE_DAILY_UPLOAD_LIMIT = 3;
const MARKETPLACE_LIST_CACHE_MS = 5 * 60 * 1000;
const MARKETPLACE_BUNDLE_CACHE_MS = 15 * 60 * 1000;
/** 写入 marketplace-public 时附带，便于 CDN 与浏览器长期稳定命中 */
const MARKETPLACE_PUBLIC_OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** @type {Map<string, { expireAt: number, posts: any[] }>} */
const marketplaceListCache = new Map();
/** @type {Map<string, { expireAt: number, bundle: Record<string, unknown>, bundleKey: string }>} */
const marketplaceBundleCache = new Map();

/**
 * @returns {string}
 */
function getSessionStorePath() {
  return path.join(app.getPath('userData'), 'supabase-session.json');
}

/**
 * @returns {Record<string, string>}
 */
function readSessionStore() {
  try {
    const filePath = getSessionStorePath();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, string>} data
 */
function writeSessionStore(data) {
  const filePath = getSessionStorePath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * @returns {{ mode: 'session' | 'remember', expiresAt: number, updatedAt: string } | null}
 */
function readSessionPreference() {
  try {
    const store = readSessionStore();
    const raw = store[SESSION_PREFERENCE_KEY];
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const mode = parsed.mode === 'session' ? 'session' : parsed.mode === 'remember' ? 'remember' : '';
    if (!mode) {
      return null;
    }
    return {
      mode,
      expiresAt: Number(parsed.expiresAt || 0),
      updatedAt: String(parsed.updatedAt || '')
    };
  } catch {
    return null;
  }
}

/**
 * @param {boolean} rememberMe
 * @returns {{ mode: 'session' | 'remember', expiresAt: number, updatedAt: string }}
 */
function buildSessionPreference(rememberMe) {
  return {
    mode: rememberMe ? 'remember' : 'session',
    expiresAt: rememberMe ? Date.now() + REMEMBER_ME_DURATION_MS : 0,
    updatedAt: new Date().toISOString()
  };
}

/**
 * @param {{ mode: 'session' | 'remember', expiresAt: number, updatedAt: string }} preference
 * @returns {void}
 */
function writeSessionPreference(preference) {
  const store = readSessionStore();
  store[SESSION_PREFERENCE_KEY] = JSON.stringify(preference);
  writeSessionStore(store);
}

/**
 * @param {boolean} rememberMe
 * @returns {void}
 */
function writePendingOAuthPreference(rememberMe) {
  const store = readSessionStore();
  store[PENDING_OAUTH_PREFERENCE_KEY] = JSON.stringify({
    rememberMe: Boolean(rememberMe),
    updatedAt: new Date().toISOString()
  });
  writeSessionStore(store);
}

/**
 * @returns {boolean}
 */
function consumePendingOAuthPreference() {
  const store = readSessionStore();
  try {
    const raw = store[PENDING_OAUTH_PREFERENCE_KEY];
    delete store[PENDING_OAUTH_PREFERENCE_KEY];
    writeSessionStore(store);
    if (typeof raw !== 'string' || !raw.trim()) {
      return true;
    }
    const parsed = JSON.parse(raw);
    return parsed?.rememberMe !== false;
  } catch {
    delete store[PENDING_OAUTH_PREFERENCE_KEY];
    writeSessionStore(store);
    return true;
  }
}

/**
 * @returns {void}
 */
function clearPersistedAuthSession() {
  const store = readSessionStore();
  delete store[SESSION_STORAGE_KEY];
  delete store[SESSION_PREFERENCE_KEY];
  delete store[PENDING_OAUTH_PREFERENCE_KEY];
  writeSessionStore(store);
}

/**
 * 首次启动新版本时，如果发现旧会话没有偏好设置，则默认升级为 30 天保持登录。
 * @returns {void}
 */
function pruneStoredSessionForStartup() {
  const store = readSessionStore();
  const hasSession = typeof store[SESSION_STORAGE_KEY] === 'string' && String(store[SESSION_STORAGE_KEY]).trim() !== '';
  const preference = readSessionPreference();

  if (!hasSession) {
    if (preference) {
      delete store[SESSION_PREFERENCE_KEY];
      writeSessionStore(store);
    }
    return;
  }

  if (!preference) {
    writeSessionPreference(buildSessionPreference(true));
    return;
  }

  if (preference.mode === 'session') {
    clearPersistedAuthSession();
    return;
  }

  if (preference.expiresAt > 0 && preference.expiresAt <= Date.now()) {
    clearPersistedAuthSession();
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<boolean>}
 */
async function expireRememberedSessionIfNeeded(client) {
  const preference = readSessionPreference();
  if (!preference || preference.mode !== 'remember') {
    return false;
  }
  if (preference.expiresAt <= 0 || preference.expiresAt > Date.now()) {
    return false;
  }
  try {
    await client.auth.signOut();
  } catch {
    /* empty */
  }
  clearPersistedAuthSession();
  return true;
}

/**
 * Node 环境下给 Supabase Auth 使用的简单文件存储。
 */
const fileStorage = {
  /**
   * @param {string} key
   * @returns {string | null}
   */
  getItem(key) {
    const store = readSessionStore();
    return typeof store[key] === 'string' ? store[key] : null;
  },
  /**
   * @param {string} key
   * @param {string} value
   */
  setItem(key, value) {
    const store = readSessionStore();
    store[key] = value;
    writeSessionStore(store);
  },
  /**
   * @param {string} key
   */
  removeItem(key) {
    const store = readSessionStore();
    delete store[key];
    writeSessionStore(store);
  }
};

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let authClient = null;
/** @type {string} */
let authClientCacheKey = '';
/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let oauthClient = null;
/** @type {string} */
let oauthClientCacheKey = '';

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getAuthClient() {
  const config = readSupabaseConfig();
  if (!config.isConfigured) {
    throw new Error(
      `Supabase 未完成配置，请检查 ${config.envPath} 中的 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
    );
  }
  const cacheKey = `${config.url}::${config.publishableKey}`;
  if (!authClient || authClientCacheKey !== cacheKey) {
    pruneStoredSessionForStartup();
    authClient = createClient(config.url, config.publishableKey, {
      auth: {
        storage: fileStorage,
        storageKey: SESSION_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    authClientCacheKey = cacheKey;
  }
  return authClient;
}

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getOAuthClient() {
  const config = readSupabaseConfig();
  if (!config.isConfigured) {
    throw new Error(
      `Supabase 未完成配置，请检查 ${config.envPath} 中的 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
    );
  }
  const cacheKey = `${config.url}::${config.publishableKey}::pkce`;
  if (!oauthClient || oauthClientCacheKey !== cacheKey) {
    oauthClient = createClient(config.url, config.publishableKey, {
      auth: {
        storage: fileStorage,
        storageKey: SESSION_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    });
    oauthClientCacheKey = cacheKey;
  }
  return oauthClient;
}

/**
 * @returns {string}
 */
function getOAuthRedirectUrl() {
  return String(readSupabaseConfig().oauthRedirectUrl || 'fasthardware://auth/callback').trim();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {{ email?: string, displayName?: string, provider?: string, avatarUrl?: string }} [extra]
 * @returns {Promise<void>}
 */
async function tryUpsertProfile(client, userId, extra = {}) {
  if (!userId) return;
  try {
    await client.from('profiles').upsert(
      {
        id: userId,
        display_name: extra.displayName || null,
        avatar_url: extra.avatarUrl || null,
        provider: extra.provider || 'email',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );
  } catch (error) {
    console.warn('[supabase] profiles upsert 跳过:', error?.message || error);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @returns {Promise<{ displayName?: string, avatarUrl?: string, role?: string, provider?: string }>}
 */
async function tryReadProfile(client, userId) {
  if (!userId) {
    return {};
  }
  try {
    const { data, error } = await client
      .from('profiles')
      .select('display_name, avatar_url, role, provider')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      return {};
    }
    return {
      displayName: String(data?.display_name || '').trim(),
      avatarUrl: String(data?.avatar_url || '').trim(),
      role: String(data?.role || '').trim(),
      provider: String(data?.provider || '').trim()
    };
  } catch {
    return {};
  }
}

/**
 * 从数据库授权真源读取当前用户角色（user_roles）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<string>}
 */
async function tryReadCurrentUserRole(client) {
  try {
    const { data, error } = await client.rpc('current_user_role');
    if (error) {
      return 'free';
    }
    if (typeof data === 'string' && data.trim()) {
      return data.trim().toLowerCase();
    }
    if (Array.isArray(data) && data[0] && typeof data[0].current_user_role === 'string') {
      return String(data[0].current_user_role || 'free').trim().toLowerCase() || 'free';
    }
    return 'free';
  } catch {
    return 'free';
  }
}

/**
 * 是否具备付费档账号能力（非 `free`）：云端备份上传、集市发布、按项目编号检索/复刻他人共享备份等。
 * @param {string} role
 * @returns {boolean}
 */
function hasPaidAccountCapabilities(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'user' || r === 'admin' || r === 'super_admin';
}

/**
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 * @param {{ displayName?: string, avatarUrl?: string, role?: string, provider?: string }} [profile]
 * @returns {{ isAuthenticated: boolean, email: string, id: string, displayName: string, role: string, provider: string, avatarUrl: string }}
 */
function normalizeUserState(user, profile = {}) {
  return {
    isAuthenticated: Boolean(user?.id),
    email: String(user?.email || ''),
    id: String(user?.id || ''),
    displayName: String(profile.displayName || user?.user_metadata?.display_name || user?.email || ''),
    role: String(profile.role || 'free'),
    provider: String(profile.provider || user?.app_metadata?.provider || 'email'),
    avatarUrl: String(profile.avatarUrl || user?.user_metadata?.avatar_url || '')
  };
}

/**
 * @returns {Promise<{ isAuthenticated: boolean, email: string, id: string, displayName: string, role: string, provider: string, avatarUrl: string }>}
 */
async function getAuthState() {
  const client = getAuthClient();
  if (await expireRememberedSessionIfNeeded(client)) {
    return normalizeUserState(null);
  }
  const { data, error } = await client.auth.getUser();
  if (error && error.message !== 'Auth session missing!') {
    console.warn('[supabase] getUser 失败:', error.message);
  }
  const profile = await tryReadProfile(client, String(data?.user?.id || ''));
  profile.role = await tryReadCurrentUserRole(client);
  return normalizeUserState(data?.user, profile);
}

/**
 * @param {{ email: string, password: string, displayName?: string, rememberMe?: boolean }} payload
 * @returns {Promise<{ success: boolean, message?: string, state?: ReturnType<typeof normalizeUserState>, error?: string }>}
 */
async function signUpWithPassword(payload) {
  const client = getAuthClient();
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  const displayName = String(payload?.displayName || '').trim();
  const rememberMe = Boolean(payload?.rememberMe);
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName
      }
    }
  });
  if (error) {
    return { success: false, error: error.message };
  }
  if (data?.user?.id) {
    await tryUpsertProfile(client, data.user.id, { email, displayName, provider: 'email' });
  }
  writeSessionPreference(buildSessionPreference(rememberMe));
  const profile = await tryReadProfile(client, String(data?.user?.id || ''));
  profile.role = await tryReadCurrentUserRole(client);
  return {
    success: true,
    message: rememberMe ? '账号已创建并自动登录成功，30 天内将保持登录。' : '账号已创建并自动登录成功。',
    state: normalizeUserState(data?.user, profile)
  };
}

/**
 * @param {{ email: string, password: string, rememberMe?: boolean }} payload
 * @returns {Promise<{ success: boolean, state?: ReturnType<typeof normalizeUserState>, error?: string }>}
 */
async function signInWithPassword(payload) {
  const client = getAuthClient();
  const rememberMe = Boolean(payload?.rememberMe);
  const { data, error } = await client.auth.signInWithPassword({
    email: String(payload?.email || '').trim(),
    password: String(payload?.password || '')
  });
  if (error) {
    return { success: false, error: error.message };
  }
  if (data?.user?.id) {
    await tryUpsertProfile(client, data.user.id, {
      email: data.user.email || '',
      displayName: String(data.user.user_metadata?.display_name || '').trim(),
      provider: 'email'
    });
  }
  writeSessionPreference(buildSessionPreference(rememberMe));
  const profile = await tryReadProfile(client, String(data?.user?.id || ''));
  profile.role = await tryReadCurrentUserRole(client);
  return {
    success: true,
    message: rememberMe ? '登录成功，30 天内将保持登录。' : '登录成功。',
    state: normalizeUserState(data?.user, profile)
  };
}

/**
 * @param {{ provider: 'google' | 'github', rememberMe?: boolean, redirectTo?: string }} payload
 * @returns {Promise<{ success: boolean, launchUrl?: string, message?: string, error?: string }>}
 */
async function signInWithOAuth(payload) {
  const provider = String(payload?.provider || '').trim().toLowerCase();
  if (!provider) {
    return { success: false, error: '未指定 OAuth Provider。' };
  }
  const client = getOAuthClient();
  const rememberMe = Boolean(payload?.rememberMe);
  const redirectTo = String(payload?.redirectTo || getOAuthRedirectUrl()).trim();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: provider === 'google'
        ? {
            prompt: 'select_account'
          }
        : undefined
    }
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const launchUrl = String(data?.url || '').trim();
  if (!launchUrl) {
    return { success: false, error: '未能获取 OAuth 登录地址。' };
  }
  writePendingOAuthPreference(rememberMe);
  return {
    success: true,
    launchUrl,
    message: '已打开浏览器，请完成 Google 登录并返回应用。'
  };
}

/**
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 * @returns {{ email?: string, displayName?: string, provider?: string, avatarUrl?: string }}
 */
function buildProfileSeedFromUser(user) {
  return {
    email: String(user?.email || '').trim(),
    displayName: String(
      user?.user_metadata?.display_name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      ''
    ).trim(),
    provider: String(user?.app_metadata?.provider || 'email').trim(),
    avatarUrl: String(user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '').trim()
  };
}

/**
 * @param {string} dataUrl
 * @returns {{ contentType: string, buffer: Buffer, extension: string }}
 */
function decodeAvatarDataUrl(dataUrl) {
  const text = String(dataUrl || '').trim();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(text);
  if (!match) {
    throw new Error('头像数据格式无效，请重新选择图片。');
  }
  const contentType = String(match[1] || '').toLowerCase();
  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const extension = extensionMap[contentType];
  if (!extension) {
    throw new Error('仅支持 jpg/png/webp 图片格式。');
  }
  const buffer = Buffer.from(String(match[2] || ''), 'base64');
  if (!buffer.length) {
    throw new Error('头像内容为空，请重新选择图片。');
  }
  if (buffer.length > 1024 * 1024) {
    throw new Error('头像文件需小于 1MB。');
  }
  return {
    contentType,
    buffer,
    extension
  };
}

/**
 * @param {string} projectPath
 * @param {string} [projectUuid]
 * @returns {string}
 */
function buildProjectKey(projectPath, projectUuid = '') {
  const uuid = normalizeProjectUuid(projectUuid);
  const keySource = uuid ? `uuid:${uuid}` : String(projectPath || '').trim();
  return crypto
    .createHash('sha256')
    .update(keySource, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePathForKey(value) {
  return String(value || '').trim().replace(/\\/g, '/');
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeProjectUuid(value) {
  const v = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : '';
}

/**
 * @param {string} segment
 * @returns {string}
 */
function toSafeStorageSegment(segment) {
  const raw = String(segment || '').trim();
  if (!raw) {
    return `file-${crypto.createHash('sha1').update('empty').digest('hex').slice(0, 8)}`;
  }
  const lastDotIndex = raw.lastIndexOf('.');
  const hasExt = lastDotIndex > 0 && lastDotIndex < raw.length - 1;
  const base = hasExt ? raw.slice(0, lastDotIndex) : raw;
  const ext = hasExt ? raw.slice(lastDotIndex + 1) : '';
  const safeBase = base
    .normalize('NFKD')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const safeExt = ext
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 12);
  const digest = crypto.createHash('sha1').update(raw, 'utf8').digest('hex').slice(0, 8);
  const resolvedBase = safeBase || 'file';
  return safeExt ? `${resolvedBase}-${digest}.${safeExt}` : `${resolvedBase}-${digest}`;
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function encodeStorageRelativePath(relativePath) {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => toSafeStorageSegment(segment))
    .join('/');
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function normalizeRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

/**
 * 读取云端项目备份单文件包（与集市 `project.bundle.json` 同格式）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {string} projectKey
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function readProjectBackupBundle(client, userId, projectKey) {
  const bundlePath = `${userId}/${projectKey}/${MARKETPLACE_PROJECT_BUNDLE_NAME}`.replace(/\/+/g, '/');
  const { data, error } = await client.storage.from(PROJECT_BACKUP_BUCKET).download(bundlePath);
  if (error || !data) {
    return null;
  }
  const parsed = parseMarketplaceProjectBundleJson(await data.text());
  if (!parsed.ok) {
    return null;
  }
  return parsed.bundle;
}

/**
 * 将 bundle 内文本文件写入本地目录（用于从云端恢复备份）。
 * @param {Record<string, unknown>} bundle
 * @param {string} targetDir
 * @returns {Promise<void>}
 */
async function writeProjectBundleFilesToDisk(bundle, targetDir) {
  const files = Array.isArray(bundle.files) ? bundle.files : [];
  for (const item of files) {
    const rel = normalizeRelativePath(String(item?.relativePath || ''));
    if (!rel || rel.split('/').some((s) => s === '..')) {
      continue;
    }
    const text = item?.text != null ? String(item.text) : '';
    const targetPath = path.join(targetDir, ...rel.split('/'));
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, text, 'utf8');
  }
}

/**
 * 删除某用户在 Storage 中该项目键下的全部备份对象（含旧版多文件遗留）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {string} projectKey
 * @returns {Promise<void>}
 */
async function clearProjectBackupObjects(client, userId, projectKey) {
  const folderPath = `${userId}/${projectKey}`.replace(/\/+/g, '/');
  const keys = await listStorageFilesByPrefix(client, PROJECT_BACKUP_BUCKET, folderPath);
  if (!keys.length) {
    return;
  }
  const { error: removeError } = await client.storage.from(PROJECT_BACKUP_BUCKET).remove(keys);
  if (removeError) {
    throw new Error(`删除备份文件失败：${removeError.message}`);
  }
}

/**
 * @param {string} rootPath
 * @returns {Promise<Array<{ absolutePath: string, relativePath: string }>>}
 */
async function collectProjectFiles(rootPath) {
  const items = [];
  const walk = async (currentPath) => {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, '/');
      items.push({ absolutePath, relativePath });
    }
  };
  await walk(rootPath);
  return items;
}

/**
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 * @returns {Promise<ReturnType<typeof normalizeUserState>>}
 */
async function finalizeOAuthUser(user) {
  const client = getAuthClient();
  const userId = String(user?.id || '').trim();
  const profileSeed = buildProfileSeedFromUser(user);
  if (userId) {
    await tryUpsertProfile(client, userId, profileSeed);
  }
  writeSessionPreference(buildSessionPreference(consumePendingOAuthPreference()));
  const profile = await tryReadProfile(client, userId);
  profile.role = await tryReadCurrentUserRole(client);
  return normalizeUserState(user, profile);
}

/**
 * @param {string} callbackUrl
 * @returns {Promise<{ success: boolean, message: string, state?: ReturnType<typeof normalizeUserState>, error?: string }>}
 */
async function handleOAuthCallbackUrl(callbackUrl) {
  try {
    const normalizedUrl = String(callbackUrl || '').trim();
    if (!normalizedUrl) {
      return { success: false, message: 'OAuth 回调地址为空。', error: 'empty_callback_url' };
    }
    const targetUrl = new URL(normalizedUrl);
    const mergedParams = new URLSearchParams(targetUrl.search);
    const hashText = String(targetUrl.hash || '').replace(/^#/, '').trim();
    if (hashText) {
      const hashParams = new URLSearchParams(hashText);
      hashParams.forEach((value, key) => {
        if (!mergedParams.has(key)) {
          mergedParams.set(key, value);
        }
      });
    }

    const errorDescription = String(mergedParams.get('error_description') || '').trim();
    const errorCode = String(mergedParams.get('error_code') || mergedParams.get('error') || '').trim();
    if (errorCode || errorDescription) {
      return {
        success: false,
        message: errorDescription || '第三方登录失败，请重试。',
        error: errorCode || 'oauth_callback_error'
      };
    }

    const authCode = String(mergedParams.get('code') || '').trim();
    if (authCode) {
      const client = getOAuthClient();
      const { data, error } = await client.auth.exchangeCodeForSession(authCode);
      if (error) {
        return { success: false, message: error.message, error: error.name || 'oauth_exchange_failed' };
      }
      const state = await finalizeOAuthUser(data?.user);
      return {
        success: true,
        message: '第三方登录成功，已返回应用。',
        state
      };
    }

    const accessToken = String(mergedParams.get('access_token') || '').trim();
    const refreshToken = String(mergedParams.get('refresh_token') || '').trim();
    if (accessToken && refreshToken) {
      const client = getAuthClient();
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        return { success: false, message: error.message, error: error.name || 'oauth_set_session_failed' };
      }
      const state = await finalizeOAuthUser(data?.user);
      return {
        success: true,
        message: '第三方登录成功，已返回应用。',
        state
      };
    }

    return {
      success: false,
      message: '未能从 OAuth 回调中解析到有效登录信息。',
      error: 'missing_oauth_session'
    };
  } catch (error) {
    return {
      success: false,
      message: error?.message || String(error),
      error: 'oauth_callback_parse_failed'
    };
  }
}

/**
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function signOut() {
  const client = getAuthClient();
  const { error } = await client.auth.signOut();
  if (error) {
    return { success: false, error: error.message };
  }
  try {
    clearPersistedAuthSession();
  } catch {
    /* empty */
  }
  return { success: true };
}

/**
 * @param {{ displayName: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, state?: ReturnType<typeof normalizeUserState>, error?: string }>}
 */
async function updateProfile(payload) {
  const client = getAuthClient();
  const displayName = String(payload?.displayName || '').trim();
  if (!displayName) {
    return { success: false, error: '昵称不能为空。' };
  }
  if (displayName.length > 40) {
    return { success: false, error: '昵称请控制在 40 个字符以内。' };
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法更新昵称。' };
  }
  const { data: updatedData, error: updateError } = await client.auth.updateUser({
    data: {
      ...user.user_metadata,
      display_name: displayName
    }
  });
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  await tryUpsertProfile(client, user.id, {
    email: user.email || '',
    displayName,
    provider: String(user.app_metadata?.provider || 'email'),
    avatarUrl: String(user.user_metadata?.avatar_url || '').trim()
  });
  const profile = await tryReadProfile(client, user.id);
  profile.role = await tryReadCurrentUserRole(client);
  return {
    success: true,
    message: '昵称已更新。',
    state: normalizeUserState(updatedData?.user || user, profile)
  };
}

/**
 * @param {{ dataUrl: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, state?: ReturnType<typeof normalizeUserState>, error?: string }>}
 */
async function uploadAvatar(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法上传头像。' };
  }
  const { contentType, buffer } = decodeAvatarDataUrl(String(payload?.dataUrl || ''));
  const objectPath = `${user.id}/avatar.webp`;
  const { error: uploadError } = await client.storage
    .from(USER_AVATAR_BUCKET)
    .upload(objectPath, buffer, {
      upsert: true,
      contentType,
      cacheControl: '3600'
    });
  if (uploadError) {
    return { success: false, error: uploadError.message };
  }
  const { data: publicData } = client.storage.from(USER_AVATAR_BUCKET).getPublicUrl(objectPath);
  const publicUrl = String(publicData?.publicUrl || '').trim();
  const avatarVersion = Date.now();
  const avatarUrl = publicUrl
    ? `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${avatarVersion}`
    : '';
  const { data: updatedData, error: updateError } = await client.auth.updateUser({
    data: {
      ...user.user_metadata,
      avatar_url: avatarUrl
    }
  });
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  await tryUpsertProfile(client, user.id, {
    email: user.email || '',
    displayName: String(
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      ''
    ).trim(),
    provider: String(user.app_metadata?.provider || 'email'),
    avatarUrl
  });
  const profile = await tryReadProfile(client, user.id);
  profile.role = await tryReadCurrentUserRole(client);
  return {
    success: true,
    message: '头像更新成功。',
    state: normalizeUserState(updatedData?.user || user, profile)
  };
}

/**
 * @param {{ projectPaths?: string[] }} payload
 * @returns {Promise<{ success: boolean, backups: Array<{ projectPath: string, backupAt: string, fileCount: number }>, error?: string }>}
 */
async function getProjectBackups(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const userId = String(userData?.user?.id || '').trim();
  if (userError || !userId) {
    return { success: false, error: userError?.message || '当前未登录，无法读取备份状态。', backups: [] };
  }
  const projectRefs = Array.isArray(payload?.projectRefs)
    ? payload.projectRefs
        .map((item) => ({
          projectPath: normalizePathForKey(item?.projectPath || ''),
          projectUuid: normalizeProjectUuid(item?.projectUuid || '')
        }))
        .filter((item) => item.projectPath || item.projectUuid)
    : [];
  const projectPaths = projectRefs.length
    ? projectRefs.map((item) => item.projectPath)
    : Array.isArray(payload?.projectPaths)
      ? payload.projectPaths.map((v) => normalizePathForKey(v)).filter(Boolean)
      : [];
  const projectUuids = projectRefs.length
    ? projectRefs.map((item) => item.projectUuid)
    : Array.isArray(payload?.projectUuids)
      ? payload.projectUuids.map((v) => normalizeProjectUuid(v)).filter(Boolean)
      : [];
  const projectKeys = (projectRefs.length
    ? projectRefs.map((item) => buildProjectKey(item.projectPath, item.projectUuid))
    : projectPaths.map((v, i) => buildProjectKey(v, projectUuids[i] || ''))).filter(Boolean);
  let query = client
    .from(PROJECT_BACKUP_TABLE)
    .select('project_path, project_name, project_key, backup_at, file_count, last_modified')
    .eq('user_id', userId);
  if (projectKeys.length) {
    query = query.in('project_key', projectKeys);
  }
  const { data, error } = await query;
  if (error) {
    return { success: false, error: error.message, backups: [] };
  }
  const rows = Array.isArray(data) ? data : [];
  const backupMap = new Map();
  const normalizedRows = rows.map((row) => ({
    projectPath: String(row.project_path || ''),
    projectName: String(row.project_name || ''),
    projectKey: String(row.project_key || ''),
    backupAt: String(row.backup_at || ''),
    fileCount: Number(row.file_count || 0),
    lastModified: String(row.last_modified || '')
  }));
  for (const row of normalizedRows) {
    backupMap.set(row.projectKey, row);
  }
  if (!projectKeys.length) {
    return { success: true, backups: normalizedRows };
  }
  return {
    success: true,
    backups: projectKeys
      .map((key, index) => {
        const existing = backupMap.get(key);
        if (!existing) return null;
        return {
          projectPath: projectPaths[index],
          projectUuid: projectUuids[index] || '',
          projectName: existing.projectName,
          projectKey: existing.projectKey,
          backupAt: existing.backupAt,
          fileCount: existing.fileCount,
          lastModified: existing.lastModified
        };
      })
      .filter(Boolean)
  };
}

/**
 * 批量读取当前用户项目在创客集市的发布状态（按 project_path 计算 project_key）。
 * @param {{ projectPaths?: string[] }} payload
 * @returns {Promise<{ success: boolean, statuses?: Array<{ projectPath: string, projectKey: string, status: 'unpublished'|'pending'|'approved'|'rejected' }>, error?: string }>}
 */
async function getMarketplacePublishStatuses(payload) {
  const client = getAuthClient();
  const projectRefs = Array.isArray(payload?.projectRefs)
    ? payload.projectRefs
        .map((item) => ({
          projectPath: normalizePathForKey(item?.projectPath || ''),
          projectUuid: normalizeProjectUuid(item?.projectUuid || '')
        }))
        .filter((item) => item.projectPath || item.projectUuid)
    : [];
  const projectPaths = projectRefs.length
    ? projectRefs.map((item) => item.projectPath)
    : Array.isArray(payload?.projectPaths)
      ? payload.projectPaths.map((v) => normalizePathForKey(v)).filter(Boolean)
      : [];
  const projectUuids = projectRefs.length
    ? projectRefs.map((item) => item.projectUuid)
    : Array.isArray(payload?.projectUuids)
      ? payload.projectUuids.map((v) => normalizeProjectUuid(v)).filter(Boolean)
      : [];
  if (!projectPaths.length) {
    return { success: true, statuses: [] };
  }
  const { data: authData, error: authError } = await client.auth.getUser();
  const user = authData?.user || null;
  if (authError || !user?.id) {
    return {
      success: true,
      statuses: projectPaths.map((projectPath, index) => ({
        projectPath,
        projectUuid: projectUuids[index] || '',
        projectKey: buildProjectKey(projectPath, projectUuids[index] || ''),
        status: 'unpublished'
      }))
    };
  }
  const keyToPath = new Map();
  const projectKeys = [];
  projectPaths.forEach((projectPath, index) => {
    const key = buildProjectKey(projectPath, projectUuids[index] || '');
    if (!key) return;
    projectKeys.push(key);
    if (!keyToPath.has(key)) {
      keyToPath.set(key, projectPath);
    }
  });
  if (!projectKeys.length) {
    return { success: true, statuses: [] };
  }
  const { data, error } = await client
    .from(MARKETPLACE_POST_TABLE)
    .select('project_key, status, updated_at, created_at')
    .eq('author_id', user.id)
    .in('project_key', projectKeys)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    return { success: false, error: error.message };
  }
  const latestStatusByKey = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const key = String(row?.project_key || '').trim();
    if (!key || latestStatusByKey.has(key)) return;
    const raw = String(row?.status || '').trim().toLowerCase();
    const normalized =
      raw === 'approved'
        ? 'approved'
        : raw === 'pending'
          ? 'pending'
          : raw === 'rejected'
            ? 'rejected'
            : 'unpublished';
    latestStatusByKey.set(key, normalized);
  });
  const statuses = projectPaths.map((projectPath, index) => {
    const projectKey = buildProjectKey(projectPath, projectUuids[index] || '');
    return {
      projectPath,
      projectUuid: projectUuids[index] || '',
      projectKey,
      status: latestStatusByKey.get(projectKey) || 'unpublished'
    };
  });
  return { success: true, statuses };
}

/**
 * @param {{ projectPath?: string, projectName?: string, lastModified?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, backupAt?: string, fileCount?: number, error?: string }>}
 */
async function uploadProjectBackup(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法上传项目备份。' };
  }
  const accountRole = await tryReadCurrentUserRole(client);
  if (!hasPaidAccountCapabilities(accountRole)) {
    return { success: false, error: '当前为免费版，云端备份上传功能不可用。' };
  }
  const projectPathRaw = String(payload?.projectPath || '').trim();
  const projectUuid = normalizeProjectUuid(payload?.projectUuid || '');
  if (!projectPathRaw) {
    return { success: false, error: '项目路径为空，无法上传备份。' };
  }
  const projectPath = normalizePathForKey(projectPathRaw);
  let stat;
  try {
    stat = await fs.promises.stat(projectPathRaw);
  } catch {
    return { success: false, error: '项目目录不存在，无法上传备份。' };
  }
  if (!stat.isDirectory()) {
    return { success: false, error: '目标路径不是项目目录，无法上传备份。' };
  }
  const files = await collectProjectFiles(projectPathRaw);
  if (!files.length) {
    return { success: false, error: '项目目录为空，暂无可备份文件。' };
  }

  const projectKey = buildProjectKey(projectPath, projectUuid);
  const projectName = String(payload?.projectName || path.basename(projectPathRaw)).trim() || '未命名项目';
  const { data: existingBackup, error: existingError } = await client
    .from(PROJECT_BACKUP_TABLE)
    .select('id')
    .eq('user_id', user.id)
    .eq('project_key', projectKey)
    .maybeSingle();
  if (existingError) {
    return { success: false, error: `读取备份状态失败：${existingError.message}` };
  }
  if (!existingBackup) {
    const { count, error: countError } = await client
      .from(PROJECT_BACKUP_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (countError) {
      return { success: false, error: `读取备份数量失败：${countError.message}` };
    }
    if (Number(count || 0) >= PROJECT_BACKUP_LIMIT_PER_USER) {
      return { success: false, error: `备份方案数量已达上限（最多 ${PROJECT_BACKUP_LIMIT_PER_USER} 个），请先撤销部分备份再上传。` };
    }
  }

  try {
    await clearProjectBackupObjects(client, user.id, projectKey);
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  }

  /** @type {{ relativePath: string, text: string }[]} */
  const bundleFiles = [];
  for (const file of files) {
    const ext = path.extname(file.absolutePath).toLowerCase();
    if (ext !== '.json' && ext !== '.ino') {
      continue;
    }
    try {
      const text = await fs.promises.readFile(file.absolutePath, 'utf8');
      bundleFiles.push({
        relativePath: normalizeRelativePath(file.relativePath),
        text
      });
    } catch {
      return { success: false, error: `无法读取文件：${file.relativePath}` };
    }
  }
  if (!bundleFiles.some((f) => f.relativePath === 'circuit_config.json')) {
    return { success: false, error: '项目中需包含 circuit_config.json；云备份仅序列化 .json 与 .ino 文件。' };
  }
  const bundleObject = {
    format: MARKETPLACE_PROJECT_BUNDLE_FORMAT,
    projectName,
    description: '',
    sourceProjectPath: projectPath,
    generatedAt: new Date().toISOString(),
    files: bundleFiles
  };
  const bundleText = JSON.stringify(bundleObject);
  const bundleBytes = Buffer.byteLength(bundleText, 'utf8');
  if (bundleBytes > PROJECT_BACKUP_MAX_BYTES) {
    return { success: false, error: '文件太大，单次上传备份需小于 5MB。' };
  }
  const bundleObjectPath = `${user.id}/${projectKey}/${MARKETPLACE_PROJECT_BUNDLE_NAME}`.replace(/\/+/g, '/');
  const { error: bundleUploadError } = await client.storage.from(PROJECT_BACKUP_BUCKET).upload(
    bundleObjectPath,
    Buffer.from(bundleText, 'utf8'),
    {
      upsert: true,
      contentType: 'application/json'
    }
  );
  if (bundleUploadError) {
    return { success: false, error: `上传备份包失败：${bundleUploadError.message}` };
  }

  const backupAt = new Date().toISOString();
  const { error: upsertError } = await client
    .from(PROJECT_BACKUP_TABLE)
    .upsert(
      {
        user_id: user.id,
        project_key: projectKey,
        project_name: projectName,
        project_path: projectPath,
        file_count: bundleFiles.length,
        backup_at: backupAt,
        updated_at: backupAt,
        last_modified: String(payload?.lastModified || '').trim() || null
      },
      {
        onConflict: 'user_id,project_key'
      }
    );
  if (upsertError) {
    return { success: false, error: `写入备份状态失败：${upsertError.message}` };
  }
  return {
    success: true,
    message: '项目备份上传成功。',
    backupAt,
    fileCount: bundleFiles.length
  };
}

/**
 * 从云端读取 `project.bundle.json`，反序列化后在「项目存储根目录」下重建完整项目文件夹（与上传备份格式一致）。
 * @param {{ projectKey?: string, projectName?: string, storagePath?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, restoredPath?: string, error?: string }>}
 */
async function downloadProjectBackup(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法恢复备份。' };
  }
  const projectKey = String(payload?.projectKey || '').trim();
  const projectName = String(payload?.projectName || '').trim() || '恢复项目';
  const storagePath = String(payload?.storagePath || '').trim();
  if (!projectKey || !storagePath) {
    return { success: false, error: '缺少备份标识或项目存储根路径。' };
  }
  const bundle = await readProjectBackupBundle(client, user.id, projectKey);
  if (!bundle) {
    return { success: false, error: '该备份不包含有效的 project.bundle.json，请重新上传备份后再恢复。' };
  }

  const nameFromBundle = String(bundle?.projectName || '').trim();
  const rawFolderBase = (nameFromBundle || projectName || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim();
  const folderBase = rawFolderBase || `restored-${projectKey.slice(0, 8)}`;
  let restoredPath = path.join(storagePath, folderBase);
  if (fs.existsSync(restoredPath)) {
    restoredPath = path.join(storagePath, `${folderBase}-恢复-${Date.now()}`);
  }
  await fs.promises.mkdir(storagePath, { recursive: true });
  await fs.promises.mkdir(restoredPath, { recursive: true });

  await writeProjectBundleFilesToDisk(bundle, restoredPath);
  return {
    success: true,
    message: `已在项目存储目录下恢复项目文件夹：${restoredPath}`,
    restoredPath
  };
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isValidProjectKey(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

/**
 * 通过 project_key 查询可共享备份（用于创客集市按编号复用）。
 * @param {{ projectKey?: string }} payload
 * @returns {Promise<{ success: boolean, projects?: Array<{ projectKey: string, projectName: string, backupAt: string, authorName: string }>, error?: string }>}
 */
async function searchSharedBackupProjectsByKey(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const userId = String(userData?.user?.id || '').trim();
  if (userError || !userId) {
    return { success: false, error: '请先登录后再查询共享项目。' };
  }
  const searchRole = await tryReadCurrentUserRole(client);
  if (!hasPaidAccountCapabilities(searchRole)) {
    return { success: false, error: '当前为免费版，无法通过项目编号检索共享备份。' };
  }
  const projectKey = String(payload?.projectKey || '').trim().toLowerCase();
  if (!isValidProjectKey(projectKey)) {
    return { success: true, projects: [] };
  }
  const { data, error } = await client
    .from(PROJECT_BACKUP_TABLE)
    .select('project_key, project_name, backup_at, user_id')
    .eq('project_key', projectKey)
    .order('backup_at', { ascending: false })
    .limit(20);
  if (error) {
    return { success: false, error: error.message };
  }
  const rows = Array.isArray(data) ? data : [];
  const ownerIds = [...new Set(rows.map((row) => String(row?.user_id || '').trim()).filter(Boolean))];
  /** @type {Map<string, string>} */
  const ownerNameMap = new Map();
  if (ownerIds.length) {
    const { data: profileRows, error: profileError } = await client
      .from('profiles')
      .select('id, display_name')
      .in('id', ownerIds);
    if (!profileError && Array.isArray(profileRows)) {
      profileRows.forEach((profile) => {
        const id = String(profile?.id || '').trim();
        if (!id) return;
        ownerNameMap.set(id, String(profile?.display_name || '').trim());
      });
    }
  }
  return {
    success: true,
    projects: rows.map((row) => ({
      projectKey: String(row.project_key || ''),
      projectName: String(row.project_name || '共享备份项目'),
      backupAt: String(row.backup_at || ''),
      authorName: String(ownerNameMap.get(String(row?.user_id || '').trim()) || '').trim() || '未知发布者'
    }))
  };
}

/**
 * 通过 project_key 获取共享备份 bundle（仅内存，不落盘）。
 * @param {{ projectKey?: string }} payload
 * @returns {Promise<{ success: boolean, bundle?: Record<string, unknown>, projectName?: string, projectKey?: string, backupAt?: string, error?: string }>}
 */
async function getSharedBackupBundleByProjectKey(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const userId = String(userData?.user?.id || '').trim();
  if (userError || !userId) {
    return { success: false, error: '请先登录后再复刻共享项目。' };
  }
  const bundleRole = await tryReadCurrentUserRole(client);
  if (!hasPaidAccountCapabilities(bundleRole)) {
    return { success: false, error: '当前为免费版，无法通过项目编号复刻共享备份。' };
  }
  const projectKey = String(payload?.projectKey || '').trim().toLowerCase();
  if (!isValidProjectKey(projectKey)) {
    return { success: false, error: '项目编号无效。' };
  }
  const { data: rows, error } = await client
    .from(PROJECT_BACKUP_TABLE)
    .select('user_id, project_key, project_name, backup_at')
    .eq('project_key', projectKey)
    .order('backup_at', { ascending: false })
    .limit(1);
  if (error) {
    return { success: false, error: error.message };
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return { success: false, error: '未找到该项目编号对应的共享备份。' };
  }
  const ownerId = String(row.user_id || '').trim();
  if (!ownerId) {
    return { success: false, error: '共享备份缺少有效作者标识。' };
  }
  const bundleKey = `${ownerId}/${projectKey}/${MARKETPLACE_PROJECT_BUNDLE_NAME}`.replace(/\/+/g, '/');
  const text = await downloadStorageObjectTextWithCdn(client, PROJECT_BACKUP_BUCKET, bundleKey);
  if (!text) {
    return { success: false, error: '读取共享备份失败，请稍后重试。' };
  }
  const parsed = parseMarketplaceProjectBundleJson(text);
  if (!parsed.ok) {
    return { success: false, error: '共享备份格式无效。' };
  }
  return {
    success: true,
    bundle: parsed.bundle,
    projectName: String(row.project_name || ''),
    projectKey,
    backupAt: String(row.backup_at || '')
  };
}

/**
 * @param {{ projectPath?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
async function deleteProjectBackup(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法撤销备份。' };
  }
  const projectPathRaw = String(payload?.projectPath || '').trim();
  const projectUuid = normalizeProjectUuid(payload?.projectUuid || '');
  if (!projectPathRaw) {
    return { success: false, error: '项目路径为空，无法撤销备份。' };
  }
  const projectPath = normalizePathForKey(projectPathRaw);
  const projectKey = buildProjectKey(projectPath, projectUuid);
  const { data: deletedRows, error: deleteError } = await client
    .from(PROJECT_BACKUP_TABLE)
    .delete()
    .eq('user_id', user.id)
    .eq('project_key', projectKey)
    .select('id');
  if (deleteError) {
    return { success: false, error: `删除备份记录失败：${deleteError.message}` };
  }
  const removedCount = Array.isArray(deletedRows) ? deletedRows.length : 0;
  if (removedCount < 1) {
    return {
      success: false,
      error: '未删除任何备份记录（可能无备份、无删除权限或数据未同步）。请刷新列表后重试。'
    };
  }
  try {
    await clearProjectBackupObjects(client, user.id, projectKey);
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  }
  return { success: true, message: '已撤销当前项目备份。' };
}

/**
 * @returns {Promise<{ success: boolean, stats?: { totalUsers: number, adminCount: number, superAdminCount: number, freeCount: number }, error?: string }>}
 */
async function getPermissionManagementStats() {
  const client = getAuthClient();
  const { data, error } = await client.rpc('get_permission_management_stats');
  if (error) {
    return { success: false, error: error.message };
  }
  const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
  return {
    success: true,
    stats: {
      totalUsers: Number(row.total_users || 0),
      adminCount: Number(row.admin_count || 0),
      superAdminCount: Number(row.super_admin_count || 0),
      freeCount: Number(row.free_count || 0)
    }
  };
}

/**
 * @param {{ query?: string, page?: number, pageSize?: number }} payload
 * @returns {Promise<{ success: boolean, users?: Array<{ id: string, email: string, displayName: string, role: string, createdAt: string }>, total?: number, page?: number, pageSize?: number, error?: string }>}
 */
async function listUsersForPermissionManagement(payload) {
  const client = getAuthClient();
  const queryText = String(payload?.query || '').trim();
  const page = Math.max(1, Number(payload?.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(payload?.pageSize || 20)));
  const { data, error } = await client.rpc('list_users_for_permission_management', {
    p_query: queryText,
    p_page: page,
    p_page_size: pageSize
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const rows = Array.isArray(data) ? data : [];
  const total = Number(rows[0]?.total_count || 0);
  return {
    success: true,
    total,
    page,
    pageSize,
    users: rows.map((row) => ({
      id: String(row.user_id || ''),
      email: String(row.email || ''),
      displayName: String(row.display_name || ''),
      role: String(row.role || 'free'),
      createdAt: String(row.created_at || '')
    }))
  };
}

/**
 * @param {{ userId?: string, role?: 'free'|'user'|'admin' }} payload
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
async function updateUserRoleBySuperAdmin(payload) {
  const client = getAuthClient();
  const userId = String(payload?.userId || '').trim();
  const role = String(payload?.role || '').trim().toLowerCase();
  if (!userId || !role) {
    return { success: false, error: '缺少用户标识或目标角色。' };
  }
  if (!['free', 'user', 'admin'].includes(role)) {
    return { success: false, error: '仅支持设置为 free、user 或 admin。' };
  }
  const { data, error } = await client.rpc('set_user_role_by_super_admin', {
    p_user_id: userId,
    p_role: role
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
  return {
    success: Boolean(row?.ok),
    message: String(row?.message || (row?.ok ? '角色更新成功。' : '角色更新失败。')),
    error: row?.ok ? undefined : String(row?.message || '角色更新失败。')
  };
}

/**
 * @param {string} projectPath
 * @returns {Promise<string>}
 */
async function readProjectCodeSnippet(projectPath) {
  try {
    const entries = await fs.promises.readdir(projectPath, { withFileTypes: true });
    const ino = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.ino'));
    if (!ino) return '';
    const fullPath = path.join(projectPath, ino.name);
    const text = await fs.promises.readFile(fullPath, 'utf8');
    return String(text || '').slice(0, 20000);
  } catch {
    return '';
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getContentTypeByPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.ino' || ext === '.txt' || ext === '.md') return 'text/plain';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/**
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function listLocalFilesRecursively(rootDir) {
  const result = [];
  /**
   * @param {string} currentDir
   * @returns {Promise<void>}
   */
  async function walk(currentDir) {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      result.push(fullPath);
    }
  }
  await walk(rootDir);
  return result;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} bucket
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
async function listStorageFilesByPrefix(client, bucket, prefix) {
  const normalizedPrefix = String(prefix || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalizedPrefix) return [];
  const queue = [normalizedPrefix];
  const files = [];
  const visited = new Set();
  while (queue.length) {
    const currentPrefix = String(queue.shift() || '');
    if (!currentPrefix || visited.has(currentPrefix)) continue;
    visited.add(currentPrefix);
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error) {
        throw new Error(`列出对象失败(${bucket}/${currentPrefix})：${error.message}`);
      }
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const name = String(row?.name || '').trim();
        if (!name) continue;
        const fullPath = `${currentPrefix}/${name}`.replace(/\/+/g, '/');
        const isFolder = !row?.id && !row?.metadata;
        if (isFolder) {
          queue.push(fullPath);
          continue;
        }
        files.push(fullPath);
      }
      if (rows.length < 100) break;
      offset += rows.length;
    }
  }
  return files;
}

/**
 * @param {string} objectKey
 * @returns {string}
 */
function getPrefixByObjectKey(objectKey) {
  const key = String(objectKey || '').trim().replace(/\\/g, '/');
  const index = key.lastIndexOf('/');
  if (index < 1) return '';
  return key.slice(0, index);
}

/**
 * @param {unknown} snapshot
 * @returns {boolean}
 */
function marketplaceSnapshotHasCircuit(snapshot) {
  return Boolean(
    snapshot &&
      typeof snapshot === 'object' &&
      (Array.isArray(snapshot.components) || Array.isArray(snapshot.connections))
  );
}

/**
 * @param {string} text
 * @returns {{ ok: true, bundle: Record<string, unknown> } | { ok: false, error: string }}
 */
function parseMarketplaceProjectBundleJson(text) {
  try {
    const bundle = JSON.parse(String(text || ''));
    if (!bundle || typeof bundle !== 'object') {
      return { ok: false, error: 'invalid' };
    }
    if (String(bundle.format || '') !== MARKETPLACE_PROJECT_BUNDLE_FORMAT) {
      return { ok: false, error: 'format' };
    }
    if (!Array.isArray(bundle.files)) {
      return { ok: false, error: 'files' };
    }
    return { ok: true, bundle };
  } catch {
    return { ok: false, error: 'json' };
  }
}

/**
 * @param {string} key
 * @returns {any[] | null}
 */
function readMarketplaceListCache(key) {
  const item = marketplaceListCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expireAt) {
    marketplaceListCache.delete(key);
    return null;
  }
  return Array.isArray(item.posts) ? item.posts : null;
}

/**
 * @param {string} key
 * @param {any[]} posts
 * @returns {void}
 */
function writeMarketplaceListCache(key, posts) {
  marketplaceListCache.set(key, {
    expireAt: Date.now() + MARKETPLACE_LIST_CACHE_MS,
    posts: Array.isArray(posts) ? posts : []
  });
}

/**
 * @returns {void}
 */
function clearMarketplaceListCache() {
  marketplaceListCache.clear();
}

/**
 * @param {string} bucket
 * @param {string} objectKey
 * @returns {string}
 */
function buildBundleCacheKey(bucket, objectKey) {
  return `${String(bucket || '').trim()}::${String(objectKey || '').trim().replace(/\\/g, '/')}`;
}

/**
 * @param {string} cacheKey
 * @returns {{ bundle: Record<string, unknown>, bundleKey: string } | null}
 */
function readMarketplaceBundleCache(cacheKey) {
  const item = marketplaceBundleCache.get(cacheKey);
  if (!item) return null;
  if (Date.now() > item.expireAt) {
    marketplaceBundleCache.delete(cacheKey);
    return null;
  }
  return { bundle: item.bundle, bundleKey: item.bundleKey };
}

/**
 * @param {string} cacheKey
 * @param {Record<string, unknown>} bundle
 * @param {string} bundleKey
 * @returns {void}
 */
function writeMarketplaceBundleCache(cacheKey, bundle, bundleKey) {
  marketplaceBundleCache.set(cacheKey, {
    expireAt: Date.now() + MARKETPLACE_BUNDLE_CACHE_MS,
    bundle,
    bundleKey: String(bundleKey || '')
  });
}

/**
 * @returns {void}
 */
function clearMarketplaceBundleCache() {
  marketplaceBundleCache.clear();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} bucket
 * @param {string} objectKey
 * @returns {Promise<string | null>}
 */
async function downloadStorageObjectTextWithCdn(client, bucket, objectKey) {
  const key = String(objectKey || '').trim().replace(/\\/g, '/');
  if (!key) return null;
  const { data: publicUrlData } = client.storage.from(bucket).getPublicUrl(key);
  const publicUrl = String(publicUrlData?.publicUrl || '').trim();
  if (publicUrl) {
    try {
      const response = await fetch(publicUrl, {
        method: 'GET',
        cache: 'force-cache'
      });
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // fallthrough to storage.download
    }
  }
  const { data: blob, error } = await client.storage.from(bucket).download(key);
  if (error || !blob) {
    return null;
  }
  return await blob.text();
}

/**
 * 与 IPC getMarketplaceProjectBundle 一致：按热索引与帖子行推断 bundle 所在 bucket 与候选对象键。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ id?: string, author_id?: string, status?: string, pending_snapshot_key?: string, public_snapshot_key?: string, project_name?: string }} row
 * @returns {Promise<{ bucket: string, bundleTryKeys: string[], projectIdx: Record<string, unknown> | null }>}
 */
async function resolveMarketplacePostBundleContext(client, row) {
  const postId = String(row?.id || '').trim();
  let bucket = String(row?.status || '') === 'approved' ? MARKETPLACE_PUBLIC_BUCKET : MARKETPLACE_PENDING_BUCKET;
  const { data: projectIdx } = await client
    .from(MARKETPLACE_PROJECT_INDEX_TABLE)
    .select('storage_path, bucket, title')
    .eq('post_id', postId)
    .maybeSingle();
  /** @type {Record<string, unknown> | null} */
  const idx =
    projectIdx && typeof projectIdx === 'object' ? /** @type {Record<string, unknown>} */ (projectIdx) : null;
  if (idx) {
    const idxBucket = String(idx.bucket || '').trim();
    if (idxBucket) {
      bucket = idxBucket;
    }
  }
  const storedKey = String(
    String(idx?.storage_path || '') ||
      (String(row?.status || '') === 'approved' ? row?.public_snapshot_key : row?.pending_snapshot_key) ||
      ''
  )
    .trim()
    .replace(/\\/g, '/');
  const authorId = String(row?.author_id || '').trim();
  /** @type {string[]} */
  const bundleTryKeys = [];
  if (storedKey && storedKey.endsWith(MARKETPLACE_PROJECT_BUNDLE_NAME)) {
    bundleTryKeys.push(storedKey);
  }
  if (authorId && postId) {
    const guessedBundle = `${authorId}/${postId}/project/${MARKETPLACE_PROJECT_BUNDLE_NAME}`.replace(/\/+/g, '/');
    if (!bundleTryKeys.includes(guessedBundle)) {
      bundleTryKeys.push(guessedBundle);
    }
  }
  return { bucket, bundleTryKeys, projectIdx: idx };
}

/**
 * 下载并解析 bundle，命中或写入内存缓存（供预览 IPC 与详情共用）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} bucket
 * @param {string[]} bundleTryKeys
 * @returns {Promise<{ ok: true, bundle: Record<string, unknown>, bundleKey: string } | { ok: false }>}
 */
async function fetchMarketplaceBundleWithCache(client, bucket, bundleTryKeys) {
  const keys = Array.isArray(bundleTryKeys) ? bundleTryKeys : [];
  for (const bk of keys) {
    const cacheKey = buildBundleCacheKey(bucket, bk);
    const cached = readMarketplaceBundleCache(cacheKey);
    if (cached) {
      return { ok: true, bundle: cached.bundle, bundleKey: cached.bundleKey };
    }
    const text = await downloadStorageObjectTextWithCdn(client, bucket, bk);
    if (!text) {
      continue;
    }
    const parsed = parseMarketplaceProjectBundleJson(text);
    if (!parsed.ok) {
      continue;
    }
    writeMarketplaceBundleCache(cacheKey, parsed.bundle, bk);
    return { ok: true, bundle: parsed.bundle, bundleKey: bk };
  }
  return { ok: false };
}

/**
 * 从 bundle 中提取画布用 circuit_config 对象与首份 .ino 源码。
 * @param {Record<string, unknown>} bundle
 * @returns {{ snapshot: Record<string, unknown>, codeSnippet: string }}
 */
function extractSnapshotAndCodeFromBundle(bundle) {
  const files = Array.isArray(bundle.files) ? bundle.files : [];
  /** @type {Record<string, unknown>} */
  let snapshot = {};
  let codeSnippet = '';
  const configItem = files.find((f) => normalizeRelativePath(String(f?.relativePath || '')) === 'circuit_config.json');
  if (configItem && typeof configItem.text === 'string') {
    try {
      snapshot = JSON.parse(configItem.text);
    } catch {
      snapshot = {};
    }
  }
  const inoItem = files.find((f) => String(f?.relativePath || '').toLowerCase().endsWith('.ino'));
  if (inoItem && typeof inoItem.text === 'string') {
    codeSnippet = inoItem.text;
  }
  return { snapshot, codeSnippet };
}

/**
 * 从帖子行推断待审/已发布项目在 Storage 中的项目目录前缀（兼容 DB 与对象键不一致）。
 * @param {{ id?: string, author_id?: string, status?: string, pending_snapshot_key?: string, public_snapshot_key?: string }} row
 * @returns {string}
 */
function resolveMarketplaceProjectStoragePrefix(row) {
  const status = String(row?.status || '');
  const snapshotKey = String(status === 'approved' ? row?.public_snapshot_key : row?.pending_snapshot_key || '').trim();
  let prefix = getPrefixByObjectKey(snapshotKey.replace(/\\/g, '/'));
  const authorId = String(row?.author_id || '').trim();
  const postId = String(row?.id || '').trim();
  const bundleSuffix = `/${MARKETPLACE_PROJECT_BUNDLE_NAME}`;
  const normalizedKey = snapshotKey.replace(/\\/g, '/');
  if (!prefix && normalizedKey.endsWith(bundleSuffix)) {
    prefix = normalizedKey.slice(0, -bundleSuffix.length);
  }
  if (!prefix && authorId && postId) {
    prefix = `${authorId}/${postId}/project`.replace(/\/+/g, '/');
  }
  return String(prefix || '').replace(/\/+$/, '');
}

/**
 * 读取创客集市帖子在 Storage 中的电路快照与代码片段（仅支持 project.bundle.json；与 bundle IPC 共用内存缓存）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ id?: string, author_id?: string, status?: string, pending_snapshot_key?: string, public_snapshot_key?: string, pending_code_key?: string, public_code_key?: string }} row
 * @returns {Promise<{ snapshot: any, codeSnippet: string, error?: string }>}
 */
async function loadMarketplaceSnapshotForDisplay(client, row) {
  const ctx = await resolveMarketplacePostBundleContext(client, row);
  for (const bk of ctx.bundleTryKeys) {
    const cacheKey = buildBundleCacheKey(ctx.bucket, bk);
    const cached = readMarketplaceBundleCache(cacheKey);
    /** @type {Record<string, unknown> | null} */
    let bundle = cached ? cached.bundle : null;
    if (!bundle) {
      const text = await downloadStorageObjectTextWithCdn(client, ctx.bucket, bk);
      if (!text) {
        continue;
      }
      const parsed = parseMarketplaceProjectBundleJson(text);
      if (!parsed.ok) {
        continue;
      }
      writeMarketplaceBundleCache(cacheKey, parsed.bundle, bk);
      bundle = parsed.bundle;
    }
    const extracted = extractSnapshotAndCodeFromBundle(bundle);
    const snapshot = extracted.snapshot || {};
    const codeSnippet = String(extracted.codeSnippet || '');
    if (marketplaceSnapshotHasCircuit(snapshot) || codeSnippet.trim()) {
      return { snapshot, codeSnippet };
    }
  }

  return {
    snapshot: {},
    codeSnippet: '',
    error: '读取项目快照失败：未找到有效的 project.bundle.json。'
  };
}

/**
 * @param {{ projectPath?: string, projectName?: string, description?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, error?: string, postId?: string }>}
 */
async function publishMarketplacePost(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法发布项目。' };
  }
  const role = await tryReadCurrentUserRole(client);
  if (!hasPaidAccountCapabilities(role)) {
    return { success: false, error: '当前为免费版，无法发布项目到创客集市。' };
  }
  const isUnlimitedPublisher = role === 'admin' || role === 'super_admin';
  const projectPathRaw = String(payload?.projectPath || '').trim();
  const projectUuid = normalizeProjectUuid(payload?.projectUuid || '');
  if (!projectPathRaw) {
    return { success: false, error: '项目路径无效，无法发布。' };
  }
  let configRaw = '';
  try {
    configRaw = await fs.promises.readFile(path.join(projectPathRaw, 'circuit_config.json'), 'utf8');
  } catch {
    return { success: false, error: '未找到项目配置文件，无法发布。' };
  }
  let config;
  try {
    config = JSON.parse(configRaw);
  } catch {
    return { success: false, error: '项目配置格式无效，无法发布。' };
  }

  const nowDate = new Date().toISOString().slice(0, 10);
  let currentCount = 0;
  if (!isUnlimitedPublisher) {
    const { data: uploadCounter, error: counterError } = await client
      .from(MARKETPLACE_DAILY_UPLOAD_TABLE)
      .select('upload_count')
      .eq('user_id', user.id)
      .eq('upload_date', nowDate)
      .maybeSingle();
    if (counterError) {
      return { success: false, error: `读取发布配额失败：${counterError.message}` };
    }
    currentCount = Number(uploadCounter?.upload_count || 0);
    if (currentCount >= MARKETPLACE_DAILY_UPLOAD_LIMIT) {
      return { success: false, error: `今日发布次数已达上限（${MARKETPLACE_DAILY_UPLOAD_LIMIT} 次）。` };
    }
  }

  const projectName = String(
    payload?.projectName || config?.projectName || path.basename(projectPathRaw)
  ).trim() || '未命名项目';
  const description = String(payload?.description || config?.description || '').trim();
  const projectPathNormalized = normalizePathForKey(projectPathRaw);
  const configUuid = normalizeProjectUuid(config?.uuid || '');
  const projectKey = buildProjectKey(projectPathNormalized, projectUuid || configUuid);

  // 同一逻辑项目（以 circuit_config.json 内 uuid 生成的 project_key 为准）仅允许一条待审核记录。
  const { data: pendingRows, error: pendingCheckError } = await client
    .from(MARKETPLACE_POST_TABLE)
    .select('id')
    .eq('project_key', projectKey)
    .eq('status', 'pending')
    .limit(1);
  if (pendingCheckError) {
    return { success: false, error: `检查待审核发布状态失败：${pendingCheckError.message}` };
  }
  if (Array.isArray(pendingRows) && pendingRows.length > 0) {
    return {
      success: false,
      error: '该项目已有待审核的集市发布，请等待审核结束后再提交。'
    };
  }

  const postId = crypto.randomUUID();

  const pendingProjectPrefix = `${user.id}/${postId}/project`.replace(/\/+/g, '/');
  const localFiles = await listLocalFilesRecursively(projectPathRaw);
  if (!localFiles.length) {
    return { success: false, error: '项目目录为空，无法发布。' };
  }
  /** @type {{ relativePath: string, text: string }[]} */
  const bundleFiles = [];
  for (const absoluteFile of localFiles) {
    const relativePath = path.relative(projectPathRaw, absoluteFile).replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('..')) {
      continue;
    }
    const ext = path.extname(absoluteFile).toLowerCase();
    if (ext !== '.json' && ext !== '.ino') {
      continue;
    }
    try {
      const text = await fs.promises.readFile(absoluteFile, 'utf8');
      bundleFiles.push({
        relativePath: normalizeRelativePath(relativePath),
        text
      });
    } catch {
      return { success: false, error: `无法读取文件：${relativePath}` };
    }
  }
  if (!bundleFiles.some((f) => f.relativePath === 'circuit_config.json')) {
    return { success: false, error: '项目中需包含 circuit_config.json；集市仅序列化 .json 与 .ino 文件。' };
  }
  const bundleObject = {
    format: MARKETPLACE_PROJECT_BUNDLE_FORMAT,
    projectName,
    description,
    sourceProjectPath: projectPathNormalized,
    generatedAt: new Date().toISOString(),
    files: bundleFiles
  };
  const bundleKey = `${pendingProjectPrefix}/${MARKETPLACE_PROJECT_BUNDLE_NAME}`.replace(/\/+/g, '/');
  const bundleText = JSON.stringify(bundleObject);
  const { error: bundleUploadError } = await client.storage
    .from(MARKETPLACE_PENDING_BUCKET)
    .upload(bundleKey, Buffer.from(bundleText, 'utf8'), {
      upsert: true,
      contentType: 'application/json'
    });
  if (bundleUploadError) {
    return { success: false, error: `上传项目包失败：${bundleUploadError.message}` };
  }

  const nowIso = new Date().toISOString();
  const { error: postInsertError } = await client
    .from(MARKETPLACE_POST_TABLE)
    .insert({
      id: postId,
      author_id: user.id,
      project_key: projectKey,
      project_name: projectName,
      description,
      status: 'pending',
      pending_snapshot_key: bundleKey,
      pending_code_key: null,
      created_at: nowIso,
      updated_at: nowIso
    });
  if (postInsertError) {
    return { success: false, error: `写入发布记录失败：${postInsertError.message}` };
  }
  const { error: indexInsertError } = await client
    .from(MARKETPLACE_PROJECT_INDEX_TABLE)
    .upsert(
      {
        post_id: postId,
        title: projectName,
        author: user.id,
        description,
        cover_image: null,
        bucket: MARKETPLACE_PENDING_BUCKET,
        storage_path: bundleKey,
        status: 'pending',
        likes_count: 0,
        favorites_count: 0,
        remixes_count: 0,
        published_at: null,
        created_at: nowIso,
        updated_at: nowIso
      },
      { onConflict: 'post_id' }
    );
  if (indexInsertError) {
    return { success: false, error: `写入集市索引失败：${indexInsertError.message}` };
  }

  if (!isUnlimitedPublisher) {
    const nextCount = currentCount + 1;
    const { error: countUpsertError } = await client
      .from(MARKETPLACE_DAILY_UPLOAD_TABLE)
      .upsert({
        user_id: user.id,
        upload_date: nowDate,
        upload_count: nextCount,
        updated_at: nowIso
      });
    if (countUpsertError) {
      return { success: false, error: `更新发布计数失败：${countUpsertError.message}` };
    }
  }
  clearMarketplaceListCache();
  clearMarketplaceBundleCache();
  return { success: true, message: '发布成功，等待审核。', postId };
}

/**
 * @returns {Promise<{ success: boolean, posts?: any[], error?: string }>}
 */
async function listMarketplacePendingPosts() {
  const client = getAuthClient();
  const role = await tryReadCurrentUserRole(client);
  if (role !== 'admin' && role !== 'super_admin') {
    return { success: false, error: '权限不足，无法读取待审核项目。' };
  }
  const cacheKey = 'pending::admin';
  const cached = readMarketplaceListCache(cacheKey);
  if (cached) {
    return { success: true, posts: cached };
  }
  const { data, error } = await client
    .from(MARKETPLACE_PROJECT_INDEX_TABLE)
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    return { success: false, error: error.message };
  }
  const posts = (Array.isArray(data) ? data : []).map((row) => ({
    id: String(row.post_id || ''),
    author_id: String(row.author || ''),
    author_name:
      String(row.author_name || '').trim() ||
      String(row.author_display_name || '').trim() ||
      String(row.display_name || '').trim() ||
      '',
    project_name: String(row.title || ''),
    description: String(row.description || ''),
    status: String(row.status || 'pending'),
    created_at: String(row.created_at || ''),
    pending_snapshot_key: String(row.storage_path || ''),
    pending_code_key: null
  }));
  if (!posts.length) {
    const { data: legacyData, error: legacyError } = await client
      .from(MARKETPLACE_POST_TABLE)
      .select('id, author_id, project_name, description, status, created_at, pending_snapshot_key, pending_code_key')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!legacyError && Array.isArray(legacyData) && legacyData.length) {
      const withNames = await attachMarketplaceAuthorNames(client, legacyData);
      writeMarketplaceListCache(cacheKey, withNames);
      return { success: true, posts: withNames };
    }
  }
  const withNames = await attachMarketplaceAuthorNames(client, posts);
  writeMarketplaceListCache(cacheKey, withNames);
  return { success: true, posts: withNames };
}

/**
 * 为列表中的每条帖子附加当前用户是否已点赞/收藏（列表缓存按用户维度区分）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {any[]} posts
 * @returns {Promise<any[]>}
 */
async function attachMarketplaceViewerInteractFlags(client, userId, posts) {
  const uid = String(userId || '').trim();
  const list = Array.isArray(posts) ? posts : [];
  if (!uid || !list.length) {
    return list.map((p) => ({
      ...p,
      viewer_liked: Boolean(p?.viewer_liked),
      viewer_favorited: Boolean(p?.viewer_favorited)
    }));
  }
  const ids = [...new Set(list.map((p) => String(p?.id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    return list.map((p) => ({ ...p, viewer_liked: false, viewer_favorited: false }));
  }
  const [{ data: likeRows, error: likeErr }, { data: favRows, error: favErr }] = await Promise.all([
    client.from('marketplace_post_likes').select('post_id').eq('user_id', uid).in('post_id', ids),
    client.from('marketplace_post_favorites').select('post_id').eq('user_id', uid).in('post_id', ids)
  ]);
  if (likeErr || favErr) {
    return list.map((p) => ({ ...p, viewer_liked: false, viewer_favorited: false }));
  }
  const liked = new Set((likeRows || []).map((r) => String(r.post_id)));
  const favd = new Set((favRows || []).map((r) => String(r.post_id)));
  return list.map((p) => {
    const id = String(p?.id || '').trim();
    return {
      ...p,
      viewer_liked: liked.has(id),
      viewer_favorited: favd.has(id)
    };
  });
}

/**
 * 为帖子列表补全作者昵称（优先帖子自带昵称/ profiles.display_name，兜底为“未知发布者”）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {any[]} posts
 * @returns {Promise<any[]>}
 */
async function attachMarketplaceAuthorNames(client, posts) {
  const list = Array.isArray(posts) ? posts : [];
  if (!list.length) {
    return [];
  }
  /** @type {Map<string, string>} */
  const postAuthorIdMap = new Map();
  const missingAuthorPostIds = list
    .filter((p) => !String(p?.author_id || '').trim())
    .map((p) => String(p?.id || '').trim())
    .filter(Boolean);
  if (missingAuthorPostIds.length) {
    const { data: authorRows, error: authorErr } = await client
      .from(MARKETPLACE_POST_TABLE)
      .select('id, author_id')
      .in('id', [...new Set(missingAuthorPostIds)]);
    if (!authorErr && Array.isArray(authorRows)) {
      authorRows.forEach((row) => {
        const id = String(row?.id || '').trim();
        const aid = String(row?.author_id || '').trim();
        if (!id || !aid) return;
        postAuthorIdMap.set(id, aid);
      });
    }
  }
  const authorIds = [
    ...new Set(
      list
        .map((p) => String(p?.author_id || '').trim() || String(postAuthorIdMap.get(String(p?.id || '').trim()) || '').trim())
        .filter(Boolean)
    )
  ];
  if (!authorIds.length) {
    return list.map((p) => ({ ...p, author_name: String(p?.author_name || '').trim() || '未知发布者' }));
  }
  const { data, error } = await client.from('profiles').select('id, display_name').in('id', authorIds);
  if (error || !Array.isArray(data)) {
    return list.map((p) => {
      const fallback = String(p?.author_name || '').trim();
      return { ...p, author_name: fallback || '未知发布者' };
    });
  }
  const profileNameMap = new Map();
  data.forEach((row) => {
    const id = String(row?.id || '').trim();
    if (!id) return;
    profileNameMap.set(id, String(row?.display_name || '').trim());
  });
  return list.map((p) => {
    const authorId = String(p?.author_id || '').trim() || String(postAuthorIdMap.get(String(p?.id || '').trim()) || '').trim();
    const profileName = authorId ? String(profileNameMap.get(authorId) || '').trim() : '';
    const fallback = String(p?.author_name || '').trim();
    return { ...p, author_name: profileName || fallback || '未知发布者' };
  });
}

/**
 * @param {{ query?: string, sortBy?: 'likes'|'favorites'|'remixes' }} payload
 * @returns {Promise<{ success: boolean, posts?: any[], error?: string }>}
 */
async function listMarketplaceApprovedPosts(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user?.id) {
    return { success: false, error: '请先登录后查看创客集市。' };
  }
  const userId = String(userData.user.id);
  const query = String(payload?.query || '').trim().toLowerCase();
  const sortBy = String(payload?.sortBy || 'likes').trim().toLowerCase();
  const sortColumn =
    sortBy === 'favorites' ? 'favorites_count' : sortBy === 'remixes' ? 'remixes_count' : 'likes_count';
  const cacheKey = `approved::${userId}::${query}::${sortColumn}`;
  const cached = readMarketplaceListCache(cacheKey);
  if (cached) {
    return { success: true, posts: cached };
  }
  let request = client
    .from(MARKETPLACE_PROJECT_INDEX_TABLE)
    .select('*')
    .eq('status', 'approved')
    .order(sortColumn, { ascending: false })
    .order('published_at', { ascending: false });
  if (query) {
    request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  }
  const { data, error } = await request.limit(120);
  if (error) {
    return { success: false, error: error.message };
  }
  const posts = (Array.isArray(data) ? data : []).map((row) => ({
    id: String(row.post_id || ''),
    author_id: String(row.author || ''),
    author_name:
      String(row.author_name || '').trim() ||
      String(row.author_display_name || '').trim() ||
      String(row.display_name || '').trim() ||
      '',
    project_name: String(row.title || ''),
    description: String(row.description || ''),
    likes_count: Number(row.likes_count || 0),
    favorites_count: Number(row.favorites_count || 0),
    remixes_count: Number(row.remixes_count || 0),
    published_at: String(row.published_at || ''),
    public_snapshot_key: String(row.storage_path || ''),
    public_code_key: null
  }));
  if (!posts.length) {
    let legacyRequest = client
      .from(MARKETPLACE_POST_TABLE)
      .select('id, author_id, project_name, description, likes_count, favorites_count, remixes_count, published_at, public_snapshot_key, public_code_key')
      .eq('status', 'approved')
      .order(sortColumn, { ascending: false })
      .order('published_at', { ascending: false });
    if (query) {
      legacyRequest = legacyRequest.or(`project_name.ilike.%${query}%,description.ilike.%${query}%`);
    }
    const { data: legacyData, error: legacyError } = await legacyRequest.limit(120);
    if (!legacyError && Array.isArray(legacyData) && legacyData.length) {
      const withAuthorLegacy = await attachMarketplaceAuthorNames(client, legacyData);
      const enrichedLegacy = await attachMarketplaceViewerInteractFlags(client, userId, withAuthorLegacy);
      writeMarketplaceListCache(cacheKey, enrichedLegacy);
      return { success: true, posts: enrichedLegacy };
    }
  }
  const withAuthorPosts = await attachMarketplaceAuthorNames(client, posts);
  const enrichedPosts = await attachMarketplaceViewerInteractFlags(client, userId, withAuthorPosts);
  writeMarketplaceListCache(cacheKey, enrichedPosts);
  return { success: true, posts: enrichedPosts };
}

/**
 * 校验当前登录用户是否可读指定集市帖子（详情与本地准备共用）。
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} postId
 * @returns {Promise<{ ok: true, data: Record<string, unknown> } | { ok: false, error: string }>}
 */
async function assertMarketplacePostReadable(client, postId) {
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { ok: false, error: '当前未登录，无法查看项目详情。' };
  }
  const normalizedId = String(postId || '').trim();
  if (!normalizedId) {
    return { ok: false, error: '项目标识无效。' };
  }
  const role = await tryReadCurrentUserRole(client);
  const { data, error } = await client
    .from(MARKETPLACE_POST_TABLE)
    .select('*')
    .eq('id', normalizedId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: error?.message || '未找到项目记录。' };
  }
  const isReviewer = role === 'admin' || role === 'super_admin';
  if (data.status !== 'approved' && !isReviewer && String(data.author_id || '') !== user.id) {
    return { ok: false, error: '无权查看该项目详情。' };
  }
  return { ok: true, data };
}

/**
 * @param {{ postId?: string }} payload
 * @returns {Promise<{ success: boolean, detail?: any, error?: string }>}
 */
async function getMarketplacePostDetail(payload) {
  const client = getAuthClient();
  const postId = String(payload?.postId || '').trim();
  const gate = await assertMarketplacePostReadable(client, postId);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }
  const data = gate.data;
  const loaded = await loadMarketplaceSnapshotForDisplay(client, data);
  if (loaded.error) {
    if (!marketplaceSnapshotHasCircuit(loaded.snapshot) && !String(loaded.codeSnippet || '').trim()) {
      return { success: false, error: loaded.error };
    }
  }
  const snapshot = loaded.snapshot || {};
  const codeSnippet = String(loaded.codeSnippet || '');
  const authorId = String(data.author_id || '').trim();
  let authorName = '未知发布者';
  if (authorId) {
    const { data: profile } = await client.from('profiles').select('display_name').eq('id', authorId).maybeSingle();
    authorName = String(profile?.display_name || '').trim() || '未知发布者';
  }
  const { data: authUserData } = await client.auth.getUser();
  const uid = String(authUserData?.user?.id || '').trim();
  const [{ data: likeRow }, { data: favRow }] = await Promise.all([
    uid
      ? client.from('marketplace_post_likes').select('post_id').eq('user_id', uid).eq('post_id', postId).maybeSingle()
      : Promise.resolve({ data: null }),
    uid
      ? client.from('marketplace_post_favorites').select('post_id').eq('user_id', uid).eq('post_id', postId).maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  return {
    success: true,
    detail: {
      id: String(data.id || ''),
      projectName: String(data.project_name || ''),
      description: String(data.description || ''),
      status: String(data.status || ''),
      likesCount: Number(data.likes_count || 0),
      favoritesCount: Number(data.favorites_count || 0),
      remixesCount: Number(data.remixes_count || 0),
      authorName,
      createdAt: String(data.created_at || ''),
      publishedAt: String(data.published_at || ''),
      viewerLiked: Boolean(likeRow?.post_id),
      viewerFavorited: Boolean(favRow?.post_id),
      snapshot,
      codeSnippet
    }
  };
}

/**
 * 下载并解析集市项目单文件包（仅内存 JSON，不写本地 temp）。
 * @param {{ postId?: string }} payload
 * @returns {Promise<{ success: boolean, bundle?: Record<string, unknown>, bundleKey?: string, projectName?: string, error?: string }>}
 */
async function getMarketplaceProjectBundle(payload) {
  const client = getAuthClient();
  const postId = String(payload?.postId || '').trim();
  if (!postId) {
    return { success: false, error: '项目标识无效。' };
  }
  const gate = await assertMarketplacePostReadable(client, postId);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }
  const row = gate.data;
  const ctx = await resolveMarketplacePostBundleContext(client, row);
  const got = await fetchMarketplaceBundleWithCache(client, ctx.bucket, ctx.bundleTryKeys);
  if (!got.ok) {
    return { success: false, error: '未找到 project.bundle.json 或包格式无效。' };
  }
  return {
    success: true,
    bundle: got.bundle,
    bundleKey: got.bundleKey,
    projectName: String(ctx.projectIdx?.title || row.project_name || '创客集市预览项目')
  };
}

/**
 * @param {{ postId?: string, action?: 'approve'|'reject', rejectReason?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
async function reviewMarketplacePost(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: '当前未登录，无法审核项目。' };
  }
  const role = await tryReadCurrentUserRole(client);
  if (role !== 'admin' && role !== 'super_admin') {
    return { success: false, error: '权限不足，无法审核项目。' };
  }
  const postId = String(payload?.postId || '').trim();
  const action = String(payload?.action || '').trim().toLowerCase();
  if (!postId || !['approve', 'reject'].includes(action)) {
    return { success: false, error: '审核参数无效。' };
  }
  const { data: post, error: postError } = await client
    .from(MARKETPLACE_POST_TABLE)
    .select('*')
    .eq('id', postId)
    .eq('status', 'pending')
    .maybeSingle();
  if (postError || !post) {
    return { success: false, error: postError?.message || '待审核项目不存在。' };
  }
  const nowIso = new Date().toISOString();
  if (action === 'approve') {
    const pendingSnapshotKey = String(post.pending_snapshot_key || '');
    const pendingCodeKey = String(post.pending_code_key || '');
    const pendingProjectPrefix = getPrefixByObjectKey(pendingSnapshotKey);
    if (!pendingProjectPrefix) {
      return { success: false, error: '待审核项目缺少有效快照路径，无法审核。' };
    }
    const pendingFiles = await listStorageFilesByPrefix(client, MARKETPLACE_PENDING_BUCKET, pendingProjectPrefix);
    if (!pendingFiles.length) {
      return { success: false, error: '待审核项目文件不存在，无法审核通过。' };
    }
    const publicProjectPrefix = `${postId}/project`;
    for (const pendingFile of pendingFiles) {
      const relativePath = pendingFile.slice(pendingProjectPrefix.length + 1);
      const publicFile = `${publicProjectPrefix}/${relativePath}`.replace(/\/+/g, '/');
      const { data: pendingBlob, error: pendingBlobError } = await client.storage
        .from(MARKETPLACE_PENDING_BUCKET)
        .download(pendingFile);
      if (pendingBlobError || !pendingBlob) {
        return { success: false, error: `读取待审核文件失败：${pendingBlobError?.message || relativePath}` };
      }
      const fileBuffer = Buffer.from(await pendingBlob.arrayBuffer());
      const { error: publicUploadError } = await client.storage.from(MARKETPLACE_PUBLIC_BUCKET).upload(publicFile, fileBuffer, {
        upsert: true,
        contentType: getContentTypeByPath(publicFile),
        cacheControl: MARKETPLACE_PUBLIC_OBJECT_CACHE_CONTROL
      });
      if (publicUploadError) {
        return { success: false, error: `写入公开文件失败(${relativePath})：${publicUploadError.message}` };
      }
    }
    await client.storage.from(MARKETPLACE_PENDING_BUCKET).remove(pendingFiles);
    const tail =
      pendingProjectPrefix && pendingSnapshotKey.startsWith(`${pendingProjectPrefix}/`)
        ? pendingSnapshotKey.slice(pendingProjectPrefix.length + 1)
        : path.basename(pendingSnapshotKey.replace(/\\/g, '/'));
    const publicSnapshotKey = `${publicProjectPrefix}/${tail}`.replace(/\/+/g, '/');
    const publicCodeKey = pendingCodeKey
      ? `${publicProjectPrefix}/${path.basename(pendingCodeKey).replace(/\\/g, '/')}`
      : null;

    const { error: updateError } = await client
      .from(MARKETPLACE_POST_TABLE)
      .update({
        status: 'approved',
        public_snapshot_key: publicSnapshotKey,
        public_code_key: publicCodeKey,
        published_at: nowIso,
        reviewed_at: nowIso,
        reviewer_id: user.id,
        reject_reason: null,
        pending_snapshot_key: null,
        pending_code_key: null,
        updated_at: nowIso
      })
      .eq('id', postId);
    if (updateError) {
      return { success: false, error: `更新审核状态失败：${updateError.message}` };
    }
    await client
      .from(MARKETPLACE_PROJECT_INDEX_TABLE)
      .update({
        status: 'approved',
        bucket: MARKETPLACE_PUBLIC_BUCKET,
        storage_path: publicSnapshotKey,
        published_at: nowIso,
        updated_at: nowIso
      })
      .eq('post_id', postId);
    clearMarketplaceListCache();
    clearMarketplaceBundleCache();
    return { success: true, message: '审核通过，项目已发布到创客集市。' };
  }

  const pendingPrefix = getPrefixByObjectKey(String(post.pending_snapshot_key || ''));
  const removeKeys = pendingPrefix
    ? await listStorageFilesByPrefix(client, MARKETPLACE_PENDING_BUCKET, pendingPrefix)
    : [String(post.pending_snapshot_key || ''), String(post.pending_code_key || '')].filter(Boolean);
  if (removeKeys.length) {
    await client.storage.from(MARKETPLACE_PENDING_BUCKET).remove(removeKeys);
  }
  const { error: rejectError } = await client
    .from(MARKETPLACE_POST_TABLE)
    .update({
      status: 'rejected',
      reviewed_at: nowIso,
      reviewer_id: user.id,
      reject_reason: String(payload?.rejectReason || '').trim() || null,
      pending_snapshot_key: null,
      pending_code_key: null,
      updated_at: nowIso
    })
    .eq('id', postId);
  if (rejectError) {
    return { success: false, error: `写入拒绝结果失败：${rejectError.message}` };
  }
  await client
    .from(MARKETPLACE_PROJECT_INDEX_TABLE)
    .update({
      status: 'rejected',
      bucket: MARKETPLACE_PENDING_BUCKET,
      storage_path: '',
      updated_at: nowIso
    })
    .eq('post_id', postId);
  clearMarketplaceListCache();
  clearMarketplaceBundleCache();
  return { success: true, message: '已拒绝该项目投稿。' };
}

/**
 * @param {{ postId?: string, action?: 'like'|'favorite'|'remix' }} payload
 * @returns {Promise<{ success: boolean, message?: string, toggled?: boolean, delta?: number, error?: string }>}
 */
async function interactMarketplacePost(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: '请先登录后再执行互动操作。' };
  }
  const postId = String(payload?.postId || '').trim();
  const action = String(payload?.action || '').trim().toLowerCase();
  if (!postId || !['like', 'favorite', 'remix'].includes(action)) {
    return { success: false, error: '互动参数无效。' };
  }
  const tableMap = {
    like: 'marketplace_post_likes',
    favorite: 'marketplace_post_favorites',
    remix: 'marketplace_post_remixes'
  };
  const countColumnMap = {
    like: 'likes_count',
    favorite: 'favorites_count',
    remix: 'remixes_count'
  };
  const table = tableMap[action];
  const countColumn = countColumnMap[action];
  const { data: existing } = await client.from(table).select('post_id').eq('user_id', user.id).eq('post_id', postId).maybeSingle();
  let delta = 0;
  let toggled = false;
  if (existing) {
    if (action === 'remix') {
      return { success: true, message: '已记录该操作。', toggled: true, delta: 0 };
    }
    const { error: deleteError } = await client.from(table).delete().eq('user_id', user.id).eq('post_id', postId);
    if (deleteError) {
      return { success: false, error: deleteError.message };
    }
    delta = -1;
    toggled = false;
  } else {
    const { error: insertError } = await client.from(table).insert({ user_id: user.id, post_id: postId });
    if (insertError) {
      const errCode = String(insertError.code || '').trim();
      if (action === 'remix' && (errCode === '23505' || /duplicate key/i.test(String(insertError.message || '')))) {
        return { success: true, message: '已记录该操作。', toggled: true, delta: 0 };
      }
      return { success: false, error: insertError.message };
    }
    delta = 1;
    toggled = true;
  }
  const { data: postData } = await client
    .from(MARKETPLACE_POST_TABLE)
    .select(countColumn)
    .eq('id', postId)
    .maybeSingle();
  const current = Number(postData?.[countColumn] || 0);
  const nextValue = Math.max(0, current + delta);
  await client
    .from(MARKETPLACE_POST_TABLE)
    .update({ [countColumn]: nextValue, updated_at: new Date().toISOString() })
    .eq('id', postId);
  await client
    .from(MARKETPLACE_PROJECT_INDEX_TABLE)
    .update({ [countColumn]: nextValue, updated_at: new Date().toISOString() })
    .eq('post_id', postId);
  clearMarketplaceListCache();
  return {
    success: true,
    message: action === 'remix' ? '操作成功。' : toggled ? '已点赞/收藏。' : '已撤销点赞/收藏。',
    toggled,
    delta
  };
}

/** 单次 Storage remove 路径数量上限，避免请求体过大。 */
const MARKETPLACE_STORAGE_REMOVE_CHUNK = 200;

/**
 * 超级管理员：删除已发布集市项目（公开 bucket 下该项目前缀、互动从表、热索引与主帖）。
 * @param {{ postId?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
async function deleteMarketplaceApprovedPostSuperAdmin(payload) {
  const client = getAuthClient();
  const role = await tryReadCurrentUserRole(client);
  if (role !== 'super_admin') {
    return { success: false, error: '仅超级管理员可删除已发布集市项目。' };
  }
  const postId = String(payload?.postId || '').trim();
  if (!postId) {
    return { success: false, error: '项目标识无效。' };
  }
  const { data: post, error: postReadErr } = await client
    .from(MARKETPLACE_POST_TABLE)
    .select('id, status')
    .eq('id', postId)
    .maybeSingle();
  if (postReadErr) {
    return { success: false, error: postReadErr.message };
  }
  if (!post || String(post.status || '') !== 'approved') {
    return { success: false, error: '只能删除已发布状态的项目。' };
  }
  const publicProjectPrefix = `${postId}/project`.replace(/\/+/g, '/');
  let publicFiles = [];
  try {
    publicFiles = await listStorageFilesByPrefix(client, MARKETPLACE_PUBLIC_BUCKET, publicProjectPrefix);
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
    return { success: false, error: `列出公开存储失败：${msg}` };
  }
  for (let i = 0; i < publicFiles.length; i += MARKETPLACE_STORAGE_REMOVE_CHUNK) {
    const chunk = publicFiles.slice(i, i + MARKETPLACE_STORAGE_REMOVE_CHUNK);
    const { error: rmErr } = await client.storage.from(MARKETPLACE_PUBLIC_BUCKET).remove(chunk);
    if (rmErr) {
      return { success: false, error: `删除公开存储失败：${rmErr.message}` };
    }
  }
  const interactTables = ['marketplace_post_likes', 'marketplace_post_favorites', 'marketplace_post_remixes'];
  for (const table of interactTables) {
    const { error: delInteractErr } = await client.from(table).delete().eq('post_id', postId);
    if (delInteractErr) {
      return { success: false, error: `清理互动数据失败(${table})：${delInteractErr.message}` };
    }
  }
  const { error: idxErr } = await client.from(MARKETPLACE_PROJECT_INDEX_TABLE).delete().eq('post_id', postId);
  if (idxErr) {
    return { success: false, error: `删除索引失败：${idxErr.message}` };
  }
  const { error: delPostErr } = await client
    .from(MARKETPLACE_POST_TABLE)
    .delete()
    .eq('id', postId)
    .eq('status', 'approved');
  if (delPostErr) {
    return { success: false, error: `删除帖子记录失败：${delPostErr.message}` };
  }
  clearMarketplaceListCache();
  clearMarketplaceBundleCache();
  return { success: true, message: '已删除该集市项目。' };
}

module.exports = {
  getAuthState,
  getOAuthRedirectUrl,
  handleOAuthCallbackUrl,
  signInWithOAuth,
  updateProfile,
  uploadAvatar,
  getProjectBackups,
  getMarketplacePublishStatuses,
  uploadProjectBackup,
  deleteProjectBackup,
  downloadProjectBackup,
  searchSharedBackupProjectsByKey,
  getSharedBackupBundleByProjectKey,
  getPermissionManagementStats,
  listUsersForPermissionManagement,
  updateUserRoleBySuperAdmin,
  publishMarketplacePost,
  listMarketplacePendingPosts,
  listMarketplaceApprovedPosts,
  getMarketplacePostDetail,
  getMarketplaceProjectBundle,
  reviewMarketplacePost,
  interactMarketplacePost,
  deleteMarketplaceApprovedPostSuperAdmin,
  signUpWithPassword,
  signInWithPassword,
  signOut
};
