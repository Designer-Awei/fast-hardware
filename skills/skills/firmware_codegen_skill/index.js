/**
 * @fileoverview Skill：固件代码编辑（firmware_codegen_skill）
 * 基于用户需求与现有代码上下文生成结构化 patch 建议，默认不直接落盘。
 */

const NAME = 'firmware_codegen_skill';

const { buildSchemeFollowupInjectionFromEngine } = require('../../scheme-design-followup-context.js');

/**
 * @returns {import('../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '结合画布与（可选）现有代码输出可审阅 patch；**已有工程/.ino 时语义为更新固件**（非空项目从零生成）。先结构预判：空画布/缺连线时骨架或初步 patch，就绪时尽量引脚级；含 canvasGuidance；默认不落盘。',
    inputSchema: {
      type: 'object',
      properties: {
        userRequirement: { type: 'string', description: '固件改动目标（必填）' },
        codeText: { type: 'string', description: '当前代码全文（可选）' },
        targetPath: { type: 'string', description: '目标文件路径（可选）' },
        language: { type: 'string', description: '语言标识，默认 arduino' },
        additionalContextFromAgent: { type: 'string', description: '补充上下文（可选）' },
        canvasSnapshot: { type: 'object', description: '可选画布 JSON；省略时由引擎读取当前项目画布' }
      },
      required: ['userRequirement']
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        patchPlan: { type: 'array' },
        patch: { type: 'string' },
        notes: { type: 'array' },
        parseError: { type: 'string' },
        canvasAnalysis: { type: 'object', description: '程序计算的画布结构预判' },
        canvasGuidance: { type: 'object', description: '给用户的阶段引导与 pinBindings' },
        schemeContextAutoInjected: { type: 'boolean', description: '是否注入了前序方案/BOM 参考块' }
      }
    },
    tags: ['firmware', 'codegen']
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
  if (typeof engine.runFirmwareCodePatch !== 'function') {
    return { success: false, error: 'skillsEngine.runFirmwareCodePatch 不可用' };
  }

  const userRequirement = String(args?.userRequirement || ctx?.userRequirement || '').trim();
  if (!userRequirement) {
    return { success: false, error: 'userRequirement 不能为空' };
  }

  const codeText = typeof args?.codeText === 'string' ? args.codeText : '';
  const targetPath = String(args?.targetPath || '').trim();
  const language = String(args?.language || 'arduino').trim() || 'arduino';
  let additionalContext = String(args?.additionalContextFromAgent || '').trim();
  const schemeInject = await buildSchemeFollowupInjectionFromEngine(engine);
  if (schemeInject.textBlock) {
    additionalContext = additionalContext
      ? `${schemeInject.textBlock}\n\n${additionalContext}`
      : schemeInject.textBlock;
  }

  /**
   * 画布来源优先级：模型显式 args > 渲染进程实时快照（IPC）> 主进程 ctx（可能为对话轮初始快照，已过时）。
   * @type {unknown}
   */
  let canvasSnapshot =
    args?.canvasSnapshot !== undefined && args?.canvasSnapshot !== null ? args.canvasSnapshot : undefined;
  if (canvasSnapshot === undefined && typeof engine.getCanvasSnapshotForSkill === 'function') {
    canvasSnapshot = await Promise.resolve(engine.getCanvasSnapshotForSkill());
  }
  if (canvasSnapshot == null && ctx?.canvasSnapshot != null) {
    canvasSnapshot = ctx.canvasSnapshot;
  }

  const out = await engine.runFirmwareCodePatch(userRequirement, codeText, {
    targetPath,
    language,
    additionalContextFromAgent: additionalContext,
    canvasSnapshot
  });

  return {
    success: true,
    data: {
      summary: String(out?.summary || '').trim(),
      patchPlan: Array.isArray(out?.patchPlan) ? out.patchPlan : [],
      patch: String(out?.patch || '').trim(),
      notes: Array.isArray(out?.notes) ? out.notes : [],
      parseError: out?.parseError,
      targetPath: out?.targetPath || targetPath || '(memory)',
      language: out?.language || language,
        canvasAnalysis: out?.canvasAnalysis,
        canvasGuidance: out?.canvasGuidance,
        schemeContextAutoInjected: schemeInject.hasSchemeContext
    }
  };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
