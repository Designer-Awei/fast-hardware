# Fast Hardware

<div align="center">

![Fast Hardware Logo](assets/icon.png)

**一个智能化的硬件开发辅助桌面应用程序**

*帮助硬件项目新手解决选型、电路搭建和固件编写等问题*

[🇨🇳 中文](README.md) | [🇺🇸 English](README_EN.md)

[![Version](https://img.shields.io/badge/version-0.1.7-blue.svg)](https://github.com/Designer-Awei/fast-hardware/releases)
[![Electron](https://img.shields.io/badge/Electron-27.0.0-47848F.svg)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows%2064--bit-blue.svg)](https://github.com/Designer-Awei/fast-hardware/releases)

</div>

---

## 📖 目录

- [🚀 核心功能](#-核心功能)
- [✨ 最新特性](#-最新特性)
- [📁 项目结构](#-项目结构)
- [🛠️ 快速开始](#️-快速开始)
- [🌟 跨平台特性](#-跨平台特性)
- [📦 构建和打包](#-构建和打包)
- [📚 相关文档](#-相关文档)
- [🤝 贡献](#-贡献)
- [📄 许可证](#-许可证)

## 🚀 核心功能

### ✅ 元件设计器系统
可视化元件设计工具，支持自定义元件形状和引脚布局，智能尺寸调整和双向同步。

### ✅ 元件库管理系统
内置标准元件库和自定义元件库，支持元件预览、搜索和复用。

### ✅ 窗口尺寸记忆
自动保存和恢复窗口尺寸、位置，支持最大化状态，专业桌面应用体验。

### ✅ 元件管理功能
提供可视化元件管理界面，支持批量选择和删除操作，提升元件库维护效率。

### 🚧 电路设计画布 (开发中)
可视化电路设计界面，支持元件拖拽和连线，实时同步到JSON数据。

#### ✅ 已完成功能
- **悬浮元件库面板**: 左侧智能悬浮面板，默认收起状态，支持一键展开
- **元件拖拽放置**: 从悬浮面板拖拽元件到画布，精确坐标定位
- **元件完整渲染**: 圆角矩形主体、智能引脚布局、颜色编码标签
- **画布基础功能**: 格点背景、缩放控制、平移操作
- **自适应设计**: 响应式布局，支持桌面端、平板端、移动端

### 🚧 LLM智能助手 (规划中)
自然语言交互，智能推荐硬件方案，自动生成电路设计。

## ✨ 最新特性 (v0.1.7)

- **双路径管理**: 独立配置项目文件夹和系统元件库存储位置
- **智能文件夹创建**: 自动检测并创建元件库的标准/custom子文件夹
- **完整数据打包**: 松散文件方式包含完整元件库和项目数据
- **跨环境兼容**: 开发环境和打包环境路径解析统一
- **调试体验优化**: 元件库加载显示详细路径信息，便于问题排查

#### 🚀 系统元件库路径配置

- **双路径独立管理**: 项目存储和元件库存储分离配置
- **自定义元件库**: 支持选择外部文件夹作为元件库根目录
- **智能目录结构**: 自动创建standard/和custom/子文件夹
- **路径持久化**: 设置保存到用户配置文件，支持重启后恢复

#### 📦 专业部署系统

- **完整数据包含**: data文件夹作为松散文件打包到resources目录
- **跨环境路径解析**: 自动识别开发/打包环境，使用正确路径
- **优化构建输出**: 只生成NSIS安装程序和unpacked目录
- **64位专业化**: 专注现代64位Windows系统体验

#### 🎨 悬浮元件库系统

- **智能悬浮面板**: 默认收起状态，节省界面空间，点击一键展开
- **自适应尺寸**: 高度60%自适应，宽度10px精简设计，圆角8px现代美观
- **流畅拖拽**: HTML5原生拖拽，从面板到画布的无缝体验
- **完整渲染**: 圆角矩形主体、多色引脚系统、智能文字布局
- **响应式设计**: 桌面端、平板端、移动端完美适配
- **悬停反馈**: 动态宽度变化，颜色过渡，优秀的交互体验

## 📁 项目结构

```
fast-hardware/
├── 📁 assets/                    # 资源文件和图标
│   ├── icon.png                  # Linux平台图标
│   ├── icon.ico                  # Windows平台图标
│   ├── icon.icns                 # macOS平台图标
│   ├── icon_*.png                # 多尺寸PNG图标 (16x16-1024x1024)
│   └── README.md                 # 图标说明文档
├── 📁 data/                      # 数据文件目录
│   ├── 📁 system-components/     # 系统级元件库
│   │   ├── 📁 standard/          # 标准元件库 (std-*)
│   │   └── 📁 custom/            # 自定义元件库 (ctm-*)
│   └── 📁 projects/              # 用户项目目录
├── 📁 scripts/                   # 前端脚本
├── 📁 styles/                    # 样式文件
├── 📁 dist/                      # 构建输出目录 (打包后生成)
│   ├── Fast Hardware Setup 0.1.6.exe    # Windows安装程序
│   ├── Fast Hardware-0.1.6-win.zip      # Windows绿色版
│   └── win-unpacked/                    # 未打包版本
├── 📄 main.js                    # Electron主进程
├── 📄 index.html                 # 主界面
├── 📄 package.json               # 项目配置
└── 📄 README.md                  # 项目说明
```

### 📊 技术栈

- **前端框架**: Electron + HTML5 + CSS3 + JavaScript ES6
- **画布渲染**: HTML5 Canvas API
- **数据存储**: JSON文件系统
- **跨平台**: Windows/macOS/Linux 全平台支持

## 🛠️ 快速开始

### 📋 系统要求
- **操作系统**: Windows 10/11 (64位)
- **Node.js**: ≥ 16.0.0 (开发环境)
- **npm**: ≥ 7.0.0 (开发环境)
- **内存**: 建议 4GB 以上
- **存储空间**: 200MB 可用空间

### 🚀 快速启动

```bash
# 1. 克隆项目
git clone https://github.com/Designer-Awei/fast-hardware.git
cd fast-hardware

# 2. 安装依赖
npm install

# 3. 启动开发
npm run dev
```

### 🎯 主要命令
- `npm run dev` - 开发模式 (热重载)
- `npm run build` - 构建应用
- `npm run check-platform` - 环境检测

## 🌟 平台特性

### 🎯 **Windows 64位专业优化**

本项目专门针对现代64位Windows系统进行深度优化：

- **64位架构**: 充分利用现代硬件性能，提升运行速度
- **专业安装程序**: NSIS安装包，支持自定义安装路径
- **完整用户体验**: 桌面快捷方式、开始菜单集成、优雅卸载
- **数据保护**: 智能卸载机制，保护用户项目数据
- **UTF-8支持**: 完美支持中文界面和文件路径

## 📦 构建和打包

### 构建命令
```bash
# 开发构建
npm run build

# 生成分发包
npm run dist
```

### 分发文件说明

#### 🎯 **Windows (64位专用)**
- **`Fast Hardware Setup 0.1.7.exe`** (约76MB) - **专业安装程序**
  - ✅ 自定义安装路径选择
  - ✅ 自动创建桌面快捷方式
  - ✅ 自动创建开始菜单快捷方式
  - ✅ 完整的卸载程序
  - ✅ 内置完整元件库和示例项目
  - ✅ 保护用户数据（卸载时不删除）

- **`win-unpacked/`** - **绿色版本**
  - 📦 无需安装，可直接运行 `Fast Hardware.exe`
  - 🚀 适合快速部署和测试
  - 🐛 适合开发调试
  - 💾 包含完整元件库数据

### 📋 系统要求
- **操作系统**: Windows 10/11 (64位)
- **内存**: 建议 4GB 以上
- **存储空间**: 200MB 可用空间

### 🚀 安装指南
1. 下载 `Fast Hardware Setup 0.1.6.exe`
2. 双击运行安装程序
3. 选择安装位置（可自定义）
4. 按照提示完成安装
5. 从桌面或开始菜单启动应用

## 📚 相关文档

- **[CHANGELOG.md](CHANGELOG.md)** - 完整更新日志和开发记录
- **[PRD.md](PRD.md)** - 产品需求文档和技术架构
- **[data/README.md](data/README.md)** - 数据结构和元件库说明

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

- 🐛 [问题反馈](https://github.com/Designer-Awei/fast-hardware/issues)
- 💡 [功能建议](https://github.com/Designer-Awei/fast-hardware/discussions)

## 📄 许可证

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
