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
        this.init();
    }

    /**
     * 初始化画布管理器
     */
    init() {
        console.log('初始化画布管理器...');
        this.canvas = document.getElementById('main-canvas');
        if (!this.canvas) {
            console.warn('未找到画布元素');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        this.bindEvents();
        this.draw();

        console.log('画布管理器初始化完成');
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
            this.draw();
        });
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
        this.offsetX = 0;
        this.offsetY = 0;
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

        // 转换为世界坐标
        const worldX = Math.round((canvasX - this.offsetX) / this.scale);
        const worldY = Math.round((canvasY - this.offsetY) / this.scale);

        document.getElementById('mouse-x').textContent = worldX;
        document.getElementById('mouse-y').textContent = worldY;
    }

    /**
     * 更新缩放显示
     */
    updateZoomDisplay() {
        const zoomPercent = Math.round(this.scale * 100);
        document.getElementById('zoom-level').textContent = `${zoomPercent}%`;
        document.getElementById('zoom-percent').textContent = zoomPercent;
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
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 2 / this.scale;

        // X轴
        this.ctx.beginPath();
        this.ctx.moveTo(-1000, 0);
        this.ctx.lineTo(1000, 0);
        this.ctx.stroke();

        // Y轴
        this.ctx.beginPath();
        this.ctx.moveTo(0, -1000);
        this.ctx.lineTo(0, 1000);
        this.ctx.stroke();

        // 原点标记
        this.ctx.fillStyle = '#666';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 5 / this.scale, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    /**
     * 绘制画布内容
     */
    drawContent() {
        // TODO: 绘制元件、连线等内容
        // 这里可以添加实际的绘制逻辑
    }
}

// 创建全局画布管理器实例
let canvasManager;

document.addEventListener('DOMContentLoaded', () => {
    canvasManager = new CanvasManager();
});

// 导出到全局作用域
window.CanvasManager = CanvasManager;
window.canvasManager = canvasManager;
