# web_search_exa — 示例

以下为 **`args`** 与查询思路示例；具体编排与调用栈由运行时实现负责，本文件只描述**工具契约**层面的用法。

## 典型 `args`

```json
{
  "query": "TP4056 模块 典型应用 5V",
  "numResults": 5,
  "type": "fast"
}
```

## 场景：现货 / 新闻 / 比价线索

- `query`: `"STM32G030 现货"`、`"某芯片 2026 新闻"`
- `type`: 先 **`fast`**；要更全再 **`deep`**。

## 场景：引脚 / 封装 / 数据手册入口

- `query`: `"KY-038 模块 引脚"`、`"SOT-23-5 pinout"`
- `numResults`: **5–8**

## 场景：与方案设计衔接

1. 使用 **`scheme_design_skill`** 得到 BOM 与库匹配。
2. 对缺件或模糊项，用本 skill 收窄 **`query`** 查型号或常见商品名。
3. 再用 **`completion_suggestion_skill`** 输出可采购级描述（若需要）。

## `type` 选择

| 值 | 适用 |
|----|------|
| `auto` | 默认平衡 |
| `fast` | 快速、短列表 |
| `deep` | 需要更全的摘要与更多条结果时 |

## 反模式

- 重复相同 `query` 与 `type` 刷调用。
- 在最终答复中引用**未出现在检索结果里**的 URL。
