/**
 * @fileoverview 普通对话：当发往 SiliconFlow 的**文本**估算超过阈值时，先单独请求一次 LLM，将「较早历史」压缩为 ≤10k 级纪要，再组装消息，降低触顶 max_tokens / 请求体过大的风险。
 *
 * 多模态消息中的 **text** 计入体积；**image_url** 不计入字符阈值（图片体积仍受主进程其它逻辑约束）。
 */
(function attachContextCompact(global) {
  'use strict';

  /** 超过该估算字符数则触发压缩（与产品约定「约 70k」） */
  const CONTEXT_COMPACT_THRESHOLD_CHARS = 70000;

  /** 交给摘要模型的「早期对话」转写上限，避免摘要请求本身过大 */
  const MAX_TRANSCRIPT_FOR_SUMMARY = 120000;

  /** 摘要结果硬上限（略大于目标 10k，留模型浮动空间） */
  const MAX_SUMMARY_OUTPUT_CHARS = 12000;

  /**
   * @param {unknown} content
   * @returns {string}
   */
  function messageContentToTranscriptLine(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const texts = content
        .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text);
      const hasImage = content.some((p) => p && p.type === 'image_url');
      const t = texts.join('\n');
      if (hasImage) {
        return `${t || ''}\n[本条含图片，转写仅保留文字]`.trim();
      }
      return t;
    }
    return '';
  }

  /**
   * 估算消息数组中文本字符量（供阈值判断）。
   * @param {Array<{ role?: string, content?: unknown }>|null|undefined} messages
   * @returns {number}
   */
  function estimateApiMessagesTextChars(messages) {
    let n = 0;
    for (const m of messages || []) {
      const c = m && m.content;
      if (typeof c === 'string') {
        n += c.length;
      } else if (Array.isArray(c)) {
        for (const part of c) {
          if (part && part.type === 'text' && typeof part.text === 'string') {
            n += part.text.length;
          }
        }
      }
    }
    return n;
  }

  /**
   * @param {Array<{ role?: string, content?: unknown }>} messages
   * @param {{ model: string, chatWithAI: (m: Array<{role:string, content:unknown}>, model: string) => Promise<{ success?: boolean, content?: string, error?: string }> }} deps
   * @returns {Promise<Array<{ role: string, content: unknown }>>}
   */
  async function compactApiMessagesIfNeeded(messages, deps) {
    const { model, chatWithAI } = deps;
    if (!Array.isArray(messages) || messages.length < 3) {
      return messages;
    }

    const total = estimateApiMessagesTextChars(messages);
    if (total <= CONTEXT_COMPACT_THRESHOLD_CHARS) {
      return messages;
    }

    const systemMsg = messages[0];
    const currentMsg = messages[messages.length - 1];
    const middle = messages.slice(1, -1);
    if (middle.length === 0) {
      return messages;
    }

    let recentKeep = middle.slice(-2);
    let oldMiddle = middle.slice(0, -2);

    /** 仅 1～2 条中期消息但单条极长时：无「更早」分段，改为整段 middle 参与压缩 */
    if (oldMiddle.length === 0 && middle.length > 0) {
      oldMiddle = middle;
      recentKeep = [];
    }

    let transcript = oldMiddle
      .map((m) => `### ${m.role}\n${messageContentToTranscriptLine(m.content)}`)
      .join('\n\n');
    if (transcript.length > MAX_TRANSCRIPT_FOR_SUMMARY) {
      transcript = `${transcript.slice(0, MAX_TRANSCRIPT_FOR_SUMMARY)}\n…（已截断）`;
    }

    const compressSystem = `你是对话历史压缩助手。将下列「较早多轮对话」压缩为**中文**纪要，严格控制在 **10000 汉字以内**（宁可省略细节也要保留结构）。
必须保留：用户核心目标、已确认的事实与数字、未完成事项、重要结论与待决策点。
输出为连续正文；不要虚构未出现的内容；不要使用三级以上 Markdown 标题。

【待压缩的对话】
${transcript}`;

    console.log(
      `[context-compact] 文本估算 ${total} 字符 ≥ ${CONTEXT_COMPACT_THRESHOLD_CHARS}，触发自动摘要（早期 ${oldMiddle.length} 条 → 纪要 + 保留最近 ${recentKeep.length} 条）`
    );

    let sumResp;
    try {
      // 第三参由 chat.js 注入的闭包传入主进程（与最终对话请求一致，含 enable_thinking 省略策略）
      sumResp = await chatWithAI(
        [
          { role: 'system', content: compressSystem },
          { role: 'user', content: '请直接输出压缩后的纪要正文。' }
        ],
        model
      );
    } catch (e) {
      console.warn('[context-compact] 压缩请求异常，回退原始消息:', e?.message || e);
      return messages;
    }

    if (!sumResp || !sumResp.success || !String(sumResp.content || '').trim()) {
      console.warn('[context-compact] 压缩请求失败，回退原始消息:', sumResp?.error || '');
      return messages;
    }

    let summary = String(sumResp.content || '').trim();
    if (summary.length > MAX_SUMMARY_OUTPUT_CHARS) {
      summary = `${summary.slice(0, MAX_SUMMARY_OUTPUT_CHARS)}\n…（摘要已截断）`;
    }

    const baseSystem =
      typeof systemMsg.content === 'string'
        ? systemMsg.content
        : messageContentToTranscriptLine(systemMsg.content);

    const newSystem = {
      role: 'system',
      content: `${baseSystem}\n\n—— 【自动生成的早期对话摘要】（节省上下文；请优先依据下方最近几轮逐字内容）——\n${summary}`
    };

    return [newSystem, ...recentKeep, currentMsg];
  }

  global.FastHardwareContextCompact = {
    CONTEXT_COMPACT_THRESHOLD_CHARS,
    estimateApiMessagesTextChars,
    compactApiMessagesIfNeeded
  };
})(typeof window !== 'undefined' ? window : globalThis);
