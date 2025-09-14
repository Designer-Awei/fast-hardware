/**
 * Fast Hardware - 主应用脚本
 * 处理应用初始化、标签页切换等核心功能
 */

// 应用状态管理
class FastHardwareApp {
    constructor() {
        this.currentTab = 'circuit-design';
        this.currentSubTab = 'preview';
        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        this.bindEvents();
        this.initializeUI();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 一级标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 二级标签页切换
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const subTabName = e.target.dataset.subTab;
                this.switchSubTab(subTabName);
            });
        });

        // 窗口大小改变（防抖处理，避免频繁触发）
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 200);
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
    }

    /**
     * 初始化UI组件
     */
    initializeUI() {
        // 设置默认激活的标签页
        this.switchTab(this.currentTab);
        this.switchSubTab(this.currentSubTab);

        // 初始化其他UI组件
        this.initializeNotifications();
    }

    /**
     * 切换一级标签页
     * @param {string} tabName - 标签页名称
     */
    switchTab(tabName) {

        // 更新按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 更新内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // 更新当前标签页状态
        this.currentTab = tabName;

        // 触发标签页切换事件
        this.onTabSwitched(tabName);
    }

    /**
     * 切换二级标签页
     * @param {string} subTabName - 二级标签页名称
     */
    switchSubTab(subTabName) {

        // 更新按钮状态
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-sub-tab="${subTabName}"]`).classList.add('active');

        // 更新内容区域
        document.querySelectorAll('.sub-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${subTabName}-sub-tab`).classList.add('active');

        // 更新当前二级标签页状态
        this.currentSubTab = subTabName;

        // 触发二级标签页切换事件
        this.onSubTabSwitched(subTabName);
    }

    /**
     * 处理窗口大小改变
     */
    handleResize() {
        // 重新计算画布大小等
    }

    /**
     * 处理键盘快捷键
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeydown(e) {
        // Ctrl+S 保存快捷键
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveProject();
        }

        // Ctrl+O 打开项目快捷键
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            this.loadProject();
        }

        // Tab 键切换标签页
        if (e.key === 'Tab' && !e.ctrlKey) {
            e.preventDefault();
            this.switchToNextTab();
        }
    }

    /**
     * 保存项目
     */
    saveProject() {
        console.log('保存项目...');
        // TODO: 实现保存逻辑
        this.showNotification('项目保存功能开发中...', 'warning');
    }

    /**
     * 加载项目
     */
    loadProject() {
        console.log('加载项目...');
        // TODO: 实现加载逻辑
        this.showNotification('项目加载功能开发中...', 'warning');
    }

    /**
     * 切换到下一个标签页
     */
    switchToNextTab() {
        const tabs = ['circuit-design', 'component-lib', 'settings'];
        const currentIndex = tabs.indexOf(this.currentTab);
        const nextIndex = (currentIndex + 1) % tabs.length;
        this.switchTab(tabs[nextIndex]);
    }

    /**
     * 标签页切换回调
     * @param {string} tabName - 标签页名称
     */
    onTabSwitched(tabName) {
        // 触发自定义事件，让其他模块知道标签页切换了
        const event = new CustomEvent('tabSwitched', {
            detail: { tabName }
        });
        document.dispatchEvent(event);
    }

    /**
     * 二级标签页切换回调
     * @param {string} subTabName - 二级标签页名称
     */
    onSubTabSwitched(subTabName) {
        // 触发自定义事件，让其他模块知道二级标签页切换了
        const event = new CustomEvent('subTabSwitched', {
            detail: { subTabName }
        });
        document.dispatchEvent(event);
    }

    /**
     * 初始化通知系统
     */
    initializeNotifications() {
        // 创建通知容器
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    /**
     * 显示通知
     * @param {string} message - 通知消息
     * @param {string} type - 通知类型 (success, error, warning, info)
     * @param {number} duration - 显示时长(毫秒)
     */
    showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // 触发动画
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // 自动移除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                container.removeChild(notification);
            }, 300);
        }, duration);
    }
}

// 全局应用实例
let app;

// DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    app = new FastHardwareApp();
});

// 导出全局函数供其他脚本使用
window.FastHardwareApp = FastHardwareApp;
window.showNotification = (message, type, duration) => {
    if (app) {
        app.showNotification(message, type, duration);
    }
};
