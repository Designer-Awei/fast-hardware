/**
 * Fast Hardware - 可拖动分割线管理脚本
 * 处理画布和聊天区域的宽度调整
 */

class ResizerManager {
    constructor() {
        this.resizer = null;
        this.canvasSection = null;
        this.chatSection = null;
        this.workspace = null;
        this.isResizing = false;
        this.startX = 0;
        this.startCanvasWidth = 0;
        this.minChatWidth = 0.2; // 聊天区最小20%
        this.maxChatWidth = 0.4; // 聊天区最大40%
        this.minChatWidthPx = 240; // 聊天区最小宽度像素
        this.defaultChatWidth = 0.3; // 聊天区默认30%
        this.init();
    }

    /**
     * 初始化分割线管理器
     */
    init() {
        this.resizer = document.getElementById('resizer');
        this.canvasSection = document.querySelector('.canvas-section');
        this.chatSection = document.querySelector('.chat-section');
        this.workspace = document.querySelector('.workspace');

        if (!this.resizer || !this.canvasSection || !this.chatSection || !this.workspace) {
            console.warn('分割线相关元素未找到');
            return;
        }

        this.bindEvents();
        this.setDefaultLayout();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 鼠标按下事件
        this.resizer.addEventListener('mousedown', (e) => {
            this.startResize(e);
        });

        // 鼠标移动事件
        document.addEventListener('mousemove', (e) => {
            this.handleResize(e);
        });

        // 鼠标释放事件
        document.addEventListener('mouseup', () => {
            this.stopResize();
        });

        // 防止文本选择
        document.addEventListener('selectstart', (e) => {
            if (this.isResizing) {
                e.preventDefault();
            }
        });

        // 窗口大小改变事件
        window.addEventListener('resize', () => {
            this.handleWindowResize();
        });
    }

    /**
     * 开始调整大小
     * @param {MouseEvent} e - 鼠标事件
     */
    startResize(e) {
        e.preventDefault();
        this.isResizing = true;
        this.startX = e.clientX;
        this.startCanvasWidth = this.canvasSection.offsetWidth;

        // 检查是否处于响应式模式
        const isResponsiveMode = window.innerWidth <= 900;

        // 添加拖拽样式
        document.body.style.cursor = 'col-resize';
        this.resizer.style.background = '#007acc';
        this.resizer.style.opacity = '1';

        console.log('开始调整分割线', {
            startX: this.startX,
            canvasWidth: this.startCanvasWidth,
            chatWidth: this.chatSection.offsetWidth,
            responsiveMode: isResponsiveMode
        });
    }

    /**
     * 处理调整大小
     * @param {MouseEvent} e - 鼠标事件
     */
    handleResize(e) {
        if (!this.isResizing) return;

        const workspaceRect = this.workspace.getBoundingClientRect();
        const deltaX = e.clientX - this.startX;

        // 检查是否处于响应式模式 (900px以下)
        const isResponsiveMode = window.innerWidth <= 900;

        // 计算可能的新的聊天区宽度
        const currentChatWidth = this.chatSection.offsetWidth;
        const potentialNewChatWidth = currentChatWidth - deltaX; // 向右拖动减少聊天区宽度

        // 检查是否会小于最小像素宽度
        if (potentialNewChatWidth < this.minChatWidthPx) {
            console.log(`聊天区宽度不能小于 ${this.minChatWidthPx}px，当前计算宽度: ${potentialNewChatWidth}px`);
            return; // 不进行调整
        }

        if (isResponsiveMode) {
            // 响应式模式：也使用百分比控制，但调整范围适应小屏幕
            const currentChatPercent = currentChatWidth / workspaceRect.width;

            // 计算新的聊天区域百分比 (向右拖动减少聊天区宽度)
            const deltaPercent = deltaX / workspaceRect.width;
            const newChatPercent = currentChatPercent - deltaPercent;

            // 响应式模式下调整范围：15%-35% (比正常模式稍小)
            const minChatWidth = 0.15; // 15%
            const maxChatWidth = 0.35; // 35%
            const clampedChatPercent = Math.max(minChatWidth, Math.min(maxChatWidth, newChatPercent));
            const clampedCanvasPercent = 1 - clampedChatPercent;

            // 设置百分比宽度
            this.canvasSection.style.width = `${clampedCanvasPercent * 100}%`;
            this.chatSection.style.width = `${clampedChatPercent * 100}%`;
        } else {
            // 正常模式：使用百分比调整
            const currentChatPercent = currentChatWidth / workspaceRect.width;

            // 计算新的聊天区域百分比 (向右拖动减少聊天区宽度)
            const deltaPercent = deltaX / workspaceRect.width;
            const newChatPercent = currentChatPercent - deltaPercent;

            // 计算对应的像素宽度，确保不小于最小像素宽度
            const newChatWidthPx = newChatPercent * workspaceRect.width;
            if (newChatWidthPx < this.minChatWidthPx) {
                console.log(`聊天区宽度不能小于 ${this.minChatWidthPx}px，当前计算宽度: ${newChatWidthPx}px`);
                return; // 不进行调整
            }

            // 限制在20%-40%范围内
            const clampedChatPercent = Math.max(this.minChatWidth, Math.min(this.maxChatWidth, newChatPercent));
            const clampedCanvasPercent = 1 - clampedChatPercent;

            // 设置固定宽度
            this.canvasSection.style.width = `${clampedCanvasPercent * 100}%`;
            this.chatSection.style.width = `${clampedChatPercent * 100}%`;
        }

        // 更新起始位置，避免累积误差
        this.startX = e.clientX;

        // 重新计算画布大小
        if (window.canvasManager && window.canvasManager.resizeCanvas) {
            window.canvasManager.resizeCanvas();
        }
    }

    /**
     * 停止调整大小
     */
    stopResize() {
        if (!this.isResizing) return;

        this.isResizing = false;

        // 恢复拖拽样式
        document.body.style.cursor = '';
        this.resizer.style.background = '';
        this.resizer.style.opacity = '';

        console.log('停止调整分割线');
    }

    /**
     * 设置默认布局
     */
    setDefaultLayout() {
        // 检查是否处于响应式模式
        const isResponsiveMode = window.innerWidth <= 900;

        if (isResponsiveMode) {
            // 响应式模式：设置适合小屏幕的默认百分比
            const canvasPercent = 1 - 0.25; // 聊天区25%
            this.canvasSection.style.width = `${canvasPercent * 100}%`;
            this.chatSection.style.width = `25%`;
        } else {
            // 正常模式：设置默认百分比
            const canvasPercent = 1 - this.defaultChatWidth;
            this.canvasSection.style.width = `${canvasPercent * 100}%`;
            this.chatSection.style.width = `${this.defaultChatWidth * 100}%`;
        }

        // 清除flex样式以避免冲突
        this.canvasSection.style.flex = 'none';
        this.chatSection.style.flex = 'none';

    }

    /**
     * 处理窗口大小改变
     */
    handleWindowResize() {
        // 检查是否处于响应式模式
        const isResponsiveMode = window.innerWidth <= 900;

        // 保持当前的宽度比例
        const workspaceWidth = this.workspace.offsetWidth;
        const currentChatWidth = this.chatSection.offsetWidth;
        const currentChatPercent = currentChatWidth / workspaceWidth;

        let clampedChatPercent;
        if (isResponsiveMode) {
            // 响应式模式：15%-35%范围
            clampedChatPercent = Math.max(0.15, Math.min(0.35, currentChatPercent));
        } else {
            // 正常模式：20%-40%范围
            clampedChatPercent = Math.max(this.minChatWidth, Math.min(this.maxChatWidth, currentChatPercent));
        }

        const clampedCanvasPercent = 1 - clampedChatPercent;

        // 重新设置宽度
        this.canvasSection.style.width = `${clampedCanvasPercent * 100}%`;
        this.chatSection.style.width = `${clampedChatPercent * 100}%`;

        // 重新计算画布大小
        setTimeout(() => {
            if (window.canvasManager && window.canvasManager.resizeCanvas) {
                window.canvasManager.resizeCanvas();
            }
        }, 100);
    }
}

// 创建全局分割线管理器实例
let resizerManager;

document.addEventListener('DOMContentLoaded', () => {
    resizerManager = new ResizerManager();
});

// 导出到全局作用域
window.ResizerManager = ResizerManager;
window.resizerManager = resizerManager;
