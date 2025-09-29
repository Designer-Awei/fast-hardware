# Fast Hardware

<div align="center">

![Fast Hardware Logo](assets/icon.png)

**一个智能化的硬件开发辅助桌面应用程序**

*集成AI智能助手，帮助硬件项目新手解决选型、电路搭建、固件编写和编程等问题*

[🇨🇳 中文](README.md) | [🇺🇸 English](README_EN.md)

[![Version](https://img.shields.io/badge/version-0.1.9-blue.svg)](https://github.com/Designer-Awei/fast-hardware/releases)
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

### ✅ 电路设计画布
可视化电路设计界面，支持元件拖拽和连线，实时同步到JSON数据，完整的项目导入导出功能。

### 🎯 LLM智能助手 (全新功能)
集成SiliconFlow AI API，支持多种AI模型，提供智能对话界面，支持markdown渲染、代码块高亮、嵌套列表等高级功能，帮助用户解决电路设计和编程问题。

#### ✅ 已完成功能
- **悬浮元件库面板**: 左侧智能悬浮面板，默认收起状态，支持一键展开
- **元件拖拽放置**: 从悬浮面板拖拽元件到画布，精确坐标定位
- **元件完整渲染**: 圆角矩形主体、智能引脚布局、颜色编码标签
- **画布基础功能**: 格点背景、缩放控制、平移操作
- **自适应设计**: 响应式布局，支持桌面端、平板端、移动端

### 🚧 LLM智能助手 (规划中)
自然语言交互，智能推荐硬件方案，自动生成电路设计。

## ✨ 最新特性 (v0.1.9)

- **LLM智能助手**: 集成SiliconFlow AI API，支持多种AI模型的智能对话
- **智能Markdown渲染**: 集成marked库，支持标题、列表、代码块等完整语法
- **代码块处理引擎**: 智能提取代码块，用占位符替换后渲染，再精确插入
- **嵌套列表支持**: 支持多层嵌套的无序和有序列表结构
- **标题序号清理**: 自动清理markdown标题中的序号前缀
- **实时对话同步**: 支持流式输出、打字指示器和消息中断功能

#### 🚀 LLM智能助手集成 (核心功能)

- **SiliconFlow AI API**: 集成GLM-4-9B、GLM-4.1V-9B-Thinking、Qwen3-8B、Hunyuan-MT-7B等多款AI模型
- **智能对话界面**: 完整的聊天系统，支持流式消息输出和markdown渲染
- **高级Markdown支持**: 标题自动清理序号、嵌套列表递归解析、代码块语法高亮
- **代码块智能处理**: 提取代码块→占位符替换→marked渲染→精确插入的完整流程
- **对话体验优化**: 消息气泡设计、时间戳显示、中断回复功能、快捷键支持

#### ✅ Markdown渲染系统深度完善

- **marked库集成**: 使用业界标准的markdown渲染引擎，兼容CommonMark规范
- **智能代码块处理**: 复杂的提取、渲染、重新插入机制，确保代码格式完整
- **标题序号清理**: 支持多级序号清理 (1.2.3等)，自动移除标题前缀
- **嵌套列表支持**: 递归解析多层嵌套结构，支持有序和无序列表混合
- **样式统一**: 代码块、标题、列表的完整样式系统，美观易读

#### ✅ 对话体验全面优化

- **流式消息渲染**: 实时消息流式输出，提升响应体验
- **时间戳显示**: 消息精确到秒的时间显示
- **中断功能**: 支持手动中断AI回复，保护用户交互
- **消息气泡**: 用户和AI消息的差异化显示设计
- **响应式布局**: 适配不同屏幕尺寸和设备
- **快捷键支持**: Enter发送，Shift+Enter换行的标准交互

#### ✅ 代码块功能深度完善

- **语法高亮**: 代码块支持多种编程语言标识和显示
- **一键复制**: 复制按钮直接复制代码内容到剪贴板
- **自动滚动**: 长代码自动启用滚动条，保持界面整洁
- **美观样式**: 专业的代码块外观设计，圆角边框和阴影效果
- **语言标识**: 显示代码语言类型，便于用户识别
- **尺寸控制**: 合理的代码块尺寸和字体设置

#### ✅ 技术架构升级

- **模块化重构**: 彻底重构markdown渲染系统，提高可维护性
- **marked集成**: 使用成熟的markdown处理库，提升渲染质量
- **API抽象**: 支持多种LLM服务提供商的统一接口设计
- **错误处理**: 完善的API调用错误处理和重试机制
- **状态管理**: 完整的对话历史和上下文管理
- **性能优化**: 高效的渲染和缓存机制

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
│   ├── Fast Hardware Setup 0.1.9.exe    # Windows安装程序
│   ├── Fast Hardware-0.1.9-win.zip      # Windows绿色版
│   └── win-unpacked/                    # 未打包版本
├── 📄 main.js                    # Electron主进程
├── 📄 index.html                 # 主界面
├── 📄 package.json               # 项目配置
└── 📄 README.md                  # 项目说明
```

### 📊 技术栈

- **前端框架**: Electron 27.0.0 + HTML5 + CSS3 + JavaScript ES6
- **AI集成**: SiliconFlow API (GLM-4-9B, GLM-4.1V-9B-Thinking, Qwen3-8B, Hunyuan-MT-7B)
- **Markdown渲染**: marked.js (业界标准markdown解析引擎)
- **画布渲染**: HTML5 Canvas API
- **数据存储**: JSON文件系统 + 本地配置持久化
- **跨平台**: Windows/macOS/Linux 全平台支持

## 🛠️ 快速开始

### 📋 系统要求
- **操作系统**: Windows 10/11 (64位)
- **Node.js**: ≥ 16.0.0 (开发环境)
- **npm**: ≥ 7.0.0 (开发环境)
- **内存**: 建议 4GB 以上
- **存储空间**: 200MB 可用空间
- **AI功能**: SiliconFlow API密钥 (可选，用于智能助手功能)

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

### 🤖 AI功能配置 (可选)

1. **获取API密钥**
   - 访问 [SiliconFlow](https://siliconflow.cn/) 注册账号
   - 在控制台获取API密钥

2. **配置API密钥**
   - 启动应用后，在设置页面配置API密钥
   - 支持密钥可见性切换和安全存储

3. **使用智能助手**
   - 在聊天区与AI助手对话
   - 支持markdown渲染、代码高亮等高级功能
   - 可以询问电路设计、编程等问题

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
1. 下载 `Fast Hardware Setup 0.1.9.exe`
2. 双击运行安装程序
3. 选择安装位置（可自定义）
4. 按照提示完成安装
5. 从桌面或开始菜单启动应用

## 📚 相关文档

- **[CHANGELOG.md](CHANGELOG.md)** - 完整更新日志和开发记录
- **[PRD.md](PRD.md)** - 产品需求文档和技术架构
- **[3-llm_prd.md](3-llm_prd.md)** - LLM集成功能详细需求文档
- **[data/README.md](data/README.md)** - 数据结构和元件库说明
- **[SiliconFlow API](https://siliconflow.cn/)** - AI服务提供商官方文档

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
