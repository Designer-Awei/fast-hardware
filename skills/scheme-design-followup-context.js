/**
 * @fileoverview **可选**：当引擎里仍存在前序 scheme_design / BOM 状态时，抽出摘要供 wiring、firmware **额外参考**。
 * **没有结构化方案时不必注入**——后续步骤只依赖用户 query + 画布 JSON 即应能工作。
 *
 * 若有注入：元件表**仅为参考**，画布在功能上已满足需求（含等价替代）时不得单靠表项判死缺件。
 */

'use strict';

const MAX_COMPONENT_ROWS = 24;
const MAX_TEXT_CHARS = 6200;
const MAX_ONELINER_CHARS = 2000;

/**
 * @param {any} engine
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function readSkillStateFromEngine(engine) {
  if (engine && typeof engine.getCurrentSkillState === 'function') {
    try {
      const s = await engine.getCurrentSkillState();
      return s && typeof s === 'object' ? s : null;
    } catch {
      return null;
    }
  }
  const sync = engine?.currentSkillState;
  return sync && typeof sync === 'object' ? sync : null;
}

/**
 * @param {unknown} c
 * @param {number} i
 * @returns {string}
 */
function componentLabel(c, i) {
  if (!c || typeof c !== 'object') return `条目${i + 1}`;
  const o = /** @type {Record<string, unknown>} */ (c);
  const a = [o.type, o.name, o.description, o.displayName]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return a[0] || `条目${i + 1}`;
}

/**
 * @param {unknown} state
 * @returns {{ textBlock: string, expectedComponentsOneLiner: string, hasSchemeContext: boolean }}
 */
function buildSchemeFollowupInjection(state) {
  if (!state || typeof state !== 'object') {
    return { textBlock: '', expectedComponentsOneLiner: '', hasSchemeContext: false };
  }
  /** @type {Record<string, unknown>} */
  const st = state;
  const sd = st.schemeDesignResult && typeof st.schemeDesignResult === 'object' ? st.schemeDesignResult : null;
  const ar = st.analysisResult && typeof st.analysisResult === 'object' ? st.analysisResult : null;

  if (!sd && !ar) {
    return { textBlock: '', expectedComponentsOneLiner: '', hasSchemeContext: false };
  }

  const lines = [];
  lines.push('【可选参考 · 前序方案 / BOM（仅当本回合前跑过方案设计且状态仍在；无本段时以用户当前描述 + 画布为准即可）】');
  lines.push(
    '判定原则：若**用户当前画布**上的元件与连接在**功能上已能满足用户需求**（含合理替代料、与下表关键词或 matchedKey 不完全一致），应视为 **可行**：',
    '- 连线 skill：`canvasVsScheme` 应优先 `complete_on_canvas`，正常生成 `plannedOperations`；',
    '- 仅在画布**明显缺少实现用户需求所必需**的器件或电气关系时，再使用 `missing_parts_on_canvas` 并列出 `missingPartsSummary`。',
    '下表用于缺件提醒与引脚对照辅助，**不得**仅因命名或方案表差异而拒绝布线。'
  );

  const ureq = String(st.userRequirement || '').trim();
  if (ureq) {
    lines.push('');
    lines.push(`方案阶段用户需求摘录：${ureq.slice(0, 520)}${ureq.length > 520 ? '…' : ''}`);
  }

  if (sd) {
    lines.push('');
    const summary = String(sd.summary || '').trim();
    if (summary) lines.push(`方案摘要：${summary.slice(0, 650)}${summary.length > 650 ? '…' : ''}`);
    const narrative = String(sd.narrative || '').trim();
    if (narrative) lines.push(`方案说明：${narrative.slice(0, 420)}${narrative.length > 420 ? '…' : ''}`);
    const ep = sd.estimatedParams && typeof sd.estimatedParams === 'object' ? sd.estimatedParams : null;
    if (ep) {
      try {
        const compact = JSON.stringify(ep);
        if (compact && compact.length > 2) {
          lines.push(`估算参数（JSON）：${compact.slice(0, 500)}${compact.length > 500 ? '…' : ''}`);
        }
      } catch {
        /* skip */
      }
    }
  }

  /** @type {string[]} */
  const oneParts = [];

  if (ar && Array.isArray(ar.components) && ar.components.length > 0) {
    lines.push('');
    lines.push('库匹配元件行（参考，exists=1 表示库内可复用件）：');
    ar.components.slice(0, MAX_COMPONENT_ROWS).forEach((c, i) => {
      const label = componentLabel(c, i);
      if (!c || typeof c !== 'object') {
        lines.push(`  - ${label}`);
        return;
      }
      const row = /** @type {Record<string, unknown>} */ (c);
      const mk = row.matchedKey != null && String(row.matchedKey).trim() ? String(row.matchedKey) : '-';
      const rk = row.recommendedKey != null && String(row.recommendedKey).trim() ? String(row.recommendedKey) : '';
      const ex = Number(row.exists) === 1 ? 'exists=1' : 'exists=0';
      const rec = String(row.recommendation || '').trim().slice(0, 140);
      lines.push(`  - ${label} | matchedKey=${mk}${rk ? ` | recommendedKey=${rk}` : ''} | ${ex}${rec ? ` | ${rec}` : ''}`);
      const bit = mk && mk !== '-' ? `${label}(${mk})` : label;
      oneParts.push(bit);
    });
    const asum = String(ar.summary || '').trim();
    if (asum) {
      lines.push('');
      lines.push(`BOM 小结：${asum.slice(0, 450)}${asum.length > 450 ? '…' : ''}`);
    }
  } else if (sd && oneParts.length === 0) {
    const summary = String(sd.summary || '').trim();
    if (summary) oneParts.push(`方案摘要：${summary.slice(0, 400)}`);
  }

  const textBlock = lines.join('\n').slice(0, MAX_TEXT_CHARS);
  const expectedComponentsOneLiner = oneParts.filter(Boolean).join('；').slice(0, MAX_ONELINER_CHARS);

  return {
    textBlock,
    expectedComponentsOneLiner,
    hasSchemeContext: true
  };
}

/**
 * @param {any} engine
 * @returns {Promise<{ textBlock: string, expectedComponentsOneLiner: string, hasSchemeContext: boolean }>}
 */
async function buildSchemeFollowupInjectionFromEngine(engine) {
  const state = await readSkillStateFromEngine(engine);
  return buildSchemeFollowupInjection(state);
}

module.exports = {
  readSkillStateFromEngine,
  buildSchemeFollowupInjection,
  buildSchemeFollowupInjectionFromEngine
};
