# 数据文件说明

这个目录包含了Fast Hardware应用程序的数据文件，包括元件库和项目文件。

## 📁 目录结构

### system-components/
系统级元件库，采用文件夹分类管理，每个元件一个独立JSON文件

#### standard/ - 标准元件库
包含系统预置的常用硬件元件：
- `arduino-uno-r3.json` - Arduino Uno R3开发板
- `led-5mm.json` - 5mm LED发光二极管  
- `resistor-220.json` - 220Ω电阻器
- `hc05-bluetooth.json` - HC-05蓝牙模块
- `servo-sg90.json` - SG90舵机

#### custom/ - 自定义元件库
包含用户创建的自定义元件：
- `esp32-devkit.json` - ESP32开发板
- `hc-sr04.json` - 超声波传感器HC-SR04
- `oled-128x64.json` - OLED显示屏
- `dht22.json` - 温湿度传感器DHT22

### projects/
存储用户项目文件夹

#### sample-led-project/
示例项目文件夹，展示了完整的项目结构：
- `components/` - 项目级元件库（独立副本）
- `circuit_config.json` - 电路系统配置
- `metadata.json` - 项目元数据和介绍
- `led_brightness_control.ino` - 生成的Arduino代码

## 📝 数据格式规范

### 系统级元件文件格式 (独立JSON文件)
```json
{
  "name": "元件名称",
  "id": "唯一标识符", 
  "description": "元件描述",
  "category": "元件类别",
  "pins": {
    "side1": [引脚数组],
    "side2": [引脚数组],
    "side3": [引脚数组],
    "side4": [引脚数组]
  },
  "dimensions": {
    "width": 宽度,
    "height": 高度
  },
  "specifications": {技术规格}
}
```

### 项目级文件格式

#### circuit_config.json
```json
{
  "projectName": "项目名称",
  "version": "版本号",
  "description": "项目描述", 
  "createdAt": "创建时间",
  "lastModified": "修改时间",
  "components": [
    {
      "componentFile": "元件文件名.json",
      "instanceId": "实例ID",
      "position": [x, y],
      "orientation": "朝向",
      "properties": {自定义属性}
    }
  ],
  "connections": [连接关系列表]
}
```

#### metadata.json
```json
{
  "createdAt": "创建时间",
  "author": "作者信息",
  "tags": ["标签列表"],
  "difficulty": "难度等级",
  "codeFiles": [代码文件信息],
  "hardwareRequirements": ["硬件需求"],
  "projectStats": {项目统计}
}
```

## 🔧 引脚类型说明

- `power`: 电源引脚 (VCC, 5V, 3.3V等)
- `ground`: 接地引脚 (GND)
- `digital_io`: 数字输入输出引脚
- `analog_io`: 模拟输入输出引脚
- `passive`: 无源器件引脚

## 🎯 元件类别说明

- `microcontroller`: 微控制器 (Arduino, ESP32等)
- `sensor`: 传感器 (温度、湿度、光敏等)
- `actuator`: 执行器 (舵机、电机等)
- `communication`: 通信模块 (蓝牙、WiFi、串口等)
- `output`: 输出设备 (LED、显示器等)
- `input`: 输入设备 (按钮、开关等)
- `passive`: 无源器件 (电阻、电容、电感等)
- `power`: 电源模块 (电池、充电器等)

## 📋 使用说明

1. **添加新元件**: 在相应的元件库文件中添加新的元件定义
2. **创建项目**: 创建新的项目JSON文件，定义元件实例和连接关系
3. **导入导出**: 可以通过复制JSON文件来备份或分享项目
4. **版本控制**: 建议使用版本号来跟踪项目的修改历史

## ⚠️ 注意事项

- 确保元件ID的唯一性，避免冲突
- 引脚名称必须与实际硬件对应
- 连接关系必须符合电路原理
- 生成的代码仅供参考，实际使用前需要验证
