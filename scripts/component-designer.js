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
            undoBtn: document.getElementById('undo-action'),
            redoBtn: document.getElementById('redo-action')
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

        // 撤销重做按钮（暂时禁用）
        if (this.elements.undoBtn) {
            this.elements.undoBtn.disabled = true;
            this.elements.undoBtn.addEventListener('click', () => this.undo());
        }

        if (this.elements.redoBtn) {
            this.elements.redoBtn.disabled = true;
            this.elements.redoBtn.addEventListener('click', () => this.redo());
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
    saveComponent() {
        // 验证数据
        if (!this.component.name || this.component.name.trim() === '') {
            alert('请填写元件名称');
            return;
        }

        if (!this.component.description || this.component.description.trim() === '') {
            alert('请填写元件描述');
            return;
        }

        // 生成最终的元件数据
        const finalComponent = {
            ...this.component,
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

        console.log('保存元件:', finalComponent);

        // TODO: 在阶段二中实现实际保存逻辑
        this.updateStatus(`元件 "${this.component.name}" 保存成功`);
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

        // 更新状态信息
        this.updateStatus(`已选中元件${this.getSideDisplayName(side)}，引脚编辑功能将在下一阶段实现`);
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
        this.componentRect = {
            x: canvas.width / 2 - 50,
            y: canvas.height / 2 - 40,
            width: 100,
            height: 80
        };
    }

    render() {
        this.clearCanvas();
        this.drawComponentBody();
        this.drawSelectedSide();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawComponentBody() {
        // 绘制元件主体矩形
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
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

        // 添加边框提示文字
        this.ctx.fillStyle = '#666';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';

        // 上边提示
        this.ctx.fillText('点击上边添加引脚',
            this.componentRect.x + this.componentRect.width / 2,
            this.componentRect.y - 15);

        // 右边提示
        this.ctx.save();
        this.ctx.translate(this.componentRect.x + this.componentRect.width + 15,
            this.componentRect.y + this.componentRect.height / 2);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.fillText('点击右边添加引脚', 0, 0);
        this.ctx.restore();

        // 下边提示
        this.ctx.fillText('点击下边添加引脚',
            this.componentRect.x + this.componentRect.width / 2,
            this.componentRect.y + this.componentRect.height + 25);

        // 左边提示
        this.ctx.save();
        this.ctx.translate(this.componentRect.x - 15,
            this.componentRect.y + this.componentRect.height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText('点击左边添加引脚', 0, 0);
        this.ctx.restore();
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
        this.ctx.lineWidth = 3; // 更粗的线条
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
        const rect = this.componentRect;
        const threshold = 10; // 点击阈值

        // 检查上边
        if (Math.abs(mouseY - rect.y) < threshold &&
            mouseX >= rect.x && mouseX <= rect.x + rect.width) {
            return 'side1';
        }

        // 检查右边
        if (Math.abs(mouseX - (rect.x + rect.width)) < threshold &&
            mouseY >= rect.y && mouseY <= rect.y + rect.height) {
            return 'side2';
        }

        // 检查下边
        if (Math.abs(mouseY - (rect.y + rect.height)) < threshold &&
            mouseX >= rect.x && mouseX <= rect.x + rect.width) {
            return 'side3';
        }

        // 检查左边
        if (Math.abs(mouseX - rect.x) < threshold &&
            mouseY >= rect.y && mouseY <= rect.y + rect.height) {
            return 'side4';
        }

        return null;
    }
}

/**
 * 简单交互管理器
 */
class SimpleInteractionManager {
    constructor(canvas, designer) {
        this.canvas = canvas;
        this.designer = designer;
        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
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
}

// 创建全局元件设计器实例
let componentDesigner;

document.addEventListener('DOMContentLoaded', () => {
    // 监听二级标签页切换事件
    document.addEventListener('subTabActivated', (e) => {
        if (e.detail.subTabName === 'designer') {
            // 延迟一帧，确保DOM完全渲染
            requestAnimationFrame(() => {
                if (!componentDesigner) {
                    componentDesigner = new ComponentDesigner();
                } else if (componentDesigner.initialized) {
                    // 如果已经初始化，只需要重新渲染
                    componentDesigner.render();
                } else {
                    // 如果初始化失败，尝试重新初始化
                    console.log('尝试重新初始化元件设计器...');
                    const success = componentDesigner.init();
                    if (success) {
                        componentDesigner.initialized = true;
                        componentDesigner.render();
                    }
                }
            });
        }
    });
});

// 导出到全局作用域
window.ComponentDesigner = ComponentDesigner;
window.componentDesigner = componentDesigner;
