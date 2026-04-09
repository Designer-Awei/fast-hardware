'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} projectRoot
 * @returns {Array<{ projectName: string, configPath: string, mtimeMs: number }>}
 */
function listProjects(projectRoot) {
  const out = [];
  let dirents = [];
  try {
    dirents = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const projectName = d.name;
    const configPath = path.join(projectRoot, projectName, 'circuit_config.json');
    if (!fs.existsSync(configPath)) continue;
    const st = fs.statSync(configPath);
    out.push({
      projectName,
      configPath,
      mtimeMs: Number(st.mtimeMs || 0)
    });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/**
 * @param {{ projectsRoot: string, project?: string }} opts
 * @returns {{ projectName: string, configPath: string }}
 */
function resolveProjectConfig(opts) {
  const projectsRoot = opts.projectsRoot;
  const raw = String(opts.project || '').trim();
  if (raw) {
    const byName = path.join(projectsRoot, raw, 'circuit_config.json');
    if (fs.existsSync(byName)) {
      return { projectName: raw, configPath: byName };
    }
    if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
      const pn = path.basename(path.dirname(raw)) || 'unknown';
      return { projectName: pn, configPath: raw };
    }
    throw new Error(`Project not found: ${raw}`);
  }
  const all = listProjects(projectsRoot);
  if (!all.length) {
    throw new Error(`No project found under: ${projectsRoot}`);
  }
  return { projectName: all[0].projectName, configPath: all[0].configPath };
}

/**
 * @param {{ project?: string, format?: string }} opts
 * @returns {Promise<{ snapshot: Record<string, unknown>|string, source: string, format: string }>}
 */
async function readCanvasSnapshot(opts = {}) {
  const formatRaw = String(opts.format || 'json').toLowerCase();
  const format = formatRaw === 'text' ? 'text' : 'json';
  const projectsRoot = path.join(process.cwd(), 'data', 'projects');
  const { projectName, configPath } = resolveProjectConfig({
    projectsRoot,
    project: typeof opts.project === 'string' ? opts.project : ''
  });
  const raw = fs.readFileSync(configPath, 'utf8');
  /** @type {Record<string, any>} */
  const parsed = JSON.parse(raw);
  const componentCount = Array.isArray(parsed.components) ? parsed.components.length : 0;
  const connectionCount = Array.isArray(parsed.connections) ? parsed.connections.length : 0;
  const snapshotObj = {
    projectName,
    description: String(parsed.description || ''),
    version: String(parsed.version || ''),
    componentCount,
    connectionCount,
    lastModified: String(parsed.lastModified || ''),
    configPath,
    components: Array.isArray(parsed.components) ? parsed.components : [],
    connections: Array.isArray(parsed.connections) ? parsed.connections : []
  };
  const snapshot =
    format === 'text'
      ? [
          `projectName: ${projectName}`,
          `description: ${snapshotObj.description}`,
          `componentCount: ${componentCount}`,
          `connectionCount: ${connectionCount}`,
          `lastModified: ${snapshotObj.lastModified}`,
          `configPath: ${configPath}`
        ].join('\n')
      : snapshotObj;
  return {
    snapshot,
    source: 'runtime:data/projects',
    format
  };
}

module.exports = {
  readCanvasSnapshot
};
