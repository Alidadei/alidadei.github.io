#!/usr/bin/env node
// 替换网站 favicon
// 用法: npm run favicon -- <源图路径> [尺寸]
//   源图: PNG/JPG/WebP/SVG/GIF/TIFF/AVIF,也支持 ICO(自动提取内嵌最大那张 PNG)
//   尺寸: 输出边长(像素),默认 180
// 作用: ① 生成规范 public/favicon.png(居中裁剪 + 压缩) ② 自动递增 BaseLayout 里 ?v=N 破缓存
//   ICO 源图在内存中提取内嵌 PNG,不落地临时文件,从源头没有中间产物要清理
// 之后: 自己 git add + commit + push(脚本不动 git,留给你 review)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const arg = process.argv[2];
const size = parseInt(process.argv[3] || '180', 10);

if (!arg) {
  console.log('替换网站 favicon');
  console.log('用法: npm run favicon -- <源图路径> [尺寸]');
  console.log('源图: PNG/JPG/WebP/SVG/GIF/TIFF/AVIF/ICO,非正方形会居中裁剪成方形');
  console.log('尺寸: 默认 180,一般不用传');
  console.log('例:   npm run favicon -- public/images/my_profile.png');
  console.log('      npm run favicon -- ~/Downloads/icon.ico 256');
  console.log('脚本只生成文件 + 改版本号,不碰 git。');
  process.exit(0);
}

// ~ 展开为 home 目录
const home = process.env.HOME || process.env.USERPROFILE || '~';
const src = path.resolve(arg.replace(/^~(?=[\\/]|$)/, home));
if (!fs.existsSync(src)) {
  console.error(`✗ 找不到源图: ${src}`);
  process.exit(1);
}

// 从 ICO 文件的内存 buffer 中提取尺寸最大的内嵌 PNG(不写临时文件,无需清理)
function extractPngFromIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error('不是有效的 ICO 文件(缺少 ICO 文件头 00 00 01 00)');
  }
  const count = buf.readUInt16LE(4);
  const pngs = [];
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    if (base + 16 > buf.length) break;
    const w = buf[base] || 256;      // ICO 用 0 表示 256
    const h = buf[base + 1] || 256;
    const dataSize = buf.readUInt32LE(base + 8);
    const dataOffset = buf.readUInt32LE(base + 12);
    const data = buf.subarray(dataOffset, dataOffset + dataSize);
    // PNG 签名: 89 50 4E 47 0D 0A 1A 0A
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
      pngs.push({ w, h, data });
    }
  }
  if (pngs.length === 0) {
    throw new Error('ICO 里没找到内嵌 PNG(可能是老式 BMP 图标)。请先用其他工具把这张 ICO 转成 PNG 再传入。');
  }
  pngs.sort((a, b) => (b.w * b.h) - (a.w * a.h));  // 取最大那张
  return pngs[0].data;
}

const OUT = 'public/favicon.png';
const LAYOUT = 'src/layouts/BaseLayout.astro';

try {
  // 1. 准备 sharp 输入:ICO 先在内存提取内嵌 PNG(Buffer),其他格式直接用文件路径
  let input;
  if (src.toLowerCase().endsWith('.ico')) {
    const icoBuf = fs.readFileSync(src);
    input = extractPngFromIco(icoBuf);
    console.log(`✓ 从 ICO 提取内嵌 PNG (${input.length} 字节,内存处理无临时文件)`);
  } else {
    input = src;
  }

  // 2. 生成 favicon.png(居中裁剪成正方形 + 缩放 + 压缩)
  await sharp(input)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toFile(OUT);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);

  // 3. 递增 BaseLayout 里 favicon.png?v=N
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
