'use strict';

const { planWiring } = require('../api/wiring-api');

/**
 * @param {Record<string, string|boolean>} args
 * @returns {Promise<Record<string, unknown>>}
 */
async function runWiringPlan(args = {}) {
  const requirement = typeof args.requirement === 'string' ? args.requirement.trim() : '';
  if (!requirement) {
    return {
      success: false,
      command: 'wiring:plan',
      error: {
        code: 'INVALID_ARGS',
        message: 'requirement is required'
      }
    };
  }
  const dryRun = !!args['dry-run'];
  const project = typeof args.project === 'string' ? args.project : '';
  const data = await planWiring({ requirement, dryRun, project });
  return {
    success: true,
    command: 'wiring:plan',
    data,
    meta: {
      project: project || undefined,
      dryRun,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  runWiringPlan
};
