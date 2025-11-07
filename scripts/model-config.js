/**
 * 模型配置管理器
 * 负责加载和管理模型配置
 */
class ModelConfigManager {
    constructor() {
        this.config = null;
        this.models = [];
    }

    /**
     * 加载模型配置
     */
    async loadConfig() {
        try {
            this.config = await window.electronAPI.loadModelConfig();
            this.models = this.config.models.filter(m => m.enabled);
            console.log('✅ 模型配置加载成功:', this.models.length, '个模型');
            return this.config;
        } catch (error) {
            console.error('❌ 加载模型配置失败:', error);
            // 返回默认配置
            return this.getDefaultConfig();
        }
    }

    /**
     * 获取默认配置（回退方案）
     */
    getDefaultConfig() {
        return {
            version: '1.0.0',
            models: [
                {
                    id: 'glm-4-9b',
                    name: 'THUDM/GLM-4-9B-0414',
                    displayName: 'GLM-4-9B',
                    type: 'chat',
                    capabilities: ['text', 'code'],
                    description: '默认对话模型',
                    enabled: true
                },
                {
                    id: 'glm-4v-thinking',
                    name: 'THUDM/GLM-4.1V-9B-Thinking',
                    displayName: 'GLM-4.1V',
                    type: 'visual',
                    capabilities: ['text', 'image', 'code', 'thinking'],
                    description: '视觉思考模型',
                    enabled: true
                }
            ],
            autoDispatch: {
                enabled: false,
                fallback: 'glm-4-9b'
            }
        };
    }

    /**
     * 根据ID获取模型
     */
    getModelById(id) {
        return this.models.find(m => m.id === id);
    }

    /**
     * 根据name获取模型
     */
    getModelByName(name) {
        return this.models.find(m => m.name === name);
    }

    /**
     * 根据类型获取模型列表
     */
    getModelsByType(type) {
        return this.models.filter(m => m.type === type);
    }

    /**
     * 获取所有启用的模型
     */
    getAllModels() {
        return this.models;
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

        // 清空现有选项
        dropdown.innerHTML = '';

        // 生成模型选项
        this.models.forEach(model => {
            const option = document.createElement('div');
            option.className = 'model-option';
            option.setAttribute('data-model', model.name);
            option.setAttribute('data-model-id', model.id);
            option.setAttribute('data-type', model.type);
            
            // 新格式：Type/displayName（首字母大写）
            const typeCapitalized = this.capitalizeType(model.type);
            option.textContent = `${typeCapitalized}/${model.displayName}`;
            
            dropdown.appendChild(option);
        });

        // 绑定点击事件（使用事件委托）
        dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.model-option');
            if (option && window.chatManager) {
                const modelName = option.getAttribute('data-model');
                const modelType = option.getAttribute('data-type');
                window.chatManager.selectModel(modelName, modelType);
            }
        });

        console.log('✅ 模型选择器UI渲染完成');
    }

    /**
     * 将类型首字母大写
     */
    capitalizeType(type) {
        return type.charAt(0).toUpperCase() + type.slice(1);
    }

    /**
     * 获取类型对应的中文名称
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

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    await window.modelConfigManager.loadConfig();
    window.modelConfigManager.renderModelDropdown();
});

