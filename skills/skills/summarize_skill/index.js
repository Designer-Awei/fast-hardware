/**
 * @fileoverview Skill：长文 / 检索结果 / 可选 URL 正文摘要（summarize_skill）
 *
 * - **与 `web_search_exa` 搭配**：可将检索结果的 title/snippet/url 拼入 `text`，或对公开 **urls** 由主进程抓取正文后再摘要。
 * - 实现：应用内 LLM（`runSummarizeText`），不依赖外部 summarize CLI。
 */

const { fetchUrlsPlainText } = require('../../../scripts/skills/fetch-url-plaintext.js');

const NAME = 'summarize_skill';

/**
 * @returns {import('../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '**web_search_exa 的常见后续**：把检索结果（title/snippet/url）或长文贴入 **text** 做结构化中文摘要（总述+要点）；也可传 **urls**（http/https，应用抓取公开页面正文再摘要）。' +
      '与联网检索互补：先搜后压、或压长页面。可选 **length**（short|medium|long）、**focus**。',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            '待摘要正文：可为对话摘录、日志，或 **web_search_exa** 返回的 results 拼接（建议含 url 以便核对）。与 urls 至少填一类。'
        },
        urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            '可选：1～5 个 http(s) 链接；主进程顺序抓取正文后与 text 合并再摘要（登录墙/反爬可能失败，请保留 text 作兜底）'
        },
        length: {
          type: 'string',
          enum: ['short', 'medium', 'long'],
          description: '可选：摘要篇幅，默认 medium'
        },
        focus: { type: 'string', description: '可选：侧重主题或约束' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } }
      }
    },
    tags: ['text', 'summary', 'web']
  };
}

/**
 * @param {any} args
 * @param {import('../../index').WorkflowSkillContext} ctx
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function execute(args, ctx) {
  const engine = ctx?.skillsEngine;
  if (!engine || typeof engine.runSummarizeText !== 'function') {
    return { success: false, error: 'skillsEngine.runSummarizeText 不可用' };
  }

  let text = String(args?.text ?? '').trim();
  const urls = Array.isArray(args?.urls)
    ? args.urls.map((u) => String(u || '').trim()).filter(Boolean)
    : [];

  if (urls.length) {
    const fetched = await fetchUrlsPlainText(urls);
    const blocks = fetched
      .map((p) => {
        if (p.error) {
          return `### ${p.url}\n（抓取失败：${p.error}）`;
        }
        return `### ${p.url}\n${p.text}`;
      })
      .join('\n\n');
    text = text ? `${text}\n\n【页面正文摘录】\n${blocks}` : `【页面正文摘录】\n${blocks}`;
  }

  if (!text.trim()) {
    return {
      success: false,
      error:
        '请在 text 中提供正文（可将 web_search_exa 的 results 摘要粘贴进来），或提供可访问的 http(s) urls'
    };
  }

  const length = args?.length;
  const focus = String(args?.focus ?? '').trim();
  /** @type {{ length?: 'short'|'medium'|'long', focus?: string }} */
  const options = {};
  if (length === 'short' || length === 'medium' || length === 'long') {
    options.length = length;
  }
  if (focus) {
    options.focus = focus;
  }

  const out = await engine.runSummarizeText(text, options);
  return { success: true, data: out };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
