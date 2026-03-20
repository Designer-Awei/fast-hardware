/**
 * Fast Hardware - 发布打包脚本
 * 负责在打包前按 `package.json` 同步展示用版本号，并清理 dist 目录，避免历史产物残留。
 */

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { syncVersionFromPackageJson } = require('./sync-version');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');

/**
 * 读取 package.json 中配置的输出目录
 * @returns {Promise<string>} 输出目录绝对路径
 */
async function getOutputDirectory() {
  const packageContent = await fs.readFile(PACKAGE_JSON_PATH, 'utf8');
  const packageJson = JSON.parse(packageContent);
  const outputDirectory = packageJson.build?.directories?.output || 'dist';
  return path.resolve(PROJECT_ROOT, outputDirectory);
}

/**
 * 清理打包输出目录，并重新创建空目录
 * @returns {Promise<string>} 已清理的输出目录绝对路径
 */
async function cleanOutputDirectory() {
  const outputDirectory = await getOutputDirectory();
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  console.log(`[dist] 已清理输出目录: ${outputDirectory}`);
  return outputDirectory;
}

/**
 * 执行 electron-builder 打包
 * @returns {Promise<void>} 打包完成
 */
function runElectronBuilder() {
  return new Promise((resolve, reject) => {
    const cliEntry = require.resolve('electron-builder/out/cli/cli.js', {
      paths: [PROJECT_ROOT]
    });

    const childProcess = spawn(process.execPath, [cliEntry, '--publish=never'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    childProcess.on('error', reject);
    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`electron-builder 退出码异常: ${code}`));
    });
  });
}

/**
 * 脚本主入口
 * @returns {Promise<void>} 执行完成
 */
async function main() {
  const cleanOnly = process.argv.includes('--clean-only');

  if (!cleanOnly) {
    syncVersionFromPackageJson();
  }

  await cleanOutputDirectory();

  if (cleanOnly) {
    return;
  }

  await runElectronBuilder();
}

main().catch((error) => {
  console.error('[dist] 打包流程失败:', error);
  process.exit(1);
});
