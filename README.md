# Fast Hardware

<div align="center">

![Fast Hardware Logo](assets/icon.png)

**一个智能化的硬件开发辅助桌面应用程序**

*帮助硬件项目新手解决选型、电路搭建和固件编写等问题*

[🇨🇳 中文](README.md) | [🇺🇸 English](README_EN.md)

[![Version](https://img.shields.io/badge/version-0.1.3-blue.svg)](https://github.com/Designer-Awei/fast-hardware/releases)
[![Electron](https://img.shields.io/badge/Electron-27.0.0-47848F.svg)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Designer-Awei/fast-hardware/releases)

</div>

---

## 📖 目录

- [🚀 核心功能](#-核心功能-按优先级排序)
- [✨ 最新特性](#-最新特性)
- [📁 项目结构](#-项目结构)
- [🛠️ 快速开始](#️-快速开始)
- [🔧 开发指南](#-开发指南)
- [📦 构建和打包](#-构建和打包)
- [🔍 调试和故障排除](#-调试和故障排除)
- [📋 开发路线图](#-开发路线图)
- [📚 相关文档](#-相关文档)
- [🤝 贡献指南](#-贡献指南)
- [📄 许可证](#-许可证)

## 🚀 核心功能 (按优先级排序)

### ✅ 1. 元件设计器系统 (已完成)
- **🎨 可视化元件设计**: 直观的画布界面，支持自定义元件形状和引脚布局
- **📏 智能尺寸调整**: 自动计算最优尺寸，确保所有引脚正确显示
- **🔧 引脚管理**: 支持添加、编辑、删除引脚，类型包括电源、地、数字I/O、模拟I/O等
- **💾 双向同步**: 属性栏与画布实时同步，自动保存到JSON格式

### ✅ 2. 元件库管理系统 (已完成)
- **📚 系统元件库**: 内置Arduino Uno R3、LED、电阻等标准元件
- **🔧 自定义元件库**: 支持创建和复用自定义元件
- **🔍 智能预览**: 缩略图展示，支持搜索和分类筛选
- **📁 层级管理**: 系统级和项目级元件库分离管理

### ✅ 3. 窗口尺寸记忆功能 (已完成)
- **🪟 智能窗口记忆**: 自动保存和恢复窗口尺寸、位置
- **📐 边界检查**: 防止窗口超出屏幕范围
- **⚡ 实时同步**: 窗口变化时实时保存配置（防抖优化）
- **🔄 最大化支持**: 支持最大化状态的保存和恢复

### ✅ 4. 跨平台兼容性 (已完成)
- **🖥️ 多平台支持**: Windows、macOS、Linux全平台兼容
- **⚙️ 自动适配**: 智能检测操作系统并执行相应命令
- **🔧 统一工具链**: 跨平台构建、调试和错误诊断
- **🌐 UTF-8支持**: 保证中文显示正常

### 🚧 5. 电路设计画布 (开发中)
- **🎯 拖拽操作**: 支持元件拖拽、放置、旋转
- **🔗 连线系统**: 手动连线功能，支持路径编辑
- **💾 实时同步**: 画布操作与JSON数据实时同步
- **⌨️ 快捷键**: Ctrl+S保存，丰富的编辑快捷键

### 🚧 6. LLM智能助手 (规划中)
- **💬 自然语言交互**: 通过对话描述需求
- **🧠 智能推荐**: LLM分析需求并推荐硬件方案
- **🎨 自动生成**: 基于对话自动生成电路图
- **⚡ API集成**: 支持多种LLM服务提供商

## ✨ 最新特性 (v0.1.2)

### 🎯 智能功能
- **🪟 窗口尺寸记忆**: 自动保存和恢复窗口尺寸、位置，提供专业的桌面应用体验
- **📐 边界智能检查**: 防止窗口超出屏幕范围，确保窗口始终可见
- **⚡ 实时同步保存**: 窗口变化时实时保存配置（500ms防抖优化）
- **🔄 最大化状态支持**: 支持最大化状态的完整保存和恢复

### 🛠️ 开发工具
- **🔍 平台检测工具**: 自动检测开发环境兼容性
- **🚨 错误诊断系统**: 智能错误分析和解决方案建议
- **⚡ 跨平台脚本**: 统一的开发命令，支持多平台无缝切换

### 📊 质量保证
- **✅ 完整测试覆盖**: 功能测试、边界测试、错误处理测试
- **🔒 数据完整性**: JSON验证、ID生成、引脚数据结构保障
- **🎯 用户体验**: 详细的状态提示、智能的错误恢复

## 📁 项目结构

```
fast-hardware/
├── 📁 assets/                    # 资源文件目录
│   ├── icon.png                  # 应用图标 (PNG格式)
│   ├── icon.ico                  # Windows图标
│   ├── icon.icns                 # macOS图标
│   └── README.md                 # 资源文件说明
├── 📁 data/                      # 数据文件目录
│   ├── 📁 system-components/     # 系统级元件库
│   │   ├── 📁 standard/          # 标准元件库
│   │   │   ├── arduino-uno-r3.json
│   │   │   ├── led-5mm.json
│   │   │   ├── resistor-220.json
│   │   │   └── ...
│   │   ├── 📁 custom/            # 自定义元件库
│   │   │   ├── dht22.json
│   │   │   ├── esp32-devkit.json
│   │   │   └── ...
│   │   └── README.md
│   ├── 📁 projects/              # 用户项目目录
│   │   ├── 📁 sample-led-project/
│   │   │   ├── circuit_config.json
│   │   │   ├── components/
│   │   │   ├── led_brightness_control.ino
│   │   │   └── metadata.json
│   │   └── README.md
│   └── README.md
├── 📁 scripts/                   # 前端脚本目录
│   ├── canvas.js                 # 画布操作脚本
│   ├── chat.js                   # 对话功能脚本
│   ├── component-designer.js     # 元件设计器核心
│   ├── components.js             # 元件管理脚本
│   ├── main.js                   # 主界面脚本
│   ├── resizer.js                # 窗口调整脚本
│   ├── tabs.js                   # 标签页管理脚本
│   └── renderer.js               # 渲染进程脚本
├── 📁 styles/                    # 样式文件目录
│   └── main.css                  # 主样式文件
├── 📄 cross-platform-runner.js   # 跨平台脚本运行器
├── 📄 dev-runner.js              # 开发环境热重载脚本
├── 📄 dev-runner-no-reload.js    # 无热重载开发脚本
├── 📄 error-handler.js           # 错误处理工具
├── 📄 index.html                 # 主界面HTML文件
├── 📄 main.js                    # Electron主进程文件
├── 📄 package.json               # 项目配置文件
├── 📄 platform-check.js          # 平台兼容性检测工具
├── 📄 preload.js                 # 预加载脚本
├── 📄 .gitignore                 # Git忽略文件配置
├── 📄 edit_prd.md                # 详细开发记录
├── 📄 Fast Hardware.txt          # 原始需求文档
├── 📄 PRD.md                     # 产品需求文档
└── 📄 README.md                  # 项目说明文档 (当前文件)
```

### 📂 关键文件说明

| 文件/目录 | 说明 | 重要性 |
|-----------|------|--------|
| `main.js` | Electron主进程，应用生命周期管理和窗口配置 | 🔴 核心 |
| `index.html` | 主界面HTML，应用骨架 | 🔴 核心 |
| `scripts/component-designer.js` | 元件设计器核心功能 | 🔴 核心 |
| `cross-platform-runner.js` | 跨平台兼容脚本 | 🟡 重要 |
| `data/system-components/` | 系统元件库数据 | 🟡 重要 |
| `platform-check.js` | 环境检测工具 | 🟢 工具 |
| `error-handler.js` | 错误诊断工具 | 🟢 工具 |

### 📊 技术实现详情

#### 窗口配置存储
- **存储位置**: `~/AppData/fast-hardware/window-config.json` (Windows)
- **数据格式**: JSON格式，包含尺寸、位置、最大化状态
- **保存时机**: 窗口变化时实时保存（500ms防抖）
- **边界检查**: 自动检测多显示器环境，防止窗口超出屏幕范围

## 🛠️ 快速开始

### 📋 系统要求

| 要求 | 版本 | 说明 |
|------|------|------|
| **Node.js** | ≥ 16.0.0 | 运行环境和包管理 |
| **npm** | ≥ 7.0.0 | 包管理工具 |
| **Git** | ≥ 2.0.0 | 版本控制 |
| **操作系统** | Win/macOS/Linux | 全平台支持 |

### 🚀 快速启动 (3步)

```bash
# 1. 克隆项目
git clone https://github.com/Designer-Awei/fast-hardware.git
cd fast-hardware

# 2. 环境检测 (推荐)
npm run check-platform

# 3. 启动开发
npm run dev
```

### 🎯 开发命令

| 命令 | 说明 | 适用场景 |
|------|------|----------|
| `npm run dev` | 🔥 热重载开发模式 | 日常开发 |
| `npm run dev-simple` | ⚡ 简单开发模式 | 无热重载需求 |
| `npm run dev-debug` | 🐛 调试模式 | 开发者工具调试 |
| `npm run check-platform` | 🔍 环境检测 | 环境兼容性检查 |
| `npm run error-help` | 🚨 错误诊断 | 遇到问题时使用 |

### 🌟 跨平台特性

本项目支持在Windows、macOS和Linux系统上**无缝开发**：

- **🔄 自动适配**: 智能检测操作系统并执行相应命令
- **🌐 UTF-8支持**: 保证中文显示正常
- **⚙️ 统一工具链**: 跨平台构建、调试和错误诊断
- **📦 智能构建**: 支持多平台多架构打包

### 🏃‍♂️ 运行截图

<div align="center">

**元件设计器界面**
```
┌─────────────────────────────────────────────────┐
│ Fast Hardware v0.1.3                     _ □ ✕ │
├─────────────────┬───────────────────────────────┤
│ 属性面板        │          设计画布              │
│                 │                               │
│ 名称: Arduino   │  ┌─────────────────────┐     │
│ 类别: 微控制器   │  │        元件         │     │
│ 宽度: 120        │  │   ┌─┬─┬─┬─┬─┬─┐     │     │
│ 高度: 160        │  │   └─┴─┴─┴─┴─┴─┘     │     │
│                 │  │                     │     │
│ ┌─────────────┐ │  └─────────────────────┘     │
│ │   保存元件   │ │                               │
│ └─────────────┘ │                               │
└─────────────────┴───────────────────────────────┘
```

</div>

## 📦 构建和打包

### 🎯 构建选项

| 命令 | 输出格式 | 支持平台 | 适用场景 |
|------|----------|----------|----------|
| `npm run build` | 应用程序包 | 全平台 | 开发测试 |
| `npm run dist` | 安装程序 | 全平台 | 发布分发 |

### 📋 构建产物说明

构建后文件保存在 `dist/` 目录：

**Windows** 🎯
- `Fast Hardware Setup 0.1.3.exe` - NSIS安装程序
- `win-unpacked/` - 未打包版本
- `win-x64.zip` - ZIP压缩包

**macOS** 🍎
- `Fast Hardware-0.1.3.dmg` - DMG磁盘映像
- `mac/` - 应用程序包
- `mac-x64.zip` - ZIP压缩包

**Linux** 🐧
- `Fast Hardware-0.1.3.AppImage` - AppImage可执行文件
- `fast-hardware_0.1.3_amd64.deb` - Debian包
- `fast-hardware-0.1.3.x86_64.rpm` - RPM包

### 🏗️ 构建流程

```bash
# 1. 清理旧构建
npm run clean  # 如有定义

# 2. 构建应用程序
npm run build

# 3. 生成分发包
npm run dist
```

### ⚙️ 高级构建配置

在 `package.json` 中可自定义构建选项：

```json
{
  "build": {
    "appId": "com.fasthardware.app",
    "productName": "Fast Hardware",
    "directories": {
      "output": "dist"
    },
    "win": { "target": "nsis" },
    "mac": { "target": "dmg" },
    "linux": { "target": "AppImage" }
  }
}
```

## 🔧 开发指南

### 🏗️ 核心架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   主进程        │    │   预加载脚本    │    │   渲染进程      │
│   (main.js)     │◄──►│  (preload.js)   │◄──►│  (renderer.js)  │
│                 │    │                 │    │                 │
│ • 应用生命周期  │    │ • API安全暴露   │    │ • UI交互        │
│ • 窗口管理      │    │ • IPC通信桥接   │    │ • DOM操作       │
│ • 系统操作      │    │ • 上下文隔离    │    │ • 事件处理      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 📁 核心文件说明

| 文件 | 职责 | 安全特性 |
|------|------|----------|
| **`main.js`** | 应用生命周期、窗口管理、系统操作 | 主进程安全 |
| **`preload.js`** | API安全暴露、IPC通信桥接 | 上下文隔离 |
| **`index.html`** | 应用界面骨架、资源引用 | - |
| **`scripts/`** | 前端功能模块、UI逻辑 | 渲染进程安全 |

### 🛡️ 安全最佳实践

本项目严格遵循Electron安全标准：

- ✅ **上下文隔离**: `contextIsolation: true`
- ✅ **Node集成禁用**: `nodeIntegration: false`
- ✅ **预加载脚本**: 安全API暴露机制
- ✅ **远程模块禁用**: `enableRemoteModule: false`

### 🚀 添加新功能

#### 1. 主进程功能 (main.js)
```javascript
// 添加IPC处理器
ipcMain.handle('new-feature', async (event, data) => {
    // 功能实现逻辑
    return result;
});
```

#### 2. 预加载脚本 (preload.js)
```javascript
// 安全暴露API
contextBridge.exposeInMainWorld('electronAPI', {
    newFeature: (data) => ipcRenderer.invoke('new-feature', data)
});
```

#### 3. 渲染进程 (scripts/)
```javascript
// 使用API
const result = await window.electronAPI.newFeature(data);
```

### 🔍 调试工具

#### 开发者工具
```bash
npm run dev-debug  # 启动并打开开发者工具
```

#### 平台检测
```bash
npm run check-platform  # 环境兼容性检测
```

#### 错误诊断
```bash
npm run error-help      # 智能错误分析
```

#### 控制台调试
```javascript
// 在浏览器控制台中运行
debugComponentDesigner()  // 查看元件设计器状态
```

## 🎨 界面定制

### 🎨 主题色彩修改

在 `styles/main.css` 中自定义颜色：

```css
:root {
    /* 主色调 */
    --primary-color: #007bff;
    --secondary-color: #6c757d;

    /* 背景色 */
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;

    /* 文字颜色 */
    --text-primary: #212529;
    --text-secondary: #6c757d;
}
```

### 🔧 自定义样式

1. **添加新样式文件**:
```bash
# 在 styles/ 目录下创建新文件
touch styles/custom-theme.css
```

2. **在HTML中引入**:
```html
<!-- 在 index.html 中添加 -->
<link rel="stylesheet" href="styles/custom-theme.css">
```

3. **样式覆盖示例**:
```css
/* 自定义元件设计器样式 */
.component-designer {
    border: 2px solid var(--primary-color);
    border-radius: 8px;
}

/* 自定义按钮样式 */
.btn-primary {
    background: var(--primary-color);
    border-color: var(--primary-color);
}
```

## 📋 开发路线图

### ✅ 已完成 (v0.1.3)

#### 🎯 MVP核心功能
- ✅ **跨平台兼容性**: Windows/macOS/Linux全平台支持
- ✅ **元件设计器**: 可视化元件设计，智能尺寸调整
- ✅ **窗口尺寸记忆**: 专业的桌面应用体验，自动保存窗口状态
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

## 🌐 多语言支持

本项目支持多种语言阅读：

- **[🇨🇳 中文 (Chinese)](README.md)** - 完整的中文文档
- **[🇺🇸 英文 (English)](README_EN.md)** - 英文版本 (即将推出)

**语言切换说明：**
- 点击页面顶部的语言链接即可切换
- 所有技术文档和注释均提供中英文对照
- 应用界面支持中文显示

## 📚 相关文档

| 文档 | 说明 | 重要性 |
|------|------|--------|
| **[PRD.md](PRD.md)** | 产品需求文档 - 详细的功能规划和技术架构 | 🔴 核心 |
| **[edit_prd.md](edit_prd.md)** | 开发记录 - 完整的技术实现和修复记录 | 🟡 重要 |
| **[data/README.md](data/README.md)** | 数据结构说明 - JSON格式规范和使用指南 | 🟡 重要 |
| **[原始需求文档](Fast%20Hardware.txt)** | 项目初始需求和设计思路 | 🟢 参考 |

### 📖 快速链接
- 🐛 [问题反馈](https://github.com/Designer-Awei/fast-hardware/issues)
- 💡 [功能建议](https://github.com/Designer-Awei/fast-hardware/discussions)
- 📖 [使用文档](https://github.com/Designer-Awei/fast-hardware/wiki)
- 🔄 [最新发布](https://github.com/Designer-Awei/fast-hardware/releases)

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 🚀 参与贡献

1. **Fork 项目**
   ```bash
   git clone https://github.com/Designer-Awei/fast-hardware.git
   cd fast-hardware
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/AmazingFeature
   # 或者
   git checkout -b fix/BugFix
   ```

3. **提交更改**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```

4. **推送到分支**
   ```bash
   git push origin feature/AmazingFeature
   ```

5. **创建 Pull Request**

### 📋 贡献类型

- 🐛 **Bug 修复**: 修复已知问题
- ✨ **新功能**: 添加新特性
- 📚 **文档**: 改进文档和注释
- 🎨 **UI/UX**: 界面和用户体验改进
- 🌐 **国际化**: 多语言支持
- 🧪 **测试**: 添加或改进测试

### 🔧 开发规范

- 遵循现有的代码风格
- 添加必要的注释和文档
- 确保跨平台兼容性
- 提交前运行测试

## 📄 许可证

```
MIT License

Copyright (c) 2025 Fast Hardware Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🆘 技术支持

### 📞 获取帮助

1. **📖 查看文档**
   - [详细使用指南](https://github.com/Designer-Awei/fast-hardware/wiki)
   - [常见问题解答](https://github.com/Designer-Awei/fast-hardware/wiki/FAQ)

2. **🐛 报告问题**
   - [GitHub Issues](https://github.com/Designer-Awei/fast-hardware/issues)
   - 请提供详细的错误信息和复现步骤

3. **💬 社区讨论**
   - [GitHub Discussions](https://github.com/Designer-Awei/fast-hardware/discussions)
   - 分享使用经验和建议

### 🔧 故障排除

遇到问题时，请按以下步骤操作：

1. **环境检查**: `npm run check-platform`
2. **依赖更新**: `npm install`
3. **缓存清理**: `npm cache clean --force`
4. **错误诊断**: `npm run error-help`

## 📝 更新日志

### 🎉 v0.1.3 (2025-09-11)
- ✅ **输入框焦点问题深度修复**
  - 彻底解决重置元件后输入框无法使用的问题
  - 替换原生confirm对话框为自定义对话框，避免焦点丢失
  - 增强输入框状态管理，确保各种场景下都能正常使用
  - 智能焦点恢复机制，支持标签页切换和窗口焦点变化

- ✅ **用户体验进一步优化**
  - 重置操作不再导致输入框失去焦点
  - 标签页切换时输入框状态自动修复
  - 窗口焦点变化时输入框状态实时恢复
  - 更稳定的用户界面交互体验

### 🎉 v0.1.2 (2025-09-11)
- ✅ **窗口尺寸记忆功能**
  - 自动保存和恢复窗口尺寸、位置
  - 智能边界检查防止窗口超出屏幕
  - 实时同步保存配置（防抖优化）
  - 完整支持最大化状态保存和恢复

- ✅ **用户体验大幅提升**
  - 专业的桌面应用体验
  - 窗口状态持久化
  - 智能错误恢复机制

### 🎉 v0.1.1 (2025-09-10)
- ✅ **跨平台兼容性大幅提升**
  - 智能平台检测和命令适配
  - 统一的开发工具链
  - 完善的错误处理系统

- ✅ **元件设计器功能完善**
  - 智能尺寸调整算法
  - 动态属性绑定和同步
  - 编辑模式状态保护

- ✅ **开发体验优化**
  - 平台检测工具集成
  - 智能错误诊断提示
  - 详细的调试信息输出

### 🔄 v0.1.0 (2025-09-01)
- ✅ 初始项目模板
- ✅ 基础UI界面
- ✅ 安全的IPC通信
- ✅ 跨平台构建配置
