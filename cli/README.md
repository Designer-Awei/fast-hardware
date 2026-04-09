# Fast Hardware CLI（最小骨架）

## 运行
- `node cli/index.js help`
- `node cli/index.js canvas:read --format json`
- `node cli/index.js wiring:plan --requirement "桌面风扇自动启停" --project sample-led-project --dry-run`
- `node cli/index.js firmware:patch --target src/main.c --requirement "增加过流保护" --language c --dry-run`

## 目录说明
- `index.js`：命令入口与分发
- `commands/`：命令层（参数校验 + 统一输出）
- `api/`：能力层（后续可替换为真实 IPC/引擎调用）
- `lib/io.js`：help / 错误 / JSON 输出

## 当前能力边界
- 这是一期最小可运行骨架，`api/*` 以 mock 返回为主。
- `canvas:read` 已接入 `data/projects/*/circuit_config.json` 真实只读。
- `wiring:plan` 输出与 `wiring_edit_skill` 对齐的 `plannedOperations` 结构（M3 第一步，仍 dry-run）。
- `firmware:patch` 已支持结构化 `patchPlan + patch + notes` 输出，可传 `--code` 提供现有代码上下文；默认仍为 dry-run 方案输出，不直接改写文件。
- 后续可将 `api/*` 逐步接入 `CircuitSkillsEngine` / 主进程 IPC。
