# Fast Hardware - 创客集市（在线社区）PRD（9-maker-marketplace）

## 📌 文档定位

- 本文件定义 **软件内创客集市** 的 **技术实现路径** 与 **产品 / 安全 / 审核** 需求：以 **阿里云 OSS** 存放大文件与静态资源、**Supabase** 承载元数据与用户态；Electron 客户端以 **原生 UI** 呈现列表与操作，避免整站 WebView 带来的割裂体验。
- **画布分享预览与长图导出** 见 **`7-project-share_prd.md`**；集市侧消费其产出的 **缩略图 / 长图 / 方案包**，并负责 **上传、可见性、审核、下载与复刻**。
- **账号与登录** 见 **`8-account_prd.md`**；本文件仅描述与社区直接相关的鉴权依赖、角色联动和服务端权限。

### 与既有 PRD 的关系

| 关联文档 | 说明 |
|----------|------|
| **`7-project-share_prd.md`** | 分享预览、四块编辑、导出 PNG / ZIP |
| **`8-account_prd.md`** | GitHub / 国内 OAuth、会话、角色、登录态 |
| **`2-circuit_prd.md` / `6-project-isolation_prd.md`** | 复刻导入为新项目时的路径与隔离 |

---

## 1. 产品目标

1. 用户在 **创客集市** 以 **类元件管理卡片** 浏览 **已审核通过** 的公开方案，支持 **点赞、收藏、复刻**。
2. 登录用户可将 **方案包、缩略图、长图与元数据** 上传到 **OSS**，并将方案记录写入 **Supabase**；**未审核内容仅作者自己可见**。
3. **管理员** 登录后，在 **个人中心** 下额外显示二级标签页 **「社区管理」**，对待审内容进行 **通过 / 驳回** 并可选填写驳回原因。
4. 服务端需对上传行为做 **每日上传次数限制**，避免刷屏与滥用。

---

## 2. 技术栈与架构原则

| 层级 | 选型 | 职责 |
|------|------|------|
| **对象存储** | **阿里云 OSS** | 存放 `poster.png`、`thumbnail.jpg`、`bundle.zip` 等大文件；不把大文件直接写入 Postgres |
| **BaaS / 元数据** | **Supabase**（Postgres + RLS + 可选 Edge Functions） | 方案记录、用户资料、点赞收藏、审核状态、上传计数；通过 RLS 控制可见性 |
| **鉴权** | **OAuth 2.0** | 至少支持 **GitHub** + **至少一款国内常用 OAuth** |
| **Electron** | **主进程持敏感配置** | 负责调受控接口、签名 URL / STS 获取；渲染进程不直接持有高权限密钥 |

### 2.1 为什么选择 OSS + Supabase

- **更原生**：集市列表、卡片、审核页沿用 Electron 现有 UI 体系，不依赖整站 WebView。
- **更适合当前阶段**：在 **没有官网** 的前提下，仍然能用 **Supabase + OSS** 跑通真实社区数据链路。
- **扩展性足够**：后续若有官网，可复用 Supabase 表结构与 OSS 对象，不推翻客户端方案。

### 2.2 安全底线

- **OSS 上传**：必须使用 **STS 临时凭证** 或 **服务端签发的预签名 PUT URL**；**禁止**把永久 `AccessKey` 打进安装包。
- **Supabase 权限**：客户端仅使用 **anon key** + **RLS**；**审核、敏感状态修改、配额控制** 只能通过 **service role** 所在的 Edge Function 或受控后端完成。
- **待审核内容**：未通过前仅作者可见；对象本身也应是 **私有读** 或 **受签名 URL 控制**。

---

## 3. 推荐落地顺序（必须按顺序推进）

> 路径：**Supabase 建表 → Electron 跑通读取列表 → 跑通 GitHub / 国内 OAuth 登录 → 跑通 OSS 上传与下载**

| 顺序 | 里程碑 | 交付物 |
|------|--------|--------|
| **M1** | **Supabase 建表 + RLS 草案** | `profiles`、`posts`、`post_likes`、`post_favorites`、`daily_uploads` 等表结构与 SQL 策略 |
| **M2** | **Electron 拉通读取列表** | 客户端可读取 `approved` 列表；作者可读取自己的 `pending / rejected` |
| **M3** | **OAuth 登录** | **GitHub** 跑通；再并入 **至少一款国内常用 OAuth**；登录态与 Supabase 会话打通 |
| **M4** | **OSS 上传与下载** | 发布流：上传资源到 OSS → 写 `pending` 元数据 → 管理员审核 → 公开展示 / 下载 / 复刻 |

### 3.1 OAuth 库选型说明

- 若采用 **Supabase Auth 官方 OAuth Provider**，优先使用 **Supabase 官方客户端** 管理会话。
- **`simple-oauth2`** 可作为 **补充方案**：当某国内厂商接入不适合直接走 Supabase Provider 时，可在 Electron 主进程或受控服务端中使用。
- 文档层结论：**不强绑定实现库**，但必须满足 **GitHub + 一款国内 OAuth** 的交付要求。

---

## 4. 鉴权与角色

### 4.1 OAuth 提供方要求

| 类型 | 必须性 | 候选 |
|------|--------|------|
| **国际开发者常用** | 必须 | **GitHub** |
| **国内常用** | 至少一款 | **Gitee**（优先）、飞书、钉钉、微信开放平台 |

### 4.2 角色

| 角色 | 能力 |
|------|------|
| **匿名用户** | 浏览已审核公开列表 |
| **普通用户** | 点赞、收藏、上传、查看自己的待审核内容、复刻 |
| **管理员** | 除普通用户能力外，拥有 **社区管理** 审核权限 |

### 4.3 管理员识别

- 推荐字段：`profiles.role = 'admin'`
- Electron 启动或登录成功后拉取当前 profile；若为 `admin`，则在 **个人中心** 下额外显示 **「社区管理」** 二级标签页。

---

## 5. Supabase 数据模型（建议草案）

> 表名与字段可实现时微调，但 **RLS 为强制项**。

### 5.1 `profiles`

- `id`（UUID，对齐 `auth.users.id`）
- `display_name`
- `avatar_url`
- `role`（`user` / `admin`）
- `provider`（`github` / `gitee` / `feishu` / `dingtalk` / ...）
- `created_at`
- `updated_at`

### 5.2 `posts`（方案主表）

- `id`（UUID）
- `author_id`（FK → `profiles.id`）
- `title`
- `summary`
- `status`：`pending` | `approved` | `rejected`
- `reject_reason`（可选）
- `oss_poster_key`
- `oss_thumbnail_key`
- `oss_bundle_key`
- `likes_count`（冗余聚合字段，可选）
- `created_at`
- `updated_at`
- `reviewed_at`
- `reviewer_id`（nullable）

### 5.3 互动表

- `post_likes`：`user_id`、`post_id`、唯一约束 `(user_id, post_id)`
- `post_favorites`：`user_id`、`post_id`、唯一约束 `(user_id, post_id)`

### 5.4 上传配额

可二选一或组合：

- **`daily_uploads` 表**：`user_id`、`date`、`count`
- **Edge Function 校验**：提交前先校验今日配额，再签发上传凭证

**建议默认值**：每日 **5 次** 提交（`pending` 也计数）；管理员可豁免。

### 5.5 RLS 可见性（核心）

- **`status = approved`**：匿名与登录用户都可读取公开列表字段。
- **`status = pending`**：仅作者本人可读。
- **`status = rejected`**：仅作者本人可读，且可见 `reject_reason`。
- **INSERT**：仅登录用户可插入，且 `author_id = auth.uid()`。
- **审核改状态**：只能由 **service role** 所在受控接口执行，客户端不可直改。

---

## 6. 阿里云 OSS 与权限控制

### 6.1 对象路径建议

```text
posts/{post_id}/thumbnail.jpg
posts/{post_id}/poster.png
posts/{post_id}/bundle.zip
```

### 6.2 权限策略

| 状态 | 读权限 | 写权限 |
|------|--------|--------|
| **pending** | 仅作者：签名 GET 或私有 Bucket + STS | 作者签名 PUT / STS 限定前缀上传 |
| **approved** | 公共读或 CDN 公开访问 | 原则上禁止覆盖 |

### 6.3 审核通过后的对象处理

可选方案：

1. 直接切换为可公开读取；
2. 复制到公共前缀后暴露；
3. 仅通过 CDN 域名对外开放。

实现选型在落地时记录到 `0-Change-Log.md`。

---

## 7. 内容审核机制

1. 用户提交方案后，`posts.status = pending`。
2. 非作者在创客集市页 **看不到** 该条内容。
3. 作者在「我的方案」或「创作中心」中看到 **待审核 / 已驳回 / 已通过** 状态。
4. 管理员在 **个人中心 -> 「社区管理」** 页审核：
   - **通过**：改为 `approved`
   - **驳回**：改为 `rejected` 并填写 `reject_reason`
5. 可选接入 **机审**（文本 / 图片），但不能替代人工最终决策。

---

## 8. UI：创客集市与社区管理

### 8.1 创客集市（普通用户）

- 主导航一级入口：**「创客集市」**
- 卡片形式：参考 **元件管理页** 的卡片风格
- 每张卡片包含：
  - 缩略图
  - 标题
  - 一句话简介
  - 点赞数 / 收藏态
  - **点赞 / 收藏 / 复刻** 三个 **icon 按钮**

### 8.2 社区管理（管理员）

- 仅管理员可见的 **个人中心二级标签**：**「社区管理」**
- 功能：
  - 待审核列表
  - 元数据与缩略图预览
  - 通过 / 驳回
  - 可选按作者、时间、状态筛选

---

## 9. 非功能需求（NFR）

| 类别 | 要求 |
|------|------|
| **可用性** | 列表分页、骨架屏、失败重试、弱网提示 |
| **合规** | 用户协议 / 隐私政策声明 UGC、审核与存储地域 |
| **审计** | 审核操作写入 `audit_log` |
| **密钥安全** | 所有云密钥通过环境变量或安全存储管理，不出现在普通日志 |

---

## 10. 验收标准（节选）

1. **M1**：Supabase 迁移脚本可重复执行，RLS 能正确限制 `pending` 的可见性。
2. **M2**：Electron 能展示 `approved` 列表与缩略图。
3. **M3**：**GitHub** 与 **至少一款国内 OAuth** 都能完成登录并建立有效会话。
4. **M4**：完整发布流可运行：上传 OSS → 写 `pending` → 管理员通过 → 对外可见。
5. **配额限制**：超过每日上传次数时，服务端拒绝并返回清晰提示。

---

## 11. 与 WebView 社区方案的区别

- 不依赖整站 WebView 承载主交互，减少桌面端与网页端割裂。
- 通过 **原生列表 + OSS 资源 + Supabase 元数据**，在无官网阶段也能先跑通真实 UGC 社区。

---

## 12. 文档维护

- 表结构、RLS、OSS 桶名变更时同步更新本文件与 `0-Change-Log.md`。
- 若 `7-project-share_prd.md` 中 ZIP / manifest 字段有调整，需同步对齐本文件中的对象键与 `posts` 字段说明。
