#!/usr/bin/env node
// 替换关于页头像
// 用法: npm run avatar -- <源图>
//   源图: 任意格式。透明 PNG(图标) → 输出透明 PNG 融入背景;不透明照片 → 输出 jpg(高效小)
// 作用: ① sharp 生成 public/images/violin.* ② 自动更新 about.astro 两处(PC+移动端)的头像 src
// 之后: 自己 git add + commit + push(脚本不碰 git)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const arg = process.argv[2];

if (!arg) {
  console.log('替换关于页头像');
  console.log('用法: npm run avatar -- <源图>');
  console.log('透明源图(PNG图标) → 输出透明 PNG 融入背景;不透明照片 → 输出 jpg(体积小)');
  console.log('例:   npm run avatar -- ~/Downloads/photo.jpg');
  console.log('脚本自动判断透明度、选格式、更新 about.astro 两处 src,不碰 git。');
  process.exit(0);
}

// ~ 展开为 home 目录
const home = process.env.HOME || process.env.USERPROFILE || '~';
const src = path.resolve(arg.replace(/^~(?=[\\/]|$)/, home));
if (!fs.existsSync(src)) {
  console.error(`✗ 找不到源图: ${src}`);
  process.exit(1);
}

const OUT_DIR = 'public/images';
const ABOUT = 'src/pages/[lang]/about.astro';
const SIZE = 256;

function updateAboutSrc(newSrc) {
  let content = fs.readFileSync(ABOUT, 'utf8');
  content = content.replace(/\/images\/violin\.(png|jpg)/g, newSrc);
  fs.writeFileSync(ABOUT, content);
}

try {
  const meta = await sharp(src).metadata();
  const transparent = meta.hasAlpha;
  const png = `${OUT_DIR}/violin.png`;
  const jpg = `${OUT_DIR}/violin.jpg`;

  if (transparent) {
    // 透明图标:contain 保留完整图,输出 PNG 融入背景
    await sharp(src)
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(png);
    if (fs.existsSync(jpg)) fs.unlinkSync(jpg);   // 清掉旧 jpg,避免两份并存
    updateAboutSrc('/images/violin.png');
    console.log(`✓ 透明源图 → ${png} (contain 保留,融入背景), ${(fs.statSync(png).size / 1024).toFixed(1)} KB`);
  } else {
    // 不透明照片:cover 居中裁正方形,输出 jpg(照片高效,体积小)
    await sharp(src)
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toFile(jpg);
    if (fs.existsSync(png)) fs.unlinkSync(png);   // 清掉旧 png,避免两份并存
    updateAboutSrc('/images/violin.jpg');
    console.log(`✓ 照片源图 → ${jpg} (cover 裁剪,jpg 高效), ${(fs.statSync(jpg).size / 1024).toFixed(1)} KB`);
  }
  console.log(`✓ ${ABOUT}  两处头像 src 已更新`);
  console.log('');
  console.log('下一步: git add public/images/ src/pages/ && git commit -m "chore: 更换头像" && git push');
} catch (e) {
  console.error('✗ 失败:', e.message);
  process.exit(1);
}
