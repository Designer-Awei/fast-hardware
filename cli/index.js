#!/usr/bin/env node
'use strict';

const { printJsonAndExit, printHelpAndExit, failAndExit } = require('./lib/io');
const { runCanvasRead } = require('./commands/canvas-read');
const { runWiringPlan } = require('./commands/wiring-plan');
const { runFirmwarePatch } = require('./commands/firmware-patch');

/**
 * @param {string[]} argv
 * @returns {{ command: string, args: Record<string, string|boolean> }}
 */
function parseArgv(argv) {
  const arr = Array.isArray(argv) ? argv.slice() : [];
  const command = String(arr.shift() || 'help').trim();
  /** @type {Record<string, string|boolean>} */
  const args = {};
  for (let i = 0; i < arr.length; i++) {
    const token = String(arr[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = String(arr[i + 1] || '');
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return { command, args };
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const { command, args } = parseArgv(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelpAndExit(0);
    return;
  }
  try {
    if (command === 'canvas:read') {
      const out = await runCanvasRead(args);
      printJsonAndExit(out, 0);
      return;
    }
    if (command === 'wiring:plan') {
      const out = await runWiringPlan(args);
      printJsonAndExit(out, 0);
      return;
    }
    if (command === 'firmware:patch') {
      const out = await runFirmwarePatch(args);
      printJsonAndExit(out, 0);
      return;
    }
    failAndExit('UNKNOWN_COMMAND', `Unknown command: ${command}`);
  } catch (e) {
    failAndExit('UNCAUGHT', e && e.message ? e.message : String(e));
  }
}

void main();
