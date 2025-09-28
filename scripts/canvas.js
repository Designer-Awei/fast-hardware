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

        // 选中状态管理
        this.selectedComponent = null; // 当前选中的元件
        this.isDraggingComponent = false; // 是否正在拖动元件
        this.dragStartPos = null; // 拖动开始时的鼠标位置
        this.componentDragStartPos = null; // 拖动开始时元件的位置

        // 连线系统相关属性
        this.pinInteraction = {
            activePin: null,        // 当前激活的引脚 {componentId, pinName, position, side}
            hoveredPin: null,       // 当前悬停的引脚
            connectionMode: false,  // 是否处于连线模式
            tempConnection: null,   // 临时连线路径
            connectorSize: 16,      // 连接器圆圈大小
            snapDistance: 15,       // 吸附距离（调小为15像素）
            connectionEditMode: false, // 是否处于连线编辑模式
            editingConnection: null,   // 正在编辑的连线
            editingEnd: null          // 编辑的端点 ('source' 或 'target')
        };

        // 连线管理
        this.connections = []; // 存储所有连线
        this.selectedConnection = null; // 当前选中的连线

        this.init();
    }

    /**
     * 将旋转角度映射为方向标识符
     * @param {number} rotation - 旋转角度（度）
     * @returns {string} 方向标识符
     */
    getDirectionFromRotation(rotation) {
        // 标准化角度到0-360范围
        const normalizedRotation = ((rotation % 360) + 360) % 360;

        switch (normalizedRotation) {
            case 0:
                return 'up';
            case 90:
                return 'right';  // 逆时针90°从up变为right
            case 180:
                return 'down';  // 逆时针180°从up变为down
            case 270:
                return 'left';  // 逆时针270°从up变为left
            default:
                console.warn(`未知的旋转角度: ${rotation}°, 默认为 'up'`);
                return 'up';
        }
    }

    /**
     * 将方向标识符映射为旋转角度
     * @param {string} direction - 方向标识符
     * @returns {number} 旋转角度（度）
     */
    getRotationFromDirection(direction) {
        switch (direction) {
            case 'up':
                return 0;
            case 'right':
                return 90;   // right对应90°
            case 'down':
                return 180;  // down对应180°
            case 'left':
                return 270;  // left对应270°
            default:
                console.warn(`未知的方向标识符: ${direction}, 默认为 0°`);
                return 0;
        }
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
        document.getElementById('reset-view')?.addEventListener('click', () => this.resetView());
        document.getElementById('firmware-code')?.addEventListener('click', () => this.openFirmwareCodeEditor());

        // 窗口大小改变
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            // resizeCanvas内部已经调用了draw()，这里不需要重复调用
        });

        // 拖拽事件 - 接收来自悬浮面板的元件
        this.canvas.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.canvas.addEventListener('drop', (e) => this.handleDrop(e));
        this.canvas.addEventListener('dragleave', (e) => this.handleDragLeave(e));

        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    /**
     * 处理鼠标按下事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseDown(e) {
        const mousePos = this.getMousePosition(e);
        const worldPos = this.screenToWorld(mousePos);

        // 首先检查是否点击了引脚连接器
        if (this.pinInteraction.activePin) {
            // 如果有激活的引脚，进入连线模式
            this.pinInteraction.connectionMode = true;
            this.pinInteraction.tempConnection = {
                source: this.pinInteraction.activePin,
                currentPos: worldPos,
                path: [this.pinInteraction.activePin.position, worldPos]
            };
            this.canvas.style.cursor = 'crosshair';
            console.log('开始连线:', this.pinInteraction.activePin.pinName);
            e.preventDefault();
            this.draw();
            return;
        }

        // 首先检查是否点击了连线编辑符号
        const clickedEditHandle = this.getConnectionEditHandleAtPosition(worldPos);
        if (clickedEditHandle) {
            this.pinInteraction.editingEnd = clickedEditHandle.end;
            this.pinInteraction.connectionMode = true;

            // 创建临时连线用于编辑
            const connection = clickedEditHandle.connection;
            const fixedEnd = clickedEditHandle.end === 'source' ? connection.target : connection.source;
            const movingEnd = clickedEditHandle.end === 'source' ? connection.source : connection.target;

            this.pinInteraction.tempConnection = {
                source: movingEnd,
                currentPos: worldPos,
                path: [movingEnd.position, worldPos],
                isEditing: true,
                originalConnection: connection
            };

            this.canvas.style.cursor = 'crosshair';
            console.log(`开始编辑连线 ${clickedEditHandle.end} 端`);
            e.preventDefault();
            this.draw();
            return;
        }

        // 然后检查是否点击了连线（非编辑符号区域）
        const clickedConnection = this.getConnectionAtPosition(worldPos);
        if (clickedConnection) {
            this.selectConnection(clickedConnection);
            this.canvas.style.cursor = 'pointer';
            e.preventDefault();
            this.draw();
            return;
        }

        // 检查是否点击了元件
        const clickedComponent = this.getComponentAtPosition(worldPos);

        if (clickedComponent) {
            // 检查是否点击了引脚
            const clickedPin = this.detectPinAtPosition(mousePos);

            if (clickedPin) {
                // 点击了引脚 - 显示连接器并准备连线
                this.pinInteraction.activePin = clickedPin;
                this.selectComponent(clickedComponent); // 确保元件被选中
                this.canvas.style.cursor = 'pointer';
                console.log('激活引脚:', clickedPin.pinName);
                e.preventDefault();
                this.draw();
                return;
            }

            // 点击了元件主体 - 选中元件并准备拖动
            this.selectComponent(clickedComponent);
            this.isDraggingComponent = true;
            this.dragStartPos = mousePos;
            this.componentDragStartPos = { ...clickedComponent.position };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        } else {
            // 点击空白区域 - 取消选中并开始画布拖拽
            this.deselectComponent();
            this.deselectConnection();
            // 清除引脚激活状态
            this.pinInteraction.activePin = null;
            this.pinInteraction.connectionMode = false;
            this.pinInteraction.tempConnection = null;

            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
        }

        this.draw();
    }

    /**
     * 处理鼠标移动事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseMove(e) {
        // 更新鼠标坐标显示
        this.updateMouseCoordinates(e);

        const mousePos = this.getMousePosition(e);
        const worldPos = this.screenToWorld(mousePos);

        // 处理连线模式
        if (this.pinInteraction.connectionMode && this.pinInteraction.tempConnection) {
            // 更新临时连线路径
            this.pinInteraction.tempConnection.currentPos = worldPos;
            this.pinInteraction.tempConnection.path = [
                this.pinInteraction.tempConnection.source.position,
                worldPos
            ];

            // 检查是否悬停在目标引脚上
            this.pinInteraction.hoveredPin = this.detectSnapTarget(worldPos);

            this.draw();
            return;
        }

        if (this.isDraggingComponent && this.selectedComponent && this.dragStartPos) {
            // 拖动元件
            const deltaX = mousePos.x - this.dragStartPos.x;
            const deltaY = mousePos.y - this.dragStartPos.y;

            // 转换为世界坐标的移动距离
            const worldDeltaX = deltaX / this.scale;
            const worldDeltaY = deltaY / this.scale;

            // 更新元件位置
            this.selectedComponent.position.x = this.componentDragStartPos.x + worldDeltaX;
            this.selectedComponent.position.y = this.componentDragStartPos.y + worldDeltaY;

            // 实时更新相关连线路径
            this.updateConnectionsForComponent(this.selectedComponent.id);

            this.draw();
        } else if (this.isDragging) {
            // 拖拽画布
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            this.offsetX += deltaX;
            this.offsetY += deltaY;

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.draw();
        } else {
            // 检查鼠标悬停状态
            const hoveredComponent = this.getComponentAtPosition(worldPos);

            if (this.selectedComponent) {
                // 如果有选中元件，检查是否悬停在引脚上
                const hoveredPin = this.detectPinAtPosition(mousePos);
                if (hoveredPin) {
                    this.canvas.style.cursor = 'pointer';
                    // 如果之前没有悬停的引脚，更新状态
                    if (!this.pinInteraction.activePin ||
                        this.pinInteraction.activePin.pinName !== hoveredPin.pinName) {
                        this.pinInteraction.activePin = hoveredPin;
                        this.draw(); // 重新绘制以显示连接器
                    }
                } else if (hoveredComponent && hoveredComponent !== this.selectedComponent) {
                    this.canvas.style.cursor = 'pointer';
                    // 清除引脚激活状态
                    if (this.pinInteraction.activePin) {
                        this.pinInteraction.activePin = null;
                        this.draw();
                    }
                } else if (hoveredComponent === this.selectedComponent) {
                    this.canvas.style.cursor = 'pointer';
                } else {
                    this.canvas.style.cursor = 'grab';
                    // 清除引脚激活状态
                    if (this.pinInteraction.activePin) {
                        this.pinInteraction.activePin = null;
                        this.draw();
                    }
                }
            } else {
                if (hoveredComponent) {
                    this.canvas.style.cursor = 'pointer';
                } else {
                    this.canvas.style.cursor = 'grab';
                }
                // 清除引脚激活状态
                if (this.pinInteraction.activePin) {
                    this.pinInteraction.activePin = null;
                    this.draw();
                }
            }
        }
    }

    /**
     * 检测鼠标位置附近的吸附目标引脚
     * @param {Object} worldPos - 世界坐标位置
     * @returns {Object|null} 目标引脚信息或null
     */
    detectSnapTarget(worldPos) {
        // 遍历所有元件（除了源元件）
        for (const component of this.components) {
            if (component.id === this.pinInteraction.activePin?.componentId) {
                continue; // 跳过源元件
            }

            const { data, position, rotation } = component;
            const { x: compX, y: compY } = position;

            // 计算元件边界
            const width = data.dimensions?.width || 80;
            const height = data.dimensions?.height || 60;

            const componentRect = {
                x: compX - width / 2,
                y: compY - height / 2,
                width: width,
                height: height
            };

            // 获取所有引脚位置（未旋转状态下的位置）
            const pinCalculator = new CanvasPinPositionCalculator(componentRect);
            const allPins = pinCalculator.calculateAllPositions(data.pins);

            // 检测鼠标是否在某个引脚附近
            for (const pin of allPins) {
                // 对引脚位置进行旋转变换
                const rotatedPosition = this.rotatePoint(pin.position, { x: compX, y: compY }, rotation);

                const distance = Math.sqrt(
                    Math.pow(worldPos.x - rotatedPosition.x, 2) +
                    Math.pow(worldPos.y - rotatedPosition.y, 2)
                );

                // 如果鼠标在引脚吸附距离范围内
                if (distance <= this.pinInteraction.snapDistance) {
                    // 生成唯一的引脚ID：边名-序号
                    const pinId = `${pin.side}-${pin.order}`;

                    return {
                        componentId: component.id,
                        component: component,
                        pinId: pinId,              // 新增：唯一的引脚标识
                        pinName: pin.pinName,      // 保留：引脚名称（用于显示）
                        position: rotatedPosition, // 返回旋转后的实际位置
                        side: pin.side,
                        order: pin.order,          // 新增：引脚序号
                        type: pin.type
                    };
                }
            }
        }

        return null;
    }

    /**
     * 处理鼠标释放事件
     */
    handleMouseUp() {
        // 处理连线完成
        if (this.pinInteraction.connectionMode && this.pinInteraction.tempConnection) {
            const tempConnection = this.pinInteraction.tempConnection;

            if (this.pinInteraction.hoveredPin) {
                // 成功连接到目标引脚
                if (tempConnection.isEditing) {
                    // 这是连线编辑模式，更新现有连线
                    this.updateConnectionEnd(
                        tempConnection.originalConnection,
                        this.pinInteraction.editingEnd,
                        this.pinInteraction.hoveredPin
                    );
                    console.log(`连线编辑完成: ${this.pinInteraction.editingEnd} 端连接到 ${this.pinInteraction.hoveredPin.pinName}`);
                } else {
                    // 这是新建连线模式
                    this.createConnection(
                        tempConnection.source,
                        this.pinInteraction.hoveredPin
                    );
                    console.log(`连线完成: ${tempConnection.source.pinName} -> ${this.pinInteraction.hoveredPin.pinName}`);
                }
            } else {
                // 未连接到目标，取消连线
                console.log('连线取消');
            }

            // 清理连线状态
            this.pinInteraction.connectionMode = false;
            this.pinInteraction.tempConnection = null;
            this.pinInteraction.hoveredPin = null;
            this.pinInteraction.editingEnd = null;
            this.canvas.style.cursor = 'pointer';
            this.draw();
            return;
        }

        if (this.isDraggingComponent) {
            // 结束元件拖动
            this.isDraggingComponent = false;
            this.dragStartPos = null;
            this.componentDragStartPos = null;
            this.canvas.style.cursor = 'pointer';

            // 最终确认连线路径（虽然拖拽过程中已实时更新，但这里确保最终状态正确）
            if (this.selectedComponent) {
                this.updateConnectionsForComponent(this.selectedComponent.id);
            }
        } else if (this.isDragging) {
            // 结束画布拖拽
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
        }
    }

    /**
     * 获取鼠标位置
     * @param {MouseEvent} e - 鼠标事件
     * @returns {Object} 鼠标位置 {x, y}
     */
    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * 屏幕坐标转换为世界坐标
     * @param {Object} screenPos - 屏幕坐标 {x, y}
     * @returns {Object} 世界坐标 {x, y}
     */
    screenToWorld(screenPos) {
        return {
            x: (screenPos.x - this.offsetX) / this.scale,
            y: (screenPos.y - this.offsetY) / this.scale
        };
    }

    /**
     * 获取指定位置的元件
     * @param {Object} worldPos - 世界坐标 {x, y}
     * @returns {Object|null} 元件实例或null
     */
    getComponentAtPosition(worldPos) {
        // 从后往前遍历，确保后添加的元件优先被选中
        for (let i = this.components.length - 1; i >= 0; i--) {
            const component = this.components[i];
            if (this.isPointInComponent(worldPos, component)) {
                return component;
            }
        }
        return null;
    }

    /**
     * 检查点是否在元件内
     * @param {Object} point - 世界坐标点 {x, y}
     * @param {Object} component - 元件实例
     * @returns {boolean} 是否在元件内
     */
    isPointInComponent(point, component) {
        const { data, position, rotation = 0 } = component;
        const width = data.dimensions?.width || 80;
        const height = data.dimensions?.height || 60;

        // 如果元件没有旋转，使用简单的边界框检测
        if (rotation === 0) {
            const left = position.x - width / 2;
            const right = position.x + width / 2;
            const top = position.y - height / 2;
            const bottom = position.y + height / 2;

            return point.x >= left && point.x <= right &&
                   point.y >= top && point.y <= bottom;
        }

        // 对于旋转的元件，将世界坐标转换为元件本地坐标
        const localPoint = this.inverseRotatePoint(point, position, rotation);

        // 在本地坐标系中进行边界框检测
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        return localPoint.x >= -halfWidth && localPoint.x <= halfWidth &&
               localPoint.y >= -halfHeight && localPoint.y <= halfHeight;
    }

    /**
     * 选中元件
     * @param {Object} component - 要选中的元件
     */
    selectComponent(component) {
        // 如果已经选中了其他元件，先取消选中
        if (this.selectedComponent && this.selectedComponent !== component) {
            this.selectedComponent.selected = false;
        }

        // 选中新元件
        this.selectedComponent = component;
        component.selected = true;

        const direction = this.getDirectionFromRotation(component.rotation || 0);
        console.log(`选中元件: ${component.data.name} (${direction})`);
    }

    /**
     * 取消选中元件
     */
    deselectComponent() {
        if (this.selectedComponent) {
            const direction = this.getDirectionFromRotation(this.selectedComponent.rotation || 0);
            this.selectedComponent.selected = false;
            console.log(`取消选中元件: ${this.selectedComponent.data.name} (${direction})`);
        }
        this.selectedComponent = null;
    }

    /**
     * 处理键盘按下事件
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyDown(e) {
        // 只有在画布获得焦点时才处理键盘事件
        if (!this.canvas.contains(document.activeElement) &&
            document.activeElement !== document.body) {
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'delete':
            case 'backspace':
                if (this.selectedConnection) {
                    this.deleteSelectedConnection();
                } else {
                    this.deleteSelectedComponent();
                }
                e.preventDefault();
                break;
            case 'r':
                if (this.selectedComponent) {
                    this.rotateSelectedComponent();
                    e.preventDefault();
                }
                break;
            case 'escape':
                this.deselectComponent();
                this.deselectConnection();
                this.draw();
                e.preventDefault();
                break;
        }
    }

    /**
     * 删除选中的元件
     */
    deleteSelectedComponent() {
        if (!this.selectedComponent) return;

        const componentName = this.selectedComponent.data.name;
        const direction = this.getDirectionFromRotation(this.selectedComponent.rotation || 0);
        const index = this.components.indexOf(this.selectedComponent);

        if (index > -1) {
            // 删除与此元件相关的所有连线
            this.deleteConnectionsForComponent(this.selectedComponent.id);
            this.components.splice(index, 1);
            console.log(`删除元件: ${componentName} (${direction})`);
        }

        this.selectedComponent = null;
        this.draw();
    }

    /**
     * 删除与指定元件相关的所有连线
     * @param {string} componentId - 元件ID
     */
    deleteConnectionsForComponent(componentId) {
        const connectionsToDelete = this.connections.filter(conn =>
            conn.source.componentId === componentId || conn.target.componentId === componentId
        );

        connectionsToDelete.forEach(conn => {
            const index = this.connections.indexOf(conn);
            if (index > -1) {
                this.connections.splice(index, 1);
                console.log(`删除相关连线: ${conn.source.pinName} -> ${conn.target.pinName}`);
            }
        });
    }

    /**
     * 删除选中的连线
     */
    deleteSelectedConnection() {
        if (!this.selectedConnection) return;

        const sourcePin = this.selectedConnection.source.pinName;
        const targetPin = this.selectedConnection.target.pinName;
        const index = this.connections.indexOf(this.selectedConnection);

        if (index > -1) {
            this.connections.splice(index, 1);
            console.log(`删除连线: ${sourcePin} -> ${targetPin}`);
        }

        this.selectedConnection = null;
        this.draw();
    }

    /**
     * 取消选中连线
     */
    deselectConnection() {
        if (this.selectedConnection) {
            this.selectedConnection.selected = false;
            this.selectedConnection = null;
        }

        // 退出连线编辑模式
        this.pinInteraction.connectionEditMode = false;
        this.pinInteraction.editingConnection = null;
        this.pinInteraction.editingEnd = null;
    }

    /**
     * 更新与指定元件相关的所有连线路径
     * @param {string} componentId - 元件ID
     */
    updateConnectionsForComponent(componentId) {
        // 找到与此元件相关的所有连线
        // 支持手动创建的连线（使用componentId）和导入的连线（使用instanceId）
        const relatedConnections = this.connections.filter(conn => {
            const sourceId = conn.source.instanceId || conn.source.componentId;
            const targetId = conn.target.instanceId || conn.target.componentId;
            return sourceId === componentId || targetId === componentId;
        });

        // 为每个相关连线更新路径
        relatedConnections.forEach(connection => {
            this.updateConnectionPath(connection);
        });
    }

    /**
     * 更新单条连线的路径
     * @param {Object} connection - 连线对象
     */
    updateConnectionPath(connection) {
        // 获取源元件和目标元件
        // 支持手动创建的连线（使用componentId）和导入的连线（使用instanceId）
        const sourceId = connection.source.instanceId || connection.source.componentId;
        const targetId = connection.target.instanceId || connection.target.componentId;

        const sourceComponent = this.components.find(comp => comp.id === sourceId);
        const targetComponent = this.components.find(comp => comp.id === targetId);

        if (!sourceComponent || !targetComponent) {
            console.warn('无法找到连线相关的元件:', connection);
            return;
        }

        // 优先使用pinId，如果没有则使用pinName（向后兼容）
        const sourcePinIdentifier = connection.source.pinId || connection.source.pinName;
        const targetPinIdentifier = connection.target.pinId || connection.target.pinName;

        // 重新计算源引脚和目标引脚的当前位置（考虑旋转）
        const sourcePinPos = this.getRotatedPinPosition(sourceComponent, sourcePinIdentifier);
        const targetPinPos = this.getRotatedPinPosition(targetComponent, targetPinIdentifier);

        if (sourcePinPos && targetPinPos) {
            // 更新连线中的位置信息
            connection.source.position = sourcePinPos;
            connection.target.position = targetPinPos;

            // 重新计算连线路径
            connection.path = this.calculateConnectionPath(sourcePinPos, targetPinPos);
        }
    }

    /**
     * 获取元件中指定引脚的旋转后位置
     * @param {Object} component - 元件对象
     * @param {string} pinIdentifier - 引脚标识（可以是pinId或pinName）
     * @returns {Object|null} 旋转后的引脚位置或null
     */
    getRotatedPinPosition(component, pinIdentifier) {
        const { data, position, rotation } = component;
        const { x: compX, y: compY } = position;

        // 计算元件边界
        const width = data.dimensions?.width || 80;
        const height = data.dimensions?.height || 60;

        const componentRect = {
            x: compX - width / 2,
            y: compY - height / 2,
            width: width,
            height: height
        };

        // 获取引脚位置（未旋转状态）
        const pinCalculator = new CanvasPinPositionCalculator(componentRect);
        const allPins = pinCalculator.calculateAllPositions(data.pins);

        // 解析引脚标识
        let targetPin;
        if (pinIdentifier.includes('-')) {
            // 新的pinId格式：side-order
            const [side, order] = pinIdentifier.split('-');
            targetPin = allPins.find(pin => pin.side === side && pin.order === parseInt(order));
        } else {
            // 兼容旧的pinName格式
            targetPin = allPins.find(pin => pin.pinName === pinIdentifier);
        }

        if (targetPin) {
            // 对引脚位置进行旋转变换
            return this.rotatePoint(targetPin.position, { x: compX, y: compY }, rotation);
        }

        return null;
    }

    /**
     * 更新连线的端点连接
     * @param {Object} connection - 要更新的连线
     * @param {string} end - 要更新的端点 ('source' 或 'target')
     * @param {Object} newPin - 新的引脚信息
     */
    updateConnectionEnd(connection, end, newPin) {
        // 更新连线端点信息
        if (end === 'source') {
            connection.source = {
                componentId: newPin.componentId,
                pinId: newPin.pinId,          // 新增：引脚唯一标识
                pinName: newPin.pinName,      // 保留：引脚名称（用于显示）
                position: { ...newPin.position }
            };
        } else if (end === 'target') {
            connection.target = {
                componentId: newPin.componentId,
                pinId: newPin.pinId,          // 新增：引脚唯一标识
                pinName: newPin.pinName,      // 保留：引脚名称（用于显示）
                position: { ...newPin.position }
            };
        }

        // 重新计算连线路径
        connection.path = this.calculateConnectionPath(
            connection.source.position,
            connection.target.position
        );

        console.log(`连线端点更新: ${connection.source.pinName} -> ${connection.target.pinName}`);
    }

    /**
     * 旋转选中的元件 (逆时针90度)
     */
    rotateSelectedComponent() {
        if (!this.selectedComponent) return;

        // 初始化旋转角度和方向
        if (typeof this.selectedComponent.rotation === 'undefined') {
            this.selectedComponent.rotation = 0;
            this.selectedComponent.direction = 'up';
        }

        // 逆时针旋转90度 (每次减少90度)
        this.selectedComponent.rotation = (this.selectedComponent.rotation - 90 + 360) % 360;

        // 根据新的旋转角度更新方向
        this.selectedComponent.direction = this.getDirectionFromRotation(this.selectedComponent.rotation);

        // 旋转后更新相关连线路径
        this.updateConnectionsForComponent(this.selectedComponent.id);

        console.log(`逆时针旋转元件 ${this.selectedComponent.data.name} 到 ${this.selectedComponent.rotation}° (${this.selectedComponent.direction})`);
        this.draw();
    }

    /**
     * 检测鼠标位置是否在连线上
     * @param {Object} worldPos - 世界坐标位置
     * @returns {Object|null} 连线对象或null
     */
    getConnectionAtPosition(worldPos) {
        // 遍历所有连线，检测鼠标是否在连线附近
        for (const connection of this.connections) {
            if (this.isPointNearConnection(worldPos, connection)) {
                return connection;
            }
        }
        return null;
    }

    /**
     * 检测鼠标是否在连线编辑符号上
     * @param {Object} worldPos - 世界坐标位置
     * @returns {Object|null} 编辑符号信息或null {connection, end}
     */
    getConnectionEditHandleAtPosition(worldPos) {
        if (!this.pinInteraction.connectionEditMode || !this.selectedConnection) {
            return null;
        }

        const connection = this.selectedConnection;
        const detectionRadius = 20; // 编辑符号的检测半径

        // 检查是否点击了源端编辑符号
        const sourceDistance = Math.sqrt(
            Math.pow(worldPos.x - connection.source.position.x, 2) +
            Math.pow(worldPos.y - connection.source.position.y, 2)
        );

        if (sourceDistance <= detectionRadius) {
            return { connection, end: 'source' };
        }

        // 检查是否点击了目标端编辑符号
        const targetDistance = Math.sqrt(
            Math.pow(worldPos.x - connection.target.position.x, 2) +
            Math.pow(worldPos.y - connection.target.position.y, 2)
        );

        if (targetDistance <= detectionRadius) {
            return { connection, end: 'target' };
        }

        return null;
    }

    /**
     * 检测点是否在连线附近
     * @param {Object} point - 检测点
     * @param {Object} connection - 连线对象
     * @returns {boolean} 是否在连线附近
     */
    isPointNearConnection(point, connection) {
        if (!connection.path || connection.path.length < 2) return false;

        // 计算鼠标与连线的最近距离
        for (let i = 0; i < connection.path.length - 1; i++) {
            const start = connection.path[i];
            const end = connection.path[i + 1];

            if (this.distanceToLineSegment(point, start, end) <= 8) { // 8像素容差
                return true;
            }
        }

        return false;
    }

    /**
     * 计算点到线段的距离
     * @param {Object} point - 点坐标
     * @param {Object} lineStart - 线段起点
     * @param {Object} lineEnd - 线段终点
     * @returns {number} 距离
     */
    distanceToLineSegment(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 选中连线
     * @param {Object} connection - 连线对象
     */
    selectConnection(connection) {
        // 如果已经选中了其他连线，先取消选中
        if (this.selectedConnection && this.selectedConnection !== connection) {
            this.selectedConnection.selected = false;
            this.pinInteraction.connectionEditMode = false;
            this.pinInteraction.editingConnection = null;
            this.pinInteraction.editingEnd = null;
        }

        // 选中新连线
        this.selectedConnection = connection;
        connection.selected = true;

        // 进入连线编辑模式
        this.pinInteraction.connectionEditMode = true;
        this.pinInteraction.editingConnection = connection;

        const sourcePin = connection.source.pinName;
        const targetPin = connection.target.pinName;
        console.log(`选中连线 (可编辑): ${sourcePin} -> ${targetPin}`);
    }

    /**
     * 检测鼠标位置是否在引脚附近
     * @param {Object} mousePos - 鼠标位置 {x, y}
     * @returns {Object|null} 引脚信息或null
     */
    detectPinAtPosition(mousePos) {
        // 只有在有选中元件时才检测引脚
        if (!this.selectedComponent) return null;

        const worldPos = this.screenToWorld(mousePos);
        const component = this.selectedComponent;
        const { data, position, rotation } = component;
        const { x: compX, y: compY } = position;

        // 计算元件边界
        const width = data.dimensions?.width || 80;
        const height = data.dimensions?.height || 60;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        // 创建元件矩形区域（未旋转状态）
        const componentRect = {
            x: compX - halfWidth,
            y: compY - halfHeight,
            width: width,
            height: height
        };

        // 获取所有引脚位置（未旋转状态下的位置）
        const pinCalculator = new CanvasPinPositionCalculator(componentRect);
        const allPins = pinCalculator.calculateAllPositions(data.pins);

        // 检测鼠标是否在某个引脚附近
        for (const pin of allPins) {
            // 对引脚位置进行旋转变换
            const rotatedPosition = this.rotatePoint(pin.position, { x: compX, y: compY }, rotation);

            const distance = Math.sqrt(
                Math.pow(worldPos.x - rotatedPosition.x, 2) +
                Math.pow(worldPos.y - rotatedPosition.y, 2)
            );

            // 如果鼠标在引脚15像素范围内
            if (distance <= 15) {
                // 生成唯一的引脚ID：边名-序号
                const pinId = `${pin.side}-${pin.order}`;

                return {
                    componentId: component.id,
                    component: component,
                    pinId: pinId,              // 新增：唯一的引脚标识
                    pinName: pin.pinName,      // 保留：引脚名称（用于显示）
                    position: rotatedPosition, // 返回旋转后的实际位置
                    side: pin.side,
                    order: pin.order,          // 新增：引脚序号
                    type: pin.type
                };
            }
        }

        return null;
    }

    /**
     * 围绕指定点旋转一个点
     * @param {Object} point - 要旋转的点 {x, y}
     * @param {Object} center - 旋转中心点 {x, y}
     * @param {number} angle - 旋转角度（度）
     * @returns {Object} 旋转后的点 {x, y}
     */
    rotatePoint(point, center, angle) {
        const radian = (angle * Math.PI) / 180;
        const cos = Math.cos(radian);
        const sin = Math.sin(radian);

        // 平移到原点
        const translatedX = point.x - center.x;
        const translatedY = point.y - center.y;

        // 旋转
        const rotatedX = translatedX * cos - translatedY * sin;
        const rotatedY = translatedX * sin + translatedY * cos;

        // 平移回原位置
        return {
            x: rotatedX + center.x,
            y: rotatedY + center.y
        };
    }

    /**
     * 逆向旋转一个点（从世界坐标转换为本地坐标）
     * @param {Object} point - 世界坐标点 {x, y}
     * @param {Object} center - 旋转中心点 {x, y}
     * @param {number} angle - 旋转角度（度）
     * @returns {Object} 本地坐标点 {x, y}
     */
    inverseRotatePoint(point, center, angle) {
        const radian = (angle * Math.PI) / 180;
        const cos = Math.cos(radian);
        const sin = Math.sin(radian);

        // 平移到原点
        const translatedX = point.x - center.x;
        const translatedY = point.y - center.y;

        // 逆向旋转（使用转置矩阵）
        const rotatedX = translatedX * cos + translatedY * sin;
        const rotatedY = -translatedX * sin + translatedY * cos;

        // 返回本地坐标（不需要平移回原位置）
        return {
            x: rotatedX,
            y: rotatedY
        };
    }

    /**
     * 绘制引脚连接器（圆圈+号）
     * @param {Object} pin - 引脚信息
     * @param {string} state - 状态 ('normal', 'hover', 'active')
     */
    drawPinConnector(pin, state = 'normal') {
        if (!pin || !pin.position) return;

        this.ctx.save();

        // 根据状态设置颜色
        let color;
        switch (state) {
            case 'hover':
                color = '#1976d2'; // 深蓝
                break;
            case 'active':
                color = '#4caf50'; // 绿色
                break;
            default:
                color = '#2196f3'; // 蓝色
        }

        const { x, y } = pin.position;
        const size = this.pinInteraction.connectorSize / this.scale;
        const crossSize = 12 / this.scale; // +号大小

        // 绘制圆圈
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size / 2, 0, 2 * Math.PI);
        this.ctx.stroke();

        // 绘制+号
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.lineCap = 'round';

        // 水平线
        this.ctx.beginPath();
        this.ctx.moveTo(x - crossSize / 2, y);
        this.ctx.lineTo(x + crossSize / 2, y);
        this.ctx.stroke();

        // 垂直线
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - crossSize / 2);
        this.ctx.lineTo(x, y + crossSize / 2);
        this.ctx.stroke();

        this.ctx.restore();
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
     * 打开固件代码编辑器
     */
    openFirmwareCodeEditor() {
        console.log('🔧 尝试打开固件代码编辑器');
        console.log('📱 window.mainApp 存在:', !!window.mainApp);
        console.log('📂 currentProject:', window.mainApp?.currentProject);

        // 显示编辑器模态框
        const modal = document.getElementById('code-editor-modal');
        if (modal) {
            modal.style.display = 'flex';

            // 加载项目代码（如果有项目）或显示默认模板
            this.loadProjectCode();

            // 初始化拖拽功能
            this.initCodeEditorDrag();

            // 初始化事件监听器（移除点击背景关闭的逻辑）
            this.initCodeEditorEvents();
        }
    }

    /**
     * 关闭固件代码编辑器
     */
    closeFirmwareCodeEditor() {
        const modal = document.getElementById('code-editor-modal');
        if (modal) {
            modal.style.display = 'none';

            // 重置窗口定位方式，使其下次打开时能正确居中
            const windowEl = document.querySelector('.code-editor-window');
            if (windowEl) {
                windowEl.style.position = '';
                windowEl.style.left = '';
                windowEl.style.top = '';
                windowEl.style.transform = '';
            }

            // 清理事件监听器
            this.cleanupCodeEditorEvents();
        }
    }

    /**
     * 加载项目代码
     */
    async loadProjectCode() {
        try {
            let codeContent = '';
            let codePath = '未命名.ino';

            // 检查是否有当前项目
            if (window.mainApp?.currentProject) {
                const projectPath = window.mainApp.currentProject;
                const projectData = await window.mainApp.loadProjectConfig(projectPath);

                // 按照项目保存逻辑确定代码文件路径
                // 优先使用项目名称作为文件名
                let actualCodePath = `${projectPath}/${projectData.projectName}.ino`;

                try {
                    // 尝试读取项目名称对应的.ino文件
                    codeContent = await window.electronAPI.loadFile(actualCodePath);
                    codePath = actualCodePath;
                } catch (error) {
                    try {
                        // 如果不存在，尝试读取默认文件名
                        const defaultCodePath = `${projectPath}/generated_code.ino`;
                        codeContent = await window.electronAPI.loadFile(defaultCodePath);
                        codePath = defaultCodePath;
                    } catch (error2) {
                        // 如果都没有找到，生成新的代码
                        codeContent = window.mainApp.generateArduinoCode(projectData, projectData.projectName);
                        codePath = actualCodePath;
                    }
                }
            } else {
                // 没有项目时，显示默认Arduino模板代码
                codeContent = this.getDefaultArduinoTemplate();
                codePath = '未命名.ino';
            }

            // 设置编辑器内容
            const textarea = document.getElementById('code-editor-textarea');
            if (textarea) {
                textarea.value = codeContent;
                this.updateCodeEditorLineNumbers();
            }

            // 设置标题
            const title = document.getElementById('code-editor-title');
            if (title) {
                const fileName = codePath.split('/').pop();
                if (window.mainApp?.currentProject) {
                    title.textContent = `固件代码编辑器 - ${fileName}`;
                } else {
                    title.textContent = `代码编辑器 - ${fileName}`;
                }
            }

            // 保存当前代码路径
            this.currentCodePath = codePath;

        } catch (error) {
            console.error('加载项目代码失败:', error);
            alert('加载项目代码失败: ' + error.message);
        }
    }

    /**
     * 获取默认Arduino模板代码
     */
    getDefaultArduinoTemplate() {
        return `void setup() {
  // put your setup code here, to run once:

}

void loop() {
  // put your main code here, to run repeatedly:

}`;
    }

    /**
     * 保存代码
     */
    async saveCode() {
        try {
            const textarea = document.getElementById('code-editor-textarea');
            if (!textarea) {
                return;
            }

            const codeContent = textarea.value;

            // 检查是否有当前项目
            if (window.mainApp?.currentProject) {
                // 有项目时，直接保存到当前代码路径
                if (!this.currentCodePath) {
                    return;
                }
                await window.electronAPI.saveFile(this.currentCodePath, codeContent);
            } else {
                // 没有项目时，需要创建新项目
                await this.saveCodeAsNewProject(codeContent);
                // saveCodeAsNewProject 内部已经处理了成功提示，这里不需要return
            }

            // 显示保存成功提示
            this.showSaveNotification();

        } catch (error) {
            console.error('保存代码失败:', error);
            alert('保存代码失败: ' + error.message);
        }
    }

    /**
     * 将代码保存为新项目
     */
    async saveCodeAsNewProject(codeContent) {
        // 保存调用前的项目状态，用于判断是否真的创建了新项目
        const previousProject = window.mainApp.currentProject;

        try {
            // 先关闭代码编辑器，避免层级遮挡问题
            this.closeFirmwareCodeEditor();

            // 直接调用现有的项目保存功能
            await window.mainApp.saveProject();

            // 检查是否真的创建了新项目（currentProject是否发生了变化）
            if (window.mainApp.currentProject && window.mainApp.currentProject !== previousProject) {
                // 确实创建了新项目，现在保存代码文件
                const projectName = window.mainApp.currentProject.split('/').pop() || window.mainApp.currentProject.split('\\').pop();
                const codeFilePath = `${window.mainApp.currentProject}/${projectName}.ino`;

                try {
                    await window.electronAPI.saveFile(codeFilePath, codeContent);
                    console.log('代码文件保存成功:', codeFilePath);
                } catch (error) {
                    console.warn('保存代码文件时出错:', error);
                }
            } else {
                // 用户取消了保存或者保存失败，不执行任何操作
                console.log('项目保存被取消或失败，不保存代码文件');
            }
        } catch (error) {
            console.error('创建项目失败:', error);
            throw error; // 重新抛出错误，让调用方处理
        }
    }

    /**
     * 显示保存成功提示
     */
    showSaveNotification() {
        // 创建临时提示元素
        const notification = document.createElement('div');
        notification.textContent = '代码已保存';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10001;
            animation: fadeInOut 2s ease-in-out;
        `;

        document.body.appendChild(notification);

        // 2秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }

    /**
     * 更新行号显示
     */
    updateCodeEditorLineNumbers() {
        const textarea = document.getElementById('code-editor-textarea');
        const lineNumbers = document.getElementById('code-editor-line-numbers');

        if (!textarea || !lineNumbers) {
            return;
        }

        const lines = textarea.value.split('\n');
        const lineCount = lines.length;

        // 清空现有内容
        lineNumbers.innerHTML = '';

        // 生成行号元素
        for (let i = 1; i <= lineCount; i++) {
            const lineNumber = document.createElement('div');
            lineNumber.textContent = i;
            lineNumber.style.height = '18.2px'; // 与textarea的line-height匹配
            lineNumbers.appendChild(lineNumber);
        }

        // 同步滚动位置
        lineNumbers.scrollTop = textarea.scrollTop;
    }

    /**
     * 初始化代码编辑器拖拽功能
     */
    initCodeEditorDrag() {
        const windowEl = document.querySelector('.code-editor-window');
        const headerEl = document.querySelector('.code-editor-header');

        if (!windowEl || !headerEl) {
            return;
        }

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const handleMouseDown = (e) => {
            if (e.target.closest('.code-editor-actions')) {
                return; // 不要在按钮上开始拖拽
            }

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = windowEl.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            // 将窗口从flexbox居中改为absolute定位以支持拖拽
            windowEl.style.position = 'absolute';
            windowEl.style.left = startLeft + 'px';
            windowEl.style.top = startTop + 'px';
            windowEl.style.transform = 'none';

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            const newLeft = startLeft + deltaX;
            const newTop = startTop + deltaY;

            // 限制在视窗范围内
            const maxLeft = window.innerWidth - windowEl.offsetWidth;
            const maxTop = window.innerHeight - windowEl.offsetHeight;

            windowEl.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
            windowEl.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
            windowEl.style.transform = 'none'; // 移除居中变换
        };

        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        headerEl.addEventListener('mousedown', handleMouseDown);

        // 保存清理函数
        this.cleanupCodeEditorDrag = () => {
            headerEl.removeEventListener('mousedown', handleMouseDown);
        };
    }

    /**
     * 初始化代码编辑器事件监听器
     */
    initCodeEditorEvents() {
        // 保存按钮
        const saveBtn = document.getElementById('save-code-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveCode());
        }

        // 关闭按钮
        const closeBtn = document.getElementById('close-code-editor');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeFirmwareCodeEditor());
        }

        // 文本区域事件
        const textarea = document.getElementById('code-editor-textarea');
        if (textarea) {
            textarea.addEventListener('input', () => this.updateCodeEditorLineNumbers());
            textarea.addEventListener('scroll', () => this.updateCodeEditorLineNumbers());
            textarea.addEventListener('keydown', (e) => this.handleCodeEditorKeydown(e));
        }

        // 移除点击模态框背景关闭的逻辑，只允许通过关闭按钮退出

        // ESC键关闭
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeFirmwareCodeEditor();
            }
        };
        document.addEventListener('keydown', handleEscape);

        // 保存清理函数
        this.cleanupCodeEditorEvents = () => {
            if (saveBtn) saveBtn.removeEventListener('click', () => this.saveCode());
            if (closeBtn) closeBtn.removeEventListener('click', () => this.closeFirmwareCodeEditor());
            if (textarea) {
                textarea.removeEventListener('input', () => this.updateCodeEditorLineNumbers());
                textarea.removeEventListener('scroll', () => this.updateCodeEditorLineNumbers());
                textarea.removeEventListener('keydown', (e) => this.handleCodeEditorKeydown(e));
            }
            // 移除模态框点击事件的清理（已移除该功能）
            document.removeEventListener('keydown', handleEscape);
        };
    }

    /**
     * 处理代码编辑器键盘事件
     */
    handleCodeEditorKeydown(e) {
        // Ctrl+S 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveCode();
        }

        // Tab 键插入制表符
        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            // 插入制表符
            textarea.value = textarea.value.substring(0, start) + '\t' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 1;

            this.updateCodeEditorLineNumbers();
        }
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
        // 绘制所有连线
        this.drawConnections();

        // 绘制临时连线（如果在连线模式）
        if (this.pinInteraction.connectionMode && this.pinInteraction.tempConnection) {
            this.drawTempConnection();
        }

        // 绘制所有元件
        this.components.forEach(component => {
            this.drawComponent(component);
        });

        // 绘制连线编辑符号（如果处于编辑模式）
        if (this.pinInteraction.connectionEditMode && this.selectedConnection) {
            this.drawConnectionEditHandles(this.selectedConnection);
        }

        // 绘制引脚连接器（如果有激活的引脚）
        if (this.pinInteraction.activePin) {
            this.drawPinConnector(this.pinInteraction.activePin, 'normal');
        }

        // 绘制吸附目标连接器（如果有悬停的目标引脚）
        if (this.pinInteraction.hoveredPin) {
            this.drawPinConnector(this.pinInteraction.hoveredPin, 'active');
        }
    }

    /**
     * 绘制单个元件
     * @param {Object} component - 元件实例
     */
    drawComponent(component) {
        const { data, position, selected, rotation } = component;
        const { x, y } = position;

        if (!this.ctx) return;

        this.ctx.save();

        // 应用旋转变换
        if (rotation && rotation !== 0) {
            this.ctx.translate(x, y);
            this.ctx.rotate((rotation * Math.PI) / 180);
            this.ctx.translate(-x, -y);
        }

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
        this.drawComponentBody(componentRect, data.name, selected);

        // 绘制引脚
        this.drawComponentPins(componentRect, data.pins);

        // 如果元件被选中，绘制选中框
        if (selected) {
            this.drawSelectionBox(componentRect);
        }

        // 恢复上下文状态，确保元件名称不跟随元件旋转
        this.ctx.restore();

        // 重新保存上下文，用于绘制元件名称
        this.ctx.save();

        // 绘制元件名称（不跟随元件旋转）
        this.drawComponentName(componentRect, data.name, rotation || 0);

        this.ctx.restore();
    }

    /**
     * 绘制元件主体（带圆角）
     * @param {Object} rect - 元件矩形区域
     * @param {string} name - 元件名称
     * @param {boolean} selected - 是否被选中
     */
    drawComponentBody(rect, name, selected = false) {
        // 绘制元件主体矩形（带圆角）
        if (selected) {
            // 选中状态使用不同的颜色
            this.ctx.fillStyle = '#e3f2fd';
            this.ctx.strokeStyle = '#2196f3';
            this.ctx.lineWidth = 3 / this.scale;
        } else {
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2 / this.scale;
        }

        // 计算圆角半径（参照元件预览SVG的4px，考虑缩放）
        const radius = 4 / this.scale;

        // 绘制圆角矩形
        this.roundedRect(rect.x, rect.y, rect.width, rect.height, radius);

        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * 绘制选中框
     * @param {Object} rect - 元件矩形区域
     */
    drawSelectionBox(rect) {
        const padding = 6 / this.scale; // 选中框与元件之间的间距

        this.ctx.strokeStyle = '#2196f3';
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.setLineDash([5 / this.scale, 5 / this.scale]); // 虚线

        const selectionRect = {
            x: rect.x - padding,
            y: rect.y - padding,
            width: rect.width + 2 * padding,
            height: rect.height + 2 * padding
        };

        // 绘制虚线框
        this.ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);

        // 重置线条样式
        this.ctx.setLineDash([]);
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
     * 创建连线
     * @param {Object} sourcePin - 源引脚
     * @param {Object} targetPin - 目标引脚
     */
    createConnection(sourcePin, targetPin) {
        const connection = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: {
                componentId: sourcePin.componentId,
                pinId: sourcePin.pinId,          // 新增：引脚唯一标识
                pinName: sourcePin.pinName,      // 保留：引脚名称（用于显示）
                position: { ...sourcePin.position }
            },
            target: {
                componentId: targetPin.componentId,
                pinId: targetPin.pinId,          // 新增：引脚唯一标识
                pinName: targetPin.pinName,      // 保留：引脚名称（用于显示）
                position: { ...targetPin.position }
            },
            path: this.calculateConnectionPath(sourcePin.position, targetPin.position),
            style: {
                color: '#2196f3',
                width: 2
            },
            createdAt: new Date()
        };

        this.connections.push(connection);
        return connection;
    }

    /**
     * 计算连线路径（智能折线）
     * @param {Object} startPos - 起始位置
     * @param {Object} endPos - 结束位置
     * @returns {Array} 路径点数组
     */
    calculateConnectionPath(startPos, endPos) {
        const points = [];

        // 计算水平和垂直距离
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;

        // 如果水平或垂直距离很小，使用直线
        if (Math.abs(dx) < 20 || Math.abs(dy) < 20) {
            return [startPos, endPos];
        }

        // 计算中间点（使用曼哈顿距离的折线）
        const midX = startPos.x + dx / 2;
        const midY = startPos.y + dy / 2;

        // 根据距离大小决定折线策略
        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平距离更大：先水平移动，再垂直移动
            points.push(startPos);
            points.push({ x: midX, y: startPos.y });
            points.push({ x: midX, y: endPos.y });
            points.push(endPos);
        } else {
            // 垂直距离更大：先垂直移动，再水平移动
            points.push(startPos);
            points.push({ x: startPos.x, y: midY });
            points.push({ x: endPos.x, y: midY });
            points.push(endPos);
        }

        return points;
    }

    /**
     * 绘制所有连线
     */
    drawConnections() {
        this.connections.forEach(connection => {
            this.drawConnection(connection);
        });
    }

    /**
     * 绘制单条连线
     * @param {Object} connection - 连线对象
     */
    drawConnection(connection) {
        if (!connection.path || connection.path.length < 2) return;

        this.ctx.save();

        // 根据选中状态设置样式
        if (connection.selected) {
            this.ctx.strokeStyle = '#ff4444'; // 红色（选中状态）
            this.ctx.lineWidth = (connection.style.thickness + 2) / this.scale; // 更粗
            this.ctx.setLineDash([8 / this.scale, 4 / this.scale]); // 虚线
        } else {
            // 使用默认颜色或样式中定义的颜色
            this.ctx.strokeStyle = connection.style.color || '#2196f3'; // 默认蓝色
            this.ctx.lineWidth = connection.style.thickness / this.scale;
        }

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();

        // 检查是否有有效的路径
        if (connection.path && connection.path.length >= 2) {
            // 使用预定义路径
            connection.path.forEach((point, index) => {
                if (index === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
        } else if (connection.source.position && connection.target.position) {
            // 使用端点位置
            this.ctx.moveTo(connection.source.position.x, connection.source.position.y);
            this.ctx.lineTo(connection.target.position.x, connection.target.position.y);
        }

        this.ctx.stroke();

        // 恢复线条样式
        this.ctx.setLineDash([]);

        this.ctx.restore();
    }

    /**
     * 绘制临时连线（拖拽过程中的连线）
     */
    drawTempConnection() {
        if (!this.pinInteraction.tempConnection) return;

        const tempConn = this.pinInteraction.tempConnection;
        if (!tempConn.path || tempConn.path.length < 2) return;

        this.ctx.save();

        // 设置虚线样式
        this.ctx.strokeStyle = '#2196f3';
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setLineDash([5 / this.scale, 5 / this.scale]);

        this.ctx.beginPath();

        if (tempConn.isEditing && tempConn.originalConnection) {
            // 编辑模式：从固定端点指向新位置
            const fixedEnd = this.pinInteraction.editingEnd === 'source'
                ? tempConn.originalConnection.target.position
                : tempConn.originalConnection.source.position;

            // 绘制从固定端点到鼠标当前位置的线
            this.ctx.moveTo(fixedEnd.x, fixedEnd.y);
            this.ctx.lineTo(tempConn.currentPos.x, tempConn.currentPos.y);
        } else {
            // 新建连线模式：绘制完整路径
            tempConn.path.forEach((point, index) => {
                if (index === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
        }

        this.ctx.stroke();

        // 恢复线条样式
        this.ctx.setLineDash([]);

        this.ctx.restore();
    }

    /**
     * 绘制连线编辑符号
     * @param {Object} connection - 连线对象
     */
    drawConnectionEditHandles(connection) {
        if (!connection) return;

        this.ctx.save();

        // 设置编辑符号样式
        const handleSize = 14; // 编辑符号大小
        const crossSize = 10;  // +号大小

        // 绘制源端编辑符号
        this.drawEditHandle(connection.source.position, 'source');

        // 绘制目标端编辑符号
        this.drawEditHandle(connection.target.position, 'target');

        this.ctx.restore();
    }

    /**
     * 绘制单个编辑符号
     * @param {Object} position - 位置 {x, y}
     * @param {string} type - 类型 ('source' 或 'target')
     */
    drawEditHandle(position, type) {
        const { x, y } = position;
        const handleSize = 14;
        const crossSize = 10;

        // 设置颜色：源端绿色，目标端橙色
        const color = type === 'source' ? '#4caf50' : '#ff9800';

        // 绘制圆圈背景
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.beginPath();
        this.ctx.arc(x, y, handleSize / 2 / this.scale, 0, 2 * Math.PI);
        this.ctx.stroke();

        // 绘制+号
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.lineCap = 'round';

        // 水平线
        this.ctx.beginPath();
        this.ctx.moveTo(x - crossSize / 2 / this.scale, y);
        this.ctx.lineTo(x + crossSize / 2 / this.scale, y);
        this.ctx.stroke();

        // 垂直线
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - crossSize / 2 / this.scale);
        this.ctx.lineTo(x, y + crossSize / 2 / this.scale);
        this.ctx.stroke();
    }

    /**
     * 绘制元件名称
     * @param {Object} rect - 元件矩形区域
     * @param {string} name - 元件名称
     * @param {number} rotation - 元件旋转角度（度）
     */
    drawComponentName(rect, name, rotation = 0) {
        const componentName = name || '未命名元件';

        // 保存当前上下文状态
        this.ctx.save();

        // 设置文字样式（与元件设计器保持一致，不跟随画布缩放）
        this.ctx.fillStyle = '#333';
        const baseFontSize = Math.max(12, Math.min(16, rect.width / 8));
        this.ctx.font = `${baseFontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 计算文字位置（元件中心）
        const textX = rect.x + rect.width / 2;
        const textY = rect.y + rect.height / 2;

        // 根据旋转角度决定文字方向，确保文字始终保持水平可读
        let textRotation = 0;

        // 根据元件旋转角度调整文字方向，使文字始终水平显示
        switch (rotation) {
            case 0:
                textRotation = 0; // 水平显示
                break;
            case 90:
                textRotation = -Math.PI / 2; // 逆时针旋转90度，保持水平可读
                break;
            case 180:
                textRotation = 0; // 水平显示
                break;
            case 270:
                textRotation = -Math.PI / 2; // 逆时针旋转90度，保持水平可读
                break;
            default:
                textRotation = 0;
        }

        // 添加旋转和方向的日志
        const direction = this.getDirectionFromRotation(rotation);

        // 应用文字旋转
        if (textRotation !== 0) {
            this.ctx.translate(textX, textY);
            this.ctx.rotate(textRotation);
            this.ctx.fillText(componentName, 0, 0);
        } else {
            this.ctx.fillText(componentName, textX, textY);
        }

        // 恢复上下文状态
        this.ctx.restore();
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
     * @param {string} instanceId - 元件实例ID（可选，用于项目导入）
     * @param {string} orientation - 元件朝向（可选，up/down/left/right）
     */
    addComponent(componentData, x, y, instanceId = null, orientation = 'up') {

        // 将orientation转换为direction
        const directionMap = {
            'up': 'up',
            'down': 'down',
            'left': 'left',
            'right': 'right'
        };
        const direction = directionMap[orientation] || 'up';

        // 根据朝向设置旋转角度
        const rotationMap = {
            'up': 0,
            'right': 90,
            'down': 180,
            'left': 270
        };
        const rotation = rotationMap[orientation] || 0;

        // 创建元件实例
        let componentId;
        if (instanceId) {
            // 如果提供了instanceId，使用它（用于项目加载）
            componentId = instanceId;
        } else {
            // 否则生成一个稳定的ID（基于元件类型和位置）
            const baseId = componentData.id || 'unknown';
            const posKey = `${Math.round(x)}_${Math.round(y)}`;
            componentId = `${baseId}_${posKey}`;
        }

        const componentInstance = {
            id: componentId, // 使用稳定的ID
            data: componentData,
            position: { x, y },
            rotation: rotation, // 根据orientation设置旋转角度
            direction: direction, // 根据orientation设置方向
            scale: 1,
            selected: false // 初始状态为未选中
        };

        // 添加到元件列表
        this.components.push(componentInstance);

        // 触发重新渲染
        this.draw();

        return componentInstance;
    }

    /**
     * 添加连线到画布
     * @param {Object} connectionData - 连线数据
     */
    addConnection(connectionData) {

        // 查找源元件和目标元件
        // 支持手动创建的连线（使用componentId）和导入的连线（使用instanceId）
        const sourceId = connectionData.source.instanceId || connectionData.source.componentId;
        const targetId = connectionData.target.instanceId || connectionData.target.componentId;

        const sourceComponent = this.components.find(comp => comp.id === sourceId);
        const targetComponent = this.components.find(comp => comp.id === targetId);

        if (!sourceComponent || !targetComponent) {
            console.warn('无法找到连线的源元件或目标元件:', sourceId, targetId);
            console.warn('连线数据:', connectionData);
            return null;
        }

        // 计算连线端点位置
        const sourcePos = this.calculatePinPosition(sourceComponent, connectionData.source.pinId);
        const targetPos = this.calculatePinPosition(targetComponent, connectionData.target.pinId);

        if (!sourcePos || !targetPos) {
            console.warn('无法计算连线端点位置');
            return null;
        }

        // 创建连线实例
        const connectionInstance = {
            id: connectionData.id,
            source: {
                ...connectionData.source,
                instanceId: connectionData.source.instanceId || connectionData.source.componentId || sourceComponent.id, // 确保instanceId正确设置
                componentId: sourceComponent.id, // 添加componentId以支持更新逻辑
                position: sourcePos
            },
            target: {
                ...connectionData.target,
                instanceId: connectionData.target.instanceId || connectionData.target.componentId || targetComponent.id, // 确保instanceId正确设置
                componentId: targetComponent.id, // 添加componentId以支持更新逻辑
                position: targetPos
            },
            path: connectionData.path || [],
            wireType: connectionData.wireType,
            style: connectionData.style || { thickness: 2, dashPattern: [] },
            selected: false
        };

        // 如果没有自定义路径，使用计算的端点位置
        if (!connectionInstance.path || connectionInstance.path.length < 2) {
            connectionInstance.path = [sourcePos, targetPos];
        }

        // 添加到连线列表
        this.connections.push(connectionInstance);

        // 触发重新渲染，确保连线立即可见
        this.draw();

        return connectionInstance;
    }

    /**
     * 清除所有元件
     */
    clearComponents() {
        this.components = [];
        this.connections = []; // 同时清除连线
        this.draw();
    }

    /**
     * 计算元件上指定引脚的实际位置
     * @param {Object} component - 元件实例
     * @param {string} pinId - 引脚ID (格式: side-order)
     * @returns {Object} 引脚位置 {x, y}
     */
    calculatePinPosition(component, pinId) {
        const { data, position, rotation } = component;
        const { x: compX, y: compY } = position;

        // 计算元件边界
        const width = data.dimensions?.width || 80;
        const height = data.dimensions?.height || 60;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        // 创建元件矩形区域（未旋转状态）
        const componentRect = {
            x: compX - halfWidth,
            y: compY - halfHeight,
            width: width,
            height: height
        };

        // 获取所有引脚位置（未旋转状态下的位置）
        const pinCalculator = new CanvasPinPositionCalculator(componentRect);
        const allPins = pinCalculator.calculateAllPositions(data.pins);

        // 找到指定引脚
        const pin = allPins.find(p => p.pinId === pinId);
        if (!pin) {
            console.warn('未找到引脚:', pinId, '在元件:', data.name);
            return { x: compX, y: compY }; // 返回元件中心作为默认位置
        }

        // 对引脚位置进行旋转变换
        const rotatedPosition = this.rotatePoint(pin.position, { x: compX, y: compY }, rotation);

        return rotatedPosition;
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

    // 导出到全局作用域（在实例创建后）
    window.CanvasManager = CanvasManager;
    window.canvasManager = canvasManager;

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
                pinId: `${side}-${pin.order}`, // 生成 pinId: side-order 格式
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
