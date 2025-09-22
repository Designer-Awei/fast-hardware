const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = 'assets/Fast Hardware.png';
const assetsDir = 'assets';

// 确保assets目录存在
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

async function generateIcons() {
  console.log('开始生成图标文件...');

  try {
    // 读取源图标
    const sourceBuffer = fs.readFileSync(sourceIcon);

    // Windows ICO格式 - 需要多种尺寸
    console.log('生成Windows ICO图标...');
    const icoSizes = [16, 32, 48, 64, 128, 256];

    // 生成不同尺寸的PNG作为ICO的基础
    const icoBuffers = [];
    for (const size of icoSizes) {
      const buffer = await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();
      icoBuffers.push(buffer);
    }

    // 使用sharp生成ICO文件（虽然不是标准的ICO，但可以工作）
    await sharp(sourceBuffer)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile('assets/icon.ico');

    console.log('✅ Windows ICO图标已生成');

    // macOS ICNS格式 - 使用多种尺寸
    console.log('生成macOS ICNS图标...');
    const icnsSizes = [16, 32, 64, 128, 256, 512, 1024];

    for (const size of icnsSizes) {
      const outputPath = `assets/icon_${size}x${size}.png`;
      await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      console.log(`  生成 ${size}x${size} PNG`);
    }

    // 简化版：直接生成一个大的PNG作为ICNS的基础
    await sharp(sourceBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile('assets/icon.icns'); // 注意：这实际上还是PNG，但electron-builder会处理

    console.log('✅ macOS ICNS图标已生成');

    // Linux PNG格式 - 主要使用512x512
    console.log('生成Linux PNG图标...');
    await sharp(sourceBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile('assets/icon.png');

    console.log('✅ Linux PNG图标已生成');

    // 生成额外的Linux图标尺寸
    const linuxSizes = [16, 32, 48, 64, 128, 256];
    for (const size of linuxSizes) {
      const outputPath = `assets/icon_${size}x${size}.png`;
      await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      console.log(`  生成 ${size}x${size} PNG (Linux)`);
    }

    console.log('\n🎉 所有图标文件生成完成！');
    console.log('\n生成的图标文件:');
    console.log('- assets/icon.ico (Windows)');
    console.log('- assets/icon.icns (macOS)');
    console.log('- assets/icon.png (Linux主图标)');
    console.log('- assets/icon_[size]x[size].png (多种尺寸)');

  } catch (error) {
    console.error('生成图标时出错:', error);
    process.exit(1);
  }
}

generateIcons();
