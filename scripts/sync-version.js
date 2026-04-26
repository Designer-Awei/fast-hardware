/**
 * 从 `package.json` 读取 `version`，同步到仓库内用于展示/打包说明的散落字符串。
 *
 * - **不修改** `package-lock.json` 中第三方依赖的版本范围（如 `~0.2.3`）。
 * - **不修改** `model_config.json`（其 `version` 为模型清单模式版本，非 App semver）。
 * - **不修改** `0-Change-Log.md`（避免误替换历史版本号段落）。
 * - **不修改** `README.md` / `README_EN.md`（文档正文由人工维护，避免仅版本号自动变化造成描述不一致）。
 * - **`npm run dist`** 经 `scripts/build-dist.js` 会在打包前调用 `syncVersionFromPackageJson()`。
 *
 * 产品版本与 CHANGELOG 对照见 `feature-prd/0-PRD.md`「版本号、变更日志与同步脚本」。
 * @module scripts/sync-version
 */

const fs = require('fs');
const path = require('path');

/** @type {string} 项目根目录绝对路径 */
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * 读取 package.json 中的版本号。
 * @returns {string} semver 版本字符串
 */
function readPackageVersion() {
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.version || typeof pkg.version !== 'string') {
    throw new Error('package.json 缺少有效的 version 字段');
  }
  return pkg.version;
}

/**
 * 将 package.json 版本同步到各目标文件。
 * @returns {{ version: string, changedFiles: string[] }} 目标版本与发生写入的文件列表
 */
function syncVersionFromPackageJson() {
  const version = readPackageVersion();
  /** @type {string[]} */
  const changedFiles = [];

  const indexPath = path.join(PROJECT_ROOT, 'index.html');
  const indexBefore = fs.readFileSync(indexPath, 'utf8');
  const indexAfter = indexBefore.replace(/Fast Hardware v\d+\.\d+\.\d+/g, `Fast Hardware v${version}`);
  if (indexAfter !== indexBefore) {
    fs.writeFileSync(indexPath, indexAfter, 'utf8');
    changedFiles.push('index.html');
  }

  const mainPath = path.join(PROJECT_ROOT, 'main.js');
  const mainBefore = fs.readFileSync(mainPath, 'utf8');
  const mainAfter = mainBefore.replace(
    /'User-Agent': 'Fast-Hardware\/\d+\.\d+\.\d+'/g,
    `'User-Agent': 'Fast-Hardware/${version}'`
  );
  if (mainAfter !== mainBefore) {
    fs.writeFileSync(mainPath, mainAfter, 'utf8');
    changedFiles.push('main.js');
  }

  const updatePath = path.join(PROJECT_ROOT, 'assets', 'update.txt');
  const updateBefore = fs.readFileSync(updatePath, 'utf8');
  const updateData = JSON.parse(updateBefore);
  if (Array.isArray(updateData) && updateData[0] && updateData[0].version !== version) {
    updateData[0].version = version;
    const updateAfter = `${JSON.stringify(updateData, null, 2)}\n`;
    fs.writeFileSync(updatePath, updateAfter, 'utf8');
    changedFiles.push('assets/update.txt');
  }

  if (changedFiles.length > 0) {
    console.log(`[sync-version] 已同步到 ${version}，写入: ${changedFiles.join(', ')}`);
  } else {
    console.log(`[sync-version] 已为 ${version}，无需变更`);
  }

  return { version, changedFiles };
}

if (require.main === module) {
  try {
    syncVersionFromPackageJson();
  } catch (error) {
    console.error('[sync-version] 失败:', error.message || error);
    process.exit(1);
  }
}

module.exports = {
  readPackageVersion,
  syncVersionFromPackageJson
};
