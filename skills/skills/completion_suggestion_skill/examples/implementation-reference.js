/**
 * @fileoverview 【第三层】历史扁平脚本备份：`skills/skills/completion-suggestion.js`。
 */

/**
 * @fileoverview Skill：补全建议（completion_suggestion_skill）
 *
 * 将「声音传感器、舵机」等模糊描述转为**可采购的模块级型号**文本建议；不生成元件 JSON、不落盘。
 * 可先调用 web_search_exa 将检索摘要传入 additionalContextFromAgent。
 */

const NAME = 'completion_suggestion_skill';

/**
 * @returns {import('../../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '针对模糊器件描述（如声音传感器、舵机、充电模块）输出**具体模块型号/商品常见名**（如 KY-038、SG90、TP4056模块）；' +
      '仅文本建议，不自动创建元件文件。可与 web_search_exa 配合。',
    inputSchema: {
      type: 'object',
      properties: {
        userRequirement: { type: 'string', description: '用户整体需求语境（必填）' },
        missingDescriptions: {
          oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
          description: '缺失或模糊元件描述：字符串数组，或逗号/分号分隔的单个字符串'
        },
        additionalContextFromAgent: {
          type: 'string',
          description: '可选：前序 web_search_exa 等工具结果的简要摘录'
        }
      },
      required: ['userRequirement', 'missingDescriptions']
    },
    outputSchema: {
      type: 'object',
      properties: {
        suggestions: { type: 'array' },
        summary: { type: 'string' }
      }
    },
    tags: ['sourcing']
  };
}

/**
 * @param {any} args
 * @param {import('../../../index').WorkflowSkillContext} ctx
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function execute(args, ctx) {
  const engine = ctx?.skillsEngine;
  if (!engine || typeof engine.runCompletionSuggestions !== 'function') {
    return { success: false, error: 'skillsEngine.runCompletionSuggestions 不可用' };
  }

  const userRequirement = String(args?.userRequirement || ctx?.userRequirement || '').trim();
  if (!userRequirement) {
    return { success: false, error: 'userRequirement 不能为空' };
  }

  const missing = args?.missingDescriptions;
  if (
    missing == null ||
    (Array.isArray(missing) && missing.length === 0) ||
    (typeof missing === 'string' && !missing.trim())
  ) {
    return { success: false, error: 'missingDescriptions 不能为空' };
  }

  const extra = String(args?.additionalContextFromAgent || '').trim();
  const out = await engine.runCompletionSuggestions(userRequirement, missing, extra);
  return { success: true, data: out };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
