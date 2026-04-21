# Fast Hardware - 创客集市（在线社区）PRD（8-maker-marketplace）

## 📌 文档定位

- 本文件定义 **软件内创客集市** 的 **技术实现路径** 与 **产品/安全/审核** 需求：以 **阿里云 OSS** 存放大文件与静态资源、**Supabase** 承载元数据与用户态；Electron 客户端以 **原生 UI** 呈现列表与操作（相对纯 WebView 嵌整站，更符合「桌面工具 + 社区」一体体验）。
- **画布分享预览与长图导出** 见 **`7-project-share_prd.md`**；集市侧消费其产出的 **缩略图 / 长图 / 方案包** 并负责 **上传、可见性、审核**。

### 与既有 PRD 的关系

| 关联文档 | 说明 |
|----------|------|
| **`7-project-share_prd.md`** | 分享预览、四块编辑、导出 PNG/ZIP |
| **`2-circuit_prd.md` / `6-project-isolation_prd.md`** | 复刻导入为新项目时的路径与隔离 |

---

## 1. 产品目标

1. 用户在 **创客集市** 以 **类元件管理卡片** 浏览 **已审核通过** 的公开方案；支持 **点赞、收藏、复刻**（交互与图标规范见文档 7 历史章节及 **`assets/README.md`**）。
2. 登录用户可将 **方案包 + 缩略图 + 长图 + 元数据** 上传至 **OSS**，元数据写入 **Supabase**；**未审核内容仅作者可见**。
3. **管理员** 登录后可见一级标签页 **「社区管理」**，对待审内容进行 **通过 / 驳回** 并可选填写原因。
4. **防刷**：限制 **每日上传次数**（按用户维度，服务端强制）。

---

## 2. 技术栈与架构原则

| 层级 | 选型 | 职责 |
|------|------|------|
| **对象存储** | **阿里云 OSS** | 存 `poster.png`、`thumbnail.jpg`、`bundle.zip`、可选附件；**不**把大文件塞进 Postgres |
| **BaaS / 元数据** | **Supabase**（Postgres + **RLS** + 可选 **Edge Functions**） | 方案记录、用户资料、点赞收藏、审核状态、上传计数；对外查询经 **RLS** 控制可见性 |
| **鉴权** | **OAuth 2.0**（授权码 + PKCE 或安全 redirect） | 至少 **GitHub** + **至少一款国内常用** 身份源（见 §4） |
| **Electron** | **主进程** 持有敏感配置（Supabase **anon/service role 分段使用**、OSS **STS 或预签名 URL** 的签发逻辑）；渲染进程 **禁止** 嵌入 `service_role` key |

### 2.1 为何 OSS + Supabase

- **原生体验**：列表、卡片、管理页用 **Electron 现有 UI 体系** 渲染；仅大文件走 OSS HTTP(S)，避免整站 WebView 与桌面交互割裂。
- **与「无独立官网」兼容**：社区数据面在 Supabase + OSS，**不依赖**自研官网域名即可上线；后续若有官网可做落地页与 OAuth 回调扩展。

### 2.2 安全底线

- **OSS**：上传使用 **临时凭证（STS）** 或 **服务端（Edge Function / 自建轻 API）签发的预签名 PUT**；**禁止**把永久 `AccessKey` 打进客户端包。
- **Supabase**：客户端仅用 **`anon` key** + **RLS**；**审核改状态、统计敏感操作** 仅经 **service_role**（Edge Function 或受控后端），**不得**暴露在渲染进程。
- **内容审核**：先 **机审（可选）+ 人工审核队列**；未通过前对象可 **私有读** 或 **仅作者预签名访问**（实现二选一在 §6 写明）。

---

## 3. 推荐落地顺序（里程碑）

> 与实现排期一致：**先能存能取，再能登能管**。

| 顺序 | 里程碑 | 交付物 |
|------|--------|--------|
| **M1** | **Supabase 建表 + RLS 草案** | 表结构、枚举、`profiles` 与 `posts`（或 `schemes`）关系、**仅本人可见 pending** 与 **全员可见 approved** 的 **SQL 策略** |
| **M2** | **Electron 拉通列表** | 使用 `anon` + 登录用户 JWT：拉取 **approved** 列表；作者拉取 **自己的 pending/rejected** |
| **M3** | **OAuth 登录** | **GitHub** 跑通；再并 **至少一款国内常用** OAuth（见 §4）；会话与 Supabase **Auth** 对齐（推荐 **Supabase Auth 的 OAuth provider** 与 **Electron 内嵌 BrowserWindow / 系统浏览器** 回调，或 **Authorization Code + PKCE** 换 token 后写入 `supabase.auth.setSession`） |
| **M4** | **OSS 上传与下载** | 发布流：生成 manifest → 上传 OSS → 写 Supabase 行 `status=pending`；列表缩略图走 **CDN 域名或 OSS 公共读**（仅 approved 资源）；下载/复刻走 **签名 GET** 或公共读策略 |

**库选型说明**：用户提到 **`simple-oauth2`**（Node）— 可用于 **非 Supabase Auth、自建 token 交换** 场景；若采用 **Supabase Auth 内置 OAuth**，则优先使用 **官方客户端 + 深度链接回调**，`simple-oauth2` 作为 **备选**（例如国内厂商无 Supabase 插件时）在实现阶段二选一并在本文档 **变更记录** 中固化。

---

## 4. 用户鉴权（OAuth）

### 4.1 必须支持

| 提供方 | 用途 | 备注 |
|--------|------|------|
| **GitHub** | 开发者/开源用户熟悉 | 回调 URL 需与 Supabase 或自建网关一致 |

### 4.2 至少一款「国内更常用」（择一优先落地，可扩展）

| 候选 | 说明 |
|------|------|
| **Gitee** | 与 GitHub 类似 OAuth 2.0，适合开发者社群 |
| **飞书 / 钉钉** | 教育与企业用户；需各开放平台创建应用 |
| **微信开放平台** | 覆盖广；个人/网页应用审核与回调域名要求更严，可作为 **Phase+** |

**产品要求**：PR 级交付至少 **GitHub + 上表之一**；文档与配置中 **不写死密钥**，使用环境变量 / 用户设置页安全存储（与现有 `env.local` 策略对齐的可行方案需在实现时补充）。

---

## 5. Supabase 数据模型（建议草案）

> 表名、字段可在实现时微调；**RLS 为强制项**。

### 5.1 `profiles`

- `id`（UUID，对齐 `auth.users.id`）
- `display_name`、`avatar_url`
- `role`：`user` | `admin`（或独立 `is_admin boolean`）
- `github_id` / `gitee_id` 等可选外链 id
- `created_at`

### 5.2 `posts`（或 `schemes`）— 方案主表

- `id`（UUID）
- `author_id`（FK → `profiles`）
- `title`、`summary`（短简介）
- `status`：`pending` | `approved` | `rejected`（枚举）
- `reject_reason`（可选，管理员驳回说明）
- `oss_poster_key`、`oss_thumbnail_key`、`oss_bundle_key`（字符串，OSS object key）
- `likes_count`（冗余，或仅视图聚合）
- `created_at`、`updated_at`、`reviewed_at`、`reviewer_id`（nullable）

### 5.3 `post_likes` / `post_favorites`

- `user_id`、`post_id`、唯一约束 `(user_id, post_id)`

### 5.4 `upload_quota`（防刷）

**二选一或组合**：

- **表 `daily_uploads`**：`user_id`、`date`（DATE）、`count`，每日一行 upsert；或  
- **Edge Function** 内校验当日次数后再签发 OSS 上传凭证。

**默认配额**：文档建议初值 **例如每日 5 次上传提交**（pending 即计数），可在设置或远端配置覆盖；**管理员** 可豁免或单独表配置。

### 5.5 RLS 可见性（核心）

- **`status = approved`**：`anon` 与登录用户均可 **SELECT** 列表所需字段（不含敏感驳回备注可选）。
- **`status = pending`**：仅 **`author_id = auth.uid()`** 可 **SELECT** 全文与 OSS 键；他人 **不可见**。
- **`status = rejected`**：仅作者可见 + `reject_reason`。
- **INSERT**：仅认证用户，且 `author_id` 必须等于 `auth.uid()`。
- **UPDATE `status`**：仅 **service_role** 或 **带 admin 校验的 Edge Function**（**禁止**客户端直接改 approved）。

---

## 6. 阿里云 OSS 与权限

### 6.1 对象与路径约定（示例）

```text
posts/{post_id}/thumbnail.jpg
posts/{post_id}/poster.png
posts/{post_id}/bundle.zip
```

### 6.2 权限策略

| 状态 | 读 | 写 |
|------|----|----|
| **pending** | 仅作者：经 **预签名 GET** 或 **私有 Bucket + STS 限定前缀** | 作者经 **预签名 PUT** 上传 |
| **approved** | 公共读 **或** CDN + 长期缓存；列表缩略图走公开 URL | 禁止覆盖（或仅允许作者删帖软删） |

### 6.3 审核通过后

- 将对象 **ACL / Bucket 策略** 切换为可读，或 **拷贝** 至 `public/` 前缀；**或** 仅通过 **已审核 CDN 映射** 暴露（实现选型记录于 `0-Change-Log.md`）。

---

## 7. 内容审核与工作流

1. 用户提交发布 → `posts.status = pending`，列表 **「社区」** 默认 **不展示** 该条给非作者。
2. 作者在 **「我的方案」** 中可见 **审核中** 状态。
3. 管理员在 **「社区管理」** 页看到待审队列 → **通过** → `approved` + `reviewed_at`；**驳回** → `rejected` + `reject_reason`。
4. **机审（可选）**：对接文本/图片敏感接口；**仅辅助**，不替代人工开关（教育场景误杀处理）。

---

## 8. UI：创客集市与社区管理

### 8.1 创客集市（普通用户）

- **一级入口**：与现有主导航并列的 **「创客集市」**。
- **卡片**：参考 **元件管理页** 卡片样式；**点赞 / 收藏 / 复刻** 为 **icon 按钮**（`heart`、`star`、`git-branch`/`layers` 等，遵守 **`assets/README.md`**）。
- **复刻**：下载 `bundle.zip`（签名 URL）→ 本地解压为新项目（与 **`7-project-share_prd.md`** 包结构一致）。

### 8.2 社区管理（管理员）

- **显示条件**：`profiles.role = admin`（或等价字段）为真。
- **一级标签页**：**「社区管理」**（与「电路搭建」「创客集市」等并列）。
- **功能**：待审列表、预览元数据 + 缩略图、**通过 / 驳回**、可选按作者/时间筛选；操作仅走 **服务端特权接口**，前端不直连 `service_role`。

---

## 9. 非功能需求（NFR）

| 项 | 要求 |
|----|------|
| **可用性** | 列表分页、骨架屏、失败重试；弱网提示 |
| **合规** | 用户协议与隐私政策中声明 **UGC、审核、存储地域**（OSS 区域） |
| **审计** | 审核操作写 **audit_log**（管理员 id、post id、动作、时间） |
| **密钥** | 所有云密钥 **环境变量** 或 **安全存储**；CI 不打印 |

---

## 10. 验收标准（节选）

1. **M1**：Supabase 迁移脚本可重复执行；**RLS** 用测试账号验证 **pending 不可被他人读取**。
2. **M2**：Electron 展示 **approved** 卡片列表（含缩略图 URL）。
3. **M3**：**GitHub** 与 **至少一款国内 OAuth** 均可完成登录并拿到 **Supabase 会话**。
4. **M4**：完整发布流：上传 OSS → 写 `pending` → 管理员通过后公开展示；非作者 **永远** 拉不到 pending 的 OSS 直链（除非签名泄露防护已说明）。
5. **配额**：超过每日上传次数时 **明确错误提示**，服务端拒绝签发上传凭证。

---

## 11. 与竞品式体验的差异（自述）

- 相对 **纯 WebView 嵌整站**：核心列表与操作 **原生渲染**，OSS 只做静态资源与包下载，**降低割裂感**。
- 相对 **无后端本地集市**：上线 **真实 UGC 与审核**，适合教育与创客 **公开展示** 场景。

---

## 12. 文档维护

- 表结构、RLS、OSS 桶名变更时同步 **本文件** 与 **`0-Change-Log.md`**。
- 若 **`7-project-share_prd.md`** 中 ZIP/manifest 字段调整，需与本文件 **§5.2** 存储键对齐。
