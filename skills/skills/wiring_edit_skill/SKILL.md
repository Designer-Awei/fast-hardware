---
name: wiring_edit_skill
description: 基于当前画布 JSON 与连线意图生成仅含连线的增删计划（add_connection/remove_connection）；可选应用到画布。不增删元件、不移动元件。
keywords: [连线, 接线, 改线, 断开, 增加连接, 删除连接, 引脚, 画布改线, 拓扑调整, wiring]
metadata:
  fasthardware:
    skillId: wiring_edit_skill
    engineOps:
      - runWiringEditPlan
      - applyWiringEditOperations
---

# Wiring Edit（连线编辑）

根据**画布快照**与**连线规则/自然语言指令**，由引擎内 LLM 生成 **`rationale` + `plannedOperations`**；可选 **`applyToCanvas`** 将计划应用到画布。仅允许 **`add_connection`** / **`remove_connection`**；**`instanceId` / `pinId` 须对应已有元件**。

## 何时调用

- **不必先跑方案设计**：用户拖好元件、用自然语言说明如何连接 → 可直接调用（`wiringRules` 写清）。
- 若此前跑过 **`scheme_design_skill`**，引擎**可能**附带 BOM 参考；**没有或忽略也可**。
- 纯改线、拓扑调整：画布上已有相关元件即可。

## 与 Agent Loop 的配合

| 要点 | 说明 |
|------|------|
| **精确名** | `skillName` 必须为 **`wiring_edit_skill`**。 |
| **画布** | 可传 **`canvasSnapshot`**；省略时由引擎 **`getCanvasSnapshotForSkill`** 读取当前画布。 |
| **跳过 LLM** | **`skipLlmPlan: true`** 且提供 **`plannedOperations`** 时，可直接应用或返回（用于代理已解析好的操作列表）。 |
| **失败** | 引擎方法不可用或规则为空时 **`success: false`**；下一轮应检查画布是否为空或规则是否清晰。 |
| **批处理** | 可与其它 skill 同轮出现；注意 **`maxIterations`** 与主进程超时。 |

## 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| **`wiringRules`** | string | 连线规则或指令（必填）。 |
| **`expectedComponentsFromAgent`** | string | 可选；留空时若引擎内存在前序 **scheme_design** 状态，会**自动注入** BOM 摘要（仍仅作参考，不要求画布与方案逐项一致）。 |
| **`canvasSnapshot`** | object | 可选；画布 JSON。 |
| **`additionalContextFromAgent`** | string | 可选补充。 |
| **`applyToCanvas`** | boolean | 默认 `true`；仅要方案/理由时设 `false`。 |
| **`skipLlmPlan`** | boolean | `true` 时跳过 LLM，需配合 **`plannedOperations`**。 |
| **`plannedOperations`** | array | `skipLlmPlan` 时由代理直接提供的操作列表。 |

## Tips

- 大规模改线可先 **`applyToCanvas: false`** 审阅计划再人工或第二轮应用。
- 第三层实现参考：`examples/implementation-reference.js`。
