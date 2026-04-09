'use strict';

const { readCanvasSnapshot } = require('../api/canvas-api');

/**
 * @param {Record<string, string|boolean>} args
 * @returns {Promise<Record<string, unknown>>}
 */
async function runCanvasRead(args = {}) {
  const project = typeof args.project === 'string' ? args.project : '';
  const format = typeof args.format === 'string' ? args.format : 'json';
  const data = await readCanvasSnapshot({ project, format });
  return {
    success: true,
    command: 'canvas:read',
    data,
    meta: {
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  runCanvasRead
};
