'use strict';

const { createClient } = require('@supabase/supabase-js');
const { readSupabaseConfig } = require('./config');

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let cachedClient = null;
/** @type {string} */
let cachedClientKey = '';

/**
 * 获取当前 Supabase 配置。
 * @returns {{ envPath: string, url: string, publishableKey: string, isConfigured: boolean }}
 */
function getSupabaseConfig() {
  return readSupabaseConfig();
}

/**
 * 获取默认单例 Supabase client。
 * 说明：
 * - 当前项目尚未实现完整 OAuth 回调与安全存储，因此先以「基础客户端」方式初始化。
 * - `persistSession` 暂时关闭，避免在 Node / preload 环境下误用浏览器存储。
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabaseClient() {
  const config = readSupabaseConfig();
  if (!config.isConfigured) {
    throw new Error(
      `Supabase 未完成配置，请检查 ${config.envPath} 中的 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
    );
  }

  const nextCacheKey = `${config.url}::${config.publishableKey}`;
  if (!cachedClient || cachedClientKey !== nextCacheKey) {
    cachedClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    cachedClientKey = nextCacheKey;
  }

  return cachedClient;
}

module.exports = {
  getSupabaseConfig,
  getSupabaseClient
};
