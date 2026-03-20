/**
 * Fast Hardware - Skill Orchestrator (main side)
 *
 * 说明：
 * - 该模块实现“OpenClaw 风格”的 agent loop：
 *   1) LLM 输出 reasoning_steps + tool_calls（严格 JSON）
 *   2) orchestrator 逐个执行 tool_calls 对应的 skill executor
 *   3) 把 tool 结果回填给 LLM，直到拿到 final_message 或达到循环上限
 * - skill executor 的具体执行逻辑（web search / component generation 等）由外部依赖注入。
 */

const DEFAULT_MAX_ITERATIONS = 4;

/**
 * @typedef {Object} ToolCall
 * @property {string} skillName
 * @property {any} args
 * @property {string} [toolCallId]
 */

/**
 * @typedef {Object} SkillToolResult
 * @property {string} toolCallId
 * @property {string} skillName
 * @property {any} args
 * @property {any} result
 */

/**
 * @typedef {Object} AgentLoopProgressEvent
 * @property {'agent_step'|'tool_start'|'tool_end'|'tool_error'|'agent_final'} type
 * @property {any} payload
 */

/**
 * 尝试从大段文本中提取 JSON。
 * @param {string} text
 * @returns {any}
 */
function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();

  const fence = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```([\s\S]*?)```/);
  if (fence && fence[1]) {
    const candidate = fence[1].trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // heuristic: first {...} block
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 把 LLM 输出中的 tool_calls 规范化为数组。
 * @param {any} raw
 * @returns {ToolCall[]}
 */
function normalizeToolCalls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => x && typeof x === 'object')
      .map((x, idx) => ({
        toolCallId: String(x.toolCallId || x.id || `tool_${idx}`),
        skillName: String(x.skillName || x.name || ''),
        args: x.args ?? {}
      }))
      .filter((x) => x.skillName);
  }
  return [];
}

/**
 * @param {Object} params
 * @param {string} params.systemPrompt - orchestrator 的 system prompt
 * @param {string} params.userMessage - 用户消息（用于构造 prompt 的最后一段）
 * @param {Array<{role: string, content: string}>} params.chatHistory - 可选：上文消息
 * @param {any[]} params.reasoningAndToolsHistory - 可选：把上轮 reasoning_steps / tool results 作为上下文
 * @param {{name: string, description: string, inputSchema?: any, outputSchema?: any}[]} params.availableSkillsForLLM
 * @param {string} params.model
 * @param {(messages: Array<{role: string, content: string}>, model: string) => Promise<{success:boolean, content?:string, error?:string}>} params.callLLM
 * @param {Record<string, (args:any, ctx:any)=>Promise<any>>} params.skillExecutors
 * @param {(event: AgentLoopProgressEvent) => void} [params.onProgress]
 * @param {any} [params.ctx]
 * @param {number} [params.maxIterations]
 * @returns {Promise<{success:boolean, finalMessage?:string, toolResults: SkillToolResult[], raw?:any, error?:string}>}
 */
async function runAgentLoop(params) {
  const {
    systemPrompt,
    userMessage,
    chatHistory = [],
    reasoningAndToolsHistory = [],
    availableSkillsForLLM,
    model,
    callLLM,
    skillExecutors,
    onProgress,
    ctx,
    maxIterations = DEFAULT_MAX_ITERATIONS
  } = params;

  /** @type {SkillToolResult[]} */
  const toolResults = [];

  // Orchestrator: 每轮都要求严格 JSON 输出
  const skillsForPrompt = (availableSkillsForLLM || []).map((s) => ({
    name: s.name,
    description: s.description
  }));

  for (let iter = 0; iter < maxIterations; iter++) {
    const agentStep = iter + 1;
    onProgress?.({
      type: 'agent_step',
      payload: { iteration: agentStep, note: `开始 agent loop 第 ${agentStep} 轮` }
    });

    const toolResultsForLLM = toolResults.map((r) => ({
      toolCallId: r.toolCallId,
      skillName: r.skillName,
      args: r.args,
      result: r.result
    }));

    const prompt = [
      systemPrompt,
      '',
      '可用 skills（仅供 LLM 决策调用；skill 的参数必须按 inputSchema 提供）:',
      JSON.stringify(skillsForPrompt, null, 2),
      '',
      '上文对话（chatHistory）:',
      chatHistory.length ? JSON.stringify(chatHistory, null, 2) : '[]',
      '',
      '历史 reasoning / tool results（用于连续推理）:',
      reasoningAndToolsHistory.length || toolResultsForLLM.length
        ? JSON.stringify(
          { reasoningAndToolsHistory, toolResults: toolResultsForLLM },
          null,
          2
        )
        : '[]',
      '',
      '用户需求（userMessage）:',
      userMessage,
      '',
      '要求：输出严格 JSON，字段包含：reasoning_steps[]、tool_calls[]、final_message（可选）。'
    ].join('\n');

    /** @type {{success:boolean, content?:string, error?:string}} */
    const llmResponse = await callLLM(
      [
        // 尽量只塞“一个 user role + 一个 system role”的简化结构，减少上下文膨胀
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      model
    );

    if (!llmResponse?.success) {
      return {
        success: false,
        error: llmResponse?.error || 'LLM call failed',
        toolResults
      };
    }

    const parsed = parseJsonLoose(llmResponse.content || '');
    if (!parsed) {
      return {
        success: false,
        error: 'LLM 输出无法解析为 JSON',
        toolResults,
        raw: llmResponse.content
      };
    }

    const finalMessage = typeof parsed.final_message === 'string' ? parsed.final_message : null;
    const toolCalls = normalizeToolCalls(parsed.tool_calls);

    // UI 展示：把 reasoning_steps 作为 agent_final 前的上下文也可以，但这里先透传给前端
    const reasoningSteps = Array.isArray(parsed.reasoning_steps) ? parsed.reasoning_steps : [];
    onProgress?.({
      type: 'agent_step',
      payload: { iteration: agentStep, reasoning_steps: reasoningSteps }
    });

    if (finalMessage) {
      onProgress?.({
        type: 'agent_final',
        payload: { finalMessage, toolResults }
      });
      return {
        success: true,
        finalMessage,
        toolResults,
        raw: parsed
      };
    }

    if (!toolCalls.length) {
      // 没有 final_message 且没有 tool_calls，认为失败并让 UI fallback
      return {
        success: false,
        error: 'LLM 未提供 final_message 也未提供 tool_calls',
        toolResults,
        raw: parsed
      };
    }

    // 执行 tool_calls（按返回顺序执行）
    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.toolCallId;
      const skillName = toolCall.skillName;
      const args = toolCall.args;

      onProgress?.({
        type: 'tool_start',
        payload: { iteration: agentStep, toolCallId, skillName, args }
      });

      const exec = skillExecutors?.[skillName];
      if (!exec) {
        const err = new Error(`No skill executor found for ${skillName}`);
        onProgress?.({
          type: 'tool_error',
          payload: { iteration: agentStep, toolCallId, skillName, error: err.message }
        });

        toolResults.push({
          toolCallId,
          skillName,
          args,
          result: { success: false, error: err.message }
        });
        continue;
      }

      try {
        const result = await exec(args, { iteration: agentStep, ctx });
        onProgress?.({
          type: 'tool_end',
          payload: { iteration: agentStep, toolCallId, skillName, result }
        });

        toolResults.push({
          toolCallId,
          skillName,
          args,
          result
        });
      } catch (error) {
        const message = error?.message || String(error);
        onProgress?.({
          type: 'tool_error',
          payload: { iteration: agentStep, toolCallId, skillName, error: message }
        });

        toolResults.push({
          toolCallId,
          skillName,
          args,
          result: { success: false, error: message }
        });
      }
    }
  }

  // 达到最大迭代仍无 final_message
  return {
    success: false,
    error: '达到最大迭代次数仍未获得 final_message',
    toolResults
  };
}

module.exports = {
  runAgentLoop
};

