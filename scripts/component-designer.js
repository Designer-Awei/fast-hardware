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

        // 初始化元件矩形位置和尺寸
        this.componentRect = null; // 将在渲染器初始化时设置

        // 添加选中状态
        this.selectedSide = null; // 当前选中的边：'side1', 'side2', 'side3', 'side4'

        // 编辑模式标识
        this.isEditingExisting = false; // 是否正在编辑现有元件
        this.originalComponentId = null; // 原始元件ID
        this.originalComponentName = null; // 原始元件名称
        this.isReuseMode = false; // 是否为复用模式

        const success = this.init();
        if (success) {
            this.initialized = true;
        }
    }

    /**
     * 初始化元件设计器
     */
    init() {

        // 绑定DOM元素
        if (!this.bindElements()) {
            console.error('元件设计器初始化失败：DOM元素绑定失败');
            return false;
        }

        // 设置画布
        this.setupCanvas();

        // 绑定事件
        this.bindEvents();

        // 生成初始ID（如果还没有ID的话）
        if (!this.component.id) {
            this.generateComponentId();
        }

        // 更新状态
        this.updateStatus('元件设计器已就绪');

        return true;
    }

    /**
     * 绑定DOM元素
     */
    bindElements() {
        this.elements = {
            nameInput: document.getElementById('component-name'),
            categorySelect: document.getElementById('component-category'),
            widthInput: document.getElementById('component-width'),
            heightInput: document.getElementById('component-height'),
            descriptionTextarea: document.getElementById('component-description'),
            resetBtn: document.getElementById('reset-designer'),
            saveBtn: document.getElementById('save-component'),
            canvas: document.getElementById('component-designer-canvas'),
            statusMessage: document.getElementById('status-message'),
            componentInfo: document.getElementById('component-info'),
            resetComponentBtn: document.getElementById('reset-component')
        };

        // 检查关键元素是否存在
        const missingElements = [];
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
                missingElements.push(key);
            }
        });

        // 尺寸输入框不是必须的，可以为空
        if (this.elements.widthInput) missingElements.splice(missingElements.indexOf('widthInput'), 1);
        if (this.elements.heightInput) missingElements.splice(missingElements.indexOf('heightInput'), 1);

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

        // 初次渲染（复用模式下跳过，避免闪烁）
        if (!this.isReuseMode) {
        this.render();
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        console.log('开始绑定元件设计器事件...');

        // 绑定基础表单事件（这些不需要标签页激活）
        this.bindBasicFormEvents();

        // 绑定按钮事件（需要特殊处理）
        this.bindButtonEvents();

        // 绑定全局事件监听器
        this.bindGlobalEventListeners();

        console.log('元件设计器事件绑定完成');
    }

    /**
     * 绑定基础表单事件
     */
    bindBasicFormEvents() {
        // 表单输入事件
        if (this.elements.nameInput) {
            this.elements.nameInput.addEventListener('input', (e) => {
                this.component.name = e.target.value.trim();
                this.generateComponentId();
                this.updateComponentInfo();
                this.render(); // 重新渲染以显示新的元件名称
            });

            // 添加焦点事件监听，确保输入框状态正确
            this.elements.nameInput.addEventListener('focus', () => {
                this.ensureInputBoxUsable(this.elements.nameInput);
            });

            this.elements.nameInput.addEventListener('click', () => {
                this.ensureInputBoxUsable(this.elements.nameInput);
            });
        }

        if (this.elements.categorySelect) {
            this.elements.categorySelect.addEventListener('change', (e) => {
                this.component.category = e.target.value;
                this.updateStatus(`类别已更改为: ${this.getCategoryDisplayName(e.target.value)}`);
            });
        }

        // 尺寸输入事件
        if (this.elements.widthInput) {
            this.elements.widthInput.addEventListener('input', (e) => {
                const width = parseInt(e.target.value) || 100;
                this.updateComponentSize(width, this.component.dimensions.height);
            });
        }

        if (this.elements.heightInput) {
            this.elements.heightInput.addEventListener('input', (e) => {
                const height = parseInt(e.target.value) || 80;
                this.updateComponentSize(this.component.dimensions.width, height);
            });
        }

        if (this.elements.descriptionTextarea) {
            this.elements.descriptionTextarea.addEventListener('input', (e) => {
                this.component.description = e.target.value.trim();
            });
        }
    }

    /**
     * 绑定按钮事件
     */
    bindButtonEvents() {
        // 重置视图按钮
        const resetViewBtn = document.getElementById('reset-view-designer');
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => this.renderer.resetView());
        }

        // 绑定重置设计器按钮
                if (this.elements.resetBtn) {
                    this.elements.resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('重置设计器按钮被点击');
                        this.resetDesigner();
                    });
                }

        // 绑定保存按钮
                if (this.elements.saveBtn) {
                    this.elements.saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                        console.log('元件绘制器保存按钮被点击');
                        this.saveComponent();
                    });
                }

        // 绑定重置元件按钮 - 使用更健壮的事件绑定
                if (this.elements.resetComponentBtn) {
            // 移除可能存在的事件监听器
            this.elements.resetComponentBtn.removeEventListener('click', this.resetComponentHandler);

            // 创建新的事件处理器
            this.resetComponentHandler = (e) => {
                e.stopPropagation();
                console.log('重置元件按钮被点击');
                        this.resetComponent();
            };

            // 绑定新的事件处理器
            this.elements.resetComponentBtn.addEventListener('click', this.resetComponentHandler);

            console.log('重置元件按钮事件已绑定');
        }
    }

    /**
     * 绑定全局事件监听器
     */
    bindGlobalEventListeners() {
        // 监听标签页切换事件
        document.addEventListener('subTabActivated', (e) => {
            if (e.detail.subTabName === 'designer') {
                // 确保输入框状态正确
                setTimeout(() => {
                    this.ensureInputBoxUsable();
                }, 100);
            }
        });

        // 监听窗口焦点变化
        window.addEventListener('focus', () => {
            console.log('窗口获得焦点');
        setTimeout(() => {
                this.ensureInputBoxUsable();
            }, 50);
        });

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('页面变为可见');
                setTimeout(() => {
                    this.ensureInputBoxUsable();
                }, 100);
            }
        });
    }

    /**
     * 确保输入框可用状态
     */
    ensureInputBoxUsable(inputElement = null) {
        const targetInput = inputElement || this.elements.nameInput;
        if (!targetInput) return;

        console.log('检查输入框可用状态...');

        // 保存原始值，避免被意外清除
        const originalValue = targetInput.value;
        const wasFocused = document.activeElement === targetInput;

        // 强制设置输入框为可用状态
        targetInput.disabled = false;
        targetInput.readOnly = false;
        targetInput.style.pointerEvents = 'auto';
        targetInput.style.opacity = '1';
        targetInput.style.visibility = 'visible';
        targetInput.style.display = 'block';
        targetInput.style.cursor = 'text';
        targetInput.style.backgroundColor = '';
        targetInput.style.border = '';
        targetInput.style.zIndex = '';

        // 确保父元素状态正常
        const parent = targetInput.parentElement;
        if (parent) {
            parent.style.pointerEvents = 'auto';
            parent.style.opacity = '1';
            parent.style.visibility = 'visible';
            parent.style.display = 'block';
        }

        // 移除可能的问题类
        targetInput.classList.remove('disabled', 'readonly', 'hidden', 'unusable');

        // 恢复原始值
        if (originalValue && !targetInput.value) {
            targetInput.value = originalValue;
        }

        // 重新绑定事件监听器（以防被意外移除）
        this.rebindInputEvents(targetInput);

        console.log('输入框状态已强制设置为可用', {
            value: targetInput.value,
            disabled: targetInput.disabled,
            readOnly: targetInput.readOnly,
            wasFocused: wasFocused,
            nowFocused: document.activeElement === targetInput
        });
    }

    /**
     * 重新绑定输入框事件
     */
    rebindInputEvents(inputElement) {
        if (!inputElement) return;

        // 移除现有的事件监听器（如果有的话）
        inputElement.removeEventListener('input', this.inputHandler);
        inputElement.removeEventListener('focus', this.focusHandler);
        inputElement.removeEventListener('blur', this.blurHandler);

        // 创建新的事件处理器
        this.inputHandler = (e) => {
            this.component.name = e.target.value.trim();
            this.generateComponentId();
            this.updateComponentInfo();
            this.render();
        };

        this.focusHandler = () => {
            this.ensureInputBoxUsable(inputElement);
        };

        this.blurHandler = () => {
            // 失焦时不需要特殊处理
        };

        // 重新绑定事件
        inputElement.addEventListener('input', this.inputHandler);
        inputElement.addEventListener('focus', this.focusHandler);
        inputElement.addEventListener('blur', this.blurHandler);

        console.log('输入框事件已重新绑定');
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

            // 如果是复用模式，重置到新建状态
            if (this.isReuseMode) {
                console.log('属性面板重置：复用模式下清除复用状态，回到新建模式');
                this.isReuseMode = false;
                this.originalComponentId = null;
                this.originalComponentName = null;
                this.isEditingExisting = false;
                this.updateStatus('已从复用模式重置到新建模式');
            }

            // 注意：不清除编辑模式标识，以防用户是在编辑现有元件时点击重置
            // 只有在真正新建元件或明确保存后才清除编辑模式
            // this.isEditingExisting = false;
            // this.originalComponentId = null;

            // 清空表单
            if (this.elements.nameInput) this.elements.nameInput.value = '';
            if (this.elements.categorySelect) this.elements.categorySelect.value = 'other';
            if (this.elements.widthInput) this.elements.widthInput.value = '100';
            if (this.elements.heightInput) this.elements.heightInput.value = '80';
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
        console.log('准备重置元件...');

        // 使用Promise包装confirm对话框，确保焦点处理
        this.showResetConfirmDialog().then((confirmed) => {
            if (confirmed) {
                console.log('用户确认重置，开始重置元件...');

                // 保存输入框的当前状态
                const inputElement = this.elements.nameInput;
                const wasFocused = inputElement && document.activeElement === inputElement;
                const currentValue = inputElement ? inputElement.value : '';

                // 重置元件引脚数据
            this.component.pins = {
                side1: [],
                side2: [],
                side3: [],
                side4: []
            };

            // 清除选中状态
            this.selectedSide = null;

            // 如果是复用模式，重置到新建状态
            if (this.isReuseMode) {
                console.log('复用模式下点击重置，清除复用状态，回到新建模式');
                this.isReuseMode = false;
                this.originalComponentId = null;
                this.originalComponentName = null;
                this.isEditingExisting = false;
                this.updateStatus('已从复用模式重置到新建模式');
            }

                // 更新界面
            this.updateComponentInfo();
            this.render();
            this.updateStatus('元件引脚已清除');

                // 确保输入框状态正确 - 使用更全面的方法
                if (inputElement) {
                    // 立即确保输入框可用（在DOM更新前）
                    this.ensureInputBoxUsable(inputElement);

                    // 延迟执行，确保DOM更新完成后再进行焦点恢复
                    setTimeout(() => {
                        this.ensureInputBoxUsable(inputElement);

                        // 强制聚焦到输入框
                        setTimeout(() => {
                            try {
                                inputElement.focus();
                                // 确保焦点确实设置成功
                                if (document.activeElement === inputElement) {
                                    console.log('✅ 重置后成功恢复输入框焦点');
                                } else {
                                    console.warn('⚠️ 重置后焦点恢复可能失败，重试...');
                                    // 再次尝试聚焦
                                    setTimeout(() => {
                                        inputElement.focus();
                                        if (document.activeElement === inputElement) {
                                            console.log('✅ 重置后重试恢复输入框焦点成功');
                                        } else {
                                            console.error('❌ 重置后无法恢复输入框焦点');
                                        }
                                    }, 50);
                                }
                            } catch (error) {
                                console.warn('无法恢复输入框焦点:', error);
                            }
                        }, 20);

                        console.log('重置元件完成，输入框状态:', {
                            value: inputElement.value,
                            disabled: inputElement.disabled,
                            readOnly: inputElement.readOnly,
                            focused: document.activeElement === inputElement,
                            activeElement: document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '')
                        });
                    }, 10);
                }

                console.log('元件重置完成');
            } else {
                console.log('用户取消了重置操作');
            }
        }).catch((error) => {
            console.error('重置元件过程中出现错误:', error);
        });
    }

    /**
     * 显示重置确认对话框
     */
    showResetConfirmDialog() {
        return new Promise((resolve) => {
            // 创建自定义确认对话框，避免使用原生confirm（会丢失焦点）
            const dialog = document.createElement('div');
            dialog.className = 'reset-confirm-dialog';
            dialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>确认重置</h3>
                    </div>
                    <div class="dialog-body">
                        <p>确定要清除所有引脚吗？</p>
                        <p class="warning-text">此操作将清除元件的所有引脚配置。</p>
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-secondary cancel-btn">取消</button>
                        <button class="btn-danger confirm-btn">确认重置</button>
                    </div>
                </div>
            `;

            // 添加样式
            const style = document.createElement('style');
            style.textContent = `
                .reset-confirm-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .reset-confirm-dialog .dialog-backdrop {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                }
                .reset-confirm-dialog .dialog-content {
                    position: relative;
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    max-width: 400px;
                    width: 90%;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                }
                .reset-confirm-dialog .dialog-header h3 {
                    margin: 0 0 15px 0;
                    color: #333;
                }
                .reset-confirm-dialog .dialog-body {
                    margin-bottom: 20px;
                }
                .reset-confirm-dialog .dialog-body p {
                    margin: 0 0 8px 0;
                    color: #666;
                }
                .reset-confirm-dialog .warning-text {
                    color: #dc3545;
                    font-size: 14px;
                }
                .reset-confirm-dialog .dialog-footer {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                .reset-confirm-dialog .btn-secondary,
                .reset-confirm-dialog .btn-danger {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .reset-confirm-dialog .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                .reset-confirm-dialog .btn-danger {
                    background: #dc3545;
                    color: white;
                }
            `;
            document.head.appendChild(style);

            document.body.appendChild(dialog);

            // 绑定事件
            dialog.querySelector('.cancel-btn').addEventListener('click', () => {
                document.body.removeChild(dialog);
                document.head.removeChild(style);
                resolve(false);
            });

            dialog.querySelector('.confirm-btn').addEventListener('click', () => {
                document.body.removeChild(dialog);
                document.head.removeChild(style);
                resolve(true);
            });

            // ESC键关闭
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.body.removeChild(dialog);
                    document.head.removeChild(style);
                    document.removeEventListener('keydown', handleEscape);
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleEscape);

            // 点击背景关闭
            dialog.querySelector('.dialog-backdrop').addEventListener('click', () => {
                document.body.removeChild(dialog);
                document.head.removeChild(style);
                document.removeEventListener('keydown', handleEscape);
                resolve(false);
            });
        });
    }

    /**
     * 清除编辑模式状态（用于新建元件）
     */
    clearEditingMode() {
        console.log('清除编辑模式状态');
        this.isEditingExisting = false;
        this.originalComponentId = null;
        this.originalComponentName = null;
        this.isReuseMode = false;
        this.updateStatus('已切换到新建模式');
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

        // 根据模式选择不同的保存流程
        if (this.isEditingExisting && this.originalComponentId) {
            // 编辑模式：直接处理覆盖逻辑
            await this.handleEditModeSave();
        } else {
            // 新建或复用模式：显示保存路径选择对话框
        this.showSavePathDialog();
        }
    }

    /**
     * 处理编辑模式的保存
     */
    async handleEditModeSave() {
        try {
            // 生成最终的元件数据
            // 编辑模式：永远使用原始ID，确保覆盖原元件
            console.log(`编辑模式：使用原始ID "${this.originalComponentId}"，覆盖原元件`);
            const componentId = this.originalComponentId;

            const finalComponent = {
                name: this.component.name,
                id: componentId,
                description: this.component.description,
                category: this.component.category,
                pins: this.component.pins,
                dimensions: this.component.dimensions
            };

            // 确保ID不为空
            if (!finalComponent.id || finalComponent.id.trim() === '') {
                console.warn('元件ID为空，重新生成ID', {
                    isEditing: this.isEditingExisting,
                    originalId: this.originalComponentId,
                    componentName: finalComponent.name
                });
                finalComponent.id = this.generateComponentId();
            }

            // 编辑模式下总是显示覆盖确认对话框
            const confirmed = await this.showEditOverwriteConfirmDialog();
            if (!confirmed) {
                return; // 用户取消
            }

            // 执行保存 - 编辑模式下使用智能查找原文件位置的方法
            await this.saveComponentEditMode(finalComponent);

            // 编辑模式不显示保存路径对话框，所以不需要关闭对话框

            console.log('编辑模式保存元件:', finalComponent);
            this.updateStatus(`元件 "${this.component.name}" 保存成功`);

            // 显示成功提示
            if (window.showNotification) {
                window.showNotification(`元件 "${this.component.name}" 保存成功！`, 'success', 4000);
            }

            // 保存成功后，清除编辑模式标识（因为现在这是一个新的元件实例）
            this.isEditingExisting = false;
            this.originalComponentId = null;
            this.originalComponentName = null;
            this.isReuseMode = false;

        } catch (error) {
            console.error('编辑模式保存元件失败:', error);

            // 处理不同的错误类型
            if (error.type) {
                // 这是我们自定义的错误对象
                this.showFileOperationErrorDialog(error);
            } else {
                // 其他未知错误
                alert('保存失败: ' + (error.message || '未知错误'));
            }
        }
    }

    /**
     * 显示编辑模式覆盖确认对话框
     */
    async showEditOverwriteConfirmDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'edit-overwrite-confirm-dialog';
            dialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>⚠️ 确认覆盖</h3>
                    </div>
                    <div class="dialog-body">
                        <p>确定要覆盖现有的元件 "<strong>${this.component.name}</strong>" 吗？</p>
                        <p class="warning-text">此操作将更新现有元件的数据。</p>
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-secondary confirm-cancel-btn">取消</button>
                        <button class="btn-primary confirm-overwrite-btn">确认覆盖</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            // 显示动画
            requestAnimationFrame(() => {
                dialog.classList.add('show');
            });

            // 绑定事件
            dialog.querySelector('.confirm-cancel-btn').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(false);
            });

            dialog.querySelector('.confirm-overwrite-btn').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(true);
            });

            dialog.querySelector('.dialog-backdrop').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(false);
            });

            // ESC键关闭
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.body.removeChild(dialog);
                    document.removeEventListener('keydown', handleEscape);
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    /**
     * 显示保存路径选择对话框
     */
    showSavePathDialog() {
        const dialog = this.createSavePathDialog();
        document.body.appendChild(dialog);

        // 显示动画
        requestAnimationFrame(() => {
            dialog.classList.add('show');
        });
    }

    /**
     * 创建保存路径选择对话框
     */
    createSavePathDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'save-path-dialog';
        dialog.innerHTML = `
            <div class="dialog-backdrop"></div>
            <div class="dialog-content">
                <div class="dialog-header">
                    <h3>保存元件</h3>
                    <button class="dialog-close-btn">&times;</button>
                </div>
                <div class="dialog-body">
                    <p>请选择元件保存位置：</p>
                    <div class="path-options">
                        <div class="path-option" data-path="standard">
                            <div class="path-icon">📚</div>
                            <div class="path-info">
                                <h4>标准元件库</h4>
                                <p>保存到系统标准元件库，可被所有项目使用</p>
                            </div>
                        </div>
                        <div class="path-option" data-path="custom">
                            <div class="path-icon">🔧</div>
                            <div class="path-info">
                                <h4>自定义元件库</h4>
                                <p>保存到用户自定义元件库，仅当前用户可见</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="btn-secondary dialog-cancel-btn">取消</button>
                </div>
            </div>
        `;

        // 绑定事件
        dialog.querySelector('.dialog-close-btn').addEventListener('click', () => {
            this.closeSavePathDialog(dialog);
        });

        dialog.querySelector('.dialog-cancel-btn').addEventListener('click', () => {
            this.closeSavePathDialog(dialog);
        });

        dialog.querySelector('.dialog-backdrop').addEventListener('click', () => {
            this.closeSavePathDialog(dialog);
        });

        // 绑定路径选择事件
        dialog.querySelectorAll('.path-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const path = e.currentTarget.dataset.path;
                this.handlePathSelection(path, dialog);
            });
        });

        return dialog;
    }

    /**
     * 处理路径选择
     */
    async handlePathSelection(selectedPath, dialog) {
        try {
            // 生成最终的元件数据
            // 根据不同的模式确定ID生成策略
            let componentId;
            if (this.isReuseMode) {
                // 复用模式：总是生成新ID，并根据选择的路径确定前缀
                console.log(`复用模式：为元件 "${this.component.name}" 生成新ID，保存到 ${selectedPath} 库`);
                componentId = this.generateComponentIdForPath(selectedPath);
            } else {
                // 新建模式：直接生成ID
                // 注意：编辑模式不会到达这里，因为编辑模式直接调用 handleEditModeSave
                console.log(`新建模式：为元件 "${this.component.name}" 生成新ID`);
                componentId = this.generateComponentId();
            }

            const finalComponent = {
                name: this.component.name,
                id: componentId,
                description: this.component.description,
                category: this.component.category,
                pins: this.component.pins,
                dimensions: this.component.dimensions
            };

            // 确保ID不为空
            if (!finalComponent.id || finalComponent.id.trim() === '') {
                console.warn('元件ID为空，重新生成ID', {
                    isEditing: this.isEditingExisting,
                    originalId: this.originalComponentId,
                    componentName: finalComponent.name
                });
                finalComponent.id = this.generateComponentId();
            }

            // 确保引脚数据结构完整
            if (!finalComponent.pins) {
                console.warn('引脚数据为空，初始化为空结构');
                finalComponent.pins = {
                    side1: [],
                    side2: [],
                    side3: [],
                    side4: []
                };
            }

            // 确保所有引脚边都存在（即使是空数组）
            const requiredSides = ['side1', 'side2', 'side3', 'side4'];
            for (const side of requiredSides) {
                if (!finalComponent.pins.hasOwnProperty(side)) {
                    console.warn(`引脚边 ${side} 缺失，初始化为空数组`);
                    finalComponent.pins[side] = [];
                }
            }

            // JSON格式验证（区分编辑模式和新创建模式）
            console.log('开始JSON验证:', {
                isEditing: this.isEditingExisting,
                componentId: finalComponent.id,
                originalId: this.originalComponentId,
                selectedPath,
                componentPins: Object.keys(finalComponent.pins || {}),
                pinsCount: Object.values(finalComponent.pins || {}).reduce((sum, pins) => sum + pins.length, 0)
            });

            const validationResult = ComponentDesigner.JSONValidator.validateComponent(finalComponent, {
                isEditing: this.isEditingExisting,
                originalPath: selectedPath
            });

            console.log('验证结果:', validationResult);
            console.log('验证参数详情:', {
                isEditing: this.isEditingExisting,
                componentId: finalComponent.id,
                componentName: finalComponent.name,
                hasPins: !!finalComponent.pins,
                pinSides: finalComponent.pins ? Object.keys(finalComponent.pins) : [],
                originalId: this.originalComponentId
            });

            if (!validationResult.valid) {
                // 显示验证错误对话框
                this.showValidationErrorDialog(validationResult.errors, dialog);
                return;
            }

            // 检查重复并保存
            await this.saveWithDuplicateCheck(finalComponent, selectedPath);

            // 关闭对话框
            this.closeSavePathDialog(dialog);

            console.log('保存元件:', finalComponent);
            this.updateStatus(`元件 "${this.component.name}" 保存成功`);

            // 保存成功后，清除编辑模式标识
            this.isEditingExisting = false;
            this.originalComponentId = null;
            this.originalComponentName = null;

            // 注意：复用模式应该保持激活状态，直到用户明确退出复用
            // 这样用户可以连续保存到多个位置
            // this.isReuseMode = false; // 注释掉，不在这里重置

        } catch (error) {
            console.error('保存元件失败:', error);

            // 处理不同的错误类型
            if (error.type) {
                // 这是我们自定义的错误对象
                this.showFileOperationErrorDialog(error);
            } else {
                // 其他未知错误
                alert('保存失败: ' + (error.message || '未知错误'));
            }
        }
    }

    /**
     * 带重复检查的保存
     */
    async saveWithDuplicateCheck(component, path) {
        console.log('开始执行 saveWithDuplicateCheck，元件:', component.name, '路径:', path);

        // 使用Electron IPC通信来检查文件是否存在
        if (!window.electronAPI || !window.electronAPI.saveComponent) {
            console.error('Electron API不可用:', {
                electronAPI: !!window.electronAPI,
                saveComponent: window.electronAPI ? !!window.electronAPI.saveComponent : false
            });
            throw new Error('Electron API不可用，无法保存元件');
        }

        // 通过IPC调用主进程的保存方法
        try {
            console.log('调用IPC: saveComponent');
            const result = await window.electronAPI.saveComponent(component, path);
            console.log('IPC调用结果:', result);

            if (result.success) {
                console.log('元件保存成功:', result.filePath);
                // 显示成功提示
                if (window.showNotification) {
                    window.showNotification(`元件 "${component.name}" 保存成功！`, 'success', 4000);
                }
            } else if (result.duplicate) {
                console.log('检测到重复文件，显示对话框');
                // 文件存在，显示重复处理对话框
                await this.showDuplicateDialog(component, result.filePath, path);
            } else {
                throw new Error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('IPC调用失败:', error);
            throw error;
        }
    }


    /**
     * 编辑模式保存元件（智能查找原文件位置）
     */
    async saveComponentEditMode(component) {
        console.log('开始执行 saveComponentEditMode，元件:', component.name, 'ID:', component.id);

        // 使用Electron IPC通信来编辑模式保存
        if (!window.electronAPI || !window.electronAPI.saveComponentEditMode) {
            console.error('Electron API不可用:', {
                electronAPI: !!window.electronAPI,
                saveComponentEditMode: window.electronAPI ? !!window.electronAPI.saveComponentEditMode : false
            });
            throw new Error('Electron API不可用，无法保存元件');
        }

        // 通过IPC调用主进程的编辑模式保存方法
        try {
            console.log('调用IPC: saveComponentEditMode');
            const result = await window.electronAPI.saveComponentEditMode(component);
            console.log('IPC调用结果:', result);

            if (result.success) {
                console.log('编辑模式元件保存成功:', result.filePath);
                // 显示成功提示
                if (window.showNotification) {
                    window.showNotification(`元件 "${component.name}" 已覆盖保存！`, 'success', 4000);
                }
            } else {
                throw new Error(result.error || '编辑模式保存失败');
            }
        } catch (error) {
            console.error('IPC调用失败:', error);
            throw error;
        }
    }

    /**
     * 强制保存元件（覆盖现有文件）
     */
    async saveComponentForce(component, path) {
        console.log('开始执行 saveComponentForce，元件:', component.name, '路径:', path);

        // 使用Electron IPC通信来强制保存（覆盖）
        if (!window.electronAPI || !window.electronAPI.saveComponentForce) {
            console.error('Electron API不可用:', {
                electronAPI: !!window.electronAPI,
                saveComponentForce: window.electronAPI ? !!window.electronAPI.saveComponentForce : false
            });
            throw new Error('Electron API不可用，无法保存元件');
        }

        // 通过IPC调用主进程的强制保存方法
        try {
            console.log('调用IPC: saveComponentForce');
            const result = await window.electronAPI.saveComponentForce(component, path);
            console.log('IPC调用结果:', result);

            if (result.success) {
                console.log('元件覆盖保存成功:', result.filePath);
                // 显示成功提示
                if (window.showNotification) {
                    window.showNotification(`元件 "${component.name}" 已覆盖保存！`, 'success', 4000);
                }
            } else {
                throw new Error(result.error || '覆盖保存失败');
            }
        } catch (error) {
            console.error('IPC调用失败:', error);
            throw error;
        }
    }

    /**
     * 显示重复元件处理对话框
     */
    async showDuplicateDialog(component, filePath, path) {
        return new Promise((resolve, reject) => {
            const dialog = document.createElement('div');
            dialog.className = 'duplicate-dialog';
            dialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>元件名称重复</h3>
                        <button class="dialog-close-btn">&times;</button>
                    </div>
                    <div class="dialog-body">
                        <p>元件名称 "${component.name}" 已存在。请选择处理方式：</p>
                        <div class="duplicate-options">
                            <button class="btn-primary duplicate-overwrite">覆盖现有元件</button>
                            <button class="btn-secondary duplicate-rename">重命名新元件</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            // 显示动画
            requestAnimationFrame(() => {
                dialog.classList.add('show');
            });

            // 绑定事件
            dialog.querySelector('.dialog-close-btn').addEventListener('click', () => {
                document.body.removeChild(dialog);
                reject(new Error('用户取消操作'));
            });

            dialog.querySelector('.duplicate-overwrite').addEventListener('click', async () => {
                // 添加二次确认对话框
                if (!await this.showOverwriteConfirmDialog(component.name)) {
                    return; // 用户取消覆盖
                }

                try {
                    // 使用IPC通信覆盖保存
                    if (!window.electronAPI || !window.electronAPI.saveComponentForce) {
                        throw new Error('Electron API不可用，无法覆盖保存');
                    }

                    const result = await window.electronAPI.saveComponentForce(component, path);
                    if (result.success) {
                        document.body.removeChild(dialog);
                        // 显示覆盖成功提示
                        if (window.showNotification) {
                            window.showNotification(`元件 "${component.name}" 已覆盖保存！`, 'success', 4000);
                        }
                        resolve();
                    } else {
                        throw new Error(result.error || '覆盖保存失败');
                    }
                } catch (error) {
                    document.body.removeChild(dialog);
                    reject(error);
                }
            });

            dialog.querySelector('.duplicate-rename').addEventListener('click', async () => {
                try {
                    const newName = prompt('请输入新元件名称:', `${component.name}_副本`);
                    if (newName && newName.trim()) {
                        component.name = newName.trim();
                        // 重新生成ID
                        component.id = this.generateComponentId();

                        // 使用IPC通信重命名保存
                        if (!window.electronAPI || !window.electronAPI.saveComponent) {
                            throw new Error('Electron API不可用，无法保存');
                        }

                        const result = await window.electronAPI.saveComponent(component, path);
                        if (result.success) {
                            document.body.removeChild(dialog);
                            // 显示成功提示
                            if (window.showNotification) {
                                window.showNotification(`元件 "${component.name}" 保存成功！`, 'success', 4000);
                            }
                            resolve();
                        } else {
                            throw new Error(result.error || '重命名保存失败');
                        }
                    } else {
                        reject(new Error('无效的元件名称'));
                    }
                } catch (error) {
                    document.body.removeChild(dialog);
                    reject(error);
                }
            });
        });
    }

    /**
     * 显示文件操作错误对话框
     */
    showFileOperationErrorDialog(error) {
        const errorDialog = document.createElement('div');
        errorDialog.className = 'file-error-dialog';

        // 根据错误类型显示不同的图标和建议
        let icon = '⚠️';
        let suggestion = '';

        switch (error.type) {
            case 'PERMISSION_ERROR':
                icon = '🔒';
                suggestion = '请检查文件夹权限设置，或尝试以管理员身份运行应用。';
                break;
            case 'DISK_SPACE_ERROR':
                icon = '💾';
                suggestion = '请清理磁盘空间，或选择其他保存位置。';
                break;
            case 'FILE_LIMIT_ERROR':
                icon = '📁';
                suggestion = '请关闭一些应用程序后再试。';
                break;
            case 'PATH_ERROR':
                icon = '📂';
                suggestion = '请检查文件路径是否正确，或联系技术支持。';
                break;
            default:
                suggestion = '请联系技术支持获取帮助。';
        }

        errorDialog.innerHTML = `
            <div class="dialog-backdrop"></div>
            <div class="dialog-content">
                <div class="dialog-header">
                    <div class="error-icon">${icon}</div>
                    <h3>文件保存失败</h3>
                    <button class="dialog-close-btn">&times;</button>
                </div>
                <div class="dialog-body">
                    <p class="error-message">${error.message}</p>
                    <div class="error-details">
                        <strong>错误类型：</strong>${error.type}<br>
                        <strong>元件名称：</strong>${error.component?.name || '未知'}<br>
                        <strong>元件ID：</strong>${error.component?.id || '未知'}
                    </div>
                    <div class="error-suggestion">
                        <strong>建议解决方案：</strong><br>
                        ${suggestion}
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="btn-secondary error-retry-btn">重试</button>
                    <button class="btn-primary error-ok-btn">确定</button>
                </div>
            </div>
        `;

        document.body.appendChild(errorDialog);

        // 显示动画
        requestAnimationFrame(() => {
            errorDialog.classList.add('show');
        });

        // 绑定事件
        errorDialog.querySelector('.dialog-close-btn').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
        });

        errorDialog.querySelector('.error-ok-btn').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
        });

        errorDialog.querySelector('.error-retry-btn').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
            // 重新显示保存路径选择对话框
            this.showSavePathDialog();
        });

        errorDialog.querySelector('.dialog-backdrop').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
        });
    }

    /**
     * 显示验证错误对话框
     */
    showValidationErrorDialog(errors, parentDialog) {
        const errorDialog = document.createElement('div');
        errorDialog.className = 'validation-error-dialog';
        errorDialog.innerHTML = `
            <div class="dialog-backdrop"></div>
            <div class="dialog-content">
                <div class="dialog-header">
                    <h3>数据验证失败</h3>
                    <button class="dialog-close-btn">&times;</button>
                </div>
                <div class="dialog-body">
                    <p>发现以下数据格式错误，请修正后重新保存：</p>
                    <div class="error-list">
                        ${errors.map(error => `<div class="error-item">• ${error}</div>`).join('')}
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="btn-primary error-ok-btn">确定</button>
                </div>
            </div>
        `;

        document.body.appendChild(errorDialog);

        // 显示动画
        requestAnimationFrame(() => {
            errorDialog.classList.add('show');
        });

        // 绑定事件
        errorDialog.querySelector('.dialog-close-btn').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
        });

        errorDialog.querySelector('.error-ok-btn').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
        });

        errorDialog.querySelector('.dialog-backdrop').addEventListener('click', () => {
            document.body.removeChild(errorDialog);
        });
    }

    /**
     * 显示覆盖确认对话框
     */
    async showOverwriteConfirmDialog(componentName) {
        return new Promise((resolve) => {
            const confirmDialog = document.createElement('div');
            confirmDialog.className = 'overwrite-confirm-dialog';
            confirmDialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>⚠️ 确认覆盖</h3>
                    </div>
                    <div class="dialog-body">
                        <p>确定要覆盖现有的元件 "<strong>${componentName}</strong>" 吗？</p>
                        <p class="warning-text">此操作无法撤销，现有的元件数据将被永久替换。</p>
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-secondary confirm-cancel-btn">取消</button>
                        <button class="btn-danger confirm-overwrite-btn">确认覆盖</button>
                    </div>
                </div>
            `;

            document.body.appendChild(confirmDialog);

            // 显示动画
            requestAnimationFrame(() => {
                confirmDialog.classList.add('show');
            });

            // 绑定事件
            confirmDialog.querySelector('.confirm-cancel-btn').addEventListener('click', () => {
                document.body.removeChild(confirmDialog);
                resolve(false);
            });

            confirmDialog.querySelector('.confirm-overwrite-btn').addEventListener('click', () => {
                document.body.removeChild(confirmDialog);
                resolve(true);
            });

            confirmDialog.querySelector('.dialog-backdrop').addEventListener('click', () => {
                document.body.removeChild(confirmDialog);
                resolve(false);
            });
        });
    }

    /**
     * 关闭保存路径对话框
     */
    closeSavePathDialog(dialog) {
        dialog.classList.add('hide');
        setTimeout(() => {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        }, 300);
    }

    /**
     * JSON格式验证类
     */
    static JSONValidator = class {
        /**
         * 验证元件JSON格式
         * @param {Object} component - 元件数据
         * @returns {Object} 验证结果 {valid: boolean, errors: string[]}
         */
        static validateComponent(component, options = {}) {
            const errors = [];
            const { isEditing = false, originalPath = null } = options;

            // 验证基本字段
            if (!component.name || typeof component.name !== 'string' || component.name.trim() === '') {
                errors.push('元件名称不能为空且必须是字符串');
            }

            // 编辑模式下，如果有原始ID则使用，否则生成新的
            if (!isEditing || !component.id) {
                if (!component.id || typeof component.id !== 'string' || component.id.trim() === '') {
                    errors.push('元件ID不能为空且必须是字符串');
                }
            }

            // 元件描述为可选字段
            if (component.description !== undefined && typeof component.description !== 'string') {
                errors.push('元件描述必须是字符串');
            }

            if (!component.category || typeof component.category !== 'string' || component.category.trim() === '') {
                errors.push('元件类别不能为空且必须是字符串');
            }

            // 验证尺寸
            if (!component.dimensions || typeof component.dimensions !== 'object') {
                errors.push('元件尺寸必须是对象');
            } else {
                if (!this.isValidNumber(component.dimensions.width, 20, 500)) {
                    errors.push('元件宽度必须是20-500之间的数字');
                }
                if (!this.isValidNumber(component.dimensions.height, 20, 500)) {
                    errors.push('元件高度必须是20-500之间的数字');
                }
            }

            // 验证引脚配置
            if (!component.pins || typeof component.pins !== 'object') {
                errors.push('元件引脚配置必须是对象');
            } else {
                // 编辑模式下：只验证存在的引脚边
                // 新建模式下：要求所有4个引脚边都存在
                const sidesToCheck = isEditing ?
                    Object.keys(component.pins) : // 编辑模式：只检查存在的引脚边
                    ['side1', 'side2', 'side3', 'side4']; // 新建模式：要求所有边都存在

                for (const side of sidesToCheck) {
                    if (!component.pins.hasOwnProperty(side)) {
                        if (!isEditing) {
                            errors.push(`缺少引脚边 ${side}`);
                        }
                    } else if (!Array.isArray(component.pins[side])) {
                        errors.push(`引脚边 ${side} 必须是数组`);
                    } else {
                        // 验证每个引脚
                        component.pins[side].forEach((pin, index) => {
                            const pinErrors = this.validatePin(pin, side, index);
                            errors.push(...pinErrors);
                        });
                    }
                }
            }

            // 允许引脚名称重复（部分元件存在多个相同名称的引脚）

            return {
                valid: errors.length === 0,
                errors: errors
            };
        }

        /**
         * 验证单个引脚
         * @param {Object} pin - 引脚对象
         * @param {string} side - 引脚所在边
         * @param {number} index - 引脚在数组中的索引
         * @returns {string[]} 错误信息数组
         */
        static validatePin(pin, side, index) {
            const errors = [];

            if (!pin || typeof pin !== 'object') {
                errors.push(`${side} 的第 ${index + 1} 个引脚必须是对象`);
                return errors;
            }

            // 验证引脚名称
            if (!pin.pinName || typeof pin.pinName !== 'string' || pin.pinName.trim() === '') {
                errors.push(`${side} 的第 ${index + 1} 个引脚名称不能为空`);
            }

            // 验证引脚类型
            if (!pin.type || typeof pin.type !== 'string' || pin.type.trim() === '') {
                errors.push(`${side} 的第 ${index + 1} 个引脚类型不能为空`);
            } else {
                const validTypes = ['power', 'ground', 'digital_io', 'analog_io', 'special'];
                if (!validTypes.includes(pin.type)) {
                    errors.push(`${side} 的第 ${index + 1} 个引脚类型无效: ${pin.type}，有效类型: ${validTypes.join(', ')}`);
                }
            }

            // 验证引脚序号
            if (pin.order === undefined || pin.order === null) {
                errors.push(`${side} 的第 ${index + 1} 个引脚缺少序号`);
            } else if (!Number.isInteger(pin.order) || pin.order < 1) {
                errors.push(`${side} 的第 ${index + 1} 个引脚序号必须是正整数`);
            }

            return errors;
        }

        /**
         * 验证数字是否在有效范围内
         * @param {*} value - 要验证的值
         * @param {number} min - 最小值
         * @param {number} max - 最大值
         * @returns {boolean} 是否有效
         */
        static isValidNumber(value, min, max) {
            return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
        }

        /**
         * 验证ID格式
         * @param {string} id - 元件ID
         * @returns {boolean} 是否有效
         */
        static isValidId(id) {
            // ID应该以字母或数字开头，只能包含字母、数字、连字符和下划线
            const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/;
            return idPattern.test(id);
        }

        /**
         * 验证元件名称
         * @param {string} name - 元件名称
         * @returns {boolean} 是否有效
         */
        static isValidName(name) {
            // 名称不能为空，且不能只包含空白字符
            return name && typeof name === 'string' && name.trim().length > 0;
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
                // 检查引脚名称（允许为空）
                if (!pin.pinName || pin.pinName.trim() === '') {
                    errors.push(`${sideName}的第${index + 1}个引脚名称不能为空`);
                }

                // 检查引脚类型
                const validTypes = ['power', 'ground', 'digital_io', 'analog_io', 'special'];
                if (!validTypes.includes(pin.type)) {
                    errors.push(`${sideName}的第${index + 1}个引脚类型无效`);
                }
            });
        });

        return errors;
    }


    /**
     * 保存元件到文件
     * @param {Object} component - 元件数据
     * @param {string} targetDir - 目标目录（可选，默认使用custom目录）
     */
    async saveComponentToFile(component, targetDir = null) {
        try {
            const fs = require('fs').promises;
            const path = require('path');

            // 如果没有指定目录，使用默认的custom目录
            if (!targetDir) {
                targetDir = path.join(__dirname, '..', 'data', 'system-components', 'custom');
            }

            // 检查目录是否存在，如果不存在则创建
            try {
                await fs.access(targetDir);
            } catch {
                // 目录不存在，尝试创建
                try {
                    await fs.mkdir(targetDir, { recursive: true });
                    console.log(`创建目录: ${targetDir}`);
                } catch (mkdirError) {
                    throw new Error(`无法创建目录 ${targetDir}: ${mkdirError.message}`);
                }
            }

            // 生成文件名
            const fileName = `${component.id}.json`;
            const filePath = path.join(targetDir, fileName);

            // 检查文件是否已存在（防止意外覆盖）
            try {
                await fs.access(filePath);
                // 如果文件存在但我们没有通过重复检查流程到达这里，说明有问题
                console.warn(`文件已存在，将被覆盖: ${filePath}`);
            } catch {
                // 文件不存在，这是正常的
            }

            // 保存JSON文件
            const jsonContent = JSON.stringify(component, null, 2);
            await fs.writeFile(filePath, jsonContent, 'utf8');

            console.log(`元件已保存到: ${filePath}`);
            return { success: true, filePath };

        } catch (error) {
            console.error('保存元件文件失败:', error);

            // 分析错误类型并提供相应的错误信息
            let errorMessage = '未知错误';
            let errorType = 'UNKNOWN_ERROR';

            if (error.code === 'EACCES' || error.code === 'EPERM') {
                errorMessage = '没有文件写入权限，请检查文件夹权限设置';
                errorType = 'PERMISSION_ERROR';
            } else if (error.code === 'ENOSPC') {
                errorMessage = '磁盘空间不足，无法保存文件';
                errorType = 'DISK_SPACE_ERROR';
            } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
                errorMessage = '打开的文件过多，请关闭一些文件后重试';
                errorType = 'FILE_LIMIT_ERROR';
            } else if (error.code === 'ENOENT') {
                errorMessage = '目标路径不存在或无法访问';
                errorType = 'PATH_ERROR';
            } else if (error.code === 'EISDIR') {
                errorMessage = '指定的路径是一个目录而不是文件';
                errorType = 'PATH_ERROR';
            } else if (error.code === 'ENOTDIR') {
                errorMessage = '路径中的某个部分不是目录';
                errorType = 'PATH_ERROR';
            } else {
                errorMessage = `保存失败: ${error.message}`;
            }

            throw {
                type: errorType,
                message: errorMessage,
                originalError: error,
                component: component
            };
        }
    }

    /**
     * 生成元件ID
     */
    generateComponentId() {
        let baseName = '';

        if (this.component.name && this.component.name.trim()) {
            // 如果有名称，使用名称生成基础ID
            baseName = this.component.name
                .trim()
                .toLowerCase()
                .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '') // 移除特殊字符（支持中文）
                .replace(/[\u4e00-\u9fa5]/g, (match) => {
                    // 将中文字符转换为拼音首字母（简化版）
                    const pinyinMap = {
                        '传感器': 'sensor', '模块': 'module', '控制器': 'ctrl',
                        '驱动': 'driver', '接口': 'interface', '转换器': 'converter',
                        '放大器': 'amp', '开关': 'switch', '显示器': 'display',
                        '电机': 'motor', '舵机': 'servo', '灯': 'led'
                    };
                    return pinyinMap[match] || match.charAt(0);
                })
                .replace(/\s+/g, '-') // 替换空格为-
                .replace(/-+/g, '-') // 合并多个-
                .replace(/^-|-$/g, '') // 移除开头和结尾的-
                .substring(0, 15); // 限制长度
        } else {
            // 如果没有名称，使用默认前缀加上类别信息
            const categoryPrefix = this.getCategoryPrefix(this.component.category);
            baseName = `component-${categoryPrefix}`;
        }

        // 生成简化的时间戳（使用更友好的格式）
        const now = new Date();
        const timeString = now.getHours().toString().padStart(2, '0') +
                          now.getMinutes().toString().padStart(2, '0') +
                          now.getSeconds().toString().padStart(2, '0');

        // 生成最终的ID（包含库前缀）
        // 注意：前缀将在主进程中根据保存路径自动确定
        const prefix = this.determineLibraryPrefix();
        this.component.id = `${prefix}-${baseName}-${timeString}`;

        console.log(`生成的元件ID: ${this.component.id} (基于名称: "${this.component.name || '无名称'}")`);
        return this.component.id;
    }

    /**
     * 确定元件库前缀（用于ID生成）
     */
    determineLibraryPrefix() {
        // 在编辑模式下，如果是编辑现有元件，返回原ID中的前缀
        if (this.isEditingExisting && this.originalComponentId) {
            if (this.originalComponentId.startsWith('std-')) {
                return 'std';
            } else if (this.originalComponentId.startsWith('ctm-')) {
                return 'ctm';
            }
        }

        // 对于新建或复用模式，默认使用ctm前缀
        // 实际的前缀将在主进程中根据保存路径重新确定
        return 'ctm';
    }

    /**
     * 根据指定路径生成元件ID（用于复用模式）
     * @param {string} targetPath - 目标保存路径 ('standard' 或 'custom')
     */
    generateComponentIdForPath(targetPath) {
        let baseName = '';

        if (this.component.name && this.component.name.trim()) {
            // 如果有名称，使用名称生成基础ID
            baseName = this.component.name
                .trim()
                .toLowerCase()
                .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '') // 移除特殊字符（支持中文）
                .replace(/[\u4e00-\u9fa5]/g, (match) => {
                    // 将中文字符转换为拼音首字母（简化版）
                    const pinyinMap = {
                        '传感器': 'sensor', '模块': 'module', '控制器': 'ctrl',
                        '驱动': 'driver', '接口': 'interface', '转换器': 'converter',
                        '放大器': 'amp', '开关': 'switch', '显示器': 'display',
                        '电机': 'motor', '舵机': 'servo', '灯': 'led'
                    };
                    return pinyinMap[match] || match.charAt(0);
                })
                .replace(/\s+/g, '-') // 替换空格为-
                .replace(/-+/g, '-') // 合并多个-
                .replace(/^-|-$/g, '') // 移除开头和结尾的-
                .substring(0, 15); // 限制长度
        } else {
            // 如果没有名称，使用默认前缀加上类别信息
            const categoryPrefix = this.getCategoryPrefix(this.component.category);
            baseName = `component-${categoryPrefix}`;
        }

        // 生成简化的时间戳（使用更友好的格式）
        const now = new Date();
        const timeString = now.getHours().toString().padStart(2, '0') +
                          now.getMinutes().toString().padStart(2, '0') +
                          now.getSeconds().toString().padStart(2, '0');

        // 根据目标路径确定前缀
        const prefix = targetPath === 'standard' ? 'std' : 'ctm';

        // 生成最终的ID
        this.component.id = `${prefix}-${baseName}-${timeString}`;

        console.log(`根据路径 ${targetPath} 生成的元件ID: ${this.component.id} (基于名称: "${this.component.name || '无名称'}")`);
        return this.component.id;
    }

    /**
     * 获取类别前缀
     */
    getCategoryPrefix(category) {
        const prefixMap = {
            'microcontroller': 'mcu',
            'sensor': 'sensor',
            'actuator': 'act',
            'power': 'pwr',
            'communication': 'comm',
            'auxiliary': 'aux',
            'other': 'misc'
        };

        return prefixMap[category] || 'comp';
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
            // 添加模式指示器
            let modeIndicator;
            if (this.isReuseMode) {
                modeIndicator = '[复用模式]';
            } else if (this.isEditingExisting) {
                modeIndicator = '[编辑模式]';
            } else {
                modeIndicator = '[新建模式]';
            }
            this.elements.statusMessage.textContent = `${modeIndicator} ${message}`;
        }

        // 在控制台输出详细状态信息（已删除缩放日志）
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
     * 同步尺寸到属性栏输入框
     */
    syncDimensionsToInputs() {
        // 确保能访问到设计器的elements
        const elements = this.elements || (this.designer ? this.designer.elements : null);
        const componentRect = this.componentRect;

        if (elements) {
            const { widthInput, heightInput } = elements;
            if (widthInput && componentRect) {
                const newWidth = componentRect.width;
                if (widthInput.value != newWidth) {
                    widthInput.value = newWidth;
                }
            }
            if (heightInput && componentRect) {
                const newHeight = componentRect.height;
                if (heightInput.value != newHeight) {
                    heightInput.value = newHeight;
                }
            }
        } else {
            console.warn('无法同步尺寸：elements对象不可用');
        }
    }

    /**
     * 更新元件尺寸
     */
    updateComponentSize(width, height) {
        // 限制尺寸范围
        width = Math.max(20, Math.min(500, width));
        height = Math.max(20, Math.min(500, height));

        // 确保 dimensions 对象存在
        if (!this.component.dimensions) {
            this.component.dimensions = { width: 100, height: 80 };
        }

        // 更新元件尺寸
        this.component.dimensions.width = width;
        this.component.dimensions.height = height;


        // 确保 componentRect 对象存在
        if (!this.componentRect) {
            // 如果不存在，初始化为默认值
            const canvas = this.elements.canvas;
            if (canvas) {
                this.componentRect = {
                    x: canvas.width / 2 - width / 2,
                    y: canvas.height / 2 - height / 2,
                    width: width,
                    height: height
                };
            } else {
                // 如果画布也不存在，使用默认位置
                this.componentRect = {
                    x: 200 - width / 2,
                    y: 150 - height / 2,
                    width: width,
                    height: height
                };
            }
        } else {
            // 更新现有尺寸，保持位置居中
            this.componentRect.width = width;
            this.componentRect.height = height;
        }

        // 重新居中元件
        if (this.canvas) {
            const canvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
            const canvasHeight = this.canvas.height / (window.devicePixelRatio || 1);
            this.componentRect.x = (canvasWidth - this.componentRect.width) / 2;
            this.componentRect.y = (canvasHeight - this.componentRect.height) / 2;
        }

        // 同步更新属性栏的尺寸输入框
        this.syncDimensionsToInputs();

        // 重新渲染画布
        this.render();

        // 更新状态
        this.updateStatus(`元件尺寸已更改为: ${width} × ${height}px`);
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

        // 使用设计器的 componentRect，而不是创建自己的副本
        // 如果设计器还没有初始化 componentRect，则创建一个临时的
        if (!designer.componentRect) {
            designer.componentRect = {
                x: Math.floor(canvas.width / 2 / this.gridSize) * this.gridSize - 60, // 居中并对齐格线
                y: Math.floor(canvas.height / 2 / this.gridSize) * this.gridSize - 40,
                width: 120, // 6个格子宽
                height: 80   // 4个格子高
            };
        }
        // 创建一个动态引用，确保始终使用最新的尺寸
        Object.defineProperty(this, 'componentRect', {
            get: () => designer.componentRect,
            set: (value) => {
                designer.componentRect = value;
            }
        });

        // 延迟初始化画布尺寸，避免构造函数中调用渲染时出现警告
        setTimeout(() => {
        this.resizeCanvas();
        this.resetView();
        }, 0);

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

        // 绘制元件和引脚（先绘制元件，再绘制引脚覆盖边框）
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

        // 简单居中，不需要网格对齐
        this.componentRect.x = (canvasWidth - this.componentRect.width) / 2;
        this.componentRect.y = (canvasHeight - this.componentRect.height) / 2;

        // 同步尺寸到输入框
        this.syncDimensionsToInputs();
    }

    /**
     * 同步尺寸到属性栏输入框
     */
    syncDimensionsToInputs() {
        // 如果是在渲染器上下文中调用，需要通过 designer 访问元素
        const elements = this.designer ? this.designer.elements : this.elements;
        const componentRect = this.componentRect;

        if (elements) {
            const { widthInput, heightInput } = elements;
            if (widthInput && componentRect) {
                widthInput.value = componentRect.width;
            }
            if (heightInput && componentRect) {
                heightInput.value = componentRect.height;
            }
        } else {
            console.warn('渲染器无法同步尺寸：elements对象不可用');
        }
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

        // 只在缩放变化明显时才更新状态，避免频繁更新
        const zoomPercent = (renderer.scale * 100).toFixed(0);
        if (!this._lastZoomPercent || Math.abs(parseInt(zoomPercent) - parseInt(this._lastZoomPercent)) >= 5) {
            this.designer.updateStatus(`缩放: ${zoomPercent}%`);
            this._lastZoomPercent = zoomPercent;
        }
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
        // 绘制元件主体矩形（带圆角）
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2 / this.scale;

        // 计算圆角半径（参照元件预览SVG的4px，考虑缩放）
        const radius = 4 / this.scale;

        // 保存当前上下文状态
        this.ctx.save();

        // 绘制圆角矩形
        this.roundedRect(
            this.componentRect.x,
            this.componentRect.y,
            this.componentRect.width,
            this.componentRect.height,
            radius
        );

        this.ctx.fill();
        this.ctx.stroke();

        // 绘制元件名称
        this.drawComponentName();

        // 恢复上下文状态
        this.ctx.restore();
    }

    /**
     * 绘制圆角矩形路径
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
     */
    drawComponentName() {
        const componentName = this.designer.component.name || '未命名元件';

        // 设置文字样式
        this.ctx.fillStyle = '#333';
        this.ctx.font = `${Math.max(12, Math.min(16, this.componentRect.width / 8))}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 计算文字区域（距离边界10px）
        const textPadding = 10 / this.scale;
        const textX = this.componentRect.x + this.componentRect.width / 2;
        const textY = this.componentRect.y + this.componentRect.height / 2;

        // 绘制文字
        this.ctx.fillText(componentName, textX, textY);
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
        const calculator = new PinPositionCalculator(this.componentRect, this.designer);

        // 总是运行自动尺寸调整，确保引脚正确显示
        // 这样可以保证无论导入的原始尺寸如何，都能正确显示所有引脚
        const sizeChanged = calculator.adjustComponentSizeForPins(this.designer.component);

        // 如果尺寸发生了变化，需要更新元件位置并重新渲染
        if (sizeChanged) {
            this.updateComponentPosition();
            // 同步更新属性栏的尺寸输入框
            this.syncDimensionsToInputs();
            this.designer.render();
            return; // 重新渲染后退出，避免重复绘制
        }

        const allPins = calculator.calculateAllPositions(this.designer.component);

        allPins.forEach(pin => {
            this.drawPin(pin);
        });
    }

    /**
     * 绘制单个引脚
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
            case 'side1': // 上边 - 文字顺时针旋转90度（纵向向上）
                labelY -= textOffset;
                rotation = Math.PI / 2; // 顺时针90度
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                break;
            case 'side2': // 右边 - 文字水平向右
                labelX += textOffset;
                rotation = 0; // 不旋转
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                break;
            case 'side3': // 下边 - 文字逆时针旋转90度（纵向向下）
                labelY += textOffset;
                rotation = -Math.PI / 2; // 逆时针90度
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                break;
            case 'side4': // 左边 - 文字水平向左
                labelX -= textOffset;
                rotation = 0; // 不旋转
                this.ctx.textAlign = 'right';
                this.ctx.textBaseline = 'middle';
                break;
        }

        // 保存当前上下文状态
        this.ctx.save();

        // 应用旋转变换
        if (rotation !== 0) {
            this.ctx.translate(labelX, labelY);
            this.ctx.rotate(rotation);
            this.ctx.fillText(pinName, 0, 0);
        } else {
            // 不旋转的正常绘制
            this.ctx.fillText(pinName, labelX, labelY);
        }

        // 恢复上下文状态
        this.ctx.restore();
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
            'special': '#6f42c1'     // 紫色 - 特殊引脚
        };

        return colorMap[type] || '#667eea'; // 默认蓝色
    }
}

/**
 * 引脚位置计算器
 */
class PinPositionCalculator {
    constructor(componentRect, designer = null) {
        this.componentRect = componentRect;
        this.designer = designer;
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
     * 检查并调整元件尺寸以适应引脚布局
     */
    adjustComponentSizeForPins(component) {
        const spacing = 10; // 固定引脚间距
        const margin = 15; // 边界距离调整为15px（确保在10-20px范围内）
        const minSize = 60; // 最小尺寸

        let newWidth = this.componentRect.width;
        let newHeight = this.componentRect.height;
        let sizeChanged = false;

        // 检查上下边的引脚需求（水平布局）
        const topPins = component.pins.side1?.length || 0;
        const bottomPins = component.pins.side3?.length || 0;
        const maxHorizontalPins = Math.max(topPins, bottomPins);

        if (maxHorizontalPins > 0) {
            // 计算需要的总长度：引脚数 * 引脚宽度 + (引脚数 - 1) * 间距 + 边界 * 2
            // 这里引脚宽度近似为12px（中等尺寸，实际会根据缩放调整，但计算时使用固定值）
            const pinWidth = 12;
            const totalLength = maxHorizontalPins * pinWidth + (maxHorizontalPins - 1) * spacing + margin * 2;

            if (totalLength > newWidth) {
                // 以10px为单位向上取整，向右拓展
                newWidth = Math.ceil(totalLength / 10) * 10;
                newWidth = Math.max(newWidth, minSize);
                sizeChanged = true;
            }
        }

        // 检查左右边的引脚需求（垂直布局）
        const rightPins = component.pins.side2?.length || 0;
        const leftPins = component.pins.side4?.length || 0;
        const maxVerticalPins = Math.max(rightPins, leftPins);

        if (maxVerticalPins > 0) {
            // 计算需要的总长度：引脚数 * 引脚高度 + (引脚数 - 1) * 间距 + 边界 * 2
            const pinHeight = 12;
            const totalLength = maxVerticalPins * pinHeight + (maxVerticalPins - 1) * spacing + margin * 2;

            if (totalLength > newHeight) {
                // 以10px为单位向上取整，向下拓展
                newHeight = Math.ceil(totalLength / 10) * 10;
                newHeight = Math.max(newHeight, minSize);
                sizeChanged = true;
            }
        }

        // 更新元件尺寸（如果需要）
        if (sizeChanged) {
            const oldWidth = this.componentRect.width;
            const oldHeight = this.componentRect.height;

            this.componentRect.width = newWidth;
            this.componentRect.height = newHeight;

            // 同步更新component对象的尺寸
            component.dimensions.width = newWidth;
            component.dimensions.height = newHeight;

        }

        return sizeChanged;
    }

    /**
     * 获取单个引脚在边上的位置
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
                    const x = side === 'side2' ? rect.x + rect.width : rect.x;
                    // 每个引脚的位置：起始位置 + 引脚索引 * (引脚高度 + 间距) + 引脚高度/2（居中）
                    const y = startY + index * (pinHeight + spacing) + pinHeight / 2;
                    return { x, y };
                }
                return { x: rect.x, y: rect.y + rect.height / 2 };

            default:
                return { x: 0, y: 0 };
        }
    }

    /**
     * 计算引脚间距（固定10px）
     */
    getSpacing(totalPins) {
        return 10; // 固定引脚间距为10px
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
                    <option value="power" ${pin.type === 'power' ? 'selected' : ''}>电源引脚</option>
                    <option value="ground" ${pin.type === 'ground' ? 'selected' : ''}>接地引脚</option>
                    <option value="digital_io" ${pin.type === 'digital_io' ? 'selected' : ''}>数字I/O</option>
                    <option value="analog_io" ${pin.type === 'analog_io' ? 'selected' : ''}>模拟I/O</option>
                    <option value="special" ${pin.type === 'special' ? 'selected' : ''}>特殊引脚</option>
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
            const validTypes = ['power', 'ground', 'digital_io', 'analog_io', 'special'];
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

                }

                // 延迟多帧，确保DOM和样式完全渲染
                let renderAttempts = 0;
                const maxRenderAttempts = 3;

                const doRender = () => {
                    renderAttempts++;
                    if (renderAttempts <= 2 || renderAttempts === maxRenderAttempts) {
                    }

                if (!componentDesigner) {
                    componentDesigner = new ComponentDesigner();
                } else if (componentDesigner.initialized) {
                        // 如果已经初始化，强制重新渲染
                        componentDesigner.renderer.forceRender();
                } else {
                    // 如果初始化失败，尝试重新初始化
                    const success = componentDesigner.init();
                    if (success) {
                        componentDesigner.initialized = true;
                            componentDesigner.renderer.forceRender();
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

// 延迟导出元件设计器实例，确保初始化完成
function exportComponentDesigner() {
    if (componentDesigner && componentDesigner.initialized) {
window.componentDesigner = componentDesigner;
        console.log('元件设计器已导出到全局作用域');
    } else {
        // 如果还没初始化，等待一段时间后再试
        setTimeout(exportComponentDesigner, 100);
    }
}

// 导出关键类到全局作用域
window.PinPositionCalculator = PinPositionCalculator;
window.SimpleCanvasRenderer = SimpleCanvasRenderer;
window.SimpleInteractionManager = SimpleInteractionManager;
window.PinEditorModal = PinEditorModal;

// 添加调试工具到全局作用域
window.debugComponentDesigner = function() {
    if (window.componentDesigner) {
        const designer = window.componentDesigner;
        console.log('=== 元件设计器调试信息 ===');
        console.log('编辑模式:', designer.isEditingExisting);
        console.log('原始元件ID:', designer.originalComponentId);
        console.log('当前元件ID:', designer.component.id);
        console.log('元件名称:', designer.component.name);
        console.log('引脚数据:', designer.component.pins);
        console.log('引脚统计:', Object.values(designer.component.pins || {}).reduce((sum, pins) => sum + pins.length, 0));
        return designer;
    } else {
        console.error('元件设计器实例不存在');
        return null;
    }
};

// 立即尝试导出，如果失败则延迟
if (componentDesigner) {
    window.componentDesigner = componentDesigner;
} else {
    setTimeout(exportComponentDesigner, 100);
}
