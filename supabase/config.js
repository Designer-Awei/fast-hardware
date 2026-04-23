'use strict';

const fs = require('fs');
const path = require('path');

/** @type {string} 仓库根目录（开发态或 asar 根路径） */
const PROJECT_ROOT = path.resolve(__dirname, '..');
/** @type {string} 开发时默认配置文件路径 */
const DEFAULT_SUPABASE_ENV_PATH = path.join(PROJECT_ROOT, '.env.supabase');

/**
 * 按优先级列出 Supabase 环境文件路径。
 * 打包后 `.env.supabase` 位于 `resources/`（与 `app.asar` 同级），由 `electron-builder` 的 `extraResources` 写入。
 * @returns {string[]}
 */
function listSupabaseEnvPathCandidates() {
  /** @type {string[]} */
  const candidates = [];
  const explicit = String(process.env.FASTHARDWARE_SUPABASE_ENV_PATH || '').trim();
  if (explicit) {
    candidates.push(explicit);
  }
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.trim()
      ? process.resourcesPath.trim()
      : '';
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, '.env.supabase'));
  }
  candidates.push(DEFAULT_SUPABASE_ENV_PATH);
  return [...new Set(candidates.filter(Boolean))];
}

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
 * @param {string} [overridePath] - 若传入非空字符串，则仅尝试该路径（测试或调试）
 * @returns {{ envPath: string, url: string, publishableKey: string, oauthRedirectUrl: string, isConfigured: boolean }}
 */
function readSupabaseConfig(overridePath) {
  const paths = overridePath
    ? [String(overridePath || '').trim()].filter(Boolean)
    : listSupabaseEnvPathCandidates();
  let envPath = paths[paths.length - 1] || DEFAULT_SUPABASE_ENV_PATH;
  let text = '';
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      envPath = p;
      text = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  const env = parseEnvText(text);
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const publishableKey = String(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  ).trim();
  const oauthRedirectUrl = String(env.SUPABASE_OAUTH_REDIRECT_URL || 'fasthardware://auth/callback').trim();
  return {
    envPath,
    url,
    publishableKey,
    oauthRedirectUrl,
    isConfigured: Boolean(url && publishableKey)
  };
}

module.exports = {
  DEFAULT_SUPABASE_ENV_PATH,
  listSupabaseEnvPathCandidates,
  parseEnvText,
  readSupabaseConfig
};
