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

        // 为每个页面创建独立的管理状态
        this.pageStates = {
            preview: {
                managementMode: false,
                selectedComponents: new Set(),
                isProcessingAction: false
            },
            standard: {
                managementMode: false,
                selectedComponents: new Set(),
                isProcessingAction: false
            },
            custom: {
                managementMode: false,
                selectedComponents: new Set(),
                isProcessingAction: false
            }
        };

        // 向后兼容的属性（指向preview页面的状态）
        this.managementMode = false;
        this.selectedComponents = new Set();
        this.isProcessingAction = false;

        this.init();
    }

    /**
     * 获取当前页面的状态
     * @param {string} pageType - 页面类型 ('preview', 'standard', 'custom')
     * @returns {Object} 页面状态对象
     */
    getPageState(pageType) {
        if (this.pageStates[pageType]) {
            return this.pageStates[pageType];
        }
        // 默认返回preview页面的状态
        return this.pageStates.preview;
    }

    /**
     * 根据按钮ID获取页面类型
     * @param {string} buttonId - 按钮ID
     * @returns {string} 页面类型
     */
    getPageTypeFromButtonId(buttonId) {
        if (buttonId === 'manage-standard-components-btn') {
            return 'standard';
        } else if (buttonId === 'manage-custom-components-btn') {
            return 'custom';
        } else {
            return 'preview';
        }
    }

    /**
     * 初始化元件管理器
     */
    init() {
        this.bindEvents();
        this.bindOtherEvents();
        this.loadComponents('all');
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

        // 绑定管理按钮
        this.bindManagementEvents();
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

        // 绑定保存和重置事件（在元件绘制器页面时会被 ComponentDesigner 的事件覆盖）
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                // 检查是否在元件绘制器页面
                const designerTab = document.getElementById('designer-sub-tab');
                if (designerTab && designerTab.classList.contains('active')) {
                    // 在元件绘制器页面，不执行 ComponentsManager 的保存逻辑
                    console.log('在元件绘制器页面，跳过 ComponentsManager 保存逻辑');
                    return;
                }
                // 在元件库页面，执行 ComponentsManager 的保存逻辑
                console.log('执行 ComponentsManager 保存逻辑');
                this.saveComponent();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                // 检查是否在元件绘制器页面
                const designerTab = document.getElementById('designer-sub-tab');
                if (designerTab && designerTab.classList.contains('active')) {
                    // 在元件绘制器页面，不执行 ComponentsManager 的重置逻辑
                    console.log('在元件绘制器页面，跳过 ComponentsManager 重置逻辑');
                    return;
                }
                // 在元件库页面，执行 ComponentsManager 的重置逻辑
                this.resetDesigner();
            });
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
        // 切换标签页时，重置当前页面的管理模式状态
        const pageTypeMap = {
            'preview': 'preview',
            'standard': 'standard',
            'custom': 'custom'
        };

        if (pageTypeMap[subTabName]) {
            this.resetManagementMode(pageTypeMap[subTabName]);
        }

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
            case 'designer':
                // 元件绘制器页面，不需要加载元件列表
                break;
        }
    }

    /**
     * 加载元件库
     * @param {string} type - 元件类型 ('all', 'standard', 'custom')
     */
    async loadComponents(type = 'all') {

        // 模拟从系统元件库加载元件
        this.components = await this.loadSystemComponents();
        this.currentType = type;

        // 初始筛选
        this.filterComponents();
        this.renderComponents();

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
            <div class="component-checkbox">
                <input type="checkbox" data-component-id="${component.id}" />
            </div>
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
            'actuator': '⚙️',
            'power': '⚡',
            'communication': '📡',
            'auxiliary': '🔩',
            'other': '📦'
        };

        return iconMap[component.category] || '📦';
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
            'actuator': '执行器',
            'power': '电源模块',
            'communication': '通信模块',
            'auxiliary': '辅助元件',
            'other': '其他'
        };

        return categoryNames[category] || '其他';
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
                    <div class="header-actions">
                        <button class="edit-btn" id="edit-component-btn">编辑</button>
                        <button class="reuse-btn" id="reuse-component-btn">复用</button>
                        <button class="close-btn">&times;</button>
                    </div>
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

        // 绑定编辑事件
        const editBtn = modal.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.editComponent(component);
                this.closePreviewModal(modal);
            });
        }

        // 绑定复用事件
        const reuseBtn = modal.querySelector('.reuse-btn');
        if (reuseBtn) {
            reuseBtn.addEventListener('click', () => {
                this.reuseComponent(component);
                this.closePreviewModal(modal);
            });
        }

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
                        textY = y - pinSize - 8; // 向上移动两个引脚高度加额外间距
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
                        textY = y + pinSize + 20; // 向下移动两个引脚高度加额外间距
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
                pinText.setAttribute('font-size', 10);
                pinText.setAttribute('fill', '#333');
                pinText.textContent = pin.pinName;

                // 根据边设置文字对齐和旋转
                switch (side) {
                    case 'side1': // 上边 - 逆时针旋转90度
                        pinText.setAttribute('text-anchor', 'middle');
                        pinText.setAttribute('dominant-baseline', 'middle');
                        pinText.setAttribute('transform', `rotate(-90 ${textX} ${textY})`);
                        break;
                    case 'side2': // 右边 - 水平向右
                        pinText.setAttribute('text-anchor', 'start');
                        pinText.setAttribute('dominant-baseline', 'middle');
                        break;
                    case 'side3': // 下边 - 顺时针旋转90度
                        pinText.setAttribute('text-anchor', 'middle');
                        pinText.setAttribute('dominant-baseline', 'middle');
                        pinText.setAttribute('transform', `rotate(90 ${textX} ${textY})`);
                        break;
                    case 'side4': // 左边 - 水平向左
                        pinText.setAttribute('text-anchor', 'end');
                        pinText.setAttribute('dominant-baseline', 'middle');
                        break;
                }

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
            'power': '#dc3545',       // 红色 - 电源引脚
            'ground': '#000000',     // 黑色 - 接地引脚
            'digital_io': '#28a745', // 绿色 - 数字I/O
            'analog_io': '#ffc107',  // 黄色 - 模拟I/O
            'special': '#6f42c1'     // 紫色 - 特殊引脚
        };

        return colorMap[type] || '#ddd';
    }

    /**
     * 编辑元件 - 跳转到元件绘制页并加载数据
     * @param {Object} component - 元件对象
     */
    editComponent(component) {
        console.log('编辑元件:', component.name);

        // 切换到元件绘制页标签
        if (window.tabManager) {
            window.tabManager.switchToSubTab('designer');
        }

        // 简化数据加载流程，直接调用加载方法
        this.safeLoadComponentData(component);
    }

    /**
     * 安全地加载元件数据，避免时序问题
     * @param {Object} component - 元件对象
     */
    safeLoadComponentData(component) {
        console.log('开始安全加载元件数据...');

        // 定义一个安全的加载函数
        const performLoad = () => {
            try {
                console.log('执行元件数据加载...');

                // 直接检查并加载数据
                if (this.checkDesignerReady()) {
                    this.doLoadComponentData(component);
                } else {
                    console.log('元件设计器暂未就绪，稍后重试...');
                    setTimeout(performLoad, 200);
                }
            } catch (error) {
                console.error('加载过程中出现错误:', error);
                // 如果出错，尝试简单的重试
                setTimeout(() => {
                    try {
                        this.doLoadComponentData(component);
                    } catch (retryError) {
                        console.error('重试也失败:', retryError);
                        alert('加载元件数据失败，请手动刷新页面后重试');
                    }
                }, 500);
            }
        };

        // 延迟执行，确保页面切换完成
        setTimeout(performLoad, 300);
    }

    /**
     * 检查元件设计器是否准备就绪
     * @returns {boolean} 是否就绪
     */
    checkDesignerReady() {
        return window.componentDesigner &&
               window.componentDesigner.initialized &&
               window.componentDesigner.renderer &&
               window.componentDesigner.renderer.canvas;
    }


    /**
     * 执行元件数据加载的实际逻辑
     * @param {Object} component - 元件对象
     */
    doLoadComponentData(component) {
        try {
            console.log('开始加载元件数据到设计器...');

            // 再次检查元件设计器是否可用
            if (!window.componentDesigner) {
                throw new Error('元件设计器不可用');
            }

            if (!window.componentDesigner.initialized) {
                throw new Error('元件设计器尚未完全初始化');
            }

            // 填充表单字段
            this.populateDesignerForm(component);

            // 加载元件数据到设计器
            this.loadComponentDataToDesigner(component);

            console.log('元件数据已加载到设计器:', component.name);

            // 验证数据是否正确加载
            const currentDesigner = window.componentDesigner;
            if (currentDesigner && currentDesigner.component) {
                console.log('加载的元件数据:', {
                    name: currentDesigner.component.name,
                    dimensions: currentDesigner.component.dimensions,
                    pinsCount: Object.values(currentDesigner.component.pins).reduce((sum, pins) => sum + pins.length, 0)
                });
            }

            console.log('元件数据加载完成');
        } catch (error) {
            console.error('加载元件数据到设计器失败:', error);
            console.error('错误详情:', {
                message: error.message,
                stack: error.stack,
                component: component.name
            });
            alert('加载元件数据失败: ' + error.message);
        }
    }

    /**
     * 填充设计器表单字段
     * @param {Object} component - 元件对象
     */
    populateDesignerForm(component) {
        const nameInput = document.getElementById('component-name');
        const categorySelect = document.getElementById('component-category');
        const descriptionTextarea = document.getElementById('component-description');
        const widthInput = document.getElementById('component-width');
        const heightInput = document.getElementById('component-height');

        if (nameInput) nameInput.value = component.name || '';
        if (categorySelect) categorySelect.value = component.category || 'other';
        if (descriptionTextarea) descriptionTextarea.value = component.description || '';
        if (widthInput && component.dimensions) widthInput.value = component.dimensions.width || 100;
        if (heightInput && component.dimensions) heightInput.value = component.dimensions.height || 80;
    }

    /**
     * 将元件数据加载到元件设计器对象
     * @param {Object} component - 元件对象
     */
    loadComponentDataToDesigner(component) {
        console.log('开始将元件数据加载到设计器对象...');

        const designer = window.componentDesigner;

        if (!designer) {
            throw new Error('元件设计器实例不存在');
        }

        // 设置编辑模式标识
        designer.isEditingExisting = true;
        designer.originalComponentId = component.id;
        designer.originalComponentName = component.name;

        // 更新元件设计器的数据
        designer.component = {
            name: component.name || '',
            id: component.id || '',
            description: component.description || '',
            category: component.category || 'other',
            dimensions: component.dimensions || { width: 100, height: 80 },
            pins: component.pins || {
                side1: [],
                side2: [],
                side3: [],
                side4: []
            }
        };

        // 更新元件矩形位置和尺寸
        if (component.dimensions) {
            const originalWidth = component.dimensions.width;
            const originalHeight = component.dimensions.height;

            // 首先设置原始尺寸
            designer.componentRect = {
                x: 200 - (originalWidth / 2),
                y: 150 - (originalHeight / 2),
                width: originalWidth,
                height: originalHeight
            };

            console.log('设置元件原始尺寸:', { width: originalWidth, height: originalHeight });

            // 然后运行自动尺寸调整，确保引脚正确显示
            if (designer.renderer) {
                const calculator = new PinPositionCalculator(designer.componentRect, designer);
                const sizeChanged = calculator.adjustComponentSizeForPins(component);

                if (sizeChanged) {
                    // 获取自动调整后的尺寸
                    const autoWidth = designer.componentRect.width;
                    const autoHeight = designer.componentRect.height;

                    console.log('自动调整元件尺寸:', {
                        original: `${originalWidth}x${originalHeight}`,
                        adjusted: `${autoWidth}x${autoHeight}`
                    });

                    // 重新计算居中位置
                    designer.componentRect.x = 200 - (autoWidth / 2);
                    designer.componentRect.y = 150 - (autoHeight / 2);
                }
            }

            // 确保渲染器也更新了尺寸
            if (designer.renderer && designer.renderer.componentRect) {
                designer.renderer.componentRect = designer.componentRect;
            }
        }

        // 确保渲染器存在
        if (!designer.renderer) {
            console.warn('渲染器不存在，尝试重新初始化');
            return;
        }

        // 强制重新渲染设计器
        try {

            // 确保渲染器有最新的引用
            if (designer.renderer && designer.renderer.designer !== designer) {
                console.log('更新渲染器引用');
                designer.renderer.designer = designer;
            }

            if (!designer.renderer) {
                throw new Error('渲染器不存在');
            }

            // 先清空画布
            designer.renderer.clearCanvas();

            // 重新渲染元件
            designer.renderer.render();

            // 确保尺寸输入框同步更新最新的尺寸（可能是自动调整后的尺寸）
            if (designer.syncDimensionsToInputs) {
                designer.syncDimensionsToInputs();
            }

            // 再次填充表单，确保输入框显示正确的尺寸
            this.populateDesignerForm(component);
        } catch (error) {
            console.error('渲染元件时出错:', error);
            console.error('渲染器状态:', {
                rendererExists: !!designer.renderer,
                designerExists: !!designer,
                canvasExists: designer.renderer ? !!designer.renderer.canvas : false
            });

            // 尝试强制渲染
            if (designer.renderer && designer.renderer.forceRender) {
                setTimeout(() => {
                    try {
                        designer.renderer.forceRender();
                    } catch (forceError) {
                        console.error('强制渲染也失败:', forceError);
                    }
                }, 100);
            }
        }

        // 更新元件信息显示
        if (designer.updateComponentInfo) {
            designer.updateComponentInfo();
        }

        // 更新状态
        if (designer.updateStatus) {
            designer.updateStatus(`已加载元件: ${component.name}`);
        }
    }

    /**
     * 复用元件 - 跳转到元件绘制页并加载数据（复用模式）
     * @param {Object} component - 元件对象
     */
    reuseComponent(component) {
        console.log('复用元件:', component.name);

        // 重置重试计数器
        this._reuseRetryCount = 0;

        // 先切换到元件绘制页标签，确保页面切换完成后再进行其他操作
        if (window.tabManager) {
            window.tabManager.switchToSubTab('designer');
        }

        // 等待页面切换完成后再继续
        setTimeout(() => {
            this.performReuseOperation(component);
        }, 100); // 增加等待时间到100ms
    }

    /**
     * 执行复用操作的具体逻辑
     * @param {Object} component - 元件对象
     */
    performReuseOperation(component) {
        console.log('开始执行复用操作逻辑');

        // 获取元件设计器实例
        let designer = window.componentDesigner;
        if (!designer) {
            console.warn('元件设计器实例不存在，等待初始化...');
            // 等待一段时间后重试，最多重试10次
            if (!this._reuseRetryCount) {
                this._reuseRetryCount = 0;
            }
            this._reuseRetryCount++;

            if (this._reuseRetryCount < 10) {
                setTimeout(() => {
                    this.performReuseOperation(component);
                }, 200); // 增加等待时间到200ms
            } else {
                console.error('元件设计器初始化超时，无法执行复用操作');
                this._reuseRetryCount = 0; // 重置计数器
            }
            return;
        }

        // 重置重试计数器
        this._reuseRetryCount = 0;

        // 检查设计器是否已初始化
        if (!designer.initialized) {
            console.warn('元件设计器尚未完全初始化，等待初始化完成...');
            // 等待一段时间后重试
            setTimeout(() => {
                this.performReuseOperation(component);
            }, 100);
            return;
        }

        // 设置复用模式标识（强制生成新ID）
        designer.isEditingExisting = false; // 不设置为编辑模式
        designer.originalComponentId = null; // 不保存原始ID
        designer.originalComponentName = null; // 不保存原始名称
        designer.isReuseMode = true; // 新增复用模式标识

        // 更新元件设计器的数据
        designer.component = {
            name: component.name || '',
            id: '', // 复用模式下ID留空，保存时会重新生成
            description: component.description || '',
            category: component.category || 'other',
            dimensions: component.dimensions || { width: 100, height: 80 },
            pins: component.pins || {
                side1: [],
                side2: [],
                side3: [],
                side4: []
            }
        };

        // 立即填充表单，确保UI同步更新
        console.log('填充复用元件表单数据:', {
            name: component.name,
            category: component.category,
            dimensions: component.dimensions
        });
        this.populateDesignerForm(component);

        // 更新元件矩形位置和尺寸
        if (component.dimensions) {
            const originalWidth = component.dimensions.width;
            const originalHeight = component.dimensions.height;

            // 首先设置原始尺寸，使用画布尺寸计算居中位置
            const canvas = designer.canvas;
            let centerX = 200; // 默认值
            let centerY = 150; // 默认值

            if (canvas) {
                const dpr = window.devicePixelRatio || 1;
                centerX = (canvas.width / dpr) / 2;
                centerY = (canvas.height / dpr) / 2;
            }

            designer.componentRect = {
                x: centerX - (originalWidth / 2),
                y: centerY - (originalHeight / 2),
                width: originalWidth,
                height: originalHeight
            };

            console.log('设置复用元件原始尺寸:', { width: originalWidth, height: originalHeight });

            // 运行自动尺寸调整，确保引脚正确显示
            if (designer.pinCalculator && designer.pinCalculator.adjustComponentSizeForPins) {
                const sizeChanged = designer.pinCalculator.adjustComponentSizeForPins(designer.component);
                if (sizeChanged) {
                    const autoWidth = designer.componentRect.width;
                    const autoHeight = designer.componentRect.height;

                    console.log('自动调整复用元件尺寸:', {
                        original: `${originalWidth}x${originalHeight}`,
                        adjusted: `${autoWidth}x${autoHeight}`
                    });

                    // 重新计算居中位置
                    designer.componentRect.x = 200 - (autoWidth / 2);
                    designer.componentRect.y = 150 - (autoHeight / 2);
                }
            }

            // 确保渲染器也更新了尺寸
            if (designer.renderer && designer.renderer.componentRect) {
                designer.renderer.componentRect = designer.componentRect;
            }
        }

        // 渲染元件
        try {
            // 确保渲染器存在
            if (!designer.renderer) {
                console.warn('渲染器不存在，尝试重新初始化');
                designer.setupCanvas();

                if (!designer.renderer) {
                    throw new Error('渲染器不存在');
                }
            }

            // 先清空画布
            designer.renderer.clearCanvas();

            // 重新渲染元件
            designer.renderer.render();

            // 确保尺寸输入框同步更新最新的尺寸（可能是自动调整后的尺寸）
            if (designer.syncDimensionsToInputs) {
                designer.syncDimensionsToInputs();
            }

            // 再次填充表单，确保输入框显示正确的尺寸
            this.populateDesignerForm(component);

        } catch (error) {
            console.error('渲染复用元件时出错:', error);
            console.error('渲染器状态:', {
                rendererExists: !!designer.renderer,
                designerExists: !!designer,
                canvasExists: designer.renderer ? !!designer.renderer.canvas : false
            });

            // 尝试强制渲染
            if (designer.renderer && designer.renderer.forceRender) {
                setTimeout(() => {
                    try {
                        designer.renderer.forceRender();
                    } catch (forceError) {
                        console.error('强制渲染也失败:', forceError);
                    }
                }, 100);
            }
        }

        // 更新元件信息显示
        if (designer.updateComponentInfo) {
            designer.updateComponentInfo();
        }

        // 更新状态
        if (designer.updateStatus) {
            designer.updateStatus(`已复用元件: ${component.name} (将生成新ID)`);
        }

        console.log('复用操作完成');
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

    /**
     * 绑定管理相关事件
     */
    bindManagementEvents() {
        // 绑定所有管理按钮
        const manageButtons = [
            'manage-components-btn',        // 预览页面
            'manage-standard-components-btn', // 标准元件页面
            'manage-custom-components-btn'    // 自制元件页面
        ];

        manageButtons.forEach(buttonId => {
            const manageBtn = document.getElementById(buttonId);
            if (manageBtn) {
                manageBtn.addEventListener('click', () => {
                    const pageType = this.getPageTypeFromButtonId(buttonId);
                    this.toggleManagementMode(pageType);
                });
            }
        });

        // 绑定所有网格的勾选框事件（使用事件委托）
        const gridIds = [
            'components-grid',           // 预览页面
            'standard-components-grid',  // 标准元件页面
            'custom-components-grid'     // 自制元件页面
        ];

        gridIds.forEach(gridId => {
            const componentsGrid = document.getElementById(gridId);
            if (componentsGrid) {
                componentsGrid.addEventListener('change', (e) => {
                    if (e.target.type === 'checkbox' && e.target.dataset.componentId) {
                        const pageType = this.getPageTypeFromGridId(gridId);
                        this.handleComponentSelection(e.target.dataset.componentId, e.target.checked, pageType);
                    }
                });
            }
        });
    }

    /**
     * 根据网格ID获取页面类型
     * @param {string} gridId - 网格ID
     * @returns {string} 页面类型
     */
    getPageTypeFromGridId(gridId) {
        if (gridId === 'standard-components-grid') {
            return 'standard';
        } else if (gridId === 'custom-components-grid') {
            return 'custom';
        } else {
            return 'preview';
        }
    }

    /**
     * 切换管理模式
     * @param {string} pageType - 页面类型 ('preview', 'standard', 'custom')
     */
    toggleManagementMode(pageType = 'preview') {
        const pageState = this.getPageState(pageType);
        const buttonId = pageType === 'standard' ? 'manage-standard-components-btn' :
                        pageType === 'custom' ? 'manage-custom-components-btn' :
                        'manage-components-btn';
        const manageBtn = document.getElementById(buttonId);
        const deleteText = manageBtn.querySelector('.delete-text');

        try {
            // 如果当前在管理模式且有选中项，执行删除操作
            if (pageState.managementMode && pageState.selectedComponents.size > 0) {
                this.showDeleteConfirmation(pageType);
                return;
            }

            // 如果当前在管理模式且没有选中项，点击"返回预览"退出管理模式
            if (pageState.managementMode && pageState.selectedComponents.size === 0) {
                pageState.managementMode = false;
                manageBtn.classList.remove('management-mode');
                const manageText = manageBtn.querySelector('.manage-text');
                manageText.style.display = 'inline';
                deleteText.style.display = 'none';
                pageState.selectedComponents.clear();
                this.updateManagementModeUI(pageType);
                console.log(`管理模式: 关闭 (${pageType}页面返回预览)`);
                return;
            }

            // 切换到管理模式
            pageState.managementMode = !pageState.managementMode;
            const manageText = manageBtn.querySelector('.manage-text');

            if (pageState.managementMode) {
                // 进入管理模式
                manageBtn.classList.add('management-mode');
                manageText.style.display = 'none';
                deleteText.style.display = 'inline';
                this.updateManagementModeUI(pageType);
                console.log(`管理模式: 开启 (${pageType}页面)`);
            } else {
                // 退出管理模式
                manageBtn.classList.remove('management-mode');
                manageText.style.display = 'inline';
                deleteText.style.display = 'none';
                pageState.selectedComponents.clear();
                this.updateManagementModeUI(pageType);
                console.log(`管理模式: 关闭 (${pageType}页面)`);
            }
        } catch (error) {
            console.error('切换管理模式时出错:', error);
        }
    }

    /**
     * 重置管理模式状态
     */
    resetManagementMode(pageType = 'preview') {
        const pageState = this.getPageState(pageType);

        if (pageState.managementMode || pageState.selectedComponents.size > 0) {
            pageState.managementMode = false;
            pageState.selectedComponents.clear();

            // 同时更新向后兼容的属性（针对preview页面）
            if (pageType === 'preview') {
                this.managementMode = false;
                this.selectedComponents.clear();
            }

            // 重置管理按钮状态
            const buttonId = pageType === 'standard' ? 'manage-standard-components-btn' :
                            pageType === 'custom' ? 'manage-custom-components-btn' :
                            'manage-components-btn';
            const manageBtn = document.getElementById(buttonId);
            if (manageBtn) {
                const manageText = manageBtn.querySelector('.manage-text');
                const deleteText = manageBtn.querySelector('.delete-text');

                manageBtn.classList.remove('management-mode');
                manageText.style.display = 'inline';
                deleteText.style.display = 'none';
                manageText.textContent = '元件管理'; // 确保文本正确
            }

            // 重置所有卡片状态
            this.updateManagementModeUI(pageType);

            console.log(`管理模式状态已重置 (${pageType}页面)`);
        }
    }

    /**
     * 更新管理模式UI
     */
    updateManagementModeUI(pageType = 'preview') {
        const pageState = this.getPageState(pageType);

        // 根据页面类型确定正确的元素
        const gridId = pageType === 'standard' ? 'standard-components-grid' :
                      pageType === 'custom' ? 'custom-components-grid' :
                      'components-grid';
        const buttonId = pageType === 'standard' ? 'manage-standard-components-btn' :
                        pageType === 'custom' ? 'manage-custom-components-btn' :
                        'manage-components-btn';

        const cards = document.querySelectorAll(`#${gridId} .component-card`);
        const manageBtn = document.getElementById(buttonId);
        const manageText = manageBtn.querySelector('.manage-text');
        const deleteText = manageBtn.querySelector('.delete-text');

        cards.forEach(card => {
            if (pageState.managementMode) {
                card.classList.add('management-mode');
                card.classList.remove('selected');

                // 设置勾选框状态
                const checkbox = card.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = pageState.selectedComponents.has(card.dataset.componentId);
                    if (checkbox.checked) {
                        card.classList.add('selected');
                    }
                }
            } else {
                card.classList.remove('management-mode', 'selected');
            }
        });

        // 更新按钮文本
        if (pageState.managementMode) {
            if (pageState.selectedComponents.size > 0) {
                deleteText.textContent = '删除元件';
            } else {
                deleteText.textContent = '返回预览';
            }
        } else {
            manageText.style.display = 'inline';
            deleteText.style.display = 'none';
            manageText.textContent = '元件管理'; // 确保退出管理模式时显示正确的文本
        }
    }

    /**
     * 处理元件选择
     */
    handleComponentSelection(componentId, isSelected, pageType = 'preview') {
        const pageState = this.getPageState(pageType);

        if (isSelected) {
            pageState.selectedComponents.add(componentId);
        } else {
            pageState.selectedComponents.delete(componentId);
        }

        // 更新UI
        const card = document.querySelector(`[data-component-id="${componentId}"]`);
        if (card) {
            if (isSelected) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }

        // 更新按钮状态
        this.updateManagementModeUI(pageType);

        console.log(`元件 ${componentId} ${isSelected ? '选中' : '取消选中'} (${pageType}页面), 当前选中: ${pageState.selectedComponents.size}`);
    }

    /**
     * 显示删除确认对话框
     * @param {string} pageType - 页面类型 ('preview', 'standard', 'custom')
     */
    showDeleteConfirmation(pageType = 'preview') {
        console.log(`showDeleteConfirmation 被调用 (${pageType}页面)`);

        try {
            const pageState = this.getPageState(pageType);
            const count = pageState.selectedComponents.size;

            // 创建自定义确认对话框，避免使用浏览器的confirm
            this.showCustomDeleteConfirmation(count, pageType);
        } catch (error) {
            console.error('显示删除确认对话框时出错:', error);
        }
    }

    /**
     * 显示自定义删除确认对话框
     * @param {number} count - 要删除的元件数量
     * @param {string} pageType - 页面类型 ('preview', 'standard', 'custom')
     */
    showCustomDeleteConfirmation(count, pageType = 'preview') {
        console.log(`开始创建自定义删除确认对话框 (${pageType}页面)...`);

        let dialog = null;

        try {
            // 检查document.body是否存在
            if (!document.body) {
                console.error('document.body不存在，无法显示对话框');
                return;
            }

            // 创建对话框容器
            dialog = document.createElement('div');
            dialog.className = 'delete-confirmation-dialog';
            console.log('对话框元素已创建');

            dialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>确认删除</h3>
                    </div>
                    <div class="dialog-body">
                        <p>确定要删除选中的 <strong>${count}</strong> 个元件吗？</p>
                        <p class="warning-text">此操作不可撤销！</p>
                    </div>
                    <div class="dialog-footer">
                        <button class="cancel-btn">取消</button>
                        <button class="confirm-btn">确定删除</button>
                    </div>
                </div>
            `;

            // 添加到页面
            document.body.appendChild(dialog);
            console.log('对话框已添加到页面');

            // 验证对话框是否真的添加到了页面
            const dialogs = document.querySelectorAll('.delete-confirmation-dialog');
            console.log(`页面中找到 ${dialogs.length} 个删除确认对话框`);

            // 绑定事件
            const cancelBtn = dialog.querySelector('.cancel-btn');
            const confirmBtn = dialog.querySelector('.confirm-btn');
            const backdrop = dialog.querySelector('.dialog-backdrop');

            console.log('开始绑定事件...');
            console.log('取消按钮:', cancelBtn);
            console.log('确认按钮:', confirmBtn);
            console.log('背景:', backdrop);

            if (!cancelBtn || !confirmBtn || !backdrop) {
                console.error('对话框元素未找到，无法绑定事件');
                return;
            }

            const closeDialog = () => {
                dialog.classList.add('hide');
                setTimeout(() => {
                    if (dialog.parentNode) {
                        dialog.parentNode.removeChild(dialog);
                    }
                }, 300);
                this.isProcessingAction = false;
            };

            cancelBtn.addEventListener('click', () => {
                console.log('用户取消了删除操作');
                closeDialog();
            });

            confirmBtn.addEventListener('click', () => {
                console.log(`用户确认删除操作 (${pageType}页面)`);
                closeDialog();
                // 执行删除操作
                this.deleteSelectedComponents(pageType);
            });

            backdrop.addEventListener('click', () => {
                console.log('点击背景取消删除操作');
                closeDialog();
            });

            // ESC键关闭
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    console.log('按ESC取消删除操作');
                    closeDialog();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);

            console.log('自定义删除确认对话框已显示');
        } catch (error) {
            console.error('创建或绑定对话框时出错:', error);
            this.isProcessingAction = false;

            // 如果对话框已经创建但绑定失败，尝试移除它
            if (dialog && dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        }
    }

    /**
     * 删除选中的元件
     * @param {string} pageType - 页面类型 ('preview', 'standard', 'custom')
     */
    async deleteSelectedComponents(pageType = 'preview') {
        const pageState = this.getPageState(pageType);
        console.log(`开始删除选中的元件 (${pageType}页面):`, Array.from(pageState.selectedComponents));

        let deletedCount = 0;
        const deletePromises = [];

        for (const componentId of pageState.selectedComponents) {
            // 查找元件信息
            const component = this.components.find(c => c.id === componentId);
            if (component) {
                deletePromises.push(this.deleteComponent(component));
                deletedCount++;
            }
        }

        try {
            await Promise.all(deletePromises);
            console.log(`成功删除了 ${deletedCount} 个元件`);

            // 重新加载元件库（根据页面类型）
            if (pageType === 'standard') {
                await this.loadComponents('standard');
            } else if (pageType === 'custom') {
                await this.loadComponents('custom');
            } else {
                // preview页面或其他情况，加载所有元件
                await this.loadComponents('all');
            }

            // 直接退出管理模式，不使用toggleManagementMode避免重复处理
            const pageState = this.getPageState(pageType);
            pageState.managementMode = false;
            pageState.selectedComponents.clear();

            // 同时更新向后兼容的属性（针对preview页面）
            if (pageType === 'preview') {
                this.managementMode = false;
                this.selectedComponents.clear();
            }

            const buttonId = pageType === 'standard' ? 'manage-standard-components-btn' :
                            pageType === 'custom' ? 'manage-custom-components-btn' :
                            'manage-components-btn';
            const manageBtn = document.getElementById(buttonId);
            if (manageBtn) {
                const manageText = manageBtn.querySelector('.manage-text');
                const deleteText = manageBtn.querySelector('.delete-text');
                manageBtn.classList.remove('management-mode');
                manageText.style.display = 'inline';
                deleteText.style.display = 'none';
                manageText.textContent = '元件管理';
            }

            this.updateManagementModeUI(pageType);

            // 显示成功消息
            if (window.showNotification) {
                window.showNotification(`成功删除了 ${deletedCount} 个元件`, 'success', 4000);
            } else {
                alert(`成功删除了 ${deletedCount} 个元件`);
            }

            console.log('删除操作完成，管理模式已退出');
        } catch (error) {
            console.error('删除元件失败:', error);
            if (window.showNotification) {
                window.showNotification('删除元件失败，请重试', 'error', 4000);
            } else {
                alert('删除元件失败，请重试');
            }
        } finally {
            // 无论成功还是失败，都要重置处理状态
            this.isProcessingAction = false;
        }
    }

    /**
     * 删除单个元件
     */
    async deleteComponent(component) {
        try {
            console.log(`删除元件: ${component.name} (${component.id})`);

            // 调用主进程删除方法
            if (window.electronAPI && window.electronAPI.deleteComponent) {
                const result = await window.electronAPI.deleteComponent(component);
                if (result.success) {
                    console.log(`元件 ${component.name} 删除成功`);
                } else {
                    throw new Error(result.error || '删除失败');
                }
            } else {
                throw new Error('Electron API 不可用');
            }
        } catch (error) {
            console.error(`删除元件 ${component.name} 失败:`, error);
            throw error;
        }
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
