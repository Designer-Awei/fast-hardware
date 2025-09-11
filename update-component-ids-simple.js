/**
 * 简化元件ID前缀：standard → std, custom → ctm
 */

const fs = require('fs').promises;
const path = require('path');

const COMPONENT_DIRS = {
  standard: path.join(__dirname, 'data', 'system-components', 'standard'),
  custom: path.join(__dirname, 'data', 'system-components', 'custom')
};

/**
 * 更新单个元件文件的ID前缀
 */
async function updateComponentPrefix(filePath, oldPrefix, newPrefix) {
  try {
    // 读取文件
    const content = await fs.readFile(filePath, 'utf8');
    const component = JSON.parse(content);

    // 检查ID是否需要更新
    if (!component.id.startsWith(oldPrefix)) {
      console.log(`⚠️ ${path.basename(filePath)} - ID无需更新: ${component.id}`);
      return false;
    }

    // 更新ID
    const oldId = component.id;
    const newId = component.id.replace(oldPrefix, newPrefix);

    component.id = newId;

    // 生成新文件名
    const oldFileName = path.basename(filePath);
    const newFileName = `${newId}.json`;
    const newFilePath = path.join(path.dirname(filePath), newFileName);

    // 写入更新后的内容
    const updatedContent = JSON.stringify(component, null, 2);
    await fs.writeFile(filePath, updatedContent, 'utf8');

    // 如果需要重命名文件
    if (oldFileName !== newFileName) {
      await fs.rename(filePath, newFilePath);
      console.log(`🔄 ${oldFileName} → ${newFileName} (ID: ${oldId} → ${newId})`);
    } else {
      console.log(`📝 ${oldFileName} - 更新ID: ${oldId} → ${newId}`);
    }

    return true;
  } catch (error) {
    console.error(`❌ 更新文件失败 ${filePath}:`, error.message);
    return false;
  }
}

/**
 * 更新目录中的所有元件文件
 */
async function updateDirectory(directory, oldPrefix, newPrefix) {
  try {
    console.log(`\n🔍 扫描目录: ${directory}`);

    // 确保目录存在
    try {
      await fs.access(directory);
    } catch {
      console.log(`⚠️ 目录不存在: ${directory}`);
      return 0;
    }

    // 获取所有JSON文件
    const files = await fs.readdir(directory);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    console.log(`📁 找到 ${jsonFiles.length} 个元件文件`);

    let updatedCount = 0;

    // 更新每个文件
    for (const file of jsonFiles) {
      const filePath = path.join(directory, file);
      const updated = await updateComponentPrefix(filePath, oldPrefix, newPrefix);
      if (updated) updatedCount++;
    }

    console.log(`✅ ${newPrefix} 库更新完成: ${updatedCount}/${jsonFiles.length} 个文件已更新`);
    return updatedCount;
  } catch (error) {
    console.error(`❌ 更新目录失败 ${directory}:`, error.message);
    return 0;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始简化元件ID前缀...\n');

  let totalUpdated = 0;

  // 更新标准库：standard- → std-
  const standardUpdated = await updateDirectory(COMPONENT_DIRS.standard, 'standard-', 'std-');
  totalUpdated += standardUpdated;

  // 更新自定义库：custom- → ctm-
  const customUpdated = await updateDirectory(COMPONENT_DIRS.custom, 'custom-', 'ctm-');
  totalUpdated += customUpdated;

  console.log(`\n🎉 前缀简化完成！共更新了 ${totalUpdated} 个元件文件`);
  console.log('\n📋 新的前缀格式:');
  console.log('   - 标准库: std-');
  console.log('   - 自定义库: ctm-');
}

// 运行脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { updateComponentPrefix, updateDirectory };
