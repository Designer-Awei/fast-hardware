/**
 * Fast Hardware - Circuit Skills Adapter
 *
 * 作用：
 * - 把现有 `scripts/workflow-circuit.js`（CircuitSkillsEngine）里的核心能力封装成 skills executor
 * - 让后续 Skill Orchestrator 可以直接调度这些 executor，而不依赖 UI 按钮链路
 *
 * 注意：
 * - 当前 skills 执行仍在渲染层（依赖 window.electronAPI / webSearchExa / saveComponent）
 * - 但“skills 化的数据输入/输出”会保持稳定，后续迁移到 main 时可替换底层实现
 */

const { SKILL_NAMES } = require('./registry');

/**
 * @typedef {Object} WorkflowSkillContext
 * @property {any} skillsEngine - CircuitSkillsEngine 实例
 * @property {string} userRequirement - 用户需求原文（用于部分 skill 内建上下文）
 * @property {any} [schemeDesignResult]
 * @property {any} [analysisResult]
 */

/**
 * @typedef {Object} SkillExecutorResult
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [error]
 */

/**
 * scheme_design_skill executor
 * @param {any} args
 * @param {WorkflowSkillContext} ctx
 * @returns {Promise<SkillExecutorResult>}
 */
async function schemeDesignSkill(args, ctx) {
  const userRequirement = String(args?.userRequirement || ctx?.userRequirement || '').trim();
  if (!userRequirement) {
    return { success: false, error: 'userRequirement 不能为空' };
  }

  const engine = ctx.skillsEngine;
  const result = await engine.runSchemeDesign(userRequirement);
  return { success: true, data: { schemeDesignResult: result, skillState: engine.currentSkillState } };
}

/**
 * requirement_analysis_skill executor
 * @param {any} args
 * @param {WorkflowSkillContext} ctx
 * @returns {Promise<SkillExecutorResult>}
 */
async function requirementAnalysisSkill(args, ctx) {
  const userRequirement = String(args?.userRequirement || ctx?.userRequirement || '').trim();
  const schemeDesignResult =
    args?.schemeDesignResult ||
    ctx?.schemeDesignResult ||
    ctx?.skillsEngine?.currentSkillState?.schemeDesignResult;

  if (!userRequirement) {
    return { success: false, error: 'userRequirement 不能为空' };
  }

  const engine = ctx.skillsEngine;
  const analysisResult = await engine.runRequirementAnalysis(userRequirement, schemeDesignResult);
  return { success: true, data: { analysisResult, skillState: engine.currentSkillState } };
}

/**
 * component_autocomplete_validated_skill executor
 * - 复用现有 skills 引擎中的 generate-validate-retry 与 pin 参数校验逻辑
 *
 * @param {any} args
 * @param {WorkflowSkillContext} ctx
 * @returns {Promise<SkillExecutorResult>}
 */
async function componentAutocompleteValidatedSkill(args, ctx) {
  const skillsEngine = ctx.skillsEngine;
  const analysisResult = args?.analysisResult || ctx?.analysisResult || skillsEngine?.currentSkillState?.analysisResult;
  if (!analysisResult || !Array.isArray(analysisResult.components)) {
    return { success: false, error: 'analysisResult.components 不存在' };
  }

  const missingComponents =
    Array.isArray(args?.missingComponents)
      ? args.missingComponents
      : analysisResult.components.filter(c => c.exists === 0);

  if (missingComponents.length === 0) {
    return { success: true, data: { createdComponents: [], updatedAnalysisResult: analysisResult, missingComponents: [] } };
  }

  const createdComponents = await skillsEngine.autoCompleteComponents(missingComponents);

  // 让 analysisResult 直接反映生成结果（对齐 chat.js 旧逻辑）
  for (const created of createdComponents || []) {
    if (!created?.componentKey) continue;

    const analysisComponent = created?.analysisComponent || {};
    const nameToFind = analysisComponent?.name || created?.name;
    const typeToFind = analysisComponent?.type || created?.type;

    const comp = analysisResult.components.find(
      c =>
        c &&
        c.exists === 0 &&
        (typeToFind ? c.type === typeToFind : true) &&
        (nameToFind ? c.name === nameToFind : true)
    );

    if (comp) {
      comp.exists = 1;
      comp.matchedKey = created.componentKey;
    }
  }

  return {
    success: true,
    data: {
      createdComponents,
      updatedAnalysisResult: analysisResult,
      missingComponents
    }
  };
}

/**
 * structured_wiring_skill executor（当前为占位/最小可用）
 * @param {any} _args
 * @param {WorkflowSkillContext} _ctx
 * @returns {Promise<SkillExecutorResult>}
 */
async function structuredWiringSkill(_args, _ctx) {
  return { success: true, data: { wiring: 'placeholder' } };
}

/**
 * web_search_exa executor
 * @param {any} args
 * @param {WorkflowSkillContext} ctx
 * @returns {Promise<SkillExecutorResult>}
 */
async function webSearchExaSkill(args, ctx) {
  const query = String(args?.query || '').trim();
  const numResults = typeof args?.numResults === 'number' ? args.numResults : 5;
  const type = args?.type || 'fast';
  if (!query) return { success: false, error: 'query 不能为空' };

  const engine = ctx.skillsEngine;
  const result = await engine.webSearchExa(query, { numResults, type });
  return { success: !!result.success, data: result };
}

/**
 * 组装 skillExecutors
 * @param {any} skillsEngine
 * @param {(partialCtx: Partial<WorkflowSkillContext>) => WorkflowSkillContext} buildCtx - 构造 ctx 的函数
 * @returns {Record<string, (args:any, execCtx:any) => Promise<any>>}
 */
function buildWorkflowSkillExecutors(skillsEngine, buildCtx) {
  const buildCompatCtx = (partialCtx) => {
    const ctx = buildCtx(partialCtx || { userRequirement: '' }) || {};
    ctx.skillsEngine = ctx.skillsEngine || skillsEngine;
    return ctx;
  };

  return {
    [SKILL_NAMES.SCHEME_DESIGN]: async (args, execCtx) => schemeDesignSkill(args, buildCompatCtx(execCtx || { userRequirement: '' })),
    [SKILL_NAMES.REQUIREMENT_ANALYSIS]: async (args, execCtx) => requirementAnalysisSkill(args, buildCompatCtx(execCtx || { userRequirement: '' })),
    [SKILL_NAMES.COMPONENT_AUTOCOMPLETE_VALIDATED]: async (args, execCtx) => componentAutocompleteValidatedSkill(args, buildCompatCtx(execCtx || { userRequirement: '' })),
    [SKILL_NAMES.STRUCTURED_WIRING]: async (args, execCtx) => structuredWiringSkill(args, buildCompatCtx(execCtx || { userRequirement: '' })),
    [SKILL_NAMES.WEB_SEARCH_EXA]: async (args, execCtx) => webSearchExaSkill(args, buildCompatCtx(execCtx || { userRequirement: '' }))
  };
}

module.exports = {
  buildWorkflowSkillExecutors,
  schemeDesignSkill,
  requirementAnalysisSkill,
  componentAutocompleteValidatedSkill,
  structuredWiringSkill,
  webSearchExaSkill
};

