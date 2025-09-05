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
        try {
            const standardComponents = await this.loadComponentsFromDirectory('data/system-components/standard');
            const customComponents = await this.loadComponentsFromDirectory('data/system-components/custom');
            
            // 标记自制元件
            customComponents.forEach(component => {
                component.custom = true;
            });

            const allComponents = [...standardComponents, ...customComponents];
            console.log(`从JSON文件加载了 ${allComponents.length} 个元件`);
            return allComponents;
        } catch (error) {
            console.error('加载元件失败，使用模拟数据:', error);
            return this.getMockComponents();
        }
    }

    /**
     * 从指定目录加载元件JSON文件
     * @param {string} directory - 目录路径
     * @returns {Promise<Array>} 元件数组
     */
    async loadComponentsFromDirectory(directory) {
        // 使用Electron的API读取文件
        if (window.electronAPI && window.electronAPI.readComponentFiles) {
            return await window.electronAPI.readComponentFiles(directory);
        }
        
        // 如果没有Electron API，返回空数组
        console.warn('Electron API不可用，无法读取文件');
        return [];
    }

    /**
     * 获取模拟元件数据（备用）
     * @returns {Array} 模拟元件数组
     */
    getMockComponents() {
        return [
            {
                id: 'arduino-uno-r3',
                name: 'Arduino Uno R3',
                category: 'microcontroller',
                description: 'Arduino开发板，基于ATmega328P微控制器',
                tags: ['arduino', 'uno', 'microcontroller'],
                dimensions: { width: 80, height: 120 },
                pins: {
                    side1: [
                        {"pinName": "A0", "type": "analog_io", "order": 1},
                        {"pinName": "A1", "type": "analog_io", "order": 2}
                    ],
                    side2: [
                        {"pinName": "VIN", "type": "power", "order": 1},
                        {"pinName": "GND", "type": "ground", "order": 2}
                    ]
                }
            },
            {
                id: 'led-5mm',
                name: '5mm LED',
                category: 'output',
                description: '5mm直径LED灯，支持多种颜色',
                tags: ['led', 'light', 'output'],
                dimensions: { width: 20, height: 15 },
                pins: {
                    side1: [
                        {"pinName": "正极", "type": "power", "order": 1}
                    ],
                    side3: [
                        {"pinName": "负极", "type": "ground", "order": 1}
                    ]
                }
            }
        ];
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

        // 生成图标
        const icon = this.getComponentIcon(component);

        card.innerHTML = `
            <div class="component-icon">${icon}</div>
            <div class="component-name">${component.name}</div>
            <div class="component-category">${this.getCategoryName(component.category)}</div>
            <div class="component-description">${component.description}</div>
            <div class="component-actions">
                <button class="preview-btn" onclick="event.stopPropagation()">预览</button>
            </div>
        `;

        // 添加预览按钮事件
        const previewBtn = card.querySelector('.preview-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.showComponentPreview(component);
            });
        }

        // 添加拖拽事件
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify(component));
            e.dataTransfer.effectAllowed = 'copy';
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        // 双击预览
        card.addEventListener('dblclick', () => {
            this.showComponentPreview(component);
        });

        return card;
    }

    /**
     * 获取元件图标
     * @param {Object} component - 元件对象
     * @returns {string} 图标
     */
    getComponentIcon(component) {
        const iconMap = {
            'microcontroller': '🔧',
            'sensor': '🌡️',
            'output': '💡',
            'communication': '📡',
            'power': '⚡'
        };

        return iconMap[component.category] || '⚙️';
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

    /**
     * 显示元件预览窗口
     * @param {Object} component - 元件对象
     */
    showComponentPreview(component) {
        console.log('显示元件预览:', component.name);

        // 创建预览窗口
        const previewModal = this.createPreviewModal(component);
        document.body.appendChild(previewModal);

        // 显示动画
        requestAnimationFrame(() => {
            previewModal.classList.add('show');
        });
    }

    /**
     * 创建预览模态窗口
     * @param {Object} component - 元件对象
     * @returns {HTMLElement} 模态窗口元素
     */
    createPreviewModal(component) {
        const modal = document.createElement('div');
        modal.className = 'component-preview-modal';
        modal.innerHTML = `
            <div class="preview-backdrop"></div>
            <div class="preview-content">
                <div class="preview-header">
                    <h3>${component.name}</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="preview-body">
                    <div class="component-render" id="component-render-${component.id}">
                        <!-- 元件渲染区域 -->
                    </div>
                    <div class="component-info">
                        <div class="info-section">
                            <h4>基本信息</h4>
                            <p><strong>类别:</strong> ${this.getCategoryName(component.category)}</p>
                            <p><strong>描述:</strong> ${component.description}</p>
                            ${component.dimensions ? `<p><strong>尺寸:</strong> ${component.dimensions.width} × ${component.dimensions.height}</p>` : ''}
                        </div>
                        ${component.pins ? this.renderPinInfo(component.pins) : ''}
                        ${component.specifications ? this.renderSpecifications(component.specifications) : ''}
                    </div>
                </div>
            </div>
        `;

        // 绑定关闭事件
        modal.querySelector('.close-btn').addEventListener('click', () => {
            this.closePreviewModal(modal);
        });

        modal.querySelector('.preview-backdrop').addEventListener('click', () => {
            this.closePreviewModal(modal);
        });

        // ESC键关闭
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closePreviewModal(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // 渲染元件形态
        setTimeout(() => {
            this.renderComponentShape(component, `component-render-${component.id}`);
        }, 100);

        return modal;
    }

    /**
     * 渲染引脚信息
     * @param {Object} pins - 引脚配置
     * @returns {string} HTML字符串
     */
    renderPinInfo(pins) {
        let html = '<div class="info-section"><h4>引脚配置</h4>';
        
        Object.keys(pins).forEach(side => {
            if (pins[side] && pins[side].length > 0) {
                html += `<div class="pin-side">
                    <strong>${side.toUpperCase()}:</strong>
                    <ul>`;
                pins[side].forEach(pin => {
                    html += `<li>${pin.pinName} (${pin.type})</li>`;
                });
                html += '</ul></div>';
            }
        });
        
        html += '</div>';
        return html;
    }

    /**
     * 渲染规格信息
     * @param {Object} specifications - 规格对象
     * @returns {string} HTML字符串
     */
    renderSpecifications(specifications) {
        let html = '<div class="info-section"><h4>技术规格</h4><ul>';
        
        Object.keys(specifications).forEach(key => {
            const value = specifications[key];
            const displayKey = this.getSpecDisplayName(key);
            html += `<li><strong>${displayKey}:</strong> ${value}</li>`;
        });
        
        html += '</ul></div>';
        return html;
    }

    /**
     * 获取规格显示名称
     * @param {string} key - 规格键名
     * @returns {string} 显示名称
     */
    getSpecDisplayName(key) {
        const specNames = {
            'voltage': '电压',
            'current': '电流',
            'digitalPins': '数字引脚',
            'analogPins': '模拟引脚',
            'flashMemory': '闪存',
            'frequency': '频率',
            'range': '范围',
            'accuracy': '精度'
        };
        
        return specNames[key] || key;
    }

    /**
     * 渲染元件形态
     * @param {Object} component - 元件对象
     * @param {string} containerId - 容器ID
     */
    renderComponentShape(component, containerId) {
        const container = document.getElementById(containerId);
        if (!container || !component.pins || !component.dimensions) {
            container.innerHTML = '<div class="no-shape">暂无形态预览</div>';
            return;
        }

        // 创建SVG画布
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const { width, height } = component.dimensions;
        const scale = Math.min(300 / width, 200 / height, 3); // 自适应缩放
        const svgWidth = width * scale;
        const svgHeight = height * scale;
        
        svg.setAttribute('width', svgWidth + 100); // 留出引脚空间
        svg.setAttribute('height', svgHeight + 100);
        svg.setAttribute('viewBox', `0 0 ${svgWidth + 100} ${svgHeight + 100}`);

        // 绘制主体矩形
        const mainRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        mainRect.setAttribute('x', 50);
        mainRect.setAttribute('y', 50);
        mainRect.setAttribute('width', svgWidth);
        mainRect.setAttribute('height', svgHeight);
        mainRect.setAttribute('fill', '#f0f0f0');
        mainRect.setAttribute('stroke', '#333');
        mainRect.setAttribute('stroke-width', 2);
        mainRect.setAttribute('rx', 4);
        svg.appendChild(mainRect);

        // 添加元件名称
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 50 + svgWidth / 2);
        text.setAttribute('y', 50 + svgHeight / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', Math.max(10, Math.min(14, svgWidth / 8)));
        text.setAttribute('fill', '#333');
        text.textContent = component.name;
        svg.appendChild(text);

        // 绘制引脚
        this.drawPins(svg, component.pins, svgWidth, svgHeight, scale);

        container.innerHTML = '';
        container.appendChild(svg);
    }

    /**
     * 绘制引脚
     * @param {SVGElement} svg - SVG元素
     * @param {Object} pins - 引脚配置
     * @param {number} width - 主体宽度
     * @param {number} height - 主体高度
     * @param {number} scale - 缩放比例
     */
    drawPins(svg, pins, width, height, scale) {
        const pinSize = 8;
        const offset = 50;

        Object.keys(pins).forEach(side => {
            const sidePins = pins[side];
            if (!sidePins || sidePins.length === 0) return;

            sidePins.forEach((pin, index) => {
                const pinRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const pinText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                
                let x, y, textX, textY;
                const spacing = side === 'side1' || side === 'side3' ? 
                    width / (sidePins.length + 1) : 
                    height / (sidePins.length + 1);

                switch (side) {
                    case 'side1': // 上边
                        x = offset + (index + 1) * spacing - pinSize / 2;
                        y = offset - pinSize;
                        textX = x + pinSize / 2;
                        textY = y - 5;
                        break;
                    case 'side2': // 右边
                        x = offset + width;
                        y = offset + (index + 1) * spacing - pinSize / 2;
                        textX = x + pinSize + 5;
                        textY = y + pinSize / 2;
                        break;
                    case 'side3': // 下边
                        x = offset + (index + 1) * spacing - pinSize / 2;
                        y = offset + height;
                        textX = x + pinSize / 2;
                        textY = y + pinSize + 15;
                        break;
                    case 'side4': // 左边
                        x = offset - pinSize;
                        y = offset + (index + 1) * spacing - pinSize / 2;
                        textX = x - 5;
                        textY = y + pinSize / 2;
                        break;
                }

                // 引脚矩形
                pinRect.setAttribute('x', x);
                pinRect.setAttribute('y', y);
                pinRect.setAttribute('width', pinSize);
                pinRect.setAttribute('height', pinSize);
                pinRect.setAttribute('fill', this.getPinColor(pin.type));
                pinRect.setAttribute('stroke', '#333');
                pinRect.setAttribute('stroke-width', 1);
                svg.appendChild(pinRect);

                // 引脚标签
                pinText.setAttribute('x', textX);
                pinText.setAttribute('y', textY);
                pinText.setAttribute('text-anchor', side === 'side2' ? 'start' : side === 'side4' ? 'end' : 'middle');
                pinText.setAttribute('dominant-baseline', 'middle');
                pinText.setAttribute('font-size', 10);
                pinText.setAttribute('fill', '#333');
                pinText.textContent = pin.pinName;
                svg.appendChild(pinText);
            });
        });
    }

    /**
     * 获取引脚颜色
     * @param {string} type - 引脚类型
     * @returns {string} 颜色值
     */
    getPinColor(type) {
        const colorMap = {
            'power': '#ff6b6b',
            'ground': '#333',
            'digital_io': '#4ecdc4',
            'analog_io': '#45b7d1',
            'communication': '#96ceb4'
        };
        
        return colorMap[type] || '#ddd';
    }

    /**
     * 关闭预览模态窗口
     * @param {HTMLElement} modal - 模态窗口元素
     */
    closePreviewModal(modal) {
        modal.classList.add('hide');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
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
