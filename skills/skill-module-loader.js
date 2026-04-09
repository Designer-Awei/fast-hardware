/**
 * @fileoverview 仅扫描**项目内** `skills/skills/<skillId>/index.js` 并 `require`，供 `skills/index.js` 单源注册。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 列出某根目录下可加载的 skill 包入口（仅含存在 `index.js` 的子目录）。
 * @param {string} dir - 目录绝对路径（如 `.../skills/skills`）
 * @returns {string[]} `index.js` 绝对路径列表，按 skill 文件夹名字母序
 */
function listSkillPackageEntryPaths(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }
  const names = fs.readdirSync(dir);
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const entry = path.join(full, 'index.js');
    if (!fs.existsSync(entry)) continue;
    const md = path.join(full, 'SKILL.md');
    if (!fs.existsSync(md)) {
      console.warn(`[skills] 缺少 SKILL.md，仍加载: ${full}`);
    }
    out.push(entry);
  }
  return out.sort((a, b) => path.basename(path.dirname(a)).localeCompare(path.basename(path.dirname(b))));
}

/**
 * 按路径列表加载 skill 模块（顺序与路径一致）。
 * @param {string[]} absolutePaths
 * @returns {ReadonlyArray<{ NAME: string, getManifest: () => object, execute: Function }>}
 */
function loadSkillModulesFromPaths(absolutePaths) {
  return Object.freeze(absolutePaths.map((p) => require(p)));
}

/**
 * 从应用内 `skills/skills` 根目录加载全部 skill 包。
 * @param {string} skillsPackagesRoot - 如 `path.join(__dirname, 'skills')`
 * @returns {ReadonlyArray<{ NAME: string, getManifest: () => object, execute: Function }>}
 */
function loadSkillModules(skillsPackagesRoot) {
  const paths = listSkillPackageEntryPaths(skillsPackagesRoot);
  return loadSkillModulesFromPaths(paths);
}

module.exports = {
  listSkillPackageEntryPaths,
  loadSkillModulesFromPaths,
  loadSkillModules
};
