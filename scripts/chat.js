/**
 * Fast Hardware - 对话管理脚本
 * 处理与AI助手的对话交互
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.isTyping = false;
        this.selectedModel = 'THUDM/GLM-4-9B-0414';
        this.uploadedImages = []; // 支持多图上传
        this.currentImageIndex = 0; // 当前显示的图片索引
        this.hidePreviewTimeout = null; // 延迟隐藏定时器
        this.isInterrupted = false; // 中断标志
        this.currentUserMessage = null; // 当前用户消息，用于中断恢复
        this.currentAbortController = null; // 用于中断API请求
        this.init();
    }

    /**
     * 初始化对话管理器
     */
    init() {
        this.bindEvents();
        this.loadInitialMessages();
        this.initializeModelDisplay();
    }

    /**
     * 初始化模型显示
     */
    initializeModelDisplay() {
        // 设置默认显示的模型
        const modelNameElement = document.getElementById('current-model');
        if (modelNameElement) {
            modelNameElement.textContent = this.selectedModel;

            // 设置对应的描述
            const defaultOption = document.querySelector(`.model-option[data-model="${this.selectedModel}"]`);
            if (defaultOption) {
                const description = defaultOption.getAttribute('data-desc');
                modelNameElement.title = description;
            }
        }
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
        const modelOptions = document.querySelectorAll('.model-option');

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

        // 模型选项点击事件
        modelOptions.forEach(option => {
            option.addEventListener('click', () => {
                const model = option.getAttribute('data-model');
                const desc = option.getAttribute('data-desc');
                this.selectModel(model, desc);
            });
        });

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
    loadInitialMessages() {
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
    sendMessage() {
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
        this.renderMessages();
        input.value = '';

        // 清除上传的图片
        if (this.uploadedImages.length > 0) {
            this.clearUploadedImage();
        }

        // 滚动到底部
        this.scrollToBottom();

        // 开始AI回复（传入模型信息和多图）
        this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images);
    }

    /**
     * 中断当前AI回复
     */
    interruptResponse() {
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
        this.renderMessages();

        // 更新按钮状态
        this.updateSendButton();
    }

    /**
     * 模拟AI回复
     * @param {string} userMessage - 用户消息
     * @param {string} model - 使用的模型
     * @param {Object} image - 上传的图片信息
     */
    async simulateAIResponse(userMessage, model, image) {
        this.isTyping = true;
        this.isInterrupted = false;
        this.showTypingIndicator();

        // 立即更新按钮状态为中断模式
        this.updateSendButton();

        // 创建AbortController用于中断请求
        this.currentAbortController = new AbortController();

        try {
            const currentModel = document.getElementById('current-model')?.textContent || 'THUDM/GLM-4-9B-0414';
            const aiResponse = await this.generateAIResponse(userMessage, currentModel, image);

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
            this.renderMessages();
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
            this.renderMessages();
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
     * @param {Object} image - 上传的图片信息
     * @returns {Promise<string>} AI回复内容
     */
    async generateAIResponse(userMessage, model, image) {
        try {
            // 构建消息历史
            const messages = [];

            // 添加系统提示
            messages.push({
                role: 'system',
                content: '你是一个专业的硬件开发助手，擅长Arduino、ESP32等嵌入式开发，熟悉各种传感器、执行器和通信模块。你可以帮助用户进行电路设计、元件选型和代码编写。请用markdown格式回复，提供清晰的结构化信息。'
            });

            // 添加历史消息（最近几条）
            const recentMessages = this.messages.slice(-10); // 最近10条消息
            for (const msg of recentMessages) {
                if (msg.type === 'user') {
                    messages.push({
                        role: 'user',
                        content: msg.content
                    });
                } else if (msg.type === 'assistant') {
                    messages.push({
                        role: 'assistant',
                        content: msg.content
                    });
                }
            }

            // 如果有图片，添加到用户消息中
            if (image && image.name) {
                const userContent = `${userMessage}\n\n[上传了图片: ${image.name} (${Math.round(image.size / 1024)}KB)]`;

                messages.push({
                    role: 'user',
                    content: userContent
                });
            } else {
                // 添加当前用户消息
                messages.push({
                    role: 'user',
                    content: userMessage
                });
            }

            // 调用API
            const result = await window.electronAPI.chatWithAI(messages, model);

            if (result.success) {
                console.log('✅ AI回复成功获取，长度:', result.content.length);
                return result.content;
            } else {
                console.error('❌ AI API调用失败:', result.error);
                return `🤖 抱歉，AI服务暂时不可用。\n\n错误信息: ${result.error}\n\n请检查API密钥配置或稍后重试。`;
            }

        } catch (error) {
            console.error('❌ 生成AI回复失败:', error);
            return '🤖 抱歉，发生了网络错误，请稍后重试。';
        }
    }

    /**
     * 显示正在输入指示器
     */
    showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar"><img src="assets/icon-bot.svg" alt="AI" width="20" height="20"></div>
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
    renderMessages() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        // 清空容器，保留正在输入指示器
        const typingIndicator = document.getElementById('typing-indicator');
        messagesContainer.innerHTML = '';

        // 重新添加消息
        this.messages.forEach(message => {
            const messageDiv = this.createMessageElement(message);
            messagesContainer.appendChild(messageDiv);
        });

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

            const codeBlockHtml = `<div class="code-block-container"><div class="code-block-header"><span class="code-language">${lang}</span><button class="code-copy-btn" data-code-id="${codeId}" title="复制代码"><img src="assets/icon-copy.svg" alt="复制" width="14" height="14"></button></div><pre class="code-block"><code id="${codeId}">${formattedCode}</code></pre></div>`;

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
    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}-message`;

        const timeString = message.timestamp.toLocaleString([], {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let contentHtml = this.renderMarkdown(message.content);

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

        messageDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">${message.type === 'user' ? '<img src="assets/icon-user.svg" alt="用户" width="20" height="20">' : '<img src="assets/icon-bot.svg" alt="AI" width="20" height="20">'}</div>
                <div class="message-time">${timeString}</div>
            </div>
            <div class="message-content${isShortMessage ? ' short-message' : ''}">
                ${contentHtml}
            </div>
        `;

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

        // 代码块中的复制按钮已经使用本地SVG，不需要额外初始化

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
    clearChat() {
        if (confirm('确定要清空所有对话记录吗？')) {
            this.messages = [];
            this.renderMessages();
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
     */
    selectModel(model, description) {
        this.selectedModel = model;

        // 更新UI显示
        const modelNameElement = document.getElementById('current-model');
        if (modelNameElement) {
            modelNameElement.textContent = model;
            modelNameElement.title = description;
        }

        // 更新选中状态
        const modelOptions = document.querySelectorAll('.model-option');
        modelOptions.forEach(option => {
            if (option.getAttribute('data-model') === model) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });

        // 关闭下拉菜单
        this.closeModelDropdown();

        console.log(`已选择AI模型: ${model} (${description})`);
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
        };
        reader.readAsDataURL(file);
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
    updateImageUploadButton(hasImage) {
        const uploadBtn = document.getElementById('image-upload');
        if (uploadBtn) {
            if (hasImage) {
                uploadBtn.querySelector('.btn-icon').textContent = '👁️';
                uploadBtn.title = `查看图片 (${this.uploadedImages.length}张，悬停预览)`;
            } else {
                uploadBtn.querySelector('.btn-icon').textContent = '🖼️';
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
});

// 导出到全局作用域
window.ChatManager = ChatManager;
window.chatManager = chatManager;
