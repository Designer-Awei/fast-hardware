---
name: summarize_skill
description: 与 web_search 互补的中文摘要（可贴检索结果或传 urls 抓取正文）；引擎 runSummarizeText。
keywords: [总结, 摘要, 提炼, 长文, 日志总结, 会议纪要, 要点归纳, 压缩内容, tl;dr, summarize]
metadata:
  fasthardware:
    skillId: summarize_skill
    engineOp: runSummarizeText
---

# summarize_skill

## 功能

对 **长文本、日志、对话摘录、网页正文** 生成结构化摘要，输出：`summary`（总述）、`bullets`（要点数组）。

## 与 `web_search_exa` 的配合

- **推荐**：先 `web_search_exa` 拿到 `results[]`，将 **title / snippet / url** 拼成一段 `text` 再调本 skill，把多页要点压成短摘要。
- **可选**：直接传 **`urls`**（1～5 个 http(s)），由主进程 **`scripts/skills/fetch-url-plaintext.js`** 抓取公开 HTML/文本后与 `text` 合并再摘要（登录墙、反爬、内网 URL 会失败，请用 `text` 兜底）。

## 与 reference/summarize 的关系

`reference/summarize/SKILL.md` 为 **summarize CLI**；本产品不引入该 CLI，语义相近，实现为 **SiliconFlow 聊天模型**。

## 引擎

- `scripts/circuit-skills-engine.js` → `runSummarizeText(text, options?)`
- 主进程 `executeSkill`：`urls` 在 **主进程**抓取后再经 IPC 调渲染进程 `runSummarizeText`

## 入参

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | string | 与 `urls` 至少其一；可含 web 检索摘录 |
| `urls` | string[] | 可选，公开页面链接 |
| `length` | `short` \| `medium` \| `long` | 可选 |
| `focus` | string | 可选 |
