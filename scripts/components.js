/**
 * Fast Hardware - 元件管理脚本
 * 处理元件库的加载、显示和管理
 */

class ComponentsManager {
    constructor() {
        this.components = [];
        this.filteredComponents = [];
        this.currentCategory = 'all';
        this.searchQuery = '';
        this.init();
    }

    /**
     * 初始化元件管理器
     */
    init() {
        console.log('初始化元件管理器...');
        this.bindEvents();
        this.bindOtherEvents();
        this.loadComponents('all');
        console.log('元件管理器初始化完成');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 绑定所有搜索输入框
        this.bindSearchEvents('component-search');
        this.bindSearchEvents('standard-component-search');
        this.bindSearchEvents('custom-component-search');

        // 绑定所有分类筛选器
        this.bindCategoryEvents('category-filter');
        this.bindCategoryEvents('standard-category-filter');
        this.bindCategoryEvents('custom-category-filter');
    }

    /**
     * 绑定搜索事件
     * @param {string} elementId - 搜索输入框ID
     */
    bindSearchEvents(elementId) {
        const searchInput = document.getElementById(elementId);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.filterComponents();
            });
        }
    }

    /**
     * 绑定分类筛选事件
     * @param {string} elementId - 分类选择器ID
     */
    bindCategoryEvents(elementId) {
        const categorySelect = document.getElementById(elementId);
        if (categorySelect) {
            categorySelect.addEventListener('change', (e) => {
                this.currentCategory = e.target.value;
                this.filterComponents();
            });
        }
    }

    /**
     * 绑定其他事件监听器
     */
    bindOtherEvents() {
        // 元件设计器表单
        const saveBtn = document.getElementById('save-component');
        const resetBtn = document.getElementById('reset-designer');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveComponent());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetDesigner());
        }

        // 监听标签页切换事件
        document.addEventListener('subTabActivated', (e) => {
            this.handleSubTabSwitch(e.detail.subTabName);
        });
    }

    /**
     * 处理二级标签页切换
     * @param {string} subTabName - 二级标签页名称
     */
    handleSubTabSwitch(subTabName) {
        switch (subTabName) {
            case 'preview':
                this.loadComponents('all');
                break;
            case 'standard':
                this.loadComponents('standard');
                break;
            case 'custom':
                this.loadComponents('custom');
                break;
        }
    }

    /**
     * 加载元件库
     * @param {string} type - 元件类型 ('all', 'standard', 'custom')
     */
    async loadComponents(type = 'all') {
        console.log(`加载元件库 (${type})...`);

        // 模拟从系统元件库加载元件
        this.components = await this.loadSystemComponents();
        this.currentType = type;

        // 初始筛选
        this.filterComponents();
        this.renderComponents();

        console.log(`加载了 ${this.components.length} 个元件`);
    }

    /**
     * 加载系统元件库
     * @returns {Promise<Array>} 元件数组
     */
    async loadSystemComponents() {
        // 这里模拟加载系统元件库
        // 在实际实现中，这会从data/system-components/目录加载JSON文件

        const mockComponents = [
            {
                id: 'arduino-uno-r3',
                name: 'Arduino Uno R3',
                category: 'microcontroller',
                icon: '🔧',
                description: 'Arduino开发板，基于ATmega328P微控制器',
                tags: ['arduino', 'uno', 'microcontroller']
            },
            {
                id: 'led-5mm',
                name: '5mm LED',
                category: 'output',
                icon: '💡',
                description: '5mm直径LED灯，支持多种颜色',
                tags: ['led', 'light', 'output']
            },
            {
                id: 'hc05-bluetooth',
                name: 'HC-05蓝牙模块',
                category: 'communication',
                icon: '📡',
                description: 'HC-05蓝牙串口模块，支持蓝牙通信',
                tags: ['bluetooth', 'communication', 'wireless']
            },
            {
                id: 'resistor-220',
                name: '220Ω电阻',
                category: 'power',
                icon: '⚡',
                description: '220欧姆碳膜电阻，常用限流电阻',
                tags: ['resistor', 'resistance', 'power']
            },
            {
                id: 'servo-sg90',
                name: 'SG90舵机',
                category: 'output',
                icon: '🔄',
                description: 'SG90 9g舵机，180度旋转范围',
                tags: ['servo', 'motor', 'rotation']
            },
            {
                id: 'dht22-sensor',
                name: 'DHT22温湿度传感器',
                category: 'sensor',
                icon: '🌡️',
                description: '数字温湿度传感器，精度较高',
                tags: ['temperature', 'humidity', 'sensor']
            }
        ];

        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 500));

        return mockComponents;
    }

    /**
     * 筛选元件
     */
    filterComponents() {
        this.filteredComponents = this.components.filter(component => {
            // 类型筛选
            let typeMatch = true;
            if (this.currentType === 'standard') {
                typeMatch = !component.custom;
            } else if (this.currentType === 'custom') {
                typeMatch = component.custom === true;
            }

            // 分类筛选
            const categoryMatch = this.currentCategory === 'all' ||
                                component.category === this.currentCategory;

            // 搜索筛选
            const searchMatch = !this.searchQuery ||
                              component.name.toLowerCase().includes(this.searchQuery) ||
                              component.description.toLowerCase().includes(this.searchQuery) ||
                              component.tags.some(tag => tag.toLowerCase().includes(this.searchQuery));

            return typeMatch && categoryMatch && searchMatch;
        });

        this.renderComponents();
    }

    /**
     * 渲染元件列表
     */
    renderComponents() {
        // 根据当前类型确定容器ID
        let containerId = 'components-grid';
        if (this.currentType === 'standard') {
            containerId = 'standard-components-grid';
        } else if (this.currentType === 'custom') {
            containerId = 'custom-components-grid';
        }

        const container = document.getElementById(containerId);
        if (!container) return;

        if (this.filteredComponents.length === 0) {
            container.innerHTML = '<div class="no-results">没有找到匹配的元件</div>';
            return;
        }

        container.innerHTML = '';

        this.filteredComponents.forEach(component => {
            const componentCard = this.createComponentCard(component);
            container.appendChild(componentCard);
        });
    }

    /**
     * 创建元件卡片
     * @param {Object} component - 元件对象
     * @returns {HTMLElement} 元件卡片元素
     */
    createComponentCard(component) {
        const card = document.createElement('div');
        card.className = 'component-card';
        card.draggable = true;
        card.dataset.componentId = component.id;

        card.innerHTML = `
            <div class="component-icon">${component.icon}</div>
            <div class="component-name">${component.name}</div>
            <div class="component-category">${this.getCategoryName(component.category)}</div>
            <div class="component-description">${component.description}</div>
        `;

        // 添加拖拽事件
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify(component));
            e.dataTransfer.effectAllowed = 'copy';
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        return card;
    }

    /**
     * 获取分类显示名称
     * @param {string} category - 分类标识
     * @returns {string} 分类显示名称
     */
    getCategoryName(category) {
        const categoryNames = {
            'microcontroller': '微控制器',
            'sensor': '传感器',
            'output': '输出设备',
            'communication': '通信模块',
            'power': '电源模块'
        };

        return categoryNames[category] || category;
    }

    /**
     * 保存自定义元件
     */
    saveComponent() {
        const nameInput = document.getElementById('component-name');
        const categorySelect = document.getElementById('component-category');
        const descriptionTextarea = document.getElementById('component-description');

        if (!nameInput || !categorySelect || !descriptionTextarea) return;

        const name = nameInput.value.trim();
        const category = categorySelect.value;
        const description = descriptionTextarea.value.trim();

        if (!name) {
            alert('请输入元件名称');
            return;
        }

        if (!description) {
            alert('请输入元件描述');
            return;
        }

        // 创建新元件
        const newComponent = {
            id: `custom-${Date.now()}`,
            name: name,
            category: category,
            icon: '🔧',
            description: description,
            tags: [name.toLowerCase()],
            custom: true
        };

        // 添加到元件库
        this.components.push(newComponent);
        this.filterComponents();

        // 重置表单
        this.resetDesigner();

        // 显示成功消息
        showNotification('自定义元件保存成功！', 'success');

        console.log('自定义元件已保存:', newComponent);
    }

    /**
     * 重置元件设计器
     */
    resetDesigner() {
        const nameInput = document.getElementById('component-name');
        const descriptionTextarea = document.getElementById('component-description');

        if (nameInput) nameInput.value = '';
        if (descriptionTextarea) descriptionTextarea.value = '';

        console.log('元件设计器已重置');
    }
}

// 创建全局元件管理器实例
let componentsManager;

document.addEventListener('DOMContentLoaded', () => {
    componentsManager = new ComponentsManager();
});

// 导出到全局作用域
window.ComponentsManager = ComponentsManager;
window.componentsManager = componentsManager;
