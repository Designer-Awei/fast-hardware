/**
 * Fast Hardware - 对话管理脚本
 * 处理与AI助手的对话交互
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.isTyping = false;
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
        if (!content || this.isTyping) return;

        // 添加用户消息
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: content,
            timestamp: new Date()
        };

        this.messages.push(userMessage);
        this.renderMessages();
        input.value = '';
        this.updateSendButton();

        // 滚动到底部
        this.scrollToBottom();

        // 模拟AI回复
        this.simulateAIResponse(content);
    }

    /**
     * 模拟AI回复
     * @param {string} userMessage - 用户消息
     */
    simulateAIResponse(userMessage) {
        this.isTyping = true;
        this.showTypingIndicator();

        // 模拟网络延迟
        setTimeout(() => {
            const aiResponse = this.generateAIResponse(userMessage);
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
     * @returns {string} AI回复内容
     */
    generateAIResponse(userMessage) {
        const responses = [
            '我理解你的需求。根据你的描述，我建议使用Arduino Uno作为主控板，这样可以快速实现你的想法。',
            '这是一个很有趣的项目！我可以帮你设计电路图。首先，你需要准备以下元件：Arduino开发板、LED灯、220Ω电阻。',
            '让我分析一下你的需求... 基于你的描述，这是一个典型的数字电路项目。我会为你推荐最合适的硬件配置。',
            '好的，我来帮你规划这个项目。首先，我们需要确定功能需求，然后选择合适的硬件元件，最后设计电路连接。',
            '这是一个很好的硬件项目想法！我可以提供完整的解决方案，包括电路图设计和Arduino代码生成。'
        ];

        return responses[Math.floor(Math.random() * responses.length)];
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
            <div class="message-avatar">🤖</div>
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

        messageDiv.innerHTML = `
            <div class="message-avatar">${message.type === 'user' ? '👤' : '🤖'}</div>
            <div class="message-content">
                <p>${this.formatMessage(message.content)}</p>
                <div class="message-time">${timeString}</div>
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
        sendBtn.disabled = !hasContent || this.isTyping;
        sendBtn.style.opacity = (hasContent && !this.isTyping) ? '1' : '0.5';
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
}

// 创建全局对话管理器实例
let chatManager;

document.addEventListener('DOMContentLoaded', () => {
    chatManager = new ChatManager();
});

// 导出到全局作用域
window.ChatManager = ChatManager;
window.chatManager = chatManager;
