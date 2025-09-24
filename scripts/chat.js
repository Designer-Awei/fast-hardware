/**
 * Fast Hardware - 对话管理脚本
 * 处理与AI助手的对话交互
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.isTyping = false;
        this.selectedModel = 'THUDM/GLM-4.1V-9B-Thinking';
        this.uploadedImages = []; // 支持多图上传
        this.currentImageIndex = 0; // 当前显示的图片索引
        this.hidePreviewTimeout = null; // 延迟隐藏定时器
        this.init();
    }

    /**
     * 初始化对话管理器
     */
    init() {
        this.bindEvents();
        this.loadInitialMessages();
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
            console.log('找到图片上传按钮，设置事件监听器');
            imageUploadBtn.addEventListener('click', () => this.handleImageUpload());

            // 添加鼠标悬停事件（总是显示预览，包含添加图片区域）
            imageUploadBtn.addEventListener('mouseenter', () => {
                console.log('鼠标进入图片上传按钮');
                this.showHoverPreview();
            });

            imageUploadBtn.addEventListener('mouseleave', () => {
                console.log('鼠标离开图片上传按钮');
                this.hideHoverPreview();
            });
        } else {
            console.error('找不到图片上传按钮 image-upload');
        }

        // 图片预览事件
        if (imagePreview) {
            // 鼠标进入预览区域时取消隐藏
            imagePreview.addEventListener('mouseenter', () => {
                console.log('鼠标进入预览浮窗');
                if (this.hidePreviewTimeout) {
                    clearTimeout(this.hidePreviewTimeout);
                    this.hidePreviewTimeout = null;
                    console.log('取消预览隐藏定时器');
                }
            });

            // 鼠标离开预览区域时延迟隐藏
            imagePreview.addEventListener('mouseleave', () => {
                console.log('鼠标离开预览浮窗');
                this.hideHoverPreview();
            });

            // 添加导航和删除按钮的事件监听器
            this.addPreviewControls();
        }

        // 图片预览关闭事件
        if (previewClose) {
            previewClose.addEventListener('click', () => this.clearUploadedImage());
        }
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
        if (!content && this.uploadedImages.length === 0 || this.isTyping) return;

        // 构建消息内容
        let messageContent = content;
        if (this.uploadedImages.length > 0) {
            const imageDesc = this.uploadedImages.length === 1 ? '[图片]' : `[${this.uploadedImages.length}张图片]`;
            messageContent = messageContent || imageDesc;
        }

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
        this.updateSendButton();

        // 清除上传的图片
        if (this.uploadedImages.length > 0) {
            this.clearUploadedImage();
        }

        // 滚动到底部
        this.scrollToBottom();

        // 模拟AI回复（传入模型信息和多图）
        this.simulateAIResponse(messageContent, this.selectedModel, userMessage.images);
    }

    /**
     * 模拟AI回复
     * @param {string} userMessage - 用户消息
     * @param {string} model - 使用的模型
     * @param {Object} image - 上传的图片信息
     */
    simulateAIResponse(userMessage, model, image) {
        this.isTyping = true;
        this.showTypingIndicator();

        // 模拟网络延迟
        setTimeout(() => {
            const currentModel = document.getElementById('current-model')?.textContent || 'THUDM/GLM-4.1V-9B-Thinking';
            const aiResponse = this.generateAIResponse(userMessage, currentModel, image);
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
            this.isTyping = false;
        }, 1000 + Math.random() * 2000); // 1-3秒的随机延迟
    }

    /**
     * 生成AI回复
     * @param {string} userMessage - 用户消息
     * @param {string} model - 使用的模型
     * @param {Object} image - 上传的图片信息
     * @returns {string} AI回复内容
     */
    generateAIResponse(userMessage, model, image) {
        let response = '🤖 AI助手回复：';

        // 处理图片信息
        if (image) {
            response += `\n📸 我已经收到了你上传的图片 "${image.name}" (${Math.round(image.size / 1024)}KB)。`;
        }

        // 生成基础回复
        const baseResponses = [
            '\n\n我理解你的需求。根据你的描述，我建议使用Arduino Uno作为主控板，这样可以快速实现你的想法。',
            '\n\n这是一个很有趣的项目！我可以帮你设计电路图。首先，你需要准备以下元件：Arduino开发板、LED灯、220Ω电阻。',
            '\n\n让我分析一下你的需求... 基于你的描述，这是一个典型的数字电路项目。我会为你推荐最合适的硬件配置。',
            '\n\n好的，我来帮你规划这个项目。首先，我们需要确定功能需求，然后选择合适的硬件元件，最后设计电路连接。',
            '\n\n这是一个很好的硬件项目想法！我可以提供完整的解决方案，包括电路图设计和Arduino代码生成。'
        ];

        response += baseResponses[Math.floor(Math.random() * baseResponses.length)];

        // 如果有图片，添加图片相关回复
        if (image) {
            response += '\n\n关于你上传的图片，我会将其纳入电路设计分析中，为你提供更精准的建议。';
        }

        return response;
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
            <div class="message-avatar"><img src="assets/icon-bot.svg" alt="AI" width="20" height="20"></div>
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
     * 创建消息元素
     * @param {Object} message - 消息对象
     * @returns {HTMLElement} 消息元素
     */
    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}-message`;

        const timeString = message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        let contentHtml = `<p>${this.formatMessage(message.content)}</p>`;

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

        messageDiv.innerHTML = `
            <div class="message-avatar">${message.type === 'user' ? '<img src="assets/icon-user.svg" alt="用户" width="20" height="20">' : '<img src="assets/icon-bot.svg" alt="AI" width="20" height="20">'}</div>
            <div class="message-content">
                ${contentHtml}
            </div>
        `;

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
        const hasImage = this.uploadedImage !== null;
        const canSend = (hasContent || hasImage) && !this.isTyping;

        sendBtn.disabled = !canSend;
        sendBtn.style.opacity = canSend ? '1' : '0.5';
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
            console.log('已有图片，请通过浮窗内的添加区域上传新图片');
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

            console.log(`图片上传成功: ${file.name}, 总共 ${this.uploadedImages.length} 张图片`);

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

            console.log('固定预览显示，图片已设置');
        }
    }

    /**
     * 显示悬停预览
     */
    showHoverPreview() {
        console.log('showHoverPreview 被调用, 当前图片数量:', this.uploadedImages.length);

        const preview = document.getElementById('image-preview');

        if (preview) {
            // 生成预览内容（无论是否有图片都显示）
            this.addPreviewControls();

            // 显示悬停预览 - 只管理CSS类，样式由CSS控制
            preview.classList.add('show-hover');
            preview.classList.remove('fixed');
            console.log('添加show-hover类，移除fixed类，CSS将处理显示');

            // 更新标题显示图片数量
            this.updatePreviewTitle();

            // 检查最终状态
            setTimeout(() => {
                console.log('悬停预览最终状态:', {
                    display: getComputedStyle(preview).display,
                    opacity: getComputedStyle(preview).opacity,
                    visibility: getComputedStyle(preview).visibility,
                    classes: preview.className
                });
            }, 10);
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
        console.log('hideHoverPreview 被调用');

        // 清除之前的延迟隐藏定时器
        if (this.hidePreviewTimeout) {
            clearTimeout(this.hidePreviewTimeout);
        }

        // 设置0.3秒延迟隐藏
        this.hidePreviewTimeout = setTimeout(() => {
            const preview = document.getElementById('image-preview');
            console.log('执行延迟隐藏，预览元素状态:', {
                exists: !!preview,
                hasFixed: preview?.classList.contains('fixed'),
                currentClasses: preview?.className,
                isHovering: preview?.matches(':hover') || false
            });

            // 检查鼠标是否还在预览区域内
            if (preview && !preview.classList.contains('fixed') && !preview.matches(':hover')) {
                preview.classList.remove('show-hover');
                console.log('移除show-hover类，预览隐藏');

                // 检查最终状态
                setTimeout(() => {
                    console.log('隐藏预览最终状态:', {
                        display: getComputedStyle(preview).display,
                        opacity: getComputedStyle(preview).opacity,
                        classes: preview.className
                    });
                }, 10);
            } else {
                console.log('取消隐藏（鼠标仍在预览区域内或固定状态）');
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
        console.log(`删除图片: ${deletedImage.name}`);

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
        console.log('清空所有上传的图片');
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
