/**
 * @fileoverview 画布快照的**确定性**结构分析，供固件补丁生成前判断：空画布 / 结构不完整 / 可作引脚级落地。
 * 浏览器与 Node 共用（UMD 形态）。
 */

'use strict';

/**
 * @typedef {'empty'|'snapshot_error'|'structurally_incomplete'|'structurally_complete'} CanvasFirmwareReadiness
 */

/**
 * @typedef {'snapshot_error'|'missing_parts'|'missing_wiring'|'ready'} FirmwareCanvasGapKind
 */

/**
 * @param {CanvasFirmwareReadiness} readiness
 * @param {object} _o
 * @returns {FirmwareCanvasGapKind}
 */
function deriveFirmwareGapKind(readiness, _o) {
  if (readiness === 'snapshot_error') return 'snapshot_error';
  if (readiness === 'empty') return 'missing_parts';
  if (readiness === 'structurally_complete') return 'ready';
  return 'missing_wiring';
}

/**
 * @param {FirmwareCanvasGapKind} gapKind
 * @returns {'empty_canvas'|'wiring_incomplete'|'ready_pin_level'}
 */
function firmwareGapKindToPhase(gapKind) {
  if (gapKind === 'missing_parts') return 'empty_canvas';
  if (gapKind === 'ready') return 'ready_pin_level';
  return 'wiring_incomplete';
}

/**
 * @param {unknown} snapRaw
 * @returns {{
 *   readiness: CanvasFirmwareReadiness,
 *   gapKind: FirmwareCanvasGapKind,
 *   issues: string[],
 *   componentCount: number,
 *   connectionCount: number,
 *   invalidConnectionIds: string[],
 *   disconnectedInstanceIds: string[],
 *   projectName: string
 * }}
 */
function analyzeCanvasSnapshotForFirmware(snapRaw) {
  const snap = snapRaw && typeof snapRaw === 'object' && !Array.isArray(snapRaw) ? snapRaw : {};
  const issues = /** @type {string[]} */ ([]);
  const components = Array.isArray(snap.components) ? snap.components : [];
  const connections = Array.isArray(snap.connections) ? snap.connections : [];

  if (snap.error && String(snap.error).trim()) {
    issues.push(`画布读取异常：${String(snap.error).trim()}`);
    const readiness = 'snapshot_error';
    return {
      readiness,
      gapKind: deriveFirmwareGapKind(readiness, {}),
      issues,
      componentCount: components.length,
      connectionCount: connections.length,
      invalidConnectionIds: [],
      disconnectedInstanceIds: [],
      projectName: String(snap.projectName || '')
    };
  }

  if (components.length === 0) {
    issues.push('画布中没有任何元件实例');
    const readiness = 'empty';
    return {
      readiness,
      gapKind: deriveFirmwareGapKind(readiness, {}),
      issues,
      componentCount: 0,
      connectionCount: connections.length,
      invalidConnectionIds: [],
      disconnectedInstanceIds: [],
      projectName: String(snap.projectName || '')
    };
  }

  const idSet = new Set(
    components.map((c) => String(c?.instanceId || '').trim()).filter(Boolean)
  );
  /** @type {string[]} */
  const invalidConnectionIds = [];
  for (const conn of connections) {
    const sid = String(conn?.source?.instanceId || conn?.source?.componentId || '').trim();
    const tid = String(conn?.target?.instanceId || conn?.target?.componentId || '').trim();
    const cid = String(conn?.id || '').trim();
    if (!sid || !idSet.has(sid) || !tid || !idSet.has(tid)) {
      invalidConnectionIds.push(cid || '(no-id)');
    }
  }
  if (invalidConnectionIds.length) {
    issues.push(`有 ${invalidConnectionIds.length} 条连线引用了不存在的元件或端点`);
  }

  const touched = new Set();
  for (const conn of connections) {
    const sid = String(conn?.source?.instanceId || conn?.source?.componentId || '').trim();
    const tid = String(conn?.target?.instanceId || conn?.target?.componentId || '').trim();
    if (idSet.has(sid)) touched.add(sid);
    if (idSet.has(tid)) touched.add(tid);
  }
  const disconnectedInstanceIds = components
    .map((c) => String(c?.instanceId || '').trim())
    .filter(Boolean)
    .filter((id) => !touched.has(id));

  if (components.length >= 2 && disconnectedInstanceIds.length > 0) {
    issues.push(
      `有 ${disconnectedInstanceIds.length} 个元件未出现在任何连线中（布线可能未完成）`
    );
  }

  const structurallyBroken =
    invalidConnectionIds.length > 0 ||
    (components.length >= 2 && disconnectedInstanceIds.length > 0);

  const readiness = structurallyBroken ? 'structurally_incomplete' : 'structurally_complete';
  return {
    readiness,
    gapKind: deriveFirmwareGapKind(readiness, {
      invalidConnectionIds,
      disconnectedInstanceIds,
      componentCount: components.length
    }),
    issues,
    componentCount: components.length,
    connectionCount: connections.length,
    invalidConnectionIds,
    disconnectedInstanceIds,
    projectName: String(snap.projectName || '')
  };
}

/**
 * @param {unknown} snap
 * @param {number} [maxLen]
 * @returns {string}
 */
function stringifyCanvasSnapshotForPrompt(snap, maxLen = 10000) {
  try {
    const s = JSON.stringify(snap ?? {}, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n…（已截断）`;
  } catch {
    return '{}';
  }
}

/**
 * @param {object} analysis
 * @returns {{
 *   phase: string,
 *   userFacingHint: string,
 *   pinBindings: unknown[],
 *   recommendedNextSkills: string[],
 *   gapKind: FirmwareCanvasGapKind
 * }}
 */
function buildFirmwareCanvasGuidanceFallback(analysis) {
  const gapKind =
    analysis.gapKind || deriveFirmwareGapKind(analysis.readiness, analysis);
  const phase = firmwareGapKindToPhase(gapKind);
  let userFacingHint = '';
  /** @type {string[]} */
  let recommendedNextSkills = [];

  if (gapKind === 'missing_parts') {
    userFacingHint =
      '判定为**缺件**（画布空或未摆齐元件）。仍可生成**可审阅补丁**：允许含**通用可编译示例**（如 `LED_BUILTIN` 或常见板默认数字引脚），并在 notes 标明「与当前画布未绑定，可按实物改引脚」。支持**先写固件后补画布**；若需与画布一一对应引脚，可后续补元件或再选方案设计。';
    /** 不强制同轮编排 scheme/wiring；由主 agent 按用户意图决定是否追问方案 */
    recommendedNextSkills = [];
  } else if (gapKind === 'missing_wiring') {
    const detail = analysis.issues.length ? analysis.issues.join('；') : '连线未完成或存在无效连接';
    userFacingHint = `判定为**缺连线**（${detail}）。请由 agent **先调用 wiring_edit_skill** 按当前画布补全连线，再重新调用本 skill 生成引脚级固件。`;
    recommendedNextSkills = ['wiring_edit_skill'];
  } else if (gapKind === 'snapshot_error') {
    userFacingHint =
      '无法可靠读取画布，已采用保守策略生成补丁。请确认项目与画布已打开后重试。';
    recommendedNextSkills = [];
  } else {
    userFacingHint = '画布结构完整；补丁中的引脚常量请与画布逐一对照。';
    recommendedNextSkills = [];
  }

  return { phase, userFacingHint, pinBindings: [], recommendedNextSkills, gapKind };
}

/**
 * @param {unknown} llmRaw
 * @param {object} analysis
 * @returns {{
 *   phase: string,
 *   userFacingHint: string,
 *   pinBindings: unknown[],
 *   recommendedNextSkills: string[],
 *   gapKind: FirmwareCanvasGapKind
 * }}
 */
function mergeFirmwareCanvasGuidance(llmRaw, analysis) {
  const base = buildFirmwareCanvasGuidanceFallback(analysis);
  const expectedPhase = base.phase;
  const g = llmRaw && typeof llmRaw === 'object' ? llmRaw : {};
  const valid = new Set(['empty_canvas', 'wiring_incomplete', 'ready_pin_level']);
  let phase = String(g.phase || '').trim();
  if (!valid.has(phase)) phase = expectedPhase;
  if (phase !== expectedPhase) phase = expectedPhase;
  const userFacingHint = String(g.userFacingHint || '').trim() || base.userFacingHint;
  const pinBindings = Array.isArray(g.pinBindings) ? g.pinBindings : [];
  const gapKind = base.gapKind;
  return {
    phase,
    userFacingHint,
    pinBindings,
    recommendedNextSkills: base.recommendedNextSkills,
    gapKind
  };
}

const firmwareCanvasApi = {
  analyzeCanvasSnapshotForFirmware,
  stringifyCanvasSnapshotForPrompt,
  deriveFirmwareGapKind,
  firmwareGapKindToPhase,
  buildFirmwareCanvasGuidanceFallback,
  mergeFirmwareCanvasGuidance
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = firmwareCanvasApi;
}
if (typeof window !== 'undefined') {
  window.fastHardwareCanvasSnapshotForFirmware = firmwareCanvasApi;
}
