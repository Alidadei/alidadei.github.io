// 验证 scripts/cms.mjs 的纯函数(解析/改写/匹配/校验)。
// 直接 import cms.mjs:因 main() 有「仅直接运行时启动」守卫,import 不会触发交互。
// 用法: node tests/cms-functions.test.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  SLUG_RE, flattenPaths, allSlugs, findNodeByPath, postInCategory, pathLabel, truncateForDeletedPaths,
  parseCategories, parseTags, rewriteCategoriesLine, mapTagsBlock,
} from '../scripts/cms.mjs';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log(`✗ ${name}`); }
}
function eq(name, a, b) {
  const equal = JSON.stringify(a) === JSON.stringify(b);
  if (equal) { pass++; } else { fail++; console.log(`✗ ${name}\n   期望 ${JSON.stringify(b)}\n   实际 ${JSON.stringify(a)}`); }
}

// ---------- parseCategories ----------
eq('parseCategories 多元素', parseCategories("categories: ['a', 'b', 'c']"), ['a', 'b', 'c']);
eq('parseCategories 单元素', parseCategories("categories: ['a']"), ['a']);
eq('parseCategories 双引号容错', parseCategories('categories: ["a", "b"]'), ['a', 'b']);
eq('parseCategories 无字段', parseCategories('title: x'), []);
eq('parseCategories 完整fm', parseCategories("---\ntitle: x\ncategories: ['tech-learning', 'deep-learning']\n---"), ['tech-learning', 'deep-learning']);

// ---------- parseTags ----------
const fmTags = "---\ntitle: x\ntags:\n  - A\n  - B\n  - C\ncategories: ['x']\n---";
eq('parseTags 多行块', parseTags(fmTags), ['A', 'B', 'C']);
eq('parseTags 无字段', parseTags("---\ntitle: x\n---"), []);
eq('parseTags 空块(后跟categories)', parseTags("---\ntitle: x\ntags:\ncategories: ['x']\n---"), []);

// ---------- rewriteCategoriesLine(行级,不破坏其它内容) ----------
const sample = "---\ntitle: 'Temperature'\ndate: 2026-04-23\ntags:\n  - LLM\n  - Softmax\ncategories: ['tech-learning', 'deep-learning', 'transformer']\nlang: zh\n---\nbody";
const renamed = rewriteCategoriesLine(sample, ['tech-learning', 'deep-learning', 'transformer-arch']);
ok('rewrite 改了', renamed !== sample);
ok('rewrite 含新slug', renamed.includes("'transformer-arch'"));
ok('rewrite 整行替换(旧行不存在)', !/^categories:.*'transformer'/m.test(renamed));
ok('rewrite 单引号格式', /categories: \['tech-learning', 'deep-learning', 'transformer-arch'\]/.test(renamed));
ok('rewrite tags块不变', renamed.includes("tags:\n  - LLM\n  - Softmax\n"));
ok('rewrite title不变', renamed.includes("title: 'Temperature'"));
ok('rewrite date不变', renamed.includes('date: 2026-04-23'));
ok('rewrite 正文不变', renamed.endsWith('body'));

// ---------- mapTagsBlock ----------
const renamedTag = mapTagsBlock(sample, t => t === 'LLM' ? '大模型' : t);
ok('mapTags rename 命中', renamedTag.includes('  - 大模型'));
ok('mapTags rename 不误删其它', renamedTag.includes('  - Softmax'));
ok('mapTags rename 不碰 categories', renamedTag.includes("categories: ['tech-learning'"));
const delTag = mapTagsBlock(sample, t => t === 'LLM' ? null : t);
ok('mapTags delete 移除目标', !/^\s{2}- LLM\s*$/m.test(delTag));
ok('mapTags delete 保留其它', delTag.includes('  - Softmax'));
ok('mapTags delete 保留 tags: 行', /^tags:\s*$/m.test(delTag));

// ---------- postInCategory(前缀精确匹配) ----------
ok('postIn 前缀匹配', postInCategory(['a', 'b', 'c'], ['a', 'b']));
ok('postIn 精确等长', postInCategory(['a', 'b'], ['a', 'b']));
ok('postIn 不匹配', !postInCategory(['a', 'b'], ['a', 'x']));
ok('postIn cats短于路径', !postInCategory(['a'], ['a', 'b']));
ok('postIn 空路径总真', postInCategory(['a'], []));

// ---------- SLUG_RE ----------
ok('slug 合法', ['tech-learning', 'a1', 'transformer-arch', 'x'].every(s => SLUG_RE.test(s)));
ok('slug 大写非法', !SLUG_RE.test('Tech'));
ok('slug 下划线非法', !SLUG_RE.test('tech_learning'));
ok('slug 连字符开头非法', !SLUG_RE.test('-tech'));
ok('slug 空非法', !SLUG_RE.test(''));

// ---------- 真实文章验证 ----------
const realPost = process.cwd() + '/src/content/posts/zh/temperature-math.md';
const realRaw = fs.readFileSync(realPost, 'utf8');
const realFm = realRaw.match(/^---[\s\S]*?^---/m)[0];
const realCats = parseCategories(realFm);
ok('真实 categories 是非空数组', Array.isArray(realCats) && realCats.length > 0);
ok('真实 categories 元素均为合法 slug', realCats.every(s => SLUG_RE.test(s)));
eq('真实 tags(含中文)', parseTags(realFm), ['LLM', 'Temperature', 'Softmax', '深度学习']);
const renamedReal = rewriteCategoriesLine(realRaw, ['a', 'b', 'c-x']);
ok('真实 rewrite 改了 categories', renamedReal.includes("'c-x'"));
ok('真实 rewrite tags 不动', renamedReal.includes('  - 深度学习'));
ok('真实 rewrite 正文不动', renamedReal.includes('Temperature 的数学本质'));
ok('真实 rewrite title 不动', renamedReal.includes("title: 'Temperature 的数学本质'"));

// ---------- 用真实 categories.json(动态取值,不硬编码 slug) ----------
const treePath = process.cwd() + '/src/data/categories.json';
const realTree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
const paths = flattenPaths(realTree);
const allPaths = paths.map(p => p.join('/'));
ok('flatten 含根分类', paths.some(p => p.length === 1));
ok('flatten 含三层路径', paths.some(p => p.length === 3));
ok('flatten 路径数量>0', allPaths.length > 0);
const slugs = allSlugs(realTree);
ok('allSlugs 含路径中的slug', paths[0][0] && slugs.has(paths[0][0]));
ok('allSlugs 不含不存在', !slugs.has('nope-slug-xyz'));
const firstPath = paths[0];
eq('findNode 取首个路径', findNodeByPath(realTree, firstPath)?.slug, firstPath[firstPath.length - 1]);
ok('findNode 不存在返回 null', findNodeByPath(realTree, ['nope-slug-xyz']) === null);

// ---------- 模拟 rename slug 全流程(内存推演,动态取最深叶节点) ----------
// 取一个真实存在的最深叶节点作为 rename 目标(避免依赖具体 slug)
const target = paths.slice().sort((a, b) => b.length - a.length)[0];
const renameNode = findNodeByPath(realTree, target);
ok('rename 目标存在', renameNode?.slug === target[target.length - 1]);
const affected = [target];
flattenPaths(renameNode.children, target, affected);
ok('rename affected 含目标自身', affected.some(p => p.join('/') === target.join('/')));
const oldSlug = target[target.length - 1];
const newSlug = oldSlug + '-renamed';
const reds = {};
for (const p of affected) {
  const np = p.map(s => s === oldSlug ? newSlug : s);
  for (const lang of ['zh', 'en']) reds[`/${lang}/blog/category/${p.join('/')}/`] = `/${lang}/blog/category/${np.join('/')}/`;
}
ok('redirect zh', reds[`/zh/blog/category/${target.join('/')}/`] === `/zh/blog/category/${target.map(s => s === oldSlug ? newSlug : s).join('/')}/`);
ok('redirect en', reds[`/en/blog/category/${target.join('/')}/`] === `/en/blog/category/${target.map(s => s === oldSlug ? newSlug : s).join('/')}/`);
ok('redirect 共 affected*2 条(中英)', Object.keys(reds).length === affected.length * 2);
ok('redirect 旧URL含旧slug', Object.keys(reds).every(k => k.includes(oldSlug)));
ok('redirect 新URL含新slug', Object.values(reds).every(v => v.includes(newSlug)));

// pathLabel(中文显示,用 fixture 不依赖真实数据)
const fixture = [{ slug: 'a', label: { zh: '甲' }, children: [{ slug: 'b', label: { zh: '乙' }, children: [] }] }];
eq('pathLabel 路径转中文', pathLabel(fixture, ['a', 'b']), '甲 / 乙');
ok('pathLabel 缺失节点回退 slug', pathLabel(fixture, ['a', 'x']) === '甲 / x');
ok('pathLabel label 缺失回退 slug', pathLabel([{ slug: 'a', children: [] }], ['a']) === 'a');

// truncateForDeletedPaths(批量删除分类时文章 categories 的截断逻辑)
eq('truncate 删中间节点', truncateForDeletedPaths(['note', 'ai', 'transformer'], new Set(['note/ai', 'note/ai/transformer'])), ['note']);
eq('truncate 删叶节点', truncateForDeletedPaths(['note', 'ai', 'transformer'], new Set(['note/ai/transformer'])), ['note', 'ai']);
eq('truncate 不受影响返回 null', truncateForDeletedPaths(['note', 'embedded'], new Set(['note/ai'])), null);
eq('truncate 删根节点成空数组', truncateForDeletedPaths(['note', 'ai'], new Set(['note'])), []);
ok('truncate 空数组不受影响', truncateForDeletedPaths([], new Set(['note/ai'])) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
