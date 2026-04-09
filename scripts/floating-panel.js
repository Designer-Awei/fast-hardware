/**
 * Fast Hardware - 悬浮元件库面板
 * 实现左侧悬浮面板的展开/收起、搜索筛选和拖拽功能
 */

class FloatingPanel {
    constructor() {
        this.panel = null;
        this.panelTab = null;
        this.toggleBtn = null;
        this.searchInput = null;
        this.categoryFilter = null;
        this.componentList = null;
        this.isCollapsed = false;
        this.components = [];
        this.filteredComponents = [];

        this.init();
    }

    init() {
        this.bindElements();
        this.isCollapsed = this.panel ? this.panel.classList.contains('collapsed') : false;
        this.attachEventListeners();
        this.syncInitialPanelState();
        this.loadComponentLibrary().finally(() => {
            requestAnimationFrame(() => {
                this.panel?.classList.remove('no-transition');
            });
        });
    }

    bindElements() {
        this.panel = document.getElementById('component-floating-panel');
        this.toggleBtn = document.getElementById('panel-toggle-btn');
        this.searchInput = document.getElementById('floating-search');
        this.categoryFilter = document.getElementById('floating-category-filter');
        this.componentList = document.getElementById('component-list');
    }

    attachEventListeners() {
        // 面板切换按钮
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.togglePanel());
        }

        // 整个面板的点击事件（用于收起状态的展开）
        if (this.panel) {
            this.panel.addEventListener('click', (e) => {
                // 如果面板是收起状态，点击任意位置都展开
                if (this.isCollapsed && e.target === this.panel) {
                    e.stopPropagation();
                    this.expandPanel();
                }
            });
        }


        // 搜索功能
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.filterComponents());
        }

        // 分类筛选
        if (this.categoryFilter) {
            this.categoryFilter.addEventListener('change', () => this.filterComponents());
        }

        // 点击面板外部收起（移动端）
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 900 && !this.isCollapsed) {
                if (!this.panel.contains(e.target)) {
                    this.collapsePanel();
                }
            }
        });
    }

    togglePanel() {
        if (this.isCollapsed) {
            this.expandPanel();
        } else {
            this.collapsePanel();
        }
    }

    async expandPanel() {
        this.isCollapsed = false;
        this.panel.classList.remove('collapsed');
        this.panel.classList.remove('no-transition');

        // 更新按钮图标
        await this.updateToggleIcon(false);
    }

    async collapsePanel() {
        this.isCollapsed = true;
        this.panel.classList.add('collapsed');

        // 更新按钮图标
        await this.updateToggleIcon(true);
    }

    async syncInitialPanelState() {
        if (!this.panel) return;

        if (this.isCollapsed) {
            this.panel.classList.add('collapsed');
        } else {
            this.panel.classList.remove('collapsed');
        }

        await this.updateToggleIcon(this.isCollapsed);
    }

    async updateToggleIcon(isCollapsed) {
        if (!this.toggleBtn) return;

        this.toggleBtn.title = isCollapsed ? '展开面板' : '收起面板';

        const toggleIcon = this.toggleBtn.querySelector('.toggle-icon');
        if (toggleIcon && toggleIcon.tagName === 'IMG') {
            const iconName = isCollapsed ? 'chevron-right' : 'chevron-left';
            toggleIcon.dataset.icon = iconName;
            toggleIcon.alt = isCollapsed ? '展开' : '收起';

            const assetsPath = await window.electronAPI.getAssetsPath();
            toggleIcon.src = `file://${assetsPath}/icon-${iconName}.svg`;
        }
    }

    async loadComponentLibrary() {
        try {
            // 从系统元件库加载数据（完全依赖文件系统，不使用模拟数据）
            const standardPath = 'data/system-components/standard/';
            const customPath = 'data/system-components/custom/';

            console.debug('加载元件库路径', { standardPath, customPath });

            const standardComponents = await this.loadFromDirectory(standardPath);
            const customComponents = await this.loadFromDirectory(customPath);

            this.components = [...standardComponents, ...customComponents];
            this.filteredComponents = [...this.components];

            console.debug(`元件库加载完成，共 ${this.components.length} 个元件`);

            this.renderComponents();
        } catch (error) {
            console.error('加载元件库失败:', error);
            this.showError('加载元件库失败，请检查系统元件库文件');
        }
    }

    async loadFromDirectory(directory) {
        // 使用Electron的API读取文件（与元件预览页完全一致）
        if (window.electronAPI && window.electronAPI.readComponentFiles) {
            return await window.electronAPI.readComponentFiles(directory);
        }

        // 如果没有Electron API，尝试使用Node.js fs模块作为后备
        try {
            const fs = require('fs');
            const path = require('path');

            // 检查目录是否存在
            if (!fs.existsSync(directory)) {
                console.warn(`目录不存在: ${directory}`);
                return [];
            }

            // 读取目录中的所有JSON文件
            const files = fs.readdirSync(directory)
                .filter(file => file.endsWith('.json'))
                .map(file => path.join(directory, file));

            // 读取每个JSON文件
            const components = [];
            for (const filePath of files) {
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const componentData = JSON.parse(fileContent);

                    // 添加文件路径信息
                    componentData.filePath = filePath;
                    components.push(componentData);
                } catch (error) {
                    console.error(`读取文件失败 ${filePath}:`, error);
                }
            }

            return components;
        } catch (error) {
            console.error(`加载目录 ${directory} 失败:`, error);
            return [];
        }
    }


    filterComponents() {
        const searchTerm = this.searchInput.value.toLowerCase();
        const categoryFilter = this.categoryFilter.value;

        this.filteredComponents = this.components.filter(component => {
            const matchesSearch = component.name.toLowerCase().includes(searchTerm) ||
                                component.description.toLowerCase().includes(searchTerm);
            const matchesCategory = categoryFilter === 'all' || component.category === categoryFilter;

            return matchesSearch && matchesCategory;
        });

        this.renderComponents();
    }

    renderComponents() {
        if (!this.componentList) return;

        // 清空现有内容
        this.componentList.innerHTML = '';

        if (this.filteredComponents.length === 0) {
            this.componentList.innerHTML = '<div class="no-results"><p>未找到匹配的元件</p></div>';
            return;
        }

        // 渲染元件卡片
        this.filteredComponents.forEach(component => {
            const card = this.createComponentCard(component);
            this.componentList.appendChild(card);
        });
    }

    createComponentCard(component) {
        const card = document.createElement('div');
        card.className = 'component-card';
        card.setAttribute('data-component-id', component.id);
        card.draggable = true;

        // 元件图标（根据类别显示不同图标）
        const iconMap = {
            microcontroller: '🔧',
            sensor: '🌡️',
            actuator: '💡',
            power: '🔋',
            communication: '📡',
            auxiliary: '⚡',
            other: '🔧'
        };

        const icon = iconMap[component.category] || '🔧';

        card.innerHTML = `
            <div class="component-icon">${icon}</div>
            <div class="component-name">${component.name}</div>
            <div class="component-category">${this.getCategoryLabel(component.category)}</div>
            <div class="component-description">${component.description}</div>
        `;

        // 添加拖拽事件
        this.attachDragEvents(card, component);

        return card;
    }

    getCategoryLabel(category) {
        const labels = {
            microcontroller: '微控制器',
            sensor: '传感器',
            actuator: '执行器',
            power: '电源模块',
            communication: '通信模块',
            auxiliary: '辅助元件',
            other: '其他'
        };
        return labels[category] || category;
    }

    attachDragEvents(card, component) {
        let dragHint = null;

        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify(component));
            e.dataTransfer.effectAllowed = 'copy';

            // 添加拖拽样式
            card.classList.add('dragging');

            // 显示拖拽提示
            this.showDragHint('拖拽到画布上放置元件');

            // 通知主画布准备接收拖拽
            if (window.canvasManager && window.canvasManager.prepareForDrop) {
                window.canvasManager.prepareForDrop();
            }
        });

        card.addEventListener('dragend', (e) => {
            card.classList.remove('dragging');
            this.hideDragHint();

            // 通知画布结束拖拽
            if (window.canvasManager && window.canvasManager.endDrop) {
                window.canvasManager.endDrop();
            }
        });
    }

    showDragHint(message) {
        // 移除现有的提示
        this.hideDragHint();

        // 创建新提示
        const hint = document.createElement('div');
        hint.className = 'drag-hint show';
        hint.textContent = message;
        document.body.appendChild(hint);

        // 3秒后自动隐藏
        setTimeout(() => {
            this.hideDragHint();
        }, 3000);
    }

    hideDragHint() {
        const hints = document.querySelectorAll('.drag-hint');
        hints.forEach(hint => {
            hint.classList.remove('show');
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.parentNode.removeChild(hint);
                }
            }, 300);
        });
    }

    showError(message) {
        if (!this.componentList) return;

        this.componentList.innerHTML = `
            <div class="loading-placeholder">
                <p style="color: #e74c3c;">${message}</p>
            </div>
        `;
    }

    // 公共方法：展开面板
    expand() {
        this.expandPanel();
    }

    // 公共方法：收起面板
    collapse() {
        this.collapsePanel();
    }

    // 公共方法：获取面板状态
    isPanelCollapsed() {
        return this.isCollapsed;
    }

    // 公共方法：重新加载元件库
    reloadComponents() {
        this.loadComponentLibrary();
    }
}

// 悬浮面板由TabManager控制初始化，不在此处自动初始化

// 导出到全局作用域
window.FloatingPanel = FloatingPanel;

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FloatingPanel;
}
