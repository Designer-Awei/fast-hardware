# Fast Hardware 更新日志

## 📝 更新日志

### 🎉 v0.2.8 (2026-04-24) — 账号与个人中心、云端备份

以下 **🎯 日期补充**按**日期降序**排列（最新在上）。

#### 🎯 2026-04-24 补充
- **个人中心 · 我的项目 · 云端备份（`scripts/account-center.js` / `styles/main.css` / `preload.js` / `main.js` / `supabase/auth-service.js`）**：在登录态下列出本地项目卡片并展示备份状态；支持 **上传/更新备份**、**撤销备份**、**下载恢复到本地**；本地项目路径与列表键统一 **`\` → `/` 归一化**；备份清单 **`__manifest__.json`** 映射原始相对路径与安全存储名；单方案备份体积上限 **5MB**、每用户最多 **10** 个不同方案备份（更新已有方案不计入新增上限）。
- **撤销备份可靠性（`supabase/auth-service.js`）**：先删除 **`project_backups`** 表记录并用 **`delete().select('id')`** 校验实际删除行数，再清理 Storage，避免 RLS 下「0 行删除仍返回成功」；无删除权限时返回明确错误文案。
- **Supabase RLS**：为 **`public.project_backups`** 增加 **`project_backups_delete_own`**（`authenticated` 且 **`user_id = auth.uid()`** 可 `DELETE`），与撤销备份主进程逻辑配套。
- **撤销备份交互（`scripts/account-center.js` / `styles/main.css`）**：与上传一致的 **加载态**（转圈 + 背景进度条 + 防重复点击）；**`refreshMyProjects` 后** `setRevokeButtonLoading(false)` 按 **`projectBackupMap`** 恢复 **`disabled`**，避免无备份时撤销按钮仍为可点态。
- **生产环境 Supabase 配置（`supabase/config.js` / `package.json` / `scripts/build-dist.js`）**：`readSupabaseConfig` 优先读取 **`process.resourcesPath/.env.supabase`**（与 `app.asar` 同级）；打包通过 **`extraResources`** 将仓库根目录 **`.env.supabase`** 复制到安装目录 **`resources`**；**`npm run dist`** 前若缺少该文件则直接报错提示，避免打出无法登录的安装包。

#### 🎯 2026-04-23 补充
- **账号中心与个人入口（`index.html` / `scripts/account-center.js` / `styles/main.css`）**：新增顶部头像入口、个人中心一级标签与账号设置二级页骨架；未登录态切入类 App 登录页，已登录态展示邮箱、昵称、角色、登录方式，并为管理员预留社区管理入口。
- **Supabase 邮箱密码接入（`main.js` / `preload.js` / `supabase/auth-service.js` / `supabase/config.js`）**：主进程统一托管邮箱注册、登录、登出与登录态读取，渲染层通过 IPC 调用，避免 preload 直接耦合本地 Supabase 模块；`profiles` 补写与读取流程同步打通。
- **登录页结构与交互（`index.html` / `styles/main.css` / `scripts/account-center.js`）**：登录面板改为左右分栏；补齐昵称、邮箱、密码表单、协议勾选、协议文档弹窗、密码显隐切换与反馈提示；GitHub / Google 作为 OAuth 占位入口接入本地图标资源。
- **OAuth 样式修正（`index.html` / `styles/main.css`）**：GitHub / Google 按钮图标统一调整为 **20px**，按钮文案统一调整为 **16px**，对齐新的登录页视觉规范。
- **邮箱验证链路清理（`main.js` / `preload.js` / `supabase/auth-service.js` / `package.json` / `.env.supabase*`）**：在 Supabase 已关闭 Confirm email 后，移除 `fasthardware://auth/callback` 自定义协议、邮箱验证回调监听、注册成功邮件 Edge Function 方案与相关环境变量；注册成功后直接写入 Supabase 并自动登录，软件内提示“注册成功”。
- **30 天保持登录（`index.html` / `scripts/account-center.js` / `supabase/auth-service.js` / `styles/main.css`）**：登录页新增“30 天内保持登录”勾选项；勾选时本地会话最长保留 30 天，不勾选则仅保留当前应用会话；开发环境与生产环境均按同一套 `userData` 会话文件策略生效。
- **密码显隐图标状态修正（`scripts/account-center.js`）**：修复密码默认隐藏时仍显示“可见”图标的问题，确保不可见状态显示 `eye-off`，可见状态显示 `eye`。

> **v0.2.8 已发布**：根目录 `package.json` 的 `version` 为 **0.2.8**；展示用文案与安装包命名以 `npm run sync-version` 及构建产物为准。

> **打包前自检（账号 / Supabase）**：**`.env.supabase`** 仍 **不进 asar**（`files` 中排除），但会通过 **`extraResources`** 复制到安装目录 **`resources/.env.supabase`**；运行时 **`readSupabaseConfig`** 会优先读该路径。打包机需存在已填写的 **`.env.supabase`**（`npm run dist` 会校验）；**勿**将 **Service Role** 写入该文件，仅使用 **Publishable / Anon** 即可。也可通过环境变量 **`FASTHARDWARE_SUPABASE_ENV_PATH`** 指向自定义路径。

### 🎉 v0.2.7 (2026-04-18) — 联网与设置体验

- **联网检索封顶与直连提示（`scripts/agent/skills-agent-loop.js` / `scripts/agent/skills-agent-shared.js` / `scripts/chat.js`）**：实时/优先联网场景下 `web_search_exa` 连续失败后不再无限强注，默认**每用户消息最多执行 3 次**（`FH_WEB_SEARCH_MAX_PER_RUN` 可调 1～10）；达上限后允许 **final_message** 诚实说明失败原因。**直连短答**系统提示不再笼统写「绝不调用 skills」，避免模型向用户误称「直连禁止联网」；**`isRealtimeQuery`**（渲染侧与主进程）补充天气/气象等关键词，便于「杭州天气」类句走 Agent 检索路由。
- **首装无密钥场景的模型刷新 UX（`main.js` / `scripts/model-config.js` / `styles/main.css`）**：无密钥时回退缓存/内置列表；模型下拉「刷新」在无 Key 时为**禁用态**并提示，避免误导。
- **密钥弹窗「清空密钥」（`scripts/settings.js` / `preload.js` / `main.js`）**：弹窗将「取消」改为「清空密钥」；主进程 **`clear-api-key`** IPC 与 `env.local` / `userData` 路径策略对齐。
- **系统设置页布局（`styles/main.css`）**：**`.settings-grid`** 改为 **flex** 换行，卡片 **`flex: 1 1`** 撑满可用宽度，去掉 **1200px** 居中限宽；**`.settings-page`** 设 **`width: 100%`**。
- **打包输出（`scripts/build-dist.js`）**：**`npm run dist`** 在 electron-builder 成功后删除 **`dist/builder-effective-config.yaml`** 与 **`dist/builder-debug.yml`**，避免调试 YAML 残留在产物目录。
- **Web 检索依赖 `mcporter` 随安装包分发（`package.json` `build.asarUnpack` + `main.js`）**：主进程 **`web-search-exa`** 通过动态 **`import('mcporter')`** 连接 Exa MCP；仅声明在 **`dependencies`** 时，部分环境打包后仍缺模块。增加 **`asarUnpack`** 解压 **`mcporter`** 与 **`@modelcontextprotocol`** 目录；启动时对 **`mcporter/package.json`** 执行 **`require.resolve`**，便于打包器纳入依赖追踪。

> **v0.2.7 已发布**：根目录 `package.json` 的 `version` 为 **0.2.7**；展示用文案与安装包命名以 `npm run sync-version` 及构建产物为准。

### 🎉 v0.2.6 (2026-03-21) — Skills 架构降级（已发布）

以下 **🎯 日期补充**按**日期降序**排列（最新在上）。

#### 🎯 2026-04-11 补充
- **固件审阅 Accept All 后自动关代码窗（`scripts/canvas.js`）**：**`saveCode()`** 返回 **`Promise<boolean>`** 表示是否完成有效保存（含无项目目录时的内存暂存）；**`acceptAllFirmwarePatchChanges()`** 在 **`saveCode()` 成功**后调用 **`closeFirmwareCodeEditor()`**，避免大层代码编辑器继续遮挡聊天输入区；有项目但无 **`currentCodePath`** 等保存失败路径**不**自动关窗。
- **E2E 场景 03（`e2e/scenarios/03-firmware-codefirst-rgb-button.json`）**：在 **`assertPatchReviewClosed`** 之后增加 **`waitForSelector` `#code-editor-modal` `hidden`**（与 **`FH_E2E_SKIP_LLM`** 跳过策略对齐）；**`e2e/README.md`** 表格同步；**`e2e/lib/scenario-runner.js`** 中 **`sendChat`** 前 **`closeFirmwareCodeEditorModalIfBlocking`** 保留为兜底（仅手动保存等仍可能未关窗时）。
- **连线规划紧凑快照（`circuit-skills-engine.js`）**：`buildCompactWiringSnapshotForPrompt` 改为始终纳入画布上全部元件实例（及连线端点，有数量上限），**不再**仅用 `wiringRules` 关键词子串筛掉 MCU/LED/电源等，避免第二轮规则大段写「220Ω/电阻」时模型误判「画布仅有电阻」与 `missing_parts_on_canvas`；关键词仍可用于输出顺序靠前。
- **`runWiringEditPlan` 提示词**：以「**功能优先，对称与成组被动件后置**」泛化表述替代过细的 RGB/220Ω 细则；补充紧凑快照与缺件结论的一致性约束。
- **Agent 与主进程（`skills-agent-shared.js` / `skills-agent-loop.js`）**：`wiring_edit_skill` 单轮默认上限由 **3 → 5**（`FH_WIRING_EDIT_MAX_PER_RUN` 仍可覆盖）；新增 **「勿空转」** 文案；主进程在**上一轮 `wiring_edit_skill` 已成功且 `plannedOperations` 为空**时**拒绝**再次执行该 skill，引导直接 `final_message`。
- **E2E（`e2e/scenarios/`）**：场景 JSON 加序号前缀并收敛为 **`01-five-components-wiring-request.json`**（未设 `FH_E2E_SCENARIO` 时默认）、**`02-five-components-symmetry-wiring.json`**；删除原拖放冒烟与 canvas-chat 场景；**`regression-scenario.spec.js`** 默认场景路径同步；**`e2e/README.md`** 更新。
- **test-cases 精简**：删除 Agent loop、agent 集成向脚本、思考开关基准、`unit/workspace-direct-chat-tools` 等；**仅保留**四个 **`live-skill-*-siliconflow.js`** 与 **`lib/live-skill-node-engine.js`、`lib/siliconflow-client.js`** 作为单 skill 真测模板；**`test-cases/README.md`** 重写；根目录 **`package.json`** 去掉已不存在脚本的 **`test:live-*`** 项；**`feature-prd/3-skills_prd.md`** 测试策略改为单 skill 真测 + **`e2e/`** 端到端分工。
- **版本号**：**v0.2.6** 已发布；上述 dated 补充随 **0.2.6** 交付（以根目录 **`package.json`** 与 **`npm run sync-version`** 为准）。

#### 🎯 2026-04-09 补充
- **主 Agent + 工作区工具真测（SiliconFlow）**：新增 **`test-cases/live-agent-workspace-tools-siliconflow.js`**，对 **`runSkillsAgentLoop`** 注入临时嵌套项目目录（`projectPath`），真实调用 SiliconFlow；通过 IPC 断言至少各出现一次 **`workspace_explore`** 与 **`workspace_read_file`**，并校验最终合成正文包含探针子串，验证多轮 **`tool_calls`** 下可完成目录树浏览与文件读取。**`npm run test:live-agent-workspace-tools`**；可选 **`LIVE_AGENT_WORKSPACE_TOOLS_STRICT`** / **`LIVE_AGENT_WORKSPACE_TOOLS_VERBOSE`**。
- **固件补丁审阅与代码浮窗（`scripts/canvas.js`、`index.html`、`styles/components.css`）**：
  - 移除「**退出审阅**」按钮；**关闭**代码窗时**保留**内存审阅态 `firmwarePatchReviewState`（可先读聊天再回来 Accept/Reject）；`getCodeEditorStateForProject` 序列化审阅态以便多标签切换恢复。
  - **Reject All**：仅合并内存结果、**不写磁盘**，并**自动退出审阅**回到普通编辑器。
  - 审阅区改为**左右分栏**：左 **绿底** 显示「更改后」完整合并结果，右 **红底** 显示「合并前」基准代码；修复原先样式将合并结果 `pre` 设为 `display: none` 导致几乎全黑、难以区分增删的问题。
  - 代码浮窗增加**右下角拖拽缩放**（最小约 **320×200**，宽高不超过浏览器视口，边界约束与标题栏拖拽一致）；`open`/`close` 时绑定与清理拖拽、缩放监听，避免重复监听。

#### 🎯 2026-04-07 补充
- **项目会话隔离（已落地）**：多项目标签切换时，右侧对话会话按项目隔离；应用启动与“最后一个标签关闭”场景统一自动补建 `未命名项目` 默认标签。
- **未保存改动内存恢复（画布）**：项目切换恢复策略调整为“优先恢复内存快照（components/connections）”，避免已打开项目在未保存情况下切回后回退到初始磁盘状态。
- **未保存项目代码保存策略（固件编辑器）**：在 `未命名项目`/新建未落盘项目中点击“保存”，改为仅内存级暂存代码，不再强制触发“保存项目”流程；提示文案与行为对齐，消除“取消保存项目却提示保存成功”的误导。

#### 🎯 2026-03-10 补充
- **SiliconFlow `max_tokens`**：主进程 `callSiliconFlowAPI` 默认 **8192**（聊天）、**`longOutput:true`** 时 **32768**（Agent）；**勿再顶格 100000**（易触发 **500 / code 50507**）。真测 **`siliconflow-client`** 默认 **8192**、硬顶 **32768**。
- **Skills 单源**：移除 **`FH_USER_SKILLS_DIR`** / **`main.js` 创建 `%userData%/skills/skills`**；**`skill-module-loader`** 仅扫描项目 **`skills/skills/<skillId>/`**。
- **新增 `summarize_skill`**：内置 `runSummarizeText`（引擎 + IPC 白名单 + Agent 列表）；语义参考 `reference/summarize`，实现为应用内 LLM，非 summarize CLI。
- **`summarize_skill` 与联网**：manifest/Agent 提示词明确为 **`web_search_exa` 后续**；可选 **`urls`**（主进程 **`fetch-url-plaintext.js`** 抓取 http(s) 正文后与 `text` 合并摘要）。
- **普通对话自动压缩上下文**：**`scripts/context-compact.js`** + **`chat.js`**：估算文本 ≥ **70k** 时先摘要早期对话，目标 **≤~10k** 纪要，保留最近 2 条历史 + 当前用户消息。
- **Agent 工具输出压缩**：单次 execute 结果序列化 **>20k** 时：`web_search_exa` **保留 `results` 结构**下裁剪 snippet/条数；其它 skill **LLM 摘要**后再进入下一轮。**Agent 最大轮次**默认由 **4 → 15**（`FH_SKILLS_AGENT_MAX_ITERATIONS` 可调 1～40）。

#### 🎯 动机
- 当前架构与资源不足以支撑 **全自动元件 JSON 生成** 与 **全画布编辑**；降级为 **辅助型** 电路 skills，降低错误落盘风险。

#### 🤖 Skills Agent 编排迁入主进程（`runSkillsAgentLoop`）
- **`runSkillsWorkflow` 重命名为 `runSkillsAgentLoop`**（`scripts/chat.js`）：渲染侧仅 **`invoke('run-skills-agent-loop')`**、订阅 **`skills-agent-loop-progress`**、展示结果；**多轮 LLM + tool 解析 + `executeSkillInMain`** 迁至 **`scripts/agent/skills-agent-loop.js`**，经 **`callSiliconFlowAPI`** 调模型（**`temperature`** 支持可选覆盖，Agent 默认 **0.2**）
- **共享纯函数**：**`scripts/agent/skills-agent-shared.js`**（prompt 拼装、JSON 解析、web 信源、进度文案工具）
- **中断**：**`skills-agent-loop-abort`** IPC + **`scripts/agent/skills-agent-loop-abort.js`**；渲染 **`abortSkillsAgentLoop()`**；主进程循环内检测并返回 **`outcome: 'aborted'`**
- **Skill 包目录**：内置 skill 迁至 **`skills/skills/<skillId>/`**（`SKILL.md` + `index.js` + `examples/`）；**`skill-module-loader.js`** 扫描子目录；删除遗留 **`skills/orchestrator.js`**、**`workflowSkills.js`** 与扁平 `*.js`
- **废弃脚本归档**：**`scripts/build-skills-registry.js`**、**`skills/renderer-registry-entry.js`** 移至根目录 **`temp/`**

#### 🔄 Skills：主进程执行 + 渲染进程引擎 RPC
- **`ipcMain.handle('execute-skill')`**（[`main.js`](main.js)）→ [`scripts/skills/main-skill-executor.js`](scripts/skills/main-skill-executor.js)：`require('../../skills/index.js')` 并调用 **`execute(args, ctx)`**；**移除** esbuild 注册表、**`fh-generated://`**、**`scripts/skill-registry-build.js`**
- **`ctx.skillsEngine`** 为主进程代理（[`scripts/skills/renderer-engine-bridge.js`](scripts/skills/renderer-engine-bridge.js)），经 **`skills-engine-invoke` / `skills-engine-result`** 调用渲染进程 **`CircuitSkillsEngine`**（白名单方法名）；**[`preload.js`](preload.js)** 暴露 **`registerSkillsEngineRpcHandler`**、**`executeSkill`**
- **`scripts/circuit-skills-engine.js`** 新增 **`getCurrentSkillState()`**；**[`skills/skills/scheme_design_skill/index.js`](skills/skills/scheme_design_skill/index.js)** 兼容异步读取 skill 状态
- **`package.json`**：去掉 **`prestart`/`predev*`**、**`esbuild`** 与 **`asarUnpack`**；**[`scripts/build-dist.js`](scripts/build-dist.js)** 不再预跑注册表；**[`scripts/build-skills-registry.js`](scripts/build-skills-registry.js)** 保留为废弃占位脚本

#### 🔄 Skills 注册表（已废弃）
- 曾：生产环境每次启动 **`buildSkillsRegistrySync`** + **`fh-generated://`** — **已由主进程执行方案替代**

#### 🧩 Skills 调整
- **保留**：`web_search_exa`
- **保留/强化**：`scheme_design_skill`（方案 + BOM/库匹配 + **文字型**缺件建议；**不**自动创建元件）
- **新增**：`completion_suggestion_skill`（模糊需求 → 模块级型号/常见模块名建议，可配合检索）
- **新增（由画布编辑降级）**：`wiring_edit_skill`（仅对已有画布 **增删连线**；`add_connection` / `remove_connection`）
- **移除 skill 文件**：`component-autocomplete-validated.js`、`structured-wiring.js`、`canvas-edit.js` 及对应引擎链路（自动补全、结构化草案、整块画布编辑）

#### 🛠️ 代码与文档
- **`scripts/circuit-skills-engine.js`**：新增 `runCompletionSuggestions`、`runWiringEditPlan`、`applyWiringEditOperations`、`getCanvasSnapshotForSkill`；删除自动补全与结构化连线/画布编辑相关实现；移除已无引用的 `_validatePinsSpec`；**修复** `CircuitSkillsEngine` 类缺少闭合 `}` 导致脚本解析失败、`web_search_exa` 等 skills 链路无法初始化的问题；**重写文件头说明**（降级为 agent 按需调用的 skills 引擎，非端到端 workflow）；**删除未再使用的 `shouldRunSkillsFlow`**（旧前置路由判别，主链路已统一 `runSkillsWorkflow`）
- **`scripts/chat.js`**：`getSkillsForAgent` **列表顺序与文案** 体现「先 `scheme_design_skill` 对齐库与缺件，再按需 `completion_suggestion` / `web_search`」；agent 系统/用户提示词补充 **辅助型编排建议**；`executeSkill` / 短名映射对齐上述 4 项
- **`feature-prd/3-skills_prd.md`**：列表与测试策略与降级方案一致
- **`test-cases`**：重写 `unit/skills-workflow-execute.unit.test.js`；更新 live benchmark / integration；删除 `component-autocomplete-structure` 与 `lib/component-spec-validator`；`package.json` 移除 `test:component-spec`
- **单 skill 真测**：新增 `live-skill-completion-suggestion-siliconflow.js`、`live-skill-scheme-design-siliconflow.js`、`live-skill-wiring-edit-siliconflow.js` 与 `lib/live-skill-node-engine.js`（真实 SiliconFlow、`npm run test:live-skill-*`）；`lib/siliconflow-client.js` 统一解析 `env.local` / `SILICONFLOW_API_KEY` 与 `siliconFlowChat`，单测不再依赖 benchmark 文件是否存在
- **Skills 进度 UI**：恢复并打通「阶段 + 用时」typing 行；`setSkillsFlowPhaseLabel` 在 skills 流程内可补建 typing；`preload.publishAgentSkillProgress` + 主进程 `agent-skill-progress-emit` 转发，使 `onAgentSkillProgress` 与 `fast-hardware-skills-progress` 可订阅同源进度
- **Skills 阶段文案**：阶段说明放宽至 **≤12 计字单位**（英文整块 token 计 1）；去掉大量「xxx中」语感；工具批 **`正在调用 web-search skill`**，多工具 **`正在调用 web-search 等n个skill`**（以本批**首个** skill 的展示名为准）；结果行用 **`web-search 返回k条` / `scheme-design 已完成` / `xxx 执行失败`** 等；普通 typing 默认 **`等待生成回复`**
- **`completion_suggestion_skill` 进度**：`circuit-skills-engine.js` 的 `runCompletionSuggestions` 增加总线阶段 **`completion-suggestion 请求模型 / 已完成 / 解析失败`**
- **`scheme_design_skill` 长耗时可观测**：`circuit-skills-engine.js` 在拟定方案 / 检索资料 / 汇总方案 / 匹配元件库 / 重试解析 等子步骤通过 **`fastHardwareSkillsProgress.emit`** 推送阶段（不再直调 ChatManager），避免长时间停在「正在调用 scheme-design skill」且修复原先 **`setTypingIndicatorText` 覆盖掉「用时 n S」** 的问题
- **Skills 进度总线**：新增 **`scripts/skills-progress-bus.js`**（`fastHardwareSkillsProgress.emit`：`fast-hardware-skills-progress` + IPC）；`ChatManager` 订阅总线刷新 typing；`runRequirementAnalysis` 控制台输出 **注入 prompt 的 `webSearchReferenceText` 字符数**
- **真测 SiliconFlow 客户端**：`test-cases/lib/siliconflow-client.js` 的 `siliconFlowChat` 与主进程请求对齐（UTF-8 Buffer 拼接、`extractChoiceMessageContent`、默认 **180s** 超时、HTTP 200 但无可解析正文时 **抛错**）；**`live-skill-completion-suggestion-siliconflow.js` 默认硬断言**（可用 `LIVE_SKILL_COMPLETION_NO_ASSERT=1` 跳过）
- **BOM（`runRequirementAnalysis`）JSON 鲁棒性**：`test-cases/lib/live-skill-node-engine.js` 与 **`scripts/circuit-skills-engine.js`** 对齐 — **平衡花括号**截取首个合法对象、**包装根规整**（`data`/`result`/`analysis`/`bom`/`output` 内含 `components`）、解析成功须含 **`components` 数组**；system 提示增加「禁止复制整库列表、5～15 条、勿用代码块」等约束；重试 user 提示要求 **components ≤ 12 条**，降低 Qwen 等大模型返回超长不可解析 JSON 的概率
- **SiliconFlow「关思考」与真测对比**：官方 Chat Completions 参数为 **`enable_thinking`**（非 `no_thinking`）；`test-cases/lib/siliconflow-client.js` 支持可选传入；`live-skill-node-engine` 的 `callLLMAPI` 读取 **`LIVE_SILICONFLOW_ENABLE_THINKING`**（默认 **`false`**；`omit`/`inherit` 表示不传参）；新增 **`test-cases/benchmark-enable-thinking-skill.js`**（`npm run test:benchmark-thinking`）对 **`completion_suggestion_skill`** 跑不传/false/true 三轮并汇总耗时与断言；可选 **`LIVE_SILICONFLOW_LOG_REASONING=1`** 观察 `reasoning_content` 长度
- **设置页 · SiliconFlow 思考开关**：`index.html` SiliconFlow 卡片在「配置密钥」旁增加 **「模型思考」** 开关（默认关），写入 `env.local` 的 **`SILICONFLOW_ENABLE_THINKING`**；**`main.js`** `callSiliconFlowAPI` 始终携带 **`enable_thinking`**（与开关一致），并统一用 **`readSiliconFlowApiKey`** + **`extractSiliconFlowChoiceMessageContent`** 解析正文/`reasoning_content`
- **设置页样式 / 模型配置竞态**：SiliconFlow 卡片 **「配置密钥」** 按钮增加 **`flex: 0 0 auto`**，避免与「模型思考」同行时被拉长；**`model-config.js`** 暴露 **`window.whenModelConfigLoaded`**，**`ChatManager.init`** 先 **await** 再 **`initializeModelDisplay`**，去掉 **`waitForModelConfig`** 轮询及相关 `console.warn`
- **单 skill 真测默认关思考**：**`test-cases/lib/live-skill-node-engine.js`** 导出 **`applyLiveSkillDefaultThinkingOff()`**（未预设 env 时写 **`LIVE_SILICONFLOW_ENABLE_THINKING=0`**）；**`live-skill-completion` / `scheme` / `wiring` / `benchmark-enable-thinking`** 入口调用；`benchmark` 在保存/恢复 env 之后调用，仍可用各轮 `omit`/`1` 覆盖
- **BOM 提示词**：`runRequirementAnalysis` 的 system 提示增加 **「不要添加需求中未出现的传感器类型」**（与 **`scripts/circuit-skills-engine.js`** / **`test-cases/lib/live-skill-node-engine.js`** 对齐），减少无关传感器条目
- **chat.js 与 skills 单源**：**`executeSkill`** 改为委托 **`skills/skills/*.js`** 的 **`execute`**（与 Node 真测同源）；新增 **`skills/renderer-registry-entry.js`** + **`esbuild`** 生成 **`scripts/generated/fast-hardware-skills-registry.js`**，`index.html` 先于 `chat.js` 引入；**`npm run build:skills-registry`**；**`npm run dist`** 经 **`build-dist.js`** 自动重建注册表；**`package.json`** 增加 **`prestart`**、**`predev`***，在 **`npm start` / `npm run dev*`** 前自动执行注册表构建；**`web_search_exa`** 的 `query` 缺省改为 **`ctx.userRequirement`**
- **修复双 typing 气泡**：进度总线 `_consumeSkillsProgressFromBus` 不再在「尚无 typing-indicator」时异步 `showTypingIndicator`（避免与 `runSkillsWorkflow` 内 `await showTypingIndicator` 在 `getAssetsPath` 挂起期重复建 DOM）；`showTypingIndicator` 内对重复 `#typing-indicator` 做清理
- **可观测性**：`scripts/resizer.js` 去掉拖动分割线的 `console.log`；`chat.js` 增加 **`[skills-chain]`** 日志（用户输入预览、agent 轮次、LLM 返回长度、`executeSkill` 起止）；`circuit-skills-engine.js` 的 **`[scheme→需求分析]`** 记录 prompt 规模、LLM 返回长度，解析失败时 **`_debugLogRequirementAnalysisRaw`** 打印首/尾片段与括号位置；校验解析结果须含 **`components` 数组** 否则重试/报错
- **`skills/` 布局**：`index.js` 聚合注册表 + `listSkillsForLLM` + 共享 JSDoc 类型；`skills/skills/` **仅**含可复用单 skill 实现；`workflowSkills.js` 通过 `require('./index')` 引用 `SKILL_MODULES`；**已移除**独立的 `registry.js`、`context.js`（并入 `index.js`）

> **v0.2.6 已发布**：根目录 `package.json` 的 `version` 为 **0.2.6**；展示用文案与安装包命名以 `npm run sync-version` 及构建产物为准。

---

### 🎉 v0.2.5 (2026-03-21)

#### 🧩 Skills 与文档
- **可复用 skill 落地到 `skills/skills/*.js`**：单文件 `getManifest()` + `execute()`；注册表在 **`skills/index.js`**（含 `listSkillsForLLM`）；`skills/workflowSkills.js` 仅导出 `buildWorkflowSkillExecutors`（避免与 index 重复导出同名 `*Skill` 包装）
- 新增 **`skills/README.md`**：说明根目录与 `skills/skills` 的分工及**无重复实现**关系
- **PRD**：`feature-prd/3-skills_prd.md` —「渐进式披露」与 **全量挂载工具列表**（预期不足百级 skill）并存；补充复杂场景下 **agent loop** 行为与**最佳实践**；明确 **`web_search_exa` 非必调**及复杂任务下检索补证建议
- **`skills/skills`（v0.2.5 阶段）**：`scheme_design_skill` **合并**原需求分析（一次调用串联 `runSchemeDesign` + `runRequirementAnalysis`，可选 `runBomAnalysis:false`）；**移除**独立 `requirement_analysis_skill` 文件；曾新增 **`canvas_edit_skill`**、**`structured_wiring_skill`**（草案落画布）等 — **已在 v0.2.6 降级移除**，详见上文
- **`npm run test:skills-execute`**：`test-cases/unit/skills-workflow-execute.unit.test.js`（Mock 引擎，无 Electron）

#### 🤖 Agent 架构与联网策略（相对 v0.2.4 的延续说明）
- **架构**：自 **v0.2.4**（见该版本「工作流展示」约 L35–L41）起，主对话已从 **按钮分阶段 workflow** 重构为 **skill 驱动的 agent loop**：移除 UI 按钮驱动链路、`runSkillsWorkflow` 统一走多轮 JSON + tool 执行、Orchestrator **工具优先**于同轮 `final_message`；由 LLM 自主编排 skills 顺序（不再依赖固定阶段按钮）。
- **`web_search_exa` 定位**：**不是**所有任务的必调项；适用于 **实时/外部可验证知识**。复杂任务可检索后配合 **`scheme_design_skill`**、**`completion_suggestion_skill`** 等（**v0.2.6**）；纯库内推理、只要本地方案骨架时可不强制联网。

#### 🧪 test-cases
- 新增 **`test-cases/README.md`**：区分 **live SiliconFlow 脚本** 与 **`unit/` Mock**；约定 `live-skills-siliconflow-*` 须真实 Key
- **`live-skills-siliconflow-integration.js`** + **`npm run test:live-skills-integration`**：业务向 agent 流程（对齐 benchmark 日志）
- **`live-skills-siliconflow-benchmark.js` 改造**：
  - 从 **`listSkillsForLLM` + `buildWorkflowSkillExecutors`** 贯通「加载契约 → 执行 `skills/skills`」；`web_search_exa` 走真实 Exa，其余电路类 skill 走基准内 **Mock `skillsEngine`**
  - **统一模糊需求池**（取消「明确场景」分列）；每条含 **`expectedSkills`**，断言 **预期调用的 skill 集合 ⊆ 实际 `toolResults` 中出现过的 skillName 集合**
  - 需求池 **覆盖全部已注册 skills**（启动时校验）；涉 `web_search_exa` 的场景仍做检索与 Markdown 引用软校验

> 版本号已写入 `package.json` **0.2.5**；展示用文案可执行 `npm run sync-version` 与安装包流程对齐。

---

### 🎉 v0.2.4 (2026-03-12)

#### 🤖 默认对话模型与进度 UX
- **默认对话模型**改为 `Qwen/Qwen3.5-27B`（`model_config.json`、`main.js` 内置增强、`scripts/chat.js` / `scripts/model-config.js` / `index.html` 占位文案）；`THUDM/GLM-4-9B-0414` 保留为备选并降低优先级
- **Skills agent 等待文案**：保留阶段/技能逻辑链（查询工具、解析计划、调用 xxx skill、检索完成、总结分析等），**不**再使用思考链式 `k/N` 总步数；同一行叠加「用时 n S」递增直至最终回复（`setSkillsFlowPhaseLabel` + `startSkillsFlowElapsedTimer`）；`showTypingIndicator` 复用已有 DOM

#### 📦 版本与发布流程
- **版本号全仓对齐**: 展示用版本与 `package.json`、安装包命名统一为 **0.2.4**
- **一键同步脚本**: 新增 `npm run sync-version`，从 `package.json` 自动更新 `index.html`、`main.js`、`assets/update.txt`、`README.md`、`README_EN.md` 中的版本字符串
- **打包前自动同步**: `npm run dist` 在清理 `dist/` 与调用 electron-builder 之前会执行版本同步（`npm run clean:dist` 不触发）

#### 🎨 工作流展示
- 📐 **匹配结果列宽**: 元件匹配结果表格列宽调整为「元件名称 25% / 匹配状态 30% / 匹配结果 45%」
- 🧹 **移除旧按钮驱动 workflow**: `scripts/chat.js` 中旧的“按钮分阶段 workflow”方法已彻底移除，统一由 skills 自动执行链路，避免残留逻辑误导/误触发
- 🧠 **引擎脚本重命名**：原 `scripts/workflow-circuit.js` 已更名为 **`scripts/circuit-skills-engine.js`**（与类名 `CircuitSkillsEngine` 一致，去除 workflow 字样）；`index.html` 与文档路径已同步
- 🧩 **chat/adapter 命名继续收口**: `scripts/chat.js` 与 `skills/workflowSkills.js` 主调用命名统一到 `skillsEngine/currentSkillState/shouldRunSkillsFlow`，旧 `workflow*` 名称仅保留兼容入口（不再作为主链路）
- ✂️ **移除兼容别名**: 已删除 `CircuitWorkflowEngine/shouldRunWorkflow/currentWorkflowState/mapWorkflowTypeToSystemCategory/workflowEngine/isWorkflow/workflowState` 等旧命名兼容层，代码仅保留 skills 主命名，避免旧链路干扰
- 🔀 **移除前置路由判别**: `scripts/chat.js` 文本消息改为统一进入 skills agent loop，不再先做 should-run 判别，LLM 可随时自主选择调用 skills
- 🕒 **实时场景强制检索与校时上下文**: 在 `scripts/chat.js` 的 agent loop 中加入当前时间/时区注入（校时机制），并对“新闻/最新/实时”等问题强制先执行 `web_search_exa` 后再输出最终回复
- 🌤️ **联网检索触发词扩展**: 新增 `needsWebSearchPriority`（覆盖天气/气温、显式“查下/搜一下/联网”等），避免仅问“杭州天气”却无“今天/最新”等词时漏掉强制检索，从而误报「当前回合未产生可执行工具调用」
- 🔗 **Web 检索信源展示**: 规范化 `web_search_exa` 结果（含 `siteLabel`），提示词要求 `final_message` 用 Markdown `[文本](URL)` 引用真实链接；未写入正文的检索 URL 自动追加「参考资料」列表；聊天区内 http(s) 链接通过 `openExternal` 打开
---
#### 🧪 测试与打包
- 精简 `test-cases/`：仅保留真实链路 `live-workflow-chain-real-apis.js`，删除无用/弃用的 Electron E2E 与 mock 测试脚本
- 更新打包忽略：`package.json` 将 `test-cases/**` 排除出安装包内容，避免打包携带测试代码
- 引入 **live-skills** 真链路基准 `npm run test:live-skills`（SiliconFlow + Exa）；细节演进见 **v0.2.5**；报告 json 等在 `.gitignore`
- **Agent 提示词迭代**：`scripts/chat.js` / `skills/orchestrator.js` / `skills/index.js`（契约侧）强调「首轮需检索时只出 tool_calls、勿用 final_message 抢答」「JSON 勿用代码块包裹」「web_search_exa 精确 skillName」，与基准脚本 `buildBenchmarkSystemPrompt` 语义对齐
- **模型下拉显示名**：`main.js` 的 `deriveDisplayName` 不再去掉 `-A3B`/`-A17B` 等后缀，与 SiliconFlow 控制台 `id` 一致，避免 MoE 与稠密同名混淆
- **Orchestrator 工具优先**：`skills/orchestrator.js` 若同一轮 JSON 中同时出现 `tool_calls` 与 `final_message`，优先执行 `tool_calls` 再进入下一轮，避免模型只写空话不触发工具；仅当无 `tool_calls` 时才以 `final_message` 结束
- 删除旧 workflow e2e 测试 `test-cases/live-workflow-chain-real-apis.js`，避免旧链路干扰

#### 🧑‍💻 开发体验
- 默认 `npm run dev` 已切换为无热重载模式；如需热重载可使用 `npm run dev-reload`

---

### 🎉 v0.2.3 (2026-03-10)

#### 🎨 设置页与工作流展示优化
- 📐 **匹配结果列宽重构**: 元件匹配结果表格调整为“元件名称 30% / 匹配状态 35% / 匹配结果 35%”，改善长状态与结果文本的可读性
- 🧩 **设置页卡片细节优化**: 存储位置、AI API、关于、应用更新卡片高度重新校准，移除存储位置卡片多余底部留白，并统一快捷键卡片为单滚动容器，消除双纵向滚动条
- 🗂️ **更新日志入口新增**: 应用更新卡片头部新增“更新日志”按钮，可在设置页内直接查看版本记录
- 📄 **更新日志外置维护**: 应用内更新记录迁移至 `assets/update.txt`，后续维护版本说明无需再修改设置页脚本

#### 🚀 启动体验优化
- 🌑 **Splash前黑窗修复**: 调整启动窗口创建顺序，避免 Splash 出现前先短暂暴露深色空窗口
- ✨ **Splash首帧渲染优化**: Splash 改为在页面完成加载、Logo 就绪并经过首帧渲染后再显示，减少黑屏后瞬间刷出内容的闪现感

#### 🔄 更新机制优化
- 🧪 **开发环境更新检查生效**: 开发环境也可直接检查 GitHub 远程版本，便于验证自动更新流程
- 🧭 **开发版本提示补充**: 当本地版本高于远程版本时，更新状态会显示“当前为开发版本”

#### 🤖 模型列表与计费管理 (核心功能)
- 🌐 **在线模型同步**: 通过官方 `GET /v1/models` 实时拉取 SiliconFlow 在线模型目录，在主进程统一解析、缓存并提供在线→缓存→内置的多级回退
- 🧩 **服务商筛选收口**: 仅保留 `Kimi / Hunyuan / DeepSeek / GLM / Qwen / MiniMax` 六家服务商的模型，并在同一类型内按服务商聚类、已知价格优先、价格升序排序
- 🗂️ **类型标签页切换**: 模型类型改为“对话模型 / 思考模型 / 视觉模型”三个标签页，在下拉内部切换查看，不再把所有模型混在一列
- 💰 **官方价格补全**: 自动解析 `www.siliconflow.com/pricing` 官方价格页，按模型名补齐输入/输出单价；未知计费规则以“计费规则：参考官网 模型页”提示并提供直达链接
- ⭐ **默认与偏好模型置顶**: 记忆用户在各类型下的最近选择（localStorage 持久化），并在对应类型列表中将默认/偏好模型置顶展示，使用浅灰底区分；选中项使用淡蓝色高亮
- 🧱 **模型配置结构升级**: `model_config.json` 从静态模型列表升级为增强规则配置，拆分为 `defaults / filters / overrides` 三层，用于补充能力标签、价格等级、服务商映射和筛选规则

---

### 🎉 v0.2.2 (2026-03-08)

#### 🔄 工作流智能判别系统 (核心功能)
- 🧠 **上下文感知判断**: 工作流判别器现在能够基于对话历史进行智能判断
- 🎯 **精准场景识别**: 区分新需求、基于上下文的追问、修正信息和普通对话
- 📊 **对话历史分析**: 自动分析最近2轮对话，识别工作流相关历史
- 🔍 **详细判断理由**: 输出判断理由，便于调试和优化
- ⚡ **温度参数优化**: 降低判别温度至0.2，提高判断准确性

#### 🐛 重复回复问题修复
- 🔧 **resendMessage修复**: 修复切换模型后重新发送消息时重复触发工作流的问题
- ✅ **工作流判断统一**: sendMessage和resendMessage使用相同的工作流判断逻辑
- 📝 **对话历史传递**: 重新发送消息时也传入对话历史，确保判断一致性

#### 📝 工作流需求分析提示词优化
- 🎯 **完整电路要求**: 明确要求包含主控、电源、传感器、执行器等完整电路必需元件
- 🚫 **产品名称过滤**: 明确禁止将产品名称本身（如"声控灯"）作为元件
- 🔍 **元件类型识别**: 提供详细的元件类型识别指导（声控→声音传感器，测距→超声波传感器等）
- 📋 **功能映射规则**: 增加功能需求到元件的映射规则（需要控制→主控单元，需要检测声音→声音传感器等）
- 🧩 **分类型元件分析**: 提示词改为按主控、电源、传感器、执行器、辅助元件逐类分析，降低遗漏关键器件的概率
- 🚁 **执行器补强**: 针对无人机、云台、机械臂等场景，明确要求必须检查电机、舵机、驱动模块等执行器
- 📐 **方案设计前置**: 在正式匹配元件库前，新增“方案设计”步骤，先输出主控、体积、续航、接口等预估参数
- ✅ **选型校验增强**: 匹配不再只看元件类型，同时校验续航、尺寸、精度、接口等是否满足需求
- 💡 **推荐型号反馈**: 当库内已有同类元件但当前型号不满足需求时，显示推荐型号而非直接视为已匹配

#### 🔁 工作流交互体验升级
- 📋 **方案设计分支**: 新增“开始匹配 / 暂不匹配”分支，支持用户先看方案分析再决定是否发起元件库匹配
- 🔍 **主动检查缺件触发**: 支持“看看还缺什么元件”“检查缺什么元件”“开始匹配”等表达重新发起匹配流程
- 🪄 **匹配结果展示优化**: 匹配表格改为展示元件名称和匹配结果，已匹配显示名称，缺失显示“当前元件库暂无”，选型不满足显示推荐型号
- 🎛️ **后续分支按钮补全**: 元件齐全时补充“自动连线 / 手动连线”入口，缺失时继续显示“自动补全 / 手动补全”

#### 🎨 UI样式优化
- 🎨 **工作流按钮样式**: 优化"自动补全"和"手动补全"按钮样式
  - 文字居中对齐（justify-content: center）
  - 统一padding为8px（上下左右）
  - 移除按钮内的符号图标
- 📊 **匹配结果表格优化**: “匹配状态”和“匹配结果”两列改为等宽，提升查看体验
- 📐 **匹配结果列宽重构**: 元件匹配结果表格调整为“元件名称 30% / 匹配状态 35% / 匹配结果 35%”，改善长状态与结果文本的可读性
- 📦 **元件库面板首屏优化**: 启动时元件库默认收起，移除首屏收起动画，避免界面闪动感
- ⚙️ **系统设置页视觉重构**: 六张设置卡片的头部图标统一改为本地SVG方案，尺寸、居中方式和紫色底板对齐规则保持一致
- 🧩 **设置页卡片细节优化**: 存储位置、AI API、关于、应用更新卡片高度重新校准，移除存储位置卡片多余底部留白，并统一快捷键卡片为单滚动容器，消除双纵向滚动条
- 🔗 **联系作者卡片升级**: 联系方式调整为 GitHub / 小红书 / Email 三个按钮入口，并统一为浅底描边按钮风格
- 🔑 **API密钥弹窗优化**: 增加作者邀请码提示与快捷复制按钮，密钥显隐按钮改为SVG图标并默认以隐藏状态展示
- 🖼️ **图标体系统一收口**: 设置页、更新提示、图片预览与聊天工具按钮逐步统一为本地 Feather 风格 SVG，减少 emoji 与字符图标混用
- 💬 **聊天栏工具按钮美化**: “清空 / 导出”改为带图标的工具按钮，优化字重、尺寸、边框、悬浮反馈和整体质感
- 🏷️ **标题字重调整**: 主页面“电路设计画布”标题加粗到 `font-weight: 600`，提升信息层级清晰度

#### 🚀 启动体验优化
- 🛡️ **Windows禁用GPU加速**: 针对 Windows 环境默认关闭 Electron GPU 硬件加速，规避 GPU 进程崩溃导致的黑白闪烁
- 🎬 **启动Splash页面**: 新增独立 Splash 启动页，使用 Fast Hardware Logo 与动态标题替代白屏等待
- 🎨 **窗口底色统一**: 主窗口增加背景色配置，减少启动阶段纯白闪屏的突兀感
- 📌 **启动时序优化**: Splash 优先显示并保持最短展示时长，主窗口加载完成后再平滑切换
- 🌑 **Splash前黑窗修复**: 调整启动窗口创建顺序，避免 Splash 出现前先短暂暴露深色空窗口
- ✨ **Splash首帧渲染优化**: Splash 改为在页面完成加载、Logo 就绪并经过首帧渲染后再显示，减少黑屏后瞬间刷出内容的闪现感

#### 🛠️ 开发体验优化
- 🧪 **启动调试模式**: 启动阶段日志整理为 debug 模式，仅在 `dev-debug` 或显式开启调试参数时输出
- 🔇 **调试日志降噪**: 渲染进程 MutationObserver 和首屏帧日志只保留启动初期，避免正常交互阶段刷屏
- 🛑 **开发服务器联动退出**: 在开发模式下主动关闭主窗口时，终端中的开发服务器会同步退出，避免文件变更后误重启窗口

#### 🛠️ 技术架构改进
- 📊 **工作流状态管理**: 完善工作流状态保存和恢复机制
- 🔄 **错误处理增强**: 工作流判别失败时默认不走工作流，避免误判追问
- 📝 **调试日志增强**: 添加详细的判别详情日志，包括判断理由和历史分析
- 🪟 **启动窗口拆分**: 主窗口与 Splash 窗口分离管理，支持独立控制显示时机和关闭时序

---

### 🎉 v0.2.1 (2025-11-07)

#### 🤖 智能模型自动切换系统 (核心功能)
- 🔄 **双向智能切换**: 图片输入自动切换到视觉模型，纯文本自动切回对话模型
- ⚙️ **默认模型配置**: 设置默认对话模型(GLM-4-9B)和默认视觉模型(Qwen2.5-VL-32B)
- 🎨 **实时UI更新**: 切换时自动更新模型选择器显示并通知用户
- 🔒 **保留用户选择**: 手动选择Chat/Thinking模型时不会被强制切换，只有非对话类型才切换
- 💬 **智能判断逻辑**: 识别当前模型类型，避免不必要的切换操作
- 📢 **用户友好提示**: 显示切换原因和目标模型信息

#### 📊 模型配置管理系统
- 📁 **配置文件创建**: 新增 `model_config.json` 统一管理所有AI模型信息
- 🔧 **动态加载机制**: 应用启动时自动读取配置文件，支持实时更新
- 🎯 **统一显示格式**: 改为 `Type/DisplayName` 格式（如 Chat/GLM-4-9B）
- ➕ **新增视觉模型**: 添加 Qwen/Qwen3-VL-30B-A3B-Instruct 模型
- 🗑️ **简化配置结构**: 移除不必要的 autoDispatch 字段
- 📋 **模型信息完善**: 包含id、name、displayName、type、capabilities等字段
- 🔄 **IPC通信支持**: 主进程加载配置文件并传递给渲染进程

#### 💬 对话历史智能管理
- 📊 **固定轮数策略**: 有图片时保留2轮对话，纯文本时保留4轮对话
- 🖼️ **图片去重优化**: 历史消息中的图片不再重复发送（AI回复已包含图片描述信息）
- ✂️ **智能截断机制**: 带图请求时AI历史截断到1500字符，纯文本时3000字符
- 💰 **Token优化**: 显著降低API调用的Token消耗和请求体积
- 📝 **占位文本处理**: 纯图片消息在历史中使用"[用户发送了图片]"占位
- 🔍 **详细调试日志**: 记录历史消息处理的详细过程，便于问题排查

#### 🎨 UI/UX 体验提升
- 🏷️ **模型显示初始化**: 修复启动时显示完整模型名称(THUDM/GLM-4-9B-0414)的问题
- ✅ **选中状态同步**: 模型初始化后自动高亮选中状态，展开下拉菜单时即可看到
- 🖼️ **画布初始渲染**: 修复画布首次加载显示空白，需要点击才出现内容的问题
- ⚡ **性能优化**: 移除所有 `backdrop-filter: blur` 效果，消除元件预览的视觉卡顿
- 🎭 **历史消息编辑**: 支持编辑和重新发送历史消息，悬停显示编辑/重发按钮
- 🎨 **按钮交互优化**: 消息操作按钮悬停延迟300ms消失，统一白色背景样式
- 🔄 **图标系统升级**: 使用Feather Icons替换文本图标，下载到/assets目录

#### 🐛 Bug修复与优化
- 🔑 **API Key路径修复**: 区分开发/生产环境，开发环境保存到项目根目录env.local
- 🖼️ **VLM 500错误修复**: 修复图片重复提交导致的API错误（历史消息包含当前消息）
- 🎯 **模型名称传递**: 修复模型切换后API使用UI显示名而非真实API名的问题
- ⏱️ **请求超时延长**: 将API超时时间从60秒延长到180秒
- 📊 **详细错误日志**: 增强VLM API 500错误的诊断信息（图片大小、数量、请求体大小等）
- 🔄 **标签切换重绘**: 修复切换到电路设计标签时画布不自动刷新的问题
- 🎯 **模型选择器等待**: 添加异步等待机制，确保modelConfigManager数据加载完成

#### 🛠️ 技术架构改进
- 🔧 **异步初始化优化**: initializeModelDisplay改为异步，等待配置加载完成
- 🎨 **代码复用提升**: 提取updateModelDisplay和updateModelSelection方法统一管理
- 📋 **状态管理增强**: 统一管理模型显示文本和选中状态的更新逻辑
- 🔄 **IPC通信完善**: 添加loadModelConfig接口，支持开发/生产环境路径处理
- 🎯 **焦点管理优化**: 使用requestAnimationFrame确保DOM渲染完成后再操作Canvas
- 📊 **调试日志系统**: 添加详细的emoji标记日志，清晰追踪执行流程

---

### 🎉 v0.2.0 (2025-11-06)

#### 🚀 项目多标签页管理系统 (核心功能)
- 📑 **多项目标签页**: 新增项目标签栏，支持同时打开多个项目并快速切换
- ➕ **新建项目按钮**: 添加"新建项目"按钮，快速创建空白项目
- 🔄 **项目状态隔离**: 每个项目拥有独立的画布状态，切换时自动保存和恢复
- 💾 **智能状态管理**: 深拷贝机制确保项目间画布数据完全独立，避免状态混乱
- 🔴 **修改状态标记**: 项目修改后显示红点标记，保存后自动消失
- ❌ **项目关闭功能**: 支持关闭单个项目，未保存时弹出确认提示
- 🎯 **画布视图恢复**: 切换项目时自动恢复缩放、平移等视图状态

#### ✨ UI/UX 优化
- 📍 **通知框位置优化**: 通知框移至项目标签栏右侧，高度40px与标签栏一致，不再遮挡按钮
- 🎨 **项目标签栏设计**: 固定高度40px，支持横向滚动，标签样式清晰美观
- ⚙️ **关闭按钮对齐**: 优化项目标签关闭按钮"×"的垂直位置，支持独立调整
- 🔄 **标签切换交互**: 点击标签切换项目，活动标签高亮显示（紫色背景）
- 📐 **画布原点定位**: 新建项目时画布原点自动定位到左下角，与打开项目一致

#### 🐛 关键Bug修复
- 🔧 **元件保存前缀修复**: 修复保存自制元件时前缀错误使用std而非ctm的问题
- 🖼️ **VLM多图重复问题**: 修复多图上传时图片被重复发送导致500错误的bug
- 🎯 **画布状态混乱**: 修复新建/切换项目时画布内容被清空或堆叠的问题
- 🏷️ **项目标签页切换**: 修复一级标签页（元件管理、系统设置）无法切换的CSS问题
- 🔄 **画布状态保存**: 在新建项目前自动保存当前项目状态，防止内容丢失

#### 🛠️ 开发体验优化
- 📊 **详细错误日志**: VLM API调用失败时显示详细的500错误分析
- 🖼️ **图片信息诊断**: 自动统计图片数量、大小、格式等信息，便于排查问题
- 🚨 **智能错误提示**: 根据错误类型提供具体的解决建议
- 🔥 **热重载优化**: dev模式忽略/data文件夹变化，避免保存项目时触发重载
- 💾 **请求详情记录**: API请求前记录完整的请求参数和图片详情

#### 📦 技术架构改进
- 🔧 **IPC通信增强**: debugInfo数据从主进程传递到渲染进程，在浏览器控制台显示
- 🛡️ **状态管理优化**: 使用深拷贝确保项目画布数据独立，避免引用共享
- 📋 **项目数据结构**: 分离projectData（完整项目数据）和canvasData（画布视图状态）
- 🎯 **焦点管理**: 渲染已保存项目时临时禁用画布修改标记，避免误标记

### 🎉 v0.1.9 (2025-09-24)

#### 🐛 代码编辑器Bug修复 (核心功能)
- 🔧 **项目保存代码覆盖修复**: 修复电路设计画布保存项目时覆盖用户编辑的固件代码的问题
- 🛡️ **智能代码保护机制**: 系统自动检测用户编辑痕迹，仅在无用户编辑内容时生成自动代码
- 💾 **代码编辑器状态缓存**: 优化代码编辑器打开/关闭时的内容加载逻辑，确保编辑状态保持
- 📝 **条件代码生成**: 项目保存时智能判断是否覆盖现有代码，保护用户自定义代码

#### ✅ 代码编辑器体验优化
- 🎯 **缓存优先加载**: 代码编辑器重新打开时优先加载最后保存的内容
- 🔄 **项目切换清理**: 切换项目时自动清理代码缓存，防止内容混淆
- 📊 **详细状态日志**: 添加代码加载和保存的详细日志，便于调试
- ⚡ **保存时序优化**: 确保代码保存完成后再进行其他操作

#### ✅ 连线视觉优化 (电路设计增强)
- 🔧 **智能连线宽度**: 引脚多连线时自动调整宽度，第一条连线1x，第二条1.5x，第三条2x，以此类推每次递增0.5x
- 🎨 **动态颜色深度**: 随宽度倍率增加，颜色从浅蓝色渐变到深蓝色，提供更丰富的视觉区分
- 📏 **宽度与颜色协同**: 1x倍率使用浅蓝色(#2196f3)，随着倍率增加趋近深蓝色(#1565c0)
- 📏 **动态宽度计算**: 基于连线在引脚上的顺序位置计算宽度倍数
- 🎯 **跨引脚协调**: 连线在两端引脚上的宽度和颜色取最大值，确保视觉一致性
- ⚡ **实时更新**: 连线增删时自动重新计算和更新所有相关连线的宽度和颜色

#### ✅ 技术架构改进
- 🔧 **IPC通信优化**: 完善主进程与渲染进程间的代码路径传递
- 🛡️ **错误处理增强**: 代码保存失败时的错误处理和用户提示
- 📋 **状态管理完善**: 代码编辑器的状态管理和生命周期管理

#### 🚀 多选功能系统 (全新功能)
- 🎯 **Shift+点击多选**: 按住Shift键点击元件可添加到选择列表，支持批量操作
- 🎨 **多选虚线框**: 选中多个元件时显示蓝色虚线框包裹所有选中元件，考虑旋转坐标
- 🖱️ **批量拖拽**: 多选后点击任意已选元件可整体拖动所有选中元件
- 🗑️ **批量删除**: Delete键可删除所有选中的元件
- 🔄 **智能选择**: 多选状态下避免误选连线，专注元件操作

#### ✅ 撤回功能深度优化
- ⌨️ **即时撤回**: 修复拖拽元件后无法直接Ctrl+Z撤回的问题，无需额外点击
- 🎯 **焦点管理**: 添加canvas tabindex和主动焦点设置，确保键盘事件正确处理
- 💾 **智能保存**: 拖拽开始保存初始状态，结束时仅在真正移动时保存，避免重复保存
- 🔧 **状态完整性**: 多选状态的完整撤回支持，包括元件位置、选择状态和连线关系

### 🎉 v0.1.8 (2025-09-24)

#### 🚀 LLM智能助手集成 (核心功能)
- 🎯 **SiliconFlow AI API接入**: 集成多种AI模型 (GLM-4-9B, GLM-4.1V-9B-Thinking, Qwen3-8B, Hunyuan-MT-7B)
- 💬 **对话界面系统**: 完整的聊天界面，支持流式输出和markdown渲染
- 📝 **智能Markdown渲染**: 集成marked库，支持标题、列表、代码块、粗体斜体等格式
- 🔧 **代码块处理引擎**: 智能提取代码块，用占位符替换后渲染，再精确插入
- 🎨 **嵌套列表支持**: 支持多层嵌套的无序和有序列表
- 🔢 **标题序号清理**: 自动清理markdown标题中的序号前缀
- ⚡ **实时对话同步**: 支持打字指示器、中断功能和消息时间戳
- 🛡️ **API密钥安全**: 支持API密钥的可见性切换和持久化存储

#### ✅ Markdown渲染系统深度完善
- 🎯 **marked库集成**: 使用业界标准的markdown渲染引擎
- 📦 **代码块智能处理**: 提取代码块 → 渲染纯文本 → 重新插入代码块
- 🔧 **标题序号清理**: 支持多级序号清理 (1.2.3等)
- 📋 **嵌套列表支持**: 递归解析多层嵌套结构
- 🎨 **样式统一**: 代码块、标题、列表的完整样式支持
- ⚡ **性能优化**: 高效的渲染算法和内存管理

#### ✅ 对话体验全面优化
- 💬 **流式消息渲染**: 支持实时消息流式输出
- 🕐 **时间戳显示**: 消息精确到秒的时间显示
- 🔄 **中断功能**: 支持手动中断AI回复
- 🎨 **消息气泡**: 用户和AI消息的差异化显示
- 📱 **响应式布局**: 适配不同屏幕尺寸
- 🎯 **快捷键支持**: Enter发送，Shift+Enter换行

#### ✅ 代码块功能深度完善
- 🔧 **语法高亮**: 代码块支持多种编程语言标识
- 📋 **一键复制**: 复制按钮直接复制代码内容
- 📏 **自动滚动**: 长代码自动启用滚动条
- 🎨 **美观样式**: 专业的代码块外观设计
- 🏷️ **语言标识**: 显示代码语言类型
- 📏 **尺寸控制**: 合理的代码块尺寸和字体

#### ✅ 技术架构升级
- 🔧 **模块化重构**: 彻底重构markdown渲染系统
- 📚 **marked集成**: 使用成熟的markdown处理库
- 🔄 **API抽象**: 支持多种LLM服务提供商
- 🛡️ **错误处理**: 完善的API调用错误处理和重试机制
- 📊 **状态管理**: 完整的对话历史和上下文管理
- ⚡ **性能优化**: 高效的渲染和缓存机制

### 🎉 v0.1.7 (2025-09-23)

#### 🚀 系统元件库路径配置 (核心功能)
- 🎯 **双路径管理**: 新增系统元件库存储位置设置，与项目文件夹独立管理
- 📂 **自定义元件库**: 支持用户选择外部文件夹作为元件库保存地址
- 🔧 **智能目录创建**: 自动检测并创建标准元件和自定义元件子文件夹
- 💾 **路径持久化**: 元件库路径设置保存到用户配置文件

#### ✅ 打包部署系统完善
- 📦 **完整数据打包**: data文件夹作为松散文件包含在安装包中
- 🏗️ **路径解析优化**: 打包环境正确解析resources/data目录结构
- 🔧 **安装程序优化**: 只输出NSIS安装程序和unpacked目录，去除ZIP包
- 🚀 **跨环境兼容**: 开发环境和打包环境路径处理统一

#### ✅ 元件保存机制深度完善
- 🎨 **结构化ID生成**: 统一元件ID格式 `[prefix]-[name]-[timestamp]`
- 📁 **智能文件夹管理**: 自动创建和验证元件库目录结构
- 🔄 **编辑模式优化**: 智能查找原文件位置，支持覆盖保存
- 💫 **保存反馈增强**: 详细的保存状态提示和错误处理

#### ✅ 调试体验全面提升
- 📝 **路径日志输出**: 元件库加载时显示详细的读取路径信息
- 🐛 **错误诊断改进**: 提供清晰的路径相关错误信息
- 🔍 **控制台调试**: 便于用户通过开发者工具排查问题

#### ✅ 代码质量优化
- 🧹 **冗余文件清理**: 移除已完成任务的开发辅助脚本
- 📚 **文档同步更新**: CHANGELOG和PRD文档与实际进展保持同步
- 🔧 **配置标准化**: 统一的构建配置和开发工具链

### 🎉 v0.1.6 (2025-09-14)

#### 🚀 项目导入导出系统 (核心功能)
- 🎯 **智能项目导入**: 支持选择项目文件夹，自动验证结构并加载到画布
- 💾 **结构化项目保存**: 区分新项目和现有项目，智能保存机制
- 📁 **标准化项目结构**: components/、circuit_config.json、*.ino文件的完整管理
- 🔄 **数据完整性保障**: 确保元件、连线、画布状态完全同步
- 🎨 **连线跟随功能**: 元件移动时连线自动更新路径
- 🔧 **元件ID稳定化**: 基于类型和位置的稳定ID生成算法

#### ✅ 设置系统深度完善
- 🔑 **API密钥管理**: 支持可见性切换、预填充、持久化存储
- 📂 **项目存储路径**: 统一配置项目保存位置到env.local
- ⌨️ **快捷键说明**: 完整的键盘快捷键参考文档
- 🌐 **外部链接**: 点击跳转到个人网站 (www.design2002.xyz)
- 💾 **配置持久化**: 所有设置自动保存到本地配置文件

#### ✅ 窗口启动体验优化
- 🎯 **智能窗口居中**: 首次启动自动居中显示，解决贴近导航栏问题
- 📐 **跨显示器兼容**: 完美支持多显示器环境和不同分辨率
- 💾 **位置验证机制**: 智能检测窗口位置有效性，自动调整到安全区域

#### ✅ 技术架构增强
- 🔄 **连线系统优化**: 支持手动创建和导入连线的一致性处理
- 🎨 **元件渲染改进**: 朝向控制、尺寸同步、视觉反馈优化
- 📊 **数据结构标准化**: 统一的元件ID和连线引用机制
- 🛠️ **错误处理完善**: 详细的调试信息和错误恢复机制

#### ✅ 用户体验全面提升
- 🎯 **操作反馈优化**: 保存成功提示、加载状态显示
- 🔄 **数据同步完善**: 画布状态与文件系统的实时同步
- 📝 **调试体验改善**: 关键日志保留，冗余日志清理

### 🎉 v0.1.5 (2025-09-11)

#### 🚀 悬浮元件库系统 (全新功能)
- 🎨 **智能悬浮面板**: 左侧悬浮元件库，默认10px窄条收起状态，一键展开
- 📐 **自适应设计**: 高度60%自适应画布区，宽度10px精简，圆角8px现代美观
- 🖱️ **流畅拖拽**: HTML5原生拖拽API，从面板到画布的无缝拖拽体验
- 🎯 **精确渲染**: 圆角矩形主体、多色引脚编码、智能文字居中布局
- 📱 **响应式适配**: 完美支持桌面端、平板端、移动端三种设备类型
- ✨ **悬停反馈**: 动态宽度变化(10px→12px)、颜色过渡，优秀的交互体验
- 🎪 **视觉特效**: 阴影效果、平滑动画过渡，专业级UI设计
- 🔧 **文件系统集成**: 完全基于真实JSON文件，实时同步元件库更新

#### ✅ 用户体验优化
- 新增保存成功提示功能，支持覆盖保存、重命名保存等多种场景
- 修复输入框焦点问题，提高元件设计器稳定性
- 优化窗口尺寸记忆功能，支持最大化状态保存

#### ✅ 元件管理系统完善
- 实现编辑模式与复用模式的智能区分
- 修复编辑模式保存位置错误问题
- 优化元件ID生成策略，确保编辑时覆盖原文件

#### ✅ 复用功能深度修复
- 🐛 修复元件复用初次点击内容不应用的问题
- ✨ 修复元件复用时位置闪烁的视觉问题
- 🔧 修复渲染器初始化警告，消除控制台噪音
- 🎯 修复复用元件ID前缀错误，根据保存位置自动确定前缀
- 💫 优化元件设计器初始化流程，提高响应速度

#### ✅ 删除功能完善
- 🐛 修复删除元件确认弹窗不显示的问题
- 🔧 清理防重复点击的冗余逻辑
- 💪 增强错误处理和调试能力
- 🎨 自定义删除确认对话框，提升用户体验

#### ✅ 技术架构改进
- 完善跨平台兼容性，支持Windows/macOS/Linux
- 优化开发工具链，添加平台检测和错误诊断
- 增强IPC通信安全性和稳定性

#### ✅ 界面样式统一优化
- 🎨 统一标准元件页和自制元件页管理按钮样式，采用红色背景与元件预览页保持一致
- 🔧 修复管理按钮在"返回预览"和"删除元件"状态下的样式统一问题
- ✨ 提升界面视觉一致性，改善用户操作体验

#### ✅ 页面刷新机制完善
- 🐛 修复标准元件页和自制元件页删除元件后页面不自动刷新的问题
- 🔄 优化删除操作后的页面更新逻辑，确保实时反映数据变化
- 💫 提升删除操作的用户体验，避免手动切换页面才能看到更新

#### ✅ 控制台日志深度清理
- 🧹 清理元件设计器缩放操作相关的冗余日志输出
- 🗂️ 清理标签页切换操作的调试日志
- 📝 清理渲染和画布操作的详细日志
- 🔇 大幅减少控制台噪音，提升开发调试体验
- 🎯 保留关键错误日志和重要状态变化日志

### 🎉 v0.1.3 (2025-09-11)

#### ✅ 输入框焦点问题深度修复
- 彻底解决重置元件后输入框无法使用的问题
- 替换原生confirm对话框为自定义对话框，避免焦点丢失
- 增强输入框状态管理，支持标签页切换和窗口焦点变化

#### ✅ 智能ID自动生成功能
- 无需手动输入ID，系统自动生成唯一标识
- 支持中文名称智能转换为英文标识
- 基于元件名称和类别生成可读性强的ID
- 包含时间戳确保ID唯一性
- 格式规范：`[名称]-[时间戳]` 或 `[类别前缀]-[时间戳]`

#### ✅ 保存成功提示功能
- 保存成功后显示友好的绿色通知提示
- 支持新元件保存、重命名保存和覆盖保存
- 通知显示元件名称和操作结果
- 自动消失，不干扰用户操作
- 增强用户操作反馈体验

### 🎉 v0.1.2 (2025-09-11)

#### ✅ 窗口尺寸记忆功能
- 自动保存和恢复窗口尺寸、位置
- 智能边界检查防止窗口超出屏幕
- 实时同步保存配置（防抖优化）
- 完整支持最大化状态保存和恢复

#### ✅ 用户体验大幅提升
- 专业的桌面应用体验
- 窗口状态持久化
- 智能错误恢复机制

### 🎉 v0.1.1 (2025-09-10)

#### ✅ 跨平台兼容性大幅提升
- 智能平台检测和命令适配
- 统一的开发工具链
- 完善的错误处理系统

#### ✅ 元件设计器功能完善
- 智能尺寸调整算法
- 动态属性绑定和同步
- 编辑模式状态保护

#### ✅ 开发体验优化
- 平台检测工具集成
- 智能错误诊断提示
- 详细的调试信息输出

### 🎉 v0.1.0 (2025-09-01)

#### ✅ 初始项目模板
- 基础UI界面
- 安全的IPC通信
- 跨平台构建配置

## 📋 开发路线图

### ✅ 已完成 (v0.1.6)

#### 🎯 MVP核心功能
- ✅ **跨平台兼容性**: Windows/macOS/Linux全平台支持
- ✅ **元件设计器**: 可视化元件设计，智能尺寸调整
- ✅ **窗口尺寸记忆**: 专业的桌面应用体验，自动保存窗口状态
- ✅ **元件库系统集成**: 预览页↔编辑页双向集成，JSON验证，重复处理等

#### 中等优先级任务 (元件库管理)
- ✅ **元件预览标签页**: 缩略图展示系统级元件库
- ✅ **元件绘制标签页**: 自定义元件设计画布

### 🚀 阶段二：功能扩展

#### 电路设计画布
- ✅ 拖拽操作 (元件拖拽、放置、旋转)
- ✅ 连线系统 (手动连线功能，支持路径编辑)
- ✅ 实时同步 (画布操作与JSON数据实时同步)
- ✅ 快捷键 (Ctrl+S保存，丰富的编辑快捷键)
- ✅ 项目导入导出 (完整文件夹管理，支持新项目和现有项目)

#### LLM智能助手
- 🔄 自然语言交互 (通过对话描述需求)
- 🔄 智能推荐 (LLM分析需求并推荐硬件方案)
- 🔄 自动生成 (基于对话自动生成电路图)
- 🔄 API集成 (支持多种LLM服务提供商)

### 🎨 阶段三：优化与增强
- 🔄 UI/UX优化 (提升用户体验)
- 🔄 更多预设元件 (增加常用硬件元件)
- 🔄 高级LLM交互 (错误排查和代码优化建议)
- 🔄 项目模板 (添加示例库)

## 🔧 开发指南

### 🏗️ 核心架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   主进程        │    │   预加载脚本    │    │   渲染进程      │
│   (main.js)     │◄──►│  (preload.js)   │◄──►│  (renderer.js)  │
│                 │    │                 │    │                 │
│ • 应用生命周期  │    │ • API安全暴露   │    │ • UI交互        │
│ • 窗口管理      │    │ • IPC通信桥接   │    │ • DOM操作       │
│ • 系统操作      │    │ • 上下文隔离    │    │ • 事件处理      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 📁 核心文件说明

| 文件 | 职责 | 安全特性 |
|------|------|----------|
| **`main.js`** | 应用生命周期、窗口管理、系统操作 | 主进程安全 |
| **`preload.js`** | API安全暴露、IPC通信桥接 | 上下文隔离 |
| **`index.html`** | 应用界面骨架、资源引用 | - |
| **`scripts/`** | 前端功能模块、UI逻辑 | 渲染进程安全 |

### 🛡️ 安全最佳实践

本项目严格遵循Electron安全标准：

- ✅ **上下文隔离**: `contextIsolation: true`
- ✅ **Node集成禁用**: `nodeIntegration: false`
- ✅ **预加载脚本**: 安全API暴露机制
- ✅ **远程模块禁用**: `enableRemoteModule: false`

### 🎨 界面定制

#### 🎨 主题色彩修改

在 `styles/main.css` 中自定义颜色：

```css
:root {
    /* 主色调 */
    --primary-color: #007bff;
    --secondary-color: #6c757d;

    /* 背景色 */
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;

    /* 文字颜色 */
    --text-primary: #212529;
    --text-secondary: #6c757d;
}
```

### 🔍 调试工具

#### 开发者工具
```bash
npm run dev-debug  # 启动并打开开发者工具
```

#### 平台检测
```bash
npm run check-platform  # 环境兼容性检测
```

#### 错误诊断
```bash
npm run error-help      # 智能错误分析
```

#### 控制台调试
```javascript
// 在浏览器控制台中运行
debugComponentDesigner()  // 查看元件设计器状态
```

## 📚 相关文档

### 📖 快速链接
- 🐛 [问题反馈](https://github.com/Designer-Awei/fast-hardware/issues)
- 💡 [功能建议](https://github.com/Designer-Awei/fast-hardware/discussions)
- 📖 [使用文档](https://github.com/Designer-Awei/fast-hardware/wiki)
- 🔄 [最新发布](https://github.com/Designer-Awei/fast-hardware/releases)

### 📚 文档列表
| 文档 | 说明 | 重要性 |
|------|------|--------|
| **[PRD.md](PRD.md)** | 产品需求文档 - 详细的功能规划和技术架构 | 🔴 核心 |
| **[edit_prd.md](edit_prd.md)** | 开发记录 - 完整的技术实现和修复记录 | 🟡 重要 |
| **[data/README.md](data/README.md)** | 数据结构说明 - JSON格式规范和使用指南 | 🟡 重要 |
| **[原始需求文档](Fast%20Hardware.txt)** | 项目初始需求和设计思路 | 🟢 参考 |

## 🤝 贡献指南

### 🚀 参与贡献

1. **Fork 项目**
   ```bash
   git clone https://github.com/Designer-Awei/fast-hardware.git
   cd fast-hardware
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/AmazingFeature
   # 或者
   git checkout -b fix/BugFix
   ```

3. **提交更改**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```

4. **推送到分支**
   ```bash
   git push origin feature/AmazingFeature
   ```

5. **创建 Pull Request**

### 📋 贡献类型

- 🐛 Bug 修复: 修复已知问题
- ✨ 新功能: 添加新特性
- 📚 文档: 改进文档和注释
- 🎨 UI/UX: 界面和用户体验改进
- 🌐 国际化: 多语言支持
- 🧪 测试: 添加或改进测试

### 🔧 开发规范

- 遵循现有的代码风格
- 添加必要的注释和文档
- 确保跨平台兼容性
- 提交前运行测试

## 🔍 调试和故障排除

### 📞 获取帮助

1. **📖 查看文档**
   - [详细使用指南](https://github.com/Designer-Awei/fast-hardware/wiki)
   - [常见问题解答](https://github.com/Designer-Awei/fast-hardware/wiki/FAQ)

2. **🐛 报告问题**
   - [GitHub Issues](https://github.com/Designer-Awei/fast-hardware/issues)
   - 请提供详细的错误信息和复现步骤

3. **💬 社区讨论**
   - [GitHub Discussions](https://github.com/Designer-Awei/fast-hardware/discussions)
   - 分享使用经验和建议

### 🔧 故障排除

遇到问题时，请按以下步骤操作：

1. **环境检查**: `npm run check-platform`
2. **依赖更新**: `npm install`
3. **缓存清理**: `npm run cache clean --force`
4. **错误诊断**: `npm run error-help`
