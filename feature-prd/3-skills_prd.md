# Fast Hardware - Skills 驱动的 LLM 工作流 PRD（3-skills_prd）

## 📌 文档定位
本文件是 Fast Hardware 的 LLM「技能（skills）机制」唯一规范，目标是把现有“固定按钮/固定阶段”的 workflow 改造成类似 Cursor/OpenClaw 的模式：
- 由 LLM 在每一轮自主决定需要调用哪些 skills
- 工作流引擎执行 tools/skills，并把可观测进度回传给 UI（类似 Cursor 的步骤化进度）

本文件替代：
- `feature-prd/3-llm_prd.md`
- `feature-prd/4-workflow_prd.md`

> 说明：本项目当前仍保留画布（Canvas）、元件库（system-components）等既有数据模型；skills 只负责“分析/决策 + 受控工具调用 + 校验与失败回退”，不要求 LLM 直接读写磁盘或操作 DOM。

---

## 🎯 目标与关键约束
### 1) 目标
1. 让用户在 UI 中看到类似 Cursor 的过程进度：
   - reasoning（步骤化摘要，不暴露 raw chain-of-thought）
   - 正在调用哪些 skills / tools
   - tool 结果摘要（成功/失败原因）
2. 提高灵活性：
   - 不再依赖“多条消息 + 多个按钮”的固定链路
   - 改为由 LLM 自主选择技能调用路径
3. 可靠性：
   - `component_autocomplete_validated` 这类高风险 skill 内部必须内置“生成-校验-重试（最多 3 次）”
   - 仍失败则不强制落盘，而是返回 failed 给 UI，引导用户手动补全

### 2) 约束
- LLM 与工具调用之间必须保持明确协议（结构化 JSON）
- skill 内需要轻量校验，但避免复杂提示词造成系统性漂移（校验失败应通过 retry 修正，而不是把提示词写得过重）
- UI 层只负责展示，不负责决定“该执行哪个 skill”

---

## 🧩 Skill 机制：核心概念
### 1) Skill Registry（技能注册表）
技能以“语义 + schema + 执行器”形式被注册，向 LLM 暴露以下信息：
- name
- description
- inputSchema / outputSchema（用于 LLM 输出结构正确与解析稳定）
- 执行条件（例如需要联网、需要访问元件库等）

Registry 不暴露实现细节，只提供模型可理解的接口契约。

### 2) Skill Orchestrator（技能执行编排器）
Orchestrator 每次用户消息触发一次 agentic loop：
1. 构建 `availableSkills` 列表并注入到 LLM prompt
2. 让 LLM 输出：
   - `reasoning_steps[]`（步骤化摘要）
   - `tool_calls[]`（LLM 自主选择要调用的 skill）
   - `final_message`（若完成则输出；否则为空或 null）
3. Orchestrator 逐个执行 `tool_calls`
4. 每执行一个 skill，向 UI 推送进度事件：
   - tool_start / tool_end / tool_error
5. 将 tool 结果回填到下一轮 LLM 决策，直到得到 final_message 或达到循环上限

---

## 🧠 LLM 与 Skill 调用协议
Orchestrator 每轮强制 LLM 用严格 JSON 输出，建议结构如下：
```json
{
  "reasoning_steps": [
    { "step": 1, "summary": "..." }
  ],
  "tool_calls": [
    { "skillName": "web_search_exa", "args": { "query": "...", "numResults": 3, "type": "fast" } }
  ],
  "final_message": "可选：完成时输出的用户可见文案"
}
```

要点：
- `final_message` 非空表示完成
- `tool_calls` 为空表示不需要工具（只要能直接回答也可以，但对 workflow 任务通常仍需要工具）
- `reasoning_steps` 只做步骤化摘要展示，不暴露 raw chain-of-thought

---

## ⚙️ 计划中第一阶段 Skill 列表（最小可用）
为快速达成当前项目能力，建议先实现下面几类 skill：

1. `web_search_exa`
   - 作用：联网检索参考资料/引脚证据
2. `scheme_design_skill`
   - 作用：把用户需求转为方案叙述与 estimatedParams，并产出供后续阶段使用的中间态
3. `requirement_analysis_skill`
   - 作用：从方案中抽取理论元件并与系统元件库做模糊匹配（产出 exists/matchedKey）
4. `component_autocomplete_validated_skill`
   - 作用：对 missingComponents 做“生成-校验-重试（最多 3 次）”
   - 失败则返回 failed 给 UI，并提供失败原因摘要
5. `structured_wiring_skill`
   - 作用：生成连线 JSON（先最小功能占位，后续再加强）

> 实施建议：`component_autocomplete_validated_skill` 是最难的部分，但它已经在 `scripts/workflow-circuit.js` 中有生成-校验-重试的雏形，可在 skills 化时复用并抽到更通用的 core。

---

## 🖥️ UI 交互：Cursor 风格可观测进度
### 1) UI 展示内容（建议）
在每次 orchestrator loop 中，UI 渲染：
- “步骤摘要”：来自 `reasoning_steps` 的列表
- “工具/技能调用进度”：
  - 正在调用：`tool_start`
  - 完成：`tool_end`（展示结果摘要）
  - 失败：`tool_error`（展示 failureReason）

### 2) UI 不再依赖的内容（本 PRD 的明确要求）
- 不再生成“带按钮的多段 workflow 气泡”
- 不再依赖 `bindSchemeDesignButtons` / `workflow-start-match` / `workflow-auto-complete` 等 UI 按钮链路

UI 在失败时的兜底策略是：
- 显示失败提示，并建议用户在元件库页面手动查询/补全引脚参数
- 对成功部分继续推进后续 skills

---

## 🧪 测试用例策略
### 1) 调整 live-workflow-chain-real-apis.js 的断言
不再要求所有 missingComponents 必须全部 created 成功。改为：
- 允许部分 missingComponents 返回 `failed`
- 只要 orchestrator loop 正常完成（并输出结构化结果/消息），视为通过

### 2) 新增断言要点
- tool_calls 的执行顺序正确
- 每个 tool 的进度事件会在 UI 层被触发（或在测试中被记录）
- 失败的 component_autocomplete_validated_skill 会返回合理 failureReason

---

## 🧱 实施里程碑（建议按顺序）
1. Orchestrator + 两个 skills：`web_search_exa`、`component_autocomplete_validated_skill`
2. 把 `scheme_design`、`requirement_analysis` 也引入 skills 化路径
3. 逐步移除 UI 按钮链路，改为 orchestrator 单次 loop 驱动整段流程
4. 最终统一测试用例与 PRD 中协议结构

---

## 📚 相关实现落点（当前代码可复用）
- `scripts/workflow-circuit.js`：现有实现包含生成/分析/补全能力核心逻辑
- `main.js + preload.js + scripts/chat.js`：负责 LLM 调用、IPC、UI 显示与进度渲染
- `test-cases/live-workflow-chain-real-apis.js`：用于真实 API 的端到端验证

