/**
 * @fileoverview 主进程 Skills Agent 多轮循环（原 `chat.js` 内编排逻辑迁移至此）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { executeSkillInMain } = require('../skills/main-skill-executor');
const { invokeRendererEngineOp } = require('../skills/renderer-engine-bridge');
const { isAbortRequested } = require('./skills-agent-loop-abort');

const {
  getSkillsForAgentList,
  needsWebSearchPriority,
  parseJsonLoose,
  sanitizeAgentFinalMessage,
  extractRenderableMarkdownFromAgentSynthesis,
  normalizeToolCalls,
  dedupeFirmwareCodegenToolCalls,
  hasSuccessfulFirmwareCodegenInResults,
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

/**
 * 从 `executeSkill` 返回值提取固件补丁字段，供 `tool_end.firmwarePatch` 发往渲染进程打开审阅窗。
 * 必须在 {@link maybeCompactToolResultForAgentLoop} **之前**调用：压缩会丢弃 `data.patch`，仅保留摘要。
 * @param {unknown} result
 * @returns {{
 *   summary: string,
 *   patch: string,
 *   targetPath: string,
 *   language: string,
 *   canvasAnalysis?: unknown,
 *   canvasGuidance?: unknown
 * } | null}
 */
function extractFirmwarePatchPayloadForToolEnd(result) {
  if (!result || typeof result !== 'object') return null;
  const r = /** @type {{ data?: Record<string, unknown>, summary?: string, patch?: string, targetPath?: string, language?: string, canvasAnalysis?: unknown, canvasGuidance?: unknown }} */ (
    result
  );
  const data = r.data && typeof r.data === 'object' ? r.data : null;
  const summary = String((data && data.summary) || r.summary || '').trim();
  const patch = String((data && data.patch) || r.patch || '').trim();
  const targetPath = String((data && data.targetPath) || r.targetPath || '').trim();
  const language = String((data && data.language) || r.language || 'arduino').trim() || 'arduino';
  const canvasAnalysis = data && 'canvasAnalysis' in data ? data.canvasAnalysis : r.canvasAnalysis;
  const canvasGuidance = data && 'canvasGuidance' in data ? data.canvasGuidance : r.canvasGuidance;
  return { summary, patch, targetPath, language, canvasAnalysis, canvasGuidance };
}

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
 * @property {(webContents: import('electron').WebContents, payload: { skillName: string, args?: unknown, ctxPayload?: { userRequirement?: string, canvasSnapshot?: unknown, projectPath?: string } }) => Promise<unknown>} [executeSkill] - 真测等场景注入，缺省走 `executeSkillInMain`
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
 * 最近一次 `wiring_edit_skill` 已成功且 `plannedOperations` 为空时，禁止再次调用（压掉空转）。
 * @param {Array<{ skillName?: string, result?: { success?: boolean, data?: { plannedOperations?: unknown[] }, plannedOperations?: unknown[] } }>} toolResults
 * @returns {boolean}
 */
function shouldBlockWiringEditAfterNoOpSuccess(toolResults) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return false;
  for (let i = toolResults.length - 1; i >= 0; i--) {
    const tr = toolResults[i];
    if (String(tr?.skillName || '') !== 'wiring_edit_skill') continue;
    const r = tr?.result;
    if (!r || !r.success) return false;
    const ops = r?.data?.plannedOperations ?? r?.plannedOperations;
    const n = Array.isArray(ops) ? ops.length : -1;
    return n === 0;
  }
  return false;
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
  /** @type {(wc: import('electron').WebContents, p: { skillName: string, args?: unknown, ctxPayload?: { userRequirement?: string, canvasSnapshot?: unknown, projectPath?: string } }) => Promise<unknown>} */
  const executeSkillFn =
    typeof options.executeSkill === 'function'
      ? options.executeSkill
      : (wc, payload) => executeSkillInMain(wc, payload);
  const wcId = webContents.id;
  if (process.env.FH_SKILLS_AGENT_DEBUG === '1') {
    const snapObj =
      canvasSnapshot && typeof canvasSnapshot === 'object' ? canvasSnapshot : {};
    const components = Array.isArray(snapObj.components) ? snapObj.components : [];
    const connections = Array.isArray(snapObj.connections) ? snapObj.connections : [];
    console.log('[skills-agent-loop] recv canvasSnapshot summary:', {
      wcId,
      projectPath,
      componentCount: components.length,
      connectionCount: connections.length,
      componentInstancePreview: components
        .slice(0, 8)
        .map((c) => String(c?.instanceId || c?.id || c?.componentFile || ''))
        .filter(Boolean),
      connectionPreview: connections.slice(0, 8).map((w) => {
        const sid = String(w?.source?.instanceId || w?.source?.componentId || '');
        const tid = String(w?.target?.instanceId || w?.target?.componentId || '');
        const sp = String(w?.source?.pinId || '');
        const tp = String(w?.target?.pinId || '');
        return `${sid}:${sp} -> ${tid}:${tp}`;
      })
    });
  }

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
  /** 实时/优先联网场景下，本轮内已执行 web_search_exa 的次数（含失败），用于封顶避免无限强注 */
  let webSearchExaInvokeCount = 0;
  /** 默认 3；环境变量 FH_WEB_SEARCH_MAX_PER_RUN 可覆盖（1～10） */
  const maxWebSearchExaPerRun = (() => {
    const raw = String(process.env.FH_WEB_SEARCH_MAX_PER_RUN || '3').trim();
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1) return Math.min(n, 10);
    return 3;
  })();
  /** 单次 runSkillsAgentLoop 内 wiring_edit_skill 调用上限（防模型反复编排） */
  const maxWiringEditPerRun = (() => {
    /** 默认 5：单条用户消息内可能「直连 RGB → 补件后再串电阻」多步改线，3 次易触顶 */
    const raw = String(process.env.FH_WIRING_EDIT_MAX_PER_RUN || '5').trim();
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1) return Math.min(n, 20);
    return 5;
  })();
  let wiringEditRunCount = 0;
  /** 默认 2：允许首次失败后再试 1 次；一旦有一次 success，仍由 hasSuccessfulFirmwareCodegenInResults 拦截重复 */
  const maxFirmwareCodegenPerRun = Math.max(
    1,
    parseInt(String(process.env.FH_FIRMWARE_CODEGEN_MAX_PER_RUN || '2'), 10) || 2
  );
  let firmwareCodegenInvokeCount = 0;

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

    const webSearchCapReached =
      webPriority && webSearchExaInvokeCount >= maxWebSearchExaPerRun && !webSearchCalled;

    const triggeredSkills = iter === 0 ? matchKeywordTriggeredSkills(userMessage) : [];
    const keywordHint =
      triggeredSkills.length > 0
        ? `\n\n【首轮关键词触发建议】以下 skills 命中 keywords，可与模型判断取并集参考：${triggeredSkills.join(', ')}`
        : '';
    const prompt = `${buildSkillsAgentUserPrompt(skills, toolResults, userMessage, webPriority, {
      workspaceTools,
      projectPath,
      webSearchCapReached
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
            '你是辅助型硬件 agent：**scheme_design_skill 可选**。**wiring_edit_skill / firmware_codegen_skill** 以**用户话 + 画布**为主。已打开项目且工作区已读到 .ino：**对用户说「更新/修订固件、补丁」**，勿说「从零生成整套」。**固件 skill 每用户消息最多成功走 1 次**，勿在同一轮 tool_calls 里重复。**多轮编排时**：若用户消息里已附「历史工具结果」且其中 **firmware_codegen_skill 已成功**，**禁止**再在 tool_calls 里写 `firmware_codegen_skill`，应直接 **final_message** 总结。用户**仅要固件/示例代码**时：首轮**只调 firmware_codegen_skill**，勿同轮串 scheme/wiring；若用户明确要求画布对齐引脚且缺线，再建议**下一轮** wiring。长文 summarize。每轮一个 JSON。'
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
    let toolCalls = dedupeFirmwareCodegenToolCalls(normalizeToolCalls(parsed.tool_calls));

    if (webSearchCapReached) {
      toolCalls = toolCalls.filter((tc) => tc.skillName !== 'web_search_exa');
    }

    const containsWebSearch = toolCalls.some((tc) => tc.skillName === 'web_search_exa');
    if (webPriority && !webSearchCalled && !webSearchCapReached && !containsWebSearch) {
      toolCalls = [
        {
          toolCallId: `forced_web_${iter + 1}`,
          skillName: 'web_search_exa',
          args: { query: String(userMessage || '').trim(), numResults: 5, type: 'fast' }
        },
        ...toolCalls
      ];
    }

    /** 续轮模型若再次输出 firmware_codegen_skill，不再执行也不展示失败块：主进程直接剔除 */
    if (hasSuccessfulFirmwareCodegenInResults(toolResults)) {
      const beforeN = toolCalls.length;
      toolCalls = toolCalls.filter((tc) => tc.skillName !== 'firmware_codegen_skill');
      if (beforeN !== toolCalls.length && process.env.FH_SKILLS_AGENT_DEBUG === '1') {
        console.log(
          '[skills-agent-loop] stripped redundant firmware_codegen_skill (success already in toolResults)'
        );
      }
    }

    if (finalMessage && (!webPriority || webSearchCalled || webSearchCapReached)) {
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
                '若工具结果涉及项目内已有 .ino/固件补丁：用「**更新/修订**固件」「补丁已应用」等表述，**避免**「从零生成整个项目文件」类说法。代码片段请用常规 Markdown 围栏（如以三个反引号加语言标记起笔）仅包住代码本身。引用外链须与工具结果一致。语言：中文。'
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
      if (webPriority && webSearchCapReached && !finalMessage && iter + 1 < maxIterations) {
        if (process.env.FH_SKILLS_AGENT_DEBUG === '1') {
          console.log('[skills-agent-loop] web_search cap: empty tool_calls, continue for final_message');
        }
        continue;
      }
      if (hasSuccessfulFirmwareCodegenInResults(toolResults)) {
        send({ type: 'final_synthesis_start', source: 'skills_agent_main' });
        let synthesized = '';
        try {
          const toolResultsJson = JSON.stringify(toolResults, null, 2);
          const synResp = await callLLM(
            [
              {
                role: 'system',
                content:
                  '你是硬件设计助手。本轮是**面向用户的最终答复**。\n' +
                  '**输出形态**：只输出一段**连续 Markdown**（GFM）。\n' +
                  '历史工具结果中**已有成功的 firmware_codegen_skill**：请向用户说明功能要点、引脚占位与审阅/接受补丁的方式；**不要**建议再次调用固件生成 skill。语言：中文。'
              },
              {
                role: 'user',
                content:
                  `【用户需求】\n${userMessage}\n\n【toolResults JSON】\n${toolResultsJson}\n\n` +
                  '【输出】仅 Markdown 正文，无 JSON。'
              }
            ],
            model,
            temperature,
            { mode: 'stream_markdown' }
          );
          synthesized = extractRenderableMarkdownFromAgentSynthesis(String(synResp?.content || ''));
        } catch (e) {
          if (process.env.FH_SKILLS_AGENT_DEBUG === '1') {
            console.warn('[skills-agent-loop] finalize-after-fw-only failed', e);
          }
          synthesized = '';
        }
        send({ type: 'final_synthesis_end', source: 'skills_agent_main' });
        const base =
          synthesized ||
          '✅ 固件补丁已生成。请在代码区「补丁审阅模式」中查看，并可选择性接受或拒绝各段改动。';
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

      /** 每步工具执行前从渲染进程拉取最新快照（连线等落盘后旧快照会仍为 0 条连线） */
      let snapshotForTools = canvasSnapshot;
      if (!isWorkspaceToolName(skillName)) {
        try {
          const fresh = await invokeRendererEngineOp(
            webContents,
            'getCanvasSnapshotForSkill',
            [],
            120000
          );
          if (fresh && typeof fresh === 'object') {
            snapshotForTools = fresh;
          }
        } catch (e) {
          if (process.env.FH_SKILLS_AGENT_DEBUG === '1') {
            console.warn(
              '[skills-agent-loop] getCanvasSnapshotForSkill IPC 失败，沿用本轮初始快照',
              e?.message || e
            );
          }
        }
      }

      const ctxPayload = {
        userRequirement: userMessage,
        canvasSnapshot: snapshotForTools,
        projectPath
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
      } else if (
        skillName === 'firmware_codegen_skill' &&
        firmwareCodegenInvokeCount >= maxFirmwareCodegenPerRun
      ) {
        result = {
          success: false,
          error: `本轮对话内 firmware_codegen_skill 调用次数已达上限（${maxFirmwareCodegenPerRun}）。请输出 final_message 总结已返回的补丁与审阅要点；勿再调用该 skill。`,
          data: { capped: true, firmwareCodegenCap: true }
        };
      } else if (
        skillName === 'wiring_edit_skill' &&
        shouldBlockWiringEditAfterNoOpSuccess(toolResults)
      ) {
        result = {
          success: false,
          error:
            '上一轮 wiring_edit_skill 已成功且拟定连线为 0 条（画布已满足当前意图）。请直接输出 final_message，勿再调用 wiring_edit_skill。',
          data: { capped: true, wiringEditNoOpRepeat: true }
        };
      } else if (skillName === 'wiring_edit_skill' && wiringEditRunCount >= maxWiringEditPerRun) {
        result = {
          success: false,
          error: `本轮对话内 wiring_edit_skill 已达上限（${maxWiringEditPerRun} 次）。请根据已返回的工具结果与画布快照输出 final_message：自检连线是否与 wiringRules 一致、components/connections 是否已反映；勿再调用 wiring_edit_skill。`,
          data: { capped: true, wiringEditCap: true }
        };
      } else {
        result = await executeSkillFn(webContents, {
          skillName,
          args: toolCall.args,
          ctxPayload
        });
        if (skillName === 'wiring_edit_skill') {
          wiringEditRunCount += 1;
        }
        if (skillName === 'firmware_codegen_skill') {
          firmwareCodegenInvokeCount += 1;
        }
      }

      if (skillName === 'web_search_exa' && webPriority) {
        webSearchExaInvokeCount += 1;
      }

      if (shouldAbort()) {
        return buildAbortedResult();
      }

      if (skillName === 'web_search_exa' && result?.success && result?.data) {
        result = normalizeWebSearchToolResult(result.data);
      }

      /** 压缩前快照固件 patch；`maybeCompactToolResultForAgentLoop` 会整段替换 result，导致 `data.patch` 丢失、审阅窗不打开 */
      const firmwarePatchSnapshot =
        skillName === 'firmware_codegen_skill' ? extractFirmwarePatchPayloadForToolEnd(result) : null;

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
        wiringPlan:
          skillName === 'wiring_edit_skill'
            ? {
                rationale: String(result?.data?.rationale || result?.rationale || '').trim(),
                canvasVsScheme: String(
                  result?.data?.canvasVsScheme || result?.canvasVsScheme || ''
                ).trim(),
                missingPartsSummary: Array.isArray(
                  result?.data?.missingPartsSummary || result?.missingPartsSummary
                )
                  ? (result?.data?.missingPartsSummary || result?.missingPartsSummary)
                  : [],
                plannedOperations: Array.isArray(
                  result?.data?.plannedOperations || result?.plannedOperations
                )
                  ? (result?.data?.plannedOperations || result?.plannedOperations).slice(0, 20)
                  : []
              }
            : undefined,
        firmwarePatch:
          skillName === 'firmware_codegen_skill'
            ? firmwarePatchSnapshot || {
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
