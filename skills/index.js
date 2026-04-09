/**
 * Skills 执行器共享上下文（文档用；运行时无状态，各 skill 通过 JSDoc 引用本模块类型）。
 *
 * @typedef {Object} WorkflowSkillContext
 * @property {any} skillsEngine - CircuitSkillsEngine 实例
 * @property {string} [userRequirement] - 用户需求原文
 * @property {any} [schemeDesignResult] - 方案设计中间态
 * @property {any} [analysisResult] - BOM/库匹配结果
 * @property {any} [canvasSnapshot] - 可选：显式传入的画布 JSON（wiring_edit_skill）
 * @property {any} [completionSuggestions] - completion_suggestion 写入（可选）
 * @property {any} [wiringEditPlan] - 连线计划（可选）
 * @property {any} [summarizeResult] - summarize_skill 写入（可选）
 *
 * 注：若有前序 scheme/BOM 状态，`scheme-design-followup-context.js` **可选地**向连线/固件多塞一段参考；**没有也完全正常**，仅靠 userRequirement + 画布即可。
 */

/**
 * @typedef {Object} JsonSchema
 * @property {string} type
 * @property {Object<string, JsonSchema>} [properties]
 * @property {string[]} [required]
 * @property {string[]} [enum]
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {string} [description]
 */

/**
 * @typedef {Object} SkillDefinition
 * @property {string} name
 * @property {string} description
 * @property {JsonSchema} inputSchema
 * @property {JsonSchema} outputSchema
 * @property {string[]} [tags]
 */

/**
 * Fast Hardware - Skills 聚合入口（位于 `skills/` 根目录）
 *
 * `skills/skills/<skillId>/` 为单 skill 包（`SKILL.md` + `index.js` + 可选 `examples/`）；本文件维护注册表、`listSkillsForLLM` 与顺序导出。
 * 产品策略：**全量挂载**可用 skills（规模预期小于约 100），不按场景拆类，避免复杂任务漏选工具。
 *
 * **单源**：仅加载本仓库 **`skills/skills/<skillId>/`**，不再合并用户目录或其它路径。
 */

'use strict';

const path = require('path');
const { loadSkillModules } = require('./skill-module-loader');

const bundledSkillsDir = path.join(__dirname, 'skills');

/**
 * 与 LLM 注入顺序一致（稳定排序：`skills/skills` 下文件夹名字母序）。
 * @type {ReadonlyArray<{ NAME: string, getManifest: () => object, execute: Function }>}
 */
const SKILL_MODULES = loadSkillModules(bundledSkillsDir);

/** @type {Readonly<Record<string, string>>} 内置 skill 的短枚举键，兼容旧代码；其余 skill 动态生成键名 */
const LEGACY_ENUM_KEYS = Object.freeze({
  web_search_exa: 'WEB_SEARCH_EXA',
  scheme_design_skill: 'SCHEME_DESIGN',
  completion_suggestion_skill: 'COMPLETION_SUGGESTION',
  wiring_edit_skill: 'WIRING_EDIT',
  summarize_skill: 'SUMMARIZE'
});

/**
 * @returns {string}
 */
function enumKeyForSkillName(name) {
  if (LEGACY_ENUM_KEYS[name]) {
    return LEGACY_ENUM_KEYS[name];
  }
  const safe = String(name)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefix = safe ? `SKILL_${safe.toUpperCase()}` : 'SKILL_CUSTOM';
  return prefix;
}

/** @type {Readonly<Record<string, string>>} */
const SKILL_NAMES = Object.freeze(
  Object.fromEntries(SKILL_MODULES.map((m) => [enumKeyForSkillName(m.NAME), m.NAME]))
);

/**
 * @param {string} name - `NAME` 常量
 * @returns {(args: unknown, ctx: WorkflowSkillContext) => Promise<unknown>|unknown}
 */
function executeByName(name) {
  return (args, ctx) => {
    const mod = SKILL_MODULES.find((x) => x.NAME === name);
    if (!mod) {
      throw new Error(`[skills] 未注册 skill: ${name}`);
    }
    return mod.execute(args, ctx);
  };
}

/**
 * @returns {Array<{name: string, description: string, inputSchema: object, outputSchema: object, tags?: string[]}>}
 */
function getSkillDefinitions() {
  return SKILL_MODULES.map((m) => m.getManifest());
}

/**
 * 给 LLM 的 skills 列表（全量挂载；描述与 schema 由各 skill 文件维护）。
 * @returns {{name: string, description: string, inputSchema: JsonSchema, outputSchema: JsonSchema}[]}
 */
function listSkillsForLLM() {
  return getSkillDefinitions().map((s) => ({
    name: s.name,
    description: s.description,
    inputSchema: s.inputSchema,
    outputSchema: s.outputSchema
  }));
}

module.exports = {
  SKILL_NAMES,
  SKILL_MODULES,
  getSkillDefinitions,
  listSkillsForLLM,
  /** @deprecated 请优先使用模块上的 execute；保留兼容旧 require 路径 */
  schemeDesignSkill: executeByName('scheme_design_skill'),
  completionSuggestionSkill: executeByName('completion_suggestion_skill'),
  wiringEditSkill: executeByName('wiring_edit_skill'),
  webSearchExaSkill: executeByName('web_search_exa'),
  summarizeSkill: executeByName('summarize_skill')
};
