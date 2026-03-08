/**
 * Fast Hardware - 对话管理脚本
 * 处理与AI助手的对话交互
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.isTyping = false;
        this.selectedModel = 'THUDM/GLM-4-9B-0414';
        this.defaultChatModel = 'THUDM/GLM-4-9B-0414'; // 默认对话模型
        this.defaultVisualModel = 'Qwen/Qwen2.5-VL-32B-Instruct'; // 默认视觉模型
        this.uploadedImages = []; // 支持多图上传
        this.currentImageIndex = 0; // 当前显示的图片索引
        this.hidePreviewTimeout = null; // 延迟隐藏定时器
        this.hideActionsTimeout = null; // 消息操作按钮延迟隐藏定时器
        this.isInterrupted = false; // 中断标志
        this.currentUserMessage = null; // 当前用户消息，用于中断恢复
        this.currentAbortController = null; // 用于中断API请求
        this.workflowEngine = null; // 工作流引擎
        this.init();
    }

    /**
     * 初始化对话管理器
     */
    async init() {
        this.bindEvents();
        await this.loadInitialMessages();
        await this.initializeModelDisplay();
        // 初始化工作流引擎
        if (window.CircuitWorkflowEngine) {
            this.workflowEngine = new window.CircuitWorkflowEngine(this);
            console.log('✅ 工作流引擎初始化完成');
        } else {
            console.warn('⚠️ 工作流引擎类未找到，请确保 workflow-circuit.js 已加载');
        }
    }

    /**
     * 初始化模型显示
     */
    async initializeModelDisplay() {
        console.log('🔧 开始初始化模型显示，当前 selectedModel:', this.selectedModel);
        
        // 等待 modelConfigManager 加载完成（对象和数据都要检查）
        if (!window.modelConfigManager || window.modelConfigManager.models.length === 0) {
            console.log('⏳ modelConfigManager 未就绪，等待加载...');
            await this.waitForModelConfig();
        }

        // 设置默认显示的模型
        if (window.modelConfigManager && window.modelConfigManager.models.length > 0) {
            console.log('🔍 尝试获取模型信息:', this.selectedModel);
            const modelInfo = window.modelConfigManager.getModelByName(this.selectedModel);
            console.log('📦 获取到的模型信息:', modelInfo);
            
            if (modelInfo) {
                this.updateModelDisplay(modelInfo);
                console.log('✅ 模型显示初始化完成:', `${modelInfo.type}/${modelInfo.displayName}`);
            } else {
                console.warn('⚠️ 未找到模型信息，保持 HTML 默认显示');
                // 不修改显示，保持 HTML 中的默认值 "Chat/GLM-4-9B"
            }
        } else {
            console.warn('⚠️ modelConfigManager 数据未就绪，保持 HTML 默认显示');
            // 不修改显示，保持 HTML 中的默认值 "Chat/GLM-4-9B"
        }
    }

    /**
     * 等待模型配置加载完成
     */
    async waitForModelConfig(maxWait = 5000) {
        const startTime = Date.now();
        console.log('⏳ 开始等待 modelConfigManager...');
        
        // 等待 modelConfigManager 对象创建
        while (!window.modelConfigManager && (Date.now() - startTime < maxWait)) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!window.modelConfigManager) {
            console.warn('⚠️ modelConfigManager 对象加载超时');
            return;
        }
        console.log('✅ modelConfigManager 对象已创建');
        
        // 等待 models 数据加载完成
        let checkCount = 0;
        while (window.modelConfigManager.models.length === 0 && (Date.now() - startTime < maxWait)) {
            checkCount++;
            if (checkCount % 10 === 0) {
                console.log(`⏳ 等待 models 数据加载... (${checkCount * 50}ms)`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        if (window.modelConfigManager.models.length === 0) {
            console.warn('⚠️ modelConfigManager 数据加载超时，models 数组仍为空');
        } else {
            console.log('✅ modelConfigManager 数据加载完成，共', window.modelConfigManager.models.length, '个模型');
            console.log('📋 模型列表:', window.modelConfigManager.models.map(m => m.name).join(', '));
        }
    }

    /**
     * 更新模型显示
     * @param {Object} modelInfo - 模型信息对象
     * @param {boolean} updateSelection - 是否同时更新选中状态
     */
    updateModelDisplay(modelInfo, updateSelection = true) {
        const modelNameElement = document.getElementById('current-model');
        if (modelNameElement && modelInfo) {
            const typeCapitalized = modelInfo.type.charAt(0).toUpperCase() + modelInfo.type.slice(1);
            const displayText = `${typeCapitalized}/${modelInfo.displayName}`;
            console.log('🎨 更新模型显示:', displayText);
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
                console.log('✅ 设置选中状态:', modelName);
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
        const initialMessage = {
            id: Date.now(),
            type: 'assistant',
            content: '你好！我是Fast Hardware智能助手。我可以帮你进行硬件选型、电路设计和代码生成。请告诉我你想要实现什么功能？',
            timestamp: new Date()
        };

        this.messages.push(initialMessage);
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

        // 🔍 工作流判别：判断是直接回复还是走工作流
        if (this.workflowEngine && (!userMessage.images || userMessage.images.length === 0)) {
            // 只有纯文本消息才进行工作流判别（图片消息直接走普通回复）
            try {
                // 获取对话历史（排除当前消息）
                const conversationHistory = this.messages.slice(0, -1);
                const shouldRun = await this.workflowEngine.shouldRunWorkflow(messageContent, conversationHistory);
                console.log('🔍 工作流判别结果:', shouldRun);
                
                if (shouldRun.shouldRunWorkflow) {
                    // 走工作流
                    await this.runWorkflow(messageContent, userMessage);
                    return;
                }
            } catch (error) {
                console.error('❌ 工作流判别失败，回退到普通回复:', error);
            }
        }

        // 普通回复流程
        this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images);
    }

    /**
     * 中断当前AI回复
     */
    async interruptResponse() {
        if (!this.isTyping) return;

        // 设置中断标志
        this.isInterrupted = true;

        // 中断API请求
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }

        // 隐藏正在输入指示器
        this.hideTypingIndicator();

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

        // 重置状态
        this.isTyping = false;
        this.isInterrupted = false;
        this.currentUserMessage = null;

        // 重新渲染消息
        await this.renderMessages();

        // 更新按钮状态
        this.updateSendButton();
    }

    /**
     * 模拟AI回复
     * @param {string} userMessage - 用户消息
     * @param {string} model - 使用的模型
     * @param {Array} images - 上传的图片信息数组
     */
    async simulateAIResponse(userMessage, model, images) {
        this.isTyping = true;
        this.isInterrupted = false;
        this.showTypingIndicator();

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
                    if (modelInfo && modelInfo.type !== 'visual') {
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
                    if (modelInfo && modelInfo.type !== 'chat' && modelInfo.type !== 'thinking') {
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
            const aiResponse = await this.generateAIResponse(userMessage, currentModel, images);

            // 检查是否被中断
            if (this.isInterrupted) {
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
            this.isTyping = false;
            this.currentAbortController = null;
            this.updateSendButton();
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
     * @returns {Promise<string>} AI回复内容
     */
    async generateAIResponse(userMessage, model, images) {
        try {
            // 构建消息历史
            const messages = [];

            // 添加系统提示
            messages.push({
                role: 'system',
                content: '你是一个专业的硬件开发助手，擅长Arduino、ESP32等嵌入式开发，熟悉各种传感器、执行器和通信模块。你可以帮助用户进行电路设计、元件选型和代码编写。请用markdown格式回复，提供清晰的结构化信息。'
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

            // 调用API
            const result = await window.electronAPI.chatWithAI(messages, model);

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
                    errorMsg += `可能的原因：\n`;
                    errorMsg += `- 图片过大（单张建议 < 5MB）\n`;
                    errorMsg += `- 多图总量过大\n`;
                    errorMsg += `- 请求参数超出限制\n`;
                    errorMsg += `- 服务器暂时过载\n\n`;
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
     * 调用LLM API（供工作流引擎使用）
     * @param {Object} params - API参数 {messages, model, temperature}
     * @returns {Promise<Object>} LLM响应 {content: string}
     */
    async callLLMAPI(params) {
        const { messages, model, temperature = 0.7 } = params;
        
        try {
            const result = await window.electronAPI.chatWithAI(messages, model);
            
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
     * 运行工作流
     * @param {string} userMessage - 用户消息
     * @param {Object} userMessageObj - 用户消息对象
     */
    async runWorkflow(userMessage, userMessageObj) {
        if (!this.workflowEngine) {
            console.error('❌ 工作流引擎未初始化');
            return;
        }

        this.isTyping = true;
        this.showTypingIndicator();

        try {
            // 第一步：方案设计（简明分析 + 元件预估参数）
            const schemeDesignResult = await this.workflowEngine.runSchemeDesign(userMessage);

            if (this.isInterrupted) {
                return;
            }

            this.hideTypingIndicator();

            const formattedContent = this.workflowEngine.formatSchemeDesignForDisplay(schemeDesignResult);

            const aiMessage = {
                id: Date.now(),
                type: 'assistant',
                content: formattedContent,
                isWorkflow: true,
                workflowState: this.workflowEngine.currentWorkflowState,
                timestamp: new Date()
            };

            this.messages.push(aiMessage);
            await this.renderMessages();
            this.scrollToBottom();

            this.bindSchemeDesignButtons(userMessage);

        } catch (error) {
            console.error('❌ 工作流执行失败:', error);
            this.hideTypingIndicator();

            const errorMessage = {
                id: Date.now(),
                type: 'assistant',
                content: `❌ 工作流执行失败：${error.message}`,
                timestamp: new Date()
            };

            this.messages.push(errorMessage);
            await this.renderMessages();
            this.scrollToBottom();
        } finally {
            this.isTyping = false;
        }
    }

    /**
     * 绑定方案设计阶段的「开始匹配」「暂不匹配」按钮
     * @param {string} userMessage - 用户需求原文
     */
    bindSchemeDesignButtons(userMessage) {
        setTimeout(() => {
            const startMatchBtn = document.getElementById('workflow-start-match');
            const skipMatchBtn = document.getElementById('workflow-skip-match');

            if (startMatchBtn) {
                startMatchBtn.addEventListener('click', async () => {
                    await this.runMatchingStage(userMessage);
                });
            }

            if (skipMatchBtn) {
                skipMatchBtn.addEventListener('click', () => {
                    this.handleSkipMatch();
                });
            }
        }, 100);
    }

    /**
     * 用户点击「开始匹配」后执行：带方案设计参考的需求分析与元件匹配
     * @param {string} userMessage - 用户需求原文
     */
    async runMatchingStage(userMessage) {
        const state = this.workflowEngine.currentWorkflowState;
        const schemeDesignResult = state && state.schemeDesignResult ? state.schemeDesignResult : null;

        this.isTyping = true;
        this.showTypingIndicator();

        try {
            const analysisResult = await this.workflowEngine.runRequirementAnalysis(userMessage, schemeDesignResult);

            if (this.isInterrupted) {
                return;
            }

            this.hideTypingIndicator();

            const formattedContent = this.workflowEngine.formatAnalysisResultForDisplay(analysisResult);

            const aiMessage = {
                id: Date.now(),
                type: 'assistant',
                content: formattedContent,
                isWorkflow: true,
                workflowState: this.workflowEngine.currentWorkflowState,
                timestamp: new Date()
            };

            this.messages.push(aiMessage);
            await this.renderMessages();
            this.scrollToBottom();

            this.bindWorkflowButtons(analysisResult);
        } catch (error) {
            console.error('❌ 匹配阶段失败:', error);
            this.hideTypingIndicator();
            const errorMessage = {
                id: Date.now(),
                type: 'assistant',
                content: `❌ 元件匹配失败：${error.message}`,
                timestamp: new Date()
            };
            this.messages.push(errorMessage);
            await this.renderMessages();
            this.scrollToBottom();
        } finally {
            this.isTyping = false;
        }
    }

    /**
     * 用户点击「暂不匹配」：不执行匹配，后续可凭「检查缺什么元件」等再次发起匹配
     */
    handleSkipMatch() {
        const msg = '已暂不匹配。如需匹配元件库，可说「开始匹配」或「检查缺什么元件」';
        if (typeof this.showNotification === 'function') {
            this.showNotification(msg);
        } else if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'info');
        }
    }

    /**
     * 绑定工作流按钮事件
     * @param {Object} analysisResult - 分析结果
     */
    bindWorkflowButtons(analysisResult) {
        // 延迟绑定，确保DOM已渲染
        setTimeout(() => {
            const autoCompleteBtn = document.getElementById('workflow-auto-complete');
            const manualCompleteBtn = document.getElementById('workflow-manual-complete');

            if (autoCompleteBtn) {
                autoCompleteBtn.addEventListener('click', async () => {
                    await this.handleAutoComplete(analysisResult);
                });
            }

            if (manualCompleteBtn) {
                manualCompleteBtn.addEventListener('click', () => {
                    this.handleManualComplete();
                });
            }
        }, 100);
    }

    /**
     * 处理自动补全
     * @param {Object} analysisResult - 分析结果
     */
    async handleAutoComplete(analysisResult) {
        const missingComponents = analysisResult.components.filter(c => c.exists === 0);
        
        if (missingComponents.length === 0) {
            return;
        }

        this.isTyping = true;
        this.showTypingIndicator();

        try {
            // 调用工作流引擎的自动补全方法
            const createdComponents = await this.workflowEngine.autoCompleteComponents(missingComponents);

            // 更新工作流状态
            if (this.workflowEngine.currentWorkflowState) {
                // 更新匹配结果，将创建的元件标记为已存在
                createdComponents.forEach(created => {
                    const comp = this.workflowEngine.currentWorkflowState.analysisResult.components.find(
                        c => c.name === created.name
                    );
                    if (comp) {
                        comp.exists = 1;
                        comp.matchedKey = created.componentKey;
                    }
                });
            }

            this.hideTypingIndicator();

            // 显示成功消息
            const successMessage = {
                id: Date.now(),
                type: 'assistant',
                content: `✅ 已为 ${createdComponents.length} 个缺失元件自动创建占位元件，存放于系统元件库的 custom 目录。\n\n现在可以继续下一步：元件生成与整理。`,
                timestamp: new Date()
            };

            this.messages.push(successMessage);
            await this.renderMessages();
            this.scrollToBottom();

            // TODO: 进入下一阶段（元件生成与整理）

        } catch (error) {
            console.error('❌ 自动补全失败:', error);
            this.hideTypingIndicator();

            const errorMessage = {
                id: Date.now(),
                type: 'assistant',
                content: `❌ 自动补全失败：${error.message}`,
                timestamp: new Date()
            };

            this.messages.push(errorMessage);
            await this.renderMessages();
            this.scrollToBottom();
        } finally {
            this.isTyping = false;
        }
    }

    /**
     * 处理手动补全
     */
    handleManualComplete() {
        const message = {
            id: Date.now(),
            type: 'assistant',
            content: '✋ 已切换为手动补全模式。请在元件库中创建或导入缺失元件，然后重新发起电路设计需求。',
            timestamp: new Date()
        };

        this.messages.push(message);
        this.renderMessages();
        this.scrollToBottom();

        // 结束工作流
        if (this.workflowEngine) {
            this.workflowEngine.currentWorkflowState = null;
        }
    }

    /**
     * 显示正在输入指示器
     */
    async showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        // 获取正确的图标路径
        const assetsPath = await window.electronAPI.getAssetsPath();
        const botIconSrc = assetsPath + '/icon-bot.svg';

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar"><img src="file://${botIconSrc}" alt="AI" width="20" height="20"></div>
                <div class="message-time">正在输入...</div>
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
     * 隐藏正在输入指示器
     */
    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
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
        // 清理开头和结尾的多余换行符
        let processedText = text.trim();

        // 存储代码块的数组
        const codeBlocks = [];

        // 第一步：提取所有代码块，用占位符替换
        processedText = processedText.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'text';
            const codeId = 'code-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            // 只转义HTML特殊字符，保留换行符
            const formattedCode = code.trim()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            // 动态设置复制按钮图标路径
            const codeBlockHtml = `<div class="code-block-container"><div class="code-block-header"><span class="code-language">${lang}</span><button class="code-copy-btn" data-code-id="${codeId}" title="复制代码"><img src="" alt="复制" width="14" height="14" data-icon="copy"></button></div><pre class="code-block"><code id="${codeId}">${formattedCode}</code></pre></div>`;

            // 存储代码块
            codeBlocks.push(codeBlockHtml);
            // 返回占位符
            return `{{{CODE_BLOCK_${codeBlocks.length - 1}}}}`;
        });

        // 第二步：使用marked渲染剩余的markdown文本
        let result = marked.parse(processedText);

        // 第三步：将代码块插入到渲染后的文本中
        for (let i = 0; i < codeBlocks.length; i++) {
            result = result.replace(`{{{CODE_BLOCK_${i}}}}`, codeBlocks[i]);
        }

        return result;
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

        // 对于工作流消息，如果内容已经是HTML，直接使用；否则进行markdown渲染
        let contentHtml;
        if (message.isWorkflow && message.content.trim().startsWith('<div')) {
            // 工作流消息，内容已经是HTML格式，直接使用
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
        const userActionsHtml = message.type === 'user' ? `
            <div class="message-actions">
                <button class="message-action-btn edit-btn" title="编辑消息" data-message-id="${message.id}">
                    <img src="file://${editIconSrc}" alt="编辑" width="16" height="16">
                </button>
                <button class="message-action-btn resend-btn" title="重新发送" data-message-id="${message.id}">
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

        // 设置代码块中图标的正确路径
        const codeBlockIcons = messageDiv.querySelectorAll('.code-copy-btn img[data-icon]');
        codeBlockIcons.forEach(icon => {
            const iconName = `icon-${icon.dataset.icon}.svg`;
            icon.src = `file://${assetsPath}/${iconName}`;
        });

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
            sendBtn.classList.add('interrupt-available');
            sendBtn.title = '点击中断AI回复';
            return;
        }

        // 正常状态
        sendBtn.classList.remove('interrupt-available');
        const canSend = (hasContent || hasImage);
        sendBtn.disabled = !canSend;
        sendBtn.style.opacity = canSend ? '1' : '0.5';
        sendBtn.title = canSend ? '发送消息' : '请输入消息内容';
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

        // 🔍 工作流判别：判断是直接回复还是走工作流（与sendMessage保持一致）
        if (this.workflowEngine && (!userMessage.images || userMessage.images.length === 0)) {
            // 只有纯文本消息才进行工作流判别（图片消息直接走普通回复）
            try {
                // 获取对话历史（排除当前消息）
                const conversationHistory = this.messages.slice(0, -1);
                const shouldRun = await this.workflowEngine.shouldRunWorkflow(message.content, conversationHistory);
                console.log('🔍 重新发送 - 工作流判别结果:', shouldRun);
                
                if (shouldRun.shouldRunWorkflow) {
                    // 走工作流
                    await this.runWorkflow(message.content, userMessage);
                    console.log(`🔄 重新发送消息 ID: ${messageId}`);
                    return;
                }
            } catch (error) {
                console.error('❌ 重新发送 - 工作流判别失败，回退到普通回复:', error);
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
window.chatManager = chatManager;



