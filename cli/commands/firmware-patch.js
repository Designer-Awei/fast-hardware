'use strict';

const { patchFirmware } = require('../api/firmware-api');

/**
 * @param {Record<string, string|boolean>} args
 * @returns {Promise<Record<string, unknown>>}
 */
async function runFirmwarePatch(args = {}) {
  const target = typeof args.target === 'string' ? args.target.trim() : '';
  const requirement = typeof args.requirement === 'string' ? args.requirement.trim() : '';
  const codeText = typeof args.code === 'string' ? args.code : '';
  const language = typeof args.language === 'string' ? args.language.trim() : 'arduino';
  if (!target || !requirement) {
    return {
      success: false,
      command: 'firmware:patch',
      error: {
        code: 'INVALID_ARGS',
        message: 'target and requirement are required; optional: --code "<text>" --language arduino|c|cpp'
      }
    };
  }
  const dryRun = !!args['dry-run'];
  const data = await patchFirmware({ target, requirement, codeText, language, dryRun });
  return {
    success: true,
    command: 'firmware:patch',
    data,
    meta: {
      dryRun,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  runFirmwarePatch
};
