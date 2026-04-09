/**
 * @fileoverview 主进程 Skills Agent 多轮循环（原 `chat.js` 内编排逻辑迁移至此）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { executeSkillInMain } = require('../skills/main-skill-executor');
const { isAbortRequested } = require('./skills-agent-loop-abort');

const {
  getSkillsForAgentList,
  needsWebSearchPriority,
  parseJsonLoose,
  sanitizeAgentFinalMessage,
  extractRenderableMarkdownFromAgentSynthesis,
  normalizeToolCalls,
  normalizeWebSearchToolResult,
  appendWebSearchReferencesMarkdown,
  getSkillChainShortName,
  getSkillBatchInvokePhaseLabel,
  getSkillResultPhaseLabel,
  getSkillProgressSlug,
  buildSkillsAgentUserPrompt,
  maybeCompactToolResultForAgentLoop,
  estimateToolResultJsonChars,
  TOOL_RESULT_COMPACT_THRESHOLD_CHARS,
  toolArgsPlainTextForUi,
  toolResultPlainTextForUi
} = require('./skills-agent-shared');
const {
  getWorkspaceToolsForAgentList,
  isWorkspaceToolName,
  executeWorkspaceTool
} = require('./project-workspace-tools');

/** @type {Map<string, string[]>|null} */
let skillKeywordsCache = null;

/**
 * 用简洁正则从 SKILL.md frontmatter 解析 `keywords: [a, b, c]`。
 * @param {string} mdText
 * @returns {string[]}
 */
function extractKeywordsFromSkillMd(mdText) {
  const text = String(mdText || '');
  const fm = text.match(/^---\s*[\r\n]+([\s\S]*?)^[ \t]*---/m);
  if (!fm?.[1]) return [];
  const line = fm[1].match(/^[ \t]*keywords\s*:\s*\[([^\]]*)\][ \t]*$/m);
  if (!line?.[1]) return [];
  return line[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/**
 * 读取内置 skills 的关键词配置（缓存）。
 * @returns {Map<string, string[]>}
 */
function getSkillKeywordsMap() {
  if (skillKeywordsCache) return skillKeywordsCache;
  const out = new Map();
  const skillsRoot = path.join(__dirname, '../../skills/skills');
  let dirents = [];
  try {
    dirents = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    skillKeywordsCache = out;
    return out;
  }
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const skillName = d.name;
    const mdPath = path.join(skillsRoot, skillName, 'SKILL.md');
    let mdText = '';
    try {
      mdText = fs.readFileSync(mdPath, 'utf8');
    } catch {
      mdText = '';
    }
    out.set(skillName, extractKeywordsFromSkillMd(mdText));
  }
  skillKeywordsCache = out;
  return out;
}

/**
 * 首轮关键词命中技能（并集增强，不裁剪）。
 * @param {string} userMessage
 * @returns {string[]}
 */
function matchKeywordTriggeredSkills(userMessage) {
  const text = String(userMessage || '').toLowerCase();
  if (!text) return [];
  const hit = [];
  const kwMap = getSkillKeywordsMap();
  for (const [skillName, keywords] of kwMap.entries()) {
    if (!Array.isArray(keywords) || !keywords.length) continue;
    const ok = keywords.some((kw) => {
      const k = String(kw || '').trim().toLowerCase();
      if (!k) return false;
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      return re.test(text);
    });
    if (ok) hit.push(skillName);
  }
  return hit;
}

/**
 * @typedef {Object} SkillsAgentLoopOptions
 * @property {string} userMessage
 * @property {string} model
 * @property {number} [temperature]
 * @property {unknown} [canvasSnapshot]
 * @property {string} [projectPath] - 当前打开项目的本地根路径（绝对路径）；非空时注入工作区读盘工具并与 skills 并列 tool_calls
 * @property {(messages: Array<{role:string, content:string}>, model: string, temperature?: number, meta?: { mode?: 'stream_markdown' }) => Promise<{ content: string }>} callLLM
 * @property {(webContents: import('electron').WebContents, payload: { skillName: string, args?: unknown, ctxPayload?: { userRequirement?: string, canvasSnapshot?: unknown } }) => Promise<unknown>} [executeSkill] - 真测等场景注入，缺省走 `executeSkillInMain`
 */

/**
 * @typedef {Object} SkillsAgentLoopResult
 * @property {boolean} ok
 * @property {string} [outcome]
 * @property {Array<{ type: string, content?: string, isSkillFlow?: boolean, rawAssistant?: boolean }>} [assistantMessages]
 * @property {string} [errorMessage]
 */

/**
 * @returns {SkillsAgentLoopResult}
 */
function buildAbortedResult() {
  return {
    ok: true,
    outcome: 'aborted',
    assistantMessages: [
      {
        type: 'assistant_message',
        content: '⚠️ 已中断当前技能编排。',
        isSkillFlow: true
      }
    ]
  };
}

/**
 * @param {import('electron').WebContents} webContents
 * @param {SkillsAgentLoopOptions} options
 * @returns {Promise<SkillsAgentLoopResult>}
 */
async function runSkillsAgentLoop(webContents, options) {
  const userMessage = String(options.userMessage || '').trim();
  const model = String(options.model || '').trim();
  const temperature = typeof options.temperature === 'number' ? options.temperature : 0.2;
  const canvasSnapshot = options.canvasSnapshot;
  const projectPath = String(options.projectPath || '').trim();
  const workspaceTools = projectPath ? getWorkspaceToolsForAgentList() : [];
  const callLLM = options.callLLM;
  /** @type {(wc: import('electron').WebContents, p: { skillName: string, args?: unknown, ctxPayload?: { userRequirement?: string, canvasSnapshot?: unknown } }) => Promise<unknown>} */
  const executeSkillFn =
    typeof options.executeSkill === 'function'
      ? options.executeSkill
      : (wc, payload) => executeSkillInMain(wc, payload);
  const wcId = webContents.id;

  /**
   * @returns {boolean}
   */
  const shouldAbort = () => isAbortRequested(wcId);

  /**
   * @param {Record<string, unknown>} detail
   */
  const send = (detail) => {
    try {
      if (!webContents.isDestroyed()) {
        webContents.send('skills-agent-loop-progress', detail);
      }
    } catch {
      /* empty */
    }
  };

  const skills = getSkillsForAgentList();
  const toolResults = [];
  /** 默认 15；环境变量 FH_SKILLS_AGENT_MAX_ITERATIONS 可覆盖（1～40） */
  const maxIterations = (() => {
    const raw = process.env.FH_SKILLS_AGENT_MAX_ITERATIONS;
    if (raw != null && /^\d+$/.test(String(raw).trim())) {
      const n = parseInt(String(raw).trim(), 10);
      return Math.min(Math.max(n, 1), 40);
    }
    return 15;
  })();
  const webPriority = needsWebSearchPriority(userMessage);
  let webSearchCalled = false;

  send({
    type: 'phase',
    phase: '等待模型规划',
    source: 'skills_agent_main'
  });

  for (let iter = 0; iter < maxIterations; iter++) {
    if (shouldAbort()) {
      return buildAbortedResult();
    }

    if (iter > 0) {
      send({ type: 'phase', phase: '结合上下文续问', source: 'skills_agent_main' });
    }

    const triggeredSkills = iter === 0 ? matchKeywordTriggeredSkills(userMessage) : [];
    const keywordHint =
      triggeredSkills.length > 0
        ? `\n\n【首轮关键词触发建议】以下 skills 命中 keywords，可与模型判断取并集参考：${triggeredSkills.join(', ')}`
        : '';
    const prompt = `${buildSkillsAgentUserPrompt(skills, toolResults, userMessage, webPriority, {
      workspaceTools,
      projectPath
    })}${keywordHint}`;

    if (shouldAbort()) {
      return buildAbortedResult();
    }

    const llmT0 = Date.now();
    const llmResp = await callLLM(
      [
        {
          role: 'system',
          content:
            '你是辅助型硬件 agent：**scheme_design_skill 可选**（不熟/要库匹配时用；熟手可跳过）。**wiring_edit_skill / firmware_codegen_skill** 主要靠**用户话 + 画布**，不要求先有方案 JSON。前序有方案时应用**可能**附带 BOM 参考，可忽略。**已打开项目又提新电路**：按增量理解，先画布+描述，不够再 scheme。**固件**：gapKind=missing_wiring 时先 wiring_edit 再继续。长文 summarize；选型 web_search/completion。每轮一个 JSON 对象；有 web 时外链来自 results。'
        },
        { role: 'user', content: prompt }
      ],
      model,
      temperature
    );
    if (process.env.FH_SKILLS_AGENT_DEBUG === '1') {
      const agentRawDbg = String(llmResp?.content || '');
      console.log(
        `[skills-agent-loop] iter ${iter + 1} LLM ${Date.now() - llmT0}ms chars=${agentRawDbg.length}`
      );
    }

    if (shouldAbort()) {
      return buildAbortedResult();
    }

    const agentRaw = String(llmResp?.content || '');
    send({
      type: 'llm_round',
      iter: iter + 1,
      maxIterations,
      contentChars: agentRaw.length
    });

    const parsed = parseJsonLoose(agentRaw);
    if (!parsed) {
      return {
        ok: true,
        outcome: 'parse_error',
        assistantMessages: [
          {
            type: 'assistant_message',
            content: rawOrEmpty(agentRaw),
            rawAssistant: true
          }
        ]
      };
    }

    const finalMessage =
      typeof parsed.final_message === 'string' ? sanitizeAgentFinalMessage(parsed.final_message) : '';
    let toolCalls = normalizeToolCalls(parsed.tool_calls);

    const containsWebSearch = toolCalls.some((tc) => tc.skillName === 'web_search_exa');
    if (webPriority && !webSearchCalled && !containsWebSearch) {
      toolCalls = [
        {
          toolCallId: `forced_web_${iter + 1}`,
          skillName: 'web_search_exa',
          args: { query: String(userMessage || '').trim(), numResults: 5, type: 'fast' }
        },
        ...toolCalls
      ];
    }

    if (finalMessage && (!webPriority || webSearchCalled)) {
      send({ type: 'final_synthesis_start', source: 'skills_agent_main' });
      let synthesized = '';
      try {
        const toolResultsJson = JSON.stringify(toolResults, null, 2);
        const draftHint = finalMessage.trim()
          ? `\n\n【供参考的要点草稿（请改写进正文，勿原样输出 JSON 或字段名）】\n${finalMessage}`
          : '';
        const synResp = await callLLM(
          [
            {
              role: 'system',
              content:
                '你是硬件设计助手。本轮是**面向用户的最终答复**，与前面的「规划 JSON 块」无关。\n' +
                '**输出形态**：只输出一段**连续 Markdown**（GFM），从第一个可见字符起就是正文，可直接交给 Markdown 渲染器。可从 `# 标题` 起笔，或直接写段落/列表。\n' +
                '**禁止**：整段 JSON 对象、整段 json 代码围栏、输出 reasoning_steps / tool_calls / final_message 等字段名、复述规划用的块结构。\n' +
                '代码片段请用常规 Markdown 围栏（如以三个反引号加语言标记起笔）仅包住代码本身。引用外链须与工具结果一致。语言：中文。'
            },
            {
              role: 'user',
              content:
                `【用户需求】\n${userMessage}\n\n【toolResults JSON】\n${toolResultsJson}${draftHint}\n\n` +
                '【输出】仅上述 Markdown 正文，无前后缀、无 JSON。'
            }
          ],
          model,
          temperature,
          { mode: 'stream_markdown' }
        );
        synthesized = extractRenderableMarkdownFromAgentSynthesis(
          String(synResp?.content || '')
        );
      } catch (e) {
        if (process.env.FH_SKILLS_AGENT_DEBUG === '1') {
          console.warn(
            '[skills-agent-loop] final stream synthesis failed, fallback JSON final_message',
            e
          );
        }
        synthesized = '';
      }
      send({ type: 'final_synthesis_end', source: 'skills_agent_main' });

      const base = synthesized || finalMessage;
      const withRefs = webSearchCalled
        ? appendWebSearchReferencesMarkdown(base, toolResults)
        : base;
      return {
        ok: true,
        outcome: 'final_message',
        assistantMessages: [
          {
            type: 'assistant_message',
            content: withRefs,
            isSkillFlow: true
          }
        ]
      };
    }

    if (!toolCalls.length) {
      return {
        ok: true,
        outcome: 'no_tools',
        assistantMessages: [
          {
            type: 'assistant_message',
            content: '⚠️ 未产生可执行工具调用，请换个说法再试一次。'
          }
        ]
      };
    }

    const batchN = toolCalls.length;
    const firstSkillName = toolCalls[0].skillName;
    send({
      type: 'phase',
      phase: getSkillBatchInvokePhaseLabel(firstSkillName, batchN),
      source: 'skills_agent_main'
    });

    for (let ti = 0; ti < toolCalls.length; ti++) {
      if (shouldAbort()) {
        return buildAbortedResult();
      }

      const toolCall = toolCalls[ti];
      const skillName = toolCall.skillName;
      const shortName = getSkillChainShortName(skillName);
      send({
        type: 'tool_start',
        skillName,
        shortName,
        progressSlug: getSkillProgressSlug(skillName),
        batchIndex: ti + 1,
        batchTotal: batchN,
        args: toolCall.args,
        toolCallId: toolCall.toolCallId,
        argsPreview: toolArgsPlainTextForUi(skillName, toolCall.args)
      });

      const ctxPayload = {
        userRequirement: userMessage,
        canvasSnapshot
      };

      /** @type {unknown} */
      let result;
      if (isWorkspaceToolName(skillName)) {
        if (!projectPath) {
          result = {
            success: false,
            error: '当前未携带本地项目路径（projectPath），无法执行工作区工具'
          };
        } else {
          result = await executeWorkspaceTool(skillName, toolCall.args, projectPath);
        }
      } else {
        result = await executeSkillFn(webContents, {
          skillName,
          args: toolCall.args,
          ctxPayload
        });
      }

      if (shouldAbort()) {
        return buildAbortedResult();
      }

      if (skillName === 'web_search_exa' && result?.success && result?.data) {
        result = normalizeWebSearchToolResult(result.data);
      }

      if (estimateToolResultJsonChars(result) > TOOL_RESULT_COMPACT_THRESHOLD_CHARS) {
        send({
          type: 'phase',
          phase: '工具输出过长，正在压缩…',
          source: 'skills_agent_main'
        });
        result = await maybeCompactToolResultForAgentLoop(result, {
          skillName,
          callLLM,
          model,
          temperature: 0.15
        });
      }

      if (skillName === 'web_search_exa' && result?.success) {
        webSearchCalled = true;
        const count = Array.isArray(result?.results) ? result.results.length : 0;
        send({
          type: 'phase',
          phase: getSkillResultPhaseLabel(skillName, true, count),
          source: 'skills_agent_main'
        });
      } else {
        send({
          type: 'phase',
          phase: getSkillResultPhaseLabel(skillName, !!result?.success, 0),
          source: 'skills_agent_main'
        });
      }

      send({
        type: 'tool_end',
        skillName,
        shortName,
        success: !!result?.success,
        toolCallId: toolCall.toolCallId,
        resultPreview: toolResultPlainTextForUi(skillName, result),
        firmwarePatch:
          skillName === 'firmware_codegen_skill'
            ? {
                summary: result?.data?.summary || result?.summary || '',
                patch: result?.data?.patch || result?.patch || '',
                targetPath: result?.data?.targetPath || result?.targetPath || '',
                language: result?.data?.language || result?.language || 'arduino',
                canvasAnalysis: result?.data?.canvasAnalysis,
                canvasGuidance: result?.data?.canvasGuidance
              }
            : undefined
      });

      toolResults.push({
        toolCallId: toolCall.toolCallId,
        skillName,
        args: toolCall.args,
        result
      });
    }

    if (iter + 1 < maxIterations) {
      send({ type: 'phase', phase: '继续请求模型', source: 'skills_agent_main' });
    }
  }

  return {
    ok: true,
    outcome: 'max_iterations',
    assistantMessages: [
      {
        type: 'assistant_message',
        content: '⚠️ 多次尝试后仍未完成回复，请换个问法或缩小问题范围。'
      }
    ]
  };
}

/**
 * @param {string} raw
 * @returns {string}
 */
function rawOrEmpty(raw) {
  const s = String(raw || '').trim();
  return s || '模型输出为空';
}

module.exports = {
  runSkillsAgentLoop
};
