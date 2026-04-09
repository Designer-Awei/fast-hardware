/**
 * @fileoverview 主进程执行 skills：`require` 聚合后的模块并调用 `execute`；`ctx.skillsEngine` 为渲染进程桥接代理。
 */

'use strict';

const { createSkillsEngineProxy } = require('./renderer-engine-bridge');

/**
 * @typedef {Object} ExecuteSkillPayload
 * @property {string} skillName
 * @property {unknown} [args]
 * @property {{ userRequirement?: string, canvasSnapshot?: unknown }} [ctxPayload]
 */

/**
 * 在主进程执行单个 skill（引擎能力经 IPC 在渲染进程运行）
 * @param {import('electron').WebContents} webContents
 * @param {ExecuteSkillPayload} payload
 * @returns {Promise<unknown>}
 */
async function executeSkillInMain(webContents, payload) {
  const skillName = String(payload?.skillName || '').trim();
  const args = payload?.args;
  const ctxPayload = payload?.ctxPayload && typeof payload.ctxPayload === 'object' ? payload.ctxPayload : {};

  const { SKILL_MODULES } = require('../../skills/index.js');
  const mod = SKILL_MODULES.find((m) => m.NAME === skillName);
  if (!mod || typeof mod.execute !== 'function') {
    return { success: false, error: `未知 skill: ${skillName}` };
  }

  const ctx = {
    userRequirement: String(ctxPayload.userRequirement || '').trim(),
    canvasSnapshot: ctxPayload.canvasSnapshot,
    skillsEngine: createSkillsEngineProxy(webContents)
  };

  try {
    return await mod.execute(args, ctx);
  } catch (e) {
    return {
      success: false,
      error: e?.message || String(e)
    };
  }
}

module.exports = {
  executeSkillInMain
};
