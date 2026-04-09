---
name: completion_suggestion_skill
description: 将模糊器件描述转为可采购的模块级型号/常见商品名文本建议；仅文本，不生成元件 JSON、不落盘。可与 web_search_exa、scheme_design_skill 配合。
keywords: [型号补全, 具体型号, 可采购, 模块推荐, 缺少型号, 模糊器件, 替代型号, 推荐模块, 商品名, 选型补充]
metadata:
  fasthardware:
    skillId: completion_suggestion_skill
    engineOp: runCompletionSuggestions
---

# Completion Suggestion（补全建议）

针对「声音传感器、舵机、充电模块」等**模糊描述**，输出**具体模块型号或常见模块名**（如 KY-038、SG90、TP4056 模块）；**不**自动创建元件文件。

## 何时调用

- BOM/方案中已列出**类型**但缺**可采购型号**时。
- 与 **`scheme_design_skill`** 衔接：对 **`exists: 0`** 或宽泛名称做型号级补全。
- 可先 **`web_search_exa`**，将摘要写入 **`additionalContextFromAgent`**。

## 与 Agent Loop 的配合

| 要点 | 说明 |
|------|------|
| **精确名** | `skillName` 必须为 **`completion_suggestion_skill`**。 |
| **必填** | **`userRequirement`** + **`missingDescriptions`**（数组或分隔字符串）。 |
| **失败** | 缺参或引擎不可用时返回 **`success: false`**；模型应补全参数后再调，避免空转（参见 `reference/Agent-Loop-Core.md` 工具参数验证思想）。 |
| **输出用途** | 仅作文本建议；是否采纳由用户与后续流程决定。 |

## 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| **`userRequirement`** | string | 整体需求语境（必填）。 |
| **`missingDescriptions`** | array \| string | 缺失/模糊器件列表（必填）。 |
| **`additionalContextFromAgent`** | string | 可选；前序检索或方案摘录。 |

## Tips

- **`missingDescriptions`** 尽量拆成**可独立补全**的条目，利于结构化建议。
- 不要与「自动生成元件 JSON」混淆；本 skill **不**落盘。
- 第三层实现参考：`examples/implementation-reference.js`。
