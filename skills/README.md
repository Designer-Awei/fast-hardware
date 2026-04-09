# `skills/` 目录分层

| 文件 / 目录 | 职责 | 是否与 `skills/skills/<id>/` 重复实现？ |
|-------------|------|------------------------------------------|
| **`index.js`** | `SKILL_NAMES`、`SKILL_MODULES`、`getSkillDefinitions()`、`listSkillsForLLM()`；JSDoc：`WorkflowSkillContext`、`JsonSchema`、`SkillDefinition`；可选 `schemeDesignSkill` 等 **deprecated** 别名 | **否**，只做聚合与类型文档 |
| **`skill-module-loader.js`** | 仅扫描**项目内** `skills/skills/<skillId>/index.js`（字母序），**不**合并用户目录 | **否** |
| **`skills/<skillId>/`** | 单 skill 包：`SKILL.md`、`index.js`（`NAME` / `getManifest` / `execute`）、可选 **`references/`**、**`examples/`**（披露第 3 层 / 实现备份） | — |

## `SKILL.md` 书写约定（对齐 `reference/` 示例）

- **YAML frontmatter**（`---`）：至少 **`name`**、**`description`**；可选 **`metadata.fasthardware`**（`skillId`、`engineOp(s)`）。
- **正文**：`#` 标题、**何时调用**、**与 Agent Loop 的配合**（见 `reference/Agent-Loop-Core.md`）、**参数表**、**Tips**；联网类可增 **`references/examples.md`**。
- 旧式 XML 标签 `<name>` / `<description>` **不再使用**。
| ~~**`renderer-registry-entry.js`**~~ | 已移至根目录 **`temp/`** 归档（历史 esbuild 入口） | — |
| **`scripts/chat.js` `executeSkill`** | 经 **`electronAPI.executeSkill` → 主进程 `ipcMain.handle('execute-skill')`** 加载 `skills/skills/<skillId>/index.js`；**`CircuitSkillsEngine`** 留在渲染进程，经 **`skills-engine-invoke` / `skills-engine-result`** RPC 执行 | **否** |

**约定**：`skills/skills/` 下**仅** skill 子文件夹；各 skill 的 `index.js` 中 JSDoc 类型引用使用 `import('../../index').WorkflowSkillContext` 等。

## 执行路径（当前）

1. **主进程** [`main.js`](../main.js)：`ipcMain.handle('execute-skill')` → [`scripts/skills/main-skill-executor.js`](../scripts/skills/main-skill-executor.js) `require('../../skills/index.js')` 并 **`mod.execute(args, ctx)`**。
2. **`ctx.skillsEngine`** 为主进程侧 **代理**（[`scripts/skills/renderer-engine-bridge.js`](../scripts/skills/renderer-engine-bridge.js)），每个方法通过 **`webContents.send('skills-engine-invoke')`** 转发到渲染进程。
3. **渲染进程** [`preload.js`](../preload.js) `registerSkillsEngineRpcHandler` → 调用真实 **`CircuitSkillsEngine`**（[`scripts/circuit-skills-engine.js`](../scripts/circuit-skills-engine.js)），结果经 **`skills-engine-result`** 回主进程。
4. **单源**：仅 **`skills/skills/<skillId>/`**（随仓库/安装包发布）；**不再**使用 `FH_USER_SKILLS_DIR` 或 `%userData%/skills/skills`。

**结论**：业务逻辑仅在 **`skills/skills/<skillId>/index.js`**；**`chat.js`** 与真测均调用同一套 **`execute`** 语义（主进程加载 + 引擎 RPC）。

## 普通对话 · 上下文自动压缩

- 脚本 **`scripts/context-compact.js`**（在 **`index.html`** 中先于 **`chat.js`** 加载）：当 `generateAIResponse` 组好的 API 消息**估算文本** ≥ **70000** 字符时，会先多调一次 **`chatWithAI`**，将「较早历史」压成 ≤约 **10k 字**纪要写入 system，并**保留最近 2 条**中期消息 + 当前用户消息，避免下一轮补充信息后轻易顶满上下文。

## Skills Agent 多轮与工具输出体积

- **`scripts/agent/skills-agent-loop.js`**：默认 **15** 轮 tool 循环（环境变量 **`FH_SKILLS_AGENT_MAX_ITERATIONS`** 可改为 1～40）；业界常见硬上限多在约 **10～25** 轮量级，无统一标准。
- **单次工具返回**：若 `JSON.stringify` 超过 **20000** 字符，会先压缩再进入下一轮提示词：`web_search_exa` 走 **保留 `results` 结构的 snippet/条数裁剪**；其它 skill 走 **多一次 LLM 摘要**（失败则硬截断）。

## Skills Agent 中断

渲染进程「中断」调用 **`electronAPI.abortSkillsAgentLoop()`** → 主进程 **`skills-agent-loop-abort`**，使 [`scripts/agent/skills-agent-loop.js`](../scripts/agent/skills-agent-loop.js) 在下一轮/工具前退出并返回 `outcome: 'aborted'`。
