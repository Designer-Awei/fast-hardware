# Fast Hardware - Skills 驱动的 LLM 工作流 PRD（3-skills_prd）

## 📌 文档定位
本文件是 Fast Hardware 的 LLM「技能（skills）机制」唯一规范，目标是把现有“固定按钮/固定阶段”的 workflow 改造成类似 Cursor/OpenClaw 的模式：
- 由 LLM 在每一轮自主决定需要调用哪些 skills
- 工作流引擎执行 tools/skills，并把可观测进度回传给 UI（类似 Cursor 的步骤化进度）

本文件替代：
- `feature-prd/3-llm_prd.md`
- `feature-prd/4-workflow_prd.md`

> 说明：本项目当前仍保留画布（Canvas）、元件库（system-components）等既有数据模型；skills 只负责“分析/决策 + 受控工具调用 + 校验与失败回退”，不要求 LLM 直接读写磁盘或操作 DOM。

### 架构演进（相对「按钮 workflow」）
- **历史**：曾采用 **UI 按钮分阶段** 驱动固定 workflow（多段气泡 + 用户点击推进）。
- **当前（自 v0.2.4 起，详见 `0-Change-Log.md`「工作流展示」）**：已统一为 **skill 驱动的 agent loop**——用户发送自然语言后，由 LLM 输出结构化 JSON（`tool_calls` / `final_message`），编排器按序执行 skills 并回填结果多轮推理；**不再依赖**按钮链路决定阶段。画布侧 `CircuitSkillsEngine` 仍提供能力，但由 agent 按需调用而非固定脚本。

### `web_search_exa` 何时调用（非默认必调）
- **不是**每条用户消息都必须调用；**全量挂载**工具列表仅为避免漏选，不代表每次都要用检索。
- **典型必用**：问题依赖 **实时或可验证外部知识**（天气、价格、现货、新闻、他人经验、最新资料等）；产品侧可用 `needsWebSearchPriority` 等规则对子类场景 **强制先检索**。
- **复杂任务建议**：若缺公开依据或需 **佐证与上下文补充**，宜调用 `web_search_exa`，再与 `scheme_design_skill`（BOM/库匹配）、`completion_suggestion_skill`（模糊器件→具体模块名）等 **按需组合**；**不**自动落盘生成元件 JSON，缺件由用户手动入库后再用 `wiring_edit_skill` 改连线。

---

## 🎯 目标与关键约束

### 0) 第一准则：渐进式披露（Progressive Disclosure）
> **落地规划（OpenClaw 式目录 + 主进程发现/执行）**：见同目录 **[`4-agent-loop_prd.md`](4-agent-loop_prd.md)**（现状目录、`skill-module-loader`、主进程 Agent loop、IPC 与待办分层披露）。

**含义**：向 Agent（LLM）只披露**决策所需**的信息；**实现细节、调试日志、与 UI/IPC 绑定的代码**不得进入模型上下文。  
**目的**：保证 **行动效率** 与 **调用成功率**：
- **描述层可控**：每条 skill 的 `description` + **精简** `inputSchema`/`outputSchema` 即可；避免把长篇实现说明塞进 prompt。
- **实现与契约分离**：契约在 `skills/skills/<skillId>/index.js` 的 `getManifest()`，执行在同文件 `execute()`，**人读长文**在同级 `SKILL.md`，避免把实现细节塞进模型上下文。

**与「全量挂载工具列表」的关系（当前产品策略）**：在 skill 数量预期 **小于约 100** 的前提下，**不做按场景拆类**：`listSkillsForLLM()` **一次性挂载全部**可用 skills，避免复杂跨域任务时模型**漏选**某工具；token 压力主要靠「每条描述短、schema 精简」控制，而非隐藏部分工具。

### 1) 目标
1. 让用户在 UI 中看到类似 Cursor 的过程进度：
   - reasoning（步骤化摘要，不暴露 raw chain-of-thought）
   - 正在调用哪些 skills / tools
   - tool 结果摘要（成功/失败原因）
2. 提高灵活性：
   - 不再依赖“多条消息 + 多个按钮”的固定链路
   - 改为由 LLM 自主选择技能调用路径
3. 可靠性（降级策略）：
   - **已移除**自动元件 JSON 生成链路；选型以 `completion_suggestion_skill` + 用户手动画库为主
   - 连线变更仅通过 `wiring_edit_skill`（增删连接），降低错误落盘风险

### 2) 约束
- LLM 与工具调用之间必须保持明确协议（结构化 JSON）
- skill 内需要轻量校验，但避免复杂提示词造成系统性漂移（校验失败应通过 retry 修正，而不是把提示词写得过重）
- UI 层只负责展示，不负责决定“该执行哪个 skill”

---

## 🧩 Skill 机制：核心概念
### 1) Skill Registry（技能注册表）
技能以“语义 + schema +（可选）执行器引用”形式被注册；**向 LLM 暴露**的信息应遵循 **渐进式披露**，通常只包含：
- `name`
- `description`（短而可执行：何时调用、关键参数语义、硬约束如 `skillName` 精确字符串）
- `inputSchema` / `outputSchema`（**够用即可**：字段宜少、描述宜短；复杂校验放在执行器内）

Registry **不**应向模型暴露：实现源码、内部重试日志、与 UI/IPC 绑定的细节。

#### 当前代码落点（实现状态一览）
| 能力 | `name` | 契约（manifest） | 可复用 execute | 运行时执行路径 |
|------|--------|------------------|----------------|----------------|
| 联网检索 | `web_search_exa` | `skills/skills/web_search_exa/SKILL.md` + `index.js` | `index.js` 的 `execute` | **主进程** `executeSkillInMain`；渲染侧 `chat.js` 的 `invoke('execute-skill')` 等为 IPC 入口 |
| 方案设计（含 BOM，仅参考） | `scheme_design_skill` | `skills/skills/scheme_design_skill/` | 同上 | 同上 |
| 补全建议（型号文本） | `completion_suggestion_skill` | `skills/skills/completion_suggestion_skill/` | 同上 | 同上 |
| 摘要（检索结果/长文/URL） | `summarize_skill` | `skills/skills/summarize_skill/` | 同上 | 同上 |
| 连线编辑 | `wiring_edit_skill` | `skills/skills/wiring_edit_skill/` | 同上 | 同上 |

**目录约定（已落地）**：
- `skills/skills/<skillId>/`：单 skill 包 — `SKILL.md`（分层披露）、`index.js`（导出 `NAME`、`getManifest()`、`execute(args, ctx)`）、可选 `examples/`（第三层参考资料）。
- `skills/index.js`：维护 `SKILL_NAMES`、`SKILL_MODULES`、`getSkillDefinitions()`、**`listSkillsForLLM()`**；顶部 JSDoc 定义 `WorkflowSkillContext`、`JsonSchema`、`SkillDefinition`（各 skill 用 `import('../../index').…` 引用）。
- 若需直接调用单个 `execute` 包装，请用 `skills/index.js` 上的 `schemeDesignSkill` 等别名。
- **技术债（短描述双源）**：向 LLM 注入的 **name + 短 description** 来自主进程 **`scripts/agent/skills-agent-shared.js` 的 `getSkillsForAgentList()`**；渲染进程 **`scripts/chat.js` 的 `getSkillsForAgent()`** 为同源手写副本（部分聊天/辅助流程仍会读取）。两者需与 **`listSkillsForLLM()`** 所涉 skill **集**一致。消除方式：**preload 注入**、或实现架构文档中的 **`skills:list-summaries` IPC**。

#### 新增一条 Skill 的推荐流程（按当前仓库）
1. **新建** `skills/skills/<skillId>/`：编写 `SKILL.md` + `index.js`（`NAME`、`getManifest()`、`execute()`）；可选 `examples/`。
2. **注册**：`skill-module-loader.js` 自动扫描子目录 `index.js`，一般**无需**改 `skills/index.js`（动态 `SKILL_MODULES`）；若需稳定枚举键，可在 `LEGACY_ENUM_KEYS` 等处补充。
3. **渲染层**：在 `scripts/chat.js` 的 `executeSkill`、**`getSkillsForAgent()`**、以及与进度展示相关的 `getSkillChainShortName` 等处补齐**分支与文案**，并与 **`getSkillsForAgentList()`** 对齐。
4. **测试**：`test-cases/live-skills-agent-loop-siliconflow.js`（主进程 Agent loop）；单 skill 真测如 `live-skill-scheme-design-siliconflow.js`、`live-skill-completion-suggestion-siliconflow.js`、`live-skill-wiring-edit-siliconflow.js` 等（以仓库 `test-cases/` 现有文件为准）。

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

#### 复杂场景下：当前 Agent Loop 实际行为（`scripts/agent/skills-agent-loop.js`，主进程）
每一轮 **迭代**（默认最多 **`maxIterations`**：**默认 15**，可用环境变量 **`FH_SKILLS_AGENT_MAX_ITERATIONS`** 覆盖为 **1～40**）顺序为：

1. **组装 prompt（user 单条大消息）**：包含 `systemPrompt`、**`getSkillsForAgentList()`** 提供的 **name + description**（`buildSkillsAgentUserPrompt`）、`chatHistory`（默认可空）、**累积的 `toolResults` 全文**（每次 tool 的 `skillName/args/result` JSON）、原始 **`userMessage`**，以及由 **`needsWebSearchPriority`** 等决定的联网优先级提示。
2. **调用 LLM** → 解析严格 JSON：`reasoning_steps`、`tool_calls`、`final_message`。
3. **分支**：
   - 若 **仅有非空 `final_message` 且无 `tool_calls`** → 成功结束，返回该回复。
   - 若 **有 `tool_calls`**（即使同时写了 `final_message`，也 **优先执行工具**）→ 按数组 **顺序同步执行** 每个 skill（**`executeSkillInMain(webContents, { skillName, args, ctxPayload })`**），把每次的返回对象压入 **`toolResults` 数组**；然后 **无条件进入下一轮迭代**（再次调用 LLM），把更新后的 `toolResults` 整包塞回 prompt。
   - 若两者皆无 → 失败返回。
4. **超过 `maxIterations` 仍无「仅 final、无 tool」的结束态** → 返回失败（如「达到最大迭代次数仍未获得 final_message」）。

因此：**「资料不足 / 工具报错 / 需换参数重试」** 的处理方式是：模型在 **下一轮** 看到完整的 `toolResults`（含 `success: false`、`error`、或检索结果条数少），应再输出 **新的 `tool_calls`**（例如换 `query` 再 `web_search_exa`，或换 skill），而不是过早输出敷衍的 `final_message`。Orchestrator **不会**自动替模型重试同一 tool；**是否重试、如何调整参数，由 LLM 在下一轮 JSON 里决定**。

> 说明：`reasoningAndToolsHistory` 参数预留了「跨轮 reasoning 摘要」通道，但 **当前主进程 loop 内部不会自动把上一轮的 `reasoning_steps` 写入该数组**；跨轮上下文主要依赖 **`toolResults` 累积**。若需更强「计划记忆」，可由调用方在循环外维护并传入 `reasoningAndToolsHistory`，或后续在 `skills-agent-loop` 内追加写入。

#### 复杂场景下的业界常见最佳实践（推荐对齐）
1. **工具结果结构化**：`success` / `error` / `data` 字段稳定；失败时 `error` **简短可读**，便于模型改策略。
2. **提示词约束**：明确写清——若工具失败或结果不足以回答用户，**禁止**输出最终答复，应继续输出 `tool_calls`；仅在确信充分时给 `final_message`。
3. **Skill 内重试 vs Agent 层重试**：**幂等、低成本**的修复（如网络抖动、格式重试）宜放在 **skill 内部**；**策略性**更换查询词、换数据源、换 skill，交给 **Agent 多轮**。
4. **`maxIterations` 与成本**：复杂链路预留足够轮次（或动态上限），并可在 UI 提示用户缩小问题范围。
5. **（进阶）子任务 / 子 Agent**：极复杂时可把「只负责调检索」与「只负责写总结」拆层，避免单轮 JSON 过载；属架构升级，非当前最小 loop 必需。

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

## ⚙️ 当前第一阶段 Skill 列表（已落地，仍扩展中）
1. `web_search_exa` — 联网检索；与实时/事实类问题优先策略配合。
2. `scheme_design_skill` — 方案 + BOM/库匹配；**不**自动创建元件；可 `runBomAnalysis:false` 仅文字方案。
3. `completion_suggestion_skill` — 模糊描述 → 可采购模块级型号建议；可配合检索。
4. `summarize_skill` — 对检索结果、长文或 URL 做结构化摘要；常与 `web_search_exa` 组合。
5. `wiring_edit_skill` — 基于画布快照与规则生成 **仅连线** 的增删计划并可应用。
6. `firmware_codegen_skill` — 基于用户需求与现有代码上下文生成可审阅的补丁建议（`patchPlan` + `patch` + `notes`），默认不直接落盘。

> **降级说明**：已移除自动元件 JSON 生成与全画布编辑 skill，以降低错误落盘与架构复杂度。

### 后续 Skill 规划（轻触版）
> 本节只定义方向与边界，详细输入输出 schema 在落地前单列子 PRD。

#### A. `canvas_wiring_assist_skill`（画布连线辅助，计划中）
- **功能简述**
  - 面向“已有部分元件的画布”做连线辅助：先读画布快照和已有连线，再给出可执行连线计划。
  - 当发现缺元件/缺引脚信息时，先对**可连的 pin**输出可执行部分，再输出“缺口说明 + 补件建议”。
- **能力边界**
  - 不自动创建新元件（仍由用户确认后入库/放置）。
  - 不直接覆盖整图；仅输出增量连线操作（add/remove/replace plan）。
  - 缺失条件下允许“部分成功”，必须返回结构化 `missingParts` / `blockedPins` 说明。
- **与现有 skill 关系**
  - 可复用 `wiring_edit_skill` 的操作结构与应用通道；前置常见组合：`scheme_design_skill` → `completion_suggestion_skill` → `canvas_wiring_assist_skill`。

#### B. `firmware_codegen_skill`（固件代码生成，已进入可用阶段）
- **功能简述**
  - 根据方案、选型与连线结果，生成“可读可改”的固件骨架与模块化代码片段（驱动初始化、主循环、关键任务骨架）。
  - 输出编译前置条件（依赖库、板卡、引脚映射、配置项）。
- **能力边界**
  - 默认不承诺“一次可编译通过”的完整工程；以骨架与关键片段为主。
  - 不直接改写用户全部代码仓；以补丁建议/文件片段为主，需用户确认再落盘。
  - 对外部闭源 SDK 或未知硬件抽象层，仅给适配位点与 TODO，不伪造可运行细节。
- **与现有 skill 关系**
  - 依赖上游结构化输入：方案/BOM/连线（未来可由 CLI 能力提供统一读写接口）。

#### C. 触发策略（规划）
- 默认短答；满足以下任一条件再进入深度编排：
  1) 用户显式口令（如“生成方案编排”）；
  2) 命中实时检索/复杂选型判定；
  3) 用户明确要求“按画布连线”或“给固件实现骨架”。
- 若未进入深度编排且用户已有明确需求，短答末尾追加引导语（进入 skills 编排口令）。

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
### 1) Live
- `test-cases/live-skills-agent-loop-siliconflow.js`：主进程多轮 Agent loop + SiliconFlow。
- `test-cases/live-skill-*.js`：单 skill 与模型链路的集成/冒烟（以目录下文件为准）。
- `test-cases/benchmark-enable-thinking-skill.js` 等：能力与开关相关基准（若有）。

### 2) 断言要点
- **tool 进度**：`skills-agent-loop-progress` / 总线侧可观测。
- **`wiring_edit_skill`**：无画布引擎时可通过 mock/stub 或 `applyToCanvas:false` 路径验证计划结构。

---

### 人类实践非线性 vs Agent Loop 如何定序？
硬件设计常见路径是：**粗方案 → 复用库内型号 → 补全缺件 → 拓扑/连线 → 中途增删改画布**，且各步可能回环。对应到本项目的 **业务 agent loop** 建议：
- **不**在编排器里写死「必须先 A 再 B」的 DAG；由 **LLM 在每轮** 根据 `toolResults` 与用户需求自主选择下一 `tool_calls`（全量挂载 skills + 短描述）。
- **状态落点**：`CircuitSkillsEngine.currentSkillState` 携带 `schemeDesignResult`、`analysisResult`、`completionSuggestions`、`wiringEditPlan` 等。
- **收敛手段**：`maxIterations` 上限、失败时返回结构化 `error` 让模型改参数或换 skill。
- **产品侧可选增强**：在 system prompt 中给「推荐顺序」作为 *软提示* 而非硬编码；对简单模式可在 UI 层提供「一键跑推荐链」模板（仍映射为多轮 tool_calls）。

---

## 🧱 实施里程碑（相对本 PRD 初稿 — 更新）
1. ~~主进程 Agent loop + 全量内置 skills 包~~ → **已**：`skills-agent-loop.js`、`skills/skills/<id>/`、`listSkillsForLLM()`。
2. **进行中 / 待办**：SKILL.md **分层按需注入**（见 `4-agent-loop_prd.md`）；**单源**短描述（消除 `getSkillsForAgent` 双写）。
3. `CircuitSkillsEngine` 与 **连线 / 方案**类 skill 持续对齐；用户手动画布 + agent 按需改连线。

---

## 📚 相关实现落点（当前代码可复用）
- `skills/index.js`：`SKILL_MODULES`、`listSkillsForLLM()`、`LEGACY_ENUM_KEYS`（含 `summarize_skill`）
- `skills/skill-module-loader.js`：扫描 `skills/skills` 加载各包
- `scripts/agent/skills-agent-shared.js`：**`getSkillsForAgentList()`**、**`buildSkillsAgentUserPrompt`**、`needsWebSearchPriority` 等
- `scripts/agent/skills-agent-loop.js`：主进程 Agent loop（JSON → tool_calls → **`executeSkillInMain`** → 回填；**`maxIterations`** 默认 15）
- `scripts/skills/main-skill-executor.js`：**`executeSkillInMain`**
- `scripts/agent/skills-agent-loop-abort.js` + `skills-agent-loop-abort` IPC：中断多轮循环
- `scripts/circuit-skills-engine.js`：画布侧 `CircuitSkillsEngine` 核心逻辑
- `main.js`、`preload.js`、`scripts/chat.js`：`run-skills-agent-loop` / `execute-skill`、UI 进度与打字
- `test-cases/live-skills-agent-loop-siliconflow.js`、`test-cases/live-skill-*-siliconflow.js`：真测入口（以目录为准）

