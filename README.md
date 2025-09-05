# Fast Hardware

一个智能化的硬件开发辅助桌面应用程序，帮助硬件项目新手解决选型、电路搭建和固件编写等问题。通过集成LLM API，为用户提供从需求分析到代码生成的一站式硬件开发解决方案。

## 🚀 核心功能 (按优先级排序)

### 1. 可视化电路设计界面 (高优先级)
- **主界面布局**: 70%画布区 + 30%对话栏的直观布局
- **拖拽式设计**: 支持元件拖拽、旋转、连线的可视化操作
- **实时同步**: 画布操作与JSON数据实时同步，Ctrl+S保存
- **手动连线**: 类似Figma的连线体验，支持路径编辑

### 2. 智能对话辅助系统 (高优先级)
- **自然语言交互**: 通过对话描述需求，LLM自动生成电路方案
- **功能需求反推**: 基于LLM的智能硬件推荐系统
- **画布控制**: LLM通过预设函数直接操作画布元件和连线
- **电路生成**: 自动生成可视化电路连接图

### 3. 自定义元件系统 (中等优先级)
- **元件预览**: 缩略图展示系统级元件库（标准+自定义）
- **元件绘制**: 独立画布支持自定义元件的形状和引脚设计
- **元件复用**: 文件夹结构便于元件在项目间复用

### 4. 代码生成与项目管理 (中等优先级)
- **固件代码生成**: 为搭建的电路系统生成相应的Arduino代码
- **项目文件夹**: 项目级元件库和配置文件独立管理
- **导入导出**: 完整项目的保存和分享功能

### 开发特性
- **现代化技术栈**: Electron + React + Node.js
- **热重载开发**: 修改代码自动重启，提高开发效率
- **LLM API集成**: 基于Siliconflow API的智能交互
- **JSON数据驱动**: 统一的数据格式，支持项目导入导出

## 📁 项目结构

```
fast-hardware/
├── main.js              # Electron主进程文件
├── preload.js           # 预加载脚本（安全API暴露）
├── index.html           # 主界面HTML
├── dev-runner.js        # 开发环境热重载脚本
├── package.json         # 项目配置文件
├── README.md           # 项目说明文档
├── PRD.md              # 产品需求文档
├── Fast Hardware.txt   # 原始需求文档
├── .gitignore          # Git忽略文件配置
├── src/                # 源代码目录
│   ├── components/     # React组件
│   ├── pages/          # 页面组件
│   ├── utils/          # 工具函数
│   └── api/            # API接口
├── data/               # 数据文件目录
│   ├── system-components/  # 系统级元件库
│   │   ├── standard/   # 标准元件库
│   │   └── custom/     # 自定义元件库
│   └── projects/       # 项目文件存储
├── styles/
│   └── main.css        # 主样式文件
├── scripts/
│   └── renderer.js     # 渲染进程JavaScript
└── assets/             # 资源文件目录
    ├── icon.png        # 应用图标（PNG格式）
    ├── icon.ico        # Windows图标
    ├── icon.icns       # macOS图标
    └── README.md       # 资源文件说明
```

## 🛠️ 开发环境设置

### 前置要求

- Node.js (建议版本 >= 16.0.0)
- npm 或 yarn 包管理器
- Git (用于版本控制)

### 技术依赖

- **Electron**: 跨平台桌面应用框架
- **React**: 用户界面构建 (计划中)
- **Konva.js**: 2D画布绘图库 (计划中)
- **Siliconflow API**: LLM智能交互服务 (计划中)

### 安装依赖

```bash
npm install
```

### 开发模式运行（推荐）

```bash
npm run dev
```

此命令会启动带热重载的Electron应用：
- 🚀 自动启动Electron应用
- 👀 监控文件变更 (.js, .html, .css, .json)
- 🔄 文件变更后自动重启应用
- ⏹️ 按 Ctrl+C 停止热重载
- 🌍 支持UTF-8中文显示

**热重载特性**：
- 自动检测文件修改
- 500ms防抖处理，避免频繁重启
- 支持递归监控子目录
- 忽略node_modules和dist目录

### 简单开发模式

如果不需要热重载功能：

```bash
npm run dev-simple
```

此命令会启动Electron应用，不带热重载功能。

### 调试模式运行

如果需要打开开发者工具进行调试：

```bash
npm run dev-debug
```

此命令会启动Electron应用并自动打开开发者工具。

### 简单开发模式

```bash
npm run dev-simple
```

使用concurrently同时运行文件监控和Electron，适合简单的开发场景。

### 生产模式运行

```bash
npm start
```

## 📦 构建和打包

### 构建应用程序

```bash
npm run build
```

### 生成安装包

```bash
npm run dist
```

构建后的文件将保存在 `dist` 目录中：

- **Windows**: `.exe` 安装程序
- **macOS**: `.dmg` 磁盘映像
- **Linux**: `.AppImage` 可执行文件

## 🔧 开发指南

### 主要文件说明

#### main.js
主进程文件，负责：
- 应用程序生命周期管理
- 创建和管理窗口
- 处理系统级别的操作
- IPC通信的主进程端

#### preload.js
预加载脚本，负责：
- 在渲染进程中安全地暴露API
- 提供主进程和渲染进程之间的安全通信桥梁

#### renderer.js
渲染进程脚本，负责：
- 用户界面交互
- 与主进程的通信
- DOM操作和事件处理

### 安全最佳实践

本项目遵循Electron的安全最佳实践：

1. **禁用Node.js集成**: `nodeIntegration: false`
2. **启用上下文隔离**: `contextIsolation: true`
3. **使用预加载脚本**: 安全地暴露API
4. **禁用远程模块**: `enableRemoteModule: false`

### 添加新功能

1. **主进程功能**: 在 `main.js` 中添加IPC处理程序
2. **渲染进程功能**: 在 `renderer.js` 中添加UI逻辑
3. **API暴露**: 在 `preload.js` 中安全地暴露新的API

#### 示例：添加文件操作功能

1. 在 `main.js` 中添加：
```javascript
ipcMain.handle('read-file', async (event, filePath) => {
    // 文件读取逻辑
});
```

2. 在 `preload.js` 中暴露：
```javascript
contextBridge.exposeInMainWorld('electronAPI', {
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath)
});
```

3. 在 `renderer.js` 中使用：
```javascript
const content = await window.electronAPI.readFile(filePath);
```

## 🎨 界面定制

### 修改主题色彩

在 `styles/main.css` 中修改CSS变量：

```css
.app-header {
    background: linear-gradient(135deg, #your-color1 0%, #your-color2 100%);
}
```

### 添加新的组件样式

建议在 `styles/` 目录下创建新的CSS文件，并在 `index.html` 中引入。

## 🔍 调试

### 开启开发者工具

- 开发模式下会自动打开
- 或按 `F12` / `Ctrl+Shift+I` 手动打开

### 热重载功能

项目配置了智能热重载系统：

1. **自动监控**: 监控 `.js`, `.html`, `.css`, `.json` 文件变化
2. **智能过滤**: 自动忽略 `node_modules`, `dist`, `.git` 目录
3. **防抖处理**: 避免频繁重启，500ms内的多次变更只触发一次重载
4. **优雅重启**: 确保旧进程完全关闭后再启动新进程

#### 热重载相关命令

```bash
# 推荐：使用自定义热重载脚本
npm run dev

# 备选：使用concurrently方案
npm run dev-simple
```

### 日志记录

- 主进程日志: 查看终端输出
- 渲染进程日志: 查看开发者工具控制台
- 热重载日志: 终端显示文件变更和重启信息

## 📋 开发路线图

### 🎯 阶段一：MVP (当前阶段)

#### 高优先级任务 (主界面核心功能)
- [x] ~~搭建 Electron + React 开发环境~~
- [ ] **实现主界面布局**: 70%画布区 + 30%对话栏
- [ ] **实现基础画布功能**: 格点背景、元件拖拽、放置、旋转
- [ ] **实现手动连线功能**: 引脚连接、路径编辑、连线删除
- [ ] **实现保存机制**: Ctrl+S触发项目文件夹更新
- [ ] **集成LLM对话栏**: 基础文本交互和JSON操作函数

#### 中等优先级任务 (元件库管理)
- [ ] **实现元件预览标签页**: 缩略图展示系统级元件库
- [ ] **实现元件绘制标签页**: 自定义元件设计画布
- [ ] **完善LLM API集成**: 需求分析流程和自定义元件库集成

### 🚀 阶段二：功能扩展
- [ ] 完善 LLM 元件匹配和排除逻辑
- [ ] 实现 LLM 自动连线功能（与手动连线兼容）
- [ ] 实现 LLM 与手动操作的协调机制（增量更新、冲突处理）
- [ ] 固件代码生成功能（基于circuit_config.json和components/文件夹）
- [ ] 项目导出和导入功能（完整文件夹打包）

### 🎨 阶段三：优化与增强
- [ ] 优化 UI/UX，提升用户体验
- [ ] 增加更多预设的常用硬件元件
- [ ] 实现更高级的LLM交互，如错误排查和代码优化建议
- [ ] 添加项目模板和示例库

## 📚 相关文档

- [产品需求文档 (PRD.md)](./PRD.md) - 详细的产品功能规划和技术架构
- [原始需求文档 (Fast Hardware.txt)](./Fast%20Hardware.txt) - 项目的初始需求和设计思路
- [数据结构说明 (data/README.md)](./data/README.md) - 数据文件夹结构和格式规范
- [系统级元件库 (data/system-components/README.md)](./data/system-components/README.md) - 元件库组织和使用指南

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有疑问，请：

1. 查看 [Electron官方文档](https://www.electronjs.org/docs)
2. 在GitHub上提交Issue
3. 参考项目的示例代码

## 📝 更新日志

### v1.0.0 (当前版本)
- 初始项目模板
- 基础UI界面
- 安全的IPC通信
- 跨平台构建配置
