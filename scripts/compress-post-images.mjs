#!/usr/bin/env node
// 压缩博客正文图(public/images/posts/)。
//   默认:    原地压缩(resize max 1280 + jpg/png/webp 各自格式优化),不换格式。
//   --webp:  把图转成 webp(删原图)+ 自动改 src/content/posts/**/*.md 里的引用(.png/.jpg → .webp)。
// 用法:
//   npm run compress-posts                  # 原地压缩 posts/ 下 >50KB 的图
//   npm run compress-posts -- a.png b.jpg   # 原地压缩指定图
//   npm run compress-posts -- --webp        # 转 webp(>30KB 的)+ 改引用
//   npm run compress-posts -- --webp a.png  # 指定图转 webp
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DIR = 'public/images/posts';
const POSTS_DIR = 'src/content/posts';
const MAX_WIDTH = 1280;

const argv = process.argv.slice(2);
const WEBP = argv.includes('--webp');
const files = argv.filter(a => !a.startsWith('--'));
const THRESHOLD = WEBP ? 30 * 1024 : 50 * 1024;

let targets;
if (files.length > 0) {
  targets = files.map(f => path.join(DIR, f));
} else {
  targets = fs.readdirSync(DIR)
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
    .map(f => path.join(DIR, f))
    .filter(f => fs.statSync(f).size > THRESHOLD);
}

if (targets.length === 0) {
  console.log(`没有需要处理的图(posts/ 下没有 > ${THRESHOLD / 1024}KB 的图)。`);
  process.exit(0);
}

console.log(`${WEBP ? '转 webp' : '原地压缩'} ${targets.length} 张图(max width ${MAX_WIDTH}px):`);

// 递归找所有博客 .md
function findMd(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(findMd(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// 把 .md 里 /images/posts/oldName → /images/posts/newName,返回改了几处
function updateMdRefs(oldName, newName) {
  const re = new RegExp('/images/posts/' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  let changed = 0;
  for (const md of findMd(POSTS_DIR)) {
    let c = fs.readFileSync(md, 'utf8');
    if (re.test(c)) {
      c = c.replace(re, '/images/posts/' + newName);
      fs.writeFileSync(md, c);
      changed++;
    }
  }
  return changed;
}

let saved = 0, converted = 0;
for (const f of targets) {
  if (!fs.existsSync(f)) { console.log(`  ✗ 找不到 ${f}`); continue; }
  const before = fs.statSync(f).size;
  const base = sharp(f).resize({ width: MAX_WIDTH, height: MAX_WIDTH, fit: 'inside', withoutEnlargement: true });
  let buf;
  if (WEBP) {
    buf = await base.webp({ quality: 82 }).toBuffer();
  } else {
    const ext = path.extname(f).toLowerCase();
    let img = base;
    if (ext === '.jpg' || ext === '.jpeg') img = img.jpeg({ quality: 82, progressive: true });
    else if (ext === '.png') img = img.png({ compressionLevel: 9 });
    else if (ext === '.webp') img = img.webp({ quality: 80 });
    buf = await img.toBuffer();
  }

  if (buf.length >= before) {
    console.log(`  ${path.basename(f)}: ${(before / 1024).toFixed(0)}KB → 无收益,保留原图`);
    continue;
  }

  if (WEBP) {
    const out = f.replace(/\.(png|jpe?g|webp)$/i, '.webp');
    const tmp = out + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
    if (out !== f && fs.existsSync(f)) fs.unlinkSync(f);   // 删原图
    const refs = updateMdRefs(path.basename(f), path.basename(out));
    console.log(`  ${path.basename(f)} (${(before / 1024).toFixed(0)}KB) → ${path.basename(out)} (${(buf.length / 1024).toFixed(0)}KB),改 ${refs} 处引用`);
    converted++;
  } else {
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, f);
    console.log(`  ${path.basename(f)}: ${(before / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB`);
  }
  saved += before - buf.length;
}
console.log(`共省 ${Math.round(saved / 1024)}KB${WEBP ? `,转 webp ${converted} 张` : ''}`);
