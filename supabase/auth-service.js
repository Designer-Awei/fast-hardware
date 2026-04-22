'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const { readSupabaseConfig } = require('./config');

const SESSION_STORAGE_KEY = 'supabase.auth.token';
const SESSION_PREFERENCE_KEY = 'supabase.auth.persistence';
const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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
 * @returns {void}
 */
function clearPersistedAuthSession() {
  const store = readSessionStore();
  delete store[SESSION_STORAGE_KEY];
  delete store[SESSION_PREFERENCE_KEY];
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
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {{ email?: string, displayName?: string }} [extra]
 * @returns {Promise<void>}
 */
async function tryUpsertProfile(client, userId, extra = {}) {
  if (!userId) return;
  try {
    await client.from('profiles').upsert(
      {
        id: userId,
        display_name: extra.displayName || null,
        provider: 'email',
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
    await tryUpsertProfile(client, data.user.id, { email, displayName });
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
      displayName: String(data.user.user_metadata?.display_name || '').trim()
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

module.exports = {
  getAuthState,
  signUpWithPassword,
  signInWithPassword,
  signOut
};
