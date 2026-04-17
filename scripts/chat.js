/**
 * Fast Hardware - 对话管理脚本
 * 处理与AI助手的对话交互
 */

import {
    canonicalWorkspaceToolName,
    extractDirectWorkspaceFinalMessage,
    normalizeWorkspaceToolCalls,
    parseLooseJsonFromModel,
    workspaceToolArgsPreview,
    workspaceToolDetailSummary,
    workspaceToolPlanningSummary,
    workspaceToolResultPreview,
    workspaceToolShortNameForUi
} from './tools/workspace-direct-chat-tools.mjs';

/** 与 `scripts/skills/renderer-engine-bridge.js` 中 `ALLOWED_ENGINE_OPS` 保持一致 */
const ALLOWED_SKILLS_ENGINE_RPC_OPS = new Set([
    'runSchemeDesign',
    'runRequirementAnalysis',
    'runCompletionSuggestions',
    'runSummarizeText',
    'runFirmwareCodePatch',
    'getCanvasSnapshotForSkill',
    'runWiringEditPlan',
    'applyWiringEditOperations',
    'webSearchExa',
    'getCurrentSkillState'
]);

/**
 * 纯寒暄/短问候：不走 skills agent，直连 `chatWithAI`，降低首包延迟。
 * 含硬件/工程关键词的短句不视为寒暄，避免误伤「做个灯」等需求描述。
 * @param {string} text
 * @returns {boolean}
 */
function isSimpleChitchatMessage(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 48) return false;
    if (
        /电路|元件|芯片|云台|无人机|传感器|电机|MCU|BOM|画布|连线|电压|选型|方案|设计|硬件|Arduino|ESP|STM32|PWM|GPIO|飞控|电调|电池|LiPo|锂电池|螺旋桨|IMU|陀螺|航拍|模块|接口|引脚/i.test(
            t
        )
    ) {
        return false;
    }
    return /^(你好|您好|嗨|哈喽|hi|hello|hey|在吗|在么|早上好|中午好|下午好|晚上好|谢谢|多谢|辛苦|拜拜|再见)(\s|！|!|。|…|~|～|呀|哦|哈|啊|，|,|、)*$/i.test(
        t
    );
}

/**
 * 用户明确想先要简要说明、暂不跑 skills agent 编排时的保守路由（在 `isSimpleChitchatMessage` 之后判断）。
 * @param {string} text
 * @returns {boolean}
 */
function preferBriefAnswerFirst(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 220) return false;
    const wantsBrief =
        /简单说说|简要|先大概|了解一下就行|不用很详细|先说下思路|口头说说|先别查库|不用完整方案|先给思路|只要概念|大致讲讲/i.test(
            t
        );
    const strongDesignIntent =
        /BOM|原理图|元件库匹配|帮我画板|完整方案|按.*skill|必须调用|runBomAnalysis|画布上/i.test(t);
    return wantsBrief && !strongDesignIntent;
}

/**
 * 用户明确要求走完整 skills agent / 元件库编排（与默认短答区分）。
 * 含「写程序/示例/arduino」等显式词，或 **硬件实现句 + 要写代码**（避免仅聊天被直连短答）。
 * @param {string} text
 * @returns {boolean}
 */
function explicitFullAgentIntent(text) {
    const t = String(text || '');
    if (
        /「生成完整方案」|生成完整方案|「生成方案编排」|生成方案编排/.test(t) ||
        /(?:元件库|画布).{0,12}(?:匹配|方案|分析)|(?:完整|深度)(?:编排|方案).{0,8}(?:元件|库|画布)/.test(t) ||
        /BOM\s*匹配|帮我出(?:一份)?BOM|runBomAnalysis/i.test(t)
    ) {
        return true;
    }
    if (
        /固件|代码补丁|改代码|改固件|生成代码|示例代码|示例程序|写(?:个|一段)?(?:示例)?代码|\.ino|arduino|codegen|firmware|烧录|sketch|补丁/i.test(
            t
        )
    ) {
        return true;
    }
    /** 实现向：写/生成/来一段 + 程序或代码（不要求出现「示例」二字） */
    if (/(写|生成|给|编|出|来)(?:我|个|一)?(?:段)?(?:点)?(?:示例|示范)?(程序|代码|sketch)/i.test(t)) {
        return true;
    }
    /** 硬件语境 + 明确要落地代码（如 RGB/按键灯 + 帮我写…） */
    const hwCue = /rgb|led|灯|按键|传感器|电机|arduino|esp|stm32|pwm|gpio|供电|引脚|消抖|独立供电|三色|小灯/i.test(
        t
    );
    const implCue = /(写|生成|给|编|出|实现)(?:我|个|一)?(?:段)?(?:点)?(?:示例|示范)?(程序|代码|sketch)?|上板|烧录|固件/i.test(
        t
    );
    if (hwCue && implCue) {
        return true;
    }
    /** 「想做一个…灯」且同句出现写/代码/程序/示例/arduino */
    if (
        /(想做一个|想做|我要|帮我做|能否做).{0,48}(灯|led|rgb|按键)/i.test(t) &&
        /(写|代码|程序|示例|arduino|固件|sketch|\.ino)/i.test(t)
    ) {
        return true;
    }
    return false;
}

/**
 * 用户需要走主进程 Agent Loop，以便模型自主调用 `wiring_edit_skill` 等（排除极短的「什么是连线」类纯概念问）。
 * @param {string} text
 * @returns {boolean}
 */
function userMessageSuggestsSkillOrchestration(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    /** 含显式 skill / 工具名时允许更长指令，避免被 360 字截断误判为「不走 Agent」 */
    const explicitTool =
        /wiring_edit_skill|firmware_codegen_skill|scheme_design_skill|summarize_skill|completion_suggestion_skill|web_search_exa|add_connection|remove_connection/i.test(
            t
        );
    if (t.length > 360 && !explicitTool) return false;
    if (t.length > 4000) return false;
    if (/^(什么是|啥是|什么叫)\s*.{0,20}$/.test(t)) return false;
    return /连线|接线|补线|改线|连一下|接上|连上|飞线|自动连线|帮我连|帮(?:我)?(?:在)?画(?:布|板)(?:上)?(?:把|将)?.*连|画(?:布|板)(?:上)?.*(?:连|接)|电路(?:里)?.*(?:连|接)|引脚\s*(?:怎么|如何)?\s*连|GPIO\s*\d+.*连|wiring_edit|add_connection|remove_connection/i.test(
        t
    );
}

/**
 * 直连对话是否适合走「工作区工具」多轮读盘（与旧版预读全文触发条件一致）。
 * @param {string} userMessage
 * @returns {boolean}
 */
function directChatWantsProjectWorkspaceDeep(userMessage) {
    const um = String(userMessage || '');
    return /项目|工程|电路|画布|readme|\bino\b|固件|干啥|干什么|做什么|用途|了解|介绍|干嘛|是什[么麽]|啥用|circuit|功能是|干什么的|是干啥|本项目|该(?:项目|工程)|what\s*'?s?\s+this\s+project|what\s+does\s+(this|the)\s+project|purpose\s+of\s+(this|the)\s+project/i.test(
        um
    );
}

class ChatManager {
    constructor() {
        this.messages = [];
        /** @type {Map<string, { messages: Array<any> }>} */
        this._projectSessions = new Map();
        /** @type {string} */
        this._activeProjectSessionKey = 'project:default-unnamed';
        this.isTyping = false;
        this.selectedModel = 'Qwen/Qwen3.5-27B';
        this.defaultChatModel = 'Qwen/Qwen3.5-27B';
        this.defaultThinkingModel = 'Qwen/Qwen3-8B';
        this.defaultVisualModel = 'Qwen/Qwen2.5-VL-32B-Instruct';
        this.uploadedImages = []; // 支持多图上传
        this.currentImageIndex = 0; // 当前显示的图片索引
        this.hidePreviewTimeout = null; // 延迟隐藏定时器
        this.hideActionsTimeout = null; // 消息操作按钮延迟隐藏定时器
        this.isInterrupted = false; // 中断标志
        this.currentUserMessage = null; // 当前用户消息，用于中断恢复
        this.currentAbortController = null; // 用于中断API请求
        this.skillsEngine = null; // skills 引擎
        this.activeSkillContextId = null; // 当前“最新”skills上下文ID（用于消息追踪）
        /** @type {ReturnType<typeof setInterval>|null} skills 链路「用时 n S」定时器 */
        this._skillsFlowElapsedTimerId = null;
        /** @type {number|null} skills 链路开始时间戳（用于计时） */
        this._skillsFlowElapsedT0 = null;
        /** @type {number} 阶段行「用时 n S」峰值（与 `_buildSkillsFlowTypingLine` 一致，收口前再 flush） */
        this._skillsFlowMaxElapsedSec = 0;
        /** @type {string|null} skills 链路当前阶段文案（与计时组合展示） */
        this._skillsFlowPhaseLabel = null;
        /** @type {boolean} 是否处于 runSkillsAgentLoop 执行区间（用于在阶段切换时补建 typing 指示器） */
        this._skillsFlowActive = false;
        /** @type {number|null} 流式回复在 typing 气泡内刷新用的 rAF */
        this._typingStreamRaf = null;
        /** @type {string} 流式增量合并缓冲（与 rAF 对齐） */
        this._typingStreamPending = '';
        /** @type {number|null} 当前 skills agent 运行中写入的「块式追踪」助手消息 id */
        this._agentTraceMessageId = null;
        /** @type {boolean} 最终合成 SSE 进行中：仅刷新块列表后需恢复 `.fh-agent-answer-stream` */
        this._skillsAgentFinalSynthesisActive = false;
        /** @type {number|null} 阶段+用时行显示在追踪气泡 `.message-time` 上（避免双气泡） */
        this._agentTraceHeaderMessageId = null;
        /** @type {Promise<string>|null} `getAssetsPath` 缓存，供 data-icon 动态节点复用 */
        this._cachedAssetsPathPromise = null;
        /** 直连工作区工具是否已把正文合并进追踪气泡（避免再 push 一条助手消息） */
        this._mergedDirectWorkspaceReply = false;
        /** @type {number|null} 上述合并对应的消息 id */
        this._lastDirectWorkspaceTraceId = null;
        /** @type {number|null} 工作区工具循环 LLM 流式预览 rAF */
        this._workspaceLoopStreamRaf = null;
        /** @type {number|null} */
        this._workspaceLoopStreamPendingMsgId = null;
        /** @type {string} 工作区循环 SSE delta 合并缓冲 */
        this._workspaceLoopStreamBuf = '';
        this.init();
    }

    /**
     * 初始化对话管理器
     */
    async init() {
        this._configureMarkedRenderer();
        this._bindSkillsProgressBus();
        this.bindEvents();
        this.bindModelConfigEvents();
        if (typeof window.whenModelConfigLoaded?.then === 'function') {
            await window.whenModelConfigLoaded.catch((err) => {
                console.error('模型配置初始化未完成:', err);
            });
        }
        await this.loadInitialMessages();
        this._saveCurrentSessionState();
        await this.initializeModelDisplay();
        // 初始化 skills 引擎
        if (window.CircuitSkillsEngine) {
            this.skillsEngine = new window.CircuitSkillsEngine(this);
            console.debug('✅ skills 引擎初始化完成');
        } else {
            console.warn('⚠️ skills 引擎类未找到，请确保 circuit-skills-engine.js 已加载');
        }
        if (this.skillsEngine && window.electronAPI?.registerSkillsEngineRpcHandler) {
            window.electronAPI.registerSkillsEngineRpcHandler(async ({ op, args }) => {
                const engine = this.skillsEngine;
                if (!engine || typeof engine[op] !== 'function') {
                    throw new Error(`skillsEngine.${op} 不可用`);
                }
                if (!ALLOWED_SKILLS_ENGINE_RPC_OPS.has(op)) {
                    throw new Error(`不允许的 engine 操作: ${op}`);
                }
                return await engine[op](...(args || []));
            });
        }
    }

    /**
     * 打开 marked 的 GFM（表格等），与 CDN `marked.min.js` 各版本兼容
     * @returns {void}
     */
    _configureMarkedRenderer() {
        const m = typeof marked !== 'undefined' ? marked : null;
        if (!m) return;
        try {
            if (typeof m.use === 'function') {
                m.use({ gfm: true, breaks: true });
            } else if (typeof m.setOptions === 'function') {
                m.setOptions({ gfm: true, breaks: true });
            }
        } catch (e) {
            console.warn('[chat] marked 配置失败', e);
        }
    }

    /**
     * @returns {Promise<string>}
     */
    _ensureAssetsPathForIcons() {
        if (!this._cachedAssetsPathPromise) {
            this._cachedAssetsPathPromise =
                typeof window.electronAPI?.getAssetsPath === 'function'
                    ? window.electronAPI.getAssetsPath().catch(() => '')
                    : Promise.resolve('');
        }
        return this._cachedAssetsPathPromise;
    }

    /**
     * 将 `img[data-icon]` 映射到 `assets/icon-<name>.svg`（与 `main.js` initializeIconPaths 一致）
     * @param {HTMLImageElement} img
     * @returns {Promise<void>}
     */
    async _setImgDataIconSrc(img) {
        const name = img?.dataset?.icon;
        if (!name) return;
        try {
            const base = await this._ensureAssetsPathForIcons();
            if (base) {
                img.src = `file://${base}/icon-${name}.svg`;
            }
        } catch {
            /* empty */
        }
    }

    /**
     * @param {ParentNode|null} root
     * @returns {Promise<void>}
     */
    async _hydrateDataIconImgsIn(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const imgs = root.querySelectorAll('img[data-icon]');
        await Promise.all(Array.from(imgs).map((el) => this._setImgDataIconSrc(el)));
    }

    /**
     * Agent 块折叠按钮：展开显示 chevron-down，收起（已展开）显示 chevron-up
     * @param {HTMLButtonElement|null} btn
     * @param {boolean} detailsOpen
     * @returns {void}
     */
    _syncFhAgentBlockToggleChevron(btn, detailsOpen) {
        if (!btn) return;
        btn.setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
        btn.setAttribute('aria-label', detailsOpen ? '收起详情' : '展开详情');
        const img = btn.querySelector('img.fh-agent-block-toggle-icon[data-icon]');
        if (img) {
            img.dataset.icon = detailsOpen ? 'chevron-up' : 'chevron-down';
            void this._setImgDataIconSrc(img);
        }
    }

    /**
     * Skills 全链路调试日志（控制台可过滤 `[skills-chain]`）
     * @param {string} step - 步骤说明
     * @param {Record<string, unknown>} [extra] - 附加字段
     * @returns {void}
     */
    _logSkillsChain(step, extra) {
        if (extra !== undefined && extra !== null && typeof extra === 'object') {
            console.log('[skills-chain]', step, extra);
        } else {
            console.log('[skills-chain]', step);
        }
    }

    /**
     * 绑定模型配置事件
     */
    bindModelConfigEvents() {
        document.addEventListener('model-config-updated', (event) => {
            this.handleModelConfigUpdated(event.detail);
        });
    }

    /**
     * 处理模型配置更新
     * @param {Object} detail - 模型配置更新详情
     */
    handleModelConfigUpdated(detail) {
        if (!window.modelConfigManager) {
            return;
        }

        const defaultChatModel = window.modelConfigManager.getDefaultModel('chat');
        const defaultThinkingModel = window.modelConfigManager.getDefaultModel('thinking');
        const defaultVisualModel = window.modelConfigManager.getDefaultModel('visual');

        const getPreferred = (type, fallbackName) => {
            try {
                const key = `fastHardwarePreferredModel_${type}`;
                const stored = window.localStorage?.getItem(key);
                if (stored && window.modelConfigManager.getModelByName(stored)) {
                    return stored;
                }
            } catch (error) {
                console.warn('⚠️ 读取聊天层模型偏好失败:', error.message);
            }
            return fallbackName;
        };

        this.defaultChatModel = getPreferred('chat', defaultChatModel?.name || this.defaultChatModel);
        this.defaultThinkingModel = getPreferred('thinking', defaultThinkingModel?.name || this.defaultThinkingModel);
        this.defaultVisualModel = getPreferred('visual', defaultVisualModel?.name || this.defaultVisualModel);

        if (!this.selectedModel || !window.modelConfigManager.getModelByName(this.selectedModel)) {
            this.selectedModel = this.defaultChatModel;
        }

        const currentModelInfo = window.modelConfigManager.getModelByName(this.selectedModel);
        if (currentModelInfo) {
            this.updateModelDisplay(currentModelInfo);
        }

        console.debug('✅ 模型配置已同步到聊天管理器:', {
            defaultChatModel: this.defaultChatModel,
            defaultThinkingModel: this.defaultThinkingModel,
            defaultVisualModel: this.defaultVisualModel,
            selectedModel: this.selectedModel,
            source: detail?.syncStatus?.source || 'unknown'
        });
    }

    /**
     * 初始化模型显示
     */
    /**
     * 在 `whenModelConfigLoaded` 完成后刷新顶栏当前模型展示（无数据则保持 HTML 默认）
     * @returns {Promise<void>}
     */
    async initializeModelDisplay() {
        if (!window.modelConfigManager || window.modelConfigManager.models.length === 0) {
            return;
        }

        this.handleModelConfigUpdated({
            syncStatus: window.modelConfigManager.syncStatus
        });
    }

    /**
     * 更新模型显示
     * @param {Object} modelInfo - 模型信息对象
     * @param {boolean} updateSelection - 是否同时更新选中状态
     */
    updateModelDisplay(modelInfo, updateSelection = true) {
        const modelNameElement = document.getElementById('current-model');
        if (modelNameElement && modelInfo) {
            const displayText = modelInfo.displayName;
            modelNameElement.textContent = displayText;
            modelNameElement.title = modelInfo.description;

            // 同时更新下拉选项的选中状态
            if (updateSelection) {
                this.updateModelSelection(modelInfo.name);
            }
        } else {
            console.warn('⚠️ updateModelDisplay 失败 - element:', !!modelNameElement, 'modelInfo:', !!modelInfo);
        }
    }

    /**
     * 更新模型选项的选中状态
     * @param {string} modelName - 模型名称
     */
    updateModelSelection(modelName) {
        const modelOptions = document.querySelectorAll('.model-option');
        modelOptions.forEach(option => {
            if (option.getAttribute('data-model') === modelName) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        const sendBtn = document.getElementById('send-message');
        const input = document.getElementById('chat-input');
        const clearBtn = document.getElementById('clear-chat');
        const exportBtn = document.getElementById('export-chat');

        // 模型选择器相关元素
        const modelSelectBtn = document.getElementById('model-select');
        const modelDropdown = document.getElementById('model-dropdown');

        // 图片上传相关元素
        const imageUploadBtn = document.getElementById('image-upload');
        const imagePreview = document.getElementById('image-preview');
        const previewClose = document.getElementById('preview-close');
        const previewImage = document.getElementById('preview-image');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            input.addEventListener('input', () => {
                this.updateSendButton();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearChat());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportChat());
        }

        // 模型选择器事件
        if (modelSelectBtn) {
            modelSelectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleModelDropdown();
            });
        }

        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!modelSelectBtn?.contains(e.target) && !modelDropdown?.contains(e.target)) {
                this.closeModelDropdown();
            }
        });

        // 模型选项点击事件由 model-config.js 动态绑定

        // 图片上传事件
        if (imageUploadBtn) {
            imageUploadBtn.addEventListener('click', () => this.handleImageUpload());

            // 添加鼠标悬停事件（总是显示预览，包含添加图片区域）
            imageUploadBtn.addEventListener('mouseenter', () => {
                this.showHoverPreview();
            });

            imageUploadBtn.addEventListener('mouseleave', () => {
                this.hideHoverPreview();
            });
        } else {
            console.error('找不到图片上传按钮 image-upload');
        }

        // 图片预览事件
        if (imagePreview) {
            // 鼠标进入预览区域时取消隐藏
            imagePreview.addEventListener('mouseenter', () => {
                if (this.hidePreviewTimeout) {
                    clearTimeout(this.hidePreviewTimeout);
                    this.hidePreviewTimeout = null;
                    this.hidePreviewTimeout = null;
                }
            });

            // 鼠标离开预览区域时延迟隐藏
            imagePreview.addEventListener('mouseleave', () => {
                this.hideHoverPreview();
            });

            // 添加导航和删除按钮的事件监听器
            this.addPreviewControls();
        }

        // 图片预览关闭事件
        if (previewClose) {
            previewClose.addEventListener('click', () => this.clearUploadedImage());
        }

        // 代码块复制按钮事件委托
        document.addEventListener('click', (e) => {
            if (e.target.closest('.code-copy-btn')) {
                const button = e.target.closest('.code-copy-btn');
                const codeId = button.getAttribute('data-code-id');
                if (codeId) {
                    this.copyCodeToClipboard(codeId);
                }
            }
        });

        // 聊天区内 http(s) 链接用系统浏览器打开（Markdown 渲染后的 <a>）
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.fh-agent-block-toggle');
            if (btn && btn.closest('#chat-messages')) {
                e.preventDefault();
                e.stopPropagation();
                const details = btn.closest('details.fh-agent-block');
                if (details) {
                    details.open = !details.open;
                    this._syncFhAgentBlockToggleChevron(btn, details.open);
                }
                return;
            }
        });

        document.addEventListener(
            'toggle',
            (e) => {
                const el = e.target;
                if (!(el instanceof HTMLDetailsElement)) return;
                if (!el.classList.contains('fh-agent-block')) return;
                if (!el.closest('#chat-messages')) return;
                const sum = el.querySelector(':scope > summary.fh-agent-block-summary');
                const b = sum && sum.querySelector('.fh-agent-block-toggle');
                if (!b) return;
                this._syncFhAgentBlockToggleChevron(b, el.open);
            },
            true
        );

        document.addEventListener('click', (e) => {
            const inChat = e.target.closest('#chat-messages');
            if (!inChat) return;
            const anchor = e.target.closest('a');
            if (!anchor || !anchor.href) return;
            const href = anchor.getAttribute('href');
            if (!href || !/^https?:\/\//i.test(href)) return;
            if (window.electronAPI?.openExternal) {
                e.preventDefault();
                window.electronAPI.openExternal(href);
            }
        });

        // 项目标签切换：按项目隔离会话
        document.addEventListener('fh-project-switched', (e) => {
            const detail = e?.detail && typeof e.detail === 'object' ? e.detail : {};
            this._switchProjectSession(detail);
        });
    }

    /**
     * @param {{ projectId?: number, project?: { id?: number, path?: string|null, name?: string } }} detail
     * @returns {string}
     */
    _resolveProjectSessionKey(detail) {
        const project = detail && typeof detail.project === 'object' ? detail.project : {};
        const pid = detail?.projectId ?? project?.id;
        const pth = typeof project?.path === 'string' ? project.path.trim() : '';
        if (pth) return `project:path:${pth}`;
        if (pid != null) return `project:id:${pid}`;
        return 'project:default-unnamed';
    }

    /**
     * @returns {Array<any>}
     */
    _buildInitialAssistantMessages() {
        return [
            {
                id: Date.now(),
                type: 'assistant',
                content: '你好！我是Fast Hardware智能助手。我可以帮你进行硬件选型、电路设计和代码生成。请告诉我你想要实现什么功能？',
                timestamp: new Date()
            }
        ];
    }

    /**
     * @param {Array<any>} arr
     * @returns {Array<any>}
     */
    _cloneMessages(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map((m) => ({
            ...m,
            timestamp: m?.timestamp ? new Date(m.timestamp) : new Date()
        }));
    }

    /**
     * @returns {void}
     */
    _saveCurrentSessionState() {
        this._projectSessions.set(this._activeProjectSessionKey, {
            messages: this._cloneMessages(this.messages)
        });
    }

    /**
     * @param {{ projectId?: number, project?: { id?: number, path?: string|null, name?: string } }} detail
     * @returns {Promise<void>}
     */
    async _switchProjectSession(detail) {
        const nextKey = this._resolveProjectSessionKey(detail);
        if (nextKey === this._activeProjectSessionKey) return;
        this._saveCurrentSessionState();
        this._activeProjectSessionKey = nextKey;
        const got = this._projectSessions.get(nextKey);
        if (got && Array.isArray(got.messages)) {
            this.messages = this._cloneMessages(got.messages);
        } else {
            this.messages = this._buildInitialAssistantMessages();
            this._saveCurrentSessionState();
        }
        await this.renderMessages();
        this.scrollToBottom();
    }

    /**
     * 添加预览控件
     */
    addPreviewControls() {
        const preview = document.getElementById('image-preview');
        if (!preview) return;

        const content = preview.querySelector('.preview-content');
        if (!content) return;

        // 清除所有旧内容
        content.innerHTML = '';

        // 创建图片列表容器
        const imageListContainer = document.createElement('div');
        imageListContainer.className = 'preview-image-list';

        // 如果有图片，为每张图片创建容器和删除按钮
        if (this.uploadedImages.length > 0) {
            this.uploadedImages.forEach((image, index) => {
                const imageItem = document.createElement('div');
                imageItem.className = 'preview-image-item';
                imageItem.setAttribute('data-index', index);

                imageItem.innerHTML = `
                    <img src="${image.dataUrl}" alt="${image.name}" class="preview-item-image">
                    <button class="preview-item-delete" title="删除这张图片" data-index="${index}">
                        <span class="delete-icon">✕</span>
                    </button>
                `;

                imageListContainer.appendChild(imageItem);
            });
        }

        // 创建添加图片区域
        const addImageItem = document.createElement('div');
        addImageItem.className = 'preview-add-image-item';

        addImageItem.innerHTML = `
            <div class="add-image-placeholder">
                <span class="add-icon">+</span>
                <span class="add-text">点击添加图片</span>
            </div>
        `;

        imageListContainer.appendChild(addImageItem);

        // 添加到预览区域
        content.appendChild(imageListContainer);

        // 添加删除按钮事件监听器
        const deleteButtons = content.querySelectorAll('.preview-item-delete');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                this.deleteImageByIndex(index);
            });
        });

        // 添加图片区域点击事件
        const addImagePlaceholder = content.querySelector('.add-image-placeholder');
        if (addImagePlaceholder) {
            addImagePlaceholder.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleAddImage();
            });
        }
    }

    /**
     * 加载初始消息
     */
    async loadInitialMessages() {
        this.messages = this._buildInitialAssistantMessages();
        this.renderMessages();
    }

    /**
     * 发送消息
     */
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const content = input.value.trim();

        // 如果正在回复中，执行中断操作
        if (this.isTyping) {
            this.interruptResponse();
            return;
        }

        if (!content && this.uploadedImages.length === 0) return;

        // 构建消息内容
        let messageContent = content;
        if (this.uploadedImages.length > 0) {
            const imageDesc = this.uploadedImages.length === 1 ? '[图片]' : `[${this.uploadedImages.length}张图片]`;
            messageContent = messageContent || imageDesc;
        }

        // 保存当前输入内容，用于中断恢复
        this.currentUserMessage = {
            content: content,
            images: [...this.uploadedImages]
        };

        // 添加用户消息
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: messageContent,
            images: [...this.uploadedImages], // 复制图片数组
            model: this.selectedModel,
            timestamp: new Date()
        };

        this.messages.push(userMessage);
        await this.renderMessages();
        input.value = '';

        // 清除上传的图片
        if (this.uploadedImages.length > 0) {
            this.clearUploadedImage();
        }

        // 滚动到底部
        this.scrollToBottom();

        if (this.skillsEngine && (!userMessage.images || userMessage.images.length === 0)) {
            await this._dispatchAfterTextUserMessage(messageContent, userMessage);
            return;
        }

        // 图片消息仍走原有多模态回复流程
        this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images, {
            progressMode: 'vision'
        });
    }

    /**
     * 中断当前AI回复
     */
    async interruptResponse() {
        if (!this.isTyping) return;

        const wasSkillsFlow = this._skillsFlowActive;

        // 设置中断标志
        this.isInterrupted = true;

        if (wasSkillsFlow && window.electronAPI?.abortSkillsAgentLoop) {
            window.electronAPI.abortSkillsAgentLoop();
        }

        if (!wasSkillsFlow) {
            this._skillsFlowActive = false;
        }

        // 中断API请求（多模态/旧链路 fetch；主进程 Skills Agent 另由 abortSkillsAgentLoop 通知）
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }

        // 隐藏正在输入指示器
        this.hideTypingIndicator();

        if (!wasSkillsFlow) {
            // 移除最后一条AI消息（如果存在）
            if (this.messages.length > 0 && this.messages[this.messages.length - 1].type === 'assistant' && this.messages[this.messages.length - 1].isTyping) {
                this.messages.pop();
            }

            // 移除用户发送的消息（如果存在）
            if (this.messages.length > 0 && this.messages[this.messages.length - 1].type === 'user') {
                this.messages.pop();
            }

            // 恢复输入框内容
            if (this.currentUserMessage) {
                const input = document.getElementById('chat-input');
                if (input) {
                    input.value = this.currentUserMessage.content;

                    // 恢复图片
                    if (this.currentUserMessage.images && this.currentUserMessage.images.length > 0) {
                        this.uploadedImages = [...this.currentUserMessage.images];
                        this.currentImageIndex = 0;
                        this.toggleImagePreview();
                    }
                }
            }
        }

        // 重置状态
        this.isTyping = false;
        if (!wasSkillsFlow) {
            this.currentUserMessage = null;
        }

        // 重新渲染消息
        await this.renderMessages();

        // 更新按钮状态
        this.updateSendButton();
    }

    /**
     * 当前工作台打开的项目元数据（无磁盘读取）。
     * @returns {{ path: string, folderName: string, sep: string, norm: string } | null}
     */
    _getOpenProjectMeta() {
        const app = typeof window !== 'undefined' ? window.app : null;
        const projectPathRaw = app?.currentProject ? String(app.currentProject).trim() : '';
        if (!projectPathRaw) {
            return null;
        }
        const folderName =
            typeof app.getProjectNameFromPath === 'function'
                ? app.getProjectNameFromPath(projectPathRaw)
                : projectPathRaw.split(/[/\\]/).filter(Boolean).pop() || '';
        const sep = projectPathRaw.includes('/') && !projectPathRaw.includes('\\') ? '/' : '\\';
        const norm = projectPathRaw.replace(/[/\\]+$/, '');
        return { path: projectPathRaw, folderName, sep, norm };
    }

    /**
     * 直连对话用的**轻量**项目提示（不读盘、不长列表）。
     * @param {{ path: string, folderName: string } | null} meta
     * @returns {string}
     */
    _buildLightweightOpenProjectScaffold(meta) {
        if (!meta) {
            return '';
        }
        const lines = [
            '【当前打开的项目（轻量摘要，不含磁盘文件全文）】',
            `- 本地路径：${meta.path}`,
            `- 文件夹名：${meta.folderName || '（未知）'}`,
            '- 【表述】若用户讨论项目内 Arduino/.ino 固件：宜说「**更新/修订**当前固件或补丁」，避免「从零生成整个项目代码」等表述（除非确认尚未存在 .ino）。'
        ];
        if (this.skillsEngine && typeof this.skillsEngine.getCanvasSnapshotForSkill === 'function') {
            const snap = this.skillsEngine.getCanvasSnapshotForSkill();
            if (snap && !snap.error) {
                const comps = Array.isArray(snap.components) ? snap.components.length : 0;
                const conns = Array.isArray(snap.connections) ? snap.connections.length : 0;
                lines.push(`- 画布：约 ${comps} 个元件、${conns} 条连线（未列明细）`);
            } else if (snap?.error) {
                lines.push(`- 画布：暂不可读（${snap.error}）`);
            }
        }
        return lines.join('\n');
    }

    /**
     * 为直连对话附加画布 JSON（未保存项目无磁盘路径、不会走工作区工具时使用）。
     * @returns {string}
     */
    _buildCanvasSnapshotJsonForDirectChat() {
        try {
            const eng = this.skillsEngine;
            if (!eng || typeof eng.getCanvasSnapshotForSkill !== 'function') {
                return JSON.stringify({ error: 'skillsEngine 不可用' }, null, 2);
            }
            const snap = eng.getCanvasSnapshotForSkill();
            const safe = snap && typeof snap === 'object' ? snap : { error: 'snapshot invalid' };
            let s = JSON.stringify(safe, null, 2);
            const max = 12000;
            if (s.length > max) {
                s = `${s.slice(0, max)}\n…(快照已截断，仍可根据已有字段判断是否为空画布)`;
            }
            return s;
        } catch (e) {
            return JSON.stringify({ error: e?.message || String(e) }, null, 2);
        }
    }

    /**
     * 类 Cursor 的多轮工具说明：模型按需 list/read/grep，避免首轮塞全文。
     * @param {{ path: string, folderName: string } | null} meta
     * @returns {string}
     */
    _buildProjectWorkspaceToolingPrompt(meta) {
        if (!meta) {
            return '';
        }
        let canvasHint = '';
        if (this.skillsEngine && typeof this.skillsEngine.getCanvasSnapshotForSkill === 'function') {
            const snap = this.skillsEngine.getCanvasSnapshotForSkill();
            if (snap && !snap.error) {
                const comps = Array.isArray(snap.components) ? snap.components.length : 0;
                const conns = Array.isArray(snap.connections) ? snap.connections.length : 0;
                canvasHint = `当前画布约 ${comps} 元件、${conns} 连线；细节请用 read_file 读 circuit_config.json。\n`;
            }
        }
        return [
            '【工作区工具 · Cursor 式按需读盘】',
            `项目根目录（绝对路径）：${meta.path}`,
            `文件夹名：${meta.folderName || '（未知）'}`,
            canvasHint.trimEnd(),
            '',
            '你**尚未**看到磁盘文件内容；请先通过工具读取再回答。',
            '',
            '### 尚需读盘时（调用工具）',
            '输出**单个 JSON 对象**（不要用 Markdown 代码块包裹整段）。字段：',
            '- `reasoning_steps`（可选）',
            '- `workspace_tool_calls`：**非空数组**（本回合要继续读盘时必填）',
            '`workspace_tool_calls` 每项：`{ "name": "<工具名>", "args": { ... } }`。**工具名**可用简短式（list_dir、read_file、grep_workspace）或与 agent 一致的 **workspace_***（workspace_list_dir、workspace_read_file、workspace_grep、workspace_explore、workspace_verify）。',
            '- list / workspace_list_dir：args.relativePath 相对项目根，默认 `"."`',
            '- read / workspace_read_file：args.relativePath 必填；args.maxChars 500～64000（默认 12000）。**长文件**：不传行号则从文件头读取并可能在换行处截断，返回 `nextStartLine` / `nextCharOffset`；**按行续读**传 `startLine` / `endLine`（1-based，含首尾）；仅 `startLine` 时默认再读约 320 行；**按字符续读**传 `charOffset`（0-based）。返回含 `totalLines`、`lineRange`、`truncated`、`note`。',
            '- grep / workspace_grep：项目根**一级**文件内**子串**搜索；args.pattern 必填',
            '- explore / workspace_explore：args.relativePath 默认 `"."`；args.maxDepth 1～4；args.maxEntries 默认 80',
            '- verify / workspace_verify：args.relativePath 必填；args.expect 可选 `"file"`|`"directory"`',
            '',
            '### 信息已足够时（最终答复）',
            '**直接输出中文 Markdown** 给用户：不要 JSON、不要用代码块包裹整段答复。**正文不得以字符 `{` 打头**（勿先输出 JSON），以便与「工具回合」区分。',
            '',
            '兼容旧习惯：也可输出仅含 `final_message` 的单层 JSON（`workspace_tool_calls` 为 `[]` 或省略），但**优先**使用纯 Markdown 终答。',
            '',
            '首轮若需要了解项目用途：可先 list_dir 或 workspace_explore，再 read_file(circuit_config.json) 与相关 .ino。不要说「未收到项目文件」。',
            '若已确认目录中存在非空 `.ino`：向用户说明固件相关动作时使用「**更新/修订当前固件**」「生成**补丁**」，避免「从零生成整套代码文件」。'
        ]
            .filter((x) => x !== '')
            .join('\n');
    }

    /**
     * 执行一条工作区工具（经主进程 `project-workspace-tools`，与 agent-loop 同源）。
     * @param {string} toolName
     * @param {object} args
     * @param {{ path: string }} extraMeta - path 为项目根绝对路径
     * @returns {Promise<Record<string, unknown>>}
     */
    async _executeProjectWorkspaceTool(toolName, args, extraMeta) {
        const api = window.electronAPI;
        const name = canonicalWorkspaceToolName(toolName);
        const a = args && typeof args === 'object' ? args : {};
        const projectRoot = String(extraMeta?.path || '').trim();

        if (!api?.executeProjectWorkspaceTool) {
            return { success: false, error: '工作区工具 IPC 不可用（请使用 Electron 启动）' };
        }
        if (!projectRoot) {
            return { success: false, error: '未设置项目根路径' };
        }

        try {
            const out = await api.executeProjectWorkspaceTool({
                projectRoot,
                toolName: name,
                args: a
            });
            if (out && out.success === true && out.data != null && typeof out.data === 'object' && !Array.isArray(out.data)) {
                return { success: true, ...out.data };
            }
            if (out && out.success === true) {
                return { success: true, data: out.data };
            }
            return { success: false, error: String(out?.error || '工作区工具执行失败') };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    }

    /**
     * 解析模型 JSON：兼容 `workspace_tool_calls` 与 `tool_calls`。
     * @param {any} parsed
     * @returns {{ toolCalls: ReturnType<typeof normalizeWorkspaceToolCalls>, finalMessage: string }}
     */
    _parseWorkspaceModelJson(parsed) {
        if (!parsed || typeof parsed !== 'object') {
            return { toolCalls: [], finalMessage: '' };
        }
        const rawCalls = parsed.workspace_tool_calls ?? parsed.tool_calls;
        let toolCalls = normalizeWorkspaceToolCalls(rawCalls);
        if (
            toolCalls.length === 0 &&
            Array.isArray(parsed.tool_calls) &&
            parsed.tool_calls.length > 0
        ) {
            toolCalls = normalizeWorkspaceToolCalls(
                parsed.tool_calls.map((x) => ({
                    ...x,
                    name: x.skillName || x.name
                }))
            );
        }
        const finalMessage = typeof parsed.final_message === 'string' ? parsed.final_message.trim() : '';
        return { toolCalls, finalMessage };
    }

    /**
     * 多轮工作区工具循环；成功返回用户可见 Markdown，失败返回 null 以回退单轮流式。
     * @param {Array<{role:string, content: unknown}>} messages
     * @param {string} model
     * @param {{ siliconFlowEnableThinking?: boolean, stream?: boolean, directReplyStyle?: string }} [apiOptions]
     * @param {{ norm: string, sep: string, path: string }} meta
     * @param {number|null} [traceMessageId] - 追踪气泡 id，用于展示与 agent-loop 同形的 tool 折叠块
     * @returns {Promise<string|null>}
     */
    async _runDirectChatProjectWorkspaceLoop(messages, model, apiOptions, meta, traceMessageId = null) {
        const maxIter = 5;
        /** @type {Array<{role:string, content: unknown}>} */
        let loopMessages = messages.map((m) => ({
            role: m.role,
            content: m.content
        }));

        for (let iter = 0; iter < maxIter; iter++) {
            if (this.isInterrupted) {
                return null;
            }

            const useStream =
                traceMessageId != null &&
                typeof window.electronAPI?.onSiliconflowChatStream === 'function';

            this._workspaceLoopStreamBuf = '';
            this._cancelWorkspaceLoopStreamRaf();

            let unsubscribeStream = null;
            if (useStream) {
                unsubscribeStream = window.electronAPI.onSiliconflowChatStream((payload) => {
                    if (this.isInterrupted) return;
                    const delta = typeof payload?.delta === 'string' ? payload.delta : '';
                    if (!delta) return;
                    this._workspaceLoopStreamBuf += delta;
                    this._scheduleWorkspaceLoopStreamPreview(traceMessageId);
                });
            }

            const callOpts = {
                ...(apiOptions && typeof apiOptions === 'object' ? apiOptions : {}),
                stream: useStream
            };
            let result;
            try {
                result = await window.electronAPI.chatWithAI(loopMessages, model, callOpts);
            } catch (e) {
                console.warn('[direct-project-tools] API 异常:', e?.message || e);
                return null;
            } finally {
                if (typeof unsubscribeStream === 'function') {
                    unsubscribeStream();
                }
                this._cancelWorkspaceLoopStreamRaf();
            }

            if (!result?.success || typeof result.content !== 'string') {
                console.warn('[direct-project-tools] API 失败:', result?.error);
                return null;
            }

            const raw = result.content;
            if (useStream && traceMessageId != null) {
                this._workspaceLoopStreamBuf = raw;
                this._applyWorkspaceLoopStreamToDom(traceMessageId);
            }
            const parsed = parseLooseJsonFromModel(raw);
            const { toolCalls, finalMessage } = this._parseWorkspaceModelJson(parsed);

            if (toolCalls.length === 0) {
                const extracted = extractDirectWorkspaceFinalMessage(raw);
                if (extracted) {
                    return extracted;
                }
                if (finalMessage) {
                    return finalMessage;
                }
                const trimmed = raw.trim();
                if (trimmed && !parsed) {
                    return trimmed;
                }
                return null;
            }

            console.log(`[direct-project-tools] 第 ${iter + 1} 轮：${toolCalls.length} 个工具调用`);

            const traceMsg =
                traceMessageId != null ? this.messages.find((m) => m.id === traceMessageId) : null;

            /** @type {object[]} */
            const batchResults = [];
            for (const tc of toolCalls) {
                if (traceMsg && Array.isArray(traceMsg.agentBlocks)) {
                    traceMsg.agentBlocks.push({
                        blockType: 'tool',
                        phase: 'run',
                        toolCallId: tc.toolCallId,
                        skillName: tc.name,
                        shortName: workspaceToolShortNameForUi(tc.name),
                        argsPreview: workspaceToolArgsPreview(tc.args),
                        detailSummary: workspaceToolPlanningSummary(tc.name, tc.args)
                    });
                    await this._refreshAgentTraceBlocksDom(traceMessageId);
                }

                const one = await this._executeProjectWorkspaceTool(tc.name, tc.args, meta);
                batchResults.push({
                    toolCallId: tc.toolCallId,
                    name: tc.name,
                    ...one
                });

                if (traceMsg && Array.isArray(traceMsg.agentBlocks)) {
                    const pending = [...traceMsg.agentBlocks]
                        .reverse()
                        .find(
                            (b) =>
                                b &&
                                b.blockType === 'tool' &&
                                b.phase === 'run' &&
                                String(b.toolCallId || '') === String(tc.toolCallId)
                        );
                    if (pending) {
                        pending.phase = 'done';
                        pending.success = one.success !== false && !one.error;
                        pending.resultPreview = workspaceToolResultPreview(
                            /** @type {Record<string, unknown>} */ (one)
                        );
                        pending.detailSummary = workspaceToolDetailSummary(
                            tc.name,
                            tc.args,
                            /** @type {Record<string, unknown>} */ (one)
                        );
                    }
                    await this._refreshAgentTraceBlocksDom(traceMessageId);
                }
            }

            loopMessages.push({ role: 'assistant', content: raw });
            loopMessages.push({
                role: 'user',
                content: [
                    '[workspace_tool 执行结果]',
                    JSON.stringify(batchResults, null, 2),
                    '',
                    '请继续：',
                    '- **仍需工具**：仅输出一层 JSON，且含**非空** `workspace_tool_calls`（可有 reasoning_steps）。本回合不要输出最终 Markdown。',
                    '- **信息已足够**：直接输出中文 Markdown 终答；**全文不得以 `{` 打头**，不要 JSON、不要用代码块包裹整段。',
                    '- 兼容：也可输出仅含 `final_message` 的单层 JSON（`workspace_tool_calls` 为 `[]` 或省略）。',
                    '- read_file 若 `truncated`：用返回的 `nextStartLine`（按行）或 `nextCharOffset`（按字符）续读，可酌情调大 `maxChars`（≤64000）。'
                ].join('\n')
            });
        }

        return '（工作区工具轮次已用尽，请缩短问题或新开对话重试。）';
    }

    /**
     * 直连 LLM：模拟/执行 AI 回复（非 skills 编排链路）。
     * @param {string} userMessage
     * @param {string} model
     * @param {Array} images
     * @param {{ progressMode?: string, directReplyStyle?: string, siliconFlowEnableThinking?: boolean, stream?: boolean }} [apiOptions]
     * @returns {Promise<void>}
     */
    async simulateAIResponse(userMessage, model, images, apiOptions = {}) {
        this.isTyping = true;
        this.isInterrupted = false;

        /** 与 agent-loop 同形：阶段 + 用时（直连 LLM 不设 `_skillsFlowActive`，避免误走 abortSkillsAgentLoop） */
        const mode = apiOptions.progressMode;
        let phase = '对话模式 · 生成回复';
        if (mode === 'chitchat') {
            phase = '直连对话 · 生成回复';
        } else if (mode === 'brief') {
            phase = '直连对话 · 简要说明';
        } else if (apiOptions.directReplyStyle === 'shortDefault') {
            phase = '直连对话 · 简要答疑';
        } else if (mode === 'vision' || (images && images.length > 0)) {
            phase = '多模态对话 · 视觉理解';
        } else if (isSimpleChitchatMessage(userMessage)) {
            phase = '直连对话 · 生成回复';
        }
        await this._beginDirectLlmProgressUi(phase);

        // 立即更新按钮状态为中断模式
        this.updateSendButton();

        // 创建AbortController用于中断请求
        this.currentAbortController = new AbortController();

        try {
            // 使用实际的API模型名称，而不是UI显示文本
            let currentModel = this.selectedModel || this.defaultChatModel;
            
            // 🔄 智能模型切换逻辑
            if (window.modelConfigManager) {
                const modelInfo = window.modelConfigManager.getModelByName(currentModel);
                
                if (images && images.length > 0) {
                    // 场景1: 有图片输入 - 切换到视觉模型
                    if (modelInfo && (modelInfo.appType || modelInfo.type) !== 'visual') {
                        currentModel = this.defaultVisualModel;
                        console.log(`🔄 检测到图片输入，自动从 ${modelInfo.displayName} 切换到视觉模型`);
                        
                        // 更新UI显示
                        const visualModelInfo = window.modelConfigManager.getModelByName(currentModel);
                        if (visualModelInfo) {
                            this.updateModelDisplay(visualModelInfo);
                            if (window.showNotification) {
                                window.showNotification(`已自动切换到视觉模型 ${visualModelInfo.displayName}`, 'info');
                            }
                        }
                    }
                } else {
                    // 场景2: 纯文本输入 - 切换回对话模型
                    const currentAppType = modelInfo ? (modelInfo.appType || modelInfo.type) : '';
                    if (modelInfo && currentAppType !== 'chat' && currentAppType !== 'thinking') {
                        currentModel = this.defaultChatModel;
                        console.log(`🔄 检测到纯文本输入，自动从 ${modelInfo.displayName} 切换到对话模型`);
                        
                        // 更新UI显示
                        const chatModelInfo = window.modelConfigManager.getModelByName(currentModel);
                        if (chatModelInfo) {
                            this.updateModelDisplay(chatModelInfo);
                            if (window.showNotification) {
                                window.showNotification(`已自动切换到对话模型 ${chatModelInfo.displayName}`, 'info');
                            }
                        }
                    }
                }
            }
            
            console.log('🚀 准备调用AI API - 使用模型:', currentModel);
            let aiResponse = await this.generateAIResponse(userMessage, currentModel, images, apiOptions);

            // 检查是否被中断
            if (this.isInterrupted) {
                this.hideTypingIndicator();
                return;
            }

            if (this._mergedDirectWorkspaceReply && this._lastDirectWorkspaceTraceId != null) {
                const tid = this._lastDirectWorkspaceTraceId;
                this._mergedDirectWorkspaceReply = false;
                this._lastDirectWorkspaceTraceId = null;
                const mergedMsg = this.messages.find((m) => m.id === tid);
                let content = String(mergedMsg?.content || aiResponse || '');
                if (mergedMsg) {
                    mergedMsg.content = content;
                }
                console.log('🤖 机器人回复原文:', content);
                this.hideTypingIndicator();
                await this.renderMessages();
                this.scrollToBottom();
                return;
            }

            // 在控制台打印机器人回复原文，方便对比效果
            console.log('🤖 机器人回复原文:', aiResponse);

            this.hideTypingIndicator();

            const aiMessage = {
                id: Date.now(),
                type: 'assistant',
                content: aiResponse,
                timestamp: new Date()
            };

            this.messages.push(aiMessage);
            await this.renderMessages();
            this.scrollToBottom();
        } catch (error) {
            // 如果是被中断的，不显示错误消息
            if (error.name === 'AbortError' || this.isInterrupted) {
                console.log('🛑 AI回复被用户中断');
                return;
            }

            console.error('❌ AI回复失败:', error);
            this.hideTypingIndicator();

            const errorMessage = {
                id: Date.now(),
                type: 'assistant',
                content: '🤖 抱歉，AI服务暂时不可用，请稍后重试。',
                timestamp: new Date()
            };

            this.messages.push(errorMessage);
            await this.renderMessages();
            this.scrollToBottom();
        } finally {
            console.log(
                '[chat-api] 本轮直连回复 阶段用时峰值(与 UI「用时 n S」一致):',
                `${this._skillsFlowMaxElapsedSec ?? 0}s`
            );
            this._skillsFlowMaxElapsedSec = 0;
            this.isTyping = false;
            this.currentAbortController = null;
            this.updateSendButton();
            this._publishSkillsProgressEvent({ type: 'direct_llm_end' });
        }
    }

    /**
     * 生成AI回复
     * @param {string} userMessage - 用户消息
     * @param {string} model - 使用的模型
     * @param {Object} image - 上传的图片信息
     * @returns {string} AI回复内容
     */
    /**
     * 调用AI API生成回复
     * @param {string} userMessage - 用户消息
     * @param {string} model - 使用的模型
     * @param {Array} images - 上传的图片信息数组
     * @param {{ siliconFlowEnableThinking?: boolean, stream?: boolean, directReplyStyle?: 'brief'|'shortDefault' }} [apiOptions] - 传入主进程；`stream:false` 关闭 SSE（内部摘要等）
     * @returns {Promise<string>} AI回复内容
     */
    async generateAIResponse(userMessage, model, images, apiOptions = {}) {
        try {
            // 构建消息历史（可能被 `FastHardwareContextCompact.compactApiMessagesIfNeeded` 整体替换，需用 let）
            let messages = [];

            /** @type {string} */
            let systemBase =
                '你是一个专业的硬件开发助手，擅长Arduino、ESP32等嵌入式开发，熟悉各种传感器、执行器和通信模块。你可以帮助用户进行电路设计、元件选型和代码编写。请用markdown格式回复，提供清晰的结构化信息。';
            if (apiOptions.directReplyStyle === 'brief') {
                systemBase +=
                    '\n\n【本轮模式】用户希望先得到简要说明，不要求你代表本产品拉取元件库或执行工具链。用较短篇幅 Markdown 回答要点。';
            } else if (apiOptions.directReplyStyle === 'shortDefault') {
                systemBase +=
                    '\n\n【本轮模式】请优先**简短**作答（几段话或短列表即可）。不要假设已联网检索或查询过本产品的元件库；未经验证的型号、链接勿写死。**本轮为直连对话**：你不会在本回合内直接执行 **scheme / wiring / 固件** 等产品内 skills，也**不会**代为在画布上自动补线；但**不要**对用户声称「因直连模式应用永远不能联网检索」——实时类问题（天气等）可能由应用**另一路由**已调用或即将调用 **web_search_exa**，若当前系统消息未附带检索结果，可建议用户稍后重试、检查密钥/网络，或用浏览器/气象 API 自查。若系统消息附有**画布结构化快照**，视为已读取当前画布，请据实作答：components/connections 为空即暂无元件/连线，**禁止**声称无法查看画布或强求用户粘贴整份 JSON。**勿**在文末要求用户发送固定口令以触发「技能编排」；需要全自动画布改线时由应用侧路由接入 Agent，不依赖用户背固定话术。若系统消息要求使用「工作区工具」读盘，请先按协议输出 JSON 调用工具再作答。';
            }

            const projectMeta = this._getOpenProjectMeta();
            /** 是否与 Cursor 类似走多轮 list/read/grep（首轮不预读全文） */
            let useWorkspaceTools = false;
            /** @type {string} */
            let systemExtra = '';
            if (
                projectMeta &&
                (!images || images.length === 0) &&
                apiOptions.directReplyStyle !== 'brief' &&
                directChatWantsProjectWorkspaceDeep(userMessage) &&
                typeof window.electronAPI?.executeProjectWorkspaceTool === 'function'
            ) {
                useWorkspaceTools = true;
                systemExtra = this._buildProjectWorkspaceToolingPrompt(projectMeta);
            } else if (projectMeta) {
                systemExtra = this._buildLightweightOpenProjectScaffold(projectMeta);
            }

            let systemContent = systemExtra ? `${systemBase}\n\n${systemExtra}` : systemBase;

            const userMsgRaw = String(userMessage || '');
            const wantsCanvasInDirectChat =
                /画布|画板|电路\s*图|canvas|schematic/i.test(userMsgRaw) &&
                /有啥|有什么|哪些|内容|情况|东西|描述|列出|介绍一下|看一下|看下|看看|瞧瞧|说说|讲讲|怎么样|空了|为空|有没有|吗|么|啥|啥内容|what|which|on the canvas|what'?s on/i.test(
                    userMsgRaw
                );
            let canvasSnapshotDirectBlock = '';
            if (
                (!images || images.length === 0) &&
                apiOptions.directReplyStyle !== 'brief' &&
                !useWorkspaceTools &&
                wantsCanvasInDirectChat &&
                this.skillsEngine &&
                typeof this.skillsEngine.getCanvasSnapshotForSkill === 'function'
            ) {
                canvasSnapshotDirectBlock = this._buildCanvasSnapshotJsonForDirectChat();
            }
            if (canvasSnapshotDirectBlock) {
                const unsavedNote = !projectMeta
                    ? '【说明】当前标签可能尚未保存到磁盘，暂无项目根路径，故本轮不调用工作区读文件工具；以下快照由应用直接读取画布。\n\n'
                    : '';
                systemContent += `\n\n${unsavedNote}【当前画布结构化快照（已由应用读取）】\n${canvasSnapshotDirectBlock}`;
            }

            // 添加系统提示
            messages.push({
                role: 'system',
                content: systemContent
            });

            // 添加历史消息 - 使用固定对话轮数策略
            // 策略：保留最近N轮完整对话，对于包含图片的历史消息只保留文本（AI回复已包含图片描述）
            const conversationRounds = images && images.length > 0 ? 2 : 4; // 有图片时保留2轮，无图片时保留4轮
            const recentMessages = this.messages.slice(-(conversationRounds * 2 + 1), -1); // 排除当前消息
            
            console.log(`📜 准备添加历史消息: ${recentMessages.length} 条 (约${Math.floor(recentMessages.length / 2)}轮对话)`);
            
            for (const msg of recentMessages) {
                if (msg.type === 'user') {
                    // 处理用户消息
                    if (msg.images && msg.images.length > 0) {
                        // 历史消息包含图片：只添加文本部分，不重复发送图片
                        // 因为AI的回复已经包含了对图片的描述
                        if (msg.content && msg.content.trim()) {
                            messages.push({
                                role: 'user',
                                content: msg.content
                            });
                            console.log(`👤 历史用户消息 [ID:${msg.id}] (原含${msg.images.length}张图片，仅保留文本)`);
                        } else {
                            // 如果用户消息只有图片没有文字，添加一个占位文本
                        messages.push({
                            role: 'user',
                                content: '[用户发送了图片]'
                        });
                            console.log(`👤 历史用户消息 [ID:${msg.id}] (仅图片消息，使用占位文本)`);
                        }
                    } else {
                        // 纯文本历史消息：正常添加
                        messages.push({
                            role: 'user',
                            content: msg.content
                        });
                        console.log(`👤 历史用户消息 [ID:${msg.id}] (纯文本)`);
                    }
                } else if (msg.type === 'assistant') {
                    // 处理AI回复 - 限制长度，避免上下文过长
                    const maxLength = images && images.length > 0 ? 1500 : 3000;
                    const assistantContent = msg.content.length > maxLength 
                        ? msg.content.substring(0, maxLength) + '\n...[内容过长已截断]'
                        : msg.content;
                    
                    messages.push({
                        role: 'assistant',
                        content: assistantContent
                    });
                    
                    if (msg.content.length > maxLength) {
                        console.log(`✂️ 历史AI回复 [ID:${msg.id}] 过长(${msg.content.length}字符)，已截断至${maxLength}字符`);
                    } else {
                        console.log(`🤖 历史AI回复 [ID:${msg.id}] 长度: ${msg.content.length} 字符`);
                    }
                }
            }

            // 如果有图片，构建包含多图片的消息
            if (images && images.length > 0) {
                // 对于支持视觉的模型，使用正确的多模态消息格式
                const contentArray = [];

                // 添加文本内容
                if (userMessage && userMessage.trim()) {
                    contentArray.push({
                        type: 'text',
                        text: userMessage
                    });
                }

                // 添加所有图片内容
                for (const image of images) {
                    if (image && image.dataUrl) {
                        contentArray.push({
                            type: 'image_url',
                            image_url: {
                                url: image.dataUrl // base64格式的图片URL
                            }
                        });
                    }
                }

                messages.push({
                    role: 'user',
                    content: contentArray
                });

                console.log(`📸 当前消息包含 ${images.length} 张图片:`, images.map(img => `${img.name} (${(img.dataUrl.length * 3 / 4 / 1024 / 1024).toFixed(2)}MB)`).join(', '));
            } else {
                // 添加当前用户消息
                messages.push({
                    role: 'user',
                    content: userMessage
                });
            }

            // 统计所有图片（用于调试重复问题）
            let totalImageCount = 0;
            const allImageSizes = [];
            let totalTextLength = 0;
            for (const msg of messages) {
                if (msg.role === 'user' && Array.isArray(msg.content)) {
                    for (const item of msg.content) {
                        if (item.type === 'image_url' && item.image_url?.url) {
                            totalImageCount++;
                            const sizeInMB = (item.image_url.url.length * 3 / 4 / 1024 / 1024).toFixed(2);
                            allImageSizes.push(sizeInMB);
                        } else if (item.type === 'text') {
                            totalTextLength += item.text.length;
                        }
                    }
                } else if (typeof msg.content === 'string') {
                    totalTextLength += msg.content.length;
                }
            }
            console.log(`🖼️ 本次请求实际包含图片总数: ${totalImageCount}，大小分布:`, allImageSizes.map((s, i) => `图${i+1}:${s}MB`).join(', '));
            console.log(`📝 本次请求文本总长度: ${totalTextLength} 字符，消息结构:`, messages.map(m => `${m.role}(${typeof m.content === 'string' ? m.content.length + '字' : m.content.length + '项'})`).join(' → '));

            /** 体积接近上下文上限时自动压缩早期历史（见 `scripts/context-compact.js`） */
            if (typeof window.FastHardwareContextCompact?.compactApiMessagesIfNeeded === 'function') {
                const beforeChars = totalTextLength;
                const beforeMsgCount = messages.length;
                messages = await window.FastHardwareContextCompact.compactApiMessagesIfNeeded(messages, {
                    model,
                    chatWithAI: (m, md) =>
                        window.electronAPI.chatWithAI(m, md, { ...apiOptions, stream: false })
                });
                totalTextLength = window.FastHardwareContextCompact.estimateApiMessagesTextChars(messages);
                if (beforeChars !== totalTextLength || beforeMsgCount !== messages.length) {
                    console.log(
                        `[context-compact] 压缩后估算文本 ${totalTextLength} 字符、${messages.length} 条消息（压缩前 ${beforeChars} 字符、${beforeMsgCount} 条）`
                    );
                }
            }

            if (useWorkspaceTools && projectMeta) {
                this._mergedDirectWorkspaceReply = false;
                this._lastDirectWorkspaceTraceId = null;
                const directWsTraceId = Date.now();
                this._agentTraceMessageId = directWsTraceId;
                this._agentTraceHeaderMessageId = directWsTraceId;
                this.messages.push({
                    id: directWsTraceId,
                    type: 'assistant',
                    content: '',
                    timestamp: new Date(),
                    isAgentTrace: true,
                    isSkillFlow: false,
                    agentBlocks: [],
                    isDirectWorkspaceTrace: true
                });
                await this.renderMessages();
                this.scrollToBottom();
                this._setAgentTraceHeaderLine(directWsTraceId, this._buildSkillsFlowTypingLine());
                this._removeTypingIndicatorDomOnly();

                const toolOut = await this._runDirectChatProjectWorkspaceLoop(
                    messages,
                    model,
                    apiOptions,
                    projectMeta,
                    directWsTraceId
                );
                if (toolOut != null && String(toolOut).length > 0) {
                    const textOut = String(toolOut);
                    const merged = this.messages.find((m) => m.id === directWsTraceId);
                    if (merged) {
                        merged.isAgentTrace = false;
                        merged.isDirectWorkspaceTrace = false;
                        merged.content = textOut;
                    }
                    this._agentTraceMessageId = null;
                    this._agentTraceHeaderMessageId = null;
                    this._mergedDirectWorkspaceReply = true;
                    this._lastDirectWorkspaceTraceId = directWsTraceId;
                    await this.renderMessages();
                    this.scrollToBottom();
                    return textOut;
                }

                const rmIdx = this.messages.findIndex((m) => m.id === directWsTraceId);
                if (rmIdx >= 0) {
                    this.messages.splice(rmIdx, 1);
                }
                this._agentTraceMessageId = null;
                this._agentTraceHeaderMessageId = null;
                await this.renderMessages();
            }

            // 记录请求详情（用于调试）
            console.log('📤 发送API请求:', {
                model: model,
                messageCount: messages.length,
                hasImages: images && images.length > 0,
                imageCount: images ? images.length : 0,
                imageDetails: images ? images.map((img, idx) => {
                    if (!img || !img.dataUrl) return null;
                    const sizeInBytes = (img.dataUrl.length * 3) / 4;
                    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
                    return {
                        index: idx,
                        name: img.name || '未命名',
                        format: img.dataUrl.split(';')[0].split(':')[1] || '未知',
                        sizeInMB: sizeInMB,
                        urlLength: img.dataUrl.length
                    };
                }).filter(Boolean) : [],
                timestamp: new Date().toISOString()
            });

            const callOpts = { stream: true, ...apiOptions };
            console.log('[chat-api] chatWithAI stream:', callOpts.stream !== false);
            console.log(
                '[chat-api] chatWithAI 入参 siliconFlowEnableThinking:',
                typeof callOpts.siliconFlowEnableThinking === 'boolean'
                    ? callOpts.siliconFlowEnableThinking
                    : '未设置（由主进程 resolveSiliconFlowEnableThinking 与模型白名单决定实际是否写入）'
            );

            let unsubscribeStream = null;
            if (
                callOpts.stream !== false &&
                typeof window.electronAPI?.onSiliconflowChatStream === 'function'
            ) {
                unsubscribeStream = window.electronAPI.onSiliconflowChatStream((payload) => {
                    const delta = typeof payload?.delta === 'string' ? payload.delta : '';
                    if (!delta) return;
                    this._scheduleTypingStreamPreviewAppend(delta);
                });
            }

            let result;
            try {
                result = await window.electronAPI.chatWithAI(messages, model, callOpts);
            } finally {
                if (typeof unsubscribeStream === 'function') {
                    unsubscribeStream();
                }
                this._cancelTypingStreamPreviewRaf();
            }

            if (result.success) {
                console.log('✅ AI回复成功获取，长度:', result.content.length);
                return result.content;
            } else {
                // 详细的错误日志
                console.error('❌ AI API调用失败 - 详细信息:', {
                    error: result.error,
                    errorType: result.errorType || '未知',
                    statusCode: result.statusCode || '未知',
                    model: model,
                    timestamp: new Date().toISOString(),
                    requestDetails: {
                        messageCount: messages.length,
                        hasImages: images && images.length > 0,
                        imageCount: images ? images.length : 0
                    }
                });
                
                // 如果是500错误且有调试信息，详细打印
                if (result.statusCode === 500 && result.debugInfo) {
                    console.error('🚨 ===== 500 服务器内部错误详细分析 =====');
                    console.error('📸 请求包含图片:', result.debugInfo.hasImages);
                    
                    if (result.debugInfo.imageCount > 0) {
                        console.error('📊 图片详情:');
                        result.debugInfo.imageDetails.forEach(img => {
                            console.error(`  - 图片 ${img.index}: ${img.sizeInMB} MB (${img.sizeInBytes} bytes)`);
                        });
                        console.error(`📊 图片总数: ${result.debugInfo.imageCount}`);
                        console.error(`📊 图片总大小: ${result.debugInfo.totalImageSizeInMB} MB (${result.debugInfo.totalImageSizeInBytes} bytes)`);
                    }
                    
                    console.error(`📊 请求体总大小: ${result.debugInfo.requestBodySizeInMB} MB (${result.debugInfo.requestBodySizeInBytes} bytes)`);
                    console.error(`📊 消息数量: ${result.debugInfo.messageCount}`);
                    console.error(`📊 模型: ${result.debugInfo.model}`);
                    console.error(`📊 max_tokens: ${result.debugInfo.maxTokens}`);
                    console.error(`📊 响应头:`, result.debugInfo.responseHeaders);
                    console.error(`📊 响应体 (前1000字符):`, result.debugInfo.responseBody);
                    console.error('🚨 ==========================================');
                    
                    // 智能分析可能的原因
                    const issues = [];
                    if (result.debugInfo.imageCount > 0) {
                        result.debugInfo.imageDetails.forEach(img => {
                            if (parseFloat(img.sizeInMB) > 5) {
                                issues.push(`图片 ${img.index} 过大 (${img.sizeInMB} MB > 5 MB)`);
                            }
                        });
                        if (parseFloat(result.debugInfo.totalImageSizeInMB) > 15) {
                            issues.push(`图片总大小过大 (${result.debugInfo.totalImageSizeInMB} MB > 15 MB)`);
                        }
                    }
                    if (parseFloat(result.debugInfo.requestBodySizeInMB) > 20) {
                        issues.push(`请求体过大 (${result.debugInfo.requestBodySizeInMB} MB > 20 MB)`);
                    }
                    
                    if (issues.length > 0) {
                        console.error('⚠️ 检测到以下可能的问题:');
                        issues.forEach(issue => console.error(`  - ${issue}`));
                    }
                }
                
                // 根据错误类型提供更具体的错误信息
                let errorMsg = `🤖 抱歉，AI服务暂时不可用。\n\n`;
                
                if (result.statusCode === 500) {
                    errorMsg += `⚠️ 服务器内部错误 (500)\n\n`;
                    const hasImagesInRequest =
                        Boolean(images && images.length > 0) ||
                        Boolean(result.debugInfo && result.debugInfo.hasImages);
                    if (hasImagesInRequest) {
                        errorMsg += `可能的原因：\n`;
                        errorMsg += `- 图片过大（单张建议 < 5MB）\n`;
                        errorMsg += `- 多图总量过大\n`;
                        errorMsg += `- 请求参数超出限制\n`;
                        errorMsg += `- 服务器暂时过载\n\n`;
                    } else {
                        errorMsg += `本次请求未包含图片，此类错误通常与图片无关。\n可能原因：\n`;
                        errorMsg += `- 上游模型或线路暂时异常，请稍后重试\n`;
                        errorMsg += `- 当前模型暂时不可用，可在顶栏尝试更换其它模型\n`;
                        errorMsg += `- 上下文过长、参数不兼容或服务端限流\n\n`;
                    }
                } else if (result.statusCode === 429) {
                    errorMsg += `⚠️ 请求过于频繁 (429)\n\n`;
                } else if (result.statusCode === 401 || result.statusCode === 403) {
                    errorMsg += `⚠️ 认证失败 (${result.statusCode})\n请检查API密钥配置\n\n`;
                }
                
                errorMsg += `详细错误: ${result.error}\n\n`;
                errorMsg += `请检查控制台查看完整日志`;
                
                return errorMsg;
            }

        } catch (error) {
            console.error('❌ 生成AI回复失败 - 异常捕获:', {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
                timestamp: new Date().toISOString()
            });
            return '🤖 抱歉，发生了网络错误，请稍后重试。\n\n请检查控制台查看详细错误信息。';
        }
    }

    /**
     * 调用LLM API（供 skills 引擎使用）
     * @param {Object} params - API参数 {messages, model, temperature}
     * @returns {Promise<Object>} LLM响应 {content: string}
     */
    async callLLMAPI(params) {
        const { messages, model, temperature = 0.7 } = params;
        
        try {
            const result = await window.electronAPI.chatWithAI(messages, model, { stream: false });
            
            if (result.success) {
                return { content: result.content };
            } else {
                throw new Error(result.error || 'LLM API调用失败');
            }
        } catch (error) {
            console.error('❌ LLM API调用失败:', error);
            throw error;
        }
    }

    /**
     * 尝试宽松解析 JSON
     * @param {string} text - 原始文本
     * @returns {any}
     */
    parseJsonLoose(text) {
        const s = String(text || '').trim();
        if (!s) return null;
        const fence = s.match(/```json\s*([\s\S]*?)\s*```/i) || s.match(/```([\s\S]*?)```/);
        if (fence?.[1]) {
            try { return JSON.parse(fence[1].trim()); } catch { }
        }
        try { return JSON.parse(s); } catch { }
        const first = s.indexOf('{');
        const last = s.lastIndexOf('}');
        if (first >= 0 && last > first) {
            try { return JSON.parse(s.slice(first, last + 1)); } catch { }
        }
        // 兼容：模型输出 "web_search_exa\n{...}"
        const toolCallLike = s.match(/^([a-zA-Z0-9_\-]+)\s*\n([\s\S]+)$/);
        if (toolCallLike?.[1] && toolCallLike?.[2]) {
            const argsObj = this.parseJsonLoose(toolCallLike[2]);
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
     * 获取给 LLM 的 skills 定义（运行时）
     * @returns {Array<{name:string, description:string}>}
     */
    getSkillsForAgent() {
        return [
            {
                name: 'scheme_design_skill',
                description:
                    '**可选用**：方案骨架 + BOM 库匹配；不熟/要对齐元件库时用，熟手或简单改动可跳过。**不**自动创建元件。缺型号再 completion_suggestion / web_search。仅文字不匹配库时 runBomAnalysis:false。'
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
                    '**web_search_exa 的常见后续**：将 results 拼入 **text** 或传 **urls**（公开页）做中文结构化摘要（summary + bullets）。也用于长文/日志。可选 **length**、**focus**。'
            },
            {
                name: 'wiring_edit_skill',
                description:
                    '补线/改线：必填 wiringRules；以用户描述+画布为主，**不必**先跑方案。前序有 scheme 时可能附带 BOM 参考（可忽略）。expectedComponentsFromAgent 可选；applyToCanvas 默认 true'
            },
            {
                name: 'firmware_codegen_skill',
                description:
                    '用户明确要改固件时：userRequirement + 可选 codeText；读画布后输出可审阅 patch。**已有 .ino 时视为更新当前固件**；canvasGuidance；默认不写盘。'
            }
        ];
    }

    /**
     * 规范化 tool_calls
     * @param {any} raw - 原始 tool_calls
     * @returns {Array<{toolCallId:string, skillName:string, args:any}>}
     */
    normalizeToolCalls(raw) {
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
     * 判断用户问题是否属于“实时信息”场景
     * @param {string} userMessage - 用户输入
     * @returns {boolean}
     */
    isRealtimeQuery(userMessage) {
        const text = String(userMessage || '').toLowerCase();
        if (!text) return false;
        const keywords = [
            '新闻', '最新', '今日', '今天', '实时', '刚刚', '近期', '最近',
            '天气', '气象', '气温', '下雨', '降雨', '空气质量', '雾霾', '台风', '降雪',
            'hot', 'headline', 'breaking', 'news', 'current', 'weather', 'forecast'
        ];
        return keywords.some((kw) => text.includes(kw));
    }

    /**
     * 是否应优先/强制 web_search（与主进程 {@link ../agent/skills-agent-shared.needsWebSearchPriority} 语义保持一致：实时性 + 选型/复杂方案检索需求）。
     * @param {string} userMessage - 用户输入
     * @returns {boolean}
     */
    needsWebSearchPriority(userMessage) {
        if (this.isRealtimeQuery(userMessage)) return true;
        const t = String(userMessage || '');
        if (!t.trim()) return false;
        const marketLike = /股价|股票|汇率|基金|比分|赛程|开奖/i.test(t);
        const explicitLookup =
            /查一下|查一查|查下|查查|搜一下|搜一搜|搜下|搜索|帮我查|帮我搜|网上查|联网查|上网查|检索一下|查查看/.test(t);
        const explicitWeb = /联网|上网搜|网上搜|先搜|先查/.test(t);
        const moduleOrPartSelection =
            /具体型号|物料编码|订货型号|采购型号|买哪(?:种|款|个)|哪一款|哪款芯片|哪款模块|哪种料|替代料|兼容替代|pin\s*兼容|数据手册|datasheet/i.test(
                t
            ) ||
            /(?:电机|芯片|传感器|模块|电调|MOS|LDO|DCDC|电池包|连接器|MCU)\s*选型|选型表|外购件|缺(?:件)?.*型号/i.test(t);
        const similarSolutionIntent =
            /参考(?:一下)?.*方案|类似(?:的)?.*案例|开源(?:硬件|项目)|有没有.*成品|成熟方案|行业(?:里|内).*(?:做法|方案)|对标.*产品/i.test(
                t
            );
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
     * 纯文本发贴后的路由：寒暄 → 用户口头简要 → 联网/完整编排 → skills agent；否则默认短答直连 LLM。
     * @param {string} messageContent
     * @param {{ id: number, type: 'user', content: string, images?: unknown[], model?: string, timestamp: Date }} userMessage
     * @returns {Promise<void>}
     */
    async _dispatchAfterTextUserMessage(messageContent, userMessage) {
        if (isSimpleChitchatMessage(messageContent)) {
            this._logSkillsChain('用户发送 → 直连对话（寒暄路由）', {
                contentPreview: String(messageContent || '').slice(0, 200),
                contentChars: String(messageContent || '').length,
                model: this.selectedModel
            });
            await this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images, {
                siliconFlowEnableThinking: false,
                progressMode: 'chitchat'
            });
            return;
        }
        if (preferBriefAnswerFirst(messageContent)) {
            this._logSkillsChain('用户发送 → 直连对话（用户要求先简要）', {
                contentPreview: String(messageContent || '').slice(0, 200),
                model: this.selectedModel
            });
            await this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images, {
                siliconFlowEnableThinking: false,
                progressMode: 'brief',
                directReplyStyle: 'brief'
            });
            return;
        }

        const webPri = this.needsWebSearchPriority(messageContent);
        const fullAgent = explicitFullAgentIntent(messageContent);
        const skillOrch = userMessageSuggestsSkillOrchestration(messageContent);
        if (webPri || fullAgent || skillOrch) {
            this._logSkillsChain('用户发送 → runSkillsAgentLoop', {
                contentPreview: String(messageContent || '').slice(0, 200),
                contentChars: String(messageContent || '').length,
                needsWebSearchPriority: webPri,
                explicitFullAgentIntent: fullAgent,
                skillOrchestrationHint: skillOrch,
                model: this.selectedModel
            });
            await this.runSkillsAgentLoop(messageContent, userMessage);
            return;
        }

        this._logSkillsChain('用户发送 → 直连对话（默认短答）', {
            contentPreview: String(messageContent || '').slice(0, 200),
            model: this.selectedModel
        });
        await this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images, {
            siliconFlowEnableThinking: false,
            progressMode: 'direct',
            directReplyStyle: 'shortDefault'
        });
    }

    /**
     * 生成当前时间上下文（参考 OpenClaw 校时思路）
     * @returns {string}
     */
    getAgentTimeContext() {
        const now = new Date();
        const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'zh-CN';
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
        const iso = now.toISOString();
        const local = now.toLocaleString(locale, { hour12: false });
        return `当前本地时间=${local}；ISO时间=${iso}；时区=${timezone}；locale=${locale}`;
    }

    /**
     * 从 URL 提取站点显示名（去 www）
     * @param {string} urlStr - 完整 URL
     * @returns {string}
     */
    getSiteLabelFromUrl(urlStr) {
        try {
            const u = new URL(String(urlStr || '').trim());
            return u.hostname.replace(/^www\./i, '') || '来源';
        } catch {
            return '来源';
        }
    }

    /**
     * 规范化 web_search_exa 返回，便于模型引用信源
     * @param {{success?:boolean, results?:Array<any>, raw?:string, error?:string}} result - 原始结果
     * @returns {{success:boolean, results:Array<{title:string,url:string,snippet:string,siteLabel:string}>, raw?:string, error?:string}}
     */
    normalizeWebSearchToolResult(result) {
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
                const siteLabel = item?.siteLabel || this.getSiteLabelFromUrl(url);
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
     * 从历史工具结果中收集所有 web 信源（按 url 去重）
     * @param {Array<{skillName:string, result?:any}>} toolResults - 工具结果列表
     * @returns {Array<{title:string, url:string, siteLabel:string}>}
     */
    collectWebSearchSources(toolResults) {
        /** @type {Map<string, {title:string, url:string, siteLabel:string}>} */
        const byUrl = new Map();
        for (const tr of toolResults || []) {
            if (!tr || tr.skillName !== 'web_search_exa' || !tr.result?.success) continue;
            const arr = tr.result.results;
            if (!Array.isArray(arr)) continue;
            for (const r of arr) {
                const url = String(r?.url || '').trim();
                if (!url || byUrl.has(url)) continue;
                const siteLabel = String(r?.siteLabel || this.getSiteLabelFromUrl(url));
                const title = String(r?.title || '').trim() || siteLabel;
                byUrl.set(url, { title, url, siteLabel });
            }
        }
        return [...byUrl.values()];
    }

    /**
     * 若正文未包含检索到的 URL，则追加「参考资料」Markdown 块（可点击）
     * @param {string} finalMessage - 模型给出的 final_message
     * @param {Array<{skillName:string, result?:any}>} toolResults - 工具历史
     * @returns {string}
     */
    appendWebSearchReferencesMarkdown(finalMessage, toolResults) {
        const text = String(finalMessage || '').trim();
        const sources = this.collectWebSearchSources(toolResults);
        if (!sources.length) return text;
        const missing = sources.filter((s) => !text.includes(s.url));
        if (!missing.length) return text;
        const lines = missing.map((s) => {
            const label = s.siteLabel || s.title;
            return `- [${label}](${s.url})`;
        });
        return `${text}\n\n### 参考资料\n${lines.join('\n')}\n`;
    }

    /**
     * 构建 `skills/skills/<skillId>/index.js` 的 `execute(args, ctx)` 所需上下文（与 Node 真测一致）
     * @param {string} userMessage - 当前用户消息文本
     * @returns {{ skillsEngine: any, userRequirement: string }}
     */
    buildSkillExecutionContext(userMessage) {
        return {
            skillsEngine: this.skillsEngine,
            userRequirement: String(userMessage || '').trim()
        };
    }

    /**
     * 执行单个 skill：由主进程 `require` 并调用 `skills/skills/<skillId>/index.js` 的 `execute`；`CircuitSkillsEngine` 经 IPC 在渲染进程执行。
     * @param {string} skillName - 技能名
     * @param {any} args - 入参
     * @param {string} userMessage - 原始用户消息
     * @returns {Promise<any>}
     */
    async executeSkill(skillName, args, userMessage) {
        if (!this.skillsEngine) {
            return { success: false, error: 'skillsEngine 未初始化' };
        }
        if (!window.electronAPI?.executeSkill) {
            return { success: false, error: 'executeSkill IPC 不可用（请使用 Electron 启动应用）' };
        }
        const ctxPayload = {
            userRequirement: String(userMessage || '').trim(),
            canvasSnapshot:
                typeof this.skillsEngine.getCanvasSnapshotForSkill === 'function'
                    ? this.skillsEngine.getCanvasSnapshotForSkill()
                    : null
        };
        try {
            const out = await window.electronAPI.executeSkill({ skillName, args, ctxPayload });
            if (skillName === 'web_search_exa') {
                if (out && out.success && out.data) {
                    return this.normalizeWebSearchToolResult(out.data);
                }
                if (out?.data) {
                    return this.normalizeWebSearchToolResult(out.data);
                }
                return {
                    success: false,
                    results: [],
                    error: String(out?.error || '检索失败')
                };
            }
            return out;
        } catch (e) {
            return {
                success: false,
                error: e?.message || String(e)
            };
        }
    }

    /**
     * 直连 LLM（寒暄 / 多模态）时展示与 agent-loop 一致的阶段行 + 计时
     * @param {string} phaseLabel - 阶段标题（如「直连对话 · 生成回复」）
     * @returns {Promise<void>}
     */
    async _beginDirectLlmProgressUi(phaseLabel) {
        const p = String(phaseLabel || '对话模式 · 生成回复').trim();
        this._skillsFlowElapsedT0 = Date.now();
        this._skillsFlowMaxElapsedSec = 0;
        this._skillsFlowPhaseLabel = p;
        if (window.fastHardwareSkillsProgress && typeof window.fastHardwareSkillsProgress.emit === 'function') {
            window.fastHardwareSkillsProgress.emit({
                type: 'phase',
                phase: p,
                source: 'chat_manager'
            });
        }
        await this.showTypingIndicator(this._buildSkillsFlowTypingLine());
        this.startSkillsFlowElapsedTimer();
        this._publishSkillsProgressEvent({
            type: 'direct_llm_start',
            phase: this._skillsFlowPhaseLabel,
            line: this._buildSkillsFlowTypingLine()
        });
    }

    /**
     * 组合 skills 等待行：阶段说明 + 递增秒数（无 1/N 步进，仅保留逻辑链文案）
     * @returns {string}
     */
    _buildSkillsFlowTypingLine() {
        const phase = this._skillsFlowPhaseLabel || '请稍候';
        const t0 = this._skillsFlowElapsedT0 != null ? this._skillsFlowElapsedT0 : Date.now();
        const sec = Math.floor((Date.now() - t0) / 1000);
        if (sec > this._skillsFlowMaxElapsedSec) {
            this._skillsFlowMaxElapsedSec = sec;
        }
        return `${phase} · 用时 ${sec} S`;
    }

    /**
     * 在隐藏 typing 前把当前墙钟秒数并入峰值（避免最后一次 tick 与真实结束之间存在整秒差）
     * @returns {void}
     */
    _flushSkillsFlowElapsedPeakForUi() {
        if (this._skillsFlowElapsedT0 == null) return;
        const sec = Math.floor((Date.now() - this._skillsFlowElapsedT0) / 1000);
        if (sec > this._skillsFlowMaxElapsedSec) {
            this._skillsFlowMaxElapsedSec = sec;
        }
    }

    /**
     * 订阅 `skills-progress-bus`：阶段文案由总线 detail 传入，在此刷新 typing（符合「订阅驱动」约定）
     * @returns {void}
     */
    _bindSkillsProgressBus() {
        if (typeof window === 'undefined' || !window.fastHardwareSkillsProgress?.EVENT_NAME) {
            return;
        }
        const name = window.fastHardwareSkillsProgress.EVENT_NAME;
        window.addEventListener(name, (ev) => {
            this._consumeSkillsProgressFromBus(ev?.detail);
        });
    }

    /**
     * 消费总线事件，更新 `_skillsFlowPhaseLabel` 与 typing 行
     * @param {Record<string, unknown>} [detail] - 来自 `fastHardwareSkillsProgress.emit`
     * @returns {void}
     */
    _consumeSkillsProgressFromBus(detail) {
        if (!detail || typeof detail !== 'object') return;
        if (typeof detail.phase === 'string' && detail.phase.trim()) {
            this._skillsFlowPhaseLabel = detail.phase.trim();
        }
        const line =
            typeof detail.line === 'string' && detail.line.length > 0
                ? detail.line
                : this._buildSkillsFlowTypingLine();
        if (this._agentTraceHeaderMessageId != null) {
            this._setAgentTraceHeaderLine(this._agentTraceHeaderMessageId, line);
            return;
        }
        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) {
            this.setTypingIndicatorText(line);
        }
        // 禁止在此处调用 showTypingIndicator：emit 与 runSkillsAgentLoop 的 await showTypingIndicator 并发时，
        // 会在 getAssetsPath 挂起期间各建一条 typing，出现双气泡且 duplicate id 导致第二条永不随计时刷新。
    }

    /**
     * 广播 skills 进度：经 `fastHardwareSkillsProgress.emit` 统一派发（CustomEvent + IPC）
     * @param {Record<string, unknown>} detail
     * @returns {void}
     */
    _publishSkillsProgressEvent(detail) {
        const d = { ...(detail && typeof detail === 'object' ? detail : {}) };
        const t0 = this._skillsFlowElapsedT0 != null ? this._skillsFlowElapsedT0 : Date.now();
        if (typeof d.line !== 'string' || !d.line.length) {
            d.line = this._buildSkillsFlowTypingLine();
        }
        if (d.phase == null) d.phase = this._skillsFlowPhaseLabel;
        d.elapsedSec = Math.floor((Date.now() - t0) / 1000);
        d.at = Date.now();
        if (window.fastHardwareSkillsProgress && typeof window.fastHardwareSkillsProgress.emit === 'function') {
            window.fastHardwareSkillsProgress.emit(d);
            return;
        }
        try {
            if (window.electronAPI && typeof window.electronAPI.publishAgentSkillProgress === 'function') {
                window.electronAPI.publishAgentSkillProgress(d);
            }
        } catch (e) {
            console.warn('⚠️ publishAgentSkillProgress 失败:', e?.message || e);
        }
        try {
            window.dispatchEvent(
                new CustomEvent('fast-hardware-skills-progress', { detail: d })
            );
        } catch (e) {
            console.warn('⚠️ fast-hardware-skills-progress 派发失败:', e?.message || e);
        }
    }

    /**
     * 更新 skills 链路阶段：仅向总线 emit，由 `_consumeSkillsProgressFromBus` 刷新 UI（无总线时降级为本地写入）
     * @param {string} phase - 当前阶段说明
     * @returns {void}
     */
    setSkillsFlowPhaseLabel(phase) {
        const p = String(phase || '请稍候');
        if (window.fastHardwareSkillsProgress && typeof window.fastHardwareSkillsProgress.emit === 'function') {
            window.fastHardwareSkillsProgress.emit({ type: 'phase', phase: p, source: 'chat_manager' });
            return;
        }
        this._skillsFlowPhaseLabel = p;
        const line = this._buildSkillsFlowTypingLine();
        if (this._agentTraceHeaderMessageId != null) {
            this._setAgentTraceHeaderLine(this._agentTraceHeaderMessageId, line);
        } else {
            const typingEl = document.getElementById('typing-indicator');
            if (typingEl) {
                this.setTypingIndicatorText(line);
            } else if (this._skillsFlowActive) {
                void this.showTypingIndicator(line).then(() => {
                    this.startSkillsFlowElapsedTimer();
                    this.setTypingIndicatorText(this._buildSkillsFlowTypingLine());
                });
            }
        }
        this._publishSkillsProgressEvent({ type: 'phase', phase: this._skillsFlowPhaseLabel, line });
    }

    /**
     * 将「阶段 · 用时 n S」写到指定追踪助手消息的头部（与 typing 气泡互斥）
     * @param {number} messageId
     * @param {string} line
     * @returns {void}
     */
    _setAgentTraceHeaderLine(messageId, line) {
        const el = document.querySelector(`[data-message-id="${messageId}"] .message-time`);
        if (el) {
            el.textContent = String(line || '');
        }
    }

    /**
     * 把当前阶段计时行写到追踪头或 typing（由 _agentTraceHeaderMessageId 决定）
     * @returns {void}
     */
    _applySkillsFlowElapsedLineToUi() {
        const line = this._buildSkillsFlowTypingLine();
        if (this._agentTraceHeaderMessageId != null) {
            this._setAgentTraceHeaderLine(this._agentTraceHeaderMessageId, line);
        } else {
            this.setTypingIndicatorText(line);
        }
    }

    /**
     * 启动 skills 链路计时：每秒用「当前阶段 · 用时 n S」刷新 typing（不重置已开始的时间戳）
     * @returns {void}
     */
    startSkillsFlowElapsedTimer() {
        this.stopSkillsFlowElapsedTimer();
        if (this._skillsFlowElapsedT0 == null) {
            this._skillsFlowElapsedT0 = Date.now();
        }
        const tick = () => {
            this._applySkillsFlowElapsedLineToUi();
        };
        tick();
        this._skillsFlowElapsedTimerId = setInterval(tick, 1000);
    }

    /**
     * 停止 skills 链路用时定时器（不清理阶段与时间戳，由 hideTypingIndicator / finally 收口）
     * @returns {void}
     */
    stopSkillsFlowElapsedTimer() {
        if (this._skillsFlowElapsedTimerId != null) {
            clearInterval(this._skillsFlowElapsedTimerId);
            this._skillsFlowElapsedTimerId = null;
        }
    }

    /**
     * Skills 在进度文案中的短名称
     * @param {string} skillName - skill 标识
     * @returns {string}
     */
    getSkillChainShortName(skillName) {
        /** @type {Record<string, string>} */
        const map = {
            web_search_exa: 'Web 检索',
            scheme_design_skill: '方案设计',
            completion_suggestion_skill: '补全建议',
            wiring_edit_skill: '连线编辑',
            firmware_codegen_skill: '固件编辑'
        };
        return map[skillName] || skillName;
    }

    /**
     * Skills 进度行展示用英文短名（连字符），如 web-search；未知则下划线转连字符
     * @param {string} skillName - skill 标识
     * @returns {string}
     */
    getSkillProgressSlug(skillName) {
        /** @type {Record<string, string>} */
        const map = {
            web_search_exa: 'web-search',
            scheme_design_skill: 'scheme-design',
            completion_suggestion_skill: 'completion-suggestion',
            wiring_edit_skill: 'wiring-edit',
            firmware_codegen_skill: 'firmware-code'
        };
        if (map[skillName]) return map[skillName];
        const s = String(skillName || 'unknown').trim();
        return s.replace(/_/g, '-');
    }

    /**
     * 进度阶段「字数」：汉字各计 1；连续 [a-zA-Z0-9._-] 拉丁片段计 1（整块英文 token）
     * @param {string} str
     * @returns {number}
     */
    _countSkillsPhaseUnits(str) {
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
     * 将阶段说明压到不超过 maxUnits（默认 12）；超长时先尝试缩写已知 slug，再截断加省略号
     * @param {string} phase
     * @param {number} [maxUnits=12]
     * @returns {string}
     */
    _clampSkillsPhaseLabel(phase, maxUnits = 12) {
        let s = String(phase || '');
        if (this._countSkillsPhaseUnits(s) <= maxUnits) return s;
        /** @type {Record<string, string>} */
        const slugAbbrev = {
            'web-search': 'ws',
            'scheme-design': 'sd',
            'completion-suggestion': 'cs',
            'wiring-edit': 'we',
            'firmware-code': 'fw'
        };
        let t = s;
        for (const [full, ab] of Object.entries(slugAbbrev)) {
            t = t.split(full).join(ab);
            if (this._countSkillsPhaseUnits(t) <= maxUnits) return t;
        }
        while (t.length > 0 && this._countSkillsPhaseUnits(t) > maxUnits) {
            t = t.slice(0, -1);
        }
        return t ? `${t}…` : '请稍候';
    }

    /**
     * 本批 tool_calls 的调用阶段说明：单 skill 为「正在调用 xxx skill」，多 skill 为「正在调用 首个slug 等n个skill」
     * @param {string} firstSkillName - 本批第一个 skill 标识
     * @param {number} total - 本批 skill 数量
     * @returns {string}
     */
    getSkillBatchInvokePhaseLabel(firstSkillName, total) {
        const firstSlug = this.getSkillProgressSlug(firstSkillName);
        const n = Math.max(1, Math.floor(Number(total)) || 1);
        if (n <= 1) {
            return this._clampSkillsPhaseLabel(`正在调用 ${firstSlug} skill`);
        }
        return this._clampSkillsPhaseLabel(`正在调用 ${firstSlug} 等${n}个skill`);
    }

    /**
     * Skills 进度：单次 skill 结束后的极短说明，≤12「字」，英文整块计 1，无括号
     * @param {string} skillName
     * @param {boolean} success
     * @param {number} [webResultCount] - web_search_exa 成功时的结果条数
     * @returns {string}
     */
    getSkillResultPhaseLabel(skillName, success, webResultCount) {
        const slug = this.getSkillProgressSlug(skillName);
        if (!success) {
            return this._clampSkillsPhaseLabel(`${slug} 执行失败`);
        }
        if (skillName === 'web_search_exa') {
            const c = typeof webResultCount === 'number' ? webResultCount : 0;
            return this._clampSkillsPhaseLabel(c > 0 ? `${slug} 返回${c}条` : `${slug} 无结果`);
        }
        return this._clampSkillsPhaseLabel(`${slug} 已完成`);
    }

    /**
     * 处理主进程 `skills-agent-loop-progress` 事件，刷新阶段与进度总线（与本地 `_publishSkillsProgressEvent` 同形）
     * @param {Record<string, unknown>} detail
     * @returns {void}
     */
    _handleMainAgentLoopProgress(detail) {
        if (!detail || typeof detail !== 'object') return;
        const t = detail.type;
        if (t === 'phase' && typeof detail.phase === 'string') {
            this.setSkillsFlowPhaseLabel(detail.phase);
            return;
        }
        if (t === 'agent_block') {
            const tid = this._agentTraceMessageId;
            const msg = tid != null ? this.messages.find((m) => m.id === tid) : null;
            if (msg && Array.isArray(msg.agentBlocks)) {
                const bt = detail.blockType;
                if (bt === 'reasoning' || bt === 'turn') {
                    /* 步骤摘要 / 「模型第N轮」分隔：不进入 UI；主进程已不再发送 */
                }
            }
            return;
        }
        if (t === 'tool_start' || t === 'tool_end') {
            const tid = this._agentTraceMessageId;
            const msg = tid != null ? this.messages.find((m) => m.id === tid) : null;
            if (msg && Array.isArray(msg.agentBlocks)) {
                if (t === 'tool_start') {
                    msg.agentBlocks.push({
                        blockType: 'tool',
                        phase: 'run',
                        toolCallId: String(detail.toolCallId || ''),
                        skillName: String(detail.skillName || ''),
                        shortName: String(detail.shortName || ''),
                        argsPreview: typeof detail.argsPreview === 'string' ? detail.argsPreview : ''
                    });
                } else {
                    const tcid = String(detail.toolCallId || '');
                    const pending = [...msg.agentBlocks]
                        .reverse()
                        .find(
                            (b) =>
                                b &&
                                b.blockType === 'tool' &&
                                b.phase === 'run' &&
                                String(b.toolCallId || '') === tcid
                        );
                    if (pending) {
                        pending.phase = 'done';
                        pending.success = !!detail.success;
                        pending.resultPreview =
                            typeof detail.resultPreview === 'string' ? detail.resultPreview : '';
                        if (
                            String(detail.skillName || '') === 'wiring_edit_skill' &&
                            detail.wiringPlan &&
                            typeof detail.wiringPlan === 'object'
                        ) {
                            const wp = detail.wiringPlan;
                            const ops = Array.isArray(wp.plannedOperations) ? wp.plannedOperations : [];
                            const lines = [];
                            const cvs = String(wp.canvasVsScheme || '').trim();
                            if (cvs) lines.push(`canvasVsScheme: ${cvs}`);
                            const missing = Array.isArray(wp.missingPartsSummary)
                                ? wp.missingPartsSummary.map((x) => String(x || '').trim()).filter(Boolean)
                                : [];
                            if (missing.length) lines.push(`missingParts: ${missing.join('、')}`);
                            const rationale = String(wp.rationale || '').trim();
                            if (rationale) lines.push(`rationale: ${rationale}`);
                            const addN = ops.filter((x) => String(x?.op || '').trim() === 'add_connection').length;
                            const delN = ops.filter((x) => String(x?.op || '').trim() === 'remove_connection').length;
                            lines.push(`diffSummary: +${addN} / -${delN}`);
                            lines.push('diff:');
                            if (ops.length) {
                                for (const op of ops) {
                                    const kind = String(op?.op || '').trim();
                                    if (kind === 'add_connection') {
                                        const s = op?.source || {};
                                        const t = op?.target || {};
                                        lines.push(
                                            `+ ${String(s.instanceId || '?')}:${String(s.pinName || s.pinId || '?')} -> ${String(t.instanceId || '?')}:${String(t.pinName || t.pinId || '?')}`
                                        );
                                    } else if (kind === 'remove_connection') {
                                        lines.push(`- ${String(op?.connectionId || '?')}`);
                                    } else {
                                        lines.push(`~ ${kind || 'unknown'}`);
                                    }
                                }
                            } else {
                                lines.push('(none)');
                            }
                            pending.wiringPlanPreview = lines.join('\n');
                        }
                    }
                    if (
                        String(detail.skillName || '') === 'firmware_codegen_skill' &&
                        detail.firmwarePatch &&
                        typeof detail.firmwarePatch === 'object'
                    ) {
                        const patch = String(detail.firmwarePatch.patch || '').trim();
                        if (patch && window.canvasInstance?.previewFirmwarePatchInEditor) {
                            try {
                                window.canvasInstance.previewFirmwarePatchInEditor(patch, { autoOpen: true });
                            } catch (e) {
                                console.warn('[chat] 预览固件补丁失败:', e);
                            }
                        }
                    }
                }
                void this._refreshAgentTraceBlocksDom(tid);
            }
            this._publishSkillsProgressEvent(detail);
            return;
        }
        if (t === 'llm_round') {
            this.setSkillsFlowPhaseLabel('解析模型回复');
            return;
        }
        if (t === 'final_synthesis_start') {
            this._skillsAgentFinalSynthesisActive = true;
            this._skillsAgentFinalStreamBuf = '';
            const tid = this._agentTraceMessageId;
            const msg = tid != null ? this.messages.find((m) => m.id === tid) : null;
            if (msg) {
                msg.isAgentTrace = false;
                msg.content = '';
            }
            this.setSkillsFlowPhaseLabel('正在生成最终回复');
            if (tid != null) {
                const answerEl = document.querySelector(`[data-message-id="${tid}"] .fh-agent-answer`);
                if (answerEl) {
                    answerEl.innerHTML =
                        '<div class="fh-stream-preview fh-agent-answer-stream" style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.55"></div>';
                }
            }
            return;
        }
        if (t === 'final_synthesis_end') {
            this._skillsAgentFinalSynthesisActive = false;
            this.setSkillsFlowPhaseLabel('编排收尾');
            return;
        }
    }

    /**
     * 将 agent 块列表渲染为 HTML（Anthropic 式可折叠块；不含最终 Markdown 正文）
     * @param {Array<Record<string, unknown>>} blocks
     * @returns {string}
     */
    _renderAgentBlocksHtml(blocks) {
        if (!Array.isArray(blocks) || !blocks.length) {
            return '<div class="fh-agent-blocks-empty">正在连接编排器…</div>';
        }
        const parts = [];
        for (const b of blocks) {
            if (!b || typeof b !== 'object') continue;
            if (b.blockType === 'turn' || b.blockType === 'reasoning') {
                continue;
            }
            if (b.blockType === 'tool') {
                const phase = b.phase === 'run' ? 'run' : 'done';
                const ok = !!b.success;
                const statusLabel = phase === 'run' ? '执行中…' : ok ? '已完成' : '失败';
                const cls = phase === 'run' ? 'is-running' : ok ? 'is-ok' : 'is-err';
                const name = this.escapeHtml(String(b.shortName || b.skillName || 'tool'));
                const summaryLine =
                    typeof b.detailSummary === 'string' && b.detailSummary.trim()
                        ? this.escapeHtml(b.detailSummary.trim())
                        : '';
                const argsEsc = this.escapeHtml(String(b.argsPreview || ''));
                const resEsc =
                    phase === 'done' ? this.escapeHtml(String(b.resultPreview ?? '')) : '';
                const wiringEsc =
                    phase === 'done' && typeof b.wiringPlanPreview === 'string' && b.wiringPlanPreview.trim()
                        ? this.escapeHtml(String(b.wiringPlanPreview))
                        : '';
                const openAttr = phase === 'run' ? ' open' : '';
                const toggleOpen = phase === 'run';
                const ariaExp = toggleOpen ? 'true' : 'false';
                const chevronName = toggleOpen ? 'chevron-up' : 'chevron-down';
                const ariaLbl = toggleOpen ? '收起详情' : '展开详情';
                const bodyHtml = summaryLine
                    ? `<div class="fh-tool-section fh-tool-section-summary"><div class="fh-tool-prose">${summaryLine}</div></div>`
                    : `<div class="fh-tool-section"><span class="fh-tool-label">输入要点</span><div class="fh-tool-prose">${argsEsc}</div></div>${phase === 'done' ? `<div class="fh-tool-section"><span class="fh-tool-label">执行结果</span><div class="fh-tool-prose">${resEsc}</div></div>${wiringEsc ? `<div class="fh-tool-section"><span class="fh-tool-label">连线方案</span><div class="fh-tool-prose">${wiringEsc}</div></div>` : ''}` : ''}`;
                parts.push(
                    `<details class="fh-agent-block fh-agent-block-tool ${cls}"${openAttr}><summary class="fh-agent-block-summary"><span class="fh-agent-block-summary-main"><span class="fh-tool-name">${name}</span><span class="fh-tool-status">${statusLabel}</span></span><button type="button" class="fh-agent-block-toggle" aria-expanded="${ariaExp}" aria-label="${ariaLbl}"><img class="fh-agent-block-toggle-icon" src="" alt="" width="18" height="18" data-icon="${chevronName}"></button></summary>${bodyHtml}</details>`
                );
            }
        }
        return parts.join('');
    }

    /**
     * 仅刷新追踪消息中的块区 DOM，避免整表重绘
     * @param {number} messageId
     * @returns {Promise<void>}
     */
    async _refreshAgentTraceBlocksDom(messageId) {
        const msg = this.messages.find((m) => m.id === messageId);
        if (!msg || !Array.isArray(msg.agentBlocks)) return;
        const wrap = document.querySelector(`[data-message-id="${messageId}"] .fh-agent-blocks`);
        if (wrap) {
            wrap.innerHTML = this._renderAgentBlocksHtml(msg.agentBlocks);
            await this._hydrateDataIconImgsIn(wrap);
        } else {
            await this.renderMessages();
            if (this._agentTraceHeaderMessageId === messageId) {
                this._setAgentTraceHeaderLine(messageId, this._buildSkillsFlowTypingLine());
            }
        }
        if (
            this._skillsAgentFinalSynthesisActive &&
            this._agentTraceMessageId === messageId
        ) {
            this._applySkillsAgentFinalStreamToDom(messageId);
        }
        this.scrollToBottom();
    }

    /**
     * Skills Agent 多轮循环（编排逻辑在**主进程** `run-skills-agent-loop`；此处仅负责 UI、画布快照与进度订阅）
     * @param {string} userMessage - 用户需求原文
     * @param {Object} userMessageObj - 用户消息对象
     */
    async runSkillsAgentLoop(userMessage, userMessageObj) {
        if (!this.skillsEngine) {
            console.error('❌ skills 引擎未初始化');
            return;
        }

        this.isTyping = true;
        this.isInterrupted = false;

        const skillContextId = Date.now() + Math.floor(Math.random() * 1000);
        this.activeSkillContextId = skillContextId;

        this._skillsFlowActive = true;
        /** @type {number} 本轮 agent 追踪气泡 id（供 merge / catch 使用，避免仅依赖 _agentTraceMessageId） */
        let traceIdForThisRun = 0;
        try {
            this._logSkillsChain('runSkillsAgentLoop 开始（主进程编排）', {
                skillContextId,
                userPreview: String(userMessage || '').slice(0, 200),
                userChars: String(userMessage || '').length,
                needsWebSearchPriority: this.needsWebSearchPriority(userMessage),
                model: this.selectedModel || this.defaultChatModel
            });

            this._skillsFlowElapsedT0 = Date.now();
            this._skillsFlowMaxElapsedSec = 0;
            this._skillsFlowPhaseLabel = '等待模型规划';
            if (window.fastHardwareSkillsProgress && typeof window.fastHardwareSkillsProgress.emit === 'function') {
                window.fastHardwareSkillsProgress.emit({
                    type: 'phase',
                    phase: '等待模型规划',
                    source: 'chat_manager'
                });
            }

            traceIdForThisRun = Date.now();
            this._skillsAgentFinalSynthesisActive = false;
            this._agentTraceMessageId = traceIdForThisRun;
            this._agentTraceHeaderMessageId = traceIdForThisRun;
            this.messages.push({
                id: traceIdForThisRun,
                type: 'assistant',
                content: '',
                timestamp: new Date(),
                isAgentTrace: true,
                isSkillFlow: true,
                skillState: null,
                agentBlocks: []
            });
            await this.renderMessages();
            this.scrollToBottom();
            this._setAgentTraceHeaderLine(traceIdForThisRun, this._buildSkillsFlowTypingLine());
            this.startSkillsFlowElapsedTimer();
            this._publishSkillsProgressEvent({
                type: 'skills_flow_start',
                phase: this._skillsFlowPhaseLabel,
                line: this._buildSkillsFlowTypingLine()
            });
            this.updateSendButton();

            if (window.electronAPI?.registerSkillsAgentLoopProgress) {
                window.electronAPI.registerSkillsAgentLoopProgress((d) => this._handleMainAgentLoopProgress(d));
            }

            let unsubscribeFinalStream = null;
            let res;
            try {
                if (typeof window.electronAPI?.onSkillsAgentLoopFinalStream === 'function') {
                    this._skillsAgentFinalStreamBuf = '';
                    unsubscribeFinalStream = window.electronAPI.onSkillsAgentLoopFinalStream((payload) => {
                        const delta = typeof payload?.delta === 'string' ? payload.delta : '';
                        if (!delta) return;
                        this._skillsAgentFinalStreamBuf =
                            (this._skillsAgentFinalStreamBuf || '') + delta;
                        this._scheduleSkillsAgentFinalStreamPreview(traceIdForThisRun);
                    });
                }
                const loopCanvasSnapshot =
                    typeof this.skillsEngine.getCanvasSnapshotForSkill === 'function'
                        ? this.skillsEngine.getCanvasSnapshotForSkill()
                        : null;
                const loopComponents = Array.isArray(loopCanvasSnapshot?.components)
                    ? loopCanvasSnapshot.components
                    : [];
                const loopConnections = Array.isArray(loopCanvasSnapshot?.connections)
                    ? loopCanvasSnapshot.connections
                    : [];
                console.log('[skills-loop] canvasSnapshot 摘要:', {
                    projectPath:
                        typeof window.app?.currentProject === 'string'
                            ? String(window.app.currentProject).trim()
                            : '',
                    componentCount: loopComponents.length,
                    connectionCount: loopConnections.length,
                    componentInstancePreview: loopComponents
                        .slice(0, 8)
                        .map((c) => String(c?.instanceId || c?.id || c?.componentFile || ''))
                        .filter(Boolean),
                    connectionPreview: loopConnections
                        .slice(0, 8)
                        .map((w) => {
                            const sid = String(
                                w?.source?.instanceId || w?.source?.componentId || ''
                            );
                            const tid = String(
                                w?.target?.instanceId || w?.target?.componentId || ''
                            );
                            return `${sid}:${String(w?.source?.pinId || '')} -> ${tid}:${String(w?.target?.pinId || '')}`;
                        })
                });
                res = await window.electronAPI.runSkillsAgentLoop({
                    userMessage: String(userMessage || ''),
                    model: this.selectedModel || this.defaultChatModel,
                    temperature: 0.2,
                    canvasSnapshot: loopCanvasSnapshot,
                    projectPath:
                        typeof window.app?.currentProject === 'string'
                            ? String(window.app.currentProject).trim()
                            : ''
                });
            } finally {
                if (typeof unsubscribeFinalStream === 'function') {
                    unsubscribeFinalStream();
                }
                if (traceIdForThisRun) {
                    this._applySkillsAgentFinalStreamToDom(traceIdForThisRun);
                }
                this._cancelSkillsAgentFinalStreamRaf();
            }

            if (window.electronAPI?.registerSkillsAgentLoopProgress) {
                window.electronAPI.registerSkillsAgentLoopProgress(null);
            }

            this.hideTypingIndicator();

            this._agentTraceMessageId = null;
            this._agentTraceHeaderMessageId = null;

            if (!res || res.success === false) {
                const errText = `❌ skills 链路失败：${String(res?.error || '未知错误')}`;
                const tmsg = traceIdForThisRun ? this.messages.find((m) => m.id === traceIdForThisRun) : null;
                if (tmsg) {
                    tmsg.isAgentTrace = false;
                    tmsg.content = errText;
                    tmsg.isSkillFlow = true;
                } else {
                    this.messages.push({
                        id: Date.now(),
                        type: 'assistant',
                        content: errText,
                        timestamp: new Date()
                    });
                }
                await this.renderMessages();
                this.scrollToBottom();
                return;
            }

            const msgs = Array.isArray(res.assistantMessages) ? res.assistantMessages : [];
            let finalContent = '';
            for (const m of msgs) {
                if (m && m.type === 'assistant_message' && typeof m.content === 'string') {
                    finalContent = m.content;
                    break;
                }
            }
            const tmsgOk = traceIdForThisRun ? this.messages.find((m) => m.id === traceIdForThisRun) : null;
            if (tmsgOk) {
                tmsgOk.isAgentTrace = false;
                tmsgOk.content = finalContent;
                tmsgOk.isSkillFlow = true;
                tmsgOk.skillState = this.skillsEngine?.currentSkillState;
            } else if (finalContent) {
                this.messages.push({
                    id: Date.now(),
                    type: 'assistant',
                    content: finalContent,
                    isSkillFlow: true,
                    skillState: this.skillsEngine?.currentSkillState,
                    timestamp: new Date()
                });
            }
            await this.renderMessages();
            this.scrollToBottom();
        } catch (error) {
            this._logSkillsChain('skills 链路异常', {
                message: error?.message || String(error),
                phaseAtFail: this._skillsFlowPhaseLabel
            });
            console.error('❌ skills 链路执行失败:', error);
            this.hideTypingIndicator();

            const errLine = `❌ skills 链路执行失败：${error?.message || String(error)}`;
            this._agentTraceMessageId = null;
            const tmsg = traceIdForThisRun ? this.messages.find((m) => m.id === traceIdForThisRun) : null;
            if (tmsg) {
                tmsg.isAgentTrace = false;
                tmsg.content = errLine;
                tmsg.isSkillFlow = true;
            } else {
                this.messages.push({
                    id: Date.now(),
                    type: 'assistant',
                    content: errLine,
                    timestamp: new Date()
                });
            }
            await this.renderMessages();
            this.scrollToBottom();
        } finally {
            console.log(
                '[chat-api] 本轮 skills agent 全链路 阶段用时峰值(与 UI「用时 n S」一致):',
                `${this._skillsFlowMaxElapsedSec ?? 0}s`
            );
            this._skillsFlowMaxElapsedSec = 0;
            if (window.electronAPI?.registerSkillsAgentLoopProgress) {
                window.electronAPI.registerSkillsAgentLoopProgress(null);
            }
            this._skillsFlowActive = false;
            this.stopSkillsFlowElapsedTimer();
            this._skillsFlowElapsedT0 = null;
            this._skillsFlowPhaseLabel = null;
            this.isTyping = false;
            this.updateSendButton();
            this._publishSkillsProgressEvent({ type: 'skills_flow_end' });
            this._skillsAgentFinalSynthesisActive = false;
            this._agentTraceMessageId = null;
            this._agentTraceHeaderMessageId = null;
        }
    }

    /**
     * 显示正在输入指示器（默认「等待生成回复」，与 skills 流程阶段行风格一致）
     * @param {string} [text='等待生成回复'] - 头部时间位展示的提示文案
     */
    async showTypingIndicator(text = '等待生成回复') {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        /** 历史 bug：同一时刻多次创建会留下多条同 id 节点；只保留第一条，其余移除 */
        const dup = messagesContainer.querySelectorAll('#typing-indicator');
        dup.forEach((el, idx) => {
            if (idx > 0) el.remove();
        });

        const existing = document.getElementById('typing-indicator');
        if (existing) {
            this.setTypingIndicatorText(text || '等待生成回复');
            this.scrollToBottom();
            return;
        }

        // 获取正确的图标路径
        const assetsPath = await window.electronAPI.getAssetsPath();
        const botIconSrc = assetsPath + '/icon-bot.svg';

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar"><img src="file://${botIconSrc}" alt="AI" width="20" height="20"></div>
                <div class="message-time">${this.escapeHtml(String(text || '等待生成回复'))}</div>
            </div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    /**
     * 更新“正在输入”提示文字（用于区分 web search / 总结等阶段）
     * @param {string} text - 要展示的提示文字
     */
    setTypingIndicatorText(text) {
        const typingIndicator = document.getElementById('typing-indicator');
        if (!typingIndicator) return;
        const timeDiv = typingIndicator.querySelector('.message-time');
        if (!timeDiv) return;
        timeDiv.textContent = String(text || '');
    }

    /**
     * 将流式增量合并后通过 rAF 刷新到 typing 气泡（完成后由正式消息再做 Markdown 渲染）
     * @param {string} delta
     * @returns {void}
     */
    _scheduleTypingStreamPreviewAppend(delta) {
        this._typingStreamPending = (this._typingStreamPending || '') + delta;
        if (this._typingStreamRaf != null) return;
        this._typingStreamRaf = requestAnimationFrame(() => {
            this._typingStreamRaf = null;
            this._applyTypingIndicatorStreamPreview(this._typingStreamPending || '');
        });
    }

    /**
     * 取消流式预览 rAF 并清空缓冲（请求结束或失败时）
     * @returns {void}
     */
    _cancelTypingStreamPreviewRaf() {
        if (this._typingStreamRaf != null) {
            cancelAnimationFrame(this._typingStreamRaf);
            this._typingStreamRaf = null;
        }
        this._typingStreamPending = '';
    }

    /**
     * 保证追踪气泡内存在流式答案节点；主进程已要求最终合成仅 Markdown，故缓冲即正文（纯文本预览，收尾时再 `renderMarkdown`）。
     * @param {number} messageId
     * @returns {void}
     */
    _applySkillsAgentFinalStreamToDom(messageId) {
        const root = document.querySelector(`[data-message-id="${messageId}"] .fh-agent-answer`);
        if (!root) return;
        let el = root.querySelector('.fh-agent-answer-stream');
        if (!el) {
            root.innerHTML =
                '<div class="fh-stream-preview fh-agent-answer-stream" style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.55"></div>';
            el = root.querySelector('.fh-agent-answer-stream');
        }
        if (!el) return;
        el.textContent = this._skillsAgentFinalStreamBuf || '';
        this.scrollToBottom();
    }

    /**
     * Skills Agent 最终合成：SSE 增量合并后经 rAF 刷入单气泡（真流式；与 planning 的 JSON 块无关）
     * @param {number} messageId
     * @returns {void}
     */
    _scheduleSkillsAgentFinalStreamPreview(messageId) {
        this._skillsAgentFinalStreamPendingMsgId = messageId;
        if (this._skillsAgentFinalStreamRaf != null) return;
        this._skillsAgentFinalStreamRaf = requestAnimationFrame(() => {
            this._skillsAgentFinalStreamRaf = null;
            const mid = this._skillsAgentFinalStreamPendingMsgId;
            this._applySkillsAgentFinalStreamToDom(mid);
        });
    }

    /**
     * 取消最终合成流式 rAF（invoke 结束或取消订阅时）
     * @returns {void}
     */
    _cancelSkillsAgentFinalStreamRaf() {
        if (this._skillsAgentFinalStreamRaf != null) {
            cancelAnimationFrame(this._skillsAgentFinalStreamRaf);
            this._skillsAgentFinalStreamRaf = null;
        }
    }

    /**
     * 在 typing-indicator 的 message-content 区显示流式纯文本预览
     * @param {string} fullText
     * @returns {void}
     */
    _applyTypingIndicatorStreamPreview(fullText) {
        const el = document.getElementById('typing-indicator');
        if (!el) return;
        const mc = el.querySelector('.message-content');
        if (!mc) return;
        const safe = this.escapeHtml(String(fullText || ''));
        mc.innerHTML = `<div class="fh-stream-preview" style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5">${safe}</div>`;
        this.scrollToBottom();
    }

    /**
     * 隐藏正在输入指示器
     */
    hideTypingIndicator() {
        this._cancelTypingStreamPreviewRaf();
        this._flushSkillsFlowElapsedPeakForUi();
        this.stopSkillsFlowElapsedTimer();
        this._skillsFlowElapsedT0 = null;
        this._skillsFlowPhaseLabel = null;
        this._agentTraceHeaderMessageId = null;
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    /**
     * 仅移除底部 typing 气泡 DOM（不清计时器、不清空 `_agentTraceHeaderMessageId`），用于直连工作区追踪气泡出现后消除双气泡。
     * @returns {void}
     */
    _removeTypingIndicatorDomOnly() {
        this._cancelTypingStreamPreviewRaf();
        document.getElementById('typing-indicator')?.remove();
    }

    /**
     * 工作区工具循环：根据缓冲首字符区分 JSON 工具输出与 Markdown 终答，将 SSE 合并结果刷入追踪气泡（`{` 起头则仅显示解析提示，避免把 JSON 闪给用户）。
     * @param {number} messageId
     * @returns {void}
     */
    _applyWorkspaceLoopStreamToDom(messageId) {
        const buf = this._workspaceLoopStreamBuf || '';
        const root = document.querySelector(`[data-message-id="${messageId}"] .fh-agent-answer`);
        if (!root) return;
        const firstNonWs = buf.search(/\S/);
        if (firstNonWs < 0) {
            return;
        }
        const first = buf.charAt(firstNonWs);
        if (first === '{') {
            root.innerHTML =
                '<p class="fh-agent-placeholder">正在生成最终回复（工具结果已就绪）…</p>';
            this.scrollToBottom();
            return;
        }
        let el = root.querySelector('.fh-agent-answer-stream');
        if (!el) {
            root.innerHTML =
                '<div class="fh-stream-preview fh-agent-answer-stream" style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.55"></div>';
            el = root.querySelector('.fh-agent-answer-stream');
        }
        if (el) {
            el.textContent = buf;
        }
        this.scrollToBottom();
    }

    /**
     * @param {number} messageId
     * @returns {void}
     */
    _scheduleWorkspaceLoopStreamPreview(messageId) {
        this._workspaceLoopStreamPendingMsgId = messageId;
        if (this._workspaceLoopStreamRaf != null) return;
        this._workspaceLoopStreamRaf = requestAnimationFrame(() => {
            this._workspaceLoopStreamRaf = null;
            const mid = this._workspaceLoopStreamPendingMsgId;
            this._applyWorkspaceLoopStreamToDom(mid);
        });
    }

    /**
     * @returns {void}
     */
    _cancelWorkspaceLoopStreamRaf() {
        if (this._workspaceLoopStreamRaf != null) {
            cancelAnimationFrame(this._workspaceLoopStreamRaf);
            this._workspaceLoopStreamRaf = null;
        }
    }

    /**
     * 渲染消息列表
     */
    async renderMessages() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        // 清空容器，保留正在输入指示器
        const typingIndicator = document.getElementById('typing-indicator');
        messagesContainer.innerHTML = '';

        // 重新添加消息
        for (const message of this.messages) {
            const messageDiv = await this.createMessageElement(message);
            messagesContainer.appendChild(messageDiv);
        }

        // 如果有正在输入指示器，重新添加
        if (typingIndicator) {
            messagesContainer.appendChild(typingIndicator);
        }
    }

    /**
     * 简单的markdown渲染器
     * @param {string} text - markdown文本
     * @returns {string} HTML字符串
     */
    renderMarkdown(text) {
        const rawInput = String(text || '');
        try {
            let processedText = rawInput.trim();

            const codeBlocks = [];

            processedText = processedText.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, language, code) => {
                const lang = language || 'text';
                const codeId = 'code-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const formattedCode = code
                    .trim()
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

                const codeBlockHtml = `<div class="code-block-container"><div class="code-block-header"><span class="code-language">${lang}</span><button class="code-copy-btn" data-code-id="${codeId}" title="复制代码"><img src="" alt="复制" width="14" height="14" data-icon="copy"></button></div><pre class="code-block"><code id="${codeId}">${formattedCode}</code></pre></div>`;

                codeBlocks.push(codeBlockHtml);
                return `{{{CODE_BLOCK_${codeBlocks.length - 1}}}}`;
            });

            if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
                return `<p>${this.escapeHtml(processedText)}</p>`;
            }

            let result = marked.parse(processedText);

            for (let i = 0; i < codeBlocks.length; i++) {
                result = result.replace(`{{{CODE_BLOCK_${i}}}}`, codeBlocks[i]);
            }

            return result;
        } catch (e) {
            console.warn('[chat] Markdown 渲染失败，已降级为纯文本', e);
            return `<pre class="fh-md-fallback">${this.escapeHtml(rawInput)}</pre>`;
        }
    }

    /**
     * HTML转义函数
     * @param {string} text - 需要转义的文本
     * @returns {string} 转义后的HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 复制代码到剪贴板
     * @param {string} codeId - 代码元素的ID
     */
    copyCodeToClipboard(codeId) {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;

        const codeText = codeElement.textContent;

        if (navigator.clipboard && window.isSecureContext) {
            // 使用现代的 Clipboard API
            navigator.clipboard.writeText(codeText).then(() => {
                this.showCopySuccess();
            }).catch(err => {
                console.error('复制失败:', err);
                this.fallbackCopyTextToClipboard(codeText);
            });
        } else {
            // 降级到传统方法
            this.fallbackCopyTextToClipboard(codeText);
        }
    }

    /**
     * 降级复制方法
     * @param {string} text - 要复制的文本
     */
    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                this.showCopySuccess();
            } else {
                alert('复制失败，请手动选择复制');
            }
        } catch (err) {
            alert('复制失败，请手动选择复制');
        }

        document.body.removeChild(textArea);
    }

    /**
     * 显示复制成功提示
     */
    showCopySuccess() {
        // 创建临时的成功提示
        const notification = document.createElement('div');
        notification.textContent = '代码已复制到剪贴板';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }

    /**
     * 创建消息元素
     * @param {Object} message - 消息对象
     * @returns {HTMLElement} 消息元素
     */
    async createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}-message`;
        messageDiv.dataset.messageId = message.id; // 添加消息ID用于后续操作

        // 获取正确的图标路径
        const assetsPath = await window.electronAPI.getAssetsPath();
        const userIconSrc = assetsPath + '/icon-user.svg';
        const botIconSrc = assetsPath + '/icon-bot.svg';
        const editIconSrc = assetsPath + '/icon-edit.svg';
        const refreshIconSrc = assetsPath + '/icon-refresh.svg';

        const timeString = message.timestamp.toLocaleString([], {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // 对于 skills 链路消息，如果内容已经是HTML，直接使用；否则进行markdown渲染
        let contentHtml;
        const hasAgentBlocks =
            message.type === 'assistant' &&
            ((Array.isArray(message.agentBlocks) && message.agentBlocks.length > 0) ||
                message.isAgentTrace);
        if (hasAgentBlocks) {
            const blocksPart =
                Array.isArray(message.agentBlocks) && message.agentBlocks.length > 0
                    ? this._renderAgentBlocksHtml(message.agentBlocks)
                    : '<div class="fh-agent-blocks-empty">正在连接编排器…</div>';
            let ans = '';
            const raw = String(message.content || '').trim();
            if (message.isSkillFlow && raw.startsWith('<div')) {
                ans = message.content;
            } else if (raw) {
                ans = this.renderMarkdown(message.content);
            } else if (message.isAgentTrace) {
                ans = message.isDirectWorkspaceTrace
                    ? '<p class="fh-agent-placeholder">正在通过工作区工具读取项目…</p>'
                    : '<p class="fh-agent-placeholder">编排进行中…</p>';
            } else {
                ans =
                    '<div class="fh-stream-preview fh-agent-answer-stream" style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.55"></div>';
            }
            contentHtml = `<div class="fh-agent-trace-wrap"><div class="fh-agent-blocks">${blocksPart}</div><div class="fh-agent-answer">${ans}</div></div>`;
        } else if (message.isSkillFlow && String(message.content || '').trim().startsWith('<div')) {
            // skills 链路消息，内容已经是HTML格式，直接使用
            contentHtml = message.content;
        } else {
            // 普通消息，进行markdown渲染
            contentHtml = this.renderMarkdown(message.content);
        }

        // 如果有多图，添加图片显示
        if (message.images && message.images.length > 0) {
            contentHtml += '<div class="message-images">';
            message.images.forEach((image, index) => {
                contentHtml += `
                    <div class="message-image-item">
                        <img src="${image.dataUrl}" alt="上传的图片 ${index + 1}" style="max-width: 180px; max-height: 120px; border-radius: 6px; margin: 4px;">
                        <div class="image-info">${image.name} (${Math.round(image.size / 1024)}KB)</div>
                    </div>
                `;
            });
            contentHtml += '</div>';
        }

        // 检测是否为单行短消息（只对用户消息生效）
        const isShortMessage = message.type === 'user' && this.isShortMessage(message.content, contentHtml, message.images);

        // 为用户消息添加编辑和重新发送按钮
        const resendDisabled = this.isTyping ? 'disabled' : '';
        const resendTitle = this.isTyping ? '正在回复中，无法重发' : '重新发送';
        const userActionsHtml = message.type === 'user' ? `
            <div class="message-actions">
                <button class="message-action-btn edit-btn" title="编辑消息" data-message-id="${message.id}">
                    <img src="file://${editIconSrc}" alt="编辑" width="16" height="16">
                </button>
                <button class="message-action-btn resend-btn" title="${resendTitle}" ${resendDisabled} data-message-id="${message.id}">
                    <img src="file://${refreshIconSrc}" alt="重新发送" width="16" height="16">
                </button>
            </div>
        ` : '';

        messageDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">${message.type === 'user' ? `<img src="file://${userIconSrc}" alt="用户" width="20" height="20">` : `<img src="file://${botIconSrc}" alt="AI" width="20" height="20">`}</div>
                <div class="message-time">${timeString}</div>
            </div>
            <div class="message-content${isShortMessage ? ' short-message' : ''}">
                ${contentHtml}
            </div>
            ${userActionsHtml}
        `;

        await this._hydrateDataIconImgsIn(messageDiv);

        // 如果是短消息，允许换行并保持两端对齐
        if (isShortMessage) {
            setTimeout(() => {
                const messageContent = messageDiv.querySelector('.message-content');
                if (messageContent) {
                    messageContent.style.width = 'fit-content';
                    messageContent.style.maxWidth = 'none';
                    messageContent.style.flex = '0 0 fit-content';
                    messageContent.style.textAlign = 'justify';
                    messageContent.style.wordBreak = 'break-word';
                    messageContent.style.overflowWrap = 'break-word';
                }
            }, 0);
        }

        // 为用户消息绑定编辑和重新发送事件
        if (message.type === 'user') {
            const editBtn = messageDiv.querySelector('.edit-btn');
            const resendBtn = messageDiv.querySelector('.resend-btn');
            const actionsContainer = messageDiv.querySelector('.message-actions');

            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editMessage(message.id);
                });
            }

            if (resendBtn) {
                resendBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.resendMessage(message.id);
                });
            }

            // 添加延迟隐藏逻辑
            if (actionsContainer) {
                // 鼠标进入消息区域时，添加show类确保显示
                messageDiv.addEventListener('mouseenter', () => {
                    if (this.hideActionsTimeout) {
                        clearTimeout(this.hideActionsTimeout);
                        this.hideActionsTimeout = null;
                    }
                    actionsContainer.classList.add('show');
                });

                // 鼠标离开消息区域时，延迟隐藏按钮
                messageDiv.addEventListener('mouseleave', () => {
                    this.hideMessageActions(actionsContainer);
                });

                // 鼠标进入操作按钮区域时，取消隐藏
                actionsContainer.addEventListener('mouseenter', () => {
                    if (this.hideActionsTimeout) {
                        clearTimeout(this.hideActionsTimeout);
                        this.hideActionsTimeout = null;
                    }
                    actionsContainer.classList.add('show');
                });

                // 鼠标离开操作按钮区域时，延迟隐藏
                actionsContainer.addEventListener('mouseleave', () => {
                    this.hideMessageActions(actionsContainer);
                });
            }
        }

        return messageDiv;
    }

    /**
     * 格式化消息内容
     * @param {string} content - 原始消息内容
     * @returns {string} 格式化后的消息内容
     */
    formatMessage(content) {
        // 简单的文本格式化
        return content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    /**
     * 更新发送按钮状态
     */
    updateSendButton() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-message');

        if (!input || !sendBtn) return;

        const hasContent = input.value.trim().length > 0;
        const hasImage = this.uploadedImages && this.uploadedImages.length > 0;

        // 如果正在回复中，显示中断样式
        if (this.isTyping) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.classList.add('interrupt-available');
            sendBtn.title = '点击中断AI回复';
            this.updateResendButtons();
            return;
        }

        // 正常状态
        sendBtn.classList.remove('interrupt-available');
        const canSend = (hasContent || hasImage);
        sendBtn.disabled = !canSend;
        sendBtn.style.opacity = canSend ? '1' : '0.5';
        sendBtn.title = canSend ? '发送消息' : '请输入消息内容';

        this.updateResendButtons();
    }

    /**
     * 根据当前是否正在生成回复，动态启用/禁用历史消息的「重发」按钮。
     * @returns {void}
     */
    updateResendButtons() {
        const resendBtns = document.querySelectorAll('.resend-btn');
        const shouldDisable = this.isTyping === true;
        const disabledTitle = '正在回复中，无法重发';
        const enabledTitle = '重新发送';

        resendBtns.forEach((btn) => {
            if (!(btn instanceof HTMLButtonElement)) return;

            if (shouldDisable) {
                btn.disabled = true;
                btn.title = disabledTitle;
            } else {
                btn.disabled = false;
                btn.removeAttribute('disabled');
                btn.title = enabledTitle;
            }
        });
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
    }

    /**
     * 清空对话
     */
    async clearChat() {
        if (confirm('确定要清空所有对话记录吗？')) {
            this.messages = [];
            this._saveCurrentSessionState();
            await this.renderMessages();
            console.log('对话已清空');
        }
    }

    /**
     * 导出对话
     */
    exportChat() {
        if (this.messages.length === 0) {
            alert('没有对话记录可导出');
            return;
        }

        let exportText = 'Fast Hardware 对话记录\n';
        exportText += '=' .repeat(50) + '\n\n';

        this.messages.forEach(message => {
            const timeString = message.timestamp.toLocaleString();
            const sender = message.type === 'user' ? '用户' : 'AI助手';
            exportText += `[${timeString}] ${sender}:\n`;
            exportText += message.content + '\n\n';
        });

        // 创建下载链接
        const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fast-hardware-chat-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('对话记录已导出');
    }

    /**
     * 延迟隐藏消息操作按钮
     * @param {HTMLElement} actionsContainer - 操作按钮容器元素
     */
    hideMessageActions(actionsContainer) {
        // 清除之前的延迟隐藏定时器
        if (this.hideActionsTimeout) {
            clearTimeout(this.hideActionsTimeout);
        }

        // 设置300ms延迟隐藏
        this.hideActionsTimeout = setTimeout(() => {
            // 检查鼠标是否还在按钮区域内
            if (actionsContainer && !actionsContainer.matches(':hover')) {
                actionsContainer.classList.remove('show');
            }
        }, 300); // 300ms延迟，与图片预览一致
    }

    /**
     * 编辑历史消息
     * @param {number} messageId - 消息ID
     */
    async editMessage(messageId) {
        // 查找消息
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;

        const message = this.messages[messageIndex];
        if (message.type !== 'user') return;

        // 将消息内容填充到输入框
        const input = document.getElementById('chat-input');
        if (!input) return;

        input.value = message.content;
        input.focus();

        // 如果有图片，恢复图片
        if (message.images && message.images.length > 0) {
            this.uploadedImages = [...message.images];
            this.currentImageIndex = 0;
            this.showImagePreview();
        }

        // 不删除消息，让用户可以选择：
        // 1. 直接点击发送 → 作为新消息发送（可能切换了模型）
        // 2. 点击重新发送 → 删除原消息后重新发送

        console.log(`📝 编辑消息 ID: ${messageId}，内容已填充到输入框`);
    }

    /**
     * 重新发送历史消息
     * @param {number} messageId - 消息ID
     */
    async resendMessage(messageId) {
        // 如果当前仍在生成回复中，避免并发重发导致“双机器人回复”
        if (this.isTyping) {
            const msg = '当前正在生成回复中，暂不支持重发。请等待回复完成或点击发送按钮中断后再试。';
            if (typeof this.showNotification === 'function') {
                this.showNotification(msg);
            } else if (typeof window.showNotification === 'function') {
                window.showNotification(msg, 'info');
            }
            return;
        }

        // 查找消息
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;

        const message = this.messages[messageIndex];
        if (message.type !== 'user') return;

        // 删除原消息及其之后的所有消息（包括AI回复）
        this.messages.splice(messageIndex);
        await this.renderMessages();

        // 重新发送消息
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: message.content,
            timestamp: new Date(),
            images: message.images || []
        };

        this.messages.push(userMessage);
        await this.renderMessages();
        this.scrollToBottom();

        if (this.skillsEngine && (!userMessage.images || userMessage.images.length === 0)) {
            try {
                await this._dispatchAfterTextUserMessage(message.content, userMessage);
                console.log(`🔄 重新发送消息 ID: ${messageId}`);
                return;
            } catch (error) {
                console.error('❌ 重新发送 - 链路失败，回退到普通回复:', error);
            }
        }

        // 普通回复流程
        this.simulateAIResponse(message.content, this.selectedModel, message.images || []);

        console.log(`🔄 重新发送消息 ID: ${messageId}`);
    }

    /**
     * 切换模型下拉菜单
     */
    toggleModelDropdown() {
        const dropdown = document.getElementById('model-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    }

    /**
     * 关闭模型下拉菜单
     */
    closeModelDropdown() {
        const dropdown = document.getElementById('model-dropdown');
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    }

    /**
     * 选择模型
     * @param {string} model - 模型名称
     * @param {string} typeOrDesc - 模型类型或描述
     */
    selectModel(model, typeOrDesc) {
        // 调试：检查传入的模型名称
        console.log('🔍 selectModel 接收到的参数 - model:', model, 'typeOrDesc:', typeOrDesc);
        
        this.selectedModel = model;
        console.log('✅ 已设置 this.selectedModel =', this.selectedModel);

        if (window.modelConfigManager) {
            const info = window.modelConfigManager.getModelByName(model);
            const appType = info?.appType || info?.type || typeOrDesc || 'chat';
            try {
                const key = `fastHardwarePreferredModel_${appType}`;
                window.localStorage?.setItem(key, model);
                console.log('💾 已保存模型偏好:', key, model);
            } catch (error) {
                console.warn('⚠️ 保存模型偏好失败:', error.message);
            }
        }

        // 更新UI显示和选中状态
        if (window.modelConfigManager) {
            const modelInfo = window.modelConfigManager.getModelByName(model);
            if (modelInfo) {
                // updateModelDisplay 会自动调用 updateModelSelection
                this.updateModelDisplay(modelInfo);
            } else {
        const modelNameElement = document.getElementById('current-model');
        if (modelNameElement) {
            modelNameElement.textContent = model;
                    modelNameElement.title = typeOrDesc || model;
        }
                // 手动更新选中状态
                this.updateModelSelection(model);
            }
            } else {
            const modelNameElement = document.getElementById('current-model');
            if (modelNameElement) {
                modelNameElement.textContent = model;
                modelNameElement.title = typeOrDesc || model;
            }
            // 手动更新选中状态
            this.updateModelSelection(model);
        }

        // 关闭下拉菜单
        this.closeModelDropdown();

        console.log(`已选择AI模型: ${model} (${typeOrDesc || ''})`);
    }

    /**
     * 处理图片上传（仅在没有图片时允许）
     */
    handleImageUpload() {
        // 如果已有图片，不允许通过按钮上传，只能通过浮窗内的添加区域
        if (this.uploadedImages.length > 0) {
            return;
        }

        this.handleAddImage();
    }

    /**
     * 处理添加图片（支持多选）
     */
    handleAddImage() {
        // 创建文件输入元素，支持多选
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true; // 支持多选
        input.style.display = 'none';

        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                // 批量处理选中的所有文件
                files.forEach(file => {
                    this.processUploadedImage(file);
                });
            }
            // 清理临时元素
            document.body.removeChild(input);
        });

        document.body.appendChild(input);
        input.click();
    }

    /**
     * 处理上传的图片（支持多图）
     */
    processUploadedImage(file) {
        // 检查文件类型
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件');
            return;
        }

        // 检查是否已存在相同文件
        const existingIndex = this.uploadedImages.findIndex(img => img.name === file.name && img.size === file.size);
        if (existingIndex !== -1) {
            alert('该图片已上传');
            return;
        }

        // 检查文件大小（限制为10MB）
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert('图片大小不能超过10MB');
            return;
        }

        // 检查图片数量限制（最多10张）
        if (this.uploadedImages.length >= 10) {
            alert('最多只能上传10张图片');
            return;
        }

        // 读取文件
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = {
                file: file,
                dataUrl: e.target.result,
                name: file.name,
                size: file.size,
                id: Date.now() + Math.random() // 唯一ID
            };

            this.uploadedImages.push(imageData);
            this.currentImageIndex = this.uploadedImages.length - 1; // 显示最新上传的图片

            // 更新按钮状态和提示
            this.updateImageUploadButton(this.uploadedImages.length > 0);
            this.updateSendButton();

            // 如果预览正在显示（悬停状态），立即刷新预览内容
            const preview = document.getElementById('image-preview');
            if (preview && preview.classList.contains('show-hover')) {
                this.refreshHoverPreview();
            }
        };
        reader.readAsDataURL(file);
    }

    /**
     * 刷新悬停预览内容（不改变显示状态）
     */
    refreshHoverPreview() {
        const preview = document.getElementById('image-preview');
        if (preview && preview.classList.contains('show-hover')) {
            // 重新生成预览内容
            this.addPreviewControls();
            // 更新标题显示图片数量
            this.updatePreviewTitle();
        }
    }

    /**
     * 切换图片预览显示状态
     */
    toggleImagePreview() {
        const preview = document.getElementById('image-preview');

        if (preview) {
            const isVisible = preview.style.display === 'block';
            const isFixed = preview.classList.contains('fixed');

            if (isVisible && isFixed) {
                this.closeImagePreview();
            } else {
                this.showImagePreview();
            }
        }
    }

    /**
     * 显示图片预览
     */
    showImagePreview() {
        const preview = document.getElementById('image-preview');
        const image = document.getElementById('preview-image');

        if (preview && image && this.uploadedImage) {
            image.src = this.uploadedImage.dataUrl;
            preview.classList.add('fixed');
            preview.classList.remove('show-hover');
        }
    }

    /**
     * 显示悬停预览
     */
    showHoverPreview() {
        const preview = document.getElementById('image-preview');

        if (preview) {
            // 生成预览内容（无论是否有图片都显示）
            this.addPreviewControls();

            // 显示悬停预览 - 只管理CSS类，样式由CSS控制
            preview.classList.add('show-hover');
            preview.classList.remove('fixed');

            // 更新标题显示图片数量
            this.updatePreviewTitle();

        } else {
            console.error('找不到预览元素');
        }
    }

    /**
     * 关闭图片预览
     */
    closeImagePreview() {
        const preview = document.getElementById('image-preview');
        if (preview && preview.classList.contains('fixed')) {
            preview.classList.remove('fixed');
        }
    }

    /**
     * 隐藏悬停预览
     */
    hideHoverPreview() {
        // 清除之前的延迟隐藏定时器
        if (this.hidePreviewTimeout) {
            clearTimeout(this.hidePreviewTimeout);
        }

        // 设置0.3秒延迟隐藏
        this.hidePreviewTimeout = setTimeout(() => {
            const preview = document.getElementById('image-preview');

            // 检查鼠标是否还在预览区域内
            if (preview && !preview.classList.contains('fixed') && !preview.matches(':hover')) {
                preview.classList.remove('show-hover');

            }
        }, 300); // 0.3秒延迟
    }

    /**
     * 更新图片上传按钮状态
     */
    async updateImageUploadButton(hasImage) {
        const uploadBtn = document.getElementById('image-upload');
        if (uploadBtn) {
            // 获取正确的图标路径
            const assetsPath = await window.electronAPI.getAssetsPath();
            const eyeIconSrc = assetsPath + '/icon-eye.svg';
            const imageIconSrc = assetsPath + '/icon-image.svg';

            const btnIcon = uploadBtn.querySelector('.btn-icon');
            if (hasImage) {
                btnIcon.innerHTML = `<img src="file://${eyeIconSrc}" alt="查看图片" width="20" height="20">`;
                uploadBtn.title = `查看图片 (${this.uploadedImages.length}张，悬停预览)`;
            } else {
                btnIcon.innerHTML = `<img src="file://${imageIconSrc}" alt="上传图片" width="20" height="20">`;
                uploadBtn.title = '上传图片';
            }
        }
    }

    /**
     * 更新预览标题
     */
    updatePreviewTitle() {
        const preview = document.getElementById('image-preview');
        if (!preview) return;

        // 更新标题显示图片数量
        const titleElement = preview.querySelector('.preview-title');
        if (titleElement) {
            if (this.uploadedImages.length === 0) {
                titleElement.textContent = '添加图片';
            } else if (this.uploadedImages.length === 1) {
                titleElement.textContent = this.uploadedImages[0].name;
            } else {
                titleElement.textContent = `已上传 ${this.uploadedImages.length} 张图片`;
            }
        }
    }

    /**
     * 根据索引删除图片
     */
    deleteImageByIndex(index) {
        if (index < 0 || index >= this.uploadedImages.length) return;

        const deletedImage = this.uploadedImages.splice(index, 1)[0];

        // 更新所有图片项的索引
        this.updateImageIndices();

        // 如果没有图片了，隐藏预览
        if (this.uploadedImages.length === 0) {
            const preview = document.getElementById('image-preview');
            if (preview) {
                preview.classList.remove('show-hover', 'fixed');

                // 移除动态添加的控件
                const controls = preview.querySelector('.preview-image-list');
                if (controls) {
                    controls.remove();
                }
            }
            this.updateImageUploadButton(false);
            this.updateSendButton();
        } else {
            // 重新生成预览内容
            this.addPreviewControls();
            this.updatePreviewTitle();
            this.updateImageUploadButton(true);
            this.updateSendButton();
        }
    }

    /**
     * 更新图片项的索引属性
     */
    updateImageIndices() {
        const imageItems = document.querySelectorAll('.preview-image-item');
        imageItems.forEach((item, index) => {
            item.setAttribute('data-index', index);
            const deleteBtn = item.querySelector('.preview-item-delete');
            if (deleteBtn) {
                deleteBtn.setAttribute('data-index', index);
            }
        });
    }


    /**
     * 获取当前选中的模型
     */
    getSelectedModel() {
        return this.selectedModel;
    }

    /**
     * 检测是否为单行短消息
     * @param {string} rawContent - 原始消息内容
     * @param {string} renderedHtml - 渲染后的HTML
     * @param {Array} images - 图片数组
     * @returns {boolean} 是否为短消息
     */
    isShortMessage(rawContent, renderedHtml, images) {
        // 如果有图片，不是短消息
        if (images && images.length > 0) {
            return false;
        }

        // 如果包含复杂元素，不是短消息
        if (renderedHtml.includes('<div class="code-block-container">') ||
            renderedHtml.includes('<ul>') ||
            renderedHtml.includes('<ol>') ||
            renderedHtml.includes('<h1>') ||
            renderedHtml.includes('<h2>') ||
            renderedHtml.includes('<h3>')) {
            return false;
        }

        // 如果原始内容包含换行符，不是短消息
        if (rawContent.includes('\n')) {
            return false;
        }

        // 如果内容长度超过30个字符，不是短消息
        if (rawContent.length > 30) {
            return false;
        }

        // 如果渲染后的HTML包含多个<p>标签，不是短消息
        const paragraphCount = (renderedHtml.match(/<p>/g) || []).length;
        if (paragraphCount > 1) {
            return false;
        }

        return true;
    }

    /**
     * 获取上传的图片
     */
    getUploadedImage() {
        return this.uploadedImage;
    }

    /**
     * 清除上传的图片
     */
    clearUploadedImage() {
        this.uploadedImages = [];
        this.currentImageIndex = 0;

        // 清理可能的悬停状态
        const preview = document.getElementById('image-preview');
        if (preview) {
            preview.classList.remove('show-hover', 'fixed');

            // 移除动态添加的控件
            const controls = preview.querySelector('.preview-controls');
            if (controls) {
                controls.remove();
            }
        }

        // 清除延迟隐藏定时器
        if (this.hidePreviewTimeout) {
            clearTimeout(this.hidePreviewTimeout);
            this.hidePreviewTimeout = null;
        }

        this.updateImageUploadButton(false);
        this.updateSendButton();
    }
}

// 创建全局对话管理器实例
let chatManager;

document.addEventListener('DOMContentLoaded', () => {
    chatManager = new ChatManager();
    // 暴露到全局作用域供其他模块使用
    window.chatManager = chatManager;
});

// 导出到全局作用域
window.ChatManager = ChatManager;

