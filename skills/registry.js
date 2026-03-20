/**
 * Fast Hardware - Skill Registry
 * 说明：
 * - 这里定义“skills 的语义与 schema”，用于：
 *   1) 在 Orchestrator 里把可用 skills 注入给 LLM
 *   2) 在解析 tool_calls 时做参数结构校验（轻量）
 * - 具体 skills 的执行逻辑（execute）在后续 orchestrator 集成时再接入。
 */

const SKILL_NAMES = Object.freeze({
  WEB_SEARCH_EXA: 'web_search_exa',
  SCHEME_DESIGN: 'scheme_design_skill',
  REQUIREMENT_ANALYSIS: 'requirement_analysis_skill',
  COMPONENT_AUTOCOMPLETE_VALIDATED: 'component_autocomplete_validated_skill',
  STRUCTURED_WIRING: 'structured_wiring_skill'
});

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
 * 最小 JSON Schema 约束：用于 LLM 输出解析时的结构性校验。
 * 注意：这里的 JSON Schema 不引入依赖库，后续可用 Ajv 等再升级。
 * @returns {Record<string, JsonSchema>}
 */
function buildSchemas() {
  return {
    webSearchExaInput: {
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
    webSearchExaOutput: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        results: { type: 'array', description: '搜索结果数组' },
        error: { type: 'string' }
      }
    },
    schemeDesignInput: {
      type: 'object',
      properties: {
        userRequirement: { type: 'string' }
      },
      required: ['userRequirement']
    },
    schemeDesignOutput: {
      type: 'object',
      properties: {
        summary: { type: 'string' }
      }
    }
  };
}

/**
 * @returns {SkillDefinition[]}
 */
function getSkillDefinitions() {
  const schemas = buildSchemas();

  /** @type {SkillDefinition[]} */
  const skills = [
    {
      name: SKILL_NAMES.WEB_SEARCH_EXA,
      description: '联网检索资料（Exa via MCP），用于补齐引脚/参数证据。',
      inputSchema: schemas.webSearchExaInput,
      outputSchema: schemas.webSearchExaOutput,
      tags: ['web']
    },
    {
      name: SKILL_NAMES.SCHEME_DESIGN,
      description: '把用户需求转成方案设计摘要与 estimatedParams，并准备后续需求分析上下文。',
      inputSchema: schemas.schemeDesignInput,
      outputSchema: schemas.schemeDesignOutput,
      tags: ['analysis']
    },
    {
      name: SKILL_NAMES.REQUIREMENT_ANALYSIS,
      description: '从方案中推导理论元件列表，并与系统元件库进行模糊匹配（输出 exists/matchedKey）。',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      tags: ['analysis']
    },
    {
      name: SKILL_NAMES.COMPONENT_AUTOCOMPLETE_VALIDATED,
      description: '对缺失元件进行生成-校验-重试（最多 3 次）；成功落盘，失败返回 failed（不强制落盘）。',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      tags: ['component']
    },
    {
      name: SKILL_NAMES.STRUCTURED_WIRING,
      description: '生成结构化连线 JSON（当前版本可为占位/最小可用）。',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      tags: ['wiring']
    }
  ];

  return skills;
}

/**
 * 给 LLM 的 skills 列表（尽量精简、便于 token 控制）。
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
  getSkillDefinitions,
  listSkillsForLLM
};

