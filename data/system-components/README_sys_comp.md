# 系统级元件库

这个目录存储所有可复用的硬件元件定义，包括标准元件和用户自定义元件。采用文件夹分类管理，每个元件一个独立的JSON文件。

## 📁 目录结构

```
system-components/
├── standard/           # 标准元件库
│   ├── arduino-uno-r3.json
│   ├── led-5mm.json
│   ├── resistor-220.json
│   ├── hc05-bluetooth.json
│   ├── servo-sg90.json
│   └── README.md
├── custom/             # 自定义元件库  
│   ├── esp32-devkit.json
│   ├── hc-sr04.json
│   ├── oled-128x64.json
│   ├── dht22.json
│   └── README.md
└── README.md           # 本文件
```

### 标准元件库 (standard/)
- 系统预置的常用硬件元件
- 经过验证，确保数据准确性
- 不建议直接修改

### 自定义元件库 (custom/)
- 用户通过元件绘制器创建的元件
- 从标准元件修改而来的定制元件
- 可以自由添加、修改、删除

## 🔄 工作流程

### 1. 元件创建流程
```
用户绘制自定义元件 → 保存到custom/文件夹 → 在LLM预览窗口中可见 → 可被项目引用
```

### 2. 项目引用流程
```
LLM分析需求 → 扫描standard/和custom/文件夹 → 显示元件预览窗口 → 用户勾选需要的元件 → 直接复制JSON文件到项目components/文件夹
```

### 3. 元件复用优势
- **简单复制**: 一个JSON文件 = 一个元件，直接文件复制
- **独立管理**: 每个项目的元件副本互不影响
- **清晰分类**: 标准元件和自定义元件分文件夹管理
- **便于扩展**: 新增元件只需添加JSON文件

## 📝 数据结构

### ⚠️ 重要概念区分

- **模块类型** (`category`): 元件的整体功能分类
  - 例如: `"communication"`, `"sensor"`, `"actuator"`, `"microcontroller"`等
- **引脚类型** (`type`): 单个引脚的功能分类
  - 例如: `"power"`, `"ground"`, `"digital_io"`, `"analog_io"`, `"special"`

> **注意**: 不要混淆这两个概念。例如HC-05蓝牙模块的`category`是`"communication"`（通信模块），但其引脚`type`都是`"power"`、`"ground"`、`"digital_io"`等。

### 单个元件文件格式
```json
{
  "name": "元件名称",
  "id": "唯一标识符",
  "description": "元件描述",
  "category": "模块类型",
  "pins": {
    "side1": [
      {"pinName": "引脚名称", "type": "引脚类型", "order": 序号}
    ]
  },
  "dimensions": {尺寸信息}
}
```

## 🎯 使用建议

1. **命名规范**: 使用描述性的元件名称
2. **分类管理**: 按功能类别组织元件
3. **文档完整**: 为自定义元件添加详细描述
4. **版本控制**: 重要元件建议备份

## ⚠️ 注意事项

- 不要直接编辑此文件夹中的文件，使用应用程序的元件编辑器
- 删除元件前确认没有项目在使用
- 定期备份重要的自定义元件
