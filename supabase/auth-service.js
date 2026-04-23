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
const PROJECT_BACKUP_MANIFEST_NAME = '__manifest__.json';

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
    role: String(profile.role || user?.app_metadata?.role || 'user'),
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
 * @returns {string}
 */
function buildProjectKey(projectPath) {
  return crypto
    .createHash('sha256')
    .update(String(projectPath || '').trim(), 'utf8')
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
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {string} projectKey
 * @returns {Promise<{ files: Array<{ originalRelativePath: string, safeRelativePath: string }> } | null>}
 */
async function readProjectBackupManifest(client, userId, projectKey) {
  const manifestObjectPath = `${userId}/${projectKey}/${PROJECT_BACKUP_MANIFEST_NAME}`;
  const { data, error } = await client.storage.from(PROJECT_BACKUP_BUCKET).download(manifestObjectPath);
  if (error || !data) {
    return null;
  }
  const text = await data.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.files)) {
    return null;
  }
  return {
    files: parsed.files
      .map((item) => ({
        originalRelativePath: normalizeRelativePath(item?.originalRelativePath || ''),
        safeRelativePath: normalizeRelativePath(item?.safeRelativePath || '')
      }))
      .filter((item) => item.originalRelativePath && item.safeRelativePath)
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {string} projectKey
 * @returns {Promise<void>}
 */
async function clearProjectBackupObjects(client, userId, projectKey) {
  const manifest = await readProjectBackupManifest(client, userId, projectKey).catch(() => null);
  if (manifest?.files?.length) {
    const manifestPaths = manifest.files.map(
      (item) => `${userId}/${projectKey}/${item.safeRelativePath}`
    );
    manifestPaths.push(`${userId}/${projectKey}/${PROJECT_BACKUP_MANIFEST_NAME}`);
    const { error: removeByManifestError } = await client.storage
      .from(PROJECT_BACKUP_BUCKET)
      .remove(manifestPaths);
    if (!removeByManifestError) {
      return;
    }
  }

  const folderPath = `${userId}/${projectKey}`;
  const toRemove = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from(PROJECT_BACKUP_BUCKET).list(folderPath, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) {
      throw new Error(`读取备份文件列表失败：${error.message}`);
    }
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      if (!row?.name) continue;
      toRemove.push(`${folderPath}/${row.name}`);
    }
    if (rows.length < 100) {
      break;
    }
    offset += rows.length;
  }
  if (toRemove.length === 0) {
    return;
  }
  const { error: removeError } = await client.storage.from(PROJECT_BACKUP_BUCKET).remove(toRemove);
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
  const projectPaths = Array.isArray(payload?.projectPaths)
    ? payload.projectPaths.map((v) => normalizePathForKey(v)).filter(Boolean)
    : [];
  const projectKeys = projectPaths.map((v) => buildProjectKey(v));
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
  const projectPathRaw = String(payload?.projectPath || '').trim();
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
  let totalBytes = 0;
  for (const file of files) {
    const stat = await fs.promises.stat(file.absolutePath);
    totalBytes += Number(stat?.size || 0);
  }
  if (totalBytes > PROJECT_BACKUP_MAX_BYTES) {
    return { success: false, error: '文件太大，单次上传备份需小于 5MB。' };
  }

  const projectKey = buildProjectKey(projectPath);
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

  const manifestFiles = [];
  for (const file of files) {
    const safeRelativePath = encodeStorageRelativePath(file.relativePath);
    const objectPath = `${user.id}/${projectKey}/${safeRelativePath}`;
    const fileBuffer = await fs.promises.readFile(file.absolutePath);
    const { error: uploadError } = await client.storage.from(PROJECT_BACKUP_BUCKET).upload(objectPath, fileBuffer, {
      upsert: true,
      contentType: 'application/octet-stream'
    });
    if (uploadError) {
      return {
        success: false,
        error: `上传备份文件失败（${file.relativePath}）：${uploadError.message}`
      };
    }
    manifestFiles.push({
      originalRelativePath: normalizeRelativePath(file.relativePath),
      safeRelativePath: normalizeRelativePath(safeRelativePath)
    });
  }
  const manifestObjectPath = `${user.id}/${projectKey}/${PROJECT_BACKUP_MANIFEST_NAME}`;
  const manifestText = JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    projectName,
    files: manifestFiles
  });
  const { error: manifestUploadError } = await client.storage.from(PROJECT_BACKUP_BUCKET).upload(
    manifestObjectPath,
    Buffer.from(manifestText, 'utf8'),
    {
      upsert: true,
      contentType: 'application/json'
    }
  );
  if (manifestUploadError) {
    return { success: false, error: `上传备份清单失败：${manifestUploadError.message}` };
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
        file_count: files.length,
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
    fileCount: files.length
  };
}

/**
 * @param {{ projectKey?: string, projectName?: string, storagePath?: string }} payload
 * @returns {Promise<{ success: boolean, message?: string, restoredPath?: string, error?: string }>}
 */
async function downloadProjectBackup(payload) {
  const client = getAuthClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user || null;
  if (userError || !user?.id) {
    return { success: false, error: userError?.message || '当前未登录，无法下载备份。' };
  }
  const projectKey = String(payload?.projectKey || '').trim();
  const projectName = String(payload?.projectName || '').trim() || '恢复项目';
  const storagePath = String(payload?.storagePath || '').trim();
  if (!projectKey || !storagePath) {
    return { success: false, error: '缺少备份标识或本地存储路径。' };
  }
  const manifest = await readProjectBackupManifest(client, user.id, projectKey);
  if (!manifest?.files?.length) {
    return { success: false, error: '该备份版本不包含恢复清单，请重新上传后再下载。' };
  }

  const safeFolderName = projectName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `restored-${projectKey.slice(0, 8)}`;
  let restoredPath = path.join(storagePath, safeFolderName);
  if (fs.existsSync(restoredPath)) {
    restoredPath = path.join(storagePath, `${safeFolderName}-恢复-${Date.now()}`);
  }
  await fs.promises.mkdir(restoredPath, { recursive: true });

  for (const item of manifest.files) {
    const objectPath = `${user.id}/${projectKey}/${item.safeRelativePath}`;
    const { data, error } = await client.storage.from(PROJECT_BACKUP_BUCKET).download(objectPath);
    if (error || !data) {
      return { success: false, error: `下载备份文件失败（${item.originalRelativePath}）：${error?.message || 'unknown_error'}` };
    }
    const safeRelative = item.originalRelativePath;
    if (!safeRelative || safeRelative.includes('..') || path.isAbsolute(safeRelative)) {
      continue;
    }
    const targetPath = path.join(restoredPath, ...safeRelative.split('/'));
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.promises.writeFile(targetPath, buffer);
  }
  return { success: true, message: '云端备份已下载到本地。', restoredPath };
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
  if (!projectPathRaw) {
    return { success: false, error: '项目路径为空，无法撤销备份。' };
  }
  const projectPath = normalizePathForKey(projectPathRaw);
  const projectKey = buildProjectKey(projectPath);
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

module.exports = {
  getAuthState,
  getOAuthRedirectUrl,
  handleOAuthCallbackUrl,
  signInWithOAuth,
  updateProfile,
  uploadAvatar,
  getProjectBackups,
  uploadProjectBackup,
  deleteProjectBackup,
  downloadProjectBackup,
  signUpWithPassword,
  signInWithPassword,
  signOut
};
