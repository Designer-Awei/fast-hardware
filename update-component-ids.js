/**
 * 批量更新元件ID为结构化格式
 * 格式: [prefix]-[component-name]-[timestamp]
 */

const fs = require('fs').promises;
const path = require('path');

const COMPONENT_DIRS = {
  standard: path.join(__dirname, 'data', 'system-components', 'standard'),
  custom: path.join(__dirname, 'data', 'system-components', 'custom')
};

/**
 * 生成结构化元件ID
 */
function generateStructuredComponentId(componentName, prefix) {
  let baseName = '';

  if (componentName && componentName.trim()) {
    // 如果有名称，使用名称生成基础ID
    baseName = componentName
      .trim()
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '') // 移除特殊字符（支持中文）
      .replace(/[\u4e00-\u9fa5]/g, (match) => {
        // 将中文字符转换为拼音首字母（简化版）
        const pinyinMap = {
          '传感器': 'sensor', '模块': 'module', '控制器': 'ctrl',
          '驱动': 'driver', '接口': 'interface', '转换器': 'converter',
          '放大器': 'amp', '开关': 'switch', '显示器': 'display',
          '电机': 'motor', '舵机': 'servo', '灯': 'led'
        };
        return pinyinMap[match] || match.charAt(0);
      })
      .replace(/\s+/g, '-') // 替换空格为-
      .replace(/-+/g, '-') // 合并多个-
      .replace(/^-|-$/g, '') // 移除开头和结尾的-
      .substring(0, 15); // 限制长度
  } else {
    // 如果没有名称，使用默认名称
    baseName = 'component';
  }

  // 生成时间戳（使用固定的时间戳以避免重复）
  const timeString = '120000'; // 固定时间戳 12:00:00

  // 生成最终的ID
  const finalId = `${prefix}-${baseName}-${timeString}`;
  return finalId;
}

/**
 * 更新单个元件文件
 */
async function updateComponentFile(filePath, prefix) {
  try {
    // 读取文件
    const content = await fs.readFile(filePath, 'utf8');
    const component = JSON.parse(content);

    // 获取原ID和新ID
    const oldId = component.id;
    const newId = generateStructuredComponentId(component.name, prefix);

    if (oldId === newId) {
      console.log(`✅ ${path.basename(filePath)} - ID无需更新: ${oldId}`);
      return false;
    }

    // 更新ID
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
async function updateDirectory(directory, prefix) {
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
      const updated = await updateComponentFile(filePath, prefix);
      if (updated) updatedCount++;
    }

    console.log(`✅ ${prefix} 库更新完成: ${updatedCount}/${jsonFiles.length} 个文件已更新`);
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
  console.log('🚀 开始批量更新元件ID格式...\n');

  let totalUpdated = 0;

  // 更新标准库
  const standardUpdated = await updateDirectory(COMPONENT_DIRS.standard, 'standard');
  totalUpdated += standardUpdated;

  // 更新自定义库
  const customUpdated = await updateDirectory(COMPONENT_DIRS.custom, 'custom');
  totalUpdated += customUpdated;

  console.log(`\n🎉 ID更新完成！共更新了 ${totalUpdated} 个元件文件`);
  console.log('\n📋 新的ID格式: [prefix]-[component-name]-[timestamp]');
  console.log('   - prefix: standard 或 custom');
  console.log('   - component-name: 处理后的元件名称');
  console.log('   - timestamp: HHMMSS格式时间戳');
}

// 运行脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { generateStructuredComponentId, updateComponentFile, updateDirectory };
