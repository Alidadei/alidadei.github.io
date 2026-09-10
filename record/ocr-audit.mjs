// 一次性隐私审计:OCR 全量扫描 public/images 在库图片与 public/files 论文 PDF,
// 程序化搜索真名/学号/证件号/旧手机号等敏感串。运行:node record/ocr-audit.mjs
import { createWorker } from 'tesseract.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const KEYWORDS = [
  '余泓麟', '泓麟', '余泓',
  { re: /hong\s?lin/i, label: 'honglin(拼音)' },
  '13427917163',          // 旧手机号邮箱前缀
  '25111010029',          // 相辉奖状学号
  '21020006151',          // 成绩截图学号
  '440304200211286732',   // 蓝桥杯证件号
  { re: /\d{10,}/, label: '10位以上连续数字(学号/证件号类)' },
];

function textHits(text) {
  const flat = text.replace(/\s+/g, '');
  const hits = [];
  for (const kw of KEYWORDS) {
    if (typeof kw === 'string') {
      if (flat.includes(kw)) hits.push(kw);
    } else if (kw.re.test(text)) {
      const m = text.match(kw.re);
      hits.push(`${kw.label}:${m[0].slice(0, 24)}`);
    }
  }
  return hits;
}

const images = execSync('git -c core.quotepath=off ls-files public/images', { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean)
  .filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f));

const pdfs = execSync('git -c core.quotepath=off ls-files public/files', { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(f => f.endsWith('.pdf'));

console.log(`扫描 ${images.length} 张图片 + ${pdfs.length} 个 PDF ...`);

const worker = await createWorker(['chi_sim', 'eng']);
let problems = 0;

for (const img of images) {
  try {
    const { data } = await worker.recognize(fs.readFileSync(img));
    const hits = textHits(data.text || '');
    if (hits.length) {
      problems++;
      console.log(`⚠ ${img}\n   命中: ${hits.join('; ')}`);
    } else {
      console.log(`✓ ${img}`);
    }
  } catch (e) {
    console.log(`? ${img} OCR失败: ${e.message.slice(0, 80)}`);
  }
}

for (const pdf of pdfs) {
  try {
    const text = execSync(`pdftotext "${path.resolve(pdf)}" -`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const hits = textHits(text);
    if (hits.length) { problems++; console.log(`⚠ ${pdf}\n   命中: ${hits.join('; ')}`); }
    else console.log(`✓ ${pdf}`);
  } catch (e) {
    console.log(`? ${pdf} 文本提取失败`);
  }
}

await worker.terminate();
console.log(problems === 0 ? '\n结论:未发现任何敏感关键词残留。' : `\n结论:发现 ${problems} 个文件需要复查!`);
