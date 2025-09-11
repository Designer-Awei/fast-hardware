# Fast Hardware

<div align="center">

![Fast Hardware Logo](assets/icon.png)

**一个智能化的硬件开发辅助桌面应用程序**

*帮助硬件项目新手解决选型、电路搭建和固件编写等问题*

[🇨🇳 中文](README.md) | [🇺🇸 English](README_EN.md)

[![Version](https://img.shields.io/badge/version-0.1.4-blue.svg)](https://github.com/Designer-Awei/fast-hardware/releases)
[![Electron](https://img.shields.io/badge/Electron-27.0.0-47848F.svg)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Designer-Awei/fast-hardware/releases)

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

### 🚧 LLM智能助手 (规划中)
自然语言交互，智能推荐硬件方案，自动生成电路设计。

## ✨ 最新特性 (v0.1.4)

- **智能元件管理**: 编辑模式覆盖原文件，复用模式生成新文件
- **元件批量管理**: 可视化选择和删除多个元件，提升维护效率
- **保存成功提示**: 所有保存操作都有即时的视觉反馈
- **元件ID结构化**: 统一格式 `std-[name]-[time]` 和 `ctm-[name]-[time]`
- **跨平台优化**: Windows/macOS/Linux全平台兼容

## 📁 项目结构

```
fast-hardware/
├── 📁 assets/                    # 资源文件和图标
├── 📁 data/                      # 数据文件目录
│   ├── 📁 system-components/     # 系统级元件库
│   │   ├── 📁 standard/          # 标准元件库 (std-*)
│   │   └── 📁 custom/            # 自定义元件库 (ctm-*)
│   └── 📁 projects/              # 用户项目目录
├── 📁 scripts/                   # 前端脚本
├── 📁 styles/                    # 样式文件
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
- **Node.js**: ≥ 16.0.0
- **npm**: ≥ 7.0.0
- **操作系统**: Windows/macOS/Linux

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

## 🌟 跨平台特性

本项目支持 Windows、macOS、Linux 全平台运行：

- **自动适配**: 智能检测操作系统并执行相应命令
- **UTF-8支持**: 保证中文显示正常
- **统一工具链**: 跨平台构建和调试
- **原生体验**: 每个平台都有原生的界面风格

## 📦 构建和打包

### 构建命令
```bash
# 开发构建
npm run build

# 生成分发包
npm run dist
```

### 支持平台
- **Windows**: EXE安装程序 + ZIP包
- **macOS**: DMG磁盘映像 + ZIP包
- **Linux**: AppImage + DEB/RPM包

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
