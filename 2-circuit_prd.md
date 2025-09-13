# Fast Hardware - 电路设计画布功能详细需求文档

## 📋 文档概述

### 文档目的
本文档详细描述电路设计画布功能的需求分析、设计方案和实现细节，确保电路设计功能与PRD保持一致，并为开发团队提供完整的开发指南。

### 功能定位
电路设计画布是Fast Hardware的核心功能之一，提供可视化的电路设计环境，支持元件拖拽、连线操作和电路配置，最终生成符合系统标准的JSON格式电路配置文件。

### 📈 当前状态
- ✅ **元件设计器**: 已完成 (1-edit_prd.md)
- ✅ **元件管理系统**: 已完成 (0-Change-Log.md)
- 🚧 **电路设计画布**: 开发中 (本PRD)
- ⏳ **LLM集成**: 规划中 (3-llm_prd.md)

---

## 🎯 功能需求分析

### 核心功能
1. **画布操作**: 提供带有格点的设计画布，支持元件拖拽和放置
2. **元件管理**: 显示元件主体和引脚，支持元件实例化
3. **连线系统**: 实现引脚间的可视化连线，支持路径编辑
4. **数据同步**: 画布操作与JSON数据实时同步
5. **项目管理**: 支持项目保存、加载和版本管理

### 用户场景
- **场景1**: 用户从元件库拖拽元件到画布，自动布局
- **场景2**: 用户手动连接元件引脚，建立电路连接
- **场景3**: 用户调整连线路径，优化电路布局
- **场景4**: 用户保存和加载电路设计项目

### 设计约束
- **画布尺寸**: 自适应画布容器，支持无限扩展
- **元件显示**: 与元件设计器完全一致的矩形主体 + 彩色引脚圆点渲染
- **元件尺寸**: 保持与元件设计器相同的尺寸比例和显示效果
- **连线类型**: 直线和折线路径
- **数据同步**: 非实时保存，按需保存(Ctrl+S)

---

## 🎨 用户界面设计

### 界面组件详述

#### 1. 元件库悬浮面板
**位置**: 左侧悬浮面板，可隐藏为侧边条
**宽度**: 固定25%宽度
**展开/收起**: 点击侧边条可展开/收起面板
**展开状态包含组件**:
- 元件搜索框
- 元件分类筛选
- 元件缩略卡片列表
- 拖拽到画布释放提示

**缩略卡片功能**:
- 显示元件图标和名称
- 支持拖拽操作
- 拖拽到画布释放后自动渲染元件
- 渲染效果完全参考元件绘制画布

#### 2. 设计画布 (主体区域)
**画布类型**: HTML5 Canvas
**画布尺寸**: 自适应容器大小，支持无限扩展和滚动
**背景**: 格点背景(10px网格)
**缩放支持**: 支持鼠标滚轮缩放和拖拽平移
**交互功能**:
- 元件拖拽放置 (从元件库拖拽释放)
- 元件旋转(90度步进)
- 引脚连线
- 连线编辑
- 选择和删除
- 画布缩放和平移

#### 3. 属性面板 (右侧)
**位置**: 右侧固定面板
**功能**: 显示选中元件和连线属性
**内容**: 元件参数、连线属性、画布设置
**交互**: 属性编辑和参数调整
**特殊功能**: 实时属性同步更新

#### 4. 工具栏 (画布上方)
**位置**: 画布顶部
**工具按钮**:
- 保存 (Ctrl+S)
- 撤销/重做
- 缩放控制
- 网格显示切换
- 全选/清空

---

## 🔗 连线系统详细设计

### 连线交互流程

#### 1. 引脚激活阶段
```
选中元件 → 点击引脚 → 显示圆圈+号 → 鼠标悬停变色
```

#### 2. 连线创建阶段
```
点击+号 → 开始拖拽 → 实时绘制折线 → 移动到目标引脚
```

#### 3. 吸附连接阶段
```
进入吸附范围 → 目标引脚显示+号 → 释放鼠标 → 完成连接
```

#### 4. 连线编辑阶段
```
点击连线 → 显示控制点 → 拖拽调整路径 → 保存修改
```

### 核心技术组件

#### 1. 引脚交互管理器 (PinInteractionManager)
```javascript
class PinInteractionManager {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.activePin = null;     // 当前激活的引脚
    this.connectionMode = false; // 连线模式
    this.tempConnection = null;  // 临时连线
  }

  // 检测引脚点击
  detectPinClick(mousePos) {
    // 计算鼠标位置与引脚的距离
    // 返回最近的引脚信息
  }

  // 显示引脚+号
  showPinConnector(pin) {
    // 在引脚位置绘制圆圈和+号
    // 添加悬停效果
  }

  // 隐藏引脚+号
  hidePinConnector(pin) {
    // 清除视觉元素
  }
}
```

#### 2. 连线管理器 (ConnectionManager)
```javascript
class ConnectionManager {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.connections = [];     // 连线列表
    this.selectedConnection = null; // 选中的连线
  }

  // 创建连线
  createConnection(sourcePin, targetPin) {
    const connection = {
      id: generateId(),
      source: sourcePin,
      target: targetPin,
      path: this.calculatePath(sourcePin, targetPin),
      style: { color: '#2196f3', width: 2 }
    };
    this.connections.push(connection);
    return connection;
  }

  // 计算折线路径
  calculatePath(sourcePin, targetPin) {
    // 实现基础的折线路径计算
    // source -> 中间点 -> target
  }

  // 渲染连线
  renderConnections() {
    this.connections.forEach(conn => {
      this.drawFoldedLine(conn.path, conn.style);
    });
  }
}
```

#### 3. 吸附检测系统 (SnapDetection)
```javascript
class SnapDetection {
  constructor() {
    this.snapDistance = 15; // 吸附距离（像素）- 已优化为15像素
    this.snapRadius = 15;   // 吸附半径
  }

  // 检测目标引脚
  detectSnapTarget(mousePos, sourcePin) {
    // 遍历所有引脚
    // 计算距离
    // 返回最近的有效目标
  }

  // 计算吸附位置
  calculateSnapPosition(mousePos, targetPin) {
    // 返回精确的吸附坐标
  }
}
```

### 数据结构设计

#### 连线数据结构
```javascript
interface Connection {
  id: string;
  source: {
    componentId: string;
    pinName: string;
    position: { x: number, y: number };
  };
  target: {
    componentId: string;
    pinName: string;
    position: { x: number, y: number };
  };
  path: Array<{ x: number, y: number }>; // 折线路径点
  style: {
    color: string;
    width: number;
    dash?: Array<number>;
  };
  metadata: {
    createdAt: Date;
    connectionType: 'digital' | 'analog' | 'power';
  };
}
```

#### 电路配置JSON扩展
```json
{
  "projectName": "示例电路",
  "components": [...],
  "connections": [
    {
      "id": "wire_001",
      "source": {
        "componentId": "arduino_1",
        "pinName": "D13"
      },
      "target": {
        "componentId": "led_1",
        "pinName": "正极"
      },
      "path": [
        { "x": 250, "y": 180 },
        { "x": 320, "y": 180 },
        { "x": 320, "y": 220 }
      ],
      "style": {
        "color": "#2196f3",
        "width": 2
      },
      "connectionType": "digital"
    }
  ]
}
```

### 实现优先级和复杂度评估

#### 高优先级 (第一周) ✅
- [x] 引脚检测和+号显示
- [x] 基础连线创建和直线绘制
- [x] 鼠标吸附检测

#### 中优先级 (第二周) ✅
- [x] 折线路径计算（曼哈顿距离算法）
- [x] 连线选择和删除
- [x] 连线样式管理和选中状态
- [x] 连线实时跟随元件移动
- [x] 元件旋转时连线路径更新
- [x] 连线编辑符号和拖拽重连功能

#### 第三阶段：项目数据持久化 (4周) ⭐⭐⭐
- [ ] **项目模板系统** - 创建标准项目模板
- [ ] **设置系统** - API密钥和存储路径配置
- [ ] **结构化保存** - 智能保存和路径管理
- [ ] **项目导入导出** - 完整的项目文件管理
- [ ] 性能优化和渲染优化

##### 🎯 核心目标
- **项目标准化**: 统一的项目文件夹结构和模板
- **数据完整性**: 确保画布状态与文件系统完全同步
- **配置管理**: 集中管理API密钥和存储路径
- **用户体验**: 直观的项目创建、保存、加载流程

##### 📁 项目结构设计
```javascript
项目名称/
├── components/              # 项目级元件库
│   ├── arduino-uno-r3.json # 标准元件副本
│   └── led-5mm.json        # 自定义元件副本
├── circuit_config.json     # 电路配置 (元件+连线)
├── metadata.json           # 项目元数据
├── generated_code.ino      # 生成的Arduino代码
└── README.md              # 项目说明
```

##### 🔧 实现步骤

###### 第一周：项目模板系统 ⭐⭐⭐
- [ ] **模板项目创建**: 点击"新建项目"按钮，询问存储位置，创建标准项目模板
- [ ] **项目结构标准化**: 基于`data/projects/README_proj.md`规范创建完整文件夹结构
- [ ] **示例元件添加**: 自动添加Arduino UNO和LED元件到新项目
- [ ] **基础电路配置**: 生成包含基础元件的`circuit_config.json`
- [ ] **模板验证**: 确保创建的项目可以正常加载和编辑

###### 第二周：设置系统 ⭐⭐⭐
- [ ] **设置标签页**: 在元件管理右侧创建"一级标签页"，包含四个设置项
- [ ] **项目存储地址**: 设置默认存储路径，保存在应用配置中
- [ ] **API密钥管理**: SiliconFlow API密钥配置，保存到`env.local`文件
- [ ] **快捷键介绍**: 显示所有可用的键盘快捷键说明
- [ ] **联系作者**: 点击跳转到`www.design2002.xyz`个人网站
- [ ] **配置持久化**: 设置自动保存到本地配置文件

##### 📋 快捷键功能说明

**画布操作快捷键**:
- **R**: 选中元件后逆时针旋转90度
- **Delete/Backspace**: 删除选中的元件或连线
- **Escape**: 取消选中元件和连线

**项目管理快捷键**:
- **Ctrl+S**: 保存当前项目 (Windows/Linux)
- **Ctrl+O**: 打开项目文件夹 (Windows/Linux)
- **Tab**: 在不同标签页之间切换

**元件设计快捷键**:
- **Escape**: 在引脚编辑窗口中关闭对话框

###### 第三周：结构化保存 ⭐⭐⭐
- [ ] **智能保存逻辑**: 检测当前项目状态（新项目/已打开项目）
- [ ] **路径选择对话框**: 新项目时显示存储位置选择对话框
- [ ] **增量保存**: 已打开项目直接更新现有文件夹
- [ ] **数据完整性**: 确保所有元件、连线、画布状态正确保存
- [ ] **保存确认**: 保存成功后显示确认提示

###### 第四周：项目导入导出 ⭐⭐⭐
- [ ] **项目选择窗口**: 点击"打开项目"显示项目文件夹选择界面
- [ ] **项目验证**: 验证选中文件夹是否为有效项目（检查必要文件）
- [ ] **数据加载**: 读取`circuit_config.json`并重建画布状态
- [ ] **元件同步**: 从`components/`文件夹加载项目使用的元件
- [ ] **错误处理**: 完善的加载失败处理和用户提示

#### 第四阶段：功能完善和优化 (4周)
- [ ] 连线编辑控制点增强
- [ ] 性能优化和渲染优化
- [ ] 用户体验改进
- [ ] 稳定性提升


### 技术挑战和解决方案

#### 挑战1: 引脚精确定位
**问题**: Canvas缩放和平移影响引脚位置计算
**解决方案**: 使用世界坐标系，统一缩放和平移变换

#### 挑战2: 折线路径优化
**问题**: 如何生成美观且实用的折线路径
**解决方案**: 基于引脚相对位置的规则化路径生成

#### 挑战3: 多连线管理
**问题**: 大量连线时的性能和交互问题
**解决方案**: 分层渲染，空间索引优化查找

### 视觉设计规范

#### 引脚连接器样式
- 圆圈直径: 16px (未缩放)
- +号尺寸: 12px
- 默认颜色: #2196f3 (蓝色)
- 悬停颜色: #1976d2 (深蓝)
- 吸附时颜色: #4caf50 (绿色)

#### 连线样式
- 默认颜色: #2196f3
- 线宽: 2px
- 选中状态: 线宽4px，高亮色
- 折线转角: 圆角半径3px

#### 吸附检测参数
- 吸附距离: 15px (优化后的精确距离)
- 引脚检测范围: 15px
- 连接器大小: 16px圆圈 + 12px+号

#### 连线跟随功能
- **实时跟随**: 拖拽元件时连线路径实时更新
- **旋转同步**: 元件旋转时连线路径自动调整
- **位置跟踪**: 精确跟踪引脚的旋转后位置
- **性能优化**: 仅更新相关连线，避免全量重绘

#### 连线编辑功能
- **编辑符号**: 选中连线后两端显示可拖拽的编辑符号
- **拖拽重连**: 拖动编辑符号到新引脚重新建立连接
- **智能预览**: 编辑时显示从固定端点到新位置的预览线
- **视觉反馈**: 源端绿色符号，目标端橙色符号
- **智能吸附**: 支持与新建连线相同的吸附检测机制

---

## 📊 数据结构设计

### 画布状态数据结构
```javascript
class CanvasState {
  constructor() {
    this.canvas = {
      width: 'auto', // 自适应容器宽度
      height: 'auto', // 自适应容器高度
      zoom: 1.0,
      panX: 0,
      panY: 0,
      gridSize: 10,
      showGrid: true,
      minZoom: 0.1, // 最小缩放比例
      maxZoom: 5.0  // 最大缩放比例
    };

    this.components = []; // 元件实例数组
    this.connections = []; // 连接关系数组
    this.selectedItems = []; // 选中项
    this.history = []; // 操作历史
  }
}
```

### 元件实例数据结构
```javascript
class ComponentInstance {
  constructor(componentData) {
    this.componentFile = componentData.id + '.json'; // 引用元件文件
    this.instanceId = 'instance_' + Date.now(); // 实例唯一ID
    this.position = { x: 100, y: 100 }; // 画布位置
    this.orientation = 'up'; // 朝向: up, down, left, right
    this.properties = {}; // 自定义属性
    this.selected = false; // 选中状态
  }
}
```

### 连线数据结构
```javascript
class Connection {
  constructor() {
    this.id = 'wire_' + Date.now();
    this.source = {
      instanceId: 'instance_1',
      pinName: 'D13'
    };
    this.target = {
      instanceId: 'instance_2',
      pinName: 'LED_IN'
    };
    this.wireType = 'digital'; // digital, analog, power
    this.routingPoints = []; // 路径节点数组
    this.style = {
      color: '#ff6b6b',
      thickness: 2,
      selected: false
    };
  }
}
```

---

## 🔧 核心功能模块

### 1. 画布渲染引擎

#### 功能职责
- 绘制格点背景和坐标系
- 渲染元件实例和引脚
- 绘制连线和路径
- 处理鼠标交互事件
- 管理缩放和平移变换

#### 关键方法
```javascript
class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = new CanvasState();
  }

  render() {
    this.clearCanvas();
    this.drawGrid();
    this.drawComponents();
    this.drawConnections();
    this.drawSelection();
  }

  drawComponent(component) {
    const { position, orientation } = component;
    const componentData = this.loadComponentData(component.componentFile);

    // 根据朝向计算变换
    this.ctx.save();
    this.applyTransform(position, orientation);

    // 绘制元件主体
    this.drawComponentBody(componentData);

    // 绘制引脚
    this.drawPins(componentData.pins);

    this.ctx.restore();
  }

  drawConnection(connection) {
    const points = this.calculateConnectionPath(connection);
    this.ctx.strokeStyle = connection.style.color;
    this.ctx.lineWidth = connection.style.thickness;

    this.ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        this.ctx.moveTo(point.x, point.y);
      } else {
        this.ctx.lineTo(point.x, point.y);
      }
    });
    this.ctx.stroke();
  }
}
```

### 2. 交互管理器

#### 功能职责
- 处理鼠标事件(点击、拖拽、双击)
- 管理选中状态
- 执行元件操作(移动、旋转、删除)
- 处理连线创建和编辑

#### 鼠标事件处理
```javascript
class InteractionManager {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.isDragging = false;
    this.dragStart = null;
    this.selectedTool = 'select'; // select, wire, pan, zoom
  }

  handleMouseDown(e) {
    const mousePos = this.getMousePosition(e);
    const hitItem = this.getHitItem(mousePos);

    if (this.selectedTool === 'wire' && hitItem.type === 'pin') {
      this.startWiring(hitItem);
    } else if (hitItem) {
      this.selectItem(hitItem);
      this.startDrag(mousePos);
    }
  }

  handleMouseMove(e) {
    const mousePos = this.getMousePosition(e);

    if (this.isDragging) {
      this.updateDrag(mousePos);
    } else if (this.isWiring) {
      this.updateWiring(mousePos);
    } else {
      this.updateHover(mousePos);
    }
  }

  handleMouseUp(e) {
    if (this.isDragging) {
      this.endDrag();
    } else if (this.isWiring) {
      this.endWiring();
    }
  }
}
```

### 3. 元件管理器

#### 功能职责
- 管理元件库数据和悬浮面板状态
- 处理元件实例化（支持拖拽释放）
- 管理元件状态和属性
- 与元件库悬浮面板交互

```javascript
class ComponentManager {
  constructor() {
    this.library = {}; // 元件库缓存
    this.instances = []; // 当前画布上的元件实例
  }

  async loadComponentLibrary() {
    // 从系统元件库加载所有元件
    const standardComponents = await this.loadFromDirectory('data/system-components/standard/');
    const customComponents = await this.loadFromDirectory('data/system-components/custom/');

    this.library = { ...standardComponents, ...customComponents };
  }

  createInstance(componentId, position, options = {}) {
    const componentData = this.library[componentId];
    if (!componentData) return null;

    const instance = new ComponentInstance(componentData);
    instance.position = position;

    // 处理拖拽释放的特殊选项
    if (options.fromDrag) {
      // 使用元件绘制画布的渲染效果
      instance.renderStyle = 'designer-compatible';
      // 根据释放位置进行微调
      instance.position = this.adjustPositionForRelease(position);
    }

    this.instances.push(instance);
    return instance;
  }

  removeInstance(instanceId) {
    this.instances = this.instances.filter(inst => inst.instanceId !== instanceId);
  }
}
```

### 4. 连线管理器

#### 功能职责
- 创建和管理连线
- 计算连线路径
- 处理连线编辑

```javascript
class ConnectionManager {
  constructor() {
    this.connections = [];
    this.tempConnection = null; // 正在创建的连线
  }

  startConnection(sourcePin) {
    this.tempConnection = new Connection();
    this.tempConnection.source = sourcePin;
  }

  updateConnection(mousePos) {
    if (!this.tempConnection) return;

    // 计算从源引脚到鼠标位置的路径
    const sourcePos = this.getPinPosition(this.tempConnection.source);
    this.tempConnection.routingPoints = this.calculatePath(sourcePos, mousePos);
  }

  finishConnection(targetPin) {
    if (!this.tempConnection) return;

    this.tempConnection.target = targetPin;
    this.tempConnection.routingPoints = this.optimizePath(this.tempConnection.routingPoints);

    this.connections.push(this.tempConnection);
    this.tempConnection = null;
  }

  calculatePath(from, to) {
    // 简单的直线路径计算
    return [from, to];
  }

  optimizePath(points) {
    // 路径优化算法
    // 移除不必要的拐点
    // 确保路径不与元件重叠
    return points;
  }
}
```

### 5. 项目管理器

#### 功能职责
- 管理项目文件读写操作
- 处理项目数据导入导出
- 维护项目版本历史
- 协调画布状态与文件系统

```javascript
class ProjectManager {
  constructor(canvasState) {
    this.canvasState = canvasState;
    this.currentProject = null;
  }

  async saveProject(filePath) {
    const projectData = this.serializeCanvasState();
    await this.writeProjectFile(filePath, projectData);
    return { success: true };
  }

  async loadProject(filePath) {
    const projectData = await this.readProjectFile(filePath);
    this.deserializeCanvasState(projectData);
    this.canvasState.render();
    return { success: true };
  }

  serializeCanvasState() {
    return {
      components: this.canvasState.components,
      connections: this.canvasState.connections,
      canvas: this.canvasState.canvas
    };
  }
}
```

---

## 🔄 交互流程

### 1. 元件拖拽放置流程
```mermaid
graph TD
    A[用户展开元件库悬浮面板] --> B[浏览元件缩略卡片]
    B --> C[用户拖拽元件缩略卡片]
    C --> D[显示拖拽预览效果]
    D --> E[用户在画布上释放鼠标]
    E --> F[根据释放位置创建元件实例]
    F --> G[使用元件绘制画布的渲染效果]
    G --> H[添加到画布状态]
    H --> I[重新渲染画布]
    I --> J[显示元件属性面板]
```

### 2. 连线创建流程
```mermaid
graph TD
    A[用户选择连线工具] --> B[鼠标悬停在引脚上高亮显示]
    B --> C[用户点击源引脚]
    C --> D[显示连线预览线条]
    D --> E[用户拖拽到目标引脚]
    E --> F{引脚类型兼容?}
    F -->|是| G[创建连线实例]
    F -->|否| H[显示错误提示]
    G --> I[计算最优路径]
    I --> J[添加到画布状态]
    J --> K[重新渲染画布]
```

### 3. 项目保存和加载流程
```mermaid
graph TD
    A[用户点击保存按钮] --> B[序列化画布状态]
    B --> C[验证数据完整性]
    C --> D[写入项目文件]
    D --> E[更新项目元数据]
    E --> F[显示保存成功提示]

    G[用户选择加载项目] --> H[读取项目文件]
    H --> I[反序列化画布状态]
    I --> J[验证数据兼容性]
    J --> K[渲染画布内容]
    K --> L[恢复元件实例和连线]
    L --> M[显示加载完成提示]
```

---

## 💾 数据持久化

### 保存策略
1. **非实时保存**: 仅在用户主动触发时保存
2. **原子性保存**: 确保数据一致性
3. **版本管理**: 支持基本的版本历史

### 保存流程
```javascript
class DataManager {
  async saveProject() {
    const projectData = {
      projectName: this.projectName,
      version: this.version,
      description: this.description,
      components: this.canvasState.components.map(comp => ({
        componentFile: comp.componentFile,
        instanceId: comp.instanceId,
        position: comp.position,
        orientation: comp.orientation,
        properties: comp.properties
      })),
      connections: this.canvasState.connections.map(conn => ({
        id: conn.id,
        source: conn.source,
        target: conn.target,
        wireType: conn.wireType,
        routingPoints: conn.routingPoints,
        style: conn.style
      }))
    };

    // 保存到项目目录
    await this.saveToFile('circuit_config.json', projectData);

    // 更新元数据
    await this.updateMetadata();

    return { success: true };
  }
}
```

---

## 🎯 技术实现细节

### 1. 坐标系统和变换
- **世界坐标**: 元件位置和连线路径，与元件设计器坐标系统完全一致
- **屏幕坐标**: 鼠标位置和渲染坐标，支持缩放和平移变换
- **变换矩阵**: 处理缩放、平移、旋转，与元件设计器的变换逻辑保持一致
- **像素密度**: 支持高DPI显示，与元件设计器相同的像素密度处理

### 2. 碰撞检测
- **点与元件**: 鼠标点击元件检测，与元件设计器使用相同的碰撞检测算法
- **点与引脚**: 引脚点击检测，使用圆形区域检测
- **线段相交**: 连线路径冲突检测和优化
- **边界检测**: 自适应边界检测，支持无限画布范围

### 3. 性能优化
- **脏标记更新**: 只重新渲染变化的部分，与元件设计器相同的优化策略
- **状态缓存**: 缓存元件渲染状态，避免重复计算
- **分层渲染**: 分离元件层、连线层、交互层
- **防抖优化**: 鼠标移动和窗口大小改变事件防抖处理

### 4. 响应式设计
- **自适应布局**: 支持不同窗口尺寸，与元件设计器相同的响应式处理
- **触摸支持**: 移动端友好的交互，支持触摸拖拽和缩放
- **键盘快捷键**: 与元件设计器保持一致的快捷键系统
- **无障碍支持**: 键盘导航和屏幕阅读器支持

---

## 🧪 测试用例

### 单元测试
1. **画布渲染测试**
   - 格点背景正确绘制
   - 元件位置和朝向正确渲染
   - 连线路径正确计算和绘制

2. **交互测试**
   - 鼠标事件正确捕获和处理
   - 悬浮面板展开/收起功能正常
   - 元件库卡片拖拽操作正确
   - 元件拖拽到画布释放位置正确
   - 连线创建和删除功能正常

3. **数据同步测试**
   - 画布状态与JSON数据保持一致
   - 保存和加载操作正确执行
   - 版本历史正确记录

### 集成测试
1. **完整工作流测试**
   - 悬浮面板展开和元件浏览流程
   - 从元件库卡片到画布的完整拖拽释放流程
   - 元件渲染效果与元件绘制画布一致性验证
   - 连线创建和编辑的完整流程
   - 保存和加载项目的完整流程

2. **数据持久化测试**
   - 项目文件读写操作正确
   - 数据序列化反序列化准确
   - 项目版本管理正常工作

### 用户验收测试
1. **功能验收**
   - 悬浮面板展开/收起操作流畅
   - 元件库卡片拖拽到画布释放准确
   - 元件渲染效果与元件绘制画布完全一致
   - 连线创建和编辑直观易用
   - 画布缩放和平移操作自然

2. **性能验收**
   - 大量元件时的渲染性能
   - 复杂连线网络的响应速度
   - 内存使用和稳定性表现

---

## 📅 开发计划

### 阶段一：基础画布功能 (2周) ✅ 已完成
- [x] 画布初始化和格点背景
- [x] 悬浮面板设计和交互实现（默认收起状态）
- [x] 悬浮面板元件拖拽和放置功能
- [x] 简单的元件渲染（矩形+引脚）
- [x] 元件交互功能（点击选中、拖动、旋转）
- [x] 旋转方向映射（up/left/down/right）
- [x] 元件名称智能旋转和显示
- [x] 键盘快捷键支持（R旋转、Delete删除、Escape取消选中）
- [x] 鼠标悬停反馈和视觉效果
- [x] 连线系统基础实现
- [ ] 数据同步机制

### 阶段二：连线和交互完善 (3周)
- [x] 引脚交互检测和视觉反馈（圆圈+号）
- [x] 连线创建和拖拽系统
- [x] 引脚吸附检测和连接
- [x] 折线路径绘制和编辑
- [x] 连线删除和选择
- [x] 智能折线路径算法（曼哈顿距离）
- [x] 连线样式和选中状态
- [ ] 撤销/重做功能

### 阶段三：高级功能和测试 (4周)
- [ ] 连线高级样式管理
- [ ] 连线批量操作和样式管理
- [ ] 引脚兼容性检查和错误提示
- [ ] 键盘快捷键系统 (Ctrl+S保存, Ctrl+Z撤销等)
- [ ] 项目导入导出 (支持标准JSON格式)
- [ ] 性能优化 (大电路渲染优化)
- [ ] 完整测试覆盖 (单元测试、集成测试)
- [ ] 用户体验优化 (界面响应、错误提示)

---

## 🎯 成功指标

### 已实现功能指标 ✅
- [x] 用户能够在2分钟内完成元件放置和基本交互操作
- [x] 支持元件点击选中、拖拽移动和旋转操作
- [x] 实现完整的方向映射系统（up/left/down/right）
- [x] 元件名称智能旋转，始终保持水平可读
- [x] 键盘快捷键系统（R旋转、Delete删除、Escape取消选中）
- [x] 鼠标悬停反馈和视觉选中效果
- [x] 支持悬浮面板元件拖拽到画布的功能

### 待实现功能指标 📋
- [ ] 用户能够在5分钟内完成简单电路搭建（需要连线功能）
- [ ] 支持至少20种常用电子元件
- [ ] 连线创建成功率 > 95%
- [ ] 项目文件兼容性 > 95%

### 性能指标
- [ ] 画布渲染帧率 > 30FPS
- [ ] 支持同时显示50+元件
- [ ] 连线响应延迟 < 100ms
- [ ] 内存使用 < 200MB

### 用户体验指标
- [ ] 界面操作符合行业标准
- [ ] 错误提示清晰准确
- [ ] 学习曲线平缓
- [ ] 用户满意度 > 85%

---

## 🚀 技术风险与应对

### 主要技术挑战
1. **复杂交互处理**: 大量鼠标事件和状态管理
2. **性能瓶颈**: 大型电路的渲染和交互性能
3. **数据一致性**: 画布状态与JSON数据的同步
4. **用户操作复杂性**: 多步骤操作流程和错误恢复

### 风险缓解策略
1. **模块化设计**: 将功能拆分为独立模块
2. **性能监控**: 实时监控和优化性能瓶颈
3. **数据验证**: 多重校验确保数据一致性
4. **用户测试**: 早期进行用户测试，确保操作流程合理

---

## 📚 相关文档

### 依赖文档
- [PRD.md](./PRD.md) - 产品需求文档
- [edit_prd.md](./edit_prd.md) - 元件设计器详细设计文档
- [data/README_data.md](./data/README_data.md) - 数据结构说明
- [data/projects/README_proj.md](./data/projects/README_proj.md) - 项目结构说明

### 设计资源
- [Fast Hardware.txt](./Fast Hardware.txt) - 原始功能描述
- [README.md](./README.md) - 项目说明文档

---

## 🔄 开发进度记录

### 当前状态总结 ✅
**已完成功能**:
- ✅ 基础画布框架搭建
- ✅ 元件库集成和悬浮面板
- ✅ 元件拖拽到画布功能
- ✅ 元件完整渲染（矩形主体+彩色引脚）
- ✅ 元件交互功能（点击选中、拖拽、旋转）
- ✅ 旋转方向映射系统（up/left/down/right）
- ✅ 元件名称智能旋转和显示
- ✅ 键盘快捷键系统（R旋转、Delete删除、Escape取消选中）
- ✅ 鼠标悬停反馈和视觉效果
- ✅ 项目数据结构设计

**已完成功能**:
- ✅ 连线系统基础实现 (直线和智能折线路径)
- ✅ 连线编辑和删除功能
- ✅ 引脚吸附检测和连接
- ✅ 连线选择和视觉反馈
- ✅ 连线样式管理和选中状态

**开发中功能**:
- 🚧 引脚兼容性检查
- 🚧 项目保存加载功能
- 🚧 撤销重做功能

**下一阶段目标**: 完善项目数据同步功能和用户体验优化。LLM集成功能将在后续版本中实现。

**阶段二完成度**: 80% (数据同步和用户体验优化待完善)

---

*本文档将随着开发进度持续更新，确保与实际实现保持同步。*
