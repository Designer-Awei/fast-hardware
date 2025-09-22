const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');

async function fixIcons() {
  console.log('修复图标文件...');

  try {
    const sourceBuffer = fs.readFileSync('assets/Fast Hardware.png');

    // 生成不同尺寸的PNG用于ICO
    const sizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = [];

    for (const size of sizes) {
      const buffer = await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();
      pngBuffers.push(buffer);
    }

    // 使用to-ico生成真正的ICO文件
    const icoBuffer = await toIco(pngBuffers);
    fs.writeFileSync('assets/icon.ico', icoBuffer);

    console.log('✅ ICO图标已重新生成');

  } catch (error) {
    console.error('修复图标时出错:', error);
    process.exit(1);
  }
}

fixIcons();
