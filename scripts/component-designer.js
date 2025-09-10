/**
 * Fast Hardware - 元件设计器
 * 实现元件绘制功能的核心逻辑
 */

class ComponentDesigner {
    constructor() {
        this.component = {
            name: '',
            id: '',
            description: '',
            category: 'other',
            dimensions: { width: 100, height: 80 },
            pins: {
                side1: [], // 上边
                side2: [], // 右边
                side3: [], // 下边
                side4: []  // 左边
            }
        };

        this.canvas = null;
        this.ctx = null;
        this.renderer = null;
        this.interactionManager = null;
        this.initialized = false;

        // 添加选中状态
        this.selectedSide = null; // 当前选中的边：'side1', 'side2', 'side3', 'side4'

        const success = this.init();
        if (success) {
            this.initialized = true;
        }
    }

    /**
     * 初始化元件设计器
     */
    init() {
        console.log('初始化元件设计器...');

        // 绑定DOM元素
        if (!this.bindElements()) {
            console.error('元件设计器初始化失败：DOM元素绑定失败');
            return false;
        }

        // 设置画布
        this.setupCanvas();

        // 绑定事件
        this.bindEvents();

        // 更新状态
        this.updateStatus('元件设计器已就绪');
        console.log('元件设计器初始化完成');

        return true;
    }

    /**
     * 绑定DOM元素
     */
    bindElements() {
        this.elements = {
            nameInput: document.getElementById('component-name'),
            categorySelect: document.getElementById('component-category'),
            descriptionTextarea: document.getElementById('component-description'),
            resetBtn: document.getElementById('reset-designer'),
            saveBtn: document.getElementById('save-component'),
            canvas: document.getElementById('component-designer-canvas'),
            statusMessage: document.getElementById('status-message'),
            componentInfo: document.getElementById('component-info'),
            resetComponentBtn: document.getElementById('reset-component'),
            undoBtn: document.getElementById('undo-action')
        };

        // 检查关键元素是否存在
        const missingElements = [];
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
                missingElements.push(key);
            }
        });

        if (missingElements.length > 0) {
            console.warn('元件设计器缺少以下DOM元素:', missingElements);
            return false;
        }

        console.log('元件设计器DOM元素绑定成功');
        return true;
    }

    /**
     * 设置画布
     */
    setupCanvas() {
        this.canvas = this.elements.canvas;
        if (!this.canvas) {
            console.error('找不到元件设计画布元素');
            return;
        }

        this.ctx = this.canvas.getContext('2d');

        // 创建渲染器
        this.renderer = new SimpleCanvasRenderer(this.canvas, this);

        // 创建交互管理器
        this.interactionManager = new SimpleInteractionManager(this.canvas, this);

        // 初次渲染
        this.render();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 表单输入事件
        if (this.elements.nameInput) {
            this.elements.nameInput.addEventListener('input', (e) => {
                this.component.name = e.target.value.trim();
                this.generateComponentId();
                this.updateComponentInfo();
            });
        }

        if (this.elements.categorySelect) {
            this.elements.categorySelect.addEventListener('change', (e) => {
                this.component.category = e.target.value;
                this.updateStatus(`类别已更改为: ${this.getCategoryDisplayName(e.target.value)}`);
            });
        }

        if (this.elements.descriptionTextarea) {
            this.elements.descriptionTextarea.addEventListener('input', (e) => {
                this.component.description = e.target.value.trim();
            });
        }

        // 按钮事件
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => this.resetDesigner());
        }

        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', () => this.saveComponent());
        }

        if (this.elements.resetComponentBtn) {
            this.elements.resetComponentBtn.addEventListener('click', () => this.resetComponent());
        }

        // 重置视图按钮
        const resetViewBtn = document.getElementById('reset-view-designer');

        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => this.renderer.resetView());
        }

        // 撤销按钮（暂时禁用）
        if (this.elements.undoBtn) {
            this.elements.undoBtn.disabled = true;
            this.elements.undoBtn.addEventListener('click', () => this.undo());
        }
    }

    /**
     * 渲染画布
     */
    render() {
        if (this.renderer) {
            this.renderer.render();
        } else {
            console.warn('渲染器未初始化，无法渲染画布');
        }
    }

    /**
     * 重置设计器
     */
    resetDesigner() {
        if (confirm('确定要重置整个设计器吗？这将清除所有未保存的内容。')) {
            this.component = {
                name: '',
                id: '',
                description: '',
                category: 'other',
                dimensions: { width: 100, height: 80 },
                pins: {
                    side1: [],
                    side2: [],
                    side3: [],
                    side4: []
                }
            };

            // 清空表单
            if (this.elements.nameInput) this.elements.nameInput.value = '';
            if (this.elements.categorySelect) this.elements.categorySelect.value = 'other';
            if (this.elements.descriptionTextarea) this.elements.descriptionTextarea.value = '';

            // 清除选中状态
            this.selectedSide = null;

            this.updateComponentInfo();
            this.render();
            this.updateStatus('设计器已重置');
        }
    }

    /**
     * 重置元件（清除引脚）
     */
    resetComponent() {
        if (confirm('确定要清除所有引脚吗？')) {
            this.component.pins = {
                side1: [],
                side2: [],
                side3: [],
                side4: []
            };

            // 清除选中状态
            this.selectedSide = null;

            this.updateComponentInfo();
            this.render();
            this.updateStatus('元件引脚已清除');
        }
    }

    /**
     * 保存元件
     */
    async saveComponent() {
        // 验证数据
        if (!this.component.name || this.component.name.trim() === '') {
            alert('请填写元件名称');
            return;
        }

        if (!this.component.description || this.component.description.trim() === '') {
            alert('请填写元件描述');
            return;
        }

        // 验证引脚数据
        const validationErrors = this.validateComponentData();
        if (validationErrors.length > 0) {
            alert('数据验证失败:\n' + validationErrors.join('\n'));
            return;
        }

        try {
            // 生成最终的元件数据
            const finalComponent = {
                ...this.component,
                id: this.generateComponentId(),
                specifications: {},
                designMetadata: {
                    createdAt: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    canvasState: {
                        zoom: 1.0,
                        panX: 0,
                        panY: 0
                    }
                }
            };

            // 保存到文件系统
            await this.saveComponentToFile(finalComponent);

            console.log('保存元件:', finalComponent);
            this.updateStatus(`元件 "${this.component.name}" 保存成功`);

        } catch (error) {
            console.error('保存元件失败:', error);
            alert('保存失败: ' + error.message);
        }
    }

    /**
     * 验证元件数据
     */
    validateComponentData() {
        const errors = [];

        // 验证引脚数据
        Object.keys(this.component.pins).forEach(side => {
            const sidePins = this.component.pins[side];
            const sideName = this.getSideDisplayName(side);

            sidePins.forEach((pin, index) => {
                // 检查引脚名称
                if (!pin.pinName || pin.pinName.trim() === '') {
                    errors.push(`${sideName}的第${index + 1}个引脚名称不能为空`);
                }

                // 检查引脚名称唯一性（全局唯一）
                const duplicate = this.findDuplicatePinName(pin.pinName, side, index);
                if (duplicate) {
                    errors.push(`引脚名称 "${pin.pinName}" 重复`);
                }

                // 检查引脚类型
                const validTypes = ['power', 'ground', 'digital_io', 'analog_io', 'communication'];
                if (!validTypes.includes(pin.type)) {
                    errors.push(`${sideName}的第${index + 1}个引脚类型无效`);
                }
            });
        });

        return errors;
    }

    /**
     * 查找重复的引脚名称
     */
    findDuplicatePinName(pinName, currentSide, currentIndex) {
        for (const [side, pins] of Object.entries(this.component.pins)) {
            for (let i = 0; i < pins.length; i++) {
                if (pins[i].pinName === pinName &&
                    !(side === currentSide && i === currentIndex)) {
                    return { side, index: i };
                }
            }
        }
        return null;
    }

    /**
     * 保存元件到文件
     */
    async saveComponentToFile(component) {
        const fs = require('fs').promises;
        const path = require('path');

        // 创建元件库目录（如果不存在）
        const componentsDir = path.join(__dirname, '..', 'data', 'system-components', 'custom');
        await fs.mkdir(componentsDir, { recursive: true });

        // 生成文件名
        const fileName = `${component.id}.json`;
        const filePath = path.join(componentsDir, fileName);

        // 保存JSON文件
        const jsonContent = JSON.stringify(component, null, 2);
        await fs.writeFile(filePath, jsonContent, 'utf8');

        console.log(`元件已保存到: ${filePath}`);
    }

    /**
     * 生成元件ID
     */
    generateComponentId() {
        if (this.component.name) {
            // 将名称转换为小写，并用-替换空格和其他特殊字符
            this.component.id = `custom-${this.component.name
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '') // 移除特殊字符
                .replace(/\s+/g, '-') // 替换空格为-
                .replace(/-+/g, '-') // 合并多个-
                .replace(/^-|-$/g, '') // 移除开头和结尾的-
            }-${Date.now()}`;
        } else {
            this.component.id = '';
        }
    }

    /**
     * 获取类别显示名称
     */
    getCategoryDisplayName(category) {
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
     * 更新状态消息
     */
    updateStatus(message) {
        if (this.elements.statusMessage) {
            this.elements.statusMessage.textContent = message;
        }
    }

    /**
     * 更新元件信息显示
     */
    updateComponentInfo() {
        const pinCount = Object.values(this.component.pins)
            .reduce((total, pins) => total + pins.length, 0);

        const name = this.component.name || '未命名';

        if (this.elements.componentInfo) {
            this.elements.componentInfo.textContent = `元件: ${name} | 引脚: ${pinCount}个`;
        }
    }

    /**
     * 撤销操作（占位符）
     */
    undo() {
        this.updateStatus('撤销功能将在后续阶段实现');
    }

    /**
     * 重做操作（占位符）
     */
    redo() {
        this.updateStatus('重做功能将在后续阶段实现');
    }

    /**
     * 显示引脚编辑器（由交互管理器调用）
     */
    showPinEditor(side) {
        // 更新选中状态
        this.selectedSide = side;

        // 重新渲染以显示选中效果
        this.render();

        // 创建并显示引脚编辑器模态框
        const pinEditor = new PinEditorModal(side, this);
        pinEditor.show();

        // 更新状态信息
        this.updateStatus(`正在编辑元件${this.getSideDisplayName(side)}的引脚`);
    }

    /**
     * 获取边的显示名称
     */
    getSideDisplayName(side) {
        const sideNames = {
            'side1': '上边',
            'side2': '右边',
            'side3': '下边',
            'side4': '左边'
        };

        return sideNames[side] || side;
    }
}

/**
 * 简单画布渲染器
 */
class SimpleCanvasRenderer {
    constructor(canvas, designer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.designer = designer; // 引用设计器实例

        // 缩放和平移状态
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.minScale = 0.1;
        this.maxScale = 3.0;

        // 格线大小
        this.gridSize = 20;

        // 元件尺寸调整为对齐格线 (120x80, 120是20*6, 80是20*4)
        this.componentRect = {
            x: Math.floor(canvas.width / 2 / this.gridSize) * this.gridSize - 60, // 居中并对齐格线
            y: Math.floor(canvas.height / 2 / this.gridSize) * this.gridSize - 40,
            width: 120, // 6个格子宽
            height: 80   // 4个格子高
        };

        // 初始化画布尺寸
        this.resizeCanvas();
        this.resetView();

        // 监听窗口大小改变
        window.addEventListener('resize', () => this.resizeCanvas());

        // 设置初始鼠标光标
        this.canvas.style.cursor = 'grab';

        // 添加窗口resize监听器
        this.addResizeListener();

        // 添加页面可见性监听器
        this.addVisibilityListener();
    }

    /**
     * 添加窗口resize监听器
     */
    addResizeListener() {
        // 防抖处理resize事件
        let resizeTimeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.resizeCanvas();
            }, 100);
        };

        window.addEventListener('resize', handleResize);
    }

    /**
     * 添加页面可见性监听器
     */
    addVisibilityListener() {
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // 页面变为可见时，强制重新渲染
                setTimeout(() => {
                    this.forceRender();
                }, 50);
            }
        });

        // 监听画布容器的Intersection Observer
        const container = this.canvas.parentElement;
        if (container && window.IntersectionObserver) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // 画布变为可见时，强制重新渲染
                        setTimeout(() => {
                            this.forceRender();
                        }, 100);
                    }
                });
            }, {
                threshold: 0.1 // 当10%的画布可见时触发
            });

            observer.observe(container);
        }
    }

    /**
     * 强制重新渲染画布
     */
    forceRender() {
        if (this.canvas && this.ctx && this.designer) {
            // 确保画布有正确的尺寸
            const container = this.canvas.parentElement;
            if (container) {
                const rect = container.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;

                // 检查尺寸是否需要更新
                if (this.canvas.width !== rect.width * dpr || this.canvas.height !== rect.height * dpr) {
                    this.canvas.width = rect.width * dpr;
                    this.canvas.height = rect.height * dpr;
                    this.canvas.style.width = rect.width + 'px';
                    this.canvas.style.height = rect.height + 'px';

                    // 重新设置上下文
                    this.ctx = this.canvas.getContext('2d');
                    this.ctx.scale(dpr, dpr);

                    // 更新元件位置
                    this.updateComponentPosition();
                }
            }

            // 强制重新渲染
            this.designer.render();
            console.log('元件设计器强制重新渲染完成');
        }
    }

    render() {
        this.clearCanvas();

        // 保存上下文
        this.ctx.save();

        // 应用变换
        this.applyTransform();

        // 绘制网格
        this.drawGrid();

        // 绘制元件和引脚
        this.drawComponentBody();
        this.drawSelectedSide();
        this.drawPins();

        // 恢复上下文
        this.ctx.restore();

        // 更新缩放显示
        this.updateZoomDisplay();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 调整画布尺寸适应容器
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // 设置画布的实际尺寸
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        // 设置画布的显示尺寸
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // 缩放画布上下文以匹配设备像素比
        this.ctx.scale(dpr, dpr);

        // 更新元件位置以保持居中
        this.updateComponentPosition();

        // 强制重新渲染
        this.designer.render();
    }

    /**
     * 更新元件位置使其居中并对齐格线
     */
    updateComponentPosition() {
        const canvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = this.canvas.height / (window.devicePixelRatio || 1);

        this.componentRect.x = Math.floor(canvasWidth / 2 / this.gridSize) * this.gridSize - this.componentRect.width / 2;
        this.componentRect.y = Math.floor(canvasHeight / 2 / this.gridSize) * this.gridSize - this.componentRect.height / 2;
    }

    /**
     * 重置视图
     */
    resetView() {
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateZoomDisplay();
        this.designer.render();

        // 设置鼠标光标为抓取状态
        if (this.designer.interactionManager) {
            this.designer.interactionManager.canvas.style.cursor = 'grab';
        }
    }

    /**
     * 缩放画布
     */
    zoom(factor, centerX, centerY) {
        const renderer = this;

        // 计算缩放前的世界坐标
        const worldX = (centerX - renderer.offsetX) / renderer.scale;
        const worldY = (centerY - renderer.offsetY) / renderer.scale;

        // 应用缩放
        renderer.scale *= factor;
        renderer.scale = Math.max(renderer.minScale, Math.min(renderer.maxScale, renderer.scale));

        // 调整偏移以保持缩放中心不变
        renderer.offsetX = centerX - worldX * renderer.scale;
        renderer.offsetY = centerY - worldY * renderer.scale;

        renderer.updateZoomDisplay();
        this.designer.render();

        this.designer.updateStatus(`缩放: ${(renderer.scale * 100).toFixed(0)}%`);
    }

    /**
     * 放大
     */
    zoomIn() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.zoom(1.2, centerX, centerY);
    }

    /**
     * 缩小
     */
    zoomOut() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.zoom(0.8, centerX, centerY);
    }

    /**
     * 更新缩放显示
     */
    updateZoomDisplay() {
        const zoomPercent = Math.round(this.scale * 100);
        const zoomLevelElement = document.getElementById('designer-zoom-level');
        if (zoomLevelElement) {
            zoomLevelElement.textContent = `${zoomPercent}%`;
        }
    }

    /**
     * 应用画布变换
     */
    applyTransform() {
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
    }

    /**
     * 绘制网格背景
     */
    drawGrid() {
        const gridSize = this.gridSize;

        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1 / this.scale;

        // 计算可见区域
        const startX = Math.floor(-this.offsetX / this.scale / gridSize) * gridSize;
        const endX = Math.ceil((-this.offsetX + this.canvas.width) / this.scale / gridSize) * gridSize;
        const startY = Math.floor(-this.offsetY / this.scale / gridSize) * gridSize;
        const endY = Math.ceil((-this.offsetY + this.canvas.height) / this.scale / gridSize) * gridSize;

        // 绘制垂直线
        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }

        // 绘制水平线
        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }
    }

    drawComponentBody() {
        // 绘制元件主体矩形
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.fillRect(
            this.componentRect.x,
            this.componentRect.y,
            this.componentRect.width,
            this.componentRect.height
        );
        this.ctx.strokeRect(
            this.componentRect.x,
            this.componentRect.y,
            this.componentRect.width,
            this.componentRect.height
        );
    }

    /**
     * 绘制选中的边（红色高亮）
     */
    drawSelectedSide() {
        if (!this.designer.selectedSide) {
            return; // 没有选中的边
        }

        const rect = this.componentRect;
        this.ctx.strokeStyle = '#ff4444'; // 红色
        this.ctx.lineWidth = 3 / this.scale; // 线条宽度随缩放调整
        this.ctx.lineCap = 'round';

        switch (this.designer.selectedSide) {
            case 'side1': // 上边
                this.ctx.beginPath();
                this.ctx.moveTo(rect.x, rect.y);
                this.ctx.lineTo(rect.x + rect.width, rect.y);
                this.ctx.stroke();
                break;

            case 'side2': // 右边
                this.ctx.beginPath();
                this.ctx.moveTo(rect.x + rect.width, rect.y);
                this.ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
                this.ctx.stroke();
                break;

            case 'side3': // 下边
                this.ctx.beginPath();
                this.ctx.moveTo(rect.x, rect.y + rect.height);
                this.ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
                this.ctx.stroke();
                break;

            case 'side4': // 左边
                this.ctx.beginPath();
                this.ctx.moveTo(rect.x, rect.y);
                this.ctx.lineTo(rect.x, rect.y + rect.height);
                this.ctx.stroke();
                break;
        }
    }

    getClickedSide(mouseX, mouseY) {
        // 将鼠标坐标转换为世界坐标
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;

        const rect = this.componentRect;
        const threshold = 10 / this.scale; // 点击阈值随缩放调整

        // 检查上边
        if (Math.abs(worldY - rect.y) < threshold &&
            worldX >= rect.x && worldX <= rect.x + rect.width) {
            return 'side1';
        }

        // 检查右边
        if (Math.abs(worldX - (rect.x + rect.width)) < threshold &&
            worldY >= rect.y && worldY <= rect.y + rect.height) {
            return 'side2';
        }

        // 检查下边
        if (Math.abs(worldY - (rect.y + rect.height)) < threshold &&
            worldX >= rect.x && worldX <= rect.x + rect.width) {
            return 'side3';
        }

        // 检查左边
        if (Math.abs(worldX - rect.x) < threshold &&
            worldY >= rect.y && worldY <= rect.y + rect.height) {
            return 'side4';
        }

        return null;
    }

    /**
     * 绘制引脚
     */
    drawPins() {
        const calculator = new PinPositionCalculator(this.componentRect);
        const allPins = calculator.calculateAllPositions(this.designer.component);

        allPins.forEach(pin => {
            this.drawPin(pin);
        });
    }

    /**
     * 绘制单个引脚
     */
    drawPin(pin) {
        const { position, pinName, type } = pin;

        // 绘制引脚圆点
        this.ctx.beginPath();
        this.ctx.arc(position.x, position.y, 4 / this.scale, 0, 2 * Math.PI);

        // 根据引脚类型设置颜色
        this.ctx.fillStyle = this.getPinColor(type);
        this.ctx.fill();

        // 绘制边框
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.stroke();

        // 绘制引脚标签
        this.drawPinLabel(pin);
    }

    /**
     * 绘制引脚标签
     */
    drawPinLabel(pin) {
        const { position, pinName, side } = pin;

        // 设置标签样式
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.font = `${11 / this.scale}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        let labelX = position.x;
        let labelY = position.y;

        // 根据边调整标签位置（位置也需要随缩放调整）
        const offset = 15 / this.scale;
        switch (side) {
            case 'side1': // 上边
                labelY -= offset;
                break;
            case 'side2': // 右边
                labelX += offset;
                this.ctx.textAlign = 'left';
                break;
            case 'side3': // 下边
                labelY += offset;
                break;
            case 'side4': // 左边
                labelX -= offset;
                this.ctx.textAlign = 'right';
                break;
        }

        // 绘制标签背景
        const textWidth = this.ctx.measureText(pinName).width;
        const padding = 4 / this.scale;
        const labelHeight = 16 / this.scale;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(
            labelX - textWidth/2 - padding,
            labelY - labelHeight/2,
            textWidth + padding * 2,
            labelHeight
        );

        // 绘制标签文字
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(pinName, labelX, labelY);
    }

    /**
     * 根据引脚类型获取颜色
     */
    getPinColor(type) {
        const colorMap = {
            'power': '#dc3545',       // 红色 - 电源
            'ground': '#000000',     // 黑色 - 地
            'digital_io': '#28a745', // 绿色 - 数字I/O
            'analog_io': '#ffc107',  // 黄色 - 模拟I/O
            'communication': '#6f42c1' // 紫色 - 通信
        };

        return colorMap[type] || '#667eea'; // 默认蓝色
    }
}

/**
 * 引脚位置计算器
 */
class PinPositionCalculator {
    constructor(componentRect) {
        this.componentRect = componentRect;
    }

    /**
     * 计算指定边的引脚位置
     */
    calculateSidePositions(pins, side) {
        if (!pins || pins.length === 0) return [];

        const positions = [];
        const rect = this.componentRect;

        pins.forEach((pin, index) => {
            const position = this.getPinPosition(side, index, pins.length);
            positions.push({
                ...pin,
                position: position,
                side: side
            });
        });

        return positions;
    }

    /**
     * 获取单个引脚在边上的位置
     */
    getPinPosition(side, index, totalPins) {
        const rect = this.componentRect;
        const spacing = this.getSpacing(totalPins);

        switch (side) {
            case 'side1': // 上边
                return {
                    x: rect.x + spacing * (index + 1),
                    y: rect.y - 4
                };

            case 'side2': // 右边
                return {
                    x: rect.x + rect.width + 4,
                    y: rect.y + spacing * (index + 1)
                };

            case 'side3': // 下边
                return {
                    x: rect.x + spacing * (index + 1),
                    y: rect.y + rect.height + 4
                };

            case 'side4': // 左边
                return {
                    x: rect.x - 4,
                    y: rect.y + spacing * (index + 1)
                };

            default:
                return { x: 0, y: 0 };
        }
    }

    /**
     * 计算引脚间距
     */
    getSpacing(totalPins) {
        const rect = this.componentRect;
        const maxSpacing = Math.min(rect.width, rect.height) - 20; // 留出边距
        return maxSpacing / (totalPins + 1);
    }

    /**
     * 获取所有引脚的位置信息
     */
    calculateAllPositions(component) {
        const allPositions = [];
        const calculator = new PinPositionCalculator(this.componentRect);

        Object.keys(component.pins).forEach(side => {
            const sidePositions = calculator.calculateSidePositions(component.pins[side], side);
            allPositions.push(...sidePositions);
        });

        return allPositions;
    }
}

/**
 * 引脚编辑器模态框
 */
class PinEditorModal {
    constructor(side, designer) {
        this.side = side;
        this.designer = designer;
        this.pins = [...this.designer.component.pins[side]]; // 复制当前引脚数据
        this.modal = null;
        this.isVisible = false;
        this.createModal();
    }

    createModal() {
        // 创建模态框HTML结构
        const modalHTML = `
            <div class="pin-editor-modal hidden" id="pin-editor-modal">
                <div class="modal-content">
                    <div class="pin-editor-header">
                        <h3 class="pin-editor-title">编辑引脚 - ${this.designer.getSideDisplayName(this.side)}</h3>
                        <button class="pin-editor-close" id="pin-editor-close">&times;</button>
                    </div>
                    <div class="pin-editor-body">
                        <div class="pin-list" id="pin-list">
                            ${this.renderPinList()}
                        </div>
                        <button class="pin-add-btn" id="pin-add-btn">
                            添加引脚
                        </button>
                    </div>
                    <div class="pin-editor-footer">
                        <button class="btn-secondary" id="pin-editor-cancel">取消</button>
                        <button class="btn-primary" id="pin-editor-save">保存</button>
                    </div>
                </div>
            </div>
        `;

        // 将模态框添加到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 获取DOM元素引用
        this.modal = document.getElementById('pin-editor-modal');
        this.pinList = document.getElementById('pin-list');
        this.closeBtn = document.getElementById('pin-editor-close');
        this.cancelBtn = document.getElementById('pin-editor-cancel');
        this.saveBtn = document.getElementById('pin-editor-save');
        this.addBtn = document.getElementById('pin-add-btn');

        // 绑定事件
        this.bindEvents();
    }

    renderPinList() {
        if (this.pins.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">📌</div>
                    <div class="empty-state-title">暂无引脚</div>
                    <div class="empty-state-description">点击"添加引脚"按钮开始添加引脚配置</div>
                </div>
            `;
        }

        return this.pins.map((pin, index) => `
            <div class="pin-item" data-index="${index}">
                <input type="text" class="pin-name-input" value="${pin.pinName || ''}" placeholder="引脚名称" data-index="${index}">
                <select class="pin-type-select" data-index="${index}">
                    <option value="power" ${pin.type === 'power' ? 'selected' : ''}>电源</option>
                    <option value="ground" ${pin.type === 'ground' ? 'selected' : ''}>地</option>
                    <option value="digital_io" ${pin.type === 'digital_io' ? 'selected' : ''}>数字I/O</option>
                    <option value="analog_io" ${pin.type === 'analog_io' ? 'selected' : ''}>模拟I/O</option>
                    <option value="communication" ${pin.type === 'communication' ? 'selected' : ''}>通信</option>
                </select>
                <button class="pin-delete-btn" data-index="${index}">删除</button>
            </div>
        `).join('');
    }

    bindEvents() {
        // 关闭事件
        this.closeBtn.addEventListener('click', () => this.hide());
        this.cancelBtn.addEventListener('click', () => this.hide());

        // 点击模态框背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // 添加引脚
        this.addBtn.addEventListener('click', () => this.addPin());

        // 保存
        this.saveBtn.addEventListener('click', () => this.save());

        // 动态绑定引脚列表事件
        this.bindPinListEvents();
    }

    bindPinListEvents() {
        // 使用事件委托绑定动态生成的元素事件
        this.pinList.addEventListener('input', (e) => {
            if (e.target.classList.contains('pin-name-input')) {
                this.updatePinName(e.target.dataset.index, e.target.value);
            }
        });

        this.pinList.addEventListener('change', (e) => {
            if (e.target.classList.contains('pin-type-select')) {
                this.updatePinType(e.target.dataset.index, e.target.value);
            }
        });

        this.pinList.addEventListener('click', (e) => {
            if (e.target.classList.contains('pin-delete-btn')) {
                this.deletePin(e.target.dataset.index);
            }
        });
    }

    addPin() {
        const newPin = {
            pinName: `PIN${this.pins.length + 1}`,
            type: 'digital_io',
            order: this.pins.length + 1
        };

        this.pins.push(newPin);
        this.updatePinList();
        this.designer.updateStatus(`已添加新引脚: ${newPin.pinName}`);
    }

    updatePinName(index, name) {
        if (this.pins[index]) {
            this.pins[index].pinName = name.trim();
        }
    }

    updatePinType(index, type) {
        if (this.pins[index]) {
            this.pins[index].type = type;
        }
    }

    deletePin(index) {
        const pinName = this.pins[index]?.pinName || '未知引脚';
        if (confirm(`确定要删除引脚 "${pinName}" 吗？`)) {
            this.pins.splice(index, 1);
            this.updatePinOrders();
            this.updatePinList();
            this.designer.updateStatus(`已删除引脚: ${pinName}`);
        }
    }

    updatePinOrders() {
        this.pins.forEach((pin, index) => {
            pin.order = index + 1;
        });
    }

    updatePinList() {
        this.pinList.innerHTML = this.renderPinList();
    }

    validatePins() {
        const errors = [];

        this.pins.forEach((pin, index) => {
            // 检查引脚名称
            if (!pin.pinName || pin.pinName.trim() === '') {
                errors.push(`第${index + 1}个引脚名称不能为空`);
            }

            // 检查引脚名称唯一性
            const duplicateIndex = this.pins.findIndex((p, i) =>
                i !== index && p.pinName === pin.pinName
            );
            if (duplicateIndex !== -1) {
                errors.push(`引脚名称 "${pin.pinName}" 重复`);
            }

            // 检查引脚类型
            const validTypes = ['power', 'ground', 'digital_io', 'analog_io', 'communication'];
            if (!validTypes.includes(pin.type)) {
                errors.push(`第${index + 1}个引脚类型无效`);
            }
        });

        return errors;
    }

    save() {
        // 验证数据
        const errors = this.validatePins();
        if (errors.length > 0) {
            alert('数据验证失败:\n' + errors.join('\n'));
            return;
        }

        // 保存到设计器
        this.designer.component.pins[this.side] = [...this.pins];

        // 更新设计器状态
        this.designer.updateComponentInfo();
        this.designer.render();

        this.designer.updateStatus(`已保存 ${this.pins.length} 个引脚到 ${this.designer.getSideDisplayName(this.side)}`);
        this.hide();
    }

    show() {
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.isVisible = true;

            // 聚焦到第一个输入框
            setTimeout(() => {
                const firstInput = this.modal.querySelector('.pin-name-input');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        }
    }

    hide() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.isVisible = false;

            // 延迟移除DOM元素
            setTimeout(() => {
                if (this.modal && this.modal.parentNode) {
                    this.modal.parentNode.removeChild(this.modal);
                }
            }, 300);
        }
    }
}

/**
 * 简单交互管理器
 */
class SimpleInteractionManager {
    constructor(canvas, designer) {
        this.canvas = canvas;
        this.designer = designer;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    }

    /**
     * 处理鼠标按下事件
     */
    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    /**
     * 处理鼠标移动事件
     */
    handleMouseMove(e) {
        // 更新鼠标坐标显示
        this.updateMouseCoordinates(e);

        if (this.isDragging) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            this.designer.renderer.offsetX += deltaX;
            this.designer.renderer.offsetY += deltaY;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.designer.render();
        }
    }

    /**
     * 处理鼠标释放事件
     */
    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    /**
     * 更新鼠标坐标显示
     */
    updateMouseCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // 转换为世界坐标（Y轴：上正下负，符合平面直角坐标系）
        const worldX = Math.round((canvasX - this.designer.renderer.offsetX) / this.designer.renderer.scale);
        const worldY = Math.round(-(canvasY - this.designer.renderer.offsetY) / this.designer.renderer.scale); // 取负值使上正下负

        const mouseXElement = document.getElementById('designer-mouse-x');
        const mouseYElement = document.getElementById('designer-mouse-y');

        if (mouseXElement) mouseXElement.textContent = worldX;
        if (mouseYElement) mouseYElement.textContent = worldY;
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 检查是否点击了元件边框
        const side = this.designer.renderer.getClickedSide(mouseX, mouseY);
        if (side) {
            this.designer.showPinEditor(side);
        } else {
            // 点击空白区域，清除选中状态
            if (this.designer.selectedSide) {
                this.designer.selectedSide = null;
                this.designer.render();
                this.designer.updateStatus('已取消选中');
            }
        }
    }

    /**
     * 处理鼠标滚轮事件
     */
    handleWheel(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.designer.renderer.zoom(zoomFactor, canvasX, canvasY);
    }
}

// 创建全局元件设计器实例
let componentDesigner;

document.addEventListener('DOMContentLoaded', () => {
    // 监听二级标签页切换事件
    document.addEventListener('subTabActivated', (e) => {
        if (e.detail.subTabName === 'designer') {
            // 多次延迟检查，确保画布元素完全准备好
            let retryCount = 0;
            const maxRetries = 5;

            const tryInitialize = () => {
                const canvasElement = document.getElementById('component-designer-canvas');
                if (!canvasElement) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log(`元件设计画布元素未准备好，重试 ${retryCount}/${maxRetries}`);
                        setTimeout(tryInitialize, 100);
                    } else {
                        console.error('元件设计画布元素初始化失败');
                    }
                    return;
                }

                // 确保画布有正确的尺寸和上下文
                const container = canvasElement.parentElement;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;

                    // 设置正确的画布尺寸
                    canvasElement.width = rect.width * dpr;
                    canvasElement.height = rect.height * dpr;
                    canvasElement.style.width = rect.width + 'px';
                    canvasElement.style.height = rect.height + 'px';

                    // 重新获取上下文并设置缩放
                    const ctx = canvasElement.getContext('2d');
                    if (ctx) {
                        ctx.scale(dpr, dpr);
                    }

                    console.log('调整元件设计画布尺寸:', canvasElement.width, canvasElement.height);
                }

                // 延迟多帧，确保DOM和样式完全渲染
                let renderAttempts = 0;
                const maxRenderAttempts = 3;

                const doRender = () => {
                    renderAttempts++;
                    console.log(`尝试渲染元件设计器 ${renderAttempts}/${maxRenderAttempts}`);

                    if (!componentDesigner) {
                        componentDesigner = new ComponentDesigner();
                    } else if (componentDesigner.initialized) {
                        // 如果已经初始化，强制重新渲染
                        componentDesigner.renderer.forceRender();
                        console.log('元件设计器重新渲染完成');
                    } else {
                        // 如果初始化失败，尝试重新初始化
                        console.log('尝试重新初始化元件设计器...');
                        const success = componentDesigner.init();
                        if (success) {
                            componentDesigner.initialized = true;
                            componentDesigner.renderer.forceRender();
                            console.log('元件设计器重新初始化完成');
                        } else if (renderAttempts < maxRenderAttempts) {
                            // 初始化失败，继续重试
                            setTimeout(doRender, 200);
                            return;
                        }
                    }

                    // 如果还没有成功，添加最后的强制渲染
                    if (renderAttempts >= maxRenderAttempts && componentDesigner && componentDesigner.renderer) {
                        setTimeout(() => {
                            componentDesigner.renderer.forceRender();
                            console.log('最终强制渲染元件设计器');
                        }, 500);
                    }
                };

                // 使用多个延迟时机尝试渲染
                setTimeout(doRender, 50);
                setTimeout(doRender, 150);
                setTimeout(doRender, 300);
            };

            tryInitialize();
        }
    });
});

// 导出到全局作用域
window.ComponentDesigner = ComponentDesigner;
window.componentDesigner = componentDesigner;
