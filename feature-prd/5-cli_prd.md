# Fast Hardware - CLI 能力规划 PRD（5-cli_prd）

> **文档状态**：规划 + 实现进度对照（截至 2026-05-29）  
> **代码入口**：`cli/index.js` · `npm run cli` · 详见 [`cli/README.md`](../cli/README.md)

## 1. 背景与目标

- 当前 skill 编排已在主进程落地，但「画布读写、连线应用、代码编辑」等能力仍分散在 UI/引擎调用链中，端到端自动化验证成本高。
- 目标是在仓库根目录新增 `cli/` 能力层，提供稳定命令接口，供：
  - skill 执行器复用；
  - 主 agent 在受控场景下编排；
  - 本地与 CI 端到端测试直接调用。

## 2. 实现进度总览（2026-05-29）

| 能力 | 命令 | 状态 | 说明 |
|------|------|------|------|
| 帮助 | `help` | ✅ 已实现 | `lib/io.js` 内联帮助文案 |
| 画布只读 | `canvas:read` | ✅ 已实现（真实数据） | 读 `data/projects/*/circuit_config.json` |
| 连线计划 | `wiring:plan` | ⚠️ 部分实现 | 读真实画布 + 规则生成 `plannedOperations`，**不落盘** |
| 固件补丁建议 | `firmware:patch` | ⚠️ 部分实现 | 结构化 `patchPlan` / `patch` 输出，**不写文件** |
| 项目层 | `project:*` | ❌ 未实现 | 仅见于 `cli/CLI_CONTRACTS.md` 草案 |
| 画布写入 | `canvas:component:*` / `canvas:connection:*` | ❌ 未实现 | 契约已列，无 `index.js` 分发 |
| 固件读写落盘 | `firmware:read` / `apply` / `save` | ❌ 未实现 | 同上 |

**当前可运行命令（4 个）**：`help`、`canvas:read`、`wiring:plan`、`firmware:patch`。

**与契约文档关系**：`cli/CLI_CONTRACTS.md`（Draft v0.1）描述主 Agent 远期全量协议；**仓库内仅上表 ✅/⚠️ 项有对应 `commands/` + `api/` 实现**。

---

## 3. 范围

### 3.1 一期 In scope（原始规划）

1. 统一命令入口与参数解析（Node CLI）。
2. 最小命令集合（读能力 + 示例写能力）。
3. JSON 输出规范：成功/失败字段、错误码、metadata。
4. dry-run 机制与可观测日志。

### 3.2 一期 Out of scope（仍成立）

- 不直连 Electron DOM / 主进程 IPC（`api/*` 以本地文件 + 规则为主）。
- 不直接修改生产画布文件与完整工程代码（`wiring:plan` / `firmware:patch` 均为计划输出）。
- 不做权限沙箱（仅保留接口位）。

### 3.3 已实现能力边界（如实记录）

| 命令 | 真实 vs 模拟 | 数据源 / 逻辑 |
|------|----------------|---------------|
| `canvas:read` | **真实只读** | `process.cwd()/data/projects/<name>/circuit_config.json`；未指定 `--project` 时取目录下 **mtime 最新** 且含 `circuit_config.json` 的子目录 |
| `wiring:plan` | **半真实** | 通过 `canvas-api` 读真实快照；计划为 **确定性规则**（含「断开/移除/删除」→ `remove_connection` 首条连线；否则元件≥2 → `add_connection`），非完整 `wiring_edit_skill` / LLM |
| `firmware:patch` | **模板 dry-run** | 根据 `--code` 是否含 `setup`/`loop` 生成 `patchPlan` 与 unified diff 样式 `patch` 文本；**不读目标文件、不写盘** |

---

## 4. 用户故事

1. 作为开发者，我希望通过命令行快速验证某条编排链路，不依赖 UI 点击。
2. 作为 skill 作者，我希望复用统一 API，避免每个 skill 自己拼接 IPC 参数。
3. 作为测试工程师，我希望在 CI 中固定输入，得到可断言的结构化 JSON。

---

## 5. 信息架构（当前仓库）

```text
cli/
  index.js                 # 命令入口、parseArgv、分发
  commands/
    canvas-read.js         # canvas:read
    wiring-plan.js         # wiring:plan
    firmware-patch.js      # firmware:patch
  api/
    canvas-api.js          # listProjects / resolveProjectConfig / readCanvasSnapshot
    wiring-api.js          # planWiring（依赖 canvas-api）
    firmware-api.js        # patchFirmware
  lib/
    io.js                  # help / printJsonAndExit / failAndExit
  README.md                # 运行示例与能力边界
  CLI_CONTRACTS.md         # 远期全量命令 JSON 契约（多数未实现）
```

---

## 6. 命令契约（已实现细节）

### 6.1 `canvas:read` ✅

- **入参**：`--project <目录名|config 文件路径?>` · `--format json|text`
- **出参**（`data`）：
  - `snapshot`：json 时为完整对象（含 `components[]`、`connections[]`、`componentCount`、`connectionCount`、`configPath` 等）；text 时为摘要多行字符串
  - `source`：固定 `runtime:data/projects`（**非 mock**）
  - `format`：`json` | `text`
- **错误**：项目不存在 / `data/projects` 下无可用工程 → 抛错经 `index.js` 转为 `UNCAUGHT` 退出码 1

**示例**：

```bash
npm run cli -- canvas:read --project sample-led-project --format json
```

### 6.2 `wiring:plan` ⚠️

- **入参**：`--requirement "<text>"`（**必填**）· `--project <id?>` · `--dry-run`（标志位，当前仅写入 `meta.dryRun`，行为仍为计划输出）
- **出参**（`data`）：
  - `plannedOperations[]`：与 `wiring_edit_skill` 对齐的操作结构（`add_connection` / `remove_connection`）
  - `missingParts[]`：无法生成操作时的阻塞说明
  - `rationale`：人类可读摘要
  - `usedCanvasSnapshot`：本次计划所依据的画布快照对象
- **缺参**：无 `requirement` → `success: false`，`error.code: INVALID_ARGS`

**示例**：

```bash
npm run cli -- wiring:plan --requirement "桌面风扇自动启停" --project sample-led-project --dry-run
```

### 6.3 `firmware:patch` ⚠️

- **入参**：`--target <file>` · `--requirement "<text>"`（均必填）· `--code "<source>"` · `--language <lang>`（默认 `arduino`）· `--dry-run`
- **出参**（`data`）：
  - `summary` · `patchPlan[]`（`op` / `target` / `description`）· `patch`（unified diff 风格字符串）· `notes[]` · `targetPath` · `language`
- **行为**：默认 **不落盘**；`patch` 为 CLI 生成的示意 diff，非对磁盘文件的真实 diff
- **缺参**：缺 `target` 或 `requirement` → `INVALID_ARGS`

**示例**：

```bash
npm run cli -- firmware:patch --target src/main.c --requirement "增加过流保护" --language c --dry-run
```

### 6.4 未实现命令（契约见 `CLI_CONTRACTS.md`）

- **项目层**：`project:create` · `project:switch` · `project:list` · `project:save`
- **画布写入**：`canvas:component:add` · `canvas:component:move` · `canvas:connection:add` · `canvas:connection:remove`
- **固件**：`firmware:read` · `firmware:apply` · `firmware:save`
- **推荐实现顺序**（契约 §5）：project → canvas 写入 → firmware 读/写 → `project:save` 统一落盘

---

## 7. 统一输出规范

成功：

```json
{
  "success": true,
  "command": "wiring:plan",
  "data": {},
  "meta": {
    "timestamp": "2026-05-29T00:00:00.000Z",
    "dryRun": true
  }
}
```

失败（参数校验由 command 层返回；未知命令 / 未捕获异常由 `lib/io.js`）：

```json
{
  "success": false,
  "command": "wiring:plan",
  "error": {
    "code": "INVALID_ARGS",
    "message": "requirement is required"
  }
}
```

| `error.code` | 场景 |
|--------------|------|
| `INVALID_ARGS` | 各 command 必填参数缺失 |
| `UNKNOWN_COMMAND` | `index.js` 未注册命令 |
| `UNCAUGHT` | API 抛错或未处理异常 |

---

## 8. 与 Skills / Agent 的关系

- skill 可 `require('cli/api/*')` 复用能力层，避免散落私有函数（当前尚无主进程 IPC 桥接）。
- agent 层只编排「能力意图」；真实 Electron 运行时接入后，测试可从「读 `circuit_config.json`」扩展到 IPC/引擎。
- **`wiring:plan` 与 `wiring_edit_skill`**：结构已对齐 `plannedOperations`，逻辑仍为 CLI 侧最小规则，**未调用**主进程 skill 引擎。

---

## 9. 里程碑与验收

| 里程碑 | 状态 | 内容 |
|--------|------|------|
| M1 | ✅ 完成 | 骨架 + `help` + 三命令 JSON 输出 + `cli/README.md` |
| M2 | ✅ 完成 | `canvas:read` 接入 `data/projects/*/circuit_config.json`（`meta.source = runtime:data/projects`） |
| M3 | 🔄 进行中 | `wiring:plan` 读真实画布并输出 `plannedOperations`；**待办**：对接 `wiring_edit_skill` / 规则或 LLM 与主进程一致 |
| M4 | 🔄 进行中 | `firmware:patch` 结构化 `patchPlan` + `--code` 上下文；**待办**：`firmware:read` / `apply` / 确认式落盘 |
| M5+ | 📋 未开始 | `CLI_CONTRACTS.md` 中 project / canvas 写入 / firmware 落盘命令 |

### M1 验收（已通过）

- `node cli/index.js help` 或 `npm run cli -- help` 可用。
- 三个业务命令可执行并输出结构化 JSON。
- 错误参数返回统一错误对象；未知命令与非 0 退出码可用。

### 建议下一迭代优先级

1. `firmware:read`（读工程内真实 `.ino`/`.c`）+ `firmware:apply`（dry-run 预览后可选写盘）。
2. `wiring:plan` 复用或调用现有 `wiring_edit_skill` 计划生成，减少与 UI 行为偏差。
3. `project:list` / `project:switch` 与 Electron 会话对齐，或继续以 `data/projects` 为唯一真源直至 IPC 就绪。

---

## 10. 下一阶段命令契约

- 清单文档：**[`cli/CLI_CONTRACTS.md`](../cli/CLI_CONTRACTS.md)**（Draft v0.1，含各命令输入/输出 JSON 示例）。
- 约束（远期，与现实现一致部分已落地）：
  - 默认结构化 JSON，统一 `success` / `command` / `data` / `meta`。
  - 非只读命令建议 `dry-run` 或最小副作用（当前 `wiring:plan`、`firmware:patch` 已遵循「只输出计划」）。
  - `project:save --path` 规划为画布 + 固件 + 元数据一次性落盘入口（**未实现**）。

---

## 11. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-04-07 | 初版 PRD；M1 mock 三命令；`firmware:patch` 结构化输出草案 |
| 2026-05-29 | 对照 `cli/*` 源码刷新：实现进度表、真实/模拟边界、里程碑状态、已实现命令参数与错误码 |
