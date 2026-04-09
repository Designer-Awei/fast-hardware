/**
 * @fileoverview Skills Agent 循环与渲染进程共用的纯函数（无 DOM、无 window）。
 */

'use strict';

/**
 * @returns {Array<{name:string, description:string}>}
 */
function getSkillsForAgentList() {
  return [
    {
      name: 'scheme_design_skill',
      description:
        '**可选用**（非每问必调）：方案骨架 + 库内 **BOM 匹配**（matchedKey、exists=0 缺件提示）。适合**新方案 / 不熟料号 / 要库内对齐**时调用；熟手已摆好画布、或「已打开项目里随口改一处」可不调。**不**自动创建元件。缺型号可再 completion_suggestion / web_search。仅要文字、不匹配库时 runBomAnalysis:false。'
    },
    {
      name: 'web_search_exa',
      description:
        '联网检索（非每项必调）：**实时/外部事实**须先检索；或 scheme_design 后缺件仍模糊、需公开资料佐证具体型号时使用。返回 results[]；final_message 中外链须来自 results[].url。'
    },
    {
      name: 'completion_suggestion_skill',
      description:
        '在 scheme_design 之后使用更佳：把 **missingDescriptions** 设为仍缺具体型号的条目（可从 analysisResult 缺件 recommendation 概括）；输出可采购模块名（如 KY-038、SG90）。可配合 web_search_exa。'
    },
    {
      name: 'summarize_skill',
      description:
        '**常与 web_search_exa 搭配**：检索后将 results（title/snippet/url）拼入 **text** 做要点摘要，或传 **urls**（1～5，应用抓取公开正文）。也用于长文/日志。输出 summary+bullets；可选 **length**、**focus**。'
    },
    {
      name: 'wiring_edit_skill',
      description:
        '**补线/改线**：必填 wiringRules；以**用户话 + 当前画布**为主即可执行，**不依赖**必须先跑方案设计。若之前跑过 scheme，引擎**可能**附上一段 BOM 参考（可无视）。expectedComponentsFromAgent 可选。applyToCanvas 默认 true。'
    },
    {
      name: 'firmware_codegen_skill',
      description:
        '用户明确要改固件代码时：输入 userRequirement + 可选 codeText；引擎会先读当前画布（元件与连线），再按「空画布/连线未就绪/结构完整」分支生成初步或引脚级 patch，并在结果中带 canvasGuidance 引导用户回到画布或继续 wiring_edit_skill；默认不直接写文件。'
    }
  ];
}

/**
 * @param {string} userMessage
 * @returns {boolean}
 */
function isRealtimeQuery(userMessage) {
  const text = String(userMessage || '').toLowerCase();
  if (!text) return false;
  const keywords = [
    '新闻', '最新', '今日', '今天', '实时', '刚刚', '近期', '最近',
    'hot', 'headline', 'breaking', 'news', 'current'
  ];
  return keywords.some((kw) => text.includes(kw));
}

/**
 * @param {string} userMessage
 * @returns {boolean}
 */
function needsWebSearchPriority(userMessage) {
  if (isRealtimeQuery(userMessage)) return true;
  const t = String(userMessage || '');
  if (!t.trim()) return false;
  /** 股价/赛程等明显依赖「当前外部事实」 */
  const marketLike = /股价|股票|汇率|基金|比分|赛程|开奖/i.test(t);
  /** 用户显式要上网查 */
  const explicitLookup =
    /查一下|查一查|查下|查查|搜一下|搜一搜|搜下|搜索|帮我查|帮我搜|网上查|联网查|上网查|检索一下|查查看/.test(t);
  const explicitWeb = /联网|上网搜|网上搜|先搜|先查/.test(t);
  /**
   * 元件/模块选型：要到**具体型号、手册、替代、采购向**信息时再检索（非用泛天气词凑触发）。
   */
  const moduleOrPartSelection =
    /具体型号|物料编码|订货型号|采购型号|买哪(?:种|款|个)|哪一款|哪款芯片|哪款模块|哪种料|替代料|兼容替代|pin\s*兼容|数据手册|datasheet/i.test(
      t
    ) ||
    /(?:电机|芯片|传感器|模块|电调|MOS|LDO|DCDC|电池包|连接器|MCU)\s*选型|选型表|外购件|缺(?:件)?.*型号/i.test(t);
  /** 先找公开类似方案/案例再对库 */
  const similarSolutionIntent =
    /参考(?:一下)?.*方案|类似(?:的)?.*案例|开源(?:硬件|项目)|有没有.*成品|成熟方案|行业(?:里|内).*(?:做法|方案)|对标.*产品/i.test(
      t
    );
  /**
   * 复杂/系统级描述：篇幅足够且同时含「做什么 + 怎么做/要什么」时，倾向先检索再对元件库。
   */
  const substantialProjectIntent =
    t.length >= 72 &&
    /方案|设计|实现|搭建|开发|传感器|执行器|主控|嵌入式|电路|硬件|控制|监测|自动化|装置|系统|飞控|云台|整机/.test(t) &&
    /需要|要做|想做一个|想做个|想做|帮我|如何|怎么|哪些|清单|架构|逻辑|条件|指标/.test(t);

  return (
    marketLike ||
    explicitLookup ||
    explicitWeb ||
    moduleOrPartSelection ||
    similarSolutionIntent ||
    substantialProjectIntent
  );
}

/**
 * @returns {string}
 */
function getAgentTimeContext() {
  const now = new Date();
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'zh-CN';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  const iso = now.toISOString();
  const local = now.toLocaleString(locale, { hour12: false });
  return `当前本地时间=${local}；ISO时间=${iso}；时区=${timezone}；locale=${locale}`;
}

/**
 * 从文本中提取首个花括号深度配平的 `{ ... }`（尊重 JSON 字符串内的引号与转义）。
 * `final_message` 内 Markdown 含 `}` 时，勿用 `lastIndexOf('}')` 截断，否则解析失败会把整段 JSON 当正文展示。
 * @param {string} s
 * @returns {string|null}
 */
function extractBalancedJsonObject(s) {
  const text = String(s || '');
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {any}
 */
function parseJsonLoose(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const fence = s.match(/```json\s*([\s\S]*?)\s*```/i) || s.match(/```([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* empty */
    }
  }
  try {
    return JSON.parse(s);
  } catch {
    /* empty */
  }
  const balanced = extractBalancedJsonObject(s);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {
      /* empty */
    }
  }
  const toolCallLike = s.match(/^([a-zA-Z0-9_\-]+)\s*\n([\s\S]+)$/);
  if (toolCallLike?.[1] && toolCallLike?.[2]) {
    const argsObj = parseJsonLoose(toolCallLike[2]);
    if (argsObj && typeof argsObj === 'object') {
      return {
        reasoning_steps: [{ step: 1, summary: `选择调用 ${toolCallLike[1]}` }],
        tool_calls: [{ toolCallId: 'auto_tool_1', skillName: toolCallLike[1], args: argsObj }]
      };
    }
  }
  return null;
}

/**
 * @param {any} raw
 * @returns {Array<{toolCallId:string, skillName:string, args:any}>}
 */
function normalizeToolCalls(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x, idx) => {
      let argsRaw = x.args !== undefined && x.args !== null ? x.args : x.arguments;
      if (typeof argsRaw === 'string') {
        try {
          argsRaw = JSON.parse(argsRaw);
        } catch {
          argsRaw = {};
        }
      }
      const args = argsRaw != null && typeof argsRaw === 'object' ? argsRaw : {};
      return {
        toolCallId: String(x.toolCallId || x.id || `tool_${idx + 1}`),
        skillName: String(x.skillName || x.name || '').trim(),
        args
      };
    })
    .filter((x) => !!x.skillName);
}

/**
 * @param {string} urlStr
 * @returns {string}
 */
function getSiteLabelFromUrl(urlStr) {
  try {
    const u = new URL(String(urlStr || '').trim());
    return u.hostname.replace(/^www\./i, '') || '来源';
  } catch {
    return '来源';
  }
}

/**
 * @param {any} result
 * @returns {{success:boolean, results:Array<any>, raw?:string, error?:string}}
 */
function normalizeWebSearchToolResult(result) {
  if (!result || typeof result !== 'object') {
    return { success: false, results: [], error: '无效搜索结果' };
  }
  const base = { ...result };
  if (!Array.isArray(base.results)) {
    return base;
  }
  base.results = base.results
    .map((item) => {
      const url = String(item?.url || '').trim();
      const title = String(item?.title || '').trim();
      const snippet = String(item?.snippet || '').trim();
      const siteLabel = item?.siteLabel || getSiteLabelFromUrl(url);
      return {
        title: title || siteLabel || '来源',
        url,
        snippet,
        siteLabel: String(siteLabel || '').trim() || '来源'
      };
    })
    .filter((x) => !!x.url);
  return base;
}

/**
 * @param {Array<{skillName:string, result?:any}>} toolResults
 * @returns {Array<{title:string, url:string, siteLabel:string}>}
 */
function collectWebSearchSources(toolResults) {
  /** @type {Map<string, {title:string, url:string, siteLabel:string}>} */
  const byUrl = new Map();
  for (const tr of toolResults || []) {
    if (!tr || tr.skillName !== 'web_search_exa' || !tr.result?.success) continue;
    const arr = tr.result.results;
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const url = String(r?.url || '').trim();
      if (!url || byUrl.has(url)) continue;
      const siteLabel = String(r?.siteLabel || getSiteLabelFromUrl(url));
      const title = String(r?.title || '').trim() || siteLabel;
      byUrl.set(url, { title, url, siteLabel });
    }
  }
  return [...byUrl.values()];
}

/**
 * @param {string} finalMessage
 * @param {Array<{skillName:string, result?:any}>} toolResults
 * @returns {string}
 */
function appendWebSearchReferencesMarkdown(finalMessage, toolResults) {
  const text = String(finalMessage || '').trim();
  const sources = collectWebSearchSources(toolResults);
  if (!sources.length) return text;
  const missing = sources.filter((s) => !text.includes(s.url));
  if (!missing.length) return text;
  const lines = missing.map((s) => {
    const label = s.siteLabel || s.title;
    return `- [${label}](${s.url})`;
  });
  const block = lines.join('\n');
  if (/(?:^|\n)###\s*参考资料\b/m.test(text)) {
    return `${text}\n${block}\n`;
  }
  return `${text}\n\n### 参考资料\n${block}\n`;
}

/**
 * 将模型返回的 reasoning_steps 规范为 UI 可用的 `{ step, summary }[]`（兼容纯字符串元素）
 * @param {unknown} steps
 * @returns {Array<{ step: number, summary: string }>}
 */
function normalizeReasoningStepEntries(steps) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  for (const s of steps) {
    let summary = '';
    if (typeof s === 'string') {
      summary = s.trim();
    } else if (s && typeof s === 'object') {
      const raw = typeof s.summary === 'string' ? s.summary : String(s.summary ?? '');
      summary = raw.trim();
    }
    if (!summary) continue;
    out.push({ step: out.length + 1, summary });
  }
  return out;
}

/**
 * 去除模型在 JSON 的 final_message 字段里误套的 markdown 围栏，并 trim
 * @param {string} s
 * @returns {string}
 */
function sanitizeAgentFinalMessage(s) {
  let t = String(s || '').trim();
  if (!t) return t;
  const m =
    t.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i) ||
    t.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)```\s*$/i);
  if (m?.[1]) return String(m[1]).trim();
  return t;
}

/**
 * 最终合成若仍输出与规划轮同形的 JSON（含 reasoning_steps / tool_calls），只取 `final_message` 供气泡渲染；
 * 若为纯 Markdown 则原样消毒后返回。
 * @param {string} text
 * @returns {string}
 */
function extractRenderableMarkdownFromAgentSynthesis(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const parsed = parseJsonLoose(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (typeof parsed.final_message === 'string' && parsed.final_message.trim()) {
      return sanitizeAgentFinalMessage(parsed.final_message);
    }
    return '';
  }

  return sanitizeAgentFinalMessage(raw);
}

/** @type {Record<string, string>} */
const SHORT_NAME_MAP = {
  web_search_exa: 'Web 检索',
  scheme_design_skill: '方案设计',
  completion_suggestion_skill: '补全建议',
  summarize_skill: '摘要',
  wiring_edit_skill: '连线编辑',
  firmware_codegen_skill: '固件编辑',
  workspace_list_dir: '工作区·列目录',
  workspace_read_file: '工作区·读文件',
  workspace_grep: '工作区·搜索',
  workspace_explore: '工作区·浏览树',
  workspace_verify: '工作区·校验路径'
};

/**
 * @param {string} skillName
 * @returns {string}
 */
function getSkillChainShortName(skillName) {
  return SHORT_NAME_MAP[skillName] || skillName;
}

/** @type {Record<string, string>} */
const PROGRESS_SLUG_MAP = {
  web_search_exa: 'web-search',
  scheme_design_skill: 'scheme-design',
  completion_suggestion_skill: 'completion-suggestion',
  summarize_skill: 'summarize',
  wiring_edit_skill: 'wiring-edit',
  firmware_codegen_skill: 'firmware-code'
};

/**
 * @param {string} skillName
 * @returns {string}
 */
function getSkillProgressSlug(skillName) {
  if (PROGRESS_SLUG_MAP[skillName]) return PROGRESS_SLUG_MAP[skillName];
  const s = String(skillName || 'unknown').trim();
  return s.replace(/_/g, '-');
}

/**
 * @param {string} str
 * @returns {number}
 */
function countSkillsPhaseUnits(str) {
  const s = String(str || '');
  let u = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[a-zA-Z]/.test(c)) {
      while (i < s.length && /[a-zA-Z0-9._-]/.test(s[i])) i += 1;
      u += 1;
      continue;
    }
    if (/[\u4e00-\u9fff]/.test(c)) {
      u += 1;
      i += 1;
      continue;
    }
    if (/\d/.test(c)) {
      u += 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return u;
}

/**
 * @param {string} phase
 * @param {number} [maxUnits=12]
 * @returns {string}
 */
function clampSkillsPhaseLabel(phase, maxUnits = 12) {
  let s = String(phase || '');
  if (countSkillsPhaseUnits(s) <= maxUnits) return s;
  /** @type {Record<string, string>} */
  const slugAbbrev = {
    'web-search': 'ws',
    'scheme-design': 'sd',
    'completion-suggestion': 'cs',
    summarize: 'sum',
    'wiring-edit': 'we',
    'firmware-code': 'fw'
  };
  let t = s;
  for (const [full, ab] of Object.entries(slugAbbrev)) {
    t = t.split(full).join(ab);
    if (countSkillsPhaseUnits(t) <= maxUnits) return t;
  }
  while (t.length > 0 && countSkillsPhaseUnits(t) > maxUnits) {
    t = t.slice(0, -1);
  }
  return t ? `${t}…` : '请稍候';
}

/**
 * @param {string} firstSkillName
 * @param {number} total
 * @returns {string}
 */
function getSkillBatchInvokePhaseLabel(firstSkillName, total) {
  const firstSlug = getSkillProgressSlug(firstSkillName);
  const n = Math.max(1, Math.floor(Number(total)) || 1);
  if (n <= 1) {
    return clampSkillsPhaseLabel(`正在调用 ${firstSlug} skill`);
  }
  return clampSkillsPhaseLabel(`正在调用 ${firstSlug} 等${n}个skill`);
}

/**
 * @param {string} skillName
 * @param {boolean} success
 * @param {number} [webResultCount]
 * @returns {string}
 */
function getSkillResultPhaseLabel(skillName, success, webResultCount) {
  const slug = getSkillProgressSlug(skillName);
  if (!success) {
    return clampSkillsPhaseLabel(`${slug} 执行失败`);
  }
  if (skillName === 'web_search_exa') {
    const c = typeof webResultCount === 'number' ? webResultCount : 0;
    return clampSkillsPhaseLabel(c > 0 ? `${slug} 返回${c}条` : `${slug} 无结果`);
  }
  return clampSkillsPhaseLabel(`${slug} 已完成`);
}

/**
 * @param {Array<{name:string, description:string}>} skills
 * @param {Array<{toolCallId?:string, skillName:string, args?:any, result?:any}>} toolResults
 * @param {string} userMessage
 * @param {boolean} needsWebPriority
 * @param {{ workspaceTools?: Array<{name:string, description:string}>, projectPath?: string }} [options]
 * @returns {string}
 */
function buildSkillsAgentUserPrompt(skills, toolResults, userMessage, needsWebPriority, options = {}) {
  const workspaceTools = Array.isArray(options.workspaceTools) ? options.workspaceTools : [];
  const projectPath = String(options.projectPath || '').trim();
  const workspaceSection =
    workspaceTools.length && projectPath
      ? [
          '',
          '【工作区读盘工具】用户已打开本地项目，根目录为：',
          projectPath,
          '可先调用下列工具**自助读取** circuit_config.json、.ino、README 等再决定是否调用 skills（tool_calls 里 skillName 须与下列 name **完全一致**）：',
          JSON.stringify(workspaceTools, null, 2),
          '工作区工具与 skills **可在同一轮 tool_calls 中并列**；检索事实仍用 web_search_exa。',
          ''
        ].join('\n')
      : '';

  return [
    '你是 Fast Hardware 的 **辅助型** skills agent（非固定流水线）：根据用户意图自主选择 tool_calls，最后用 final_message 总结或仅输出可执行连线方案。',
    '【与 Claude / Cursor 等产品对齐】用户在界面里看到的是**自然语言式「思考 / 工具说明」**；工具参数在协议里仍须结构化（见 tool_calls[].args 对象）。为兼顾解析可靠性，你**每一轮仍需输出整段「一个 JSON 对象」**（不要用 Markdown 代码块包住整段 JSON）。其中：reasoning_steps 的 summary、以及 final_message，必须是**中文自然句**，禁止在这些字段里再嵌套一层 JSON 字符串或粘贴工具原始 JSON。',
    '字段仅允许：reasoning_steps、tool_calls、final_message；其中 tool_calls 每项的 skillName 须为下方 **skills** 或 **工作区工具**列表中的 name（完整字符串一致；联网检索为 web_search_exa），args 须为 JSON 对象。',
    'reasoning_steps 若有内容，每项必须是对象：{"step":1,"summary":"一句话"}；不要输出纯字符串数组。summary 用短句描述「当前在做什么、为什么」，勿写「将输出 final_message」等元话语。',
    'final_message 只写给用户看的 Markdown 正文：不要输出 JSON、不要用 Markdown 代码块包裹全文、不要重复整段 reasoning。',
    '【核心原则】**用户描述 + 画布**足以驱动 **wiring_edit_skill** / **firmware_codegen_skill**；**scheme_design_skill** 及其结构化结果是**可选用**的选型/BOM 辅助，不是门禁。',
    '【常见编排】（1）新需求不熟：可先 **scheme_design_skill** 再拖件 → 连线 → 固件；（2）熟手/简单电路：**跳过方案**，拖件后直接 **wiring_edit_skill**（wiringRules 写清接法意图）→ **firmware_codegen_skill**。',
    '【已打开项目 + 新电路需求】把本轮消息视为**在现有工程上的增量**：先用对话 + 画布理解「老电路 vs 新要求」；若缺料/拓扑不清再调 **scheme_design_skill**，**不要**默认必须先推翻重来。',
    '【可选参考】前序若跑过方案，应用**可能**向连线/固件附带 BOM 摘要，**忽略也可**；以用户当前句子和画布为准。',
    '【推荐编排·固件】**firmware_codegen_skill** 返回中若有 **gapKind=missing_wiring** 或建议后续含 **wiring_edit_skill**：你应**先再调 wiring_edit_skill 补线**，再在后续轮次调 **firmware_codegen_skill** 生成引脚级补丁；**gapKind=missing_parts** 时引导用户先补元件上画布，勿假定未完成连线的外设引脚。',
    projectPath
      ? '【已打开已有项目】已提供**本地项目根路径**与**工作区读盘工具**：若需核对落盘文件（circuit_config.json、.ino 等），应优先 **workspace_read_file / workspace_list_dir** 等工具获取内容，再调用 scheme / wiring / firmware 等 skills；画布快照仍可作为快速预览。'
      : '【已打开已有项目】用户问题涉及电路/固件时，首轮应先基于**当前画布快照**（工具上下文会与 circuit_config 同源）理解现状；若需文件级核对，可请用户确认已打开代码编辑区或粘贴 **circuit_config.json** / **.ino** 关键片段再回答。',
    '【代码编辑】用户要求改固件实现时，可调用 **firmware_codegen_skill**：传 userRequirement（可含 codeText）；skill 会结合画布 gapKind（缺件/缺连线/就绪）生成对应深度的 patch。**缺连线**时优先编排 wiring_edit_skill，再回本 skill。',
    needsWebPriority
      ? '这是实时信息场景：必须先调用 web_search_exa，再给 final_message（可与上述 scheme 顺序结合：先检索再方案，视情况多轮）。'
      : 'web_search_exa 非实时场景非必调；缺具体型号佐证、或 scheme_design 后仍模糊时再检索。',
    '【首轮】若确定需要检索或外部事实：第一轮只输出 tool_calls，final_message 请省略或设为 ""，勿在同一轮用 final_message 代替工具调用。',
    '若确定无需任何工具（含无需联网），可直接给 final_message。',
    '每轮必须输出一个 JSON 对象，顶层键仅允许：reasoning_steps、tool_calls、final_message（其中仅 tool_calls[].args 与整体外层为协议用 JSON，其余文字字段均为人类可读文本）。',
    getAgentTimeContext(),
    '',
    '【信源与 final_message 格式】',
    '1) final_message 请使用 Markdown，便于界面渲染为可点击链接。',
    '2) 若历史工具结果中出现过 web_search_exa 且 result.success：每条具体结论或事实后须附带真实信源，使用 Markdown 链接语法：[站点或标题](完整URL)。',
    '3) 链接中的 URL 必须与工具返回的 results[].url 完全一致（逐字复制），禁止编造域名或路径。',
    '4) 推荐写法示例：据某某报道（[新华网](https://www.news.cn/...)）……；文末可增加「### 参考资料」列出本次用到的全部链接。',
    '',
    workspaceSection,
    '可用 skills：',
    JSON.stringify(skills, null, 2),
    '',
    '历史工具结果：',
    toolResults.length ? JSON.stringify(toolResults, null, 2) : '[]',
    '',
    '用户消息：',
    userMessage
  ].join('\n');
}

/** 单次工具返回 JSON 序列化超过该长度则先压缩再给下一轮 agent（与「历史 toolResults 过大」问题对齐） */
const TOOL_RESULT_COMPACT_THRESHOLD_CHARS = 20000;

/**
 * `web_search_exa` 专用：在**保留 `results[].url/title` 结构**前提下缩小体积（截断 snippet、必要时减少条数），
 * 避免通用 LLM 摘要破坏 `collectWebSearchSources` 所需的数组形态。
 * @param {{ success?: boolean, results?: unknown[] } & Record<string, unknown>} result
 * @param {number} [maxChars=20000]
 * @returns {typeof result}
 */
function shrinkWebSearchResultForAgentLoop(result, maxChars = TOOL_RESULT_COMPACT_THRESHOLD_CHARS) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.results)) {
    return result;
  }
  const initialLen = JSON.stringify(result).length;
  if (initialLen <= maxChars) {
    return result;
  }
  /** @type {Array<{ title?: string, url?: string, snippet?: string, siteLabel?: string }>} */
  const results = result.results.map((item) => ({
    title: item && typeof item === 'object' ? String(item.title || '').trim() : '',
    url: item && typeof item === 'object' ? String(item.url || '').trim() : '',
    snippet: item && typeof item === 'object' ? String(item.snippet || '').trim() : '',
    siteLabel: item && typeof item === 'object' ? String(item.siteLabel || '').trim() : ''
  }));

  const pack = (arr) => ({ ...result, results: arr });
  let current = pack(results);
  let len = JSON.stringify(current).length;
  if (len <= maxChars) {
    return { ...current, _webSearchResultsShrunk: true };
  }

  const capped = results.map((r) => ({ ...r }));
  for (let maxSnippet = 2400; maxSnippet >= 160; maxSnippet = Math.floor(maxSnippet * 0.65)) {
    for (const r of capped) {
      if (r.snippet.length > maxSnippet) {
        r.snippet = `${r.snippet.slice(0, maxSnippet)}…`;
      }
    }
    current = pack(capped);
    len = JSON.stringify(current).length;
    if (len <= maxChars) {
      return { ...current, _webSearchResultsShrunk: true };
    }
  }

  let trimmed = capped.slice();
  while (trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    current = pack(trimmed);
    len = JSON.stringify(current).length;
    if (len <= maxChars) {
      return { ...current, _webSearchResultsShrunk: true };
    }
  }

  if (trimmed.length === 1) {
    const one = { ...trimmed[0] };
    while (JSON.stringify(pack([one])).length > maxChars && one.snippet.length > 80) {
      one.snippet = `${one.snippet.slice(0, Math.floor(one.snippet.length * 0.65))}…`;
    }
    return { ...pack([one]), _webSearchResultsShrunk: true };
  }

  return { ...current, _webSearchResultsShrunk: true };
}

/** 送入压缩模型的原文上限（避免摘要请求本身爆体） */
const TOOL_RESULT_COMPACT_INPUT_MAX = 250000;

/** 压缩结果硬上限（略大于目标 8k，防模型浮动） */
const TOOL_RESULT_COMPACT_OUTPUT_MAX = 12000;

/**
 * 安全估算 `JSON.stringify` 长度（循环引用时退回 `String`）。
 * @param {unknown} result
 * @returns {number}
 */
function estimateToolResultJsonChars(result) {
  try {
    return JSON.stringify(result).length;
  } catch {
    try {
      return String(result).length;
    } catch {
      return 0;
    }
  }
}

/**
 * 从 execute 返回对象上取 success（若有）。
 * @param {unknown} result
 * @returns {boolean|undefined}
 */
function getToolSuccessFlag(result) {
  if (result && typeof result === 'object' && result !== null && 'success' in result) {
    return /** @type {{ success?: boolean }} */ (result).success;
  }
  return undefined;
}

/**
 * 若单次工具输出序列化大于 {@link TOOL_RESULT_COMPACT_THRESHOLD_CHARS}，则多调一次 LLM 压成中文摘要再进入 `toolResults`。
 * @param {unknown} result - `executeSkill` 返回值
 * @param {{ skillName: string, callLLM: (messages: Array<{role:string, content:string}>, model: string, temperature?: number) => Promise<{ content?: string }>, model: string, temperature?: number }} opts
 * @returns {Promise<unknown>}
 */
async function maybeCompactToolResultForAgentLoop(result, opts) {
  const { skillName, callLLM, model, temperature = 0.15 } = opts;
  if (skillName === 'web_search_exa') {
    return shrinkWebSearchResultForAgentLoop(
      /** @type {{ success?: boolean, results?: unknown[] } & Record<string, unknown>} */ (result),
      TOOL_RESULT_COMPACT_THRESHOLD_CHARS
    );
  }
  const fullLen = estimateToolResultJsonChars(result);
  if (fullLen <= TOOL_RESULT_COMPACT_THRESHOLD_CHARS) {
    return result;
  }

  let serialized;
  try {
    serialized = JSON.stringify(result);
  } catch {
    serialized = String(result);
  }

  const slice =
    serialized.length > TOOL_RESULT_COMPACT_INPUT_MAX
      ? `${serialized.slice(0, TOOL_RESULT_COMPACT_INPUT_MAX)}\n…(输入已截断至${TOOL_RESULT_COMPACT_INPUT_MAX}字符)`
      : serialized;

  const sys = `你是工具输出压缩助手。下列文本是一次技能「${skillName}」返回结果的 JSON 序列化，约 ${fullLen} 字符，超过下游提示词安全上限。
请用**中文**将其压缩为供下一轮语言模型阅读的摘要，严格控制在 **8000 汉字以内**。
必须保留：success/失败与 error 信息、关键数字与型号、数组条数、重要的 id/name/url（可缩写为要点或表格）。
不要编造未出现的内容。输出纯 Markdown 或纯文本，不要用 JSON 代码块包裹整段输出。`;

  let summary = '';
  try {
    const resp = await callLLM(
      [
        { role: 'system', content: sys },
        { role: 'user', content: slice }
      ],
      model,
      temperature
    );
    summary = String(resp?.content || '').trim();
  } catch {
    summary = '';
  }

  const successFlag = getToolSuccessFlag(result);

  if (!summary) {
    const hardCap = Math.min(TOOL_RESULT_COMPACT_THRESHOLD_CHARS - 500, 19500);
    return {
      success: successFlag,
      _toolOutputCompacted: true,
      _compactionFailed: true,
      _skillName: skillName,
      _originalJsonChars: fullLen,
      compactSummary: `${serialized.slice(0, hardCap)}\n…(LLM 压缩失败，已硬截断)`
    };
  }

  if (summary.length > TOOL_RESULT_COMPACT_OUTPUT_MAX) {
    summary = `${summary.slice(0, TOOL_RESULT_COMPACT_OUTPUT_MAX)}…`;
  }

  return {
    success: successFlag,
    _toolOutputCompacted: true,
    _skillName: skillName,
    _originalJsonChars: fullLen,
    compactSummary: summary
  };
}

/**
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function clampPlainText(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * 工具入参：聊天区「思考块」展示用纯文本（非 JSON）
 * @param {string} skillName
 * @param {unknown} args
 * @param {number} [maxChars=3600]
 * @returns {string}
 */
function toolArgsPlainTextForUi(skillName, args, maxChars = 3600) {
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  /** @type {string[]} */
  const lines = [];

  switch (skillName) {
    case 'scheme_design_skill': {
      lines.push(`需求：${clampPlainText(String(a.userRequirement || '（未给出）'), 1400)}`);
      const add = String(a.additionalContextFromAgent || '').trim();
      if (add) lines.push(`代理补充上下文：${clampPlainText(add, 900)}`);
      lines.push(`是否执行库内 BOM/需求分析：${a.runBomAnalysis === false ? '否（仅方案骨架）' : '是'}`);
      break;
    }
    case 'completion_suggestion_skill': {
      lines.push(`需求语境：${clampPlainText(String(a.userRequirement || ''), 1000)}`);
      lines.push('待补全的缺件或模糊描述：');
      const md = a.missingDescriptions;
      if (Array.isArray(md)) {
        md.forEach((x, i) => {
          const t = String(x || '').trim();
          if (t) lines.push(`  ${i + 1}. ${t}`);
        });
      } else if (typeof md === 'string') {
        md
          .split(/[,，;；\n]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .forEach((x, i) => lines.push(`  ${i + 1}. ${x}`));
      } else {
        lines.push('  （无）');
      }
      const add = String(a.additionalContextFromAgent || '').trim();
      if (add) lines.push(`补充上下文（检索摘录等）：${clampPlainText(add, 700)}`);
      break;
    }
    case 'web_search_exa': {
      lines.push(`检索词：${String(a.query || '（沿用当前用户问题）').trim()}`);
      lines.push(`返回条数：${typeof a.numResults === 'number' ? a.numResults : 5}`);
      lines.push(`模式：${String(a.type || 'fast')}`);
      break;
    }
    case 'summarize_skill': {
      const tx = String(a.text ?? '').trim();
      if (tx) lines.push(`待摘要正文片段：${clampPlainText(tx, 1600)}`);
      const urls = Array.isArray(a.urls) ? a.urls.map((u) => String(u || '').trim()).filter(Boolean) : [];
      if (urls.length) {
        lines.push('待抓取摘要的链接：');
        urls.slice(0, 8).forEach((u, i) => lines.push(`  ${i + 1}. ${u}`));
      }
      if (a.length) lines.push(`篇幅：${String(a.length)}`);
      if (a.focus) lines.push(`侧重：${clampPlainText(String(a.focus), 400)}`);
      if (!tx && !urls.length) lines.push('（未提供 text 或 urls）');
      break;
    }
    case 'wiring_edit_skill': {
      lines.push(`连线意图/规则：${clampPlainText(String(a.wiringRules || ''), 1200)}`);
      const exp = String(a.expectedComponentsFromAgent || '').trim();
      if (exp) lines.push(`方案所需元件摘要：${clampPlainText(exp, 900)}`);
      const add = String(a.additionalContextFromAgent || '').trim();
      if (add) lines.push(`补充说明：${clampPlainText(add, 600)}`);
      lines.push(`应用到画布：${a.applyToCanvas === false ? '否（仅生成计划）' : '是'}`);
      lines.push(`跳过 LLM 计划：${a.skipLlmPlan === true ? '是（使用传入操作表）' : '否'}`);
      const n = Array.isArray(a.plannedOperations) ? a.plannedOperations.length : 0;
      if (a.skipLlmPlan && n) lines.push(`预制操作条数：${n}`);
      if (a.canvasSnapshot && typeof a.canvasSnapshot === 'object') {
        lines.push('（已附带画布快照，由引擎解析。）');
      }
      break;
    }
    case 'firmware_codegen_skill': {
      lines.push(`改动目标：${clampPlainText(String(a.userRequirement || ''), 1200)}`);
      lines.push(`目标文件：${String(a.targetPath || '(memory)')}`);
      lines.push(`语言：${String(a.language || 'arduino')}`);
      const code = String(a.codeText || '').trim();
      if (code) lines.push(`现有代码片段：${clampPlainText(code, 1400)}`);
      const add = String(a.additionalContextFromAgent || '').trim();
      if (add) lines.push(`补充上下文：${clampPlainText(add, 700)}`);
      break;
    }
    default:
      try {
        lines.push(clampPlainText(JSON.stringify(a, null, 2), maxChars));
      } catch {
        lines.push(clampPlainText(String(args), maxChars));
      }
  }

  const out = lines.join('\n').trim();
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}

/**
 * 单条补全建议对象格式化为可读行
 * @param {unknown} row
 * @param {number} idx
 * @returns {string}
 */
function formatCompletionSuggestionRow(row, idx) {
  if (!row || typeof row !== 'object') return `${idx + 1}. （无数据）`;
  const input = String(row.inputDescription || '').trim() || '（描述）';
  const mods = Array.isArray(row.suggestedModules) ? row.suggestedModules.filter(Boolean) : [];
  const modLine = mods.length ? mods.map((m) => String(m).trim()).join('、') : '（无型号建议）';
  const notes = String(row.notes || '').trim();
  let s = `${idx + 1}. 针对「${input}」\n   建议模块：${modLine}`;
  if (notes) s += `\n   备注：${notes}`;
  return s;
}

/**
 * 工具返回：聊天区「思考块」展示用纯文本（非 JSON）
 * @param {string} skillName
 * @param {unknown} result
 * @param {number} [maxChars=4800]
 * @returns {string}
 */
function toolResultPlainTextForUi(skillName, result, maxChars = 4800) {
  if (result == null) return '';
  if (typeof result === 'object' && typeof result.compactSummary === 'string' && result.compactSummary.trim()) {
    return clampPlainText(result.compactSummary.trim(), maxChars);
  }
  if (typeof result === 'object' && result.success === false) {
    const err = result.error != null ? String(result.error) : '';
    return err ? `未成功：${err}` : '未成功';
  }

  /** @type {unknown} */
  let payload = result;
  if (
    skillName !== 'web_search_exa' &&
    result &&
    typeof result === 'object' &&
    result.data != null &&
    typeof result.data === 'object'
  ) {
    payload = result.data;
  }

  /** @type {string[]} */
  const lines = [];

  switch (skillName) {
    case 'web_search_exa': {
      const o = payload && typeof payload === 'object' ? payload : {};
      if (o.success === false) {
        return String(o.error || '检索失败');
      }
      const arr = Array.isArray(o.results) ? o.results : [];
      if (!arr.length) {
        lines.push('（无结果条目）');
        break;
      }
      lines.push(`共 ${arr.length} 条，摘要如下：`);
      arr.slice(0, 10).forEach((r, i) => {
        const title = String(r?.title || '').trim() || '(无标题)';
        const url = String(r?.url || '').trim();
        const snip = clampPlainText(String(r?.snippet || '').trim(), 280);
        if (url) lines.push(`${i + 1}. ${title}\n   ${url}${snip ? `\n   ${snip}` : ''}`);
        else lines.push(`${i + 1}. ${title}${snip ? `\n   ${snip}` : ''}`);
      });
      break;
    }
    case 'scheme_design_skill': {
      const d = payload && typeof payload === 'object' ? payload : {};
      const sd = d.schemeDesignResult && typeof d.schemeDesignResult === 'object' ? d.schemeDesignResult : null;
      const ar = d.analysisResult && typeof d.analysisResult === 'object' ? d.analysisResult : null;
      if (result && typeof result === 'object' && result.error && !sd && !ar) {
        lines.push(`说明：${String(result.error)}`);
      }
      if (sd) {
        if (sd.summary) lines.push(`方案摘要：${String(sd.summary).trim()}`);
        const nar = String(sd.narrative || '').trim();
        if (nar && nar !== String(sd.summary || '').trim()) {
          lines.push(`方案说明：${clampPlainText(nar, 2000)}`);
        }
      }
      if (ar) {
        if (ar.summary) lines.push(`库匹配结论：${clampPlainText(String(ar.summary).trim(), 2200)}`);
        const n = Array.isArray(ar.components) ? ar.components.length : 0;
        if (n) lines.push(`本轮比对元件库条目：${n} 条`);
      }
      if (!lines.length) lines.push('（无结构化摘要，执行已完成）');
      break;
    }
    case 'completion_suggestion_skill': {
      const d = payload && typeof payload === 'object' ? payload : {};
      const summary = String(d.summary || '').trim();
      if (summary) lines.push(`小结：${summary}`);
      const sug = Array.isArray(d.suggestions) ? d.suggestions : [];
      if (sug.length) {
        lines.push('型号与模块建议：');
        sug.forEach((row, i) => lines.push(formatCompletionSuggestionRow(row, i)));
      } else if (!summary) lines.push('（无建议条目）');
      break;
    }
    case 'summarize_skill': {
      const d = payload && typeof payload === 'object' ? payload : {};
      const summary = String(d.summary || '').trim();
      if (summary) lines.push(summary);
      const bullets = Array.isArray(d.bullets) ? d.bullets : [];
      if (bullets.length) {
        lines.push('');
        bullets.forEach((b, i) => lines.push(`• ${String(b || '').trim() || `要点 ${i + 1}`}`));
      }
      if (!summary && !bullets.length) {
        const pe = String(d.parseError || '').trim();
        lines.push(pe || '（无摘要输出）');
      }
      break;
    }
    case 'wiring_edit_skill': {
      const d = payload && typeof payload === 'object' ? payload : {};
      const vs = String(d.canvasVsScheme || '').trim();
      if (vs) lines.push(`画布与方案比对：${vs}`);
      const miss = Array.isArray(d.missingPartsSummary) ? d.missingPartsSummary : [];
      if (miss.length) {
        lines.push('仍缺元件（模型判断）：');
        miss.slice(0, 12).forEach((x, i) => lines.push(`  ${i + 1}. ${clampPlainText(String(x), 200)}`));
      }
      const fu = String(d.userFollowUpHint || '').trim();
      if (fu) lines.push(`后续指引：${clampPlainText(fu, 1200)}`);
      if (d.schemeContextAutoInjected === true) lines.push('（附前序方案/BOM 参考，可选阅读）');
      const rat = String(d.rationale || '').trim();
      if (rat) lines.push(`计划说明：${clampPlainText(rat, 2400)}`);
      const ops = Array.isArray(d.plannedOperations) ? d.plannedOperations : [];
      lines.push(`拟定连线操作：${ops.length} 条`);
      ops.slice(0, 12).forEach((op, i) => {
        let label = `操作 ${i + 1}`;
        if (op && typeof op === 'object') {
          const typ = String(op.type || op.op || '').trim();
          const desc = String(op.description || op.reason || '').trim();
          if (typ && desc) label = `${typ}：${clampPlainText(desc, 200)}`;
          else if (typ) label = typ;
          else if (desc) label = clampPlainText(desc, 200);
        } else if (op != null) label = String(op);
        lines.push(`  ${i + 1}. ${label}`);
      });
      if (ops.length > 12) lines.push(`  … 其余 ${ops.length - 12} 条已省略`);
      break;
    }
    case 'firmware_codegen_skill': {
      const d = payload && typeof payload === 'object' ? payload : {};
      const cg = d.canvasGuidance && typeof d.canvasGuidance === 'object' ? d.canvasGuidance : null;
      if (cg) {
        const gk = String(cg.gapKind || '').trim();
        if (gk) lines.push(`固件画布缺口：${gk}（missing_parts=缺件 / missing_wiring=缺连线 / ready=可引脚级）`);
        const phase = String(cg.phase || '').trim();
        if (phase) lines.push(`画布阶段：${phase}`);
        const hint = String(cg.userFacingHint || '').trim();
        if (hint) lines.push(`引导：${clampPlainText(hint, 1200)}`);
        const next = Array.isArray(cg.recommendedNextSkills) ? cg.recommendedNextSkills : [];
        if (next.length) lines.push(`建议后续 skill：${next.join('、')}`);
        const pins = Array.isArray(cg.pinBindings) ? cg.pinBindings : [];
        if (pins.length) {
          lines.push('引脚映射（节选）：');
          pins.slice(0, 8).forEach((row, i) => {
            if (row && typeof row === 'object') {
              const line = String(row.codeLine || row.pinName || '').trim();
              lines.push(`  ${i + 1}. ${line || JSON.stringify(row)}`);
            } else lines.push(`  ${i + 1}. ${String(row)}`);
          });
        }
      }
      const ca = d.canvasAnalysis && typeof d.canvasAnalysis === 'object' ? d.canvasAnalysis : null;
      if (d.schemeContextAutoInjected === true) lines.push('（附前序方案/BOM 参考，可选阅读）');
      if (ca && String(ca.readiness || '').trim()) {
        const gk = String(ca.gapKind || '').trim();
        lines.push(
          `画布结构：${String(ca.readiness)}${gk ? ` / gapKind=${gk}` : ''}（元件 ${ca.componentCount ?? '?'}/连线 ${ca.connectionCount ?? '?'}）`
        );
      }
      const summary = String(d.summary || '').trim();
      if (summary) lines.push(`修改摘要：${clampPlainText(summary, 2000)}`);
      const plan = Array.isArray(d.patchPlan) ? d.patchPlan : [];
      lines.push(`补丁步骤：${plan.length} 条`);
      plan.slice(0, 8).forEach((row, i) => {
        if (row && typeof row === 'object') {
          const op = String(row.op || '').trim();
          const desc = String(row.description || '').trim();
          lines.push(`  ${i + 1}. ${op || 'step'}${desc ? `：${clampPlainText(desc, 180)}` : ''}`);
        } else {
          lines.push(`  ${i + 1}. ${String(row)}`);
        }
      });
      const patch = String(d.patch || '').trim();
      if (patch) lines.push(`diff 片段：\n${clampPlainText(patch, 1200)}`);
      const notes = Array.isArray(d.notes) ? d.notes : [];
      if (notes.length) lines.push(`说明：${notes.slice(0, 4).map((x) => String(x || '').trim()).join('；')}`);
      break;
    }
    default:
      try {
        lines.push(clampPlainText(JSON.stringify(payload, null, 2), maxChars));
      } catch {
        lines.push(clampPlainText(String(payload), maxChars));
      }
  }

  const out = lines.join('\n').trim();
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}

module.exports = {
  extractBalancedJsonObject,
  getSkillsForAgentList,
  isRealtimeQuery,
  needsWebSearchPriority,
  getAgentTimeContext,
  parseJsonLoose,
  normalizeReasoningStepEntries,
  sanitizeAgentFinalMessage,
  extractRenderableMarkdownFromAgentSynthesis,
  toolArgsPlainTextForUi,
  toolResultPlainTextForUi,
  normalizeToolCalls,
  getSiteLabelFromUrl,
  normalizeWebSearchToolResult,
  collectWebSearchSources,
  appendWebSearchReferencesMarkdown,
  getSkillChainShortName,
  getSkillProgressSlug,
  clampSkillsPhaseLabel,
  getSkillBatchInvokePhaseLabel,
  getSkillResultPhaseLabel,
  buildSkillsAgentUserPrompt,
  TOOL_RESULT_COMPACT_THRESHOLD_CHARS,
  estimateToolResultJsonChars,
  shrinkWebSearchResultForAgentLoop,
  maybeCompactToolResultForAgentLoop
};
