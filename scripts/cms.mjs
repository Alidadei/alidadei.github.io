// 博客分类/标签 CLI 维护工具。
// 仿 scripts/gen-portfolio-thumbs.mjs:纯 ESM,node:fs/path,process.cwd()。
// 直接读写本地仓库文件(不碰远程 Worker)。行级改写 frontmatter,不重序列化。
//
// 用法: npm run cms
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { select, input, confirm, checkbox } from '@inquirer/prompts';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'src/content/posts/zh');
const CATS_JSON = path.join(ROOT, 'src/data/categories.json');
const REDIRECTS_JSON = path.join(ROOT, 'src/data/redirects.json');
const FRIENDS_JSON = path.join(ROOT, 'src/data/friends.json');
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const LANGS = ['zh', 'en'];

// 显示用相对路径(正斜杠)
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
// 深拷贝纯数据
const deepClone = (x) => JSON.parse(JSON.stringify(x));

// ---------- 数据加载(每次读磁盘,保证多步操作基于最新状态) ----------
function loadCategories() { return JSON.parse(fs.readFileSync(CATS_JSON, 'utf8')); }
function loadRedirects() { return JSON.parse(fs.readFileSync(REDIRECTS_JSON, 'utf8')); }
function loadFriends() { return JSON.parse(fs.readFileSync(FRIENDS_JSON, 'utf8')); }
function writeCategoriesJson(tree) { fs.writeFileSync(CATS_JSON, JSON.stringify(tree, null, 2) + '\n'); }
function writeRedirectsJson(obj) { fs.writeFileSync(REDIRECTS_JSON, JSON.stringify(obj, null, 2) + '\n'); }
function writeFriendsJson(arr) { fs.writeFileSync(FRIENDS_JSON, JSON.stringify(arr, null, 2) + '\n'); }

// ---------- 分类树纯函数(复刻 src/data/categories.ts,不 import) ----------
// 所有根→叶(含中间节点)路径
function flattenPaths(nodes, acc = [], out = []) {
  for (const n of nodes) { const p = [...acc, n.slug]; out.push(p); flattenPaths(n.children, p, out); }
  return out;
}
// 全树所有 slug 的 Set
function allSlugs(nodes, set = new Set()) {
  for (const n of nodes) { set.add(n.slug); allSlugs(n.children, set); }
  return set;
}
// 按路径找节点
function findNodeByPath(tree, segs) {
  let nodes = tree, cur;
  for (const s of segs) { cur = nodes.find(n => n.slug === s); if (!cur) return null; nodes = cur.children; }
  return cur ?? null;
}
// 从树中删除指定路径的节点(就地改 tree)
function removeNodeByPath(tree, segs) {
  const parentSegs = segs.slice(0, -1);
  const container = parentSegs.length ? (findNodeByPath(tree, parentSegs)?.children) : tree;
  if (container) {
    const i = container.findIndex(n => n.slug === segs[segs.length - 1]);
    if (i >= 0) container.splice(i, 1);
  }
}
// 文章是否属于某分类路径(前缀精确匹配,复刻 categories.ts:84-91)
function postInCategory(cats, categoryPath) {
  if (categoryPath.length === 0) return true;
  if (cats.length < categoryPath.length) return false;
  return categoryPath.every((seg, i) => cats[i] === seg);
}
// 路径转中文名显示(如 "学习笔记 / AI / Transformer")
function pathLabel(tree, segs) {
  let nodes = tree;
  const labels = [];
  for (const s of segs) {
    const node = nodes.find(n => n.slug === s);
    if (!node) { labels.push(s); break; }
    labels.push(node.label?.zh ?? s);
    nodes = node.children;
  }
  return labels.join(' / ');
}
// 截断:给定文章 categories 和「被删路径集合」,返回删后 categories(不受影响返回 null)
function truncateForDeletedPaths(cats, deletedPathsSet) {
  let cutAt = cats.length;
  let touched = false;
  for (let i = 0; i < cats.length; i++) {
    if (deletedPathsSet.has(cats.slice(0, i + 1).join('/'))) { cutAt = Math.min(cutAt, i); touched = true; }
  }
  return touched ? cats.slice(0, cutAt) : null;
}
// 列表里的「返回」选项(value 为 null,选中即退出当前操作回到上级菜单)
const BACK = { name: '← 返回', value: null };

// ---------- 文章扫描(只读) ----------
function scanPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const abs = path.join(POSTS_DIR, f);
    const raw = fs.readFileSync(abs, 'utf8');
    const fmMatch = raw.match(/^---[\s\S]*?^---/m);
    const fm = fmMatch ? fmMatch[0] : '';
    return { file: abs, name: f, raw, categories: parseCategories(fm), tags: parseTags(fm) };
  });
}
// categories:单行内联数组 ['a', 'b']
function parseCategories(fm) {
  const m = fm.match(/^categories:\s*\[(.*)\]\s*$/m);
  if (!m) return [];
  return m[1].split(/,\s*/).map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}
// tags:YAML 多行块(tags: 换行后  - item)
function parseTags(fm) {
  const lines = fm.split('\n');
  const idx = lines.findIndex(l => /^tags:\s*$/.test(l));
  if (idx < 0) return [];
  const tags = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s{2}-\s+(.+?)\s*$/);
    if (!m) break;
    tags.push(m[1]);
  }
  return tags;
}

// ---------- frontmatter 改写(行级,绝不重序列化) ----------
// 重写 categories 整行
function rewriteCategoriesLine(text, newCats) {
  const line = `categories: [${newCats.map(s => `'${s}'`).join(', ')}]`;
  return text.replace(/^categories:\s*\[.*\]\s*$/m, line);
}
// 遍历 tags 块,fn(tag) => 新tag字符串 | null(删除该行)
function mapTagsBlock(text, fn) {
  const lines = text.split('\n');
  const idx = lines.findIndex(l => /^tags:\s*$/.test(l));
  if (idx < 0) return text;
  const out = lines.slice(0, idx + 1); // 含 tags: 行
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s{2}-\s+)(.+?)\s*$/);
    if (!m) { out.push(...lines.slice(i)); break; } // 块结束,后续原样
    const res = fn(m[2]);
    if (res !== null) out.push(`${m[1]}${res}`);
  }
  return out.join('\n');
}

// ---------- git 状态 ----------
function gitIsClean() {
  try { return execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim() === ''; }
  catch { return true; }
}

// ============ 分类功能 ============
async function listCategories() {
  const tree = loadCategories();
  const posts = scanPosts();
  const print = (nodes, depth, prefix) => {
    for (const n of nodes) {
      const p = [...prefix, n.slug];
      const cnt = posts.filter(post => postInCategory(post.categories, p)).length;
      console.log(`${'  '.repeat(depth)}${n.label.zh}  (${n.slug}) [${cnt}篇]`);
      print(n.children, depth + 1, p);
    }
  };
  console.log('\n分类树:');
  print(tree, 0, []);
}

async function addCategory() {
  const tree = loadCategories();
  const slug = await input({
    message: 'slug(小写字母/数字/连字符):',
    validate: v => SLUG_RE.test(v) || '格式不符:小写字母/数字/连字符,开头须为字母或数字',
  });
  if (allSlugs(tree).has(slug)) { console.log(`✗ slug "${slug}" 已存在(全树唯一)`); return; }
  const labelZh = await input({ message: '中文名:' , validate: v => v.trim() ? true : '不能为空' });
  const labelEn = await input({ message: '英文名:' , validate: v => v.trim() ? true : '不能为空' });
  const descZh = await input({ message: '中文描述(可空):' }) || '';
  const descEn = await input({ message: '英文描述(可空):' }) || '';
  const paths = flattenPaths(tree);
  const parent = await select({
    message: '父分类:',
    choices: [BACK, { name: '(根)', value: [] }, ...paths.map(p => ({ name: pathLabel(tree, p), value: p }))],
  });
  if (!parent) return;
  const newTree = deepClone(tree);
  const node = { slug, label: { zh: labelZh, en: labelEn }, description: { zh: descZh, en: descEn }, aliases: [], children: [] };
  const target = parent.length ? findNodeByPath(newTree, parent)?.children : newTree;
  if (!target) { console.log('✗ 父分类未找到'); return; }
  target.push(node);
  console.log(`\n将新增: ${parent.length ? parent.join('/') + '/' : ''}${slug}  (${labelZh} / ${labelEn})`);
  if (await confirm({ message: '写入 categories.json?' })) {
    writeCategoriesJson(newTree);
    console.log(`✓ 完成。建议: git add -A && git commit -m "cms: add category ${slug}"`);
  } else console.log('已取消。');
}

async function renameCategorySlug() {
  const tree = loadCategories();
  const paths = flattenPaths(tree);
  if (!paths.length) { console.log('无分类。'); return; }
  const chosen = await select({ message: '选择要改 slug 的分类:', choices: [BACK, ...paths.map(p => ({ name: pathLabel(tree, p), value: p }))] });
  if (!chosen) return;
  const oldSlug = chosen[chosen.length - 1];
  const node = findNodeByPath(tree, chosen);
  const newSlug = await input({
    message: `新 slug(当前 ${oldSlug}):`,
    default: oldSlug,
    validate: v => {
      if (!SLUG_RE.test(v)) return '格式不符';
      if (v === oldSlug) return '不能与旧 slug 相同';
      const s = allSlugs(tree); s.delete(oldSlug);
      if (s.has(v)) return 'slug 已存在(全树唯一)';
      return true;
    },
  });

  // 受影响路径:该节点及其所有后代(后代路径也含 oldSlug)
  const affected = [chosen];
  flattenPaths(node.children, chosen, affected);

  // 生成重定向(旧 URL → 新 URL,中英各一遍)
  const newRedirects = { ...loadRedirects() };
  let redirectAdded = 0;
  const sampleUrls = [];
  for (const p of affected) {
    const newP = p.map(s => s === oldSlug ? newSlug : s);
    for (const lang of LANGS) {
      const oldUrl = `/${lang}/blog/category/${p.join('/')}/`;
      const newUrl = `/${lang}/blog/category/${newP.join('/')}/`;
      if (!newRedirects[oldUrl]) { newRedirects[oldUrl] = newUrl; redirectAdded++; if (lang === 'zh') sampleUrls.push([oldUrl, newUrl]); }
    }
  }

  // 新树:替换 slug
  const newTree = deepClone(tree);
  findNodeByPath(newTree, chosen).slug = newSlug;

  // 同步文章:categories 数组任意位置的 oldSlug → newSlug
  const posts = scanPosts();
  const postChanges = [];
  for (const post of posts) {
    if (!post.categories.includes(oldSlug)) continue;
    const newCats = post.categories.map(s => s === oldSlug ? newSlug : s);
    const newRaw = rewriteCategoriesLine(post.raw, newCats);
    if (newRaw !== post.raw) postChanges.push({ file: post.file, name: post.name, oldCats: post.categories, newCats, newRaw });
  }

  console.log('\n===== 预览变更 =====');
  console.log(`categories.json:  ${oldSlug} → ${newSlug}`);
  console.log(`文章同步(${postChanges.length} 篇):`);
  for (const c of postChanges) console.log(`  ${c.name}: [${c.oldCats.join(', ')}] → [${c.newCats.join(', ')}]`);
  if (redirectAdded) {
    console.log(`redirects.json(+${redirectAdded} 条,示例):`);
    for (const [o, n] of sampleUrls.slice(0, 3)) console.log(`  ${o} → ${n}`);
  }
  console.log('====================');
  if (!(await confirm({ message: '确认落盘?' }))) { console.log('已取消。'); return; }

  writeCategoriesJson(newTree);
  for (const c of postChanges) fs.writeFileSync(c.file, c.newRaw);
  writeRedirectsJson(newRedirects);
  console.log(`✓ 完成。建议: git add -A && git commit -m "cms: rename category ${oldSlug} -> ${newSlug} (${postChanges.length} posts)"`);
}

async function editCategoryMeta() {
  const tree = loadCategories();
  const paths = flattenPaths(tree);
  if (!paths.length) { console.log('无分类。'); return; }
  const chosen = await select({ message: '选择分类:', choices: [BACK, ...paths.map(p => ({ name: pathLabel(tree, p), value: p }))] });
  if (!chosen) return;
  const node = findNodeByPath(tree, chosen);
  const labelZh = await input({ message: '中文名(回车保持):', default: node.label?.zh ?? '' });
  const labelEn = await input({ message: '英文名(回车保持):', default: node.label?.en ?? '' });
  const descZh = await input({ message: '中文描述(回车保持):', default: node.description?.zh ?? '' });
  const descEn = await input({ message: '英文描述(回车保持):', default: node.description?.en ?? '' });
  const newTree = deepClone(tree);
  const n = findNodeByPath(newTree, chosen);
  n.label = { zh: labelZh, en: labelEn };
  n.description = { zh: descZh, en: descEn };
  console.log('\n将更新 categories.json(仅 名称/描述,不影响 URL)。');
  if (await confirm({ message: '确认?' })) {
    writeCategoriesJson(newTree);
    console.log(`✓ 完成。已更新「${pathLabel(newTree, chosen)}」(中文名: ${labelZh})`);
  } else console.log('已取消。');
}

async function deleteCategory() {
  const tree = loadCategories();
  const paths = flattenPaths(tree);
  if (!paths.length) { console.log('无分类。'); return; }
  const chosen = await select({ message: '选择要删除的分类:', choices: [BACK, ...paths.map(p => ({ name: pathLabel(tree, p), value: p }))] });
  if (!chosen) return;
  const node = findNodeByPath(tree, chosen);
  const posts = scanPosts();
  const affected = posts.filter(p => postInCategory(p.categories, chosen));
  console.log(`\n将删除: ${pathLabel(tree, chosen)}  (slug: ${chosen.join('/')})`);
  if (node.children.length) console.log(`  ⚠ 连带删除 ${node.children.length} 个直接子分类及其所有后代`);
  if (affected.length) {
    console.log(`  ⚠ ${affected.length} 篇文章的 categories 经过此节点,删除后这些 slug 将「悬空」(文章从分类页消失):`);
    for (const p of affected) console.log(`    ${p.name}: [${p.categories.join(', ')}]`);
    if (await confirm({ message: `把这 ${affected.length} 篇文章的 categories 截断到父级(去掉本节点及之后,避免悬空)?`, default: false })) {
      var truncate = true;
    }
  }
  if (!(await confirm({ message: '确认删除?' }))) { console.log('已取消。'); return; }
  const newTree = deepClone(tree);
  removeNodeByPath(newTree, chosen);
  writeCategoriesJson(newTree);
  if (truncate) {
    const cut = chosen.length - 1;
    for (const p of affected) {
      const newCats = p.categories.slice(0, cut);
      fs.writeFileSync(p.file, rewriteCategoriesLine(p.raw, newCats));
    }
  }
  console.log(`✓ 完成。建议: git add -A && git commit -m "cms: delete category ${chosen.join('/')}"`);
}

async function batchDeleteCategories() {
  const tree = loadCategories();
  const paths = flattenPaths(tree);
  if (!paths.length) { console.log('无分类。'); return; }
  console.log('\n用空格勾选要删除的分类(可多选,删父级会连带其后代),回车确认。Ctrl+C 取消。');
  const selected = await checkbox({
    message: '选择要批量删除的分类:',
    choices: paths.map(p => ({ name: pathLabel(tree, p) + `  (${p.join('/')})`, value: p })),
  });
  if (!selected.length) { console.log('未选择任何分类。'); return; }

  // 把选中路径扁平成「待删 slug 路径集合」,便于判断某文章 categories 是否经过任一被删节点
  // 同时展开:选中父级时,其后代路径也应视为被删(removeNodeByPath 删父级会带走后代)
  const selSet = new Set(selected.map(p => p.join('/')));
  const deletedPaths = paths.filter(p => {
    // 该路径本身被选,或其任一祖先被选
    for (let i = 1; i <= p.length; i++) if (selSet.has(p.slice(0, i).join('/'))) return true;
    return false;
  });

  // 对每篇文章,计算删后 categories:去掉所有「落在被删路径上」的段
  // 一段 segs[i] 落在被删路径上 = 存在被删路径等于 cats[0..i] 的前缀
  const delSet = new Set(deletedPaths.map(p => p.join('/')));
  const posts = scanPosts();
  const postPlan = [];
  for (const post of posts) {
    const newCats = truncateForDeletedPaths(post.categories, delSet);
    if (newCats === null) continue;
    postPlan.push({ post, oldCats: post.categories, newCats });
  }

  // 预览
  console.log(`\n将删除 ${selected.length} 个分类(含连带后代共 ${deletedPaths.length} 个节点):`);
  for (const p of selected) console.log(`  ${pathLabel(tree, p)}  (${p.join('/')})`);
  if (postPlan.length) {
    console.log(`\n⚠ ${postPlan.length} 篇文章的 categories 经过被删节点,将自动截断到父级(避免悬空):`);
    for (const c of postPlan) console.log(`  ${c.post.name}: [${c.oldCats.join(', ')}] → [${c.newCats.join(', ')}]`);
  } else console.log('\n无文章受影响。');
  if (!(await confirm({ message: '确认批量删除?' }))) { console.log('已取消。'); return; }

  // 写 categories.json:从深到浅删除(先删子,避免父删后路径找不到)
  const newTree = deepClone(tree);
  const sortedSel = [...selected].sort((a, b) => b.length - a.length);
  for (const p of sortedSel) removeNodeByPath(newTree, p);
  writeCategoriesJson(newTree);
  for (const c of postPlan) fs.writeFileSync(c.post.file, rewriteCategoriesLine(c.post.raw, c.newCats));
  console.log(`✓ 完成。建议: git add -A && git commit -m "cms: batch delete ${selected.length} categories"`);
}

// ============ 标签功能 ============
function collectTagCounts(posts) {
  const map = {};
  for (const p of posts) for (const t of p.tags) map[t] = (map[t] || 0) + 1;
  return map;
}

async function listTags() {
  const map = collectTagCounts(scanPosts());
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  console.log('\n标签:');
  for (const [t, c] of arr) console.log(`  ${t}  [${c}篇]`);
  if (!arr.length) console.log('  (无标签)');
}

async function renameTag() {
  const map = collectTagCounts(scanPosts());
  const tags = Object.keys(map);
  if (!tags.length) { console.log('无标签'); return; }
  const oldTag = await select({ message: '选择标签:', choices: [BACK, ...tags.map(t => ({ name: `${t} [${map[t]}篇]`, value: t }))] });
  if (!oldTag) return;
  const newTag = await input({ message: `新名称(当前 ${oldTag}):`, default: oldTag, validate: v => v.trim() ? true : '不能为空' });
  if (newTag === oldTag) { console.log('未变化'); return; }
  const changes = [];
  for (const p of scanPosts()) {
    if (!p.tags.includes(oldTag)) continue;
    const newRaw = mapTagsBlock(p.raw, t => t === oldTag ? newTag : t);
    if (newRaw !== p.raw) changes.push({ file: p.file, newRaw });
  }
  console.log(`\n将重命名标签 "${oldTag}" → "${newTag}"(${changes.length} 篇文章)`);
  if (await confirm({ message: '确认?' })) {
    for (const c of changes) fs.writeFileSync(c.file, c.newRaw);
    console.log(`✓ 完成。建议: git add -A && git commit -m "cms: rename tag ${oldTag} -> ${newTag}"`);
  } else console.log('已取消。');
}

async function deleteTag() {
  const map = collectTagCounts(scanPosts());
  const tags = Object.keys(map);
  if (!tags.length) { console.log('无标签'); return; }
  const tag = await select({ message: '选择要删除的标签:', choices: [BACK, ...tags.map(t => ({ name: `${t} [${map[t]}篇]`, value: t }))] });
  if (!tag) return;
  const changes = [];
  for (const p of scanPosts()) {
    if (!p.tags.includes(tag)) continue;
    const newRaw = mapTagsBlock(p.raw, t => t === tag ? null : t);
    if (newRaw !== p.raw) changes.push({ file: p.file, newRaw });
  }
  console.log(`\n将从 ${changes.length} 篇文章删除标签 "${tag}"(保留 tags: 空行)`);
  if (await confirm({ message: '确认?' })) {
    for (const c of changes) fs.writeFileSync(c.file, c.newRaw);
    console.log(`✓ 完成。建议: git add -A && git commit -m "cms: delete tag ${tag}"`);
  } else console.log('已取消。');
}

async function batchDeleteTags() {
  const map = collectTagCounts(scanPosts());
  const tags = Object.keys(map);
  if (!tags.length) { console.log('无标签'); return; }
  console.log('\n用空格/回车勾选要删除的标签(可多选),回车确认。Ctrl+C 取消。');
  const selected = await checkbox({
    message: '选择要批量删除的标签:',
    choices: tags.map(t => ({ name: `${t} [${map[t]}篇]`, value: t })),
  });
  if (!selected.length) { console.log('未选择任何标签。'); return; }
  const set = new Set(selected);
  // 预览:每个选中标签影响的文章数 + 总受影响文件数
  const posts = scanPosts();
  const changes = [];
  for (const p of posts) {
    if (!p.tags.some(t => set.has(t))) continue;
    const newRaw = mapTagsBlock(p.raw, t => set.has(t) ? null : t);
    if (newRaw !== p.raw) changes.push({ file: p.file, newRaw });
  }
  const totalRemoved = selected.reduce((s, t) => s + map[t], 0);
  console.log(`\n将删除 ${selected.length} 个标签(共出现 ${totalRemoved} 次):`);
  for (const t of selected) console.log(`  ${t} [${map[t]}篇]`);
  console.log(`涉及 ${changes.length} 个文章文件(保留 tags: 空行)`);
  if (!(await confirm({ message: '确认批量删除?' }))) { console.log('已取消。'); return; }
  for (const c of changes) fs.writeFileSync(c.file, c.newRaw);
  console.log(`✓ 完成。建议: git add -A && git commit -m "cms: batch delete ${selected.length} tags"`);
}

// ============ 友链功能 ============
async function listFriends() {
  const friends = loadFriends();
  if (!friends.length) { console.log('\n无友链'); return; }
  console.log(`\n友链(${friends.length} 条):`);
  friends.forEach((f, i) => {
    const avatar = f.avatar ? '🖼' : '🔤';
    console.log(`  ${i + 1}. ${f.name}  ${avatar}  ${f.url}`);
    if (f.desc) console.log(`     ${f.desc}`);
  });
}

async function addFriend() {
  const name = await input({ message: '名字:', validate: v => v.trim() ? true : '不能为空' });
  const url = await input({
    message: '网址(https://...):',
    validate: v => /^https?:\/\//.test(v.trim()) ? true : '需以 http:// 或 https:// 开头',
  });
  const desc = await input({ message: '一句话简介(可空):' }) || '';
  const avatar = await input({ message: '头像路径(如 /images/friends/x.png,留空用首字母):' }) || '';
  const friends = loadFriends();
  const node = { name: name.trim(), url: url.trim(), avatar: avatar.trim(), desc: desc.trim() };
  console.log(`\n将新增友链:`);
  console.log(`  ${node.name}  ${node.url}`);
  if (node.desc) console.log(`  ${node.desc}`);
  if (node.avatar) console.log(`  头像: ${node.avatar}`);
  if (await confirm({ message: '写入 friends.json?' })) {
    friends.push(node);
    writeFriendsJson(friends);
    console.log(`✓ 完成。建议: git add -A && git commit -m "cms: add friend ${node.name}"`);
  } else console.log('已取消。');
}

async function deleteFriend() {
  const friends = loadFriends();
  if (!friends.length) { console.log('无友链'); return; }
  const idx = await select({
    message: '选择要删除的友链:',
    choices: [BACK, ...friends.map((f, i) => ({ name: `${f.name}  (${f.url})`, value: i }))],
  });
  if (idx === null) return;
  const target = friends[idx];
  console.log(`\n将删除: ${target.name}  (${target.url})`);
  if (await confirm({ message: '确认删除?' })) {
    friends.splice(idx, 1);
    writeFriendsJson(friends);
    console.log(`✓ 完成。建议: git add -A && git commit -m "cms: delete friend ${target.name}"`);
  } else console.log('已取消。');
}

async function batchDeleteFriends() {
  const friends = loadFriends();
  if (!friends.length) { console.log('无友链'); return; }
  console.log('\n用空格勾选要删除的友链(可多选),回车确认。Ctrl+C 取消。');
  const selected = await checkbox({
    message: '选择要批量删除的友链:',
    choices: friends.map((f, i) => ({ name: `${f.name}  (${f.url})`, value: i })),
  });
  if (!selected.length) { console.log('未选择任何友链。'); return; }
  console.log(`\n将删除 ${selected.length} 条:`);
  for (const i of selected) console.log(`  ${friends[i].name}  (${friends[i].url})`);
  if (!(await confirm({ message: '确认批量删除?' }))) { console.log('已取消。'); return; }
  // 从大到小删,避免索引错位
  const set = new Set(selected);
  const remaining = friends.filter((_, i) => !set.has(i));
  writeFriendsJson(remaining);
  console.log(`✓ 完成。建议: git add -A && git commit -m "cms: batch delete ${selected.length} friends"`);
}

// ============ 主循环 ============
// 运行子操作;Ctrl+C(ExitPromptError)视为「取消」,返回上级菜单而非退出整个程序
async function runOp(fn) {
  try { await fn(); }
  catch (e) {
    if (e?.name === 'ExitPromptError') { console.log('\n(已取消,返回当前菜单)\n'); return; }
    throw e;
  }
}
async function main() {
  console.log('💡 任意输入步骤按 Ctrl+C 可取消并返回菜单;选择列表可用「← 返回」/「返回」。');
  if (!gitIsClean()) {
    console.log('⚠ git 工作区不干净。建议先提交或 git checkout,以便出错时回滚。');
    if (!(await confirm({ message: '仍继续?' }))) return;
  }
  loop: while (true) {
    const action = await select({
      message: '博客维护',
      choices: [
        { name: '🗂  分类管理', value: 'cat' },
        { name: '🔖  标签管理', value: 'tag' },
        { name: '🔗  友链管理', value: 'friend' },
        { name: '退出', value: 'exit' },
      ],
    });
    if (action === 'exit') break loop;
    if (action === 'cat') {
      while (true) {
        const sub = await select({
          message: '分类管理',
          choices: [
            { name: '列出分类', value: 'list' },
            { name: '新增分类', value: 'add' },
            { name: '重命名 slug(自动同步文章+重定向)', value: 'rename' },
            { name: '改 中/英文名称与描述(不影响网址)', value: 'meta' },
            { name: '删除分类', value: 'del' },
            { name: '批量删除分类(多选)', value: 'batch' },
            { name: '返回', value: 'back' },
          ],
        });
        if (sub === 'back') break;
        const ops = { list: listCategories, add: addCategory, rename: renameCategorySlug, meta: editCategoryMeta, del: deleteCategory, batch: batchDeleteCategories };
        if (ops[sub]) await runOp(ops[sub]);
      }
    } else if (action === 'tag') {
      while (true) {
        const sub = await select({
          message: '标签管理',
          choices: [
            { name: '列出标签', value: 'list' },
            { name: '重命名标签', value: 'rename' },
            { name: '删除标签', value: 'del' },
            { name: '批量删除标签(多选)', value: 'batch' },
            { name: '返回', value: 'back' },
          ],
        });
        if (sub === 'back') break;
        const ops = { list: listTags, rename: renameTag, del: deleteTag, batch: batchDeleteTags };
        if (ops[sub]) await runOp(ops[sub]);
      }
    } else if (action === 'friend') {
      while (true) {
        const sub = await select({
          message: '友链管理',
          choices: [
            { name: '列出友链', value: 'list' },
            { name: '新增友链', value: 'add' },
            { name: '删除友链', value: 'del' },
            { name: '批量删除友链(多选)', value: 'batch' },
            { name: '返回', value: 'back' },
          ],
        });
        if (sub === 'back') break;
        const ops = { list: listFriends, add: addFriend, del: deleteFriend, batch: batchDeleteFriends };
        if (ops[sub]) await runOp(ops[sub]);
      }
    }
  }
  console.log('再见 👋');
}

// 仅在直接运行时启动交互;被 import 时不自动运行(便于测试)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(e => {
    if (e?.name === 'ExitPromptError') { console.log('\n已退出。'); process.exit(0); }
    console.error(e); process.exit(1);
  });
}

// 导出纯函数供测试
export {
  SLUG_RE, flattenPaths, allSlugs, findNodeByPath, removeNodeByPath, postInCategory, pathLabel, truncateForDeletedPaths,
  parseCategories, parseTags, rewriteCategoriesLine, mapTagsBlock,
};
