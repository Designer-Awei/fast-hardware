# 临时问题记录（Todo）

## 2026-06-12：Skills Agent 终答 Markdown 未渲染/部分原样露出（已修）

- **现象**：`runSkillsAgentLoop` 结束后，助手 **final message** 在聊天气泡中仍以 Markdown 源文显示（可见 `#`、`**`、`| :--- |` 等）。
- **根因**：终答流式阶段用 `textContent` 写入 `.fh-agent-answer-stream`；`invoke` 的 `finally` 在 `renderMessages()` 前再次刷纯文本，且 `_refreshAgentTraceBlocksDom` 在合成结束后仍可能覆盖已渲染 HTML；`extractRenderableMarkdownFromAgentSynthesis` 误判 JSON 时返回空串导致持久化正文缺失。
- **已落地（2026-06-12）**：
  - `scripts/chat.js`：新增 `_finalizeAgentTraceAnswerMarkdown` / `_isAgentTraceAnswerRenderedMarkdown`；流式预览加 `_skillsAgentFinalAnswerFinalized` 护栏；移除 `invoke` 收尾前最后一次 `_applySkillsAgentFinalStreamToDom`；终答 `content` 与 `_skillsAgentFinalStreamBuf` 双源合并后 `renderMessages` + 强制 Markdown 收口；直连工作区合并回复同步收口。
  - `scripts/agent/skills-agent-shared.js`：`extractRenderableMarkdownFromAgentSynthesis` 非 JSON 信封直接当 Markdown；JSON 无 `final_message` 时回退原文而非空串。

## 2026-04-25：Agent 画布/固件快照读取稳定性（已修）

- **问题**：连线/固件 skill 偶发读到不完整或非最新上下文（含复刻项目 ENOENT 与大文件截断）。
- **已落地**：
  - `marketplace-session://` 增加内存工作区通道（list/read/grep/explore/verify）并兼容短名；
  - skills 主链路对复刻项目改为“前端内存快照分支路由”，不走磁盘；
  - `workspace_read_file` 增加自动续读（按 `nextCharOffset` 多轮合并，含轮次/字符上限保护）；
  - `Reject All` 在复刻项目下直接回退原代码，避免空编辑器。
- **当前状态**：主要阻塞项已解除，后续持续回归复刻项目 + 大 `circuit_config.json` 场景。

## 2026-04-25：社区复刻链路可读性验证（已补 E2E 回归）

- **目标**：确保“复刻 -> 电路页 -> 连线/固件 skill”全链路稳定可读、结果与画布一致。
- **建议保留回归**：覆盖 ENOENT、别名工具名、大文件分页、代码审阅 Accept/Reject 四类关键路径。
- **已落地 E2E（2026-06-12）**：
  - `e2e/scenarios/04-marketplace-fork-memory-workspace.json`：以 `openMarketplaceBundleFromProjectDir` 内存态打开复刻 bundle（无需登录），覆盖 **ENOENT（复刻读 .ino 不报错）** 与 **大文件自动续读（15k JSON 末尾 tailProbe 须可读）**；
  - `e2e/scenarios/05-marketplace-fork-firmware-reject-rollback.json`：覆盖 **复刻项目固件补丁 → Reject All 回滚**（代码区含原始 `9600`、不含补丁 `115200`、不为空白）；
  - **Accept 路径** 由既有 `03-firmware-codefirst-rgb-button.json`（Accept All → 落盘 → 自动关窗）覆盖；
  - **别名工具名**（`read_files` 等短名）依赖模型实际输出，E2E 无法强制触发：直连链路由 `chat.js` 的 `canonicalWorkspaceToolName` 兼容；主进程 agent loop 走提示词强约束（skillName 须与列表完全一致）+ `project-workspace-tools.js` 的 `normalizeWorkspaceToolId` 执行期兜底（如需可加单测）。

## 2026-04-25：复刻会话读盘 ENOENT（已修）

- `chat.js`：复刻会话走内存 bundle 工作区工具，绕开磁盘路径。
- 兼容 `workspace_*` 与短名别名，消除 list/read 分支不一致。

## 2026-04-25：创客集市发布去重策略待定（先记录）

- **场景**：同一设备切换不同账号，使用同一本地项目（相同 `project_key`）分别发布到创客集市。
- **当前实现现状**：发布写入 `marketplace_posts` 为 `insert`，按 `post_id` 唯一；“我的项目发布状态”读取按 `author_id + project_key` 聚合。
- **影响**：
  - 不会出现跨账号状态串线（各账号只看到自己的状态）；
  - 但会出现跨账号（以及同账号重复点击）的重复待审记录。
- **待决策项**：
  - 是否允许跨账号同 `project_key` 重复发布；
  - 是否限制同账号同 `project_key` 在 `pending/approved` 状态下仅保留一条（幂等发布）。
- **后续可选方案**：
  - 数据库唯一约束：`(author_id, project_key)`；
  - 发布接口幂等化：先查再写，已存在时直接返回“已提交/已发布”。

## 2026-04-25：生产/开发路径差异导致状态不匹配（待改造）

- **结论**：当前备份状态与发布状态都基于 `projectPath -> project_key(hash)`，生产环境项目根路径与开发环境不同，导致同一项目内容在不同环境下哈希不同，无法命中已有云端记录。
- **现状**：链路可正常请求（登录、列目录、状态接口均成功），但返回状态与本地卡片无法对应，表现为“无备份/未发布”。
- **后续方案**：
  - 在 `circuit_config.json` 增加稳定 `uuid`（项目级唯一标识）；
  - 旧项目在打开后再次保存时，如缺失 `uuid` 自动补齐并持久化；
  - 备份/发布状态匹配从“路径哈希”迁移为“uuid 优先（路径兜底）”。
