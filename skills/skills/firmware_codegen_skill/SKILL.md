---
name: firmware_codegen_skill
description: 基于需求与现有固件代码生成可审阅的补丁计划（patchPlan + patch + notes），默认不直接落盘。
keywords: [固件, 代码生成, 代码编辑, patch, arduino, esp32, stm32]
metadata:
  fasthardware:
    skillId: firmware_codegen_skill
    engineOps:
      - runFirmwareCodePatch
---

# Firmware Codegen（固件代码编辑）

根据用户需求与当前代码上下文，生成**可审阅、可落地**的代码修改建议。输出包含：

- `summary`：本次修改目标
- `patchPlan[]`：结构化改动步骤
- `patch`：统一 diff 文本（用于预览）
- `notes[]`：依赖、风险、验证建议

默认仅输出建议，不强制写文件。

## 何时调用

- 用户明确提出“改代码/补代码/加功能/修固件”需求时。
- **不要求**必须先做方案设计；以**当前画布 + 需求描述**为主即可生成补丁（有前序方案时可能多一段参考文本，可无视）。
- 已有项目代码，做增量修改时同样适用。

## 与 Agent Loop 的配合

| 要点 | 说明 |
|------|------|
| **精确名** | `skillName` 必须为 **`firmware_codegen_skill`**。 |
| **代码输入** | `codeText` 可选；为空时基于通用模板输出骨架级 patch。 |
| **落盘策略** | 默认不落盘（仅返回 patch 建议），由上层确认后再写入。 |
| **失败** | 引擎不可用/需求为空时返回 `success: false`。 |
| **画布** | 执行前引擎读取**当前项目画布**（`getCanvasSnapshotForSkill` 或入参 `canvasSnapshot`），并做结构预判。 |

## 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| **`userRequirement`** | string | 固件改动目标（必填）。 |
| **`codeText`** | string | 当前代码全文（可选）。 |
| **`targetPath`** | string | 目标文件路径（可选，仅用于标识）。 |
| **`language`** | string | 代码语言标识（可选，默认 `arduino`）。 |
| **`additionalContextFromAgent`** | string | 可选补充上下文。 |
| **`canvasSnapshot`** | object | 可选；省略时由引擎拉取当前画布 JSON。 |

## 输出补充

- **`canvasAnalysis`**：含 **`readiness`** 与 **`gapKind`**：`missing_parts`（缺元件/空板）、`missing_wiring`（缺连线）、`ready`、`snapshot_error`。
- **`canvasGuidance`**：**`phase`**、**`gapKind`**、**`userFacingHint`**、**`pinBindings`**（`gapKind=ready` 时）、**`recommendedNextSkills`**（缺连线时优先 **`wiring_edit_skill`**；缺件时 **`scheme_design_skill`** / **`completion_suggestion_skill`**）。

## Tips

- 先让本 skill 生成补丁建议，再由 CLI 的 `firmware:patch` 或 UI 二次确认写入，可降低误改风险。
- 画布空或连线未就绪时模型会偏**保守/骨架** patch，并提示先补画布；主 agent 可接着编排 `wiring_edit_skill`。
