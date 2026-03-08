# Fast Hardware - 电路方案生成工作流 PRD（4-workflow_prd）

## 📋 文档概述

### 文档定位
- 本文档是对 `3-llm_prd.md` 的**工作流级详细补充**，专门描述：
  - 从「用户需求」到「完整电路原型 JSON」的**端到端工作流**
  - LLM 在其中的职责边界（仅负责**分析与决策输出**，不直接操作画布）
  - 主进程 / 渲染进程 / 工作流引擎 / 画布模块之间的数据与控制流
- 目标：在**不改变现有画布与项目数据模型**的前提下，为后续自动电路设计功能提供稳定、可扩展的工作流骨架。

### 角色与边界
- **LLM（电路顾问）**
  - 只接收结构化参数（系统元件库列表、画布 JSON 规范片段等）
  - 输出**结构化决策结果或指令 JSON**，不直接生成最终画布 JSON
  - 不直接读写磁盘、不直接调用任何 Electron / DOM API
- **工作流引擎（Workflow Engine）**
  - 运行在渲染进程（或专门模块）中，负责串联以下 4 个阶段：
    1. 需求分析
    2. 元件生成与整理
    3. 结构化接线生成
    4. 完整原型输出与渲染
  - 负责调用 LLM、管理中间态、进行校验与错误恢复
- **画布模块（Canvas / Circuit Manager）**
  - 负责将**已经完成的原型 JSON**渲染为可交互电路
  - 不感知 LLM 细节，只接收标准化的电路原型 JSON
- **系统文件层（system-components / data/projects 等）**
  - 由主进程负责读写，提供路径与数据给工作流引擎
  - LLM 仅获取到“名称列表”和“规范说明”，不直接访问文件系统

---

## 🧭 顶层工作流总览

### 阶段划分
1. **需求分析（Requirement Analysis）**
2. **元件生成与整理（Component Generation & Normalization）**
3. **结构化接线生成（Structured Connection Generation）**
4. **完整原型输出与渲染（Prototype Assembly & Rendering）**

### 控制流概览（高层伪代码）
```javascript
async function runCircuitDesignWorkflow(userRequirementText) {
  // 1. 需求分析阶段
  const analysisResult = await requirementStage.run(userRequirementText);
  if (analysisResult.status === 'terminated') return; // 用户选择手动补全，结束

  // 2. 元件生成与整理
  const componentStageResult = await componentStage.run(analysisResult);

  // 3. 结构化接线生成
  const wiringStageResult = await wiringStage.run(componentStageResult);

  // 4. 完整原型输出与渲染
  const prototype = await prototypeStage.run(wiringStageResult);

  // 交给画布模块渲染
  canvasManager.loadFromPrototype(prototype);
}
```

---

## ① 需求分析阶段（Requirement Analysis Stage）

> 本阶段是本次需求的重点：LLM 根据用户自然语言描述，推导出所需元件列表，然后与系统元件库进行**模糊匹配**，产出结构化匹配结果，并驱动“自动补全 / 手动补全”的分支。

### 1.1 输入
- **用户自然语言需求**
  - 文本：例如「我想做一个基于 ESP32C3 的低功耗蓝牙温湿度采集装置，支持电池供电和按键开关。」
- **系统参数（由工作流提供给 LLM）**
  - `componentNames`：来自 `system-components` 下 `standard` 与 `custom` 目录的**所有元件名称列表**
    - 仅传递必要字段（如 `displayName` / `componentName`），不传完整 JSON
  - `envInfo`：环境信息（开发 / 生产），仅用于提示 LLM 不要假设路径
  - `canvasSpec`：画布 JSON 结构的**简要说明**（供后续阶段使用）

> ⚠️ 注意：  
> - system-components 实际路径由主进程 / 设置决定，在 dev/prod 下不同，**路径本身不暴露给 LLM**，只将“可用元件名列表”作为参数传入。  
> - LLM 不需也不应知道实际磁盘结构，只关心“可以用哪些元件名”。

### 1.2 LLM 任务定义
- 从用户需求中推导“理论元件列表”（不含导线），例如：
  - 电池、电源管理模块、主控芯片、传感器、开关等
- 将每个理论元件与 `componentNames` 做**模糊匹配**：
  - 支持中英文匹配（如“温湿度传感器” ≈ `ctm-温湿度传感器dht22-124044`）
  - 支持关键字 / 同义词（如“MCU” ≈ “微控制器”）
  - 区分“库中有 / 库中无”

### 1.3 匹配结果 JSON 结构

#### 1.3.1 LLM 输出示例（抽象）
```json
{
  "components": [
    {
      "name": "电池",
      "matchedKey": "std-37v-602035锂电池-132510",
      "exists": 1
    },
    {
      "name": "esp32c3",
      "matchedKey": "std-esp32c3-supermi-114213",
      "exists": 1
    },
    {
      "name": "自锁开关",
      "matchedKey": null,
      "exists": 0
    }
  ],
  "summary": "共识别到3个核心元件，其中2个在系统元件库中已存在，1个缺失。"
}
```

#### 1.3.2 聊天气泡展示格式
- 在聊天区域回复气泡中渲染为类似表格 / 列表：
  - ✅ `电池` → 匹配 `std-37v-602035锂电池-132510`
  - ✅ `esp32c3` → 匹配 `std-esp32c3-supermi-114213`
  - ⚠️ `自锁开关` → 元件库中暂无匹配项
- 同时在隐藏字段中保留原始 JSON，供后续阶段直接使用。

### 1.4 缺失元件处理流程

#### 1.4.1 分支判断
- 若 `components` 中 **全部 `exists === 1`**：
  - 自动进入下一阶段（元件生成与整理）
- 若存在 `exists === 0` 的元件：
  - LLM 在消息中提示用户：
    - “检测到以下元件在系统元件库中不存在：[…]，请选择【自动补全】或【手动补全】。”
  - UI 提供两个按钮：
    - `自动补全`
    - `手动补全`

#### 1.4.2 自动补全分支
- 点击“自动补全”后：
  1. 工作流引擎调用**元件创建 API**：
     - 创建 `system-components/temp/` 目录（若不存在）
     - 为每个缺失元件生成一个 JSON 文件，例如：
       - `temp/temp-自锁开关-<timestamp>.json`
  2. JSON 结构遵循既有 system-components 规范：
     - 含基本元信息（名称、类别、引脚占位等）
     - 可使用默认外观与默认引脚布局，后续由用户完善
  3. 将新建的元件**追加到当前工作流上下文的可用元件列表**中
  4. 工作流更新 `components` 列表，将对应项 `exists` 标记为 `1`，并填入 `matchedKey`
  5. 在聊天区域追加一个系统消息：
     - “已为缺失元件自动创建占位元件，存放于 system-components/temp 目录。”
  6. 进入下一阶段。

> ⚠️ 路径与环境：
> - **开发环境**：`system-components` 位于项目目录 `./data/system-components/`  
> - **生产环境**：`system-components` 位于应用数据目录（如 `%AppData%/Fast Hardware/system-components`）  
> - 实际路径由主进程通过 IPC 传给渲染进程，作为**工作流参数**；LLM 不需要了解具体路径。

#### 1.4.3 手动补全分支
- 点击“手动补全”后：
  - 工作流引擎结束本次自动电路设计工作流，状态为 `terminated`。
  - 在聊天区域输出提示：
    - “已切换为手动补全模式，请先在元件库中创建或导入缺失元件，再重新发起电路设计需求。”

---

## ② 元件生成与整理阶段（Component Generation & Normalization）

> 在本阶段，LLM 不再重新分析需求，而是基于 **已确认的元件清单**，生成标准化的元件实例列表与初步属性建议。

### 2.1 输入
- 来自上一阶段的结果：
  - `components[]`：每项都包含 `name` / `matchedKey` / `exists: 1`
  - 可能还包含自动补全生成的 `temp` 元件
- 来自系统的额外参数：
  - `componentMetadataMap`：由工作流从 system-components 读取的元件摘要信息（不必传给 LLM 全量原始 JSON，可只传必要字段）

### 2.2 LLM 任务定义
- 为每个选定元件生成**实例级描述**：
  - 建议的类别 / 在系统中的角色（如“主控”、“传感器”、“电源”）
  - 是否为可选元件（如调试接口、状态指示灯）
  - 初步布局建议（左/右/上/下，相对关系级别的描述）
- 输出**中间结构 JSON**（不含具体坐标）：
```json
{
  "instances": [
    {
      "componentKey": "std-esp32c3-supermi-114213",
      "role": "主控",
      "optional": false
    },
    {
      "componentKey": "ctm-温湿度传感器dht22-124044",
      "role": "传感器",
      "optional": false
    }
  ]
}
```

### 2.3 工作流职责
- 校验所有 `componentKey` 均在系统元件库中存在
- 为每个 `instance` 分配：
  - `instanceId`
  - 默认尺寸、默认旋转角度
  - 归属的图层 / 分组（如“信号链”、“电源链”）
- 形成可供下一阶段使用的**实例列表结构**：
```ts
type NormalizedInstance = {
  instanceId: string;
  componentKey: string;
  role: string;
  optional: boolean;
};
```

---

## ③ 结构化接线生成阶段（Structured Connection Generation）

> 此阶段对应 `3-llm_prd.md` 中“结构化接线生成”部分，是 LLM 非常擅长的**结构化文本生成**任务。

### 3.1 输入
- `NormalizedInstance[]`：上一阶段标准化后的实例列表
- `pinInfoMap`：由工作流整理的引脚信息（从 system-components 读取）
- 可选上下文：用户偏好（如使用 I2C / UART / SPI 等）

### 3.2 LLM 任务定义
- 在给定 “可用引脚列表 + 功能要求” 的条件下：
  - 选择合适的接口方案（如 I2C / UART）
  - 生成**只包含逻辑连线的 JSON**：
```json
{
  "connections": [
    {
      "from": { "instanceId": "mcu1", "pin": "GPIO1" },
      "to":   { "instanceId": "sensor1", "pin": "SDA" },
      "signal": "I2C_SDA"
    }
  ]
}
```
- 不负责坐标 / 走线形状，只负责“谁连谁”。

### 3.3 工作流职责
- 校验：
  - 引脚是否存在
  - 是否出现短路 / 不合理多路复用（可先简单实现）
- 将连线结构转换为画布内部使用的**连线数据结构**：
```ts
type Wire = {
  id: string;
  fromInstanceId: string;
  fromPinId: string;
  toInstanceId: string;
  toPinId: string;
  netName?: string;
};
```

---

## ④ 完整原型输出与渲染阶段（Prototype Assembly & Rendering）

### 4.1 输入
- 来自阶段 2 的 `NormalizedInstance[]`
- 来自阶段 3 的 `Wire[]`
- 布局策略参数（可选）：如“紧凑布局 / 示意布局”

### 4.2 工作流职责
- 负责将实例 + 连线**组装成完整原型 JSON**，符合现有画布数据规范：
```ts
type CircuitPrototype = {
  components: Array<{
    instanceId: string;
    componentKey: string;
    x: number;
    y: number;
    rotation: number;
  }>;
  connections: Wire[];
  metadata: {
    createdBy: 'workflow';
    createdAt: string;
    requirementSummary: string;
  };
};
```
- 调用 `canvasManager.loadFromPrototype(prototype)`：
  - 清空当前画布
  - 渲染所有元件与连线
  - 同步到项目 JSON

### 4.3 LLM 参与程度
- 在本阶段，LLM **可选参与**：
  - 根据元件角色建议大致布局关系（如“电源在左、MCU在中、负载在右”）
  - 由工作流将这些“语义布局”映射到具体坐标
- 也可以完全由前端算法决定布局，LLM 不参与。

---

## 🔗 与 3-llm_prd.md 的关系

- `3-llm_prd.md` 侧重于：
  - LLM 服务封装（LLMService）
  - 对话管理器（ConversationManager / ChatManager）
  - 提示词工程、错误处理、性能优化
- `4-workflow_prd.md` 侧重于：
  - **跨模块工作流**拆分与阶段职责
  - 每个阶段的输入 / 输出数据结构
  - LLM 在各阶段的精确责任边界
- 两者合起来，定义了：
  - 从「聊天输入」→「LLM决策」→「工作流装配」→「画布渲染」的完整闭环。

---

## ✅ 本文档产出与后续实施建议

### 实施优先级
1. **先实现阶段 ① 需求分析阶段（本次需求）**
   - 实现系统元件名称收集与模糊匹配调用
   - 完成“自动补全 / 手动补全”流转
2. 分阶段迭代 ② ~ ④：
   - 先打通最小可用链路（简单布局 + 简单连线）
   - 再逐步增强布局算法与连线校验

### 对应代码落地点（建议）
- `scripts/chat.js` / `scripts/components.js`
  - 调用入口与 UI 按钮
- `scripts/workflow-circuit.js`（建议新增）
  - `runCircuitDesignWorkflow` 及四个 Stage 的实现
- 主进程
  - 提供 system-components 路径与元件列表 IPC 接口

本文档将作为**电路方案生成工作流**的唯一规范来源，所有实现应尽量与本文保持一致，若有出入需在 PRD 中同步更新。  

