/**
 * @fileoverview 将 `wiringRules` 归一化为可读字符串：模型可能输出 string、object、object[]（直接 `String` 会得到 `[object Object]`）。
 */

/**
 * @param {unknown} rules
 * @returns {string}
 */
function normalizeWiringRulesInput(rules) {
  if (rules == null || rules === '') return '';
  if (typeof rules === 'string') return rules.trim();
  if (Array.isArray(rules)) {
    return rules
      .map((item, i) => {
        if (item == null || item === '') return '';
        const n = i + 1;
        if (typeof item === 'object') {
          try {
            return `${n}. ${JSON.stringify(item)}`;
          } catch {
            return `${n}. （无法序列化）`;
          }
        }
        return `${n}. ${String(item).trim()}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof rules === 'object') {
    try {
      return JSON.stringify(rules, null, 2);
    } catch {
      return '';
    }
  }
  return String(rules).trim();
}

module.exports = {
  normalizeWiringRulesInput
};
