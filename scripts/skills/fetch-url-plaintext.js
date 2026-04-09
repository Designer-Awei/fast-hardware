/**
 * @fileoverview 主进程侧：为 `summarize_skill` 可选抓取公开 http(s) 页面正文（纯文本），供 LLM 摘要。
 * 仅允许 http/https，限制体积与重定向；**不**保证能绕过登录墙或反爬。
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/** @type {number} */
const MAX_URLS = 5;
/** @type {number} */
const MAX_BYTES_PER_URL = 200000;
/** @type {number} */
const TIMEOUT_MS = 15000;
/** @type {number} */
const MAX_REDIRECTS = 2;

/**
 * @param {string} host
 * @returns {boolean}
 */
function isBlockedHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h || h === 'localhost') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '127.0.0.1' || h === '::1') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = /^172\.(\d{1,3})\./.exec(h);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/**
 * @param {string} urlStr
 * @returns {boolean}
 */
function isAllowedPublicUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (isBlockedHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} html
 * @returns {string}
 */
function htmlToPlainText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/(p|div|br|tr|h[1-6])>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * @param {string} urlStr
 * @param {number} redirectLeft
 * @returns {Promise<{ url: string, text: string, error?: string }>}
 */
function fetchOneUrl(urlStr, redirectLeft) {
  return new Promise((resolve) => {
    if (!isAllowedPublicUrl(urlStr)) {
      resolve({ url: urlStr, text: '', error: 'URL 不允许或非 http(s)' });
      return;
    }
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      resolve({ url: urlStr, text: '', error: String(e?.message || e) });
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname || '/'}${u.search || ''}`,
        method: 'GET',
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'FastHardwareSummarize/1.0 (compatible; URL text fetch for user-initiated summary)',
          Accept: 'text/html,text/plain,*/*;q=0.8'
        }
      },
      (res) => {
        const loc = res.headers && res.headers.location;
        if (
          loc &&
          redirectLeft > 0 &&
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)
        ) {
          let nextUrl;
          try {
            nextUrl = new URL(loc, urlStr).href;
          } catch {
            resolve({ url: urlStr, text: '', error: '重定向 URL 无效' });
            return;
          }
          fetchOneUrl(nextUrl, redirectLeft - 1).then(resolve);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          resolve({ url: urlStr, text: '', error: `HTTP ${res.statusCode}` });
          return;
        }
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total <= MAX_BYTES_PER_URL) {
            chunks.push(chunk);
          }
        });
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const raw = buf.toString('utf8');
          const ct = String(res.headers['content-type'] || '').toLowerCase();
          const text = ct.includes('text/html') ? htmlToPlainText(raw) : raw.replace(/\s+/g, ' ').trim();
          const clipped = text.length > 80000 ? `${text.slice(0, 80000)}…` : text;
          resolve({ url: urlStr, text: clipped || '(空正文)' });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ url: urlStr, text: '', error: '请求超时' });
    });
    req.on('error', (e) => {
      resolve({ url: urlStr, text: '', error: e?.message || String(e) });
    });
    req.end();
  });
}

/**
 * 顺序抓取多个 URL 的纯文本（失败项带 error，不抛异常）。
 * @param {string[]} urls
 * @returns {Promise<Array<{ url: string, text: string, error?: string }>>}
 */
async function fetchUrlsPlainText(urls) {
  const list = (urls || [])
    .map((u) => String(u || '').trim())
    .filter(Boolean)
    .slice(0, MAX_URLS);
  const out = [];
  for (const u of list) {
    /** @type {{ url: string, text: string, error?: string }} */
    const one = await fetchOneUrl(u, MAX_REDIRECTS);
    out.push(one);
  }
  return out;
}

module.exports = {
  fetchUrlsPlainText,
  MAX_URLS,
  isAllowedPublicUrl
};
