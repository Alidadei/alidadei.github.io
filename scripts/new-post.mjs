// 给已有的 Markdown 内容文件(无 frontmatter)补 frontmatter,落地成正式文章。
// 真实流程:先有内容 md → 跑本工具补 front → 再手动格式美化。
// 仿 scripts/cms.mjs:纯 ESM,@inquirer/prompts。
// 用法: npm run new-post [内容文件路径]
import fs from 'node:fs';
import path from 'node:path';
import { select, input, confirm, checkbox } from '@inquirer/prompts';

const ROOT = process.cwd();
const KNOW_JSON = path.join(ROOT, 'src/data/knowledge.json');
const POSTS_DIR = (lang) => path.join(ROOT, `src/content/posts/${lang}`);
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MATURITIES = ['基础', '当下热点', '未来展望'];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function loadKnowledge() {
  return JSON.parse(fs.readFileSync(KNOW_JSON, 'utf8'));
}
function knowledgeChoices(nodes, parentSlug = '', parentLabel = '') {
  const out = [];
  for (const n of nodes) {
    const slug = parentSlug ? `${parentSlug}/${n.slug}` : n.slug;
    const label = parentLabel ? `${parentLabel} / ${n.label.zh}` : n.label.zh;
    out.push({ name: label, value: slug });
    if (n.children?.length) out.push(...knowledgeChoices(n.children, slug, label));
  }
  return out;
}
function today() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  // 1. 源内容文件(无 frontmatter 的 md)
  const argSrc = process.argv[2];
  let src = argSrc ? path.resolve(ROOT, argSrc) : '';
  if (!src) {
    src = path.resolve(ROOT, (await input({ message: '内容文件路径(无 frontmatter 的 .md):' })).trim());
  }
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    console.error(`找不到文件:${rel(src)}`);
    process.exit(1);
  }
  let body = fs.readFileSync(src, 'utf8');
  if (/^---\s*\n/.test(body)) {
    console.error(`${rel(src)} 已有 frontmatter,无需再补。`);
    process.exit(1);
  }
  body = body.replace(/\s+$/, '\n'); // 规整结尾换行

  // 默认标题:首行 # 标题,否则文件名
  const firstH1 = body.match(/^#\s+(.+)$/m);
  const stem = path.basename(src, '.md');

  // 2. frontmatter 字段
  const title = (await input({ message: '标题:', default: firstH1 ? firstH1[1].trim() : stem })).trim();
  if (!title) { console.error('标题不能为空'); process.exit(1); }
  const date = (await input({ message: '日期 (YYYY-MM-DD):', default: today() })).trim();
  const lang = await select({
    message: '语言:',
    choices: [{ name: '中文 (zh)', value: 'zh' }, { name: 'English (en)', value: 'en' }],
  });
  const origin = await select({
    message: '产出方式 origin(= categories[0]):',
    choices: [{ name: '学习笔记 (note)', value: 'note' }, { name: '个人实践 (practice)', value: 'practice' }],
  });
  const kpaths = await checkbox({
    message: '知识节点 subject(空格多选):',
    choices: knowledgeChoices(loadKnowledge()),
    required: true,
  });
  const maturity = await select({ message: '时效 maturity:', choices: MATURITIES.map((m) => ({ name: m, value: m })) });

  // 3. 输出文件名(默认源文件名)
  let slug = (await input({ message: '输出文件名(不含 .md,英文 kebab):', default: SLUG_RE.test(stem) ? stem : '' })).trim();
  if (!SLUG_RE.test(slug)) {
    console.error(`文件名非法(需 ${SLUG_RE}):"${slug}"`);
    process.exit(1);
  }
  const dest = path.join(POSTS_DIR(lang), `${slug}.md`);
  const inPlace = path.resolve(dest) === path.resolve(src);
  if (!inPlace && fs.existsSync(dest)) {
    console.error(`目标已存在:${rel(dest)}`);
    process.exit(1);
  }

  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    `lang: ${lang}`,
    `categories: ['${origin}']`,
    `knowledge: [${kpaths.map((p) => `'${p}'`).join(', ')}]`,
    `maturity: ${maturity}`,
    '---',
    '',
    '',
  ].join('\n');

  if (!(await confirm({ message: inPlace ? `原地补 frontmatter 到 ${rel(dest)} ?` : `写入 ${rel(dest)} ?`, default: true }))) {
    console.log('已取消');
    return;
  }
  fs.mkdirSync(POSTS_DIR(lang), { recursive: true });
  fs.writeFileSync(dest, fm + body);
  console.log(`✓ ${inPlace ? '已补 frontmatter' : '已生成'}:${rel(dest)}`);
  if (firstH1) {
    console.log('提示:正文首行是 # 标题,美化时记得改成 ##(页面 H1 来自 frontmatter title,正文从 H2 起)。');
  }
  if (!inPlace && path.resolve(src) !== path.resolve(dest)) {
    console.log(`(源文件保留:${rel(src)})`);
  }
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
