#!/usr/bin/env node
// 批量压缩 public/images/ 下的图。
//   默认:     只处理 public/images/posts/,原地压缩(不换格式,不动引用)。
//   --all:    处理整个 public/images/(递归,跳过 thumbs/ 构建产物),原地压缩。
//   --webp:   转 webp + 删原图 + 改 src/content/posts/**/*.md 引用(仅限 posts,因引用都在 md)。
//   <文件名>: 只处理指定图(相对扫描根)。
// 注意:--all 和 --webp 不可同时用(images 里非 posts 图引用散在 friends.json/site.ts/about 等,自动改不全)。
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const WEBP = argv.includes('--webp');
const files = argv.filter(a => !a.startsWith('--'));
const ROOT = ALL ? 'public/images' : 'public/images/posts';
const POSTS_DIR = 'src/content/posts';
const MAX_WIDTH = 1280;
const THRESHOLD = WEBP ? 30 * 1024 : 50 * 1024;

if (ALL && WEBP) {
  console.error('✗ --all 和 --webp 不能一起用:images 里非 posts 图引用散在 friends.json/site.ts/about 等,自动改不全。');
  console.error('  posts 图用 --webp(引用都在 md);其余图用 --all 原地压缩(不改格式,引用不变)。');
  process.exit(1);
}

// 递归找图,跳过 thumbs/(构建产物)
function findImgs(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'thumbs') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(findImgs(p));
    else if (/\.(png|jpe?g)$/i.test(e.name)) out.push(p);   // 只收 png/jpg;.webp 已是优化格式,跳过
  }
  return out;
}

let targets;
if (files.length > 0) {
  targets = files.map(f => path.join(ROOT, f));
} else {
  targets = findImgs(ROOT).filter(f => fs.statSync(f).size > THRESHOLD);
}

if (targets.length === 0) {
  console.log(`没有需要处理的图(${ROOT} 下没有 > ${THRESHOLD / 1024}KB 的图)。`);
  process.exit(0);
}

const scope = ALL ? '整个 public/images' : 'public/images/posts';
console.log(`${WEBP ? '转 webp' : '原地压缩'} ${targets.length} 张图(${scope}, max width ${MAX_WIDTH}px):`);

// 递归找博客 .md(--webp 改引用用)
function findMd(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(findMd(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
function updateMdRefs(oldName, newName) {
  const relativeOld = '../../../../public/images/posts/' + oldName;
  const relativeNew = '../../../../public/images/posts/' + newName;
  const re = new RegExp('/images/[^\\s)"\\]]*?' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  let changed = 0;
  for (const md of findMd(POSTS_DIR)) {
    let c = fs.readFileSync(md, 'utf8');
    const next = c.replace(relativeOld, relativeNew).replace(re, m => m.replace(oldName, newName));
    if (next !== c) {
      c = next;
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
    console.log(`  ${f}: ${(before / 1024).toFixed(0)}KB → 无收益,保留原图`);
    continue;
  }

  if (WEBP) {
    const out = f.replace(/\.(png|jpe?g|webp)$/i, '.webp');
    const tmp = out + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
    if (out !== f && fs.existsSync(f)) fs.unlinkSync(f);
    const refs = updateMdRefs(path.basename(f), path.basename(out));
    console.log(`  ${path.basename(f)} (${(before / 1024).toFixed(0)}KB) → ${path.basename(out)} (${(buf.length / 1024).toFixed(0)}KB),改 ${refs} 处引用`);
    converted++;
  } else {
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, f);
    console.log(`  ${f}: ${(before / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB`);
  }
  saved += before - buf.length;
}
console.log(`共省 ${Math.round(saved / 1024)}KB${WEBP ? `,转 webp ${converted} 张` : ''}`);
