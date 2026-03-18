// scripts/generate-icons.js
const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '../frontend/public/icons/source.png');
const outDir = path.join(__dirname, '../frontend/public/icons');

const sizes = [72, 96, 128, 144, 152, 180, 192, 512];

async function main() {
  for (const size of sizes) {
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`));
    console.log(`✅ icon-${size}.png`);
  }

  // badge (72x72 작은 알림 아이콘)
  await sharp(src)
    .resize(72, 72, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(outDir, 'badge-72.png'));
  console.log('✅ badge-72.png');

  // favicon (32x32)
  await sharp(src)
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(__dirname, '../frontend/public/favicon.png'));
  console.log('✅ favicon.png');

  console.log('\n🎉 모든 아이콘 생성 완료!');
}

main().catch(console.error);
