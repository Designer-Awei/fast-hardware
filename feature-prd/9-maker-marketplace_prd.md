# Fast Hardware - 创客集市（在线社区）PRD（9-maker-marketplace）

## 📌 文档定位

- 本文件定义软件内创客集市的产品流程、审核机制、数据库与 Supabase Storage 设计。
- 当前阶段仅使用 **Supabase（Postgres + Storage + RLS）**，暂不考虑阿里云 OSS。
- 账号、权限体系与个人中心入口联动见 `feature-prd/8-account_prd.md`。

### 与既有 PRD 的关系

| 关联文档 | 说明 |
|----------|------|
| `7-project-share_prd.md` | 分享模态窗、预览样式与发布动作 |
| `8-account_prd.md` | 账号、权限管理、`user_roles` 真源 |
| `2-circuit_prd.md` / `6-project-isolation_prd.md` | 细节查看时在电路搭建页内存打开项目 |

---

## 1. 产品目标

1. 用户从「我的项目」卡片右上角分享入口发起发布，进入待审核流程。
2. 管理员/超级管理员在「个人中心-社区管理」完成审核通过/拒绝。
3. 创客集市展示已通过项目，支持点赞、收藏、复刻，并按热度检索筛选。
4. 发布流程要有配额控制：**单用户每日最多发布 3 个项目**。

---

## 2. 端到端流程（当前版本）

### 2.1 用户发布流程

1. 用户在「我的项目」点击卡片右上角分享按钮。
2. 打开「发布模态窗」：
   - 可编辑 `description`
   - 可预览发布后卡片样式（基于我的项目卡片样式改造）
3. 点击发布：
   - 后端校验当日配额（<=3）
   - 上传快照数据到 `pending` 存储路径
   - 写入 `posts` 记录，状态 `pending`
   - 右上角通知：`发布成功，等待审核`

### 2.2 管理端审核流程

1. 管理员/超级管理员进入 `个人中心 -> 社区管理`。
2. 查看全部待审核卡片，按提交时间倒序。
3. 点击卡片打开「审核态项目预览」模态窗：
   - 画布区预览
   - 项目描述
   - 代码片段
4. 底部操作：
   - 查看细节（直接在电路搭建标签页以**内存态**打开，不落盘下载）
   - 拒绝（可选填写理由）
   - 通过

### 2.3 创客集市浏览流程

1. 仅登录用户可进入创客集市页；未登录进入时提示先登录并跳转账号登录。
2. 进入创客集市页顶部搜索区：
   - 搜索框（项目名/描述/作者昵称）
   - 排序筛选下拉（点赞优先/收藏优先/复刻优先）
   - 搜索按钮
3. 首次切换到创客集市页时拉取一次列表数据；后续停留期间不做实时全量刷新。
4. 下方展示热门卡片：
   - 默认按点赞数降序
   - 每行 3-6 列（最小卡宽 360px）
   - 描述限制最多 3 行，固定 3 行高度，超出省略号
5. 点击卡片打开「发布态项目预览」模态窗：
   - 内容与审核态基本一致
   - 底部按钮：查看细节、点赞/收藏/复刻 icon 按钮

### 2.4 项目编号共享复用流程（新增）

1. 用户在「我的项目」卡片上传备份后，卡片显示 `项目编号`（即 `project_backups.project_key`）。
2. 用户点击项目编号后的复制按钮，将编号发送给他人。
3. 他人在创客集市顶部搜索框输入该 24 位项目编号。
4. 若命中共享备份，列表插入“共享备份卡片”：
   - 样式与发布卡片同体系
   - 仅展示：项目名、备份时间
   - 操作区仅保留一个「复刻」按钮（git-branch icon + 文案）
5. 点击复刻后，客户端按 `project_key` 拉取 `project.bundle.json`（仅内存），并在电路页新开项目标签加载。

---

## 3. 角色与权限

| 角色 | 能力 |
|------|------|
| 匿名用户 | 不可进入创客集市（需先登录） |
| 普通用户 | 发布项目、查看自己审核状态、点赞/收藏/复刻 |
| 管理员 | 社区管理审核（通过/拒绝） |
| 超级管理员 | 管理员全部能力 + 权限管理（账号角色管理） |

管理员识别与权限管理入口以 `8-account_prd.md` 中 `user_roles` 为准。

---

## 4. 数据库设计（Supabase/Postgres）

> 下面为当前版本建议模型，支持你描述的发布-审核-展示闭环。

### 4.1 `posts`（发布主表）

- `id uuid pk`
- `author_id uuid not null`（FK -> `auth.users.id` 或 `profiles.id`）
- `project_key text not null`（本地项目稳定标识）
- `project_name text not null`
- `description text not null default ''`
- `status text not null check in (`pending`,`approved`,`rejected`)`
- `preview_snapshot_key text not null`（Storage: 预览快照/清单对象）
- `preview_cover_key text`（卡片封面，可选）
- `preview_code_key text`（代码片段对象，可选）
- `published_at timestamptz`（通过审核后写入）
- `reviewed_at timestamptz`
- `reviewer_id uuid`
- `reject_reason text`
- `likes_count int not null default 0`
- `favorites_count int not null default 0`
- `remixes_count int not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

索引建议：
- `(status, created_at desc)`
- `(status, published_at desc)`
- `(status, likes_count desc, published_at desc)`
- `gin(to_tsvector('simple', project_name || ' ' || description))`（后续全文检索）

### 4.2 互动表

- `post_likes(user_id, post_id, created_at, pk(user_id, post_id))`
- `post_favorites(user_id, post_id, created_at, pk(user_id, post_id))`
- `post_remixes(user_id, post_id, created_at, pk(user_id, post_id))`

### 4.3 发布配额表

- `daily_post_uploads(user_id, upload_date, upload_count, updated_at, pk(user_id, upload_date))`
- 规则：每天最多 3 次提交（无论后续是否通过）

### 4.4 审核日志表（建议）

- `post_review_logs(id, post_id, actor_id, action, reason, detail_json, created_at)`
- `action`：`approve` / `reject` / `view_detail`

### 4.5 备份共享检索表（复用既有）

- 使用既有 `public.project_backups` 作为“项目编号 -> 备份实体”索引。
- `project_key` 为 24 位十六进制短键（由本地项目路径规范化后哈希生成）。
- 共享检索仅需要 `project_key / project_name / backup_at / user_id`。

---

## 5. Storage 设计（Supabase Storage）

### 5.1 Bucket 规划

- `marketplace-pending`：待审核对象（私有）
- `marketplace-public`：通过审核对象（可公开读或经签名读）
- `project-backups`：项目云备份对象（**public=true**，用于 CDN/缓存与按项目编号快速读取）

### 5.2 对象路径建议

```text
marketplace-pending/{author_id}/{post_id}/snapshot.json
marketplace-pending/{author_id}/{post_id}/cover.png
marketplace-pending/{author_id}/{post_id}/code-snippet.txt

marketplace-public/{post_id}/snapshot.json
marketplace-public/{post_id}/cover.png
marketplace-public/{post_id}/code-snippet.txt
```

### 5.3 审核通过时处理

1. 从 `marketplace-pending` 复制（或移动）到 `marketplace-public`
2. `posts.status` -> `approved`
3. 写 `published_at`
4. **立即删除** `marketplace-pending` 源对象，不做待审核暂存保留

### 5.4 审核拒绝时处理

1. `posts.status` -> `rejected`（可写 `reject_reason`）
2. **立即删除** `marketplace-pending` 对应对象（snapshot/cover/code）
3. `posts` 仅保留必要元数据用于作者查看拒绝结果，不保留待审文件副本

---

## 6. RLS 与安全策略

### 6.1 `posts` 可见性

- `approved`：仅登录用户可读基础字段
- `pending/rejected`：仅作者本人可读
- 审核相关字段（`reject_reason`, `reviewer_id`）按角色控制

### 6.4 `project_backups` 共享查询策略（新增）

- 上传/更新/删除：仍按“仅本人行”约束（`user_id = auth.uid()`）。
- 为支持“按项目编号复用”，增加登录用户共享读取策略：
  - 策略名示例：`project_backups_select_shared_authenticated`
  - 规则：`authenticated` 可 `SELECT`（服务端接口继续只返回必要字段）。

### 6.2 写入与审核

- 普通用户只允许 `insert own pending`
- 用户不可直接把 `status` 改为 `approved/rejected`
- 审核操作仅管理员/超级管理员可执行（建议走 RPC）

### 6.3 配额控制

- 发布接口先读写 `daily_post_uploads`
- 当 `upload_count >= 3` 直接拒绝并返回业务错误

---

## 7. UI 规格细化

### 7.1 发布模态窗（从我的项目触发）

- 字段：`description`
- 预览卡片样式改造：
  - 保留项目标题、元件数/连线数
  - 去掉按钮区、备份状态、分享按钮
  - `更新时间` 改为 `发布时间`
  - 底部放点赞/收藏/复刻 icon + 数量（初始为 0）
- 发布成功 toast：`发布成功，等待审核`

### 7.2 社区管理审核卡片

- 列表按 `created_at desc`
- 卡片展示：项目名、作者、提交时间、描述摘要、待审核标识
- 预览模态底部按钮：
  - 查看细节（内存打开，不落本地）
  - 拒绝
  - 通过

### 7.3 创客集市卡片

- 网格：每行 3-6 个，最小宽 360px，自适应
- 描述：最多 3 行省略号，固定 3 行高度
- 默认排序：点赞优先
- 顶部筛选：点赞优先/收藏优先/复刻优先
- 互动策略：用户点击点赞/收藏/复刻时前端立即乐观更新，后端静默写入；不要求实时对齐“他人刚产生的互动计数”

### 7.4 互动同步与带宽策略（补充）

- 列表数据采用“首次进入拉取”策略，避免每次互动后全量刷新。
- 互动请求按帖子局部更新（patch DOM + 内存列表），失败再回滚，不触发整页重渲染。
- 允许短时与服务端真实计数存在轻微延迟；用户自身操作反馈必须即时可见。

### 7.5 我的项目卡片（补充）

- 在 `描述` 与 `更新时间` 之间新增 `项目编号` 行。
- 已备份显示 `project_key`，未备份显示 `暂无project_key`。
- 项目编号行右侧复制按钮样式复用系统设置中的 `inline-icon-button`。

### 7.6 项目编号命中卡片（补充）

- 与发布卡片保持统一头部视觉。
- 文案字段：`备份时间`（替代发布时间）。
- 不展示点赞/收藏/复刻统计按钮，仅保留一个复刻按钮（与详情模态复刻样式一致）。

---

## 8. 验收标准（本轮）

1. 从我的项目发布后生成 `pending` 帖子并成功提示等待审核。
2. 同一用户当日第 4 次发布被拒绝并给出明确提示。
3. 社区管理可查看待审核列表并完成通过/拒绝。
4. 通过后项目进入创客集市公开列表，支持点赞/收藏/复刻。
5. 点击“查看细节”可在电路搭建标签页以内存态打开项目数据。
6. 上传备份后“我的项目”卡片可复制项目编号；他人通过项目编号可在创客集市检索并复刻。

---

## 9. 文档维护

- 当表结构、RLS、Storage bucket 或对象路径调整时，需同步更新本文件与 `0-Change-Log.md`。
- 与 `8-account_prd.md` 的角色体系（`user_roles` 真源）保持一致。
