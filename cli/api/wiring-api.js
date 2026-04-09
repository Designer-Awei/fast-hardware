'use strict';

const { readCanvasSnapshot } = require('./canvas-api');

/**
 * @param {{ requirement: string, dryRun?: boolean, project?: string }} opts
 * @returns {Promise<{ rationale: string, plannedOperations: Array<Record<string, unknown>>, parseError?: string, raw?: string, missingParts?: Array<Record<string, unknown>>, usedCanvasSnapshot?: Record<string, unknown> }>}
 */
async function planWiring(opts) {
  const req = String(opts.requirement || '').trim();
  const snapResp = await readCanvasSnapshot({
    project: typeof opts.project === 'string' ? opts.project : '',
    format: 'json'
  });
  const snap = snapResp && typeof snapResp.snapshot === 'object' ? snapResp.snapshot : null;
  const components = Array.isArray(snap?.components) ? snap.components : [];
  const connections = Array.isArray(snap?.connections) ? snap.connections : [];
  const componentIds = new Set(
    components
      .map((c) => (c && typeof c === 'object' ? String(c.instanceId || '').trim() : ''))
      .filter(Boolean)
  );

  /** @type {Array<Record<string, unknown>>} */
  const plannedOperations = [];
  /** @type {Array<Record<string, unknown>>} */
  const missingParts = [];

  // M3 第一小步：先复用 wiring_edit_skill 的操作结构（add_connection/remove_connection），规则先做确定性最小计划。
  if (/断开|移除|删除/.test(req) && connections.length > 0) {
    const first = connections[0];
    plannedOperations.push({
      op: 'remove_connection',
      connectionId: String(first.id || '')
    });
  } else if (components.length >= 2) {
    const a = components[0];
    const b = components[1];
    const aid = String(a?.instanceId || '').trim();
    const bid = String(b?.instanceId || '').trim();
    if (aid && bid && componentIds.has(aid) && componentIds.has(bid)) {
      plannedOperations.push({
        op: 'add_connection',
        id: `cli-wire-${Date.now()}`,
        source: { instanceId: aid, pinId: 'side1-1', pinName: 'AUTO' },
        target: { instanceId: bid, pinId: 'side1-1', pinName: 'AUTO' },
        wireType: 'default',
        path: [],
        style: { thickness: 2, dashPattern: [] }
      });
    } else {
      missingParts.push({
        reason: '画布 instanceId 无效，无法生成 add_connection',
        candidates: [aid, bid]
      });
    }
  } else {
    missingParts.push({
      reason: '画布元件少于 2 个，无法生成 add_connection',
      componentCount: components.length
    });
  }

  const rationale = plannedOperations.length
    ? `已根据需求生成 ${plannedOperations.length} 条连线操作计划（M3-dry-run）。`
    : '当前无法给出可执行连线操作，已返回缺口说明（M3-dry-run）。';

  return {
    rationale,
    plannedOperations,
    missingParts,
    usedCanvasSnapshot: snap && typeof snap === 'object' ? snap : {}
  };
}

module.exports = {
  planWiring
};
