// 生成 portfolio 项目缩略图:扫描 src/content/portfolio/*.md 的 image 字段,
// 用 sharp 压成 webp(宽 ≤ 480,质量 78)输出到 public/images/thumbs/。
// 增量:缩略图已存在且源图 mtime 未变则跳过。源图不动。
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PORTFOLIO_DIR = path.join(ROOT, 'src/content/portfolio');
const THUMBS_DIR = path.join(ROOT, 'public/images/thumbs');
const MAX_WIDTH = 480;
const QUALITY = 78;

// 从 md frontmatter 提取 image 字段(/images/xxx.png 形式)
function extractImage(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const fmMatch = text.match(/^---[\s\S]*?^---/m);
  if (!fmMatch) return null;
  const img = fmMatch[0].match(/^image:\s*["']?(.+?)["']?\s*$/m);
  return img ? img[1].trim() : null;
}

async function ensureThumb(publicSrc) {
  const srcAbs = path.join(ROOT, 'public', publicSrc);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`[skip] 源图不存在: ${publicSrc}`);
    return null;
  }
  const base = path.basename(publicSrc, path.extname(publicSrc));
  const outAbs = path.join(THUMBS_DIR, `${base}.webp`);
  // 增量:输出存在且源 mtime ≤ 输出 mtime 则跳过
  if (fs.existsSync(outAbs)) {
    if (fs.statSync(srcAbs).mtimeMs <= fs.statSync(outAbs).mtimeMs) {
      console.log(`[ok] 已是最新: thumbs/${base}.webp`);
      return outAbs;
    }
  }
  await sharp(srcAbs)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outAbs);
  console.log(`[gen] 生成: thumbs/${base}.webp`);
  return outAbs;
}

async function main() {
  if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
  const files = fs.readdirSync(PORTFOLIO_DIR).filter(f => f.endsWith('.md'));
  let count = 0;
  for (const f of files) {
    const image = extractImage(path.join(PORTFOLIO_DIR, f));
    if (!image) { console.log(`[skip] ${f} 无 image 字段`); continue; }
    await ensureThumb(image);
    count++;
  }
  console.log(`\n完成,处理 ${count} 个项目图。`);
}

main().catch(e => { console.error(e); process.exit(1); });
