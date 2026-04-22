'use strict';

const fs = require('fs');
const path = require('path');

/** @type {string} 仓库根目录 */
const PROJECT_ROOT = path.resolve(__dirname, '..');
/** @type {string} Supabase 本地配置文件路径 */
const DEFAULT_SUPABASE_ENV_PATH = path.join(PROJECT_ROOT, '.env.supabase');

/**
 * 解析简单的 `.env` 键值对。
 * @param {string} text - `.env` 原始文本
 * @returns {Record<string, string>} 解析后的键值表
 */
function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * 读取 Supabase 配置；兼容旧变量 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
 * @param {string} [envPath=DEFAULT_SUPABASE_ENV_PATH] - 配置文件路径
 * @returns {{ envPath: string, url: string, publishableKey: string, isConfigured: boolean }}
 */
function readSupabaseConfig(envPath = DEFAULT_SUPABASE_ENV_PATH) {
  let text = '';
  if (fs.existsSync(envPath)) {
    text = fs.readFileSync(envPath, 'utf8');
  }
  const env = parseEnvText(text);
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const publishableKey = String(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  ).trim();
  return {
    envPath,
    url,
    publishableKey,
    isConfigured: Boolean(url && publishableKey)
  };
}

module.exports = {
  DEFAULT_SUPABASE_ENV_PATH,
  parseEnvText,
  readSupabaseConfig
};
