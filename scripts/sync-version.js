/**
 * 从 `package.json` 读取 `version`，同步到仓库内用于展示/打包说明的散落字符串。
 * 不修改 `package-lock.json` 中第三方依赖的版本范围（如 `~0.2.3`）。
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
 * 对 README / README_EN 应用已知的版本替换模式（避免误改「历史版本 v0.2.0」等段落）。
 * @param {string} content - 原始 Markdown
 * @param {string} version - 目标版本
 * @returns {string} 替换后的 Markdown
 */
function applyReadmeVersionPatterns(content, version) {
  let result = content;
  result = result.replace(/version-\d+\.\d+\.\d+-blue/g, `version-${version}-blue`);
  result = result.replace(/## ✨ 最新特性 \(v\d+\.\d+\.\d+\)/, `## ✨ 最新特性 (v${version})`);
  result = result.replace(/## ✨ Latest Features \(v\d+\.\d+\.\d+\)/, `## ✨ Latest Features (v${version})`);
  result = result.replace(
    /\*\*版本升级\*\*:\s*项目当前版本升级为 `\d+\.\d+\.\d+`/g,
    `**版本升级**: 项目当前版本升级为 \`${version}\``
  );
  result = result.replace(
    /\*\*Version bump\*\*:\s*The project version is now `\d+\.\d+\.\d+`/g,
    `**Version bump**: The project version is now \`${version}\``
  );
  result = result.replace(/Fast-Hardware-Setup-\d+\.\d+\.\d+\.exe/g, `Fast-Hardware-Setup-${version}.exe`);
  result = result.replace(/Fast Hardware-\d+\.\d+\.\d+\.dmg/g, `Fast Hardware-${version}.dmg`);
  result = result.replace(/Fast Hardware-\d+\.\d+\.\d+\.AppImage/g, `Fast Hardware-${version}.AppImage`);
  result = result.replace(/fast-hardware_\d+\.\d+\.\d+_amd64\.deb/g, `fast-hardware_${version}_amd64.deb`);
  result = result.replace(/fast-hardware-\d+\.\d+\.\d+\.x86_64\.rpm/g, `fast-hardware-${version}.x86_64.rpm`);
  return result;
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

  const readmePath = path.join(PROJECT_ROOT, 'README.md');
  const readmeBefore = fs.readFileSync(readmePath, 'utf8');
  const readmeAfter = applyReadmeVersionPatterns(readmeBefore, version);
  if (readmeAfter !== readmeBefore) {
    fs.writeFileSync(readmePath, readmeAfter, 'utf8');
    changedFiles.push('README.md');
  }

  const readmeEnPath = path.join(PROJECT_ROOT, 'README_EN.md');
  const readmeEnBefore = fs.readFileSync(readmeEnPath, 'utf8');
  const readmeEnAfter = applyReadmeVersionPatterns(readmeEnBefore, version);
  if (readmeEnAfter !== readmeEnBefore) {
    fs.writeFileSync(readmeEnPath, readmeEnAfter, 'utf8');
    changedFiles.push('README_EN.md');
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
  applyReadmeVersionPatterns,
  syncVersionFromPackageJson
};
