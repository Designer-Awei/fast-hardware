/**
 * @fileoverview Skill：连线编辑（wiring_edit_skill）
 *
 * 入参为当前画布 JSON（可与 `generateCircuitConfig` 对齐）+ 连线规则；引擎内 LLM 生成**仅含连线**的修改计划，
 * 可选应用到画布（add_connection / remove_connection）。不增删、不移动元件。
 */

const NAME = 'wiring_edit_skill';

const { buildSchemeFollowupInjectionFromEngine } = require('../../scheme-design-followup-context.js');

/**
 * @returns {import('../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '画布连线：以 **wiringRules + 画布** 为主即可；方案设计/BOM **不必需**（前序有则**可能**自动附参考摘要，可忽略）。expectedComponentsFromAgent 可选。可选 applyToCanvas。',
    inputSchema: {
      type: 'object',
      properties: {
        canvasSnapshot: {
          type: 'object',
          description:
            '画布状态 JSON（与 generateCircuitConfig 类似）；可省略则由引擎从 window.app 读取当前画布'
        },
        wiringRules: { type: 'string', description: '连线规则或自然语言指令（必填）' },
        expectedComponentsFromAgent: {
          type: 'string',
          description:
            '可选。元件摘要；留空时若引擎内仍有前序方案状态会自动填一行参考（可无，不影响仅凭描述+画布连线）'
        },
        additionalContextFromAgent: { type: 'string', description: '可选补充上下文' },
        applyToCanvas: {
          type: 'boolean',
          description: '是否将 plannedOperations 应用到画布，默认 true；仅要方案/理由时可 false'
        },
        skipLlmPlan: {
          type: 'boolean',
          description:
            '为 true 时跳过 LLM，直接使用 agent 传入的 plannedOperations（须与 operations 字段二选一配合）'
        },
        plannedOperations: {
          type: 'array',
          description: '当 skipLlmPlan=true 时，直接作为待应用或待返回的连线操作列表'
        }
      },
      required: ['wiringRules']
    },
    outputSchema: {
      type: 'object',
      properties: {
        rationale: { type: 'string' },
        plannedOperations: { type: 'array' },
        canvasApply: { type: 'object' },
        canvasVsScheme: { type: 'string' },
        missingPartsSummary: { type: 'array' },
        userFollowUpHint: { type: 'string' },
        canvasStructureAnalysis: { type: 'object' },
        schemeContextAutoInjected: { type: 'boolean', description: '是否注入了前序方案/BOM 参考块' },
        autoFilledExpectedComponents: { type: 'boolean', description: '是否自动填充了 expected 摘要' }
      }
    },
    tags: ['wiring']
  };
}

/**
 * @param {any} args
 * @param {import('../../index').WorkflowSkillContext} ctx
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function execute(args, ctx) {
  const engine = ctx?.skillsEngine;
  if (!engine) {
    return { success: false, error: 'skillsEngine 不可用' };
  }

  const rules = String(args?.wiringRules || '').trim();
  if (!rules) {
    return { success: false, error: 'wiringRules 不能为空' };
  }

  const extraRaw = String(args?.additionalContextFromAgent || '').trim();
  let expectedComponentsFromAgent = String(args?.expectedComponentsFromAgent || '').trim();
  const applyToCanvas = args?.applyToCanvas !== false;

  const schemeInject = await buildSchemeFollowupInjectionFromEngine(engine);
  let extra = extraRaw;
  if (schemeInject.textBlock) {
    extra = extra ? `${schemeInject.textBlock}\n\n${extra}` : schemeInject.textBlock;
  }
  let autoFilledExpected = false;
  if (!expectedComponentsFromAgent && schemeInject.expectedComponentsOneLiner) {
    expectedComponentsFromAgent = schemeInject.expectedComponentsOneLiner;
    autoFilledExpected = true;
  }

  let snapshot =
    args?.canvasSnapshot ||
    ctx?.canvasSnapshot ||
    (typeof engine.getCanvasSnapshotForSkill === 'function' ? engine.getCanvasSnapshotForSkill() : null);

  if (!snapshot || typeof snapshot !== 'object') {
    snapshot = { components: [], connections: [] };
  }

  /** @type {{ rationale: string, plannedOperations: any[], parseError?: string, raw?: string }} */
  let plan;

  if (args?.skipLlmPlan === true && Array.isArray(args?.plannedOperations)) {
    plan = {
      rationale: String(args?.rationaleFromAgent || '由代理直接提供 plannedOperations').trim(),
      plannedOperations: args.plannedOperations
    };
  } else {
    if (typeof engine.runWiringEditPlan !== 'function') {
      return { success: false, error: 'skillsEngine.runWiringEditPlan 不可用' };
    }
    plan = await engine.runWiringEditPlan(snapshot, rules, extra, {
      expectedComponentsHint: expectedComponentsFromAgent
    });
  }

  let canvasApply = null;
  if (applyToCanvas && Array.isArray(plan.plannedOperations) && plan.plannedOperations.length > 0) {
    if (typeof engine.applyWiringEditOperations !== 'function') {
      return { success: false, error: 'skillsEngine.applyWiringEditOperations 不可用' };
    }
    canvasApply = await engine.applyWiringEditOperations({ operations: plan.plannedOperations });
  }

  return {
    success: true,
    data: {
      rationale: plan.rationale,
      plannedOperations: plan.plannedOperations || [],
      canvasApply,
      parseError: plan.parseError,
      usedCanvasSnapshot: snapshot,
      canvasVsScheme: plan.canvasVsScheme,
      missingPartsSummary: plan.missingPartsSummary,
      userFollowUpHint: plan.userFollowUpHint,
      canvasStructureAnalysis: plan.canvasStructureAnalysis,
      schemeContextAutoInjected: schemeInject.hasSchemeContext,
      autoFilledExpectedComponents: autoFilledExpected
    }
  };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
