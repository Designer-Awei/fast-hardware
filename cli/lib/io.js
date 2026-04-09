'use strict';

/**
 * @param {unknown} payload
 * @param {number} [code=0]
 * @returns {void}
 */
function printJsonAndExit(payload, code = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(code);
}

/**
 * @param {string} errCode
 * @param {string} message
 * @returns {void}
 */
function failAndExit(errCode, message) {
  const out = {
    success: false,
    error: {
      code: String(errCode || 'UNKNOWN'),
      message: String(message || 'Unknown error')
    }
  };
  printJsonAndExit(out, 1);
}

/**
 * @param {number} [code=0]
 * @returns {void}
 */
function printHelpAndExit(code = 0) {
  const lines = [
    'Fast Hardware CLI',
    '',
    'Usage:',
    '  node cli/index.js <command> [--key value]',
    '',
    'Commands:',
    '  canvas:read      --project <id?> --format json|text',
    '  wiring:plan      --requirement "<text>" [--project <id>] [--dry-run]',
    '  firmware:patch   --target <file> --requirement "<text>" [--code "<text>"] [--language arduino] [--dry-run]',
    '',
    'Examples:',
    '  node cli/index.js canvas:read --format json',
    '  node cli/index.js wiring:plan --requirement "桌面风扇连线" --dry-run',
    '  node cli/index.js firmware:patch --target src/main.c --requirement "增加超时保护" --language c --dry-run'
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(code);
}

module.exports = {
  printJsonAndExit,
  failAndExit,
  printHelpAndExit
};
