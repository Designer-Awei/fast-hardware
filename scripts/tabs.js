/**
 * Fast Hardware - 标签页管理脚本
 * 处理标签页切换逻辑和状态管理
 */

class TabManager {
    constructor() {
        this.tabs = new Map();
        this.subTabs = new Map();
        this.currentTab = 'circuit-design';
        this.currentSubTab = 'preview';
        this.init();
    }

    /**
     * 初始化标签页管理器
     */
    init() {
        console.log('初始化标签页管理器...');
        this.registerTabs();
        this.bindEvents();
        this.setInitialState();
    }

    /**
     * 注册所有标签页
     */
    registerTabs() {
        // 注册一级标签页
        this.tabs.set('circuit-design', {
            element: document.getElementById('circuit-design-tab'),
            button: document.querySelector('[data-tab="circuit-design"]')
        });

        this.tabs.set('component-lib', {
            element: document.getElementById('component-lib-tab'),
            button: document.querySelector('[data-tab="component-lib"]')
        });

        // 注册二级标签页
        this.subTabs.set('preview', {
            element: document.getElementById('preview-sub-tab'),
            button: document.querySelector('[data-sub-tab="preview"]')
        });

        this.subTabs.set('standard', {
            element: document.getElementById('standard-sub-tab'),
            button: document.querySelector('[data-sub-tab="standard"]')
        });

        this.subTabs.set('custom', {
            element: document.getElementById('custom-sub-tab'),
            button: document.querySelector('[data-sub-tab="custom"]')
        });

        this.subTabs.set('designer', {
            element: document.getElementById('designer-sub-tab'),
            button: document.querySelector('[data-sub-tab="designer"]')
        });
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 监听主应用的事件
        document.addEventListener('tabSwitched', (e) => {
            this.handleTabSwitch(e.detail.tabName);
        });

        document.addEventListener('subTabSwitched', (e) => {
            this.handleSubTabSwitch(e.detail.subTabName);
        });

        // 直接绑定按钮点击事件
        this.tabs.forEach((tab, name) => {
            if (tab.button) {
                tab.button.addEventListener('click', () => {
                    this.switchToTab(name);
                });
            }
        });

        this.subTabs.forEach((subTab, name) => {
            if (subTab.button) {
                subTab.button.addEventListener('click', () => {
                    this.switchToSubTab(name);
                });
            }
        });
    }

    /**
     * 设置初始状态
     */
    setInitialState() {
        this.switchToTab(this.currentTab);
        this.switchToSubTab(this.currentSubTab);
    }

    /**
     * 切换到指定标签页
     * @param {string} tabName - 标签页名称
     */
    switchToTab(tabName) {
        if (!this.tabs.has(tabName)) {
            console.warn(`标签页 "${tabName}" 不存在`);
            return;
        }

        console.log(`切换到标签页: ${tabName}`);

        // 隐藏所有标签页
        this.tabs.forEach((tab) => {
            if (tab.element) {
                tab.element.classList.remove('active');
            }
            if (tab.button) {
                tab.button.classList.remove('active');
            }
        });

        // 显示目标标签页
        const targetTab = this.tabs.get(tabName);
        if (targetTab.element) {
            targetTab.element.classList.add('active');
        }
        if (targetTab.button) {
            targetTab.button.classList.add('active');
        }

        this.currentTab = tabName;
        this.onTabActivated(tabName);
    }

    /**
     * 切换到指定二级标签页
     * @param {string} subTabName - 二级标签页名称
     */
    switchToSubTab(subTabName) {
        if (!this.subTabs.has(subTabName)) {
            console.warn(`二级标签页 "${subTabName}" 不存在`);
            return;
        }

        console.log(`切换到二级标签页: ${subTabName}`);

        // 隐藏所有二级标签页
        this.subTabs.forEach((subTab) => {
            if (subTab.element) {
                subTab.element.classList.remove('active');
            }
            if (subTab.button) {
                subTab.button.classList.remove('active');
            }
        });

        // 显示目标二级标签页
        const targetSubTab = this.subTabs.get(subTabName);
        if (targetSubTab.element) {
            targetSubTab.element.classList.add('active');
        }
        if (targetSubTab.button) {
            targetSubTab.button.classList.add('active');
        }

        this.currentSubTab = subTabName;
        this.onSubTabActivated(subTabName);
    }

    /**
     * 处理来自主应用的标签页切换
     * @param {string} tabName - 标签页名称
     */
    handleTabSwitch(tabName) {
        this.switchToTab(tabName);
    }

    /**
     * 处理来自主应用的二级标签页切换
     * @param {string} subTabName - 二级标签页名称
     */
    handleSubTabSwitch(subTabName) {
        this.switchToSubTab(subTabName);
    }

    /**
     * 标签页激活回调
     * @param {string} tabName - 标签页名称
     */
    onTabActivated(tabName) {
        // 触发标签页特定的初始化逻辑
        switch (tabName) {
            case 'circuit-design':
                this.initializeCircuitDesignTab();
                break;
            case 'component-lib':
                this.initializeComponentLibTab();
                break;
        }

        // 触发自定义事件
        const event = new CustomEvent('tabActivated', {
            detail: { tabName }
        });
        document.dispatchEvent(event);
    }

    /**
     * 二级标签页激活回调
     * @param {string} subTabName - 二级标签页名称
     */
    onSubTabActivated(subTabName) {
        // 触发二级标签页特定的初始化逻辑
        switch (subTabName) {
            case 'preview':
                this.initializePreviewSubTab();
                break;
            case 'standard':
                this.initializeStandardSubTab();
                break;
            case 'custom':
                this.initializeCustomSubTab();
                break;
            case 'designer':
                this.initializeDesignerSubTab();
                break;
        }

        // 触发自定义事件
        const event = new CustomEvent('subTabActivated', {
            detail: { subTabName }
        });
        document.dispatchEvent(event);
    }

    /**
     * 初始化电路搭建标签页
     */
    initializeCircuitDesignTab() {
        console.log('初始化电路搭建标签页');
        // 这里可以添加电路搭建标签页的初始化逻辑
    }

    /**
     * 初始化元件管理标签页
     */
    initializeComponentLibTab() {
        console.log('初始化元件管理标签页');
        // 这里可以添加元件管理标签页的初始化逻辑
    }

    /**
     * 初始化元件预览二级标签页
     */
    initializePreviewSubTab() {
        console.log('初始化元件预览二级标签页');
        // 这里可以添加元件预览的初始化逻辑
    }

    /**
     * 初始化标准元件二级标签页
     */
    initializeStandardSubTab() {
        console.log('初始化标准元件二级标签页');
        // 这里可以添加标准元件的初始化逻辑
        // 复用元件预览的组件加载逻辑
    }

    /**
     * 初始化自制元件二级标签页
     */
    initializeCustomSubTab() {
        console.log('初始化自制元件二级标签页');
        // 这里可以添加自制元件的初始化逻辑
        // 复用元件预览的组件加载逻辑
    }

    /**
     * 初始化元件绘制二级标签页
     */
    initializeDesignerSubTab() {
        console.log('初始化元件绘制二级标签页');

        // 确保元件设计器画布元素已渲染
        const canvasElement = document.getElementById('component-designer-canvas');
        if (!canvasElement) {
            console.warn('元件设计画布元素未找到，等待DOM更新');
            // 多次延迟检查，确保DOM完全更新
            setTimeout(() => {
                const retryCanvas = document.getElementById('component-designer-canvas');
                if (!retryCanvas) {
                    console.error('元件设计画布元素仍然未找到');
                    // 再次延迟检查
                    setTimeout(() => {
                        const finalRetry = document.getElementById('component-designer-canvas');
                        if (!finalRetry) {
                            console.error('最终检查：元件设计画布元素未找到');
                        } else {
                            console.log('延迟后找到元件设计画布元素');
                        }
                    }, 100);
                } else {
                    console.log('元件设计画布元素已找到');
                }
            }, 50);
        } else {
            console.log('元件设计画布元素已准备就绪');
        }
    }

    /**
     * 获取当前标签页
     * @returns {string} 当前标签页名称
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * 获取当前二级标签页
     * @returns {string} 当前二级标签页名称
     */
    getCurrentSubTab() {
        return this.currentSubTab;
    }

    /**
     * 检查标签页是否存在
     * @param {string} tabName - 标签页名称
     * @returns {boolean} 是否存在
     */
    hasTab(tabName) {
        return this.tabs.has(tabName);
    }

    /**
     * 检查二级标签页是否存在
     * @param {string} subTabName - 二级标签页名称
     * @returns {boolean} 是否存在
     */
    hasSubTab(subTabName) {
        return this.subTabs.has(subTabName);
    }
}

// 创建全局标签页管理器实例
const tabManager = new TabManager();

// 导出到全局作用域
window.TabManager = TabManager;
window.tabManager = tabManager;
