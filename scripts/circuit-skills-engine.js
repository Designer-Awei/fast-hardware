/**
 * Fast Hardware — 渲染进程 **Skills 执行引擎**（`CircuitSkillsEngine`）
 *
 * **与旧版区别**：不再承担「按钮分阶段 / 端到端自动落盘」的 workflow；主对话由 `chat.js` 的 **agent loop**
 * 统一调度，模型自主 `tool_calls`。本文件仅提供 **可被 agent 调用的技能实现**（LLM、Exa、元件库读盘等）。
 *
 * **推荐编排（产品语义，由 agent 提示词引导，非硬编码流水线）**：
 * 1. 新电路/方案类问题：优先 `scheme_design_skill`（`runSchemeDesign` + 可选 `runRequirementAnalysis`）→
 *    库内可复用件（matchedKey）+ 缺件/不满足项的文字建议（exists=0）。
 * 2. 若缺件仍无具体模块型号：再按需 `completion_suggestion_skill`、必要时 `web_search_exa`，最后在 `final_message` 合并输出。
 * 3. `summarize_skill`：对长文/对话摘录做结构化摘要（应用内 LLM，非外部 summarize CLI）。
 * 4. `wiring_edit_skill`：用户明确要改画布连线时执行。
 *
 * **样式**：渲染 HTML 仍带 `workflow-*` class 名，与 `styles/components.css` 选择器一致（非业务 workflow）。
 *
 * @fileoverview 电路类 skills 的浏览器侧实现（供 `executeSkill` / agent 调用）
 */

/**
 * 从文本中提取首个花括号深度配平的 `{ ... }` 子串（尊重 JSON 字符串内的引号与转义）。
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
 * 规整 LLM 返回的 BOM 包装形态为带 `components[]` 的根对象。
 * @param {unknown} parsed
 * @returns {Record<string, unknown>|null}
 */
function normalizeBomAnalysisRoot(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = /** @type {Record<string, any>} */ (parsed);
    if (Array.isArray(o.components)) return o;
    const wrapKeys = ['data', 'result', 'analysis', 'bom', 'output'];
    for (const key of wrapKeys) {
        const inner = o[key];
        if (inner && typeof inner === 'object' && !Array.isArray(inner) && Array.isArray(inner.components)) {
            return {
                ...inner,
                summary:
                    inner.summary != null && String(inner.summary).trim() !== ''
                        ? inner.summary
                        : o.summary != null
                          ? o.summary
                          : inner.summary
            };
        }
    }
    return null;
}

/**
 * 浏览器端取画布分析实现（由 `canvas-snapshot-for-firmware.js` 注入 `window`）
 * @returns {typeof window.fastHardwareCanvasSnapshotForFirmware}
 */
function getFirmwareCanvasSnapshotHelpers() {
    if (
        typeof window !== 'undefined' &&
        window.fastHardwareCanvasSnapshotForFirmware &&
        typeof window.fastHardwareCanvasSnapshotForFirmware.analyzeCanvasSnapshotForFirmware === 'function'
    ) {
        return window.fastHardwareCanvasSnapshotForFirmware;
    }
    console.warn('[firmware] fastHardwareCanvasSnapshotForFirmware 未加载，画布分析降级');
    const deriveFirmwareGapKind = (readiness) => {
        if (readiness === 'snapshot_error') return 'snapshot_error';
        if (readiness === 'empty') return 'missing_parts';
        if (readiness === 'structurally_complete') return 'ready';
        return 'missing_wiring';
    };
    const firmwareGapKindToPhase = (gapKind) => {
        if (gapKind === 'missing_parts') return 'empty_canvas';
        if (gapKind === 'ready') return 'ready_pin_level';
        return 'wiring_incomplete';
    };
    const analyzeCanvasSnapshotForFirmware = () => ({
        readiness: 'snapshot_error',
        gapKind: 'snapshot_error',
        issues: ['画布分析脚本未加载'],
        componentCount: 0,
        connectionCount: 0,
        invalidConnectionIds: [],
        disconnectedInstanceIds: [],
        projectName: ''
    });
    const stringifyCanvasSnapshotForPrompt = (snap, n) => {
        try {
            const t = JSON.stringify(snap ?? {}, null, 2);
            const max = typeof n === 'number' ? n : 10000;
            return t.length <= max ? t : `${t.slice(0, max)}\n…（已截断）`;
        } catch {
            return '{}';
        }
    };
    const buildFirmwareCanvasGuidanceFallback = (analysis) => {
        const gapKind = analysis.gapKind || deriveFirmwareGapKind(analysis.readiness);
        const phase = firmwareGapKindToPhase(gapKind);
        let userFacingHint = '';
        /** @type {string[]} */
        let recommendedNextSkills = [];
        if (gapKind === 'missing_parts') {
            userFacingHint =
                '判定为**缺件**（画布空或尚未摆放齐方案所需元件）。下方为基于当前信息的初步补丁，请勿为尚未上板的器件写死引脚；请先补全元件再上画布，再继续连线与固件迭代。';
            recommendedNextSkills = ['scheme_design_skill', 'completion_suggestion_skill'];
        } else if (gapKind === 'missing_wiring') {
            const detail = analysis.issues.length ? analysis.issues.join('；') : '连线未完成或存在无效连接';
            userFacingHint = `判定为**缺连线**（${detail}）。请由 agent **先调用 wiring_edit_skill** 按当前画布补全连线，再重新调用本 skill 生成引脚级固件。`;
            recommendedNextSkills = ['wiring_edit_skill'];
        } else if (gapKind === 'snapshot_error') {
            userFacingHint =
                '无法可靠读取画布，已采用保守策略生成补丁。请确认项目与画布已打开后重试。';
            recommendedNextSkills = [];
        } else {
            userFacingHint = '画布结构完整；补丁中的引脚常量请与画布逐一对照。';
            recommendedNextSkills = [];
        }
        return { phase, userFacingHint, pinBindings: [], recommendedNextSkills, gapKind };
    };
    const mergeFirmwareCanvasGuidance = (llmRaw, analysis) => {
        const base = buildFirmwareCanvasGuidanceFallback(analysis);
        const expectedPhase = base.phase;
        const g = llmRaw && typeof llmRaw === 'object' ? llmRaw : {};
        const valid = new Set(['empty_canvas', 'wiring_incomplete', 'ready_pin_level']);
        let phase = String(g.phase || '').trim();
        if (!valid.has(phase)) phase = expectedPhase;
        if (phase !== expectedPhase) phase = expectedPhase;
        const userFacingHint = String(g.userFacingHint || '').trim() || base.userFacingHint;
        const pinBindings = Array.isArray(g.pinBindings) ? g.pinBindings : [];
        return {
            phase,
            userFacingHint,
            pinBindings,
            recommendedNextSkills: base.recommendedNextSkills,
            gapKind: base.gapKind
        };
    };
    return {
        analyzeCanvasSnapshotForFirmware,
        stringifyCanvasSnapshotForPrompt,
        deriveFirmwareGapKind,
        firmwareGapKindToPhase,
        buildFirmwareCanvasGuidanceFallback,
        mergeFirmwareCanvasGuidance
    };
}

/**
 * 电路方案 Skills 引擎：供 agent 按需调用，非端到端工作流控制器
 */
class CircuitSkillsEngine {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.currentSkillState = null; // 当前 skills 状态
    }

    /**
     * 更新聊天区「阶段 · 用时 n S」中的阶段文案（优先走 ChatManager，以保留 skills 用时定时器）
     * @param {string} phase - 短阶段说明
     * @returns {void}
     */
    _notifyAgentProgressPhase(phase) {
        const p = String(phase || '').trim();
        if (!p) return;
        if (typeof window !== 'undefined' && window.fastHardwareSkillsProgress?.emit) {
            window.fastHardwareSkillsProgress.emit({ type: 'phase', phase: p, source: 'skills_engine' });
            return;
        }
        if (this.chatManager && typeof this.chatManager.setSkillsFlowPhaseLabel === 'function') {
            this.chatManager.setSkillsFlowPhaseLabel(p);
            return;
        }
        if (this.chatManager && typeof this.chatManager.setTypingIndicatorText === 'function') {
            this.chatManager.setTypingIndicatorText(p);
        }
    }

    /**
     * 需求分析 JSON 解析失败时输出可复制的原文片段，便于排查模型格式
     * @param {string} attemptLabel - 如「首次」「重试」
     * @param {string} raw - LLM 原始文本
     * @returns {void}
     */
    _debugLogRequirementAnalysisRaw(attemptLabel, raw) {
        const s = String(raw || '');
        const len = s.length;
        console.error(`[requirement-analysis] ${attemptLabel} — 原始文本长度:`, len);
        if (!len) {
            console.error(`[requirement-analysis] ${attemptLabel} — 内容为空（检查主进程 LLM 是否超时/限流）`);
            return;
        }
        const head = s.slice(0, 600);
        const tail = len > 600 ? s.slice(-400) : '';
        console.error(`[requirement-analysis] ${attemptLabel} — 前600字符:\n`, head);
        if (tail) {
            console.error(`[requirement-analysis] ${attemptLabel} — 后400字符:\n`, tail);
        }
        console.error(`[requirement-analysis] ${attemptLabel} — 含 \`\`\` 围栏:`, /```/.test(s));
        const braceFirst = s.indexOf('{');
        const braceLast = s.lastIndexOf('}');
        console.error(
            `[requirement-analysis] ${attemptLabel} — 首{下标=${braceFirst} 末}下标=${braceLast}`
        );
    }

    /**
     * 调用 Exa MCP Web Search（ClawHub: exa-web-search-free）
     * @param {string} query - 搜索查询
     * @param {{numResults?: number, type?: 'auto'|'fast'|'deep'}} [options]
     * @returns {Promise<{success:boolean, results:Array<any>, raw?:string, error?:string}>}
     */
    async webSearchExa(query, options = {}) {
        try {
            if (!window?.electronAPI?.webSearchExa) {
                return { success: false, results: [], error: 'webSearchExa 未暴露到 electronAPI' };
            }
            // 与 skills 进度条一致：走阶段标签，保留「用时 n S」
            this._notifyAgentProgressPhase('检索补充资料');
            const result = await window.electronAPI.webSearchExa(query, options);
            if (result && typeof result === 'object') {
                return {
                    success: !!result.success,
                    results: Array.isArray(result.results) ? result.results : [],
                    raw: result.raw,
                    error: result.error
                };
            }
            return { success: false, results: [], error: 'webSearchExa 返回格式错误' };
        } catch (error) {
            console.error('❌ webSearchExa 调用失败:', error);
            return { success: false, results: [], error: error?.message || String(error) };
        }
    }

    /**
     * 从 recommendation 文本提取“看起来像具体型号”的首段内容。
     * 设计目标：让自动补全用的是具体型号，而不是“建议选用/外购/原因说明”。
     * @param {string} recommendation
     * @returns {string}
     */
    _extractModelNameFromRecommendation(recommendation) {
        const raw = String(recommendation || '').trim();
        if (!raw) return raw;

        // 优先从“建议使用/推荐选用/建议采用”之后提取型号，避免把被否定的型号误当推荐型号
        const preferredKeywords = ['建议使用', '建议选用', '推荐使用', '推荐选用', '建议采用', '优先选用'];
        for (const kw of preferredKeywords) {
            const idx = raw.indexOf(kw);
            if (idx >= 0) {
                const tail = raw.slice(idx, idx + 120);
                const digitModel = tail.match(/([A-Za-z][A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)/);
                if (digitModel?.[1]) return digitModel[1];

                // 电容类：允许数字开头的标称（0.1uF / 10uF / 100nF）
                const digitFirstModel = tail.match(/(\d+(?:\.\d+)?\s*[A-Za-z][A-Za-z0-9\-]*)/);
                if (digitFirstModel?.[1]) return digitFirstModel[1].replace(/\s+/g, '');

                // “建议使用 xxx模块”但尾部没有具体型号 token：返回空，让调用方触发 web search
                return '';
            }
        }

        // 优先提取“带数字/连字符”的型号片段（如 MAX9814 / SG90 / STM32F103C8T6 / std-led-234011）
        const digitModel = raw.match(/([A-Za-z][A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)/);
        if (digitModel?.[1]) return digitModel[1];

        // 允许“数字开头 + 单位/后缀”的型号片段（如 0.1uF / 10uF / 100nF）
        const digitFirstModel = raw.match(/(\d+(?:\.\d+)?\s*[A-Za-z][A-Za-z0-9\-]*)/);
        if (digitFirstModel?.[1]) return digitFirstModel[1].replace(/\s+/g, '');

        // 再兜底提取一个字母开头的 token
        const token = raw.match(/([A-Za-z][A-Za-z0-9\-]*)/);
        if (token?.[1]) return token[1];

        // 兜底：尽量去掉常见前缀后取第一段
        const stripped = raw.replace(/^(?:具体型号建议|具体型号|建议选用|推荐选用|建议|推荐|外购|请选择|可选|建议使用|推荐使用)\s*/i, '');
        const parts = stripped.split(/[，,。.;；\n\r]/).map(s => s.trim()).filter(Boolean);
        return parts[0] || stripped;
    }

    /**
     * 判断候选元件名是否“足够具体”（用于避免生成占位符）。
     * @param {string} modelCandidate - 候选型号/名称
     * @returns {boolean}
     */
    _isConcreteModelCandidate(modelCandidate) {
        const s = String(modelCandidate || '').trim();
        if (!s) return false;

        // 过滤“过短的数字+字母片段”（例如 4B 这种经常来自“适用于树莓派4B/5”的上下文，
        // 容易把平台/环境 token 当成元件型号，导致后续生成 pins 严重偏移）
        if (/^\d+[A-Za-z]$/i.test(s) && s.length <= 3) return false;

        // 只要出现数字，通常就是具体型号（MAX9814/SG90/std-led-234011/0.1uF 等）
        // 但像 ESP32 这种“家族名”本身虽然含数字，但常常不够具体，需要具体到子型号（如 ESP32-C3）。
        if (/^esp32$/i.test(s)) return false;
        if (/\d/.test(s)) return true;

        // 常见“泛称/类别名”直接判定为不具体
        const genericTokens = [
            '传感器', '执行器', '电源', '电池', '电阻', '电容', '开关', '辅助', '主控', '模块', '器件', 'device', 'module'
        ];
        return !genericTokens.some(t => s.includes(t));
    }

    /**
     * 从 web search results 里尽可能抽取“具体型号 token”
     * @param {Array<any>} results
     * @param {string} [missingNameHint=''] - 缺失元件名称，用于更精准抽取（如 电容/电阻/声音传感器）
     * @returns {string|null}
     */
    _extractModelFromWebSearchResults(results, missingNameHint = '') {
        if (!Array.isArray(results)) return null;

        const textAgg = results.map((r) => {
            const title = r?.title ? String(r.title) : '';
            const snippet = r?.snippet ? String(r.snippet) : '';
            const url = r?.url ? String(r.url) : '';
            return [title, snippet, url].filter(Boolean).join('\n');
        }).join('\n');

        // 为了避免“缺失元件=电容但抽到KY-038”这种错误，这里优先按缺失元件名做针对性抽取：
        const missingHint = String(missingNameHint || '').trim();

        // 电容：优先抽取电容标称（0.1uF / 10uF / 100nF / 1uF ...）
        if (missingHint.includes('电容')) {
            const cap = textAgg.match(/(\d+(?:\.\d+)?\s*(?:uF|UF|nF|NF|pF|PF))/i);
            if (cap?.[1]) return cap[1].replace(/\s+/g, '').toLowerCase().replace(/uf$/, 'uF');
            // 如果没匹配到电容标称，避免走通用回退抽到如 ESP32 这种无关 token
            return null;
        }

        // 电阻：优先抽取欧姆标称（如 220Ω / 10kΩ）
        if (missingHint.includes('电阻')) {
            const res = textAgg.match(/(\d+(?:\.\d+)?\s*(?:[kK][oO]hm|[kKΩ]|Ω|ohm))/);
            if (res?.[1]) return res[1].replace(/\s+/g, '');
            // 如果没匹配到电阻标称，避免走通用回退抽到如 ESP32 这种无关 token
            return null;
        }

        // 声音/麦克风：优先从包含语音/麦克风关键词的标题/摘要里抽 token
        if (missingHint.includes('声音') || missingHint.includes('麦克风') || missingHint.includes('microphone')) {
            const audioHit = results.find((r) => {
                const t = `${r?.title || ''} ${r?.snippet || ''}`.toLowerCase();
                return t.includes('sound') || t.includes('voice') || t.includes('microphone') || t.includes('声音') || t.includes('麦克风');
            });
            if (audioHit) {
                const localText = `${audioHit?.title || ''}\n${audioHit?.snippet || ''}`;
                const mAudio = localText.match(/([A-Za-z][A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)/);
                if (mAudio?.[1]) return mAudio[1];
            }
            // 若没从音频相关结果中抽到具体型号，避免回退抽到无关数字 token
            return null;
        }

        // 舵机/电机/云台：优先抽取常见舵机型号 token，避免误抽到“树莓派/平台”上下文 token
        if (/(舵机|servo|电机|motor|云台|pan-tilt|pan-tilt)/i.test(missingHint)) {
            const servoHit =
                textAgg.match(/\b(?:SG\d{2,3}|MG\d{2,3}|DS\d{2,3}|HS[-]?\d{2,3}|SG90|MG90S|DS3218)\b/i) ||
                textAgg.match(/\b(?:SG90|SG92|MG90S)\b/i);
            if (servoHit?.[0]) return servoHit[0];

            // 否则从带数字/字母的候选 token 中过滤掉树莓派/raspberry pi
            const tokens = Array.from(textAgg.matchAll(/([A-Za-z][A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)/g)).map((m) => m?.[1]).filter(Boolean);
            const filtered = tokens.filter(t => !/(树莓派|raspberry\s*pi|pi\s*\d+)/i.test(t));
            if (filtered[0]) return filtered[0];
        }

        // 通用策略：优先：带数字+字母的型号 token（MAX9814 / STM32F103C8T6 / SG90）
        const m1 = textAgg.match(/([A-Za-z][A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)/);
        if (m1?.[1]) return m1[1];

        // 再兜底：允许数字开头的标称 token（如 0.1uF）
        const m2 = textAgg.match(/(\d+(?:\.\d+)?\s*[A-Za-z][A-Za-z0-9\-]*)/);
        if (m2?.[1]) return m2[1].replace(/\s+/g, '');

        return null;
    }

    /**
     * 运行方案设计阶段：对用户需求做简明分析并给出元件预估参数
     * @param {string} userRequirement - 用户需求描述
     * @returns {Promise<Object>} 方案设计结果 { summary, estimatedParams, narrative }
     */
    async runSchemeDesign(userRequirement) {
        console.log('📐 [scheme→方案设计] 开始', {
            userRequirementPreview: String(userRequirement || '').slice(0, 160),
            userRequirementChars: String(userRequirement || '').length
        });
        this._notifyAgentProgressPhase('scheme-design 拟定方案');

        const systemPrompt = `你是一名专业的硬件工程师。根据用户的电路/产品需求，做**简明方案设计分析**，输出结构化结果。

任务：
1. 用 1～2 句话概括方案目标与核心功能。
2. **从方案所需组件类型角度**，明确需要哪些大类（便于后续不遗漏元件）：
   - 主控、电源、传感器、**执行器**（电机/舵机/云台电机等）、必要辅助元件（开关、电阻等）。
   - 若方案涉及运动、机械、云台、无人机、机械臂等，**必须明确写出执行器需求**（如直流电机、舵机、步进电机、云台电机等）。
3. 根据需求推断**元件预估参数**（以下字段按需填写，无明确需求可写"无特殊要求"）：
   - 主控：型号/性能倾向（如低功耗 MCU、带 WiFi 的主控）
   - 体积/大小：尺寸或便携性要求
   - 续航/供电：电池容量、待机时长、供电方式等
   - 接口：需要的通信或外设接口（如 I2C、SPI、USB、蓝牙等）
   - 其他：精度、防护、成本、**执行器类型/数量**等若有提及则简要写出

4. 生成 webSearchQueries：若方案中能明确至少一类关键器件（传感器/执行器/主控/电源），尽量给出 2~4 条用于补强“具体型号/模块/接口要点”的检索查询字符串（最多 4 条）；若无法确定返回空数组 []。

只返回如下 JSON，不要其他内容：
{
  "summary": "一句话方案概述",
  "estimatedParams": {
    "mcu": "主控参数描述",
    "size": "体积/大小范围",
    "batteryLife": "续航/供电相关",
    "interfaces": "接口要求",
    "other": "其他参数"
  },
  "narrative": "2～4 句简明分析文字，便于用户阅读",
  "webSearchQueries": [
  ]
}`;

        const userPrompt = `用户需求：${userRequirement}`;

        const response = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
            temperature: 0.3
        });

        let schemeResult;
        try {
            const content = response.content.trim();
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                content.match(/```\s*([\s\S]*?)\s*```/) ||
                [null, content];
            const jsonStr = jsonMatch[1] || content;
            schemeResult = JSON.parse(jsonStr);
        } catch (error) {
            console.error('❌ 解析方案设计响应失败:', error);
            schemeResult = {
                summary: '方案设计解析失败',
                estimatedParams: {},
                narrative: '未能解析出结构化方案，您可直接点击「开始匹配」进行元件库匹配。',
                webSearchQueries: []
            };
        }

        // 方案设计阶段：根据 LLM 给出的查询建议，做 web search 获取具体型号/接口参考
        const queries = Array.isArray(schemeResult?.webSearchQueries)
            ? schemeResult.webSearchQueries
            : [];

        const cleanQueries = queries
            .map(q => String(q || '').trim())
            .filter(Boolean)
            .slice(0, 3);

        if (cleanQueries.length > 0) {
            this._notifyAgentProgressPhase('scheme-design 检索资料');
            const chunks = [];
            for (const q of cleanQueries) {
                const search = await this.webSearchExa(q, { type: 'fast', numResults: 3 });
                if (!search?.success || !Array.isArray(search.results) || search.results.length === 0) {
                    continue;
                }

                const compact = search.results.slice(0, 2).map((r, idx) => {
                    const title = r?.title || r?.name || r?.head || r?.resultTitle || `结果${idx + 1}`;
                    const url = r?.url || r?.link || r?.href || '';
                    const snippet = r?.snippet || r?.description || r?.content || r?.text || '';
                    const snippet2 = snippet ? String(snippet).slice(0, 180) : '';
                    const tail = [url ? `(${url})` : '', snippet2].filter(Boolean).join(' ');
                    return `- ${title} ${tail}`.trim();
                }).join('\n');

                chunks.push(`【${q}】\n${compact}`);
            }

            if (chunks.length > 0) {
                schemeResult.webSearchReferenceText = chunks.join('\n\n');
            }

            this._notifyAgentProgressPhase('scheme-design 汇总方案');
        }

        // 兜底：保证字段存在，便于后续 prompt 直接引用
        if (!schemeResult.webSearchReferenceText) {
            schemeResult.webSearchReferenceText = '';
        }
        if (!Array.isArray(schemeResult.webSearchQueries)) {
            schemeResult.webSearchQueries = cleanQueries;
        }

        this.currentSkillState = {
            stage: 'scheme_design',
            userRequirement,
            schemeDesignResult: schemeResult
        };

        console.log('✅ 方案设计完成:', schemeResult);
        return schemeResult;
    }

    /**
     * 格式化方案设计结果用于展示（skills 叙事）
     * @param {Object} schemeDesignResult - 方案设计结果
     * @param {string|number} skillContextId - 兼容参数（当前不再用于生成按钮）
     * @returns {string} HTML
     */
    formatSchemeDesignForDisplay(schemeDesignResult, skillContextId) {
        const escapeHtml = (t) => this._escapeHtml(t);
        const { summary, estimatedParams = {}, narrative } = schemeDesignResult;

        // skillContextId 目前仅为签名兼容；本版本不再生成按钮，所以无需使用
        // CSS 仍使用 workflow-scheme-design 等历史类名，与 styles/components.css 选择器一致
        let html = '<div class="skills-scheme-design workflow-scheme-design">';
        html += '<h4>📐 方案设计</h4>';
        html += `<p class="scheme-summary">${escapeHtml(summary || '')}</p>`;
        if (narrative) {
            html += `<p class="scheme-narrative">${escapeHtml(narrative)}</p>`;
        }
        html += '<h5>元件预估参数</h5>';
        html += '<ul class="scheme-params">';
        const labels = {
            mcu: '主控',
            size: '体积/大小',
            batteryLife: '续航/供电',
            interfaces: '接口',
            other: '其他'
        };
        Object.entries(labels).forEach(([key, label]) => {
            const value = estimatedParams[key];
            if (value && String(value).trim()) {
                html += `<li><strong>${escapeHtml(label)}</strong>：${escapeHtml(String(value))}</li>`;
            }
        });
        if (Object.values(estimatedParams).every(v => !v || !String(v).trim())) {
            html += '<li>无特殊参数要求</li>';
        }
        html += '</ul>';
        html += '</div>';
        return html;
    }

    /**
     * 运行需求分析阶段（元件库匹配与选型校验）
     * @param {string} userRequirement - 用户需求描述
     * @param {Object} [schemeDesignResult] - 方案设计结果，作为匹配依据参考（可选）
     * @returns {Promise<Object>} 分析结果
     */
    async runRequirementAnalysis(userRequirement, schemeDesignResult) {
        console.log('🔍 [scheme→需求分析] 开始', {
            userRequirementPreview: String(userRequirement || '').slice(0, 160),
            hasSchemeContext: !!schemeDesignResult
        });

        // 1. 获取系统元件库列表（含 id 与显示名，供 LLM 匹配并返回正确 key）
        const componentList = await this.getSystemComponentNames();
        console.log('📦 系统元件库:', componentList.length, '个元件');
        this._notifyAgentProgressPhase('scheme-design 匹配元件库');

        // 列表格式：id (显示名)，便于 LLM 按显示名匹配且返回正确 id 作为 matchedKey
        const componentListForPrompt = componentList.map(
            (c, idx) => `${idx + 1}. ${c.id} (${c.displayName})`
        ).join('\n');

        const webSearchRefText =
            schemeDesignResult && schemeDesignResult.webSearchReferenceText
                ? String(schemeDesignResult.webSearchReferenceText)
                : '';
        const webSearchRefChars = webSearchRefText.length;
        if (schemeDesignResult && webSearchRefChars > 0) {
            console.log(
                '📎 runRequirementAnalysis 注入 prompt 的 webSearchReferenceText 字符数:',
                webSearchRefChars
            );
        }

        // 2. 构建LLM提示词（含类型匹配 + 选型校验）
        const systemPrompt = `你是一名专业的硬件工程师，擅长分析电路设计需求与元件选型。

你的任务分两步：
1. **类型匹配**：从用户需求中提取所需电子元件，与系统元件库按类型/名称做模糊匹配，得到 matchedKey。
2. **选型校验**：对已匹配的元件，根据用户需求中的**规格与约束**（如续航、体积、精度、接口、功耗、容量等）判断当前型号是否满足方案需求；若不满足，则视为“未满足”并给出推荐。

**必须按组件类型逐类检查，不得遗漏**。请按以下类型依次核对方案是否都需要，并列出“需要的所有具体元件实例”：
- **主控**：MCU/单片机/开发板（如 Arduino、ESP32、STM32 等）
- **电源**：电池、电源管理、DC 电源开关等
- **传感器**：根据功能（声控→声音传感器，测距→超声波/激光测距，温湿度→温湿度传感器，姿态→陀螺仪/加速度计等）
- **执行器**：**极易遗漏，务必检查**。方案若涉及运动、机械、云台、无人机、机械臂、舵机、电机驱动等，**必须包含执行器**（如直流电机、舵机、步进电机、云台电机、电机驱动模块等）；库中无精确型号时用通用名称并 matchedKey 填 null
- **必要辅助**：开关（轻触/自锁）、电阻、电容、指示灯等

重要原则：
- **不要将产品名称本身作为元件**（如"声控灯""云台无人机"是产品名，需拆成具体元件类型）。
- **准确识别元件类型**（声控→声音传感器、测距→超声波/激光测距、无人机/云台→主控+电源+传感器+**电机/舵机等执行器**+辅助）。
    - **components 数组每一项必须对应“一个具体元件实例”**，同一个 type 可以出现多条（例如同为执行器可能需要多个舵机/电机/驱动相关器件）。
- **不要添加需求中未出现的传感器类型**（例如仅温湿度/环境监测而未提及姿态或运动，则不要列出陀螺仪、加速度计、MPU6050 等；只列用户或方案概述中明确需要的传感功能）。

**输出约束（务必遵守，否则下游无法解析）**：
- 只输出**一个** JSON 对象；不要用 Markdown 代码块（不要用 \`\`\`）；不要输出任何前缀/后缀说明文字。
- **禁止**把上方「系统元件库列表」整段复制到输出里；components **只列与本需求相关的条目**，建议 **5～15 条**（不要逐条枚举库内全部型号）。
- 所有字符串值内如需引号，请用单引号 ' 或中文描述，**避免**在值内出现未转义的英文双引号。
- 所有 key 必须用英文双引号。

- **选型校验要点**：
  * 用户提到续航/待机/供电时长 → 电池/电源容量、功耗是否满足
  * 用户提到体积/小巧/便携 → 元件尺寸是否合适
  * 用户提到精度/分辨率 → 传感器或器件规格是否达标
  * 用户提到接口（如 I2C/SPI/USB）→ 主控与外围是否兼容
  * 若需求中未明确规格，则默认当前匹配型号满足，exists 设为 1

系统元件库列表（每项格式为：元件id (显示名)，matchedKey/recommendedKey 必须从本列表中取完整 id）：
${componentListForPrompt}

匹配与校验规则：
- **类型匹配**：按括号内显示名模糊匹配（如"电池"可匹配"602035锂电池"），matchedKey 填列表中的完整 id。
- **选型校验**：若用户有续航/体积/精度等要求，而当前 matchedKey 对应型号明显不满足（如小容量电池无法满足长续航），则 exists 设为 0，并填写推荐：
  * recommendedKey：从系统列表中选更合适的元件 id（若有）；若无更合适项可省略或 null
  * recommendation：当 recommendedKey = null 时，recommendation 必须以“具体型号/模块名”开头（例如 MAX9814 / VL53L0X / STM32F103C8T6），后面可附一句原因或接口要点；当 recommendedKey 有值时可留空或保持简短原因
- **exists 含义**：1 = 类型匹配且选型满足需求；0 = 类型未匹配 或 选型不满足需求（均按“缺失/未满足”处理）。
${schemeDesignResult ? `
【匹配依据参考】以下为方案设计阶段的预估参数，请作为类型匹配与选型校验的参考，优先满足这些约束：
${JSON.stringify(schemeDesignResult.estimatedParams || {}, null, 2)}
方案概述：${schemeDesignResult.summary || ''}${webSearchRefChars ? '\n\nWeb搜索参考（Exa）：\n' + webSearchRefText : ''}
` : ''}

返回格式（严格JSON）：
{
  "components": [
    {
      "type": "主控|电源|传感器|执行器|必要辅助",
      "name": "元件名称（通用名称）",
      "matchedKey": "当前匹配的元件 id 或 null",
      "exists": 1或0,
      "recommendedKey": "推荐元件 id（仅当 exists=0 且库内有更合适型号时填写，否则 null）",
      "recommendation": "选型建议说明（仅当 exists=0 时可选，如无推荐型号则说明原因或建议）"
    }
  ],
  "summary": "简短总结（可提及选型是否均满足）"
}`;

        const userPrompt = schemeDesignResult
            ? `用户需求：${userRequirement}\n\n请结合上方系统提示中的【匹配依据参考】，按主控、电源、传感器、执行器、辅助元件逐类列出所需元件并完成匹配与选型校验。执行器不可遗漏（无人机/云台/机械类必须含电机或舵机等）。`
            : `用户需求：${userRequirement}

请按主控、电源、传感器、执行器、辅助元件逐类列出所需元件，完成类型匹配与选型校验。执行器不可遗漏（无人机、云台、机械臂等方案必须包含电机/舵机等执行器）。不要将产品名称本身作为元件。`;

        const modelUsed = this.chatManager.selectedModel || this.chatManager.defaultChatModel;
        console.log('[scheme→requirement] 阶段链路: 即将 callLLMAPI（元件库匹配 JSON）', {
            model: modelUsed,
            systemPromptChars: systemPrompt.length,
            userPromptChars: userPrompt.length,
            componentLibraryCount: componentList.length,
            webSearchRefInjectedChars: webSearchRefChars,
            userRequirementPreview: String(userRequirement || '').slice(0, 160)
        });

        // 3. 调用LLM进行分析
        const response = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: modelUsed,
            temperature: 0.3
        });

        // 4. 解析LLM响应（带一次“自动修复/重试”能力）
        const tryParseJson = (raw) => {
            const s = String(raw || '').trim();
            if (!s) return null;

            const attempt = (t) => {
                try {
                    return JSON.parse(t);
                } catch {
                    return null;
                }
            };

            const coerceRoot = (parsed) => {
                const norm = normalizeBomAnalysisRoot(parsed);
                const root =
                    norm || (parsed && typeof parsed === 'object' && Array.isArray(parsed.components) ? parsed : null);
                return root && Array.isArray(root.components) ? root : null;
            };

            // 1) 直接解析
            let obj = coerceRoot(attempt(s));
            if (obj) return obj;

            // 2) 平衡花括号截取（避免首尾 } 误切到字符串内）
            const balanced = extractBalancedJsonObject(s);
            if (balanced) {
                obj = coerceRoot(attempt(balanced));
                if (obj) return obj;
                const repaired = balanced
                    .replace(/(\{|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
                    .replace(/'/g, '"')
                    .replace(/,\s*([}\]])/g, '$1');
                obj = coerceRoot(attempt(repaired));
                if (obj) return obj;
            }

            // 3) 首尾大括号切片 + 粗修复
            const first = s.indexOf('{');
            const last = s.lastIndexOf('}');
            if (first >= 0 && last > first) {
                const inner = s.slice(first, last + 1);
                obj = coerceRoot(attempt(inner));
                if (obj) return obj;

                const repaired = inner
                    .replace(/(\{|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
                    .replace(/'/g, '"')
                    .replace(/,\s*([}\]])/g, '$1');
                obj = coerceRoot(attempt(repaired));
                if (obj) return obj;
            }

            return null;
        };

        const firstRaw = String(response?.content ?? '').trim();
        console.log('[scheme→requirement] ← 首次 LLM 返回 content 长度:', firstRaw.length);

        let analysisResult = null;
        try {
            const jsonMatch = firstRaw.match(/```json\s*([\s\S]*?)\s*```/) ||
                firstRaw.match(/```\s*([\s\S]*?)\s*```/) ||
                [null, firstRaw];
            const jsonStr = jsonMatch[1] || firstRaw;
            analysisResult = tryParseJson(jsonStr);
        } catch (error) {
            console.warn('⚠️ [requirement-analysis] 首次解析过程异常，将重试:', error?.message || String(error));
        }

        if (analysisResult && !Array.isArray(analysisResult.components)) {
            console.warn(
                '⚠️ [requirement-analysis] 首次解析得到对象但缺少 components 数组，视为失败并重试'
            );
            analysisResult = null;
        }

        let retryRaw = '';
        if (!analysisResult) {
            console.warn('[scheme→requirement] 首次 JSON 无效，进入重试轮（更严提示词）');
            this._notifyAgentProgressPhase('scheme-design 重试解析');
            // 重试一次：强制只输出严格 JSON
            const retryUserPrompt = `${userPrompt}\n\n请仅输出严格 JSON：1) 一个根对象，含 components 数组与 summary；2) key 双引号；3) 不要用代码块；4) components 不超过 12 条；5) 不要任何额外文字。`;
            const retryResponse = await this.chatManager.callLLMAPI({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: retryUserPrompt }
                ],
                model: modelUsed,
                temperature: 0.1
            });

            retryRaw = String(retryResponse.content || '').trim();
            console.log('[scheme→requirement] ← 重试 LLM 返回 content 长度:', retryRaw.length);
            const retryJsonMatch = retryRaw.match(/```json\s*([\s\S]*?)\s*```/) ||
                retryRaw.match(/```\s*([\s\S]*?)\s*```/) ||
                [null, retryRaw];
            const retryJsonStr = retryJsonMatch[1] || retryRaw;
            analysisResult = tryParseJson(retryJsonStr);
        }

        if (analysisResult && !Array.isArray(analysisResult.components)) {
            console.warn(
                '⚠️ [requirement-analysis] 重试解析得到对象但缺少 components 数组，视为失败'
            );
            analysisResult = null;
        }

        if (!analysisResult) {
            console.error('❌ [requirement-analysis] 两次调用均无法解析为有效 JSON（需含 components 数组）');
            this._debugLogRequirementAnalysisRaw('首次', firstRaw);
            this._debugLogRequirementAnalysisRaw('重试', retryRaw);
            throw new Error('LLM返回格式错误，无法解析匹配结果');
        }

        // 兼容 LLM 把 null 作为字符串 "null" 输出导致的错误复用。
        const normalizeMaybeNull = (v) => {
            if (v === null || v === undefined) return null;
            const s = String(v).trim();
            if (!s) return null;
            const lower = s.toLowerCase();
            if (lower === 'null' || lower === 'undefined') return null;
            return s;
        };

        if (analysisResult && Array.isArray(analysisResult.components)) {
            analysisResult.components = analysisResult.components.map((c) => {
                const existsNum = Number(c?.exists);
                const exists = existsNum === 1 ? 1 : 0;
                return {
                    ...c,
                    exists,
                    matchedKey: normalizeMaybeNull(c?.matchedKey),
                    recommendedKey: normalizeMaybeNull(c?.recommendedKey),
                    recommendation: c?.recommendation !== undefined ? String(c?.recommendation || '') : ''
                };
            });
        }

        // 4. 保存 skills 状态（保留方案设计结果，供后续 skill / 画布应用引用）
        const prev = this.currentSkillState && typeof this.currentSkillState === 'object' ? this.currentSkillState : {};
        this.currentSkillState = {
            ...prev,
            stage: 'requirement_analysis',
            userRequirement,
            schemeDesignResult: schemeDesignResult || prev.schemeDesignResult,
            analysisResult,
            componentList
        };

        const compN = Array.isArray(analysisResult.components) ? analysisResult.components.length : 0;
        console.log('✅ [scheme→需求分析] 完成', {
            componentsCount: compN,
            summaryPreview: String(analysisResult.summary || '').slice(0, 120)
        });
        return analysisResult;
    }

    /**
     * 获取系统元件库列表（含 id 与显示名，供 LLM 匹配并返回正确 key）
     * @returns {Promise<Array<{id: string, displayName: string}>>} 元件列表，每项含 id 与 displayName
     */
    async getSystemComponentNames() {
        try {
            const standardComponents = await window.electronAPI.readComponentFiles('data/system-components/standard');
            const customComponents = await window.electronAPI.readComponentFiles('data/system-components/custom');

            const displayName = (comp) => comp.displayName || comp.name || comp.id || '';
            const addEntries = (components, list) => {
                components.forEach(comp => {
                    const name = displayName(comp);
                    const id = comp.id || name; // 无 id 时用显示名作为 key
                    if (id && name) {
                        list.push({ id, displayName: name });
                    }
                });
            };

            const list = [];
            addEntries(standardComponents, list);
            addEntries(customComponents, list);

            // 按 id 去重（同一 id 只保留一条）
            const seen = new Set();
            return list.filter(({ id }) => {
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        } catch (error) {
            console.error('❌ 获取系统元件库失败:', error);
            return [];
        }
    }

    /**
     * 获取用于自动补全的系统元件索引（standard 优先），用于“避免重复生成”。
     * @returns {Promise<{standard:Array<any>, custom:Array<any>}>}
     */
    async _getAutoCompleteComponentIndex() {
        if (this._autoCompleteComponentIndex && this._autoCompleteComponentIndex.standard && this._autoCompleteComponentIndex.custom) {
            return this._autoCompleteComponentIndex;
        }

        let standard = [];
        let custom = [];
        try {
            standard = await window.electronAPI.readComponentFiles('data/system-components/standard');
        } catch (e) {
            console.warn('⚠️ 读取 standard 元件库失败：', e?.message || String(e));
        }
        try {
            custom = await window.electronAPI.readComponentFiles('data/system-components/custom');
        } catch (e) {
            console.warn('⚠️ 读取 custom 元件库失败：', e?.message || String(e));
        }

        this._autoCompleteComponentIndex = {
            standard: Array.isArray(standard) ? standard : [],
            custom: Array.isArray(custom) ? custom : []
        };

        return this._autoCompleteComponentIndex;
    }

    /**
     * 在系统/自定义库里查找是否已经存在“同型号”的元件，避免重复生成 ctm-*.json。
     * @param {string} modelCandidate - 候选型号（如 FSR402 / KY-038 / 220Ω / MAX9814）
     * @param {string|null} desiredCategory - 目标 category（如 sensor/actuator/power/auxiliary）
     * @returns {Promise<{id:string, name?:string, category?:string}|null>}
     */
    async _findReusableComponentByModelToken(modelCandidate, desiredCategory) {
        const idx = await this._getAutoCompleteComponentIndex();
        const tokenRaw = String(modelCandidate || '').trim();
        if (!tokenRaw) return null;

        const tokenLower = tokenRaw.toLowerCase();
        const tokenSimple = tokenLower.replace(/[^a-z0-9\-]/g, '');
        const candidateTokens = new Set([tokenLower, tokenSimple].filter(Boolean));

        // 抽取更细粒度的 alnum token（例如 FSR402 / STM32F103C8T6 / std-led-234011）
        const extraTokens = tokenLower.match(/[a-z][a-z0-9\-]*\d[a-z0-9\-]*|(?:\d+(?:\.\d+)?[a-z][a-z0-9\-]*)/g) || [];
        extraTokens.forEach(t => candidateTokens.add(t));

        const matches = (comp) => {
            if (!comp || !comp.id) return false;

            const idLower = String(comp.id || '').toLowerCase();
            const nameLower = String(comp.name || '').toLowerCase();
            const descLower = String(comp.description || '').toLowerCase();
            const tags = Array.isArray(comp.tags) ? comp.tags.map(t => String(t).toLowerCase()) : [];

            for (const t of candidateTokens) {
                if (!t) continue;
                if (idLower.includes(t)) return true;
                if (nameLower.includes(t)) return true;
                if (descLower.includes(t)) return true;
                if (tags.some(tag => tag.includes(t))) return true;
            }
            return false;
        };

        // standard 优先：确保不会重复生成与标准库重合的 ctm-*
        const hitStandard = (idx.standard || []).find(matches);
        if (hitStandard) {
            return { id: hitStandard.id, name: hitStandard.name, category: hitStandard.category };
        }

        const hitCustom = (idx.custom || []).find(matches);
        if (hitCustom) {
            return { id: hitCustom.id, name: hitCustom.name, category: hitCustom.category };
        }

        return null;
    }

    /**
     * 转义 HTML 特殊字符，避免 XSS
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    _escapeHtml(text) {
        if (text == null || text === '') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 格式化匹配结果用于显示
     * @param {Object} analysisResult - 分析结果
     * @param {string|number} skillContextId - 兼容参数（当前不再用于生成按钮）
     * @returns {string} 格式化的HTML内容
     */
    formatAnalysisResultForDisplay(analysisResult, skillContextId) {
        const { components, summary } = analysisResult;
        const escapeHtml = (t) => this._escapeHtml(t);
        const componentList = (this.currentSkillState && this.currentSkillState.componentList) || [];
        const displayNameByKey = new Map(componentList.map(c => [c.id, c.displayName]));
        // skillContextId 目前仅为签名兼容；本版本不再生成按钮，所以无需使用

        // 生成方案分析摘要（简短指明需要哪些元件）
        const componentNames = components.map(c => c.name).join('、');
        const analysisSummary = summary || `根据您的需求，我识别出需要以下元件：${componentNames}`;

        let html = `<div class="skills-analysis-result workflow-analysis-result">`;
        html += `<h4>📋 方案分析</h4>`;
        html += `<p>${analysisSummary}</p>`;
        html += `<h4>🔍 元件匹配结果</h4>`;
        html += `<table class="component-match-table">`;
        html += `<thead><tr><th>元件类型</th><th>匹配状态</th><th>匹配结果</th></tr></thead>`;
        html += `<tbody>`;

        components.forEach(comp => {
            const status = comp.exists === 1 ? '✅' : '⚠️';
            const statusText = comp.exists === 1
                ? '已匹配'
                : (comp.matchedKey ? '选型不满足' : '未找到');

            let resultText = '-';
            if (comp.exists === 1) {
                resultText = displayNameByKey.get(comp.matchedKey) || comp.matchedKey || '-';
            } else {
                // exists=0 时：优先显示“推荐补全”的具体型号（recommendedKey / recommendation首段），而不展示 matchedKey 的错误型号
                if (comp.recommendedKey) {
                    resultText = displayNameByKey.get(comp.recommendedKey) || comp.recommendedKey;
                } else if (comp.recommendation) {
                    const modelName = this._extractModelNameFromRecommendation(comp.recommendation);
                    if (modelName) {
                        const recStr = String(comp.recommendation || '').trim();
                        const rest = recStr.startsWith(modelName)
                            ? recStr.slice(modelName.length).replace(/^[-–—:：\s]+/, '').trim()
                            : recStr;
                        resultText = rest
                            ? `推荐补全：${modelName}（${rest}）`
                            : `推荐补全：${modelName}`;
                    } else {
                        resultText = comp.recommendation;
                    }
                } else {
                    resultText = '当前元件库暂无（建议外购/补充具体型号）';
                }
            }

            html += `<tr>`;
            html += `<td><strong>${escapeHtml(comp.type || comp.name)}</strong></td>`;
            html += `<td>${status} ${statusText}</td>`;
            html += `<td class="match-result-cell">${escapeHtml(resultText)}</td>`;
            html += `</tr>`;
        });

        html += `</tbody></table>`;

        // 检查是否有未满足项（类型未匹配或选型不满足）
        const missingComponents = components.filter(c => c.exists === 0);
        if (missingComponents.length > 0) {
            html += `<div class="skills-actions workflow-actions">`;
            html += `<p>⚠️ 检测到 <strong>${missingComponents.length}</strong> 个元件未满足需求（库中无匹配或选型不符）。请使用 <strong>completion_suggestion_skill</strong> 或 <strong>web_search_exa</strong> 获取具体模块型号后，在元件库中<strong>手动添加</strong>对应元件，再继续连线编辑。</p>`;
            html += `</div>`;
        } else {
            html += `<div class="skills-actions workflow-actions workflow-actions--complete">`;
            html += `<p>✅ 元件已齐全。下一步可继续由 skills 链路完成后续补全/整理。</p>`;
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * 读取当前画布并生成与 `generateCircuitConfig` 一致结构的快照，供 wiring_edit_skill 使用。
     * @returns {object}
     */
    getCanvasSnapshotForSkill() {
        try {
            if (
                typeof window !== 'undefined' &&
                window.app &&
                typeof window.app.getCurrentCanvasState === 'function' &&
                typeof window.app.generateCircuitConfig === 'function'
            ) {
                const state = window.app.getCurrentCanvasState();
                return window.app.generateCircuitConfig(state);
            }
        } catch (e) {
            console.warn('getCanvasSnapshotForSkill:', e?.message || e);
        }
        return {
            projectName: 'snapshot-unavailable',
            components: [],
            connections: [],
            error: '无法读取画布（window.app 未就绪）'
        };
    }

    /**
     * 将模糊缺失描述转为**具体模块级型号/模块名**建议（仅文本，不生成元件 JSON、不落盘）。
     * @param {string} userRequirement
     * @param {string[]|string} missingDescriptions
     * @param {string} [additionalContext]
     * @returns {Promise<{ suggestions: object[], summary: string, raw?: string }>}
     */
    async runCompletionSuggestions(userRequirement, missingDescriptions, additionalContext = '') {
        const list = Array.isArray(missingDescriptions)
            ? missingDescriptions.map((x) => String(x || '').trim()).filter(Boolean)
            : String(missingDescriptions || '')
                  .split(/[,，;；\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean);
        if (!list.length) {
            return { suggestions: [], summary: '未提供缺失元件描述' };
        }
        if (!this.chatManager || typeof this.chatManager.callLLMAPI !== 'function') {
            throw new Error('chatManager.callLLMAPI 不可用');
        }
        const sys = `你是硬件选型顾问。用户有一些模糊器件需求，请给出**可直接采购的模块级成品型号**（不要用芯片裸片封装级方案）。
输出严格 JSON（不要 Markdown 代码块）：
{
  "summary": "一段话总结",
  "suggestions": [
    {
      "inputDescription": "与输入列表对应的模糊描述",
      "suggestedModules": ["具体模块名1", "具体模块名2"],
      "notes": "接口/电压/注意事项"
    }
  ]
}
每项 inputDescription 应覆盖用户给出的一条缺失描述；suggestedModules 为市场常见模块称呼（如 SG90舵机、KY-038声音传感器模块）。`;
        const extra = String(additionalContext || '').trim();
        const user =
            `用户需求：${String(userRequirement || '').trim()}

待明确的模糊元件（逐条给型号建议）：
${list.map((x, idx) => `${idx + 1}. ${x}`).join('\n')}
${extra ? `【补充上下文】\n${extra}` : ''}`;
        this._notifyAgentProgressPhase('completion-suggestion 请求模型');
        const resp = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
            temperature: 0.25
        });
        const content = String(resp.content || '').trim();
        let parsed = null;
        try {
            const m =
                content.match(/```json\s*([\s\S]*?)\s*```/i) || content.match(/```([\s\S]*?)```/);
            const jsonStr = m ? m[1].trim() : content;
            const fb = jsonStr.indexOf('{');
            const lb = jsonStr.lastIndexOf('}');
            parsed = JSON.parse(fb >= 0 && lb > fb ? jsonStr.slice(fb, lb + 1) : jsonStr);
        } catch (e) {
            this._notifyAgentProgressPhase('completion-suggestion 解析失败');
            return {
                suggestions: [],
                summary: '模型输出无法解析为 JSON',
                raw: content.slice(0, 1200)
            };
        }
        const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
        const summary = String(parsed.summary || '').trim() || '已完成型号建议';
        if (this.currentSkillState && typeof this.currentSkillState === 'object') {
            this.currentSkillState.completionSuggestions = { suggestions, summary };
        }
        this._notifyAgentProgressPhase('completion-suggestion 已完成');
        return { suggestions, summary };
    }

    /**
     * 对长文本做结构化摘要（中文），供 `summarize_skill` 调用；走当前对话所选聊天模型。
     * @param {string} text - 待摘要正文
     * @param {{ length?: 'short'|'medium'|'long', focus?: string }} [options] - length 控制篇幅；focus 可选侧重说明
     * @returns {Promise<{ summary: string, bullets: string[], raw?: string, parseError?: string }>}
     */
    async runSummarizeText(text, options = {}) {
        if (!this.chatManager || typeof this.chatManager.callLLMAPI !== 'function') {
            throw new Error('chatManager.callLLMAPI 不可用');
        }
        const raw = String(text || '').trim();
        if (!raw) {
            return { summary: '', bullets: [], parseError: 'text 不能为空' };
        }
        const maxIn = 150000;
        const body =
            raw.length > maxIn ? `${raw.slice(0, maxIn)}\n…（已截断至${maxIn}字符）` : raw;
        const length = options.length === 'short' || options.length === 'long' ? options.length : 'medium';
        const focus = String(options.focus || '').trim();
        const lengthLabel =
            length === 'short'
                ? '短（总述约 80–120 字）'
                : length === 'long'
                  ? '长（总述约 400–600 字，要点可更多）'
                  : '中（总述约 200–300 字）';
        const sys = `你是摘要助手。将用户给出的长文本压缩为清晰摘要，使用中文。
输出严格 JSON（不要 Markdown 代码块）：
{"summary":"一段总述","bullets":["要点1","要点2"]}
摘要风格：${lengthLabel}；要点条数建议 3–8 条，每条一句。`;
        let user = `【待摘要正文】\n${body}`;
        if (focus) {
            user += `\n\n【侧重/约束】\n${focus}`;
        }
        this._notifyAgentProgressPhase('summarize 请求模型');
        const resp = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
            temperature: 0.2
        });
        const content = String(resp.content || '').trim();
        let parsed = null;
        try {
            const balanced = extractBalancedJsonObject(content);
            const slice = balanced || content;
            const m =
                slice.match(/```json\s*([\s\S]*?)\s*```/i) || slice.match(/```([\s\S]*?)```/);
            const jsonStr = m ? m[1].trim() : slice;
            const fb = jsonStr.indexOf('{');
            const lb = jsonStr.lastIndexOf('}');
            parsed = JSON.parse(fb >= 0 && lb > fb ? jsonStr.slice(fb, lb + 1) : jsonStr);
        } catch (e) {
            this._notifyAgentProgressPhase('summarize 解析失败');
            return {
                summary: '',
                bullets: [],
                parseError: String(e?.message || e),
                raw: content.slice(0, 1200)
            };
        }
        const summary = String(parsed?.summary || '').trim();
        const bullets = Array.isArray(parsed?.bullets)
            ? parsed.bullets.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        if (this.currentSkillState && typeof this.currentSkillState === 'object') {
            this.currentSkillState.summarizeResult = { summary, bullets };
        }
        this._notifyAgentProgressPhase('summarize 已完成');
        return { summary: summary || '（无总述）', bullets };
    }

    /**
     * 根据用户需求与现有代码生成固件补丁建议（默认仅返回建议，不直接落盘）。
     * 生成前读取画布快照并做结构预判，指导补丁深浅与用户引导文案。
     * @param {string} userRequirement
     * @param {string} [codeText]
     * @param {{
     *   targetPath?: string,
     *   language?: string,
     *   additionalContextFromAgent?: string,
     *   canvasSnapshot?: object|null
     * }} [options]
     * @returns {Promise<object>}
     */
    async runFirmwareCodePatch(userRequirement, codeText = '', options = {}) {
        if (!this.chatManager || typeof this.chatManager.callLLMAPI !== 'function') {
            throw new Error('chatManager.callLLMAPI 不可用');
        }
        const requirement = String(userRequirement || '').trim();
        if (!requirement) {
            throw new Error('userRequirement 不能为空');
        }
        const language = String(options?.language || 'arduino').trim() || 'arduino';
        const targetPath = String(options?.targetPath || 'firmware/main.ino').trim() || 'firmware/main.ino';
        const source = String(codeText || '').trim();
        const sourceSlice = source ? source.slice(0, 14000) : '// (empty source)';
        const extra = String(options?.additionalContextFromAgent || '').trim();

        const fw = getFirmwareCanvasSnapshotHelpers();
        let canvasSnapshot =
            options?.canvasSnapshot !== undefined ? options.canvasSnapshot : null;
        if (canvasSnapshot == null && typeof this.getCanvasSnapshotForSkill === 'function') {
            canvasSnapshot = this.getCanvasSnapshotForSkill();
        }
        const canvasAnalysis = fw.analyzeCanvasSnapshotForFirmware(canvasSnapshot);
        const snapForPrompt = fw.stringifyCanvasSnapshotForPrompt(canvasSnapshot, 10000);
        const gapKind = canvasAnalysis.gapKind || 'ready';
        const phaseHint =
            typeof fw.firmwareGapKindToPhase === 'function'
                ? fw.firmwareGapKindToPhase(gapKind)
                : gapKind === 'missing_parts'
                  ? 'empty_canvas'
                  : gapKind === 'ready'
                    ? 'ready_pin_level'
                    : 'wiring_incomplete';

        const sys = `你是资深嵌入式固件工程师。遵从本消息中的**程序画布结构预判**与 **gapKind**（见 user 里的 readiness/gapKind）；**不要求**必须存在前序方案设计或 BOM 文本——没有时仅按需求 + 画布生成补丁即可。

【按 gapKind 的补丁策略】
- 若补充上下文出现「可选参考 · 前序方案」类段落：**不是验收清单**。patch **以当前画布 JSON 与连线为准**；gapKind 仍以程序字段为准；notes 勿强迫用户为对齐方案表而换料——画布已能实现需求则基于画布写常量。
- gapKind=missing_parts（缺件，含画布空）：仅输出**初步/骨架** patch，禁止为尚未出现在画布上的外设绑定具体 GPIO；notes 须提示用户先补元件再上画布。
- gapKind=missing_wiring（缺连线）：优先由 agent 先调 **wiring_edit_skill**；本条消息中的 patch 仅作保守、可编译的过渡修改，勿强行写满与外设引脚绑定的常量；canvasGuidance 须引导「先补线再回本 skill」。
- gapKind=snapshot_error：patch 极简、少假设引脚；提示检查画布加载。
- gapKind=ready：结合画布 JSON 连线，输出**引脚级**常量（如 const int LED_PIN = 2;），canvasGuidance.pinBindings 逐项列出。

仅输出严格 JSON（不要 Markdown 代码块）：
{
  "summary": "一句话改动目标",
  "patchPlan": [
    { "op": "insert|replace|delete", "target": "函数/代码段标识", "description": "做什么与原因" }
  ],
  "patch": "统一 diff 文本（可多段 @@）",
  "notes": ["依赖库/风险/验证建议"],
  "canvasGuidance": {
    "phase": "empty_canvas|wiring_incomplete|ready_pin_level",
    "userFacingHint": "给用户的一句中文引导（可与策略一致）",
    "pinBindings": [
      { "label": "如 LED", "instanceId": "画布实例 id", "pinName": "D2 或侧序 id", "codeLine": "const int LED_PIN = 2;" }
    ]
  }
}
要求：
1) canvasGuidance.phase 必须严格为 "${phaseHint}"（gapKind=${gapKind}）；
2) gapKind 非 ready 时 pinBindings 可为 []；
3) patchPlan 2~8 条；patch 为 diff 且至少一处 + 行；
4) 不要编造画布中不存在的硬件连接。`;
        const user = `【需求】
${requirement}

【目标文件】
${targetPath}

【语言】
${language}

【现有代码】
${sourceSlice}

【画布结构预判（程序计算，请严格遵循）】
readiness=${canvasAnalysis.readiness}
gapKind=${gapKind}
projectName=${canvasAnalysis.projectName || '(未知)'}
componentCount=${canvasAnalysis.componentCount}
connectionCount=${canvasAnalysis.connectionCount}
issues=${JSON.stringify(canvasAnalysis.issues)}
invalidConnectionIds=${JSON.stringify(canvasAnalysis.invalidConnectionIds)}
disconnectedInstanceIds=${JSON.stringify(canvasAnalysis.disconnectedInstanceIds)}
expectedPhase=${phaseHint}

【当前画布 JSON 摘要】
${snapForPrompt}
${extra ? `\n\n【补充上下文】\n${extra}` : ''}`;

        this._notifyAgentProgressPhase('firmware-code 请求模型');
        const resp = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
            temperature: 0.2
        });
        const content = String(resp.content || '').trim();
        let parsed = null;
        try {
            const balanced = extractBalancedJsonObject(content);
            const slice = balanced || content;
            const m = slice.match(/```json\s*([\s\S]*?)\s*```/i) || slice.match(/```([\s\S]*?)```/);
            const jsonStr = m ? m[1].trim() : slice;
            const fb = jsonStr.indexOf('{');
            const lb = jsonStr.lastIndexOf('}');
            parsed = JSON.parse(fb >= 0 && lb > fb ? jsonStr.slice(fb, lb + 1) : jsonStr);
        } catch (e) {
            this._notifyAgentProgressPhase('firmware-code 解析失败');
            const canvasGuidance = fw.mergeFirmwareCanvasGuidance(null, canvasAnalysis);
            return {
                summary: '',
                patchPlan: [],
                patch: '',
                notes: [],
                targetPath,
                language,
                canvasAnalysis,
                canvasGuidance,
                parseError: String(e?.message || e),
                raw: content.slice(0, 1200)
            };
        }

        const patchPlan = Array.isArray(parsed?.patchPlan) ? parsed.patchPlan : [];
        const patch = String(parsed?.patch || '').trim();
        const notes = Array.isArray(parsed?.notes)
            ? parsed.notes.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const summary = String(parsed?.summary || '').trim() || '已生成固件补丁建议';
        const canvasGuidance = fw.mergeFirmwareCanvasGuidance(parsed?.canvasGuidance, canvasAnalysis);
        if (this.currentSkillState && typeof this.currentSkillState === 'object') {
            this.currentSkillState.firmwarePatchResult = {
                summary,
                patchPlan,
                patch,
                notes,
                targetPath,
                language,
                canvasAnalysis,
                canvasGuidance
            };
        }
        this._notifyAgentProgressPhase('firmware-code 已完成');
        return {
            summary,
            patchPlan,
            patch,
            notes,
            targetPath,
            language,
            canvasAnalysis,
            canvasGuidance
        };
    }

    /**
     * 根据**当前画布 JSON**与**连线规则/意图**，生成仅含连线的修改计划（承上启下：可比对方案所需元件与画布，分缺件/不缺件分支）。
     * @param {object} canvasSnapshot
     * @param {string} wiringRules
     * @param {string} [additionalContext]
     * @param {{ expectedComponentsHint?: string }} [options]
     * @returns {Promise<object>}
     */
    async runWiringEditPlan(canvasSnapshot, wiringRules, additionalContext = '', options = {}) {
        if (!this.chatManager || typeof this.chatManager.callLLMAPI !== 'function') {
            throw new Error('chatManager.callLLMAPI 不可用');
        }
        const fw = getFirmwareCanvasSnapshotHelpers();
        const wa = fw.analyzeCanvasSnapshotForFirmware(canvasSnapshot);
        const schemeHint = String(options?.expectedComponentsHint || '').trim();
        const snapStr = JSON.stringify(canvasSnapshot ?? {}, null, 2).slice(0, 12000);
        const sys = `你是电路连线助手：依据**程序画布结构预判**、**当前画布 JSON**、**连线规则/意图**工作；user 消息里可能出现的「方案/BOM 摘要」**纯属可选补充**，没有时完全正常，请勿依赖其存在。

【默认路径（无方案表时）】
- 仅凭「连线规则」与用户补充 + 画布实例推理；在器件足够完成电气功能时，**优先** canvasVsScheme=complete_on_canvas，按规则生成连线。

【有方案摘要时（参考即可）】
0) **不得**仅因与 BOM 关键词不一致而判缺件；画布功能已满足「连线规则」描述时，必须 complete_on_canvas 并正常补线。
1) 器件已够：一次性尽量补全合理连接。
2) **仅当**画布相对用户意图**明显少缺关键器件**时：missing_parts_on_canvas；只允许已存在 instanceId 的连线；missingPartsSummary + userFollowUpHint 提示补件。

输出严格 JSON（不要 Markdown 代码块）：
{
  "canvasVsScheme": "complete_on_canvas|missing_parts_on_canvas|unknown",
  "missingPartsSummary": ["若缺件则逐条列出，否则 []"],
  "rationale": "为何做这些连线变更（中文）",
  "plannedOperations": [
    { "op": "add_connection", "id": "新连线唯一id", "source": { "instanceId": "", "pinId": "", "pinName": "" }, "target": { "instanceId": "", "pinId": "", "pinName": "" } },
    { "op": "remove_connection", "connectionId": "已有连线id" }
  ],
  "userFollowUpHint": "给用户或 agent 的中文后续指引（补件/继续连线/可接 firmware_codegen_skill）"
}
只允许 add_connection / remove_connection；勿编造不存在的 instanceId。若无操作，plannedOperations 可为 []。`;
        const extra2 = String(additionalContext || '').trim();
        const user = `【画布结构预判（程序计算）】
readiness=${wa.readiness}
gapKind=${wa.gapKind}
componentCount=${wa.componentCount}
connectionCount=${wa.connectionCount}
issues=${JSON.stringify(wa.issues)}

【当前画布 JSON】
${snapStr}

【连线规则/意图】
${String(wiringRules || '').trim()}
${schemeHint ? `【方案所需元件摘要（请与画布 componentFile/customLabel 比对）】\n${schemeHint}\n` : ''}${extra2 ? `【补充】\n${extra2}` : ''}`;
        const resp = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
            temperature: 0.2
        });
        const content = String(resp.content || '').trim();
        let parsed = null;
        try {
            const m =
                content.match(/```json\s*([\s\S]*?)\s*```/i) || content.match(/```([\s\S]*?)```/);
            const jsonStr = m ? m[1].trim() : content;
            const fb = jsonStr.indexOf('{');
            const lb = jsonStr.lastIndexOf('}');
            parsed = JSON.parse(fb >= 0 && lb > fb ? jsonStr.slice(fb, lb + 1) : jsonStr);
        } catch (e) {
            return {
                canvasVsScheme: 'unknown',
                missingPartsSummary: [],
                rationale: '模型输出无法解析为 JSON，未生成可执行连线指令',
                plannedOperations: [],
                userFollowUpHint: '请重试或简化连线需求描述。',
                parseError: String(e?.message || e),
                raw: content.slice(0, 800),
                canvasStructureAnalysis: wa
            };
        }
        const rationale = String(parsed.rationale || '').trim();
        const plannedOperations = Array.isArray(parsed.plannedOperations) ? parsed.plannedOperations : [];
        const canvasVsScheme = String(parsed.canvasVsScheme || 'unknown').trim() || 'unknown';
        const missingPartsSummary = Array.isArray(parsed.missingPartsSummary)
            ? parsed.missingPartsSummary.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const userFollowUpHint = String(parsed.userFollowUpHint || '').trim();
        if (this.currentSkillState && typeof this.currentSkillState === 'object') {
            this.currentSkillState.wiringEditPlan = {
                canvasVsScheme,
                missingPartsSummary,
                rationale,
                plannedOperations,
                userFollowUpHint,
                canvasStructureAnalysis: wa
            };
        }
        return {
            canvasVsScheme,
            missingPartsSummary,
            rationale,
            plannedOperations,
            userFollowUpHint,
            canvasStructureAnalysis: wa
        };
    }

    /**
     * 仅执行连线类操作（wiring_edit_skill）
     * @param {{ operations?: Array<Record<string, unknown>> }} payload
     * @returns {Promise<{ success: boolean, results?: Array<Record<string, unknown>>, error?: string }>}
     */
    async applyWiringEditOperations(payload) {
        if (typeof window === 'undefined' || !window.canvasManager) {
            return { success: false, error: '画布仅在渲染进程可用', results: [] };
        }
        const cm = window.canvasManager;
        const ops = Array.isArray(payload?.operations) ? payload.operations : [];
        const results = [];
        for (const op of ops) {
            const kind = String(op?.op || '').trim();
            try {
                if (kind === 'add_connection') {
                    const r = cm.addConnection({
                        id: op.id || `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        source: op.source,
                        target: op.target,
                        wireType: op.wireType || 'default',
                        path: op.path || [],
                        style: op.style || { thickness: 2, dashPattern: [] }
                    });
                    results.push({ op: kind, ok: !!r });
                    continue;
                }
                if (kind === 'remove_connection') {
                    const conn = cm.connections.find((c) => c.id === op.connectionId);
                    if (!conn) {
                        results.push({ op: kind, ok: false, error: 'connectionId 不存在' });
                        continue;
                    }
                    cm.saveState();
                    const updatedSides = cm.wireSpacingManager.unregisterWire(conn.id);
                    const idx = cm.connections.indexOf(conn);
                    if (idx > -1) cm.connections.splice(idx, 1);
                    if (Array.isArray(updatedSides)) {
                        updatedSides.forEach((side) => {
                            cm.updateConnectionsForSide(side.componentId, side.side);
                        });
                    }
                    cm.markProjectAsModified();
                    cm.draw();
                    results.push({ op: kind, ok: true });
                    continue;
                }
                results.push({ op: kind, ok: false, error: '仅支持 add_connection / remove_connection' });
            } catch (err) {
                results.push({ op: kind, ok: false, error: err?.message || String(err) });
            }
        }
        if (typeof cm.forceRender === 'function') cm.forceRender();
        const allOk = results.length > 0 && results.every((r) => r.ok);
        return { success: allOk || results.length === 0, results };
    }

    /**
     * 供主进程经 IPC 桥接读取 `currentSkillState`（异步接口与同步字段等价）
     * @returns {unknown}
     */
    getCurrentSkillState() {
        return this.currentSkillState;
    }
}

// 导出到全局
window.CircuitSkillsEngine = CircuitSkillsEngine;
