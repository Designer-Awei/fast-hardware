/**
 * @fileoverview 【第三层】历史扁平脚本备份：`skills/skills/web-search-exa.js`（迁移前布局）；执行入口见上级 `../index.js`。
 */

/** @type {string} 与 tool_calls.skillName 完全一致 */
const NAME = 'web_search_exa';

/**
 * @returns {import('../../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '联网检索（Exa）。skillName 必须为 web_search_exa。非每项任务必调：仅在依赖实时信息或外部知识（价格/现货/天气/新闻/经验等）时调用；复杂链路（需求分析、元件生成与校验、方案论证等）若需补充上下文或佐证，宜调用后再配合其他 skills。返回 title/url/snippet。用过检索后总结须用 Markdown [显示名](完整url)，url 逐字来自 results[].url。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
        numResults: { type: 'number', minimum: 1, maximum: 10, description: '返回条数' },
        type: {
          type: 'string',
          enum: ['auto', 'fast', 'deep'],
          description: '检索模式'
        }
      },
      required: ['query']
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        results: { type: 'array', description: '搜索结果数组' },
        error: { type: 'string' }
      }
    },
    tags: ['web']
  };
}

/**
 * @param {any} args
 * @param {import('../../../index').WorkflowSkillContext} ctx
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function execute(args, ctx) {
  /** 与渲染层 agent 一致：未传 query 时用当前对话用户需求作检索词 */
  const query = String(args?.query || ctx?.userRequirement || '').trim();
  const numResults = typeof args?.numResults === 'number' ? args.numResults : 5;
  const type = args?.type || 'fast';
  if (!query) {
    return { success: false, error: 'query 不能为空' };
  }

  const engine = ctx.skillsEngine;
  if (!engine || typeof engine.webSearchExa !== 'function') {
    return { success: false, error: 'skillsEngine.webSearchExa 不可用' };
  }
  const result = await engine.webSearchExa(query, { numResults, type });
  return { success: !!result.success, data: result };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
