# Fast Hardware — Agent Loop 与主进程 Skills 编排（PRD 4）

> 对应文件名：`4-agent-loop_prd.md`。说明主进程多轮编排、`runSkillsAgentLoop`、IPC 与 `skills/skills` 目录边界（原「OpenClaw 式」单 skill 一目录的落点）。

## 1. 边界（非术语版）

| 层级 | 做什么 | 不做什么 |
|------|--------|----------|
| **渲染进程（页面）** | 气泡、打字、进度；把用户消息与画布快照交给主进程；**订阅** `skills-agent-loop-progress` 等事件刷新 UI | 不 `require` 业务 skill；不把多轮编排与 tool 执行留在浏览器侧 |
| **Node 主进程** | **加载** `skills/skills/<skillId>/index.js`、**执行** `execute`；需要画布时经 **IPC** 驱动渲染进程里的 `CircuitSkillsEngine` | 不操作 DOM |
| **IPC** | 少量稳定通道传 payload / 进度 / 引擎调用 | — |

**保留约定**：进度展示继续走现有事件（如 `skills-agent-loop-progress`、`publishAgentSkillProgress` 生态），由主进程编排时发出来源即可。

---

## 2. 目录结构（已落地）

**当前单源**（与 OpenClaw「一 skill 一文件夹」一致，但未使用 `packaged/` / `user/` 分层目录名）：

```text
skills/
  skill-module-loader.js    # 扫描 skills/skills 下各子目录的 index.js
  index.js                  # SKILL_MODULES、listSkillsForLLM()、LEGACY_ENUM_KEYS 等
  skills/
    <skillId>/              # 例：scheme_design_skill（与 NAME、工具名一致）
      SKILL.md              # 人读规范 + 分层披露素材
      index.js              # NAME、getManifest()、execute(args, ctx)
      examples/             # 可选：第三层参考资料
```

- **产品策略**：仅内置 **`skills/skills/<skillId>/`**，不合并 `userData` 扩展目录。
- **可选演进**：若未来要区分「出厂包 / 用户扩展」，可再引入 `packaged/`、`user/` 命名空间；加载器需支持多根目录扫描。

---

## 3. 主进程模块（现状映射）

| 概念 | 当前落点 |
|------|----------|
| **发现 / 聚合** | `skills/skill-module-loader.js` 扫描子目录；`skills/index.js` 导出 `SKILL_MODULES`、`listSkillsForLLM()` |
| **执行** | `scripts/skills/main-skill-executor.js` → `executeSkillInMain`：`require` 聚合模块、组 `ctx`（含 `createSkillsEngineProxy(webContents)`） |
| **引擎桥** | `scripts/skills/renderer-engine-bridge.js` ↔ `skills-engine-invoke` / `skills-engine-result`（画布与需渲染侧的能力仍在渲染进程） |
| **Agent 多轮** | `scripts/agent/skills-agent-loop.js`：`callLLM`、解析 JSON、`executeSkillInMain`、累积 `toolResults`、`skills-agent-loop-progress` |
| **与 LLM 对齐的短清单** | `scripts/agent/skills-agent-shared.js` 的 **`getSkillsForAgentList()`**（仅 **name + description**，供 `buildSkillsAgentUserPrompt`） |
| **完整 schema 注入** | `listSkillsForLLM()`（manifest：description + input/output schema），基准 / 其它调用方可复用；主进程 prompt 当前以短清单为主 |

**规划（OpenClaw 分层披露尚未编码）**：在主进程侧增加「第 2 / 3 层」按需拼接 SKILL.md / examples，可复用下面 IPC 设计；不必改动执行边界。

---

## 4. 分层披露（原则 vs 实现）

| 层 | 内容 | 现状 |
|----|------|------|
| **第 1 层** | 每 skill 短 **name + description** | ✅ `getSkillsForAgentList()` + `buildSkillsAgentUserPrompt` |
| **第 2 层** | 完整 **SKILL.md** | ⚠️ 文件在仓库中，**未**自动按轮次注入 prompt |
| **第 3 层** | `examples/` 等 | ⚠️ 同左 |

与 `feature-prd/3-skills_prd.md` 的「渐进式披露」一致；实现上可从首轮只带短描述，逐步升级到按需读 SKILL.md。

---

## 5. Agent Loop（当前实现要点）

- **入口**：`main.js` → `ipcMain.handle('run-skills-agent-loop', …)`；渲染进程 `chat.js` → `invoke('run-skills-agent-loop', …)`，并 **register** `skills-agent-loop-progress`。
- **核心**：`scripts/agent/skills-agent-loop.js` 中 `runSkillsAgentLoop(webContents, options)`：`options.callLLM` 与聊天侧 SiliconFlow 等对齐；**默认 `temperature` 0.2**。
- **迭代上限**：默认 **`maxIterations = 15`**；环境变量 **`FH_SKILLS_AGENT_MAX_ITERATIONS`**（**1～40**，非法则回退默认）。
- **工具执行**：每轮解析 `tool_calls` 后依次调用 **`executeSkillInMain`**（可测试注入 `options.executeSkill`）。
- **中断**：`skills-agent-loop-abort` IPC + `scripts/agent/skills-agent-loop-abort.js`。

---

## 6. IPC 一览

| 通道 | 方向 | 状态 |
|------|------|------|
| `run-skills-agent-loop` | 渲染 → 主（invoke） | ✅ |
| `skills-agent-loop-progress` | 主 → 渲染（send） | ✅ |
| `execute-skill` | 渲染 → 主 | ✅（编排内部亦用） |
| `skills-engine-invoke` / `skills-engine-result` | 主 ↔ 渲染 | ✅ |
| `skills:list-summaries` / `skills:get-disclosure` | 渲染 → 主 | ❌ 规划中（用于消除下面「双源短描述」） |
| `agent-skill-progress-emit` 等 | 已有 | ✅ UI 订阅 |

**技术债（短描述）**：`scripts/chat.js` 的 **`getSkillsForAgent()`** 与主进程 **`getSkillsForAgentList()`** 仍为**两份手写数组**（渲染脚本不能直接 `require` Node 的 `skills/index.js`）。当前 **5 个 skill** 文案已对齐；后续可用 preload 注入或 `list-summaries` 收敛为单源。

---

## 7. 迁移 / 待办（相对本文档初版）

**已完成（相对原「规划-only」文档）**

1. 内置 skill 已迁至 `skills/skills/<skillId>/` + `SKILL.md` + `index.js`。
2. Agent 多轮编排已在主进程 `skills-agent-loop.js`。
3. 主进程统一 `executeSkillInMain` + 引擎代理。

**仍建议按序推进**

1. **`skills:list-summaries` / `skills:get-disclosure`**：主进程读 SKILL.md / examples，带 token 上限；渲染侧异步拉取或启动时缓存。
2. **`buildSkillsAgentUserPrompt`**：首轮短清单；选中工具后注入第 2/3 层（与 `listSkillsForLLM()` 职责划分清楚）。
3. **消除 `getSkillsForAgent` 双写**：preload 常量或 IPC 单源。

---

## 8. 与 `3-skills_prd.md` 的关系

- **本文档（`4-agent-loop_prd.md`）**：**目录、主进程边界、IPC、Agent loop 落点**。
- **`3-skills_prd.md`**：**产品策略**（辅助型 skill、不自动落盘元件、全量挂载 vs 分层披露原则等）。
- 若「全量挂载」与「分层注入」并用：以 **全量发现、分层注入 prompt** 为准，避免评审歧义。
