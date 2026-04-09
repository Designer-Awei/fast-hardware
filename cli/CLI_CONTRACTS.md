# Fast Hardware CLI 命令契约清单（Draft v0.1）

> 目标：为主 agent 接入提供稳定、可编排、可测试的 CLI 协议。  
> 默认输出均为 JSON；除只读命令外，建议默认 `--dry-run`。

## 1) 通用约定

- 通用成功结构：

```json
{
  "success": true,
  "command": "project:create",
  "data": {},
  "meta": {
    "timestamp": "2026-04-07T00:00:00.000Z",
    "dryRun": false
  }
}
```

- 通用失败结构：

```json
{
  "success": false,
  "command": "project:create",
  "error": {
    "code": "INVALID_ARGS",
    "message": "name is required"
  }
}
```

---

## 2) 项目与会话层

### 2.1 `project:create`
- 输入示例：
```json
{ "name": "soil-alert", "path": "D:/AI_project/projects", "template": "blank" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "project:create",
  "data": {
    "projectId": "proj-soil-alert-20260407-001",
    "name": "soil-alert",
    "path": "D:/AI_project/projects/soil-alert",
    "isSaved": true
  }
}
```

### 2.2 `project:switch`
- 输入示例：
```json
{ "projectId": "proj-soil-alert-20260407-001" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "project:switch",
  "data": { "activeProjectId": "proj-soil-alert-20260407-001" }
}
```

### 2.3 `project:list`
- 输入示例：
```json
{}
```
- 输出示例：
```json
{
  "success": true,
  "command": "project:list",
  "data": {
    "activeProjectId": "proj-soil-alert-20260407-001",
    "projects": [
      { "projectId": "default-unnamed", "name": "未命名项目", "isSaved": false, "isDirty": true },
      { "projectId": "proj-soil-alert-20260407-001", "name": "soil-alert", "isSaved": true, "isDirty": false }
    ]
  }
}
```

### 2.4 `project:save`
- 输入示例：
```json
{ "projectId": "default-unnamed", "path": "D:/AI_project/projects/soil-alert" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "project:save",
  "data": {
    "projectId": "proj-soil-alert-20260407-001",
    "path": "D:/AI_project/projects/soil-alert",
    "savedFiles": ["circuit_config.json", "soil-alert.ino"]
  }
}
```

---

## 3) 画布层

### 3.1 `canvas:read`
- 输入示例：
```json
{ "project": "proj-soil-alert-20260407-001", "format": "json" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "canvas:read",
  "data": {
    "snapshot": {
      "projectName": "soil-alert",
      "components": [],
      "connections": []
    }
  }
}
```

### 3.2 `canvas:component:add`
- 输入示例：
```json
{
  "projectId": "proj-soil-alert-20260407-001",
  "componentKey": "std-esp32c3-supermi-114213",
  "x": 240,
  "y": 220,
  "instanceId": "inst-mcu-001"
}
```
- 输出示例：
```json
{
  "success": true,
  "command": "canvas:component:add",
  "data": {
    "added": { "instanceId": "inst-mcu-001" },
    "canvasDirty": true
  }
}
```

### 3.3 `canvas:component:move`
- 输入示例：
```json
{ "projectId": "proj-soil-alert-20260407-001", "instanceId": "inst-mcu-001", "x": 360, "y": 260 }
```
- 输出示例：
```json
{
  "success": true,
  "command": "canvas:component:move",
  "data": { "instanceId": "inst-mcu-001", "position": { "x": 360, "y": 260 }, "canvasDirty": true }
}
```

### 3.4 `canvas:connection:add`
- 输入示例：
```json
{
  "projectId": "proj-soil-alert-20260407-001",
  "source": { "instanceId": "inst-mcu-001", "pinId": "side3-1" },
  "target": { "instanceId": "inst-sensor-001", "pinId": "side3-1" },
  "id": "conn-i2c-sda-01"
}
```
- 输出示例：
```json
{
  "success": true,
  "command": "canvas:connection:add",
  "data": { "connectionId": "conn-i2c-sda-01", "canvasDirty": true }
}
```

### 3.5 `canvas:connection:remove`
- 输入示例：
```json
{ "projectId": "proj-soil-alert-20260407-001", "connectionId": "conn-i2c-sda-01" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "canvas:connection:remove",
  "data": { "connectionId": "conn-i2c-sda-01", "removed": true, "canvasDirty": true }
}
```

---

## 4) 固件层

### 4.1 `firmware:read`
- 输入示例：
```json
{ "projectId": "proj-soil-alert-20260407-001", "path": "firmware/soil-alert.ino" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "firmware:read",
  "data": {
    "path": "firmware/soil-alert.ino",
    "language": "arduino",
    "content": "void setup(){} void loop(){}",
    "dirty": false
  }
}
```

### 4.2 `firmware:patch`
- 输入示例：
```json
{
  "target": "firmware/soil-alert.ino",
  "requirement": "增加土壤湿度阈值与滞回控制",
  "codeText": "void setup(){} void loop(){}",
  "language": "arduino",
  "dryRun": true
}
```
- 输出示例：
```json
{
  "success": true,
  "command": "firmware:patch",
  "data": {
    "summary": "已生成固件代码补丁建议（CLI dry-run）",
    "patchPlan": [{ "op": "replace", "target": "loop()", "description": "加入阈值控制逻辑" }],
    "patch": "--- a/firmware/soil-alert.ino\n+++ b/firmware/soil-alert.ino\n@@\n+ // ...",
    "notes": ["当前为 dry-run，不直接写文件"],
    "targetPath": "firmware/soil-alert.ino",
    "language": "arduino"
  }
}
```

### 4.3 `firmware:apply`
- 输入示例：
```json
{
  "projectId": "proj-soil-alert-20260407-001",
  "target": "firmware/soil-alert.ino",
  "patch": "--- a/... +++ b/..."
}
```
- 输出示例：
```json
{
  "success": true,
  "command": "firmware:apply",
  "data": {
    "target": "firmware/soil-alert.ino",
    "applied": true,
    "changedLines": { "added": 24, "removed": 6 },
    "firmwareDirty": true
  }
}
```

### 4.4 `firmware:save`
- 输入示例：
```json
{ "projectId": "proj-soil-alert-20260407-001", "path": "firmware/soil-alert.ino" }
```
- 输出示例：
```json
{
  "success": true,
  "command": "firmware:save",
  "data": { "path": "firmware/soil-alert.ino", "saved": true, "firmwareDirty": false }
}
```

---

## 5) 推荐最小实现顺序

1. `project:create / project:switch / project:save`
2. `canvas:component:add / canvas:connection:add / canvas:connection:remove`
3. `firmware:read / firmware:apply / firmware:save`
4. 将 `project:save --path` 统一为“画布 + 固件 + 元数据”一次性落盘
