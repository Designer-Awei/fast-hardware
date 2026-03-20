/**
 * Fast Hardware - 电路方案 Skills 引擎
 * 实现从需求分析到完整原型输出的端到端 skills 执行链路
 */

/**
 * Skills 引擎类
 */
class CircuitSkillsEngine {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.currentSkillState = null; // 当前 skills 状态
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
            // Cursor 风格可观测反馈：显式标注正在搜索资料
            if (this.chatManager && typeof this.chatManager.setTypingIndicatorText === 'function') {
                this.chatManager.setTypingIndicatorText('正在搜索资料...');
            }
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
     * 判断用户消息是否需要走 skills 链路
     * @param {string} userMessage - 用户消息
     * @param {Array} conversationHistory - 对话历史（可选）
     * @returns {Promise<{shouldRunSkillsFlow: boolean, shouldRunWorkflow: boolean, confidence: number}>}
     */
    async shouldRunSkillsFlow(userMessage, conversationHistory = []) {
        try {
            // 构建对话历史上下文（仅保留最近2轮对话，避免上下文过长）
            let historyContext = '';
            if (conversationHistory && conversationHistory.length > 0) {
                const recentHistory = conversationHistory.slice(-4); // 最近2轮对话（每轮包含user和assistant）
                historyContext = '\n\n对话历史：\n';
                recentHistory.forEach((msg, idx) => {
                    if (msg.type === 'user') {
                        historyContext += `用户: ${msg.content}\n`;
                    } else if (msg.type === 'assistant') {
                        // 截断过长的AI回复
                        const content = msg.content.length > 500 
                            ? msg.content.substring(0, 500) + '...[内容过长已截断]'
                            : msg.content;
                        historyContext += `助手: ${content}\n`;
                    }
                });
            }

            // 检查是否有 skills 链路相关历史消息
            const hasSkillsHistory = conversationHistory && conversationHistory.some(
                msg => msg.isSkillFlow || (msg.type === 'assistant' && msg.content.includes('元件匹配') || msg.content.includes('skills'))
            );

            // 构建判别提示词
            const systemPrompt = `你是一个智能助手，需要判断用户的消息是否应该走 skills 链路（电路设计需求分析）。

**skills 链路的作用**：分析用户需求，提取所需电子元件，并与系统元件库进行匹配。

**判断规则**：

1. **应该走 skills 链路（返回 {"action": "workflow"}）的情况**：
   - 用户**首次提出新的电路设计需求**（如"帮我设计一个声控灯"、"做一个温湿度监测系统"）
   - 用户明确要求**推荐/选择元件**（如"需要什么元件"、"推荐合适的传感器"）
   - 用户想要**生成新的电路方案**（如"设计一个追光系统"）
   - 用户**明确要求检查或匹配元件**（如"看看现在元件还缺什么"、"检查缺什么元件"、"开始匹配"、"匹配一下元件库"）

2. **不应该走 skills 链路（返回 {"action": "reply"}）的情况**：
   - 用户**基于上下文的追问/澄清**（如"这个传感器是什么"、"为什么用这个"、"你说得对"、"我明白了"）
   - 用户**修正或补充信息**（如"不对，应该是..."、"我记错了"、"补充一下"）
   - 用户**询问功能/使用方法**（如"这个怎么用"、"代码怎么写"、"如何连接"）
   - 用户**普通对话**（如"谢谢"、"好的"、"明白了"）
   - 用户**要求解释/说明**（如"解释一下"、"什么意思"、"为什么"）

**特别注意**：
- 如果对话历史中已经有 skills 分析结果，用户的新消息很可能是基于该结果的追问，应该直接回复
- 如果用户消息是短句、疑问句或修正性语句，通常是追问，不应该走 skills 链路
- 只有明确的新需求或元件推荐请求才应该走 skills 链路

只返回JSON，不要其他内容。`;

            const userPrompt = `当前用户消息：${userMessage}${historyContext}

请根据用户消息和对话历史，判断应该执行什么操作。
返回JSON格式：
{"action": "workflow" | "reply", "reason": "判断理由（简短）"}`;

            // 调用LLM进行判别
            const response = await this.chatManager.callLLMAPI({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
                temperature: 0.2 // 降低温度，提高判断准确性
            });

            // 解析响应（尝试提取JSON）
            let content = response.content.trim();
            // 尝试提取JSON（可能包含markdown代码块）
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                            content.match(/```\s*([\s\S]*?)\s*```/) ||
                            [null, content];
            const jsonStr = jsonMatch[1] || content;
            const result = JSON.parse(jsonStr);
            
            console.log('🔍 skills 判别详情:', {
                action: result.action,
                reason: result.reason,
                hasHistory: conversationHistory.length > 0,
                hasSkillsHistory
            });
            
            return {
                shouldRunSkillsFlow: result.action === 'workflow',
                shouldRunWorkflow: result.action === 'workflow',
                confidence: 0.9,
                reason: result.reason || ''
            };
        } catch (error) {
            console.error('❌ skills 判别失败:', error);
            // 默认不走 skills 链路（保守策略，避免误判追问）
            return { shouldRunSkillsFlow: false, shouldRunWorkflow: false, confidence: 0.5, reason: '判别失败，默认不走 skills 链路' };
        }
    }


    /**
     * 运行方案设计阶段：对用户需求做简明分析并给出元件预估参数
     * @param {string} userRequirement - 用户需求描述
     * @returns {Promise<Object>} 方案设计结果 { summary, estimatedParams, narrative }
     */
    async runSchemeDesign(userRequirement) {
        console.log('📐 开始方案设计阶段...');

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
            // web search 阶段更显式（配合 chat.js 的 typing 指示）
            if (this.chatManager && typeof this.chatManager.setTypingIndicatorText === 'function') {
                this.chatManager.setTypingIndicatorText('正在搜索资料...');
            }
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

            // 结束资料检索，切回“总结方案”观感
            if (this.chatManager && typeof this.chatManager.setTypingIndicatorText === 'function') {
                this.chatManager.setTypingIndicatorText('正在总结方案...');
            }
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
        console.log('🔍 开始需求分析阶段...');

        // 1. 获取系统元件库列表（含 id 与显示名，供 LLM 匹配并返回正确 key）
        const componentList = await this.getSystemComponentNames();
        console.log('📦 系统元件库:', componentList.length, '个元件');

        // 列表格式：id (显示名)，便于 LLM 按显示名匹配且返回正确 id 作为 matchedKey
        const componentListForPrompt = componentList.map(
            (c, idx) => `${idx + 1}. ${c.id} (${c.displayName})`
        ).join('\n');

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
方案概述：${schemeDesignResult.summary || ''}${schemeDesignResult.webSearchReferenceText ? '\n\nWeb搜索参考（Exa）：\n' + schemeDesignResult.webSearchReferenceText : ''}
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

        // 3. 调用LLM进行分析
        const response = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
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

            // 1) 直接解析
            let obj = attempt(s);
            if (obj) return obj;

            // 2) 仅保留外层 {...}
            const first = s.indexOf('{');
            const last = s.lastIndexOf('}');
            if (first >= 0 && last > first) {
                const inner = s.slice(first, last + 1);
                obj = attempt(inner);
                if (obj) return obj;

                // 3) 粗修复：为 key 补双引号、把单引号字符串转双引号
                const repaired = inner
                    .replace(/(\{|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
                    .replace(/'/g, '"')
                    .replace(/,\s*([}\]])/g, '$1');
                obj = attempt(repaired);
                if (obj) return obj;
            }

            return null;
        };

        let analysisResult = null;
        try {
            const content = response.content.trim();
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                content.match(/```\s*([\s\S]*?)\s*```/) ||
                [null, content];
            const jsonStr = jsonMatch[1] || content;
            analysisResult = tryParseJson(jsonStr);
        } catch (error) {
            console.warn('⚠️ 解析 LLM 响应失败，准备重试:', error?.message || String(error));
        }

        if (!analysisResult) {
            // 重试一次：强制只输出严格 JSON
            const retryUserPrompt = `${userPrompt}\n\n请仅输出严格 JSON：1) 只能返回一个 JSON 对象；2) key 必须使用双引号；3) 不要包含任何额外解释文字。`;
            const retryResponse = await this.chatManager.callLLMAPI({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: retryUserPrompt }
                ],
                model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
                temperature: 0.1
            });

            const retryContent = String(retryResponse.content || '').trim();
            const retryJsonMatch = retryContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                retryContent.match(/```\s*([\s\S]*?)\s*```/) ||
                [null, retryContent];
            const retryJsonStr = retryJsonMatch[1] || retryContent;
            analysisResult = tryParseJson(retryJsonStr);
        }

        if (!analysisResult) {
            console.error('❌ LLM返回格式错误，无法解析匹配结果');
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

        // 4. 保存 skills 状态
        this.currentSkillState = {
            stage: 'requirement_analysis',
            userRequirement,
            analysisResult,
            componentList
        };

        console.log('✅ 需求分析完成:', analysisResult);
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
     * 校验 LLM 生成的 pins 是否足够“可落地”，用于生成-审核循环。
     * 该校验尽量保持轻量，避免再次引入复杂提示词导致的系统性漂移。
     * @param {any} spec - LLM 输出的元件 spec
     * @param {string|null} desiredCategory - 系统 category
     * @returns {{ok: boolean, pinTotal: number, minPins: number, issues: string[]}}
     */
    _validatePinsSpec(spec, desiredCategory) {
        const issues = [];
        const pins = spec?.pins;
        if (!pins || typeof pins !== 'object') {
            return { ok: false, pinTotal: 0, minPins: 2, issues: ['pins 缺失或格式错误'] };
        }

        const side1 = Array.isArray(pins.side1) ? pins.side1 : [];
        const side2 = Array.isArray(pins.side2) ? pins.side2 : [];
        const side3 = Array.isArray(pins.side3) ? pins.side3 : [];
        const side4 = Array.isArray(pins.side4) ? pins.side4 : [];

        const allowedPinTypes = new Set(['power', 'ground', 'digital_io', 'analog_io', 'special']);

        const pinTotal = side1.length + side2.length + side3.length + side4.length;
        const minPinsByCategory = {
            microcontroller: 4,
            sensor: 3,
            actuator: 3,
            power: 2,
            communication: 3,
            auxiliary: 2,
            other: 2
        };
        const minPins = minPinsByCategory[desiredCategory] ?? 2;

        const pinNameIsPlaceholder = (name) => {
            const s = String(name || '').trim();
            return /^PIN_?\d+$/i.test(s);
        };

        const allPins = [
            ...side1.map((p) => ({ side: 'side1', p })),
            ...side2.map((p) => ({ side: 'side2', p })),
            ...side3.map((p) => ({ side: 'side3', p })),
            ...side4.map((p) => ({ side: 'side4', p }))
        ];

        if (!Array.isArray(pins.side1)) issues.push('side1 不是数组');
        if (!Array.isArray(pins.side2)) issues.push('side2 不是数组');
        if (!Array.isArray(pins.side3)) issues.push('side3 不是数组');
        if (!Array.isArray(pins.side4)) issues.push('side4 不是数组');

        for (const item of allPins) {
            const p = item.p || {};
            const pinName = p?.pinName;
            const type = p?.type;
            const order = p?.order;

            if (!pinName || String(pinName).trim().length === 0) issues.push(`${item.side}: pinName 为空`);
            if (pinNameIsPlaceholder(pinName) && pinTotal < minPins + 1) issues.push(`${item.side}: 存在占位引脚名`);
            if (!type || !allowedPinTypes.has(String(type))) issues.push(`${item.side}: pin.type 非法`);
            if (!Number.isInteger(order) || order < 1) issues.push(`${item.side}: pin.order 非法`);
        }

        if (pinTotal < minPins) {
            issues.push(`pins 总数过少（${pinTotal} < ${minPins}）`);
        }

        return { ok: issues.length === 0, pinTotal, minPins, issues };
    }

    /**
     * 自动补全缺失元件
     * @param {Array<Object>} missingComponents - 缺失元件列表 [{name: string, ...}]
     * @returns {Promise<Array<Object>>} 创建的元件信息列表
     */
    async autoCompleteComponents(missingComponents) {
        console.log('🔧 开始自动补全缺失元件...', missingComponents);

        const createdComponents = [];

        for (const comp of missingComponents) {
            try {
                // 1) 如果 LLM 已经给出 recommendedKey（且该元件在系统库内存在），
                // 则直接复用该具体型号，避免生成新的“可能不一致”的临时元件。
                if (comp?.recommendedKey) {
                    createdComponents.push({
                        name: comp.name,
                        componentKey: comp.recommendedKey,
                        filePath: null,
                        status: 'reused',
                        analysisComponent: comp
                    });
                    console.log(`✅ 使用推荐型号复用元件: ${comp.name} -> ${comp.recommendedKey}`);
                    continue;
                }

                // 根据匹配结果的“元件类型”强关联 output category，避免生成临时元件类型错误
                const desiredCategory = comp?.type ? this.mapSkillTypeToSystemCategory(comp.type) : null;

                // 2) 必须先“确定具体型号”，再生成具体元件 spec
                let modelCandidate = comp?.recommendation
                    ? this._extractModelNameFromRecommendation(comp.recommendation)
                    : comp?.name;

                // 没有确定具体型号时：拒绝生成占位符，改为二次 web search 尝试确定具体型号
                if (!this._isConcreteModelCandidate(modelCandidate)) {
                    if (this.chatManager && typeof this.chatManager.setTypingIndicatorText === 'function') {
                        this.chatManager.setTypingIndicatorText('正在搜索缺失元件型号...');
                    }

                    const query = `${comp?.name || comp?.type || ''} 具体型号 datasheet`;
                    const search = await this.webSearchExa(String(query), { type: 'fast', numResults: 3 });
                    if (search?.success && Array.isArray(search.results) && search.results.length > 0) {
                        const fromWeb = this._extractModelFromWebSearchResults(search.results, comp?.name || comp?.type);
                        if (fromWeb) modelCandidate = fromWeb;
                    }
                }

                // 仍无法确定具体型号：跳过自动补全（避免生成“临时创建的元件：...”占位符）
                if (!this._isConcreteModelCandidate(modelCandidate)) {
                    console.warn(`⚠️ 缺失元件无法确定具体型号，无法自动补全：${comp?.type}:${comp?.name}`);
                    createdComponents.push({
                        name: comp.name,
                        componentKey: null,
                        filePath: null,
                        status: 'failed',
                        failureReason: '无法确定具体型号（已跳过自动补全，需要用户手动补全引脚）',
                        analysisComponent: comp
                    });
                    continue;
                }

                // 去重复用：如果系统标准库/自定义库里已经有同型号元件，则直接复用，避免生成重复 ctm-*.json
                const reusableHit = await this._findReusableComponentByModelToken(modelCandidate, desiredCategory);
                if (reusableHit?.id) {
                    createdComponents.push({
                        name: comp.name,
                        componentKey: reusableHit.id,
                        filePath: null,
                        status: 'reused',
                        analysisComponent: comp
                    });
                    console.log(`✅ 自动补全去重复用元件: ${comp.name} -> ${reusableHit.id}`);
                    continue;
                }

                // 3) 生成-校验-重试（最多 3 次）
                let pinoutEvidenceText = '';
                try {
                    // 为了让 LLM 输出“模块级 pinout（外部可接线接口）”，额外提供一个极短的引脚检索证据块。
                    let pinoutQuery = `${modelCandidate} 模块 引脚 pinout VCC GND 接线`;
                    // 充电模块 TP4056 更容易被 LLM 口径漂移，这里给更明确的引脚证据关键字
                    if (/tp4056/i.test(String(modelCandidate || ''))) {
                        pinoutQuery = 'TP4056 充电模块 引脚 VCC B+ B- GND CHG USB BAT 接线';
                    } else if (/t p 4056/i.test(String(modelCandidate || ''))) {
                        pinoutQuery = 'TP4056 充电模块 引脚 VCC B+ B- GND CHG USB BAT 接线';
                    }
                    const pinSearch = await this.webSearchExa(String(pinoutQuery), { type: 'fast', numResults: 2 });
                    if (pinSearch?.success && Array.isArray(pinSearch.results) && pinSearch.results.length > 0) {
                        pinoutEvidenceText = pinSearch.results
                            .slice(0, 2)
                            .map((r) => {
                                const title = r?.title ? String(r.title) : '';
                                const snippet = r?.snippet ? String(r.snippet) : '';
                                const url = r?.url ? String(r.url) : '';
                                return `- ${title}${url ? ` (${url})` : ''}\n  ${snippet}`;
                            })
                            .join('\n')
                            .slice(0, 900);
                    }
                } catch (pinErr) {
                    // 证据失败不阻断生成
                    console.warn('⚠️ 引脚证据检索失败（允许继续）：', pinErr?.message || String(pinErr));
                }

                const maxAttempts = 3;
                let saved = false;
                let lastReason = '';
                let lastValidation = null;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    // 仅在重试时给一个“很短”的 pins 修正约束
                    let pinsConstraintHint = '';
                    if (lastValidation && !lastValidation.ok) {
                        pinsConstraintHint = `请修正 pins：1）pins 总数至少 ${lastValidation.minPins}；2）side1~side4 都必须是数组（可为空）；3）不要使用占位引脚名（如 PIN_1）。`;
                    }

                    const temperature = attempt === 1 ? 0.2 : (attempt === 2 ? 0.15 : 0.12);

                    let spec = null;
                    try {
                        spec = await this.generateConcreteComponentSpecFromLLM(
                            modelCandidate,
                            desiredCategory,
                            pinoutEvidenceText,
                            pinsConstraintHint,
                            temperature
                        );
                    } catch (llmError) {
                        lastReason = llmError?.message || String(llmError);
                        continue;
                    }

                    if (!spec) {
                        lastReason = 'LLM 未返回有效 spec';
                        continue;
                    }

                    if (desiredCategory) spec.category = desiredCategory;

                    const validation = this._validatePinsSpec(spec, desiredCategory);
                    lastValidation = validation;
                    if (!validation.ok) {
                        lastReason = validation.issues.join('；');
                        continue;
                    }

                    const tempComponent = this.generateTempComponent(modelCandidate, spec);
                    const result = await window.electronAPI.saveComponent(tempComponent, 'custom');
                    if (result.success) {
                        createdComponents.push({
                            name: comp.name,
                            componentKey: tempComponent.id,
                            filePath: result.filePath,
                            status: 'created',
                            analysisComponent: comp
                        });
                        console.log(`✅ 已创建具体元件: ${comp.name} -> ${tempComponent.id}`);
                        saved = true;

                        // 让当前 skills 展示逻辑能立刻识别到新创建的元件
                        if (this.currentSkillState?.componentList) {
                            const existsInList = this.currentSkillState.componentList.some((c) => c.id === tempComponent.id);
                            if (!existsInList) {
                                this.currentSkillState.componentList.push({
                                    id: tempComponent.id,
                                    displayName: tempComponent.name
                                });
                            }
                        }
                        break;
                    }

                    lastReason = result?.error ? String(result.error) : 'saveComponent 返回失败';
                }

                if (!saved) {
                    createdComponents.push({
                        name: comp.name,
                        componentKey: null,
                        filePath: null,
                        status: 'failed',
                        failureReason: lastReason || 'pins 校验/生成失败（建议用户手动补全引脚）',
                        analysisComponent: comp
                    });
                }
            } catch (error) {
                console.error(`❌ 自动补全元件失败: ${comp.name}`, error);
                createdComponents.push({
                    name: comp.name,
                    componentKey: null,
                    filePath: null,
                    status: 'failed',
                    failureReason: error?.message ? String(error.message) : String(error),
                    analysisComponent: comp
                });
            }
        }

        return createdComponents;
    }

    /**
     * 使用 LLM 生成缺失元件的“具体型号规格”，输出严格 JSON。
     * @param {string} theoreticalName - 缺失元件的理论名称（可能是抽象词）
     * @param {string|null} [desiredCategoryHint=null] - 当外部已知目标 category 时，用于强约束输出类型
     * @param {string} [pinoutReferenceText=''] - 关于该模块引脚（模块外部可接线接口）的检索证据，用于约束 pins 输出
     * @param {string} [pinsConstraintHint=''] - 额外的 pins 质量约束（用于校验失败后的重试）
     * @param {number} [temperature=0.2] - LLM 生成温度
     * @returns {Promise<{
     *   name: string,
     *   description: string,
     *   category: string,
     *   dimensions: {width:number, height:number},
     *   pins: {side1:Array, side2:Array, side3:Array, side4:Array}
     * }>}
     */
    async generateConcreteComponentSpecFromLLM(theoreticalName, desiredCategoryHint = null, pinoutReferenceText = '', pinsConstraintHint = '', temperature = 0.2) {
        const userRequirement = this.currentSkillState?.userRequirement || '';
        const missingName = String(theoreticalName || '').trim();
        const desiredCategory = desiredCategoryHint ? String(desiredCategoryHint) : null;

        const systemPrompt = `你是一名资深硬件工程师与元件选型顾问。
把“缺失的理论元件名称”升级为“可落地的具体元件型号”，并输出严格 JSON（不允许额外文字、不要代码块）。

硬性规则：
1. 输出具体型号/器件名（不要泛称）。
2. description 必须是中文，且与型号强相关（包含供电/关键特性/常见用途）。
3. category 必须使用：microcontroller|sensor|actuator|power|communication|auxiliary|other（若 desiredCategory 存在则必须等于它）。
4. pins 结构必须完整包含：side1/side2/side3/side4，四者都必须是数组（可以为空数组）。
5. pins 内每个 pin 必须有：pinName（模块可接线命名）、type（power|ground|digital_io|analog_io|special）、order（从 1 开始的整数）。

输出 JSON 结构：
{
  "name": "具体型号/模块名称",
  "description": "与具体型号强相关的描述",
  "category": "microcontroller|sensor|actuator|power|communication|auxiliary|other",
  "dimensions": {"width": number, "height": number},
  "pins": {
    "side1": [{"pinName":"引脚名","type":"power|ground|digital_io|analog_io|special","order": 1}],
    "side2": [{"pinName":"引脚名","type":"power|ground|digital_io|analog_io|special","order": 1}],
    "side3": [{"pinName":"引脚名","type":"power|ground|digital_io|analog_io|special","order": 1}],
    "side4": [{"pinName":"引脚名","type":"power|ground|digital_io|analog_io|special","order": 1}]
  }
}`;

        const evidenceBlock = pinoutReferenceText
            ? `\n\n引脚参考（来自检索证据，请按“模块外部可接线接口”输出 pins）：\n${pinoutReferenceText}`
            : '';

        const pinsConstraintBlock = pinsConstraintHint
            ? `\n\npins 约束（必须遵守）：\n${pinsConstraintHint}`
            : '';

        const userPrompt = `用户需求（仅用于辅助选型语境）：${userRequirement}

缺失元件的理论名称/候选型号：${missingName}${evidenceBlock}

${pinsConstraintBlock}

请输出严格 JSON（不允许额外文字）。`;

        const response = await this.chatManager.callLLMAPI({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
            temperature
        });

        const content = String(response.content || '').trim();
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
            content.match(/```\s*([\s\S]*?)\s*```/) ||
            [null, content];
        const jsonStr = jsonMatch[1] || content;
        let spec;
        try {
            spec = JSON.parse(jsonStr);
        } catch (parseError) {
            // 兜底：尝试从响应中截取第一个 { 到最后一个 } 之间的内容
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                spec = JSON.parse(content.slice(firstBrace, lastBrace + 1));
            } else {
                throw parseError;
            }
        }

        // 如果疑似输出了“芯片封装级内部控制脚”，则重试一次，要求必须输出模块外部可接线接口 pins
        const pinNames = [];
        ['side1', 'side2', 'side3', 'side4'].forEach((side) => {
            const arr = spec?.pins?.[side];
            if (Array.isArray(arr)) {
                arr.forEach((p) => pinNames.push(String(p?.pinName || '')));
            }
        });
        const pinTotal = pinNames.length;
        const joinedPins = pinNames.join(' ').toLowerCase();
        const suspiciousChipControl = /bass|freq|gain|shdn|shutdown|mute|ref|vref|bias|tone/.test(joinedPins);

        const genericPackagePin = /(脚|引脚)\s*\d+|PIN_?\d+|\bPin_?\d+\b|\bPIN\s*\d+\b/i.test(joinedPins);
        const hasBoardGpioStyle = /gpio\s*\d+|tx\d*|rx\d*|sda|scl|3v3|5v|en\b|rst\b|d\d+/i.test(joinedPins);

        // 二端子/无源器件强制约束与重试逻辑容易引入漂移
        // 这里先关闭，避免导致 LLM 输出不完整时被兜底为只有 2 个引脚。
        const contextLower = `${missingName || ''} ${spec?.name || ''}`.toLowerCase();
        const isTwoTerminalPassive = false;
        const hasSigPin = pinNames.some((p) => String(p).toLowerCase() === 'sig');
        const hasInOut = pinNames.some((p) => {
            const pl = String(p).toLowerCase();
            return pl === 'in' || pl === 'out';
        });

        if (isTwoTerminalPassive && (pinTotal !== 2 || hasSigPin || hasInOut)) {
            const calcPinsInfo = (s) => {
                const out = [];
                ['side1', 'side2', 'side3', 'side4'].forEach((side) => {
                    const arr = s?.pins?.[side];
                    if (Array.isArray(arr)) {
                        arr.forEach((p) => out.push(String(p?.pinName || '')));
                    }
                });
                const total = out.length;
                const lowerJoin = out.join(' ').toLowerCase();
                const sig = out.some((p) => String(p).toLowerCase() === 'sig');
                const inOut = out.some((p) => {
                    const pl = String(p).toLowerCase();
                    return pl === 'in' || pl === 'out';
                });
                return { pinNames: out, pinTotal: total, hasSigPin: sig, hasInOut: inOut, joined: lowerJoin };
            };

            const parseSpecFromTwoTerminalRetry = (rawContent) => {
                const retryContent = String(rawContent || '').trim();
                const retryJsonMatch = retryContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                    retryContent.match(/```\s*([\s\S]*?)\s*```/) ||
                    [null, retryContent];
                const retryJsonStr = retryJsonMatch[1] || retryContent;
                return JSON.parse(retryJsonStr);
            };

            const twoTerminalHint = `该元件属于“二端子/无源器件”，pins 必须只输出两端口径：V+/V-（或 A/K），总共恰好 2 个引脚；禁止出现 SIG/IN/OUT 这类第三脚接口。`;
            const retryUserPrompt = `${userPrompt}\n\n${twoTerminalHint}`;

            const retryResponse = await this.chatManager.callLLMAPI({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: retryUserPrompt }
                ],
                model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
                temperature: 0.05
            });

            spec = parseSpecFromTwoTerminalRetry(retryResponse?.content);

            // 二次校验：仍不符合则再重试一次
            let info = calcPinsInfo(spec);
            const stillInvalid = info.pinTotal !== 2 || info.hasSigPin || info.hasInOut;
            if (stillInvalid) {
                const strictHint = `请再次输出，必须严格满足：
1) pins 总数恰好=2；
2) 禁止出现 pinName 为 SIG / IN / OUT；
3) 二端器件两端用“V+/V-”或“A/K”或“VCC/GND”（任选其一口径）；不要输出第三脚。`;

                const retryUserPrompt2 = `${userPrompt}\n\n${strictHint}`;
                const retryResponse2 = await this.chatManager.callLLMAPI({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: retryUserPrompt2 }
                    ],
                    model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
                    temperature: 0.03
                });
                spec = parseSpecFromTwoTerminalRetry(retryResponse2?.content);
                info = calcPinsInfo(spec);
            }

            // 如果二端无源重试逻辑被打开，会在这里做兜底；当前已关闭，保留但不执行
            if (info.pinTotal !== 2 || info.hasSigPin || info.hasInOut) {
                const dropByName = new Set(['in', 'out']);
                ['side1', 'side2', 'side3', 'side4'].forEach((side) => {
                    if (Array.isArray(spec?.pins?.[side])) {
                        spec.pins[side] = spec.pins[side].filter((p) => {
                            const pl = String(p?.pinName || '').toLowerCase();
                            return pl && !dropByName.has(pl);
                        });
                    }
                });
                // 截取到最多 2 个引脚
                const all = [];
                ['side1', 'side2', 'side3', 'side4'].forEach((side) => {
                    const arr = spec?.pins?.[side];
                    if (Array.isArray(arr)) {
                        arr.forEach((p) => all.push({ side, p }));
                    }
                });
                if (all.length > 2) {
                    const keep = new Set(all.slice(0, 2).map((x) => x));
                    const keptIds = new Set();
                    // 以对象引用来保留前2个：由于上面直接 filter/重建，引用可能不同，这里通过 pinName/type 顺序不做精确保持
                    // 退而求其次：保留前2个引脚并清空其余侧
                    // 重新按前2个构建 pins
                    const nextPins = { side1: [], side2: [], side3: [], side4: [] };
                    all.slice(0, 2).forEach(({ side, p }) => {
                        nextPins[side].push(p);
                    });
                    spec.pins = nextPins;
                }
            }

            // 更新为最新状态（供后续检测使用）
            const infoFinal = calcPinsInfo(spec);
            pinNames.length = 0;
            pinNames.push(...infoFinal.pinNames);
        }

        // 最终兜底：不依赖 LLM 重试结果，直接移除二端无源器件中的 SIG/IN/OUT，并强制 pins 至 2 根
        // 目的：避免旧 prompt/模型漂移导致 SIG 再次出现。
        if (isTwoTerminalPassive) {
            const dropByName = new Set(['sig', 'in', 'out']);
            const all = [];
            ['side1', 'side2', 'side3', 'side4'].forEach((side) => {
                const arr = spec?.pins?.[side];
                if (Array.isArray(arr)) {
                    arr.forEach((p) => all.push({ side, p }));
                }
            });

            const filtered = all.filter(({ p }) => {
                const pinName = String(p?.pinName || '').toLowerCase();
                return pinName && !dropByName.has(pinName);
            });

            const lowerType = (t) => String(t || '').toLowerCase();
            const powerPins = filtered.filter(({ p }) => lowerType(p?.type) === 'power');
            const groundPins = filtered.filter(({ p }) => lowerType(p?.type) === 'ground');

            const selected = [];
            if (powerPins.length > 0) selected.push(powerPins[0]);
            if (groundPins.length > 0 && selected.length < 2) selected.push(groundPins[0]);
            for (const item of filtered) {
                if (selected.length >= 2) break;
                const exists = selected.some(s => s.p === item.p);
                if (!exists) selected.push(item);
            }

            // 如果仍不足两根，兜底保留过滤后的前两根
            while (selected.length < 2 && filtered.length > selected.length) {
                selected.push(filtered[selected.length]);
            }

            const nextPins = { side1: [], side2: [], side3: [], side4: [] };
            selected.slice(0, 2).forEach(({ side, p }) => {
                nextPins[side].push(p);
            });
            spec.pins = nextPins;
        }

        // 只有在“疑似芯片封装/内部控制脚”且缺少典型“开发板外接引脚命名风格”时，才触发重试。
        // 避免误伤 ESP32/STM32 等开发板：它们引脚里可能含 GPIO0/IO1/D2 等编号是模块级标注。
        if (pinTotal >= 8 && (suspiciousChipControl || genericPackagePin) && !hasBoardGpioStyle) {
            const parseSpecFromRetry = (rawContent) => {
                const retryContent = String(rawContent || '').trim();
                const retryJsonMatch = retryContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                    retryContent.match(/```\s*([\s\S]*?)\s*```/) ||
                    [null, retryContent];
                const retryJsonStr = retryJsonMatch[1] || retryContent;
                let retrySpec;
                try {
                    retrySpec = JSON.parse(retryJsonStr);
                } catch (retryParseError) {
                    const firstBrace = retryContent.indexOf('{');
                    const lastBrace = retryContent.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                        retrySpec = JSON.parse(retryContent.slice(firstBrace, lastBrace + 1));
                    } else {
                        throw retryParseError;
                    }
                }
                return retrySpec;
            };

            const retryHint = `你这次输出疑似包含芯片封装内部控制脚（例如 gain/bass/freq/shdn/mute/ref 等）。请改为“模块外部可接线接口 pins”：保留供电脚（VCC/5V/3V3）与外部可接线接口（IN/OUT/SIG 或 I2C: SDA/SCL 或 UART: TX/RX 或 PWM/GPIO）。不要用“脚1/Pin1/PIN_1/引脚1”这种泛编号；但允许 ESP32/STM32 等开发板的 GPIO0/IO1/D2/TX0/RX0 这类模块级标注。`;
            const retryUserPrompt = `${userPrompt}\n\n${retryHint}`;

            const retryResponse = await this.chatManager.callLLMAPI({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: retryUserPrompt }
                ],
                model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
                temperature: 0.1
            });

            spec = parseSpecFromRetry(retryResponse?.content);
        }

        // 音频/功放类：如果 pins 太少（例如只有 VCC/GND/SIG），补强为至少 4 个模块外接接口
        // 目标：避免把“芯片内部控制脚”或“内部结构”当成模块接口，同时尽量包含 IN/OUT 或等价接口（如 SPK）。
        if (pinTotal < 4) {
            const contextText = `${missingName || ''} ${spec?.name || ''}`.toLowerCase();
            const isAudioAmpLike = /lm386|386|audio|amp|功放|放大|扬声器|喇叭|speaker/.test(contextText);

            if (isAudioAmpLike) {
                const parseSpecFromRetry2 = (rawContent) => {
                    const retryContent = String(rawContent || '').trim();
                    const retryJsonMatch = retryContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                        retryContent.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, retryContent];
                    const retryJsonStr = retryJsonMatch[1] || retryContent;
                    return JSON.parse(retryJsonStr);
                };

                const audioRetryHint = `你需要输出“模块外部可接线接口”的 pins，且至少包含 4 个外接引脚：VCC(power)、GND(ground)、IN(输入，analog_io 或 digital_io)、OUT(输出端，analog_io 或 digital_io；若是带喇叭模块则把输出端命名为 SPK)。`;
                const audioRetryUserPrompt = `${userPrompt}\n\n${audioRetryHint}\n\n并再次强调：不要输出芯片封装内部控制脚，不要输出脚1/Pin1/PIN_1 等封装脚编号风格。`;

                const audioRetryResponse = await this.chatManager.callLLMAPI({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: audioRetryUserPrompt }
                    ],
                    model: this.chatManager.selectedModel || this.chatManager.defaultChatModel,
                    temperature: 0.1
                });

                spec = parseSpecFromRetry2(audioRetryResponse?.content);
            }
        }

        if (!spec?.name || !spec?.description || !spec?.category || !spec?.pins || !spec?.dimensions) {
            throw new Error('LLM 返回的元件规格字段不完整');
        }

        if (desiredCategory) {
            const allowedCategories = new Set(['microcontroller', 'sensor', 'actuator', 'power', 'communication', 'auxiliary', 'other']);
            if (!allowedCategories.has(spec.category) || spec.category !== desiredCategory) {
                spec.category = desiredCategory;
            }
        }

        return spec;
    }

    /**
     * 基于元件名称做一个非常宽松的类别推断（只为让生成的 JSON 字段合理）。
     * @param {string} componentName - 缺失元件名称
     * @returns {string} component.category
     */
    deriveTemporaryCategory(componentName) {
        const name = String(componentName || '').toLowerCase();

        // 电源/电池
        if (name.includes('电池') || name.includes('battery') || name.includes('电源') || name.includes('power') || name.includes('tp4056')) {
            return 'power';
        }

        // 传感器（避免只命中“sensor”英文导致中文泛称落到 other）
        if (name.includes('传感器') || name.includes('sensor')) {
            return 'sensor';
        }

        // 控制器/主控
        if (name.includes('esp') || name.includes('arduino') || name.includes('mcu') || name.includes('nano') || name.includes('uno') || name.includes('stm32')) {
            return 'microcontroller';
        }

        // 传感器
        if (name.includes('温') || name.includes('湿') || name.includes('dht') || name.includes('sensor') || name.includes('超声') || name.includes('hc-sr04') || name.includes('mpu') || name.includes('vl53') || name.includes('hcsr04')) {
            return 'sensor';
        }

        // 执行器/驱动
        if (name.includes('执行器') || name.includes('舵机') || name.includes('servo') || name.includes('电机') || name.includes('motor') || name.includes('继电器') || name.includes('actuator')) {
            return 'actuator';
        }

        // 通信模块
        if (name.includes('蓝牙') || name.includes('bluetooth') || name.includes('wifi') || name.includes('lora') || name.includes('hc05') || name.includes('hc-05')) {
            return 'communication';
        }

        // 开关/指示/扩展等多半归辅助
        if (name.includes('开关') || name.includes('按钮') || name.includes('指示') || name.includes('led') || name.includes('relay') || name.includes('aux')) {
            return 'auxiliary';
        }

        return 'other';
    }

    /**
     * 将 skills 链路中的中文元件类型映射到系统元件 JSON 的 category 枚举。
     * @param {string} skillType - 技能链路类型：主控|电源|传感器|执行器|必要辅助
     * @returns {string|null} 系统 category：microcontroller|sensor|actuator|power|auxiliary|communication|other
     */
    mapSkillTypeToSystemCategory(skillType) {
        const t = String(skillType || '').trim();
        if (!t) return null;

        if (t === '主控') return 'microcontroller';
        if (t === '电源') return 'power';
        if (t === '传感器') return 'sensor';
        if (t === '执行器') return 'actuator';
        if (t === '必要辅助') return 'auxiliary';

        return null;
    }


    /**
     * 生成临时元件JSON结构
     * @param {string} componentName - 元件名称
     * @param {Object|null} [specOverride=null] - LLM 生成的具体元件规格（可选）
     * @returns {Object} 元件JSON对象
     */
    generateTempComponent(componentName, specOverride = null) {
        const timestamp = Date.now();
        const rawNameFromSpec = specOverride?.name ? String(specOverride.name).trim() : null;
        const rawName = rawNameFromSpec || String(componentName || '').trim() || 'component';
        // 兼容 Windows 文件名限制：移除非法字符；保留中文/字母数字以提升可读性
        const safeName = rawName
            .replace(/\s+/g, '-')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .toLowerCase();

        const id = `ctm-${safeName || 'component'}-${timestamp}`;
        const category = specOverride?.category ? String(specOverride.category) : this.deriveTemporaryCategory(rawName);

        // pins 与 dimensions 必须对齐系统 JSON 格式：side1~side4 数组，每项包含 pinName/type/order
        let pins = null;
        const pinsFromSpec = specOverride?.pins;
        if (pinsFromSpec && typeof pinsFromSpec === 'object') {
            const normalizePins = (sidePins) => {
                if (!Array.isArray(sidePins)) return [];
                return sidePins.map((p, idx) => ({
                    pinName: p?.pinName ? String(p.pinName) : `PIN_${idx + 1}`,
                    type: p?.type ? String(p.type) : 'special',
                    order: typeof p?.order === 'number' ? p.order : idx + 1
                }));
            };

            // LLM 有时会漏掉 side2/side4 的空数组；这里允许缺失 side 并自动填充为空数组
            pins = {
                side1: normalizePins(pinsFromSpec.side1),
                side2: normalizePins(pinsFromSpec.side2),
                side3: normalizePins(pinsFromSpec.side3),
                side4: normalizePins(pinsFromSpec.side4)
            };
        } else {
            // 最小兜底引脚模板（保证结构正确，便于后续人工完善）
            pins = category === 'power'
                ? {
                    side1: [{ pinName: 'VCC', type: 'power', order: 1 }],
                    side2: [],
                    side3: [{ pinName: 'GND', type: 'ground', order: 1 }],
                    side4: []
                }
                : {
                    side1: [
                        { pinName: 'VCC', type: 'power', order: 1 },
                    ],
                    side2: [],
                    side3: [{ pinName: 'GND', type: 'ground', order: 1 }],
                    side4: []
                };
        }

        const dimensions = specOverride?.dimensions && typeof specOverride.dimensions.width === 'number'
            ? {
                width: specOverride.dimensions.width,
                height: typeof specOverride.dimensions.height === 'number' ? specOverride.dimensions.height : 80
            }
            : { width: 160, height: 80 };

        const description = specOverride?.description
            ? String(specOverride.description)
            : `临时创建的元件：${rawName}（由 skills 链路自动生成，请后续完善）`;

        return {
            name: rawName,
            id,
            description,
            category,
            pins,
            dimensions,
            tags: [rawName.toLowerCase(), category]
        };
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
            html += `<p>⚠️ 检测到 <strong>${missingComponents.length}</strong> 个元件未满足需求（库中无匹配或选型不符）。系统将自动尝试生成/复用缺失元件；若仍失败，请在元件详情中手动补全引脚参数。</p>`;
            html += `</div>`;
        } else {
            html += `<div class="skills-actions workflow-actions workflow-actions--complete">`;
            html += `<p>✅ 元件已齐全。下一步可继续由 skills 链路完成后续补全/整理。</p>`;
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }
}

// 导出到全局
window.CircuitSkillsEngine = CircuitSkillsEngine;
