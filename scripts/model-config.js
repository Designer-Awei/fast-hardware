/**
 * 模型配置管理器
 * 负责加载和管理模型配置
 */
class ModelConfigManager {
    constructor() {
        this.config = null;
        this.models = [];
        this.syncStatus = {
            source: 'builtin',
            fetchedAt: null,
            error: null,
            modelCount: 0
        };
        this.isRefreshing = false;
        this.dropdownBound = false;
        this.activeType = 'chat';
    }

    /**
     * 加载模型配置
     * @param {boolean} [forceRefresh=false] - 是否强制刷新在线模型列表
     */
    async loadConfig(forceRefresh = false) {
        try {
            if (forceRefresh && window.electronAPI?.refreshModelList) {
                this.config = await window.electronAPI.refreshModelList();
            } else if (window.electronAPI?.loadResolvedModelConfig) {
                this.config = await window.electronAPI.loadResolvedModelConfig();
            } else {
                this.config = await window.electronAPI.loadModelConfig();
            }

            if (!this.config || !Array.isArray(this.config.models)) {
                throw new Error('模型配置格式无效');
            }

            this.models = this.config.models
                .filter(model => model.enabled !== false)
                .sort((a, b) => {
                    const scoreA = Number.isFinite(a.score) ? a.score : 0;
                    const scoreB = Number.isFinite(b.score) ? b.score : 0;
                    return scoreB - scoreA;
                });
            await this.loadSyncStatus();
            console.debug('✅ 模型配置加载成功:', this.models.length, '个模型');
            this.notifyConfigUpdated();
            return this.config;
        } catch (error) {
            console.error('❌ 加载模型配置失败:', error);
            this.config = this.getDefaultConfig();
            this.models = this.config.models.filter(model => model.enabled !== false);
            this.syncStatus = {
                source: 'builtin',
                fetchedAt: null,
                error: error.message,
                modelCount: this.models.length
            };
            this.notifyConfigUpdated();
            return this.config;
        }
    }

    /**
     * 获取默认配置（回退方案）
     */
    getDefaultConfig() {
        return {
            version: '2.0.0',
            source: 'builtin',
            fetchedAt: null,
            defaults: {
                chat: 'Qwen/Qwen3.5-27B',
                thinking: 'Qwen/Qwen3-8B',
                visual: 'Qwen/Qwen2.5-VL-32B-Instruct'
            },
            models: [
                {
                    id: 'qwen3.5-27b',
                    name: 'Qwen/Qwen3.5-27B',
                    displayName: 'Qwen3.5-27B',
                    providerType: 'text',
                    appType: 'chat',
                    type: 'chat',
                    capabilities: ['text', 'code', 'long_context'],
                    description: '默认对话模型',
                    enabled: true,
                    costLevel: 'medium',
                    score: 100
                },
                {
                    id: 'glm-4-9b',
                    name: 'THUDM/GLM-4-9B-0414',
                    displayName: 'GLM-4-9B',
                    providerType: 'text',
                    appType: 'chat',
                    type: 'chat',
                    capabilities: ['text', 'code'],
                    description: '备选小尺寸对话模型',
                    enabled: true,
                    costLevel: 'low',
                    score: 72
                },
                {
                    id: 'qwen3-8b',
                    name: 'Qwen/Qwen3-8B',
                    displayName: 'Qwen3-8B',
                    providerType: 'text',
                    appType: 'thinking',
                    type: 'thinking',
                    capabilities: ['text', 'code', 'thinking'],
                    description: '默认思考模型',
                    enabled: true,
                    costLevel: 'low',
                    score: 96
                },
                {
                    id: 'glm-4v-thinking',
                    name: 'THUDM/GLM-4.1V-9B-Thinking',
                    displayName: 'GLM-4.1V',
                    providerType: 'text',
                    appType: 'visual',
                    type: 'visual',
                    capabilities: ['text', 'image', 'code', 'thinking'],
                    description: '视觉思考模型',
                    enabled: true,
                    costLevel: 'medium',
                    score: 92
                },
                {
                    id: 'qwen-vl',
                    name: 'Qwen/Qwen2.5-VL-32B-Instruct',
                    displayName: 'Qwen2.5-VL-32B',
                    providerType: 'text',
                    appType: 'visual',
                    type: 'visual',
                    capabilities: ['text', 'image', 'long_context'],
                    description: '默认视觉模型',
                    enabled: true,
                    costLevel: 'high',
                    score: 90
                }
            ]
        };
    }

    /**
     * 读取同步状态
     */
    async loadSyncStatus() {
        try {
            if (window.electronAPI?.getModelSyncStatus) {
                const syncStatus = await window.electronAPI.getModelSyncStatus();
                if (syncStatus) {
                    this.syncStatus = {
                        ...this.syncStatus,
                        ...syncStatus,
                        modelCount: this.models.length
                    };
                    return;
                }
            }
        } catch (error) {
            console.warn('⚠️ 获取模型同步状态失败:', error.message);
        }

        this.syncStatus = {
            source: this.config?.source || 'builtin',
            fetchedAt: this.config?.fetchedAt || null,
            error: null,
            modelCount: this.models.length
        };
    }

    /**
     * 根据ID获取模型
     * @param {string} id - 模型ID
     */
    getModelById(id) {
        return this.models.find(model => model.id === id);
    }

    /**
     * 根据name获取模型
     * @param {string} name - 模型名称
     */
    getModelByName(name) {
        return this.models.find(model => model.name === name);
    }

    /**
     * 根据类型获取模型列表
     * @param {string} type - 模型业务类型
     */
    getModelsByType(type) {
        return this.models.filter(model => (model.appType || model.type) === type);
    }

    /**
     * 按服务商对模型分组
     * @param {Array<Object>} models - 模型列表
     * @returns {Array<{provider: string, models: Array<Object>}>} 服务商分组结果
     */
    groupModelsByProvider(models) {
        const grouped = new Map();
        models.forEach((model) => {
            const provider = model.providerGroup || '未知';
            if (!grouped.has(provider)) {
                grouped.set(provider, []);
            }
            grouped.get(provider).push(model);
        });

        return Array.from(grouped.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }))
            .map(([provider, providerModels]) => ({
                provider,
                models: providerModels
            }));
    }

    /**
     * 获取所有启用的模型
     */
    getAllModels() {
        return this.models;
    }

    /**
     * 获取默认模型
     * @param {string} type - 模型业务类型
     * @returns {Object|null} 默认模型
     */
    getDefaultModel(type) {
        const preferredName = this.config?.defaults?.[type];
        const preferredModel = preferredName ? this.getModelByName(preferredName) : null;
        return preferredModel || this.getModelsByType(type)[0] || null;
    }

    /**
     * 获取首选模型名称（优先使用本地偏好，其次使用默认配置）
     * @param {string} type - 模型业务类型
     * @returns {string|null} 首选模型名称
     */
    getPreferredModelName(type) {
        try {
            const key = `fastHardwarePreferredModel_${type}`;
            const stored = window.localStorage?.getItem(key);
            if (stored && this.getModelByName(stored)) {
                return stored;
            }
        } catch (error) {
            console.warn('⚠️ 读取本地模型偏好失败:', error.message);
        }

        const defaultModel = this.getDefaultModel(type);
        return defaultModel?.name || null;
    }

    /**
     * 获取类型首字母大写标签
     * @param {string} type - 模型业务类型
     * @returns {string} 显示标签
     */
    getTypeDisplay(type) {
        const safeType = type || 'chat';
        return safeType.charAt(0).toUpperCase() + safeType.slice(1);
    }

    /**
     * 格式化价格等级标签
     * @param {string} costLevel - 价格等级
     * @returns {string} 价格等级文案
     */
    getCostLabel(costLevel) {
        const labels = {
            free: '免费',
            low: '低价',
            medium: '中价',
            high: '高价',
            unknown: '未知'
        };
        return labels[costLevel] || '未知';
    }

    /**
     * 获取模型价格文案
     * @param {Object} model - 模型信息
     * @returns {string} 价格文案
     */
    getPricingText(model) {
        const pricing = model?.pricing;
        if (!pricing) {
            return '未知';
        }

        const inputPrice = Number.isFinite(pricing.inputPerMillion) ? pricing.inputPerMillion : null;
        const outputPrice = Number.isFinite(pricing.outputPerMillion) ? pricing.outputPerMillion : null;
        if (inputPrice === null || outputPrice === null) {
            return '未知';
        }

        const currencySymbol = pricing.currency === 'USD' ? '$' : '¥';
        if (inputPrice === 0 && outputPrice === 0) {
            return '免费';
        }

        return `输入 ${currencySymbol}${inputPrice}/1M · 输出 ${currencySymbol}${outputPrice}/1M`;
    }

    /**
     * 获取模型类型标签
     * @param {string} type - 模型业务类型
     * @returns {string} 类型标签
     */
    getTypeBadgeLabel(type) {
        return this.getTypeLabel(type);
    }

    /**
     * 获取同步来源文案
     * @param {string} source - 同步来源
     * @returns {string} 来源文案
     */
    getSourceLabel(source) {
        const sourceLabels = {
            remote: '在线列表',
            cache: '缓存列表',
            builtin: '内置列表'
        };
        return sourceLabels[source] || '未知来源';
    }

    /**
     * 获取同步状态文案
     * @returns {string} 状态文案
     */
    getSyncStatusText() {
        const sourceLabel = this.getSourceLabel(this.syncStatus.source);
        const modelCount = this.syncStatus.modelCount || this.models.length;
        if (this.syncStatus.source === 'remote') {
            return `${sourceLabel} · ${modelCount} 个模型`;
        }

        if (this.syncStatus.source === 'cache') {
            return `${sourceLabel} · ${modelCount} 个模型`;
        }

        return `${sourceLabel} · ${modelCount} 个模型`;
    }

    /**
     * 获取同步时间文案
     * @returns {string} 同步时间文案
     */
    getSyncTimeText() {
        if (!this.syncStatus.fetchedAt) {
            return this.syncStatus.error || '当前未获取到在线模型时间';
        }

        const date = new Date(this.syncStatus.fetchedAt);
        if (Number.isNaN(date.getTime())) {
            return this.syncStatus.error || '同步时间不可用';
        }

        return `更新于 ${date.toLocaleString()}`;
    }

    /**
     * 触发模型配置更新事件
     */
    notifyConfigUpdated() {
        document.dispatchEvent(new CustomEvent('model-config-updated', {
            detail: {
                config: this.config,
                models: this.models,
                syncStatus: this.syncStatus
            }
        }));
    }

    /**
     * 渲染模型选择器UI
     */
    renderModelDropdown() {
        const dropdown = document.getElementById('model-dropdown');
        if (!dropdown) {
            console.error('❌ 找不到模型选择器容器');
            return;
        }

        dropdown.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'model-dropdown-header';
        header.innerHTML = `
            <div class="model-sync-meta">
                <span class="model-sync-source">${this.getSyncStatusText()}</span>
                <span class="model-sync-time">${this.getSyncTimeText()}</span>
            </div>
            <button class="model-refresh-btn" type="button" data-action="refresh-models">
                ${this.isRefreshing ? '刷新中...' : '刷新'}
            </button>
        `;
        dropdown.appendChild(header);

        const typeOrder = ['chat', 'thinking', 'visual'];
        const tabs = document.createElement('div');
        tabs.className = 'model-type-tabs';
        tabs.innerHTML = typeOrder.map((type) => {
            const isActive = type === this.activeType;
            return `<button class="model-type-tab${isActive ? ' active' : ''}" data-type="${type}">${this.getTypeLabel(type)}模型</button>`;
        }).join('');
        dropdown.appendChild(tabs);

        const body = document.createElement('div');
        body.className = 'model-dropdown-body';
        dropdown.appendChild(body);

        typeOrder.forEach((type) => {
            if (type !== this.activeType) {
                return;
            }
            const typeModels = this.getModelsByType(type);
            if (typeModels.length === 0) {
                return;
            }

            const group = document.createElement('div');
            group.className = 'model-group';

            const preferredName = this.getPreferredModelName(type);
            const sortedTypeModels = [...typeModels].sort((a, b) => {
                if (a.name === preferredName && b.name !== preferredName) {
                    return -1;
                }
                if (b.name === preferredName && a.name !== preferredName) {
                    return 1;
                }
                return 0;
            });

            sortedTypeModels.forEach((model) => {
                const option = document.createElement('div');
                option.className = 'model-option';
                option.setAttribute('data-model', model.name);
                option.setAttribute('data-model-id', model.id);
                option.setAttribute('data-type', model.appType || model.type);
                if (model.name === preferredName) {
                    option.classList.add('preferred');
                }
                if (window.chatManager?.selectedModel === model.name) {
                    option.classList.add('selected');
                }
                option.innerHTML = `
                    <div class="model-option-main">
                        <span class="model-option-title">${model.displayName}</span>
                    </div>
                    ${this.getPricingText(model) === '未知'
                        ? `<span class="model-price">计费规则：参考官网 <a class="model-price-link" href="https://cloud.siliconflow.cn/me/models" target="_blank" rel="noreferrer">模型页</a></span>`
                        : `<span class="model-price">计费规则：${this.getPricingText(model)}</span>`
                    }
                `;
                group.appendChild(option);
            });

            body.appendChild(group);
        });

        if (!this.dropdownBound) {
            dropdown.addEventListener('click', (event) => {
                const typeTab = event.target.closest('.model-type-tab');
                if (typeTab) {
                    event.preventDefault();
                    event.stopPropagation();
                    const newType = typeTab.getAttribute('data-type');
                    if (newType && newType !== this.activeType) {
                        this.activeType = newType;
                        this.renderModelDropdown();
                        dropdown.classList.add('active');
                    }
                    return;
                }

                const refreshButton = event.target.closest('[data-action="refresh-models"]');
                if (refreshButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.refreshConfig();
                    return;
                }

                const priceLink = event.target.closest('.model-price-link');
                if (priceLink) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(priceLink.href);
                    } else {
                        window.open(priceLink.href, '_blank');
                    }
                    return;
                }

                const option = event.target.closest('.model-option');
                if (option && window.chatManager) {
                    const modelName = option.getAttribute('data-model');
                    const modelType = option.getAttribute('data-type');
                    window.chatManager.selectModel(modelName, modelType);
                }
            });
            this.dropdownBound = true;
        }

        if (window.chatManager?.selectedModel) {
            window.chatManager.updateModelSelection(window.chatManager.selectedModel);
        }

        console.debug('✅ 模型选择器UI渲染完成');
    }

    /**
     * 刷新模型配置
     */
    async refreshConfig() {
        if (this.isRefreshing) {
            return;
        }

        const dropdown = document.getElementById('model-dropdown');
        this.isRefreshing = true;
        this.renderModelDropdown();
        dropdown?.classList.add('active');

        try {
            await this.loadConfig(true);
            this.renderModelDropdown();
            dropdown?.classList.add('active');
            if (window.showNotification) {
                window.showNotification(`模型列表已刷新，当前显示 ${this.models.length} 个模型`, 'success');
            }
        } catch (error) {
            console.error('❌ 刷新模型列表失败:', error);
            dropdown?.classList.add('active');
            if (window.showNotification) {
                window.showNotification('模型列表刷新失败，已保留当前结果', 'error');
            }
        } finally {
            this.isRefreshing = false;
            this.renderModelDropdown();
            dropdown?.classList.add('active');
        }
    }

    /**
     * 获取类型对应的中文名称
     * @param {string} type - 模型业务类型
     */
    getTypeLabel(type) {
        const typeLabels = {
            'chat': '对话',
            'thinking': '思考',
            'visual': '视觉',
            'audio': '音频',
            'multi': '多模态'
        };
        return typeLabels[type] || type;
    }
}

// 创建全局实例
window.modelConfigManager = new ModelConfigManager();

/**
 * 首次完成模型列表 loadConfig + 下拉渲染，供 {@link ChatManager} 等在 init 时 await，避免与 `initializeModelDisplay` 竞态。
 * @type {Promise<void>}
 */
window.whenModelConfigLoaded = (async () => {
    if (document.readyState === 'loading') {
        await new Promise((resolve) => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }
    await window.modelConfigManager.loadConfig();
    window.modelConfigManager.renderModelDropdown();
})();

