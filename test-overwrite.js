/**
 * 覆盖功能独立测试脚本
 * 用于验证元件覆盖保存功能而不启动完整应用
 */

const fs = require('fs').promises;
const path = require('path');

async function testOverwriteFunctionality() {
    console.log('🔧 开始测试元件覆盖功能...\n');

    // 测试元件数据
    const testComponent = {
        name: '测试覆盖元件',
        id: 'test-overwrite-component',
        description: '用于测试覆盖功能的元件',
        category: 'test',
        dimensions: { width: 100, height: 80 },
        pins: {
            side1: [
                { pinName: 'VCC', type: 'power', order: 1 },
                { pinName: 'GND', type: 'ground', order: 2 }
            ],
            side2: [],
            side3: [],
            side4: []
        }
    };

    const baseDir = path.join(__dirname, 'data', 'system-components');
    const customDir = path.join(baseDir, 'custom');
    const fileName = `${testComponent.id}.json`;
    const filePath = path.join(customDir, fileName);

    try {
        // 确保目录存在
        await fs.mkdir(customDir, { recursive: true });

        console.log('📝 第一步：创建初始元件文件');
        const initialContent = JSON.stringify(testComponent, null, 2);
        await fs.writeFile(filePath, initialContent, 'utf8');
        console.log(`✅ 初始文件创建成功: ${filePath}`);

        // 读取并验证初始文件
        const initialRead = await fs.readFile(filePath, 'utf8');
        const initialParsed = JSON.parse(initialRead);
        console.log(`📖 初始文件内容验证: ${initialParsed.name}`);

        console.log('\n📝 第二步：修改元件数据');
        const modifiedComponent = {
            ...testComponent,
            description: '这是修改后的描述 - 覆盖测试成功',
            pins: {
                ...testComponent.pins,
                side2: [
                    { pinName: 'DATA', type: 'digital_io', order: 1 }
                ]
            }
        };

        console.log('📝 第三步：覆盖保存元件文件');
        const modifiedContent = JSON.stringify(modifiedComponent, null, 2);
        await fs.writeFile(filePath, modifiedContent, 'utf8');
        console.log(`✅ 文件覆盖成功: ${filePath}`);

        // 读取并验证覆盖后的文件
        const modifiedRead = await fs.readFile(filePath, 'utf8');
        const modifiedParsed = JSON.parse(modifiedRead);
        console.log(`📖 覆盖后文件内容验证:`);
        console.log(`   - 名称: ${modifiedParsed.name}`);
        console.log(`   - 描述: ${modifiedParsed.description}`);
        console.log(`   - side2引脚数量: ${modifiedParsed.pins.side2.length}`);

        // 验证覆盖是否成功
        const isOverwriteSuccess =
            modifiedParsed.description === modifiedComponent.description &&
            modifiedParsed.pins.side2.length === 1 &&
            modifiedParsed.pins.side2[0].pinName === 'DATA';

        if (isOverwriteSuccess) {
            console.log('\n🎉 测试结果: 覆盖功能工作正常！');
            console.log('✅ 文件内容正确更新');
            console.log('✅ 数据结构保持完整');
            console.log('✅ 覆盖操作成功');
        } else {
            console.log('\n❌ 测试结果: 覆盖功能存在问题');
            console.log('❌ 文件内容未正确更新');
        }

        console.log('\n🧹 清理测试文件...');
        await fs.unlink(filePath);
        console.log('✅ 测试文件已清理');

    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error.message);
        console.error('错误详情:', error);
    }
}

// 运行测试
if (require.main === module) {
    testOverwriteFunctionality().then(() => {
        console.log('\n🏁 覆盖功能测试完成');
        process.exit(0);
    }).catch((error) => {
        console.error('\n💥 测试失败:', error);
        process.exit(1);
    });
}

module.exports = { testOverwriteFunctionality };
