---
name: scheme_design_skill
description: 电路/硬件类需求优先：方案骨架 + 可选 BOM 与系统元件库匹配；不自动创建或落盘元件 JSON。缺型号时可再调 completion_suggestion_skill；需外证时调 web_search_exa。
keywords: [方案设计, 电路方案, 硬件方案, BOM, 元件选型, 元件匹配, 缺件, 系统架构, 模块搭配, 需求分析]
metadata:
  fasthardware:
    skillId: scheme_design_skill
    engineOps:
      - runSchemeDesign
      - runRequirementAnalysis
---

# Scheme Design（方案设计 + BOM/库匹配）

串联 **`runSchemeDesign`** 与可选 **`runRequirementAnalysis`**：输出方案摘要、估算参数、**与当前元件库的匹配结果**（`matchedKey` / `exists`）及缺件时的**文字建议**。**不**自动生成或写入元件 JSON 文件。

## 何时调用

- **优先**：用户描述**电路/系统/模块级**需求，需要**对齐内置库**、缺件提示与方案叙述时。
- **之后**：缺具体采购型号 → **`completion_suggestion_skill`**；需实时网页/数据手册线索 → **`web_search_exa`**。

## 与 Agent Loop 的配合

| 要点 | 说明 |
|------|------|
| **精确名** | `skillName` 必须为 **`scheme_design_skill`**。 |
| **输入核心** | **`userRequirement`**（必填）；可将前序 tool 摘要放入 **`additionalContextFromAgent`**。 |
| **BOM 开关** | **`runBomAnalysis`** 默认 `true`；仅需方案骨架、跳过库匹配时设 **`false`**。 |
| **失败与重试** | `runSchemeDesign` 或 `runRequirementAnalysis` 抛错时返回 **`success: false`** 与可读 **`error`**；下一轮应缩小范围、改述需求或换工具，而非重复同一长文（对齐 `reference/Agent-Loop-Core.md` 错误处理思路）。 |
| **状态** | 返回中可含 **`skillState`**（阶段/中间态），供后续轮次引用。 |

## 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| **`userRequirement`** | string | 用户原始需求（必填）。 |
| **`additionalContextFromAgent`** | string | 可选；前序 **`web_search_exa`** 等摘录，拼入方案 LLM。 |
| **`runBomAnalysis`** | boolean | 默认 `true`；`false` 时跳过库匹配/BOM 分析段。 |

## 返回要点

- **`schemeDesignResult`**：摘要、叙述、估算参数、`webSearchQueries` 等（引擎内可再拉 Exa，与 agent 侧检索互补）。
- **`analysisResult`**：`runBomAnalysis:false` 时为 `null`；否则含 **`components[]`**、**`summary`**。
- 库内 **`exists: 0`** 时以 **`recommendation`** 为**文本建议**，不自动落盘元件。

## Tips

- System prompt 中宜强调：首轮需要工具时只输出 **`tool_calls`**，勿用 **`final_message`** 抢答（与主进程 loop 一致）。
- 复杂需求可在一轮内先本 skill，再 **`completion_suggestion_skill`** 填型号。
- 第三层实现参考：`examples/implementation-reference.js`。
