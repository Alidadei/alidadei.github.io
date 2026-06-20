// 新建博客文章脚手架。交互式填 origin/knowledge/maturity,生成 frontmatter。
// 仿 scripts/cms.mjs:纯 ESM,@inquirer/prompts。
// 用法: npm run new-post
import fs from 'node:fs';
import path from 'node:path';
import { select, input, confirm, checkbox } from '@inquirer/prompts';

const ROOT = process.cwd();
const KNOW_JSON = path.join(ROOT, 'src/data/knowledge.json');
const POSTS_ZH = path.join(ROOT, 'src/content/posts/zh');
const POSTS_EN = path.join(ROOT, 'src/content/posts/en');
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MATURITIES = ['基础', '当下热点', '未来展望'];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function loadKnowledge() {
  return JSON.parse(fs.readFileSync(KNOW_JSON, 'utf8'));
}

// 主题树 → 可选项(显示「领域 / 子 / 主题」,存 slug 路径)
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
  const choices = knowledgeChoices(loadKnowledge());

  const title = (await input({ message: '标题:' })).trim();
  if (!title) { console.error('标题不能为空'); process.exit(1); }

  const lang = await select({
    message: '语言:',
    choices: [{ name: '中文 (zh)', value: 'zh' }, { name: 'English (en)', value: 'en' }],
  });

  const origin = await select({
    message: '产出方式 origin(= categories[0] / 时间线分类):',
    choices: [{ name: '学习笔记 (note)', value: 'note' }, { name: '个人实践 (practice)', value: 'practice' }],
  });

  const kpaths = await checkbox({
    message: '知识节点 subject(空格多选,可交叉归档):',
    choices,
    required: true,
  });

  const maturity = await select({
    message: '时效 maturity:',
    choices: MATURITIES.map((m) => ({ name: m, value: m })),
  });

  let filename = (await input({ message: '文件名(不含 .md,英文 kebab-case):' })).trim();
  if (!SLUG_RE.test(filename)) {
    console.error(`文件名非法(需 ${SLUG_RE}):"${filename}"`);
    process.exit(1);
  }

  const dir = lang === 'zh' ? POSTS_ZH : POSTS_EN;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${filename}.md`);
  if (fs.existsSync(file)) { console.error(`已存在:${rel(file)}`); process.exit(1); }

  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${today()}`,
    `lang: ${lang}`,
    `categories: ['${origin}']`,
    `knowledge: [${kpaths.map((p) => `'${p}'`).join(', ')}]`,
    `maturity: ${maturity}`,
    '---',
    '',
    '## ',
    '',
  ].join('\n');

  if (!(await confirm({ message: `写入 ${rel(file)} ?`, default: true }))) {
    console.log('已取消');
    return;
  }
  fs.writeFileSync(file, fm);
  console.log(`✓ 已创建:${rel(file)}`);
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
