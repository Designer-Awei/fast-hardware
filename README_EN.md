# Fast Hardware

<div align="center">

![Fast Hardware Logo](assets/icon.png)

**An Intelligent Hardware Development Assistant Desktop Application**

*Helping hardware project beginners solve problems with component selection, circuit building, and firmware writing*

[🇨🇳 中文](README.md) | [🇺🇸 English](README_EN.md)

[![Version](https://img.shields.io/badge/version-0.2.8-blue.svg)](https://github.com/Designer-Awei/fast-hardware/releases)
[![Electron](https://img.shields.io/badge/Electron-27.0.0-47848F.svg)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/Designer-Awei/fast-hardware/releases)

</div>

---

## 📖 Table of Contents

- [🚀 Core Features](#-core-features-by-priority)
- [✨ Latest Features](#-latest-features)
- [📁 Project Structure](#-project-structure)
- [🛠️ Quick Start](#️-quick-start)
- [🔧 Development Guide](#-development-guide)
- [📦 Build and Distribution](#-build-and-distribution)
- [🔍 Debugging and Troubleshooting](#-debugging-and-troubleshooting)
- [📋 Development Roadmap](#-development-roadmap)
- [📚 Related Documentation](#-related-documentation)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🚀 Core Features (by priority)

### ✅ 1. Component Designer System (Completed)
- **🎨 Visual Component Design**: Intuitive canvas interface for custom component shapes and pin layouts
- **📏 Intelligent Size Adjustment**: Automatic optimal size calculation to ensure all pins are displayed correctly
- **🔧 Pin Management**: Support for adding, editing, and deleting pins with types including power, ground, digital I/O, analog I/O, etc.
- **💾 Bidirectional Synchronization**: Real-time synchronization between property panel and canvas, automatic JSON saving

### ✅ 2. Component Library Management System (Completed)
- **📚 System Component Library**: Built-in standard components like Arduino Uno R3, LEDs, resistors
- **🔧 Custom Component Library**: Support for creating and reusing custom components
- **🔍 Intelligent Preview**: Thumbnail display with search and category filtering
- **📁 Hierarchical Management**: Separation of system-level and project-level component libraries

### ✅ 3. Cross-Platform Compatibility (Completed)
- **🖥️ Multi-Platform Support**: Full compatibility with Windows, macOS, and Linux
- **⚙️ Automatic Adaptation**: Intelligent OS detection and execution of corresponding commands
- **🔧 Unified Toolchain**: Cross-platform build, debugging, and error diagnosis
- **🌐 UTF-8 Support**: Guarantee of correct Chinese display

### 🚧 4. Circuit Design Canvas (In Development)
- **🎯 Drag Operations**: Support for component dragging, placement, and rotation
- **🔗 Connection System**: Manual connection functionality with path editing
- **💾 Real-time Synchronization**: Real-time synchronization between canvas operations and JSON data
- **⌨️ Keyboard Shortcuts**: Ctrl+S save with rich editing shortcuts

#### ✅ Completed Features
- **🎨 Floating Component Panel**: Left-side intelligent floating panel with default collapsed state
- **🖱️ Component Drag & Drop**: Seamless drag from panel to canvas with precise coordinate positioning
- **🎯 Complete Component Rendering**: Rounded rectangle body, intelligent pin layout, color-coded labels
- **📐 Canvas Basic Functions**: Grid background, zoom controls, pan operations
- **📱 Responsive Design**: Perfect adaptation for desktop, tablet, and mobile devices

### 🚧 5. LLM Intelligent Assistant (Planned)
- **💬 Natural Language Interaction**: Describe requirements through dialogue
- **🧠 Intelligent Recommendation**: LLM analyzes requirements and recommends hardware solutions
- **🎨 Automatic Generation**: Automatically generate circuit diagrams based on dialogue
- **⚡ API Integration**: Support for multiple LLM service providers

## ✨ Latest Features (v0.2.8)

### 📦 Versioning And Release Workflow
- **One-command version sync**: After editing `package.json` → `version`, run `npm run sync-version`, or run `npm run dist` (sync runs automatically before packaging)
- **Note**: You still maintain `0-Change-Log.md` manually; `npm run clean:dist` does not run the sync script

### 🎨 Settings And Workflow UI Improvements
- **Component match table layout**: The match result table now uses `25% / 30% / 45%` column widths for clearer status and result text
- **Settings card layout**: Storage, AI API, About, and Update cards were rebalanced with more consistent heights
- **Shortcut card scrolling fix**: Removed the inner `shortcuts-grid` scrollbar and kept a single outer `card-content` scrollbar
- **Release notes entry**: The Update card now includes a `Release Notes` button for viewing version history in-app

### 🚀 Startup Experience Improvements
- **Pre-splash dark window fix**: Adjusted startup window sequencing to avoid exposing a dark empty window before the splash screen
- **Splash first-frame rendering optimization**: The splash screen is now shown only after the page, logo, and first rendered frame are ready

### 🔄 Update Flow Improvements
- **External release notes source**: In-app release notes are now loaded from `assets/update.txt` instead of being embedded in settings code
- **Development update checks**: Development builds can now check the remote GitHub release feed for update-flow verification
- **Development version hint**: When the local version is higher than the remote release, the UI shows `当前为开发版本`

### 📚 Documentation And Release Sync
- **Version bump**: The project version is now `0.2.8`
- **Changelog link fix**: README links now point to the existing `0-Change-Log.md`

---

### Previous Version Highlights (v0.1.9)

### 🚀 LLM Intelligent Assistant Integration
- **🎯 SiliconFlow AI API Integration**: Multiple AI models (GLM-4-9B, GLM-4.1V-9B-Thinking, Qwen3-8B, Hunyuan-MT-7B)
- **💬 Intelligent Dialogue Interface**: Complete chat system with streaming output and markdown rendering
- **📝 Smart Markdown Rendering**: Integration of marked library supporting titles, lists, code blocks, bold/italic formats
- **🔧 Code Block Processing Engine**: Intelligent extraction of code blocks, placeholder replacement, rendering, and precise insertion
- **🎨 Nested List Support**: Support for multi-level nested unordered and ordered lists
- **🔢 Title Number Cleanup**: Automatic cleanup of number prefixes in markdown titles
- **⚡ Real-time Dialogue Synchronization**: Support for typing indicators, interrupt function, and message timestamps
- **🛡️ API Key Security**: Support for API key visibility toggle and persistent storage

#### ✅ Markdown Rendering System Deep Optimization
- **🎯 Marked Library Integration**: Using industry-standard markdown rendering engine
- **📦 Code Block Intelligent Processing**: Extract code blocks → Render plain text → Re-insert code blocks
- **🔧 Title Number Cleanup**: Support for multi-level number cleanup (1.2.3, etc.)
- **📋 Nested List Support**: Recursive parsing of multi-level nested structures
- **🎨 Style Unification**: Complete style support for code blocks, titles, and lists
- **⚡ Performance Optimization**: Efficient rendering algorithms and memory management

#### ✅ Dialogue Experience Comprehensive Optimization
- **💬 Streaming Message Rendering**: Support for real-time message streaming output
- **🕐 Timestamp Display**: Message timestamps accurate to seconds
- **🔄 Interrupt Function**: Support for manual interruption of AI responses
- **🎨 Message Bubbles**: Differentiated display for user and AI messages
- **📱 Responsive Layout**: Adaptation to different screen sizes
- **🎯 Shortcut Key Support**: Enter to send, Shift+Enter for line break

#### ✅ Code Block Functionality Deep Optimization
- **🔧 Syntax Highlighting**: Code blocks support multiple programming language identifiers
- **📋 One-Click Copy**: Copy button directly copies code content to clipboard
- **📏 Auto Scroll**: Long code automatically enables scrollbars
- **🎨 Beautiful Style**: Professional code block appearance design
- **🏷️ Language Identification**: Display code language type
- **📏 Size Control**: Reasonable code block size and font settings

#### ✅ Technical Architecture Upgrade
- **🔧 Modular Refactoring**: Thorough refactoring of markdown rendering system
- **📚 Marked Integration**: Using mature markdown processing library
- **🔄 API Abstraction**: Support for multiple LLM service providers
- **🛡️ Error Handling**: Complete API call error handling and retry mechanisms
- **📊 State Management**: Complete dialogue history and context management
- **⚡ Performance Optimization**: Efficient rendering and caching mechanisms

## 📁 Project Structure

```
fast-hardware/
├── 📁 assets/                    # Resource files directory
│   ├── icon.png                  # Application icon (PNG format)
│   ├── icon.ico                  # Windows icon
│   ├── icon.icns                 # macOS icon
│   └── README.md                 # Resource file description
├── 📁 data/                      # Data files directory
│   ├── 📁 system-components/     # System-level component library
│   │   ├── 📁 standard/          # Standard component library
│   │   │   ├── arduino-uno-r3.json
│   │   │   ├── led-5mm.json
│   │   │   ├── resistor-220.json
│   │   │   └── ...
│   │   ├── 📁 custom/            # Custom component library
│   │   │   ├── dht22.json
│   │   │   ├── esp32-devkit.json
│   │   │   └── ...
│   │   └── README.md
│   ├── 📁 projects/              # User project directory
│   │   ├── 📁 sample-led-project/
│   │   │   ├── circuit_config.json
│   │   │   ├── components/
│   │   │   ├── led_brightness_control.ino
│   │   │   └── metadata.json
│   │   └── README.md
│   └── README.md
├── 📁 scripts/                   # Frontend script directory
│   ├── canvas.js                 # Canvas operation script
│   ├── chat.js                   # Chat function script
│   ├── component-designer.js     # Component designer core
│   ├── components.js             # Component management script
│   ├── main.js                   # Main interface script
│   ├── resizer.js                # Window adjustment script
│   ├── tabs.js                   # Tab management script
│   └── renderer.js               # Renderer process script
├── 📁 styles/                    # Stylesheet directory
│   └── main.css                  # Main stylesheet
├── 📄 cross-platform-runner.js   # Cross-platform script runner
├── 📄 dev-runner.js              # Development environment hot reload script
├── 📄 dev-runner-no-reload.js    # No hot reload development script
├── 📄 error-handler.js           # Error handling tool
├── 📄 index.html                 # Main interface HTML file
├── 📄 main.js                    # Electron main process file
├── 📄 package.json               # Project configuration file
├── 📄 platform-check.js          # Platform compatibility detection tool
├── 📄 preload.js                 # Preload script
├── 📄 test-overwrite.js          # Test overwrite function script
├── 📄 .gitignore                 # Git ignore file configuration
├── 📄 edit_prd.md                # Detailed development record
├── 📄 Fast Hardware.txt          # Original requirements document
├── 📄 PRD.md                     # Product requirements document
└── 📄 README.md                  # Project description document (current file)
```

### 📂 Key Files Description

| File/Directory | Description | Importance |
|---------------|-------------|------------|
| `main.js` | Electron main process, application lifecycle management | 🔴 Core |
| `index.html` | Main interface HTML, application skeleton | 🔴 Core |
| `scripts/component-designer.js` | Component designer core functionality | 🔴 Core |
| `cross-platform-runner.js` | Cross-platform compatibility script | 🟡 Important |
| `data/system-components/` | System component library data | 🟡 Important |
| `platform-check.js` | Environment detection tool | 🟢 Tool |
| `error-handler.js` | Error diagnosis tool | 🟢 Tool |

## 🛠️ Quick Start

### 📋 System Requirements

| Requirement | Version | Description |
|-------------|---------|-------------|
| **Node.js** | ≥ 16.0.0 | Runtime environment and package management |
| **npm** | ≥ 7.0.0 | Package management tool |
| **Git** | ≥ 2.0.0 | Version control |
| **OS** | Win/macOS/Linux | Full platform support |

### 🚀 Quick Launch (3 steps)

```bash
# 1. Clone the project
git clone https://github.com/Designer-Awei/fast-hardware.git
cd fast-hardware

# 2. Environment check (recommended)
npm run check-platform

# 3. Start development
npm run dev
```

### 🎯 Development Commands

| Command | Description | Applicable Scenario |
|---------|-------------|-------------------|
| `npm run dev` | 🔥 Hot reload development mode | Daily development |
| `npm run dev-simple` | ⚡ Simple development mode | No hot reload required |
| `npm run dev-debug` | 🐛 Debug mode | Developer tools debugging |
| `npm run sync-version` | 🔢 Sync display versions from `package.json` | After bumping `version` / before release |
| `npm run check-platform` | 🔍 Environment check | Environment compatibility check |
| `npm run error-help` | 🚨 Error diagnosis | When encountering problems |

### 🌟 Cross-Platform Features

This project supports **seamless development** on Windows, macOS, and Linux systems:

- **🔄 Automatic Adaptation**: Intelligent OS detection and execution of corresponding commands
- **🌐 UTF-8 Support**: Guarantee of correct Chinese display
- **⚙️ Unified Toolchain**: Cross-platform build, debugging, and error diagnosis
- **📦 Intelligent Build**: Support for multi-platform multi-architecture packaging

### 🏃‍♂️ Running Screenshot

<div align="center">

**Component Designer Interface**
```
┌─────────────────────────────────────────────────┐
│ Fast Hardware v0.1.1                     _ □ ✕ │
├─────────────────┬───────────────────────────────┤
│ Property Panel  │          Design Canvas        │
│                 │                               │
│ Name: Arduino   │  ┌─────────────────────┐     │
│ Category: MCU   │  │        Component     │     │
│ Width: 120      │  │   ┌─┬─┬─┬─┬─┬─┐     │     │
│ Height: 160     │  │   └─┴─┴─┴─┴─┴─┘     │     │
│                 │  │                     │     │
│ ┌─────────────┐ │  └─────────────────────┘     │
│ │   Save       │ │                               │
│ │ Component    │ │                               │
│ └─────────────┘ │                               │
└─────────────────┴───────────────────────────────┘
```

</div>

## 📦 Build and Distribution

### 🎯 Build Options

| Command | Output Format | Supported Platforms | Applicable Scenario |
|---------|---------------|-------------------|-------------------|
| `npm run build` | Application package | Full platform | Development testing |
| `npm run sync-version` | Sync version strings in docs and UI fallbacks | All platforms | After editing `package.json` version |
| `npm run dist` | Installation program | Full platform | Release distribution |

### 📋 Build Product Description

Build products are saved in the `dist/` directory:

**Windows** 🎯
- `Fast-Hardware-Setup-0.2.8.exe` - NSIS installation program
- `win-unpacked/` - Unpacked version
- `win-x64.zip` - ZIP compressed package

**macOS** 🍎
- `Fast Hardware-0.2.8.dmg` - DMG disk image
- `mac/` - Application package
- `mac-x64.zip` - ZIP compressed package

**Linux** 🐧
- `Fast Hardware-0.2.8.AppImage` - AppImage executable file
- `fast-hardware_0.2.8_amd64.deb` - Debian package
- `fast-hardware-0.2.8.x86_64.rpm` - RPM package

### 🏗️ Build Process

```bash
# 1. Build application
npm run build

# 2. Generate distribution packages
npm run dist

# 3. Clean the dist directory only
npm run clean:dist
```

> Note: `npm run dist` now clears the `dist/` directory before packaging, preventing old and new release artifacts from being mixed together.

### 🔢 Version maintenance (recommended)

1. Update **`version`** in the root `package.json` (this is the single source of truth for Electron Builder artifacts).
2. Run **`npm run sync-version`**, or run **`npm run dist`** (sync runs automatically before cleaning/building).
3. Update **`0-Change-Log.md`** with human-readable release notes for this version.

### ⚙️ Advanced Build Configuration

Custom build options can be configured in `package.json`:

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

## 🔧 Development Guide

### 🏗️ Core Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Main Process  │    │   Preload       │    │   Renderer      │
│   (main.js)     │◄──►│   Script        │◄──►│   Process       │
│                 │    │  (preload.js)   │    │  (renderer.js)  │
│ • App Lifecycle │    │                 │    │                 │
│ • Window Mgmt   │    │ • API Exposure  │    │ • UI Interaction│
│ • System Ops    │    │ • IPC Bridge    │    │ • DOM Ops       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 📁 Core Files Description

| File | Responsibility | Security Features |
|------|----------------|-------------------|
| **`main.js`** | App lifecycle, window management, system operations | Main process security |
| **`preload.js`** | API security exposure, IPC communication bridge | Context isolation |
| **`index.html`** | App interface skeleton, resource references | - |
| **`scripts/`** | Frontend functional modules, UI logic | Renderer process security |

### 🛡️ Security Best Practices

This project strictly follows Electron security standards:

- ✅ **Context Isolation**: `contextIsolation: true`
- ✅ **Node Integration Disabled**: `nodeIntegration: false`
- ✅ **Preload Script**: Secure API exposure mechanism
- ✅ **Remote Module Disabled**: `enableRemoteModule: false`

### 🚀 Adding New Features

#### 1. Main Process Features (main.js)
```javascript
// Add IPC handler
ipcMain.handle('new-feature', async (event, data) => {
    // Implementation logic
    return result;
});
```

#### 2. Preload Script (preload.js)
```javascript
// Securely expose API
contextBridge.exposeInMainWorld('electronAPI', {
    newFeature: (data) => ipcRenderer.invoke('new-feature', data)
});
```

#### 3. Renderer Process (scripts/)
```javascript
// Use API
const result = await window.electronAPI.newFeature(data);
```

### 🔍 Debugging Tools

#### Developer Tools
```bash
npm run dev-debug  # Start and open developer tools
```

#### Platform Detection
```bash
npm run check-platform  # Environment compatibility detection
```

#### Error Diagnosis
```bash
npm run error-help      # Intelligent error analysis
```

#### Console Debugging
```javascript
// Run in browser console
debugComponentDesigner()  // View component designer status
```

## 🎨 Interface Customization

### 🎨 Theme Color Modification

Customize colors in `styles/main.css`:

```css
:root {
    /* Primary colors */
    --primary-color: #007bff;
    --secondary-color: #6c757d;

    /* Background colors */
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;

    /* Text colors */
    --text-primary: #212529;
    --text-secondary: #6c757d;
}
```

### 🔧 Custom Styles

1. **Add New Style File**:
```bash
# Add in styles/ directory
touch styles/custom-theme.css
```

2. **Introduce in HTML**:
```html
<!-- Add in index.html -->
<link rel="stylesheet" href="styles/custom-theme.css">
```

3. **Style Override Example**:
```css
/* Custom component designer styles */
.component-designer {
    border: 2px solid var(--primary-color);
    border-radius: 8px;
}

/* Custom button styles */
.btn-primary {
    background: var(--primary-color);
    border-color: var(--primary-color);
}
```

## 📋 Development Roadmap

### ✅ Completed (v0.1.1)

#### 🎯 MVP Core Features
- ✅ **Cross-platform compatibility**: Windows/macOS/Linux full platform support
- ✅ **Component designer**: Visual component design with intelligent size adjustment
- ✅ **Component library system**: System and custom component libraries
- ✅ **Intelligent size synchronization**: Real-time synchronization between property panel and canvas
- ✅ **JSON validation system**: Comprehensive component data validation and error handling

### 🚀 In Progress (v0.2.0 - Expected October 2025)

#### 🎨 Circuit Design Canvas
- 🔄 **Drag operations**: Support for component dragging, placement, and rotation
- 🔄 **Connection system**: Manual connection functionality with path editing
- 🔄 **Real-time synchronization**: Real-time synchronization between canvas operations and JSON data
- 🔄 **Keyboard shortcuts support**: Ctrl+S save with rich editing shortcuts

### 🚧 Planned (v0.3.0 - Expected November 2025)

#### 🧠 LLM Intelligent Assistant
- 📋 **Natural language interaction**: Describe requirements through dialogue
- 🤖 **Intelligent recommendation**: LLM analyzes requirements and recommends hardware solutions
- 🎨 **Automatic generation**: Automatically generate circuit diagrams based on dialogue
- ⚡ **API integration**: Support for multiple LLM service providers

#### 📦 Project Management System
- 💾 **Project saving**: Complete project state saving and recovery
- 📁 **Import/export**: Project file packaging and sharing
- 🔄 **Version control**: Project version history management
- 📊 **Project templates**: Predefined project template library

### 🎯 Long-term Planning (v1.0.0 - Expected December 2025)

#### 🚀 Advanced Features
- 🔬 **Circuit simulation**: Basic circuit simulation functionality
- 👥 **Collaboration features**: Multi-user collaborative editing
- ☁️ **Cloud synchronization**: Project cloud storage and synchronization

#### 🎨 User Experience Optimization
- 🎭 **Theme system**: Multiple UI theme choices
- 🌐 **Internationalization**: Multi-language support
- ♿ **Accessibility support**: Keyboard navigation and screen reader support

### 📊 Development Progress Overview

| Version | Status | Completion | Main Features |
|---------|--------|------------|---------------|
| **v0.1.1** | ✅ Released | 100% | Component designer, cross-platform support |
| **v0.2.0** | 🔄 Developing | 60% | Circuit design canvas |
| **v0.3.0** | 📋 Planned | 20% | LLM intelligent assistant |
| **v1.0.0** | 🎯 Long-term | 10% | Complete productization |

## 📚 Related Documentation

| Document | Description | Importance |
|----------|-------------|------------|
| **[0-Change-Log.md](0-Change-Log.md)** | Release changelog and development progress records | 🔴 Core |
| **[PRD.md](PRD.md)** | Product Requirements Document - Detailed functional planning and technical architecture | 🔴 Core |
| **[edit_prd.md](edit_prd.md)** | Development Record - Complete technical implementation and fix records | 🟡 Important |
| **[data/README.md](data/README.md)** | Data Structure Description - JSON format specifications and usage guidelines | 🟡 Important |
| **[Original Requirements](Fast%20Hardware.txt)** | Project initial requirements and design concepts | 🟢 Reference |

### 📖 Quick Links
- 🐛 [Issue Reporting](https://github.com/Designer-Awei/fast-hardware/issues)
- 💡 [Feature Suggestions](https://github.com/Designer-Awei/fast-hardware/discussions)
- 📖 [Usage Documentation](https://github.com/Designer-Awei/fast-hardware/wiki)
- 🔄 [Latest Releases](https://github.com/Designer-Awei/fast-hardware/releases)

## 🤝 Contributing

We welcome contributions of all kinds!

### 🚀 How to Contribute

1. **Fork the project**
   ```bash
   git clone https://github.com/Designer-Awei/fast-hardware.git
   cd fast-hardware
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/AmazingFeature
   # or
   git checkout -b fix/BugFix
   ```

3. **Commit changes**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```

4. **Push to branch**
   ```bash
   git push origin feature/AmazingFeature
   ```

5. **Create Pull Request**

### 📋 Contribution Types

- 🐛 **Bug Fixes**: Fix known issues
- ✨ **New Features**: Add new features
- 📚 **Documentation**: Improve documentation and comments
- 🎨 **UI/UX**: Interface and user experience improvements
- 🌐 **Internationalization**: Multi-language support
- 🧪 **Testing**: Add or improve tests

### 🔧 Development Standards

- Follow existing code style
- Add necessary comments and documentation
- Ensure cross-platform compatibility
- Run tests before committing

## 📄 License

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

## 🆘 Technical Support

### 📞 Getting Help

1. **📖 View Documentation**
   - [Detailed Usage Guide](https://github.com/Designer-Awei/fast-hardware/wiki)
   - [Frequently Asked Questions](https://github.com/Designer-Awei/fast-hardware/wiki/FAQ)

2. **🐛 Report Issues**
   - [GitHub Issues](https://github.com/Designer-Awei/fast-hardware/issues)
   - Please provide detailed error information and reproduction steps

3. **💬 Community Discussion**
   - [GitHub Discussions](https://github.com/Designer-Awei/fast-hardware/discussions)
   - Share usage experiences and suggestions

### 🔧 Troubleshooting

When encountering problems, follow these steps:

1. **Environment Check**: `npm run check-platform`
2. **Dependency Update**: `npm install`
3. **Cache Cleanup**: `npm cache clean --force`
4. **Error Diagnosis**: `npm run error-help`

## 📝 Changelog

### 🎉 v0.1.9 (2025-09-24)

#### 🐛 Code Editor Bug Fixes (Core Feature)
- 🔧 **Project Save Code Override Fix**: Fixed the issue where saving projects in the circuit design canvas would override user-edited firmware code
- 🛡️ **Smart Code Protection Mechanism**: System automatically detects user editing traces, only generates automatic code when no user-edited content exists
- 💾 **Code Editor State Caching**: Optimized content loading logic when opening/closing the code editor to ensure editing state persistence
- 📝 **Conditional Code Generation**: Smart judgment during project saving whether to override existing code, protecting user custom code

#### ✅ Code Editor Experience Optimization
- 🎯 **Cache Priority Loading**: Code editor prioritizes loading last saved content when reopened
- 🔄 **Project Switching Cleanup**: Automatically cleans code cache when switching projects to prevent content confusion
- 📊 **Detailed Status Logging**: Added detailed logs for code loading and saving for easier debugging
- ⚡ **Save Timing Optimization**: Ensures code saving is completed before performing other operations

#### ✅ Technical Architecture Improvements
- 🔧 **IPC Communication Optimization**: Improved code path passing between main and renderer processes
- 🛡️ **Enhanced Error Handling**: Error handling and user prompts when code saving fails
- 📋 **State Management Perfection**: Code editor state management and lifecycle management

### 🎉 v0.1.8 (2025-09-24)

#### 🚀 LLM Intelligent Assistant Integration (Core Feature)
- 🎯 **SiliconFlow AI API Integration**: Integration of multiple AI models (GLM-4-9B, GLM-4.1V-9B-Thinking, Qwen3-8B, Hunyuan-MT-7B)
- 💬 **Dialogue Interface System**: Complete chat interface with streaming output and markdown rendering
- 📝 **Smart Markdown Rendering**: Integration of marked library supporting titles, lists, code blocks, bold/italic formats
- 🔧 **Code Block Processing Engine**: Intelligent extraction of code blocks, placeholder replacement, rendering, and precise insertion
- 🎨 **Nested List Support**: Support for multi-level nested unordered and ordered lists
- 🔢 **Title Number Cleanup**: Automatic cleanup of number prefixes in markdown titles
- ⚡ **Real-time Dialogue Synchronization**: Support for typing indicators, interrupt function, and message timestamps
- 🛡️ **API Key Security**: Support for API key visibility toggle and persistent storage

#### ✅ Markdown Rendering System Deep Optimization
- 🎯 **Marked Library Integration**: Using industry-standard markdown rendering engine
- 📦 **Code Block Intelligent Processing**: Extract code blocks → Render plain text → Re-insert code blocks
- 🔧 **Title Number Cleanup**: Support for multi-level number cleanup (1.2.3, etc.)
- 📋 **Nested List Support**: Recursive parsing of multi-level nested structures
- 🎨 **Style Unification**: Complete style support for code blocks, titles, and lists
- ⚡ **Performance Optimization**: Efficient rendering algorithms and memory management

#### ✅ Dialogue Experience Comprehensive Optimization
- 💬 **Streaming Message Rendering**: Support for real-time message streaming output
- 🕐 **Timestamp Display**: Message timestamps accurate to seconds
- 🔄 **Interrupt Function**: Support for manual interruption of AI responses
- 🎨 **Message Bubbles**: Differentiated display for user and AI messages
- 📱 **Responsive Layout**: Adaptation to different screen sizes
- 🎯 **Shortcut Key Support**: Enter to send, Shift+Enter for line break

#### ✅ Code Block Functionality Deep Optimization
- 🔧 **Syntax Highlighting**: Code blocks support multiple programming language identifiers
- 📋 **One-Click Copy**: Copy button directly copies code content to clipboard
- 📏 **Auto Scroll**: Long code automatically enables scrollbars
- 🎨 **Beautiful Style**: Professional code block appearance design
- 🏷️ **Language Identification**: Display code language type
- 📏 **Size Control**: Reasonable code block size and font settings

#### ✅ Technical Architecture Upgrade
- 🔧 **Modular Refactoring**: Thorough refactoring of markdown rendering system
- 📚 **Marked Integration**: Using mature markdown processing library
- 🔄 **API Abstraction**: Support for multiple LLM service providers
- 🛡️ **Error Handling**: Complete API call error handling and retry mechanisms
- 📊 **State Management**: Complete dialogue history and context management
- ⚡ **Performance Optimization**: Efficient rendering and caching mechanisms

### 🎉 v0.1.1 (2025-09-10)
- ✅ **Significantly improved cross-platform compatibility**
  - Intelligent platform detection and command adaptation
  - Unified development toolchain
  - Comprehensive error handling system

- ✅ **Component designer feature enhancement**
  - Intelligent size adjustment algorithm
  - Dynamic property binding and synchronization
  - Edit mode state protection

- ✅ **Development experience optimization**
  - Platform detection tool integration
  - Intelligent error diagnosis prompts
  - Detailed debugging information output

### 🔄 v0.1.0 (2025-09-01)
- ✅ Initial project template
- ✅ Basic UI interface
- ✅ Secure IPC communication
- ✅ Cross-platform build configuration

---

*This project is maintained by the Fast Hardware Team. We welcome your participation and contribution!*
