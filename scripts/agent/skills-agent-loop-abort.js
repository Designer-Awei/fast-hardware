/**
 * @fileoverview 主进程 Skills Agent 循环中断：按 `webContents.id` 记录用户点击「中断」后的中止请求。
 */

'use strict';

/** @type {Map<number, boolean>} */
const abortByWebContentsId = new Map();

/**
 * @param {number} webContentsId - `webContents.id`
 * @returns {void}
 */
function requestAbort(webContentsId) {
  abortByWebContentsId.set(webContentsId, true);
}

/**
 * @param {number} webContentsId
 * @returns {void}
 */
function clearAbort(webContentsId) {
  abortByWebContentsId.delete(webContentsId);
}

/**
 * @param {number} webContentsId
 * @returns {boolean}
 */
function isAbortRequested(webContentsId) {
  return abortByWebContentsId.get(webContentsId) === true;
}

module.exports = {
  requestAbort,
  clearAbort,
  isAbortRequested
};
