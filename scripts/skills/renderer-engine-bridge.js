/**
 * @fileoverview 主进程侧：将 `CircuitSkillsEngine` 能力通过 IPC 转发到渲染进程执行（混合架构）。
 */

'use strict';

const { ipcMain } = require('electron');
const crypto = require('crypto');

/**
 * 允许从主进程经 IPC 调用的引擎方法名（须与 `scripts/circuit-skills-engine.js` 中实例方法一致）
 * @type {ReadonlySet<string>}
 */
const ALLOWED_ENGINE_OPS = new Set([
  'runSchemeDesign',
  'runRequirementAnalysis',
  'runCompletionSuggestions',
  'runSummarizeText',
  'runFirmwareCodePatch',
  'getCanvasSnapshotForSkill',
  'runWiringEditPlan',
  'applyWiringEditOperations',
  'webSearchExa',
  'getCurrentSkillState',
  'getProjectWorkspaceSnapshotForSkill'
]);

/** @type {Map<string, { resolve: function, reject: function, timer: NodeJS.Timeout, senderId: number }>} */
const pendingEngineCalls = new Map();

const DEFAULT_TIMEOUT_MS = 600000;

/**
 * 注册 `skills-engine-result` 一次性解析（须在 app ready 前调用一次即可）
 * @returns {void}
 */
function setupSkillsEngineBridge() {
  ipcMain.on('skills-engine-result', (event, payload) => {
    if (!payload || typeof payload.callId !== 'string') {
      return;
    }
    const entry = pendingEngineCalls.get(payload.callId);
    if (!entry) {
      return;
    }
    if (entry.senderId !== event.sender.id) {
      return;
    }
    pendingEngineCalls.delete(payload.callId);
    clearTimeout(entry.timer);
    if (payload.ok) {
      entry.resolve(payload.result);
    } else {
      entry.reject(new Error(payload.error || 'skills-engine 调用失败'));
    }
  });
}

/**
 * 向发起 `execute-skill` 的同一 `webContents` 所注册的渲染端 handler 发起引擎调用
 * @param {import('electron').WebContents} webContents
 * @param {string} op
 * @param {unknown[]} args
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown>}
 */
function invokeRendererEngineOp(webContents, op, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!ALLOWED_ENGINE_OPS.has(op)) {
    return Promise.reject(new Error(`不允许的 engine 操作: ${op}`));
  }
  if (!webContents || webContents.isDestroyed()) {
    return Promise.reject(new Error('webContents 不可用'));
  }
  const callId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingEngineCalls.has(callId)) {
        pendingEngineCalls.delete(callId);
        reject(new Error(`skills-engine-invoke 超时: ${op}`));
      }
    }, timeoutMs);
    pendingEngineCalls.set(callId, { resolve, reject, timer, senderId: webContents.id });
    try {
      webContents.send('skills-engine-invoke', { callId, op, args: args || [] });
    } catch (e) {
      pendingEngineCalls.delete(callId);
      clearTimeout(timer);
      reject(e);
    }
  });
}

/**
 * 供主进程 skill `execute` 使用的 `skillsEngine` 代理（方法均异步）
 * @param {import('electron').WebContents} webContents
 * @returns {Record<string, Function>}
 */
function createSkillsEngineProxy(webContents) {
  const call = (op, args) => invokeRendererEngineOp(webContents, op, args);
  return {
    runSchemeDesign: (a) => call('runSchemeDesign', [a]),
    runRequirementAnalysis: (a, b) => call('runRequirementAnalysis', [a, b]),
    runCompletionSuggestions: (a, b, c) => call('runCompletionSuggestions', [a, b, c]),
    runSummarizeText: (a, b) => call('runSummarizeText', [a, b || {}]),
    runFirmwareCodePatch: (a, b, c) => call('runFirmwareCodePatch', [a, b, c || {}]),
    getCanvasSnapshotForSkill: () => call('getCanvasSnapshotForSkill', []),
    runWiringEditPlan: (a, b, c, d) => call('runWiringEditPlan', [a, b, c, d && typeof d === 'object' ? d : {}]),
    applyWiringEditOperations: (a) => call('applyWiringEditOperations', [a]),
    webSearchExa: (a, b) => call('webSearchExa', [a, b]),
    getCurrentSkillState: () => call('getCurrentSkillState', []),
    getProjectWorkspaceSnapshotForSkill: (projectRoot) => call('getProjectWorkspaceSnapshotForSkill', [projectRoot || ''])
  };
}

module.exports = {
  setupSkillsEngineBridge,
  invokeRendererEngineOp,
  createSkillsEngineProxy,
  ALLOWED_ENGINE_OPS
};
