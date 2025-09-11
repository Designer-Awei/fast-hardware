/**
 * Fast Hardware - 画布管理脚本
 * 处理画布渲染、缩放、平移等功能
 */

class CanvasManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // 存储画布上的元件实例
        this.components = [];

        this.init();
    }

    /**
     * 初始化画布管理器
     */
    init() {
        this.canvas = document.getElementById('main-canvas');
        if (!this.canvas) {
            console.warn('未找到画布元素');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        
        // 延迟初始化，确保容器完全渲染
        setTimeout(() => {
            this.resizeCanvas();
            this.resetView(); // 设置初始视图
            this.bindEvents();
        }, 100);
    }

    /**
     * 调整画布大小
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            const rect = container.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            
            // 画布尺寸变化后需要重新绘制
            this.draw();
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));

        // 工具栏按钮事件
        document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomOut());
        document.getElementById('reset-view')?.addEventListener('click', () => this.resetView());
        document.getElementById('fit-view')?.addEventListener('click', () => this.fitView());

        // 窗口大小改变
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            // resizeCanvas内部已经调用了draw()，这里不需要重复调用
        });

        // 拖拽事件 - 接收来自悬浮面板的元件
        this.canvas.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.canvas.addEventListener('drop', (e) => this.handleDrop(e));
        this.canvas.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    }

    /**
     * 处理鼠标按下事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }

    /**
     * 处理鼠标移动事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseMove(e) {
        // 更新鼠标坐标显示
        this.updateMouseCoordinates(e);

        if (this.isDragging) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            this.offsetX += deltaX;
            this.offsetY += deltaY;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.draw();
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
     * 处理鼠标滚轮事件
     * @param {WheelEvent} e - 滚轮事件
     */
    handleWheel(e) {
        e.preventDefault();

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(zoomFactor, e.clientX, e.clientY);
    }

    /**
     * 缩放画布
     * @param {number} factor - 缩放因子
     * @param {number} centerX - 缩放中心X坐标
     * @param {number} centerY - 缩放中心Y坐标
     */
    zoom(factor, centerX, centerY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = centerX - rect.left;
        const canvasY = centerY - rect.top;

        // 计算缩放前的世界坐标
        const worldX = (canvasX - this.offsetX) / this.scale;
        const worldY = (canvasY - this.offsetY) / this.scale;

        // 应用缩放
        this.scale *= factor;
        this.scale = Math.max(0.1, Math.min(3.0, this.scale));

        // 调整偏移以保持缩放中心不变
        this.offsetX = canvasX - worldX * this.scale;
        this.offsetY = canvasY - worldY * this.scale;

        this.updateZoomDisplay();
        this.draw();
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
     * 重置视图
     */
    resetView() {
        this.scale = 1;
        // 将原点设置在左下角（画布坐标系）
        this.offsetX = 50;  // 左侧留一些边距
        this.offsetY = this.canvas.height - 50;  // 底部留一些边距
        this.updateZoomDisplay();
        this.draw();
    }

    /**
     * 适应视图
     */
    fitView() {
        // TODO: 实现适应视图逻辑
        console.log('适应视图功能开发中...');
    }

    /**
     * 更新鼠标坐标显示
     * @param {MouseEvent} e - 鼠标事件
     */
    updateMouseCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // 转换为世界坐标（Y轴：上正下负，符合平面直角坐标系）
        const worldX = Math.round((canvasX - this.offsetX) / this.scale);
        const worldY = Math.round((canvasY - this.offsetY) / this.scale); // 保持Y轴方向一致

        const mouseXElement = document.getElementById('mouse-x');
        const mouseYElement = document.getElementById('mouse-y');

        if (mouseXElement) mouseXElement.textContent = worldX;
        if (mouseYElement) mouseYElement.textContent = worldY;
    }

    /**
     * 更新缩放显示
     */
    updateZoomDisplay() {
        const zoomPercent = Math.round(this.scale * 100);
        const zoomLevelElement = document.getElementById('zoom-level');
        if (zoomLevelElement) {
            zoomLevelElement.textContent = `${zoomPercent}%`;
        }
    }

    /**
     * 强制重新渲染画布
     */
    forceRender() {
        if (!this.canvas || !this.ctx) return;

        // 确保画布有正确的尺寸
        const container = this.canvas.parentElement;
        if (container) {
            const rect = container.getBoundingClientRect();

            // 检查尺寸是否需要更新
            if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
            }
        }

        // 强制重新渲染
        this.draw();
    }

    /**
     * 绘制画布内容
     */
    draw() {
        if (!this.ctx) return;

        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 保存上下文
        this.ctx.save();

        // 应用变换
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // 绘制网格
        this.drawGrid();

        // 绘制坐标轴
        this.drawAxes();

        // 绘制其他内容
        this.drawContent();

        // 恢复上下文
        this.ctx.restore();
    }

    /**
     * 绘制网格
     */
    drawGrid() {
        const gridSize = 20;

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

    /**
     * 绘制坐标轴
     */
    drawAxes() {
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 1 / this.scale;

        // X轴（水平线）
        this.ctx.beginPath();
        this.ctx.moveTo(-1000, 0);
        this.ctx.lineTo(1000, 0);
        this.ctx.stroke();

        // Y轴（垂直线）
        this.ctx.beginPath();
        this.ctx.moveTo(0, -1000);
        this.ctx.lineTo(0, 1000);
        this.ctx.stroke();

        // 原点标记（小圆点）
        this.ctx.fillStyle = '#999';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 3 / this.scale, 0, 2 * Math.PI);
        this.ctx.fill();

        // 添加坐标轴标签
        this.drawAxisLabels();
    }

    /**
     * 绘制坐标轴标签
     */
    drawAxisLabels() {
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${12 / this.scale}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // X轴标签
        this.ctx.fillText('X', 50, -10);
        // Y轴标签
        this.ctx.fillText('Y', 10, -50);
    }

    /**
     * 绘制画布内容
     */
    drawContent() {
        // 绘制所有元件
        this.components.forEach(component => {
            this.drawComponent(component);
        });
    }

    /**
     * 绘制单个元件
     * @param {Object} component - 元件实例
     */
    drawComponent(component) {
        const { data, position } = component;
        const { x, y } = position;

        if (!this.ctx) return;

        this.ctx.save();

        // 创建元件矩形区域（以元件中心为基准）
        const width = data.dimensions?.width || 80;
        const height = data.dimensions?.height || 60;

        const componentRect = {
            x: x - width / 2,
            y: y - height / 2,
            width: width,
            height: height
        };

        // 绘制元件主体
        this.drawComponentBody(componentRect, data.name);

        // 绘制引脚
        this.drawComponentPins(componentRect, data.pins);

        this.ctx.restore();
    }

    /**
     * 绘制元件主体（带圆角）
     * @param {Object} rect - 元件矩形区域
     * @param {string} name - 元件名称
     */
    drawComponentBody(rect, name) {
        // 绘制元件主体矩形（带圆角）
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2 / this.scale;

        // 计算圆角半径（参照元件预览SVG的4px，考虑缩放）
        const radius = 4 / this.scale;

        // 绘制圆角矩形
        this.roundedRect(rect.x, rect.y, rect.width, rect.height, radius);

        this.ctx.fill();
        this.ctx.stroke();

        // 绘制元件名称
        this.drawComponentName(rect, name);
    }

    /**
     * 绘制圆角矩形路径
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {number} radius - 圆角半径
     */
    roundedRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
    }

    /**
     * 绘制元件名称
     * @param {Object} rect - 元件矩形区域
     * @param {string} name - 元件名称
     */
    drawComponentName(rect, name) {
        const componentName = name || '未命名元件';

        // 设置文字样式
        this.ctx.fillStyle = '#333';
        // 考虑缩放因子，确保文字大小与元件设计器完全一致
        const baseFontSize = Math.max(12, Math.min(16, rect.width / 8));
        this.ctx.font = `${baseFontSize / this.scale}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 计算文字位置
        const textX = rect.x + rect.width / 2;
        const textY = rect.y + rect.height / 2;

        // 绘制文字
        this.ctx.fillText(componentName, textX, textY);
    }

    /**
     * 绘制元件引脚
     * @param {Object} rect - 元件矩形区域
     * @param {Object} pins - 引脚数据
     */
    drawComponentPins(rect, pins) {
        if (!pins) return;

        const pinCalculator = new CanvasPinPositionCalculator(rect);
        const allPins = pinCalculator.calculateAllPositions(pins);

        allPins.forEach(pin => {
            this.drawPin(pin);
        });
    }

    /**
     * 绘制单个引脚
     * @param {Object} pin - 引脚数据
     */
    drawPin(pin) {
        const { position, pinName, type, side } = pin;
        const pinSize = 12 / this.scale; // 引脚尺寸（中等尺寸）

        // 根据边确定引脚的矩形位置（引脚与边线重合）
        let pinX, pinY, pinWidth, pinHeight;

        switch (side) {
            case 'side1': // 上边 - 引脚在元件上方突出
                pinX = position.x - pinSize / 2; // 中心点向左偏移半个引脚宽度
                pinY = position.y - pinSize / 2; // 向上突出
                pinWidth = pinSize;
                pinHeight = pinSize / 2;
                break;
            case 'side2': // 右边 - 引脚在元件右边突出
                pinX = position.x; // 从元件右边线开始
                pinY = position.y - pinSize / 2; // 中心点向上偏移半个引脚高度
                pinWidth = pinSize / 2; // 向右突出
                pinHeight = pinSize;
                break;
            case 'side3': // 下边 - 引脚在元件下方突出
                pinX = position.x - pinSize / 2; // 中心点向左偏移半个引脚宽度
                pinY = position.y; // 从元件下边线开始，向下突出
                pinWidth = pinSize;
                pinHeight = pinSize / 2;
                break;
            case 'side4': // 左边 - 引脚在元件左边突出
                pinX = position.x - pinSize / 2; // 向左突出
                pinY = position.y - pinSize / 2; // 中心点向上偏移半个引脚高度
                pinWidth = pinSize / 2;
                pinHeight = pinSize;
                break;
            default:
                pinX = position.x - pinSize / 2;
                pinY = position.y - pinSize / 2;
                pinWidth = pinSize;
                pinHeight = pinSize;
        }

        // 绘制引脚矩形
        this.ctx.fillStyle = this.getPinColor(type);
        this.ctx.fillRect(pinX, pinY, pinWidth, pinHeight);

        // 绘制边框
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.strokeRect(pinX, pinY, pinWidth, pinHeight);

        // 绘制引脚标签
        this.drawPinLabel(pin);
    }

    /**
     * 绘制引脚标签
     * @param {Object} pin - 引脚数据
     */
    drawPinLabel(pin) {
        const { position, pinName, side } = pin;
        const fontSize = 10 / this.scale;

        // 设置标签样式
        this.ctx.fillStyle = '#333';
        this.ctx.font = `${fontSize}px Arial`;

        let labelX = position.x;
        let labelY = position.y;
        let rotation = 0; // 旋转角度（弧度）

        // 根据边调整标签位置和文字方向
        const pinHeight = 12 / this.scale; // 引脚高度（中等尺寸）
        const textOffset = pinHeight * 2 + 4 / this.scale; // 两个引脚高度 + 额外间距

        switch (side) {
            case 'side1': // 上边 - 文字逆时针旋转90度（纵向向上）
                labelY -= textOffset;
                rotation = -Math.PI / 2; // 逆时针90度
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                break;
            case 'side2': // 右边 - 文字水平向右
                labelX += textOffset;
                rotation = 0; // 不旋转
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                break;
            case 'side3': // 下边 - 文字顺时针旋转90度（纵向向下）
                labelY += textOffset;
                rotation = Math.PI / 2; // 顺时针90度
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                break;
            case 'side4': // 左边 - 文字水平向左
                labelX -= textOffset;
                rotation = 0; // 不旋转
                this.ctx.textAlign = 'right';
                this.ctx.textBaseline = 'middle';
                break;
            default:
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
        }

        // 保存上下文状态
        this.ctx.save();

        // 应用旋转
        if (rotation !== 0) {
            this.ctx.translate(labelX, labelY);
            this.ctx.rotate(rotation);
            this.ctx.fillText(pinName, 0, 0);
        } else {
            this.ctx.fillText(pinName, labelX, labelY);
        }

        // 恢复上下文状态
        this.ctx.restore();
    }

    /**
     * 获取引脚颜色
     * @param {string} type - 引脚类型
     * @returns {string} 颜色值
     */
    getPinColor(type) {
        const colorMap = {
            'power': '#dc3545',       // 红色 - 电源
            'ground': '#000000',     // 黑色 - 地
            'digital_io': '#28a745', // 绿色 - 数字I/O
            'analog_io': '#ffc107',  // 黄色 - 模拟I/O
            'special': '#6f42c1'     // 紫色 - 特殊引脚
        };

        return colorMap[type] || '#667eea'; // 默认蓝色
    }

    /**
     * 处理拖拽悬停事件
     * @param {DragEvent} e - 拖拽事件
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        // 显示拖拽反馈
        this.canvas.style.border = '2px dashed #667eea';
        this.canvas.style.backgroundColor = 'rgba(102, 126, 234, 0.05)';

        // 在拖拽过程中持续更新鼠标坐标
        this.updateMouseCoordinates(e);
    }

    /**
     * 处理拖拽离开事件
     * @param {DragEvent} e - 拖拽事件
     */
    handleDragLeave(e) {
        // 恢复原始样式
        this.canvas.style.border = '';
        this.canvas.style.backgroundColor = '';
    }

    /**
     * 处理放置事件
     * @param {DragEvent} e - 拖拽事件
     */
    handleDrop(e) {
        e.preventDefault();

        // 恢复原始样式
        this.canvas.style.border = '';
        this.canvas.style.backgroundColor = '';

        try {
            // 获取拖拽的数据
            const componentData = JSON.parse(e.dataTransfer.getData('application/json'));

            // 计算放置位置（世界坐标）
            const rect = this.canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;

            // 转换为世界坐标
            const worldX = Math.round((canvasX - this.offsetX) / this.scale);
            const worldY = Math.round((canvasY - this.offsetY) / this.scale);

            // 创建元件实例
            this.addComponent(componentData, worldX, worldY);

            console.log(`元件 "${componentData.name}" 已放置在位置 (${worldX}, ${worldY})`);

        } catch (error) {
            console.error('放置元件失败:', error);
            this.showDropError('放置元件失败，请重试');
        }
    }

    /**
     * 添加元件到画布
     * @param {Object} componentData - 元件数据
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     */
    addComponent(componentData, x, y) {
        console.log('添加元件:', componentData.name, '位置:', x, y);

        // 创建元件实例
        const componentInstance = {
            id: Date.now() + Math.random(), // 临时ID
            data: componentData,
            position: { x, y },
            rotation: 0,
            scale: 1
        };

        // 添加到元件列表
        this.components.push(componentInstance);

        // 触发重新渲染
        this.draw();

        return componentInstance;
    }

    /**
     * 清除所有元件
     */
    clearComponents() {
        this.components = [];
        this.draw();
    }

    /**
     * 获取所有元件
     */
    getComponents() {
        return this.components;
    }

    /**
     * 显示放置错误提示
     * @param {string} message - 错误消息
     */
    showDropError(message) {
        // 创建错误提示
        const errorDiv = document.createElement('div');
        errorDiv.className = 'drop-error';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e74c3c;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1001;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(errorDiv);

        // 显示动画
        setTimeout(() => {
            errorDiv.style.opacity = '1';
        }, 10);

        // 3秒后自动隐藏
        setTimeout(() => {
            errorDiv.style.opacity = '0';
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, 300);
        }, 3000);
    }

    /**
     * 准备接收拖拽（供悬浮面板调用）
     */
    prepareForDrop() {
        console.log('画布已准备接收拖拽');
    }

    /**
     * 结束拖拽（供悬浮面板调用）
     */
    endDrop() {
        console.log('拖拽结束');
    }
}

// 创建全局画布管理器实例
let canvasManager;

document.addEventListener('DOMContentLoaded', () => {
    canvasManager = new CanvasManager();

    // 监听标签页切换事件，确保画布正确渲染
    document.addEventListener('tabActivated', (e) => {
        if (e.detail.tabName === 'circuit') {
            // 延迟执行，确保DOM完全更新
            setTimeout(() => {
                if (canvasManager) {
                    canvasManager.forceRender();
                }
            }, 100);
        }
    });

    // 添加页面可见性监听器
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && canvasManager) {
            // 页面变为可见时，强制重新渲染
            setTimeout(() => {
                canvasManager.forceRender();
            }, 50);
        }
    });

    // 添加Intersection Observer监听
    const canvasElement = document.getElementById('main-canvas');
    if (canvasElement && canvasElement.parentElement && window.IntersectionObserver) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && canvasManager) {
                    // 画布变为可见时，强制重新渲染
                    setTimeout(() => {
                        canvasManager.forceRender();
                    }, 100);
                }
            });
        }, {
            threshold: 0.1 // 当10%的画布可见时触发
        });

        observer.observe(canvasElement.parentElement);
    }
});

// 导出到全局作用域
window.CanvasManager = CanvasManager;
window.canvasManager = canvasManager;

/**
 * 画布引脚位置计算器
 * 负责计算元件引脚在画布上的准确位置
 * 与元件设计器的算法完全一致
 */
class CanvasPinPositionCalculator {
    constructor(componentRect) {
        this.componentRect = componentRect;
    }

    /**
     * 计算所有引脚的位置
     * @param {Object} pins - 引脚数据结构
     * @returns {Array} 所有引脚的位置信息
     */
    calculateAllPositions(pins) {
        const allPins = [];

        // 处理四个边的引脚
        const sides = ['side1', 'side2', 'side3', 'side4'];

        sides.forEach(side => {
            if (pins[side] && pins[side].length > 0) {
                const sidePins = this.calculateSidePositions(pins[side], side);
                allPins.push(...sidePins);
            }
        });

        return allPins;
    }

    /**
     * 计算指定边引脚的位置
     * @param {Array} pins - 该边的引脚数组
     * @param {string} side - 边名称 ('side1', 'side2', 'side3', 'side4')
     * @returns {Array} 该边引脚的位置信息
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
     * 获取引脚位置
     * @param {string} side - 边名称
     * @param {number} index - 引脚索引
     * @param {number} totalPins - 该边总引脚数
     * @returns {Object} 引脚位置 {x, y}
     */
    getPinPosition(side, index, totalPins) {
        const rect = this.componentRect;
        const spacing = this.getSpacing(totalPins);
        const margin = 15; // 边界距离（目标范围10-20px）

        switch (side) {
            case 'side1': // 上边 - 水平居中布局
            case 'side3': // 下边 - 水平居中布局
                if (totalPins > 0) {
                    const pinWidth = 12; // 引脚宽度（中等尺寸）

                    // 计算实际需要的布局宽度：引脚数 * 引脚宽度 + (引脚数 - 1) * 间距
                    const layoutWidth = totalPins * pinWidth + (totalPins - 1) * spacing;

                    // 确保布局宽度不超过元件宽度减去边界
                    const availableWidth = rect.width - 2 * margin;
                    const actualLayoutWidth = Math.min(layoutWidth, availableWidth);

                    // 计算起始位置，使整体居中
                    const startX = rect.x + (rect.width - actualLayoutWidth) / 2;
                    // 每个引脚的位置：起始位置 + 引脚索引 * (引脚宽度 + 间距) + 引脚宽度/2（居中）
                    const x = startX + index * (pinWidth + spacing) + pinWidth / 2;
                    const y = side === 'side1' ? rect.y : rect.y + rect.height;
                    return { x, y };
                }
                return { x: rect.x + rect.width / 2, y: rect.y };

            case 'side2': // 右边 - 垂直居中布局
            case 'side4': // 左边 - 垂直居中布局
                if (totalPins > 0) {
                    const pinHeight = 12; // 引脚高度（中等尺寸）

                    // 计算实际需要的布局高度：引脚数 * 引脚高度 + (引脚数 - 1) * 间距
                    const layoutHeight = totalPins * pinHeight + (totalPins - 1) * spacing;

                    // 确保布局高度不超过元件高度减去边界
                    const availableHeight = rect.height - 2 * margin;
                    const actualLayoutHeight = Math.min(layoutHeight, availableHeight);

                    // 计算起始位置，使整体居中
                    const startY = rect.y + (rect.height - actualLayoutHeight) / 2;
                    // 每个引脚的位置：起始位置 + 引脚索引 * (引脚高度 + 间距) + 引脚高度/2（居中）
                    const y = startY + index * (pinHeight + spacing) + pinHeight / 2;
                    const x = side === 'side2' ? rect.x + rect.width : rect.x;
                    return { x, y };
                }
                return { x: rect.x, y: rect.y + rect.height / 2 };

            default:
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
    }

    /**
     * 获取引脚间距
     * @param {number} totalPins - 引脚总数
     * @returns {number} 间距值
     */
    getSpacing(totalPins) {
        // 引脚间距策略：随着引脚数量增加，间距逐渐减小
        if (totalPins <= 2) return 10;      // 2个及以下：10px
        if (totalPins <= 4) return 8;       // 3-4个：8px
        if (totalPins <= 6) return 6;       // 5-6个：6px
        return 4;                           // 7个以上：4px
    }
}
