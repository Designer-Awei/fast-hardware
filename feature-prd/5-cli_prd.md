# Fast Hardware - CLI 能力规划 PRD（5-cli_prd）

## 1. 背景与目标
- 当前 skill 编排已在主进程落地，但“画布读写、连线应用、代码编辑”等能力仍分散在 UI/引擎调用链中，端到端自动化验证成本高。
- 目标是在仓库根目录新增 `cli/` 能力层，提供稳定命令接口，供：
  - skill 执行器复用；
  - 主 agent 在受控场景下编排；
  - 本地与 CI 端到端测试直接调用。

## 2. 范围（一期）
### In scope
1. 统一命令入口与参数解析（Node CLI）。
2. 最小命令集合（读能力 + 示例写能力）：
   - `canvas:read`（读取画布快照，先 mock）
   - `wiring:plan`（生成连线计划，先 mock）
   - `firmware:patch`（生成代码补丁建议，先 mock）
3. JSON 输出规范：成功/失败字段、错误码、metadata。
4. dry-run 机制与可观测日志。

### Out of scope
- 一期不直连 Electron DOM。
- 一期不直接修改生产画布文件与完整工程代码（先 mock 或 dry-run）。
- 一期不做权限沙箱（仅保留接口位）。

## 3. 用户故事
1. 作为开发者，我希望通过命令行快速验证某条编排链路，不依赖 UI 点击。
2. 作为 skill 作者，我希望复用统一 API，避免每个 skill 自己拼接 IPC 参数。
3. 作为测试工程师，我希望在 CI 中固定输入，得到可断言的结构化 JSON。

## 4. 信息架构
```text
cli/
  index.js                 # 命令入口
  commands/
    canvas-read.js
    wiring-plan.js
    firmware-patch.js
  api/
    canvas-api.js
    wiring-api.js
    firmware-api.js
  lib/
    io.js                  # 输出/错误/帮助
```

## 5. 命令契约（一期草案）
### 5.1 `canvas:read`
- 入参：`--project <id?>` `--format json|text`
- 出参：
  - `success: true`
  - `data.snapshot`（一期可为 mock）
  - `meta.source`（`mock` / `runtime`）

### 5.2 `wiring:plan`
- 入参：`--requirement "<text>"` `--dry-run`
- 出参：
  - `success: true`
  - `data.operations[]`（连线操作草案）
  - `data.missingParts[]`（缺件与阻塞说明）

### 5.3 `firmware:patch`
- 入参：`--target <file>` `--requirement "<text>"` `--dry-run`
- 出参：
  - `success: true`
  - `data.patch`（统一 patch 文本或片段数组）
  - `data.notes[]`（依赖/风险说明）

## 6. 统一输出规范
```json
{
  "success": true,
  "command": "wiring:plan",
  "data": {},
  "meta": {
    "timestamp": "2026-04-07T00:00:00.000Z",
    "dryRun": true
  }
}
```

失败：
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

## 7. 与 Skills / Agent 的关系
- skill 可直接调用 `cli/api/*`，而不是散落调用各处私有函数。
- agent 层只编排“能力意图”，不耦合具体 Electron 实现细节。
- 当 CLI 接入真实运行时（IPC/本地引擎）后，测试用例可从 mock 平滑切换到真实模式。

## 8. 里程碑
1. M1（本次）：最小可运行骨架 + 3 个 mock 命令 + 文档。
2. M2：接入 `canvas:read` 的真实数据源（只读）。
3. M3：`wiring:plan` 接入现有 `wiring_edit_skill` 计划结构。
4. M4：`firmware:patch` 与代码编辑流程打通（先 dry-run，后确认落盘）。

### M4 进展（2026-04-07）
- `firmware:patch` 已从 mock 提升为结构化输出：`summary` + `patchPlan[]` + `patch` + `notes[]`。
- 命令新增可选上下文参数：`--code "<source>"`、`--language <lang>`，用于更贴近真实代码编辑场景。
- 当前仍保持“默认不落盘”，为后续接入主 agent 的确认式写入链路做准备。

## 9. 验收标准（M1）
- `node cli/index.js help` 可用。
- 三个命令能执行并输出结构化 JSON。
- 错误参数返回统一错误对象与非 0 退出码。

## 10. 下一阶段命令契约（为主 Agent 接入准备）
- 已新增契约清单文档：`cli/CLI_CONTRACTS.md`（含每个命令的输入/输出 JSON 示例）。
- 覆盖能力分层：
  1. 项目层：`project:create` / `project:switch` / `project:list` / `project:save`
  2. 画布层：`canvas:component:add` / `canvas:component:move` / `canvas:connection:add` / `canvas:connection:remove` / `canvas:read`
  3. 固件层：`firmware:read` / `firmware:patch` / `firmware:apply` / `firmware:save`
- 约束：
  - 默认结构化 JSON 输出，统一 `success/command/data/meta`。
  - 非只读命令建议支持 `dry-run` 或最小副作用模式。
  - `project:save --path` 作为统一落盘入口，负责画布、固件与项目元数据一致性。
