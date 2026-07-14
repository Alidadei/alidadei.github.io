#!/usr/bin/env node
// 替换网站 favicon
// 用法: npm run favicon -- <源图路径> [尺寸]
//   源图: 任意 PNG/JPG/WebP/SVG,建议正方形;非正方形会居中裁剪成方形
//   尺寸: 输出边长(像素),默认 180
// 作用: ① 用 sharp 生成规范 public/favicon.png(压缩) ② 自动递增 BaseLayout 里 ?v=N 破缓存
// 之后: 自己 git add + commit + push(脚本不动 git,留给你 review)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const arg = process.argv[2];
const size = parseInt(process.argv[3] || '180', 10);

if (!arg) {
  console.log('替换网站 favicon');
  console.log('用法: npm run favicon -- <源图路径> [尺寸]');
  console.log('例:   npm run favicon -- public/images/my_profile.png');
  console.log('      npm run favicon -- ~/Downloads/logo.png 256');
  console.log('尺寸默认 180,非正方形图会居中裁剪。脚本只生成文件 + 改版本号,不碰 git。');
  process.exit(0);
}

// ~ 展开为 home 目录
const home = process.env.HOME || process.env.USERPROFILE || '~';
const src = path.resolve(arg.replace(/^~(?=[\\/]|$)/, home));
if (!fs.existsSync(src)) {
  console.error(`✗ 找不到源图: ${src}`);
  process.exit(1);
}

const OUT = 'public/favicon.png';
const LAYOUT = 'src/layouts/BaseLayout.astro';

try {
  // 1. 生成 favicon.png(居中裁剪成正方形 + 缩放 + 压缩)
  await sharp(src)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toFile(OUT);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);

  // 2. 递增 BaseLayout 里 favicon.png?v=N
  let content = fs.readFileSync(LAYOUT, 'utf8');
  const re = /favicon\.png\?v=(\d+)/;
  let ver;
  if (re.test(content)) {
    ver = parseInt(content.match(re)[1], 10) + 1;
    content = content.replace(re, `favicon.png?v=${ver}`);
  } else if (content.includes('favicon.png')) {
    // 有 favicon.png 但没版本号,补上 ?v=1
    ver = 1;
    content = content.replace(/favicon\.png(?!\?v)/, 'favicon.png?v=1');
  } else {
    console.error(`✗ ${LAYOUT} 里找不到 favicon.png 引用,请检查`);
    process.exit(1);
  }
  fs.writeFileSync(LAYOUT, content);

  console.log(`✓ 生成 ${OUT}  (${size}×${size}, ${kb} KB)`);
  console.log(`✓ ${LAYOUT}  版本号 → ?v=${ver}`);
  console.log('');
  console.log('下一步:');
  console.log('  git add public/favicon.png src/layouts/BaseLayout.astro');
  console.log('  git commit -m "chore: 更新 favicon"');
  console.log('  git push');
} catch (e) {
  console.error('✗ 失败:', e.message);
  process.exit(1);
}
