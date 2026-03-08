/**
 * Fast Hardware - 电路方案生成工作流引擎
 * 实现从需求分析到完整原型输出的端到端工作流
 */

/**
 * 工作流引擎类
 */
class CircuitWorkflowEngine {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.currentWorkflowState = null; // 当前工作流状态
    }

    /**
     * 判断用户消息是否需要走工作流
     * @param {string} userMessage - 用户消息
     * @param {Array} conversationHistory - 对话历史（可选）
     * @returns {Promise<{shouldRunWorkflow: boolean, confidence: number}>}
     */
    async shouldRunWorkflow(userMessage, conversationHistory = []) {
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

            // 检查是否有工作流相关的历史消息
            const hasWorkflowHistory = conversationHistory && conversationHistory.some(
                msg => msg.isWorkflow || (msg.type === 'assistant' && msg.content.includes('元件匹配') || msg.content.includes('工作流'))
            );

            // 构建判别提示词
            const systemPrompt = `你是一个智能助手，需要判断用户的消息是否应该走工作流（电路设计需求分析）。

**工作流的作用**：分析用户需求，提取所需电子元件，并与系统元件库进行匹配。

**判断规则**：

1. **应该走工作流（返回 {"action": "workflow"}）的情况**：
   - 用户**首次提出新的电路设计需求**（如"帮我设计一个声控灯"、"做一个温湿度监测系统"）
   - 用户明确要求**推荐/选择元件**（如"需要什么元件"、"推荐合适的传感器"）
   - 用户想要**生成新的电路方案**（如"设计一个追光系统"）
   - 用户**明确要求检查或匹配元件**（如"看看现在元件还缺什么"、"检查缺什么元件"、"开始匹配"、"匹配一下元件库"）

2. **不应该走工作流（返回 {"action": "reply"}）的情况**：
   - 用户**基于上下文的追问/澄清**（如"这个传感器是什么"、"为什么用这个"、"你说得对"、"我明白了"）
   - 用户**修正或补充信息**（如"不对，应该是..."、"我记错了"、"补充一下"）
   - 用户**询问功能/使用方法**（如"这个怎么用"、"代码怎么写"、"如何连接"）
   - 用户**普通对话**（如"谢谢"、"好的"、"明白了"）
   - 用户**要求解释/说明**（如"解释一下"、"什么意思"、"为什么"）

**特别注意**：
- 如果对话历史中已经有工作流分析结果，用户的新消息很可能是基于该结果的追问，应该直接回复
- 如果用户消息是短句、疑问句或修正性语句，通常是追问，不应该走工作流
- 只有明确的新需求或元件推荐请求才应该走工作流

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
            
            console.log('🔍 工作流判别详情:', {
                action: result.action,
                reason: result.reason,
                hasHistory: conversationHistory.length > 0,
                hasWorkflowHistory
            });
            
            return {
                shouldRunWorkflow: result.action === 'workflow',
                confidence: 0.9,
                reason: result.reason || ''
            };
        } catch (error) {
            console.error('❌ 工作流判别失败:', error);
            // 默认不走工作流（保守策略，避免误判追问）
            return { shouldRunWorkflow: false, confidence: 0.5, reason: '判别失败，默认不走工作流' };
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
  "narrative": "2～4 句简明分析文字，便于用户阅读"
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
                narrative: '未能解析出结构化方案，您可直接点击「开始匹配」进行元件库匹配。'
            };
        }

        this.currentWorkflowState = {
            stage: 'scheme_design',
            userRequirement,
            schemeDesignResult: schemeResult
        };

        console.log('✅ 方案设计完成:', schemeResult);
        return schemeResult;
    }

    /**
     * 格式化方案设计结果用于展示（含「开始匹配」「暂不匹配」按钮）
     * @param {Object} schemeDesignResult - 方案设计结果
     * @returns {string} HTML
     */
    formatSchemeDesignForDisplay(schemeDesignResult) {
        const escapeHtml = (t) => this._escapeHtml(t);
        const { summary, estimatedParams = {}, narrative } = schemeDesignResult;

        let html = '<div class="workflow-scheme-design">';
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
        html += '<div class="workflow-actions workflow-actions--scheme">';
        html += '<p>是否根据以上方案匹配元件库？</p>';
        html += '<div class="workflow-buttons">';
        html += '<button class="btn btn-primary" id="workflow-start-match">开始匹配</button>';
        html += '<button class="btn btn-secondary" id="workflow-skip-match">暂不匹配</button>';
        html += '</div></div>';
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

**必须按组件类型逐类检查，不得遗漏**。请按以下类型依次核对方案是否都需要，并列出对应元件：
- **主控**：MCU/单片机/开发板（如 Arduino、ESP32、STM32 等）
- **电源**：电池、电源管理、DC 电源开关等
- **传感器**：根据功能（声控→声音传感器，测距→超声波/激光测距，温湿度→温湿度传感器，姿态→陀螺仪/加速度计等）
- **执行器**：**极易遗漏，务必检查**。方案若涉及运动、机械、云台、无人机、机械臂、舵机、电机驱动等，**必须包含执行器**（如直流电机、舵机、步进电机、云台电机、电机驱动模块等）；库中无精确型号时用通用名称并 matchedKey 填 null
- **必要辅助**：开关（轻触/自锁）、电阻、电容、指示灯等

重要原则：
- **不要将产品名称本身作为元件**（如"声控灯""云台无人机"是产品名，需拆成具体元件类型）。
- **准确识别元件类型**（声控→声音传感器、测距→超声波/激光测距、无人机/云台→主控+电源+传感器+**电机/舵机等执行器**+辅助）。
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
  * recommendation：简短文字说明，如"建议选用更大容量电池以满足续航"或"当前库内无更大容量型号，建议外购 xxx 规格"
- **exists 含义**：1 = 类型匹配且选型满足需求；0 = 类型未匹配 或 选型不满足需求（均按“缺失/未满足”处理）。
${schemeDesignResult ? `
【匹配依据参考】以下为方案设计阶段的预估参数，请作为类型匹配与选型校验的参考，优先满足这些约束：
${JSON.stringify(schemeDesignResult.estimatedParams || {}, null, 2)}
方案概述：${schemeDesignResult.summary || ''}
` : ''}

返回格式（严格JSON）：
{
  "components": [
    {
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

        // 4. 解析LLM响应
        let analysisResult;
        try {
            // 尝试提取JSON（可能包含markdown代码块）
            const content = response.content.trim();
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                            content.match(/```\s*([\s\S]*?)\s*```/) ||
                            [null, content];
            const jsonStr = jsonMatch[1] || content;
            analysisResult = JSON.parse(jsonStr);
        } catch (error) {
            console.error('❌ 解析LLM响应失败:', error);
            throw new Error('LLM返回格式错误，无法解析匹配结果');
        }

        // 5. 保存工作流状态
        this.currentWorkflowState = {
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
     * 自动补全缺失元件
     * @param {Array<Object>} missingComponents - 缺失元件列表 [{name: string, ...}]
     * @returns {Promise<Array<Object>>} 创建的元件信息列表
     */
    async autoCompleteComponents(missingComponents) {
        console.log('🔧 开始自动补全缺失元件...', missingComponents);

        const createdComponents = [];

        for (const comp of missingComponents) {
            try {
                // 生成临时元件JSON
                const tempComponent = this.generateTempComponent(comp.name);
                
                // 保存到custom目录
                const result = await window.electronAPI.saveComponent(tempComponent, 'custom');
                
                if (result.success) {
                    createdComponents.push({
                        name: comp.name,
                        componentKey: tempComponent.id,
                        filePath: result.filePath
                    });
                    console.log(`✅ 已创建临时元件: ${comp.name} -> ${tempComponent.id}`);
                } else {
                    console.error(`❌ 创建元件失败: ${comp.name}`, result.error);
                }
            } catch (error) {
                console.error(`❌ 自动补全元件失败: ${comp.name}`, error);
            }
        }

        return createdComponents;
    }

    /**
     * 生成临时元件JSON结构
     * @param {string} componentName - 元件名称
     * @returns {Object} 元件JSON对象
     */
    generateTempComponent(componentName) {
        const timestamp = Date.now();
        const id = `ctm-${componentName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;

        return {
            id: id,
            name: componentName,
            displayName: componentName,
            category: 'other',
            description: `临时创建的元件：${componentName}（由工作流自动生成，请后续完善）`,
            width: 80,
            height: 60,
            pins: [
                {
                    id: 'pin1',
                    name: 'VCC',
                    type: 'power',
                    position: { x: 0, y: 0.5 }
                },
                {
                    id: 'pin2',
                    name: 'GND',
                    type: 'ground',
                    position: { x: 0, y: 1 }
                }
            ],
            tags: [componentName.toLowerCase()],
            metadata: {
                createdBy: 'workflow',
                createdAt: new Date().toISOString(),
                isTemporary: true
            }
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
     * @returns {string} 格式化的HTML内容
     */
    formatAnalysisResultForDisplay(analysisResult) {
        const { components, summary } = analysisResult;
        const escapeHtml = (t) => this._escapeHtml(t);
        const componentList = (this.currentWorkflowState && this.currentWorkflowState.componentList) || [];
        const displayNameByKey = new Map(componentList.map(c => [c.id, c.displayName]));

        // 生成方案分析摘要（简短指明需要哪些元件）
        const componentNames = components.map(c => c.name).join('、');
        const analysisSummary = summary || `根据您的需求，我识别出需要以下元件：${componentNames}`;

        let html = `<div class="workflow-analysis-result">`;
        html += `<h4>📋 方案分析</h4>`;
        html += `<p>${analysisSummary}</p>`;
        html += `<h4>🔍 元件匹配结果</h4>`;
        html += `<table class="component-match-table">`;
        html += `<thead><tr><th>元件名称</th><th>匹配状态</th><th>匹配结果</th></tr></thead>`;
        html += `<tbody>`;

        components.forEach(comp => {
            const status = comp.exists === 1 ? '✅' : '⚠️';
            const statusText = comp.exists === 1 ? '已匹配' : (comp.matchedKey ? '选型不满足' : '未找到');
            let resultText;
            if (comp.exists === 1) {
                resultText = displayNameByKey.get(comp.matchedKey) || comp.matchedKey || '-';
            } else if (!comp.matchedKey) {
                resultText = '当前元件库暂无';
            } else {
                if (comp.recommendedKey) {
                    resultText = displayNameByKey.get(comp.recommendedKey) || comp.recommendedKey;
                } else if (comp.recommendation) {
                    resultText = comp.recommendation;
                } else {
                    resultText = '当前元件库暂无';
                }
            }

            html += `<tr>`;
            html += `<td><strong>${escapeHtml(comp.name)}</strong></td>`;
            html += `<td>${status} ${statusText}</td>`;
            html += `<td class="match-result-cell">${escapeHtml(resultText)}</td>`;
            html += `</tr>`;
        });

        html += `</tbody></table>`;

        // 检查是否有未满足项（类型未匹配或选型不满足）
        const missingComponents = components.filter(c => c.exists === 0);
        if (missingComponents.length > 0) {
            html += `<div class="workflow-actions">`;
            html += `<p>⚠️ 检测到 <strong>${missingComponents.length}</strong> 个元件未满足需求（库中无匹配或选型不符），请选择处理方式：</p>`;
            html += `<div class="workflow-buttons">`;
            html += `<button class="btn btn-primary" id="workflow-auto-complete">自动补全</button>`;
            html += `<button class="btn btn-secondary" id="workflow-manual-complete">手动补全</button>`;
            html += `</div>`;
            html += `</div>`;
        } else {
            // 全部匹配：展示连线方式选项（仅样式，功能后续实现）
            html += `<div class="workflow-actions workflow-actions--complete">`;
            html += `<p>✅ 元件已齐全，请选择连线方式：</p>`;
            html += `<div class="workflow-buttons">`;
            html += `<button class="btn btn-primary" id="workflow-auto-wiring">自动连线</button>`;
            html += `<button class="btn btn-secondary" id="workflow-manual-wiring">手动连线</button>`;
            html += `</div>`;
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }
}

// 导出到全局
window.CircuitWorkflowEngine = CircuitWorkflowEngine;
