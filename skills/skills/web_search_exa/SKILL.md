---
name: web_search_exa
description: Exa 联网检索。需要实时信息、外部资料、价格/现货/新闻/数据手册线索时调用；skillName 必须为 web_search_exa。用户可见总结中的外链须用 Markdown [显示名](完整url)，url 来自检索结果。
keywords: [联网, 上网查, 搜索, 查一下, 实时, 最新, 新闻, 价格, 现货, 数据手册, 资料来源]
metadata:
  fasthardware:
    skillId: web_search_exa
---

# Web Search（Exa）

面向网页与公开资料的检索，返回标题、链接、摘要等结构化结果。适用于当前信息、选型线索、数据手册入口、新闻与比价参考（**非**库内元件权威参数的最终依据）。

**重要：** 调用时 **`skillName` 必须精确为 `web_search_exa`**。电路类需求通常先使用 **`scheme_design_skill`** 对齐方案与库，再按需调用本 skill 补充外证。

## 限制（事实校验）

- 检索结果来自搜索引擎索引与网页摘录，**不保证**与用户意图在地区、日期、时效上完全一致；模型生成的 `query` 也可能偏离（例如错误年份）。
- **天气、股价、汇率等强实时、强地域事实**：当前 **勿将本 skill 当作权威数据源**；后续计划由独立 **天气 API / 金融数据 API** 等专用 skill 提供可校验结果（此处仅作产品备忘，实现前仍以本 skill 为「公开资料线索」）。


## Parameters

### web_search_exa

**Parameters:**

- **`query`** — 检索查询（必填）。未提供时，执行层可能用对话中的用户需求作为检索词。
- **`numResults`** — 返回条数（可选，常用约 5–10）。
- **`type`** — `"auto"` | `"fast"` | `"deep"`（可选）。`fast` 偏快；`deep` 偏全、更慢。

## Tips

- Web：日常事实、报价区间用 **`type: "fast"`**；要更广覆盖面用 **`"deep"`**。
- 与方案/BOM：先 **`scheme_design_skill`**，对缺件再检索具体型号或常见模块名，可配合 **`completion_suggestion_skill`**。
- 输出规范：引用网页须 **`[显示名](完整 URL)`**，URL **逐字**来自检索结果中的链接字段，勿编造。
- 更多示例与反模式见 **`references/examples.md`**。

## Resources

- [Exa 文档](https://exa.ai/docs)

## 仓库内参考

- **`references/examples.md`** — 查询示例与 `type` 选择。
- **`examples/implementation-reference.js`** — 第三层实现备份（供对照，非运行契约）。
