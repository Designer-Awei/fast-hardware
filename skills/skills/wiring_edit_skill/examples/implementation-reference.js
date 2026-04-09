/**
 * @fileoverview 【第三层】历史扁平脚本备份：`skills/skills/wiring-edit.js`。
 */

/**
 * @fileoverview Skill：连线编辑（wiring_edit_skill）
 *
 * 入参为当前画布 JSON（可与 `generateCircuitConfig` 对齐）+ 连线规则；引擎内 LLM 生成**仅含连线**的修改计划，
 * 可选应用到画布（add_connection / remove_connection）。不增删、不移动元件。
 */

const NAME = 'wiring_edit_skill';

/**
 * @returns {import('../../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '根据**当前画布 JSON**与**连线规则/意图**，生成连线增删**计划**（rationale + plannedOperations）；' +
      '可选 applyToCanvas 将计划应用到画布。仅允许 add_connection / remove_connection；instanceId、pinId 须对应画布上已有元件。',
    inputSchema: {
      type: 'object',
      properties: {
        canvasSnapshot: {
          type: 'object',
          description:
            '画布状态 JSON（与 generateCircuitConfig 类似）；可省略则由引擎从 window.app 读取当前画布'
        },
        wiringRules: { type: 'string', description: '连线规则或自然语言指令（必填）' },
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
        canvasApply: { type: 'object' }
      }
    },
    tags: ['wiring']
  };
}

/**
 * @param {any} args
 * @param {import('../../../index').WorkflowSkillContext} ctx
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

  const extra = String(args?.additionalContextFromAgent || '').trim();
  const applyToCanvas = args?.applyToCanvas !== false;

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
    const expectedHint = String(args?.expectedComponentsFromAgent || '').trim();
    plan = await engine.runWiringEditPlan(snapshot, rules, extra, {
      expectedComponentsHint: expectedHint
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
      usedCanvasSnapshot: snapshot
    }
  };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
