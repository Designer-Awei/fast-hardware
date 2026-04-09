/**
 * @fileoverview 【第三层】历史扁平脚本备份：`skills/skills/scheme-design.js`。
 */

/**
 * @fileoverview Skill：方案设计（scheme_design_skill，含 BOM/库匹配）
 *
 * 模块级**初步方案**：`runSchemeDesign` + `runRequirementAnalysis`，输出方案摘要、估算参数、
 * **与当前元件库的匹配结果**（可复用 `matchedKey`）及**建议补全项**（exists=0 时的 recommendation，仅文本）。
 * **不**自动生成或落盘元件 JSON。Agent 侧宜 **优先** 调用本 skill 再按需 `completion_suggestion_skill` / `web_search_exa`。引擎内可据 `webSearchQueries` 拉 Exa；强实时事实也可由 agent 先 `web_search_exa`。
 */

const NAME = 'scheme_design_skill';

/**
 * @returns {import('../../../index').SkillDefinition}
 */
function getManifest() {
  return {
    name: NAME,
    description:
      '**建议 agent 对电路类需求优先调用**：方案骨架 + **BOM 与系统元件库匹配**（库内可复用 id、缺件及文字建议）。' +
      '**不**自动创建元件文件；缺具体型号时再调 completion_suggestion_skill，必要时 web_search_exa。引擎内可据 webSearchQueries 拉 Exa。',
    inputSchema: {
      type: 'object',
      properties: {
        userRequirement: { type: 'string', description: '用户原始需求（必填）' },
        additionalContextFromAgent: {
          type: 'string',
          description:
            '可选：前序 tool 结果或摘要，拼入需求文本供方案设计 LLM 参考（如已执行的 web_search_exa 要点）'
        },
        runBomAnalysis: {
          type: 'boolean',
          description: '是否在本 skill 内继续执行库匹配与 BOM 分析（默认 true）；仅要方案骨架时可设 false'
        }
      },
      required: ['userRequirement']
    },
    outputSchema: {
      type: 'object',
      properties: {
        schemeDesignResult: { type: 'object' },
        analysisResult: { type: 'object', description: '含 components[]、summary；runBomAnalysis=false 时为 null' },
        summary: { type: 'string' },
        estimatedParams: { type: 'object' },
        narrative: { type: 'string' },
        webSearchQueries: { type: 'array' },
        webSearchReferenceText: { type: 'string' }
      }
    },
    tags: ['analysis']
  };
}

/**
 * @param {string} base
 * @param {string} [extra]
 * @returns {string}
 */
function mergeRequirementText(base, extra) {
  const b = String(base || '').trim();
  const e = String(extra || '').trim();
  if (!e) return b;
  return `${b}\n\n【代理补充上下文】\n${e}`;
}

/**
 * 主进程代理上可能仅有异步 `getCurrentSkillState`，与旧版同步 `currentSkillState` 兼容
 * @param {any} engine
 * @returns {Promise<unknown>}
 */
async function readSkillState(engine) {
  if (engine && typeof engine.getCurrentSkillState === 'function') {
    return await engine.getCurrentSkillState();
  }
  return engine?.currentSkillState;
}

/**
 * @param {any} args
 * @param {import('../../../index').WorkflowSkillContext} ctx
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function execute(args, ctx) {
  const raw = String(args?.userRequirement || ctx?.userRequirement || '').trim();
  if (!raw) {
    return { success: false, error: 'userRequirement 不能为空' };
  }

  const userRequirement = mergeRequirementText(raw, args?.additionalContextFromAgent);

  const engine = ctx.skillsEngine;
  if (!engine || typeof engine.runSchemeDesign !== 'function') {
    return { success: false, error: 'skillsEngine.runSchemeDesign 不可用' };
  }

  let schemeDesignResult;
  try {
    schemeDesignResult = await engine.runSchemeDesign(userRequirement);
  } catch (e) {
    const msg = e?.message || String(e);
    return {
      success: false,
      error: `runSchemeDesign 失败: ${msg}`,
      data: { schemeDesignResult: null, analysisResult: null, skillState: await readSkillState(engine) }
    };
  }

  const runBom = args?.runBomAnalysis !== false;
  let analysisResult = null;
  if (runBom && typeof engine.runRequirementAnalysis === 'function') {
    try {
      analysisResult = await engine.runRequirementAnalysis(userRequirement, schemeDesignResult);
    } catch (e) {
      const msg = e?.message || String(e);
      return {
        success: false,
        error: `runRequirementAnalysis 失败: ${msg}`,
        data: {
          schemeDesignResult,
          analysisResult: null,
          skillState: await readSkillState(engine),
          bomFailed: true
        }
      };
    }
  }

  return {
    success: true,
    data: {
      schemeDesignResult,
      analysisResult,
      skillState: await readSkillState(engine)
    }
  };
}

module.exports = {
  NAME,
  getManifest,
  execute
};
