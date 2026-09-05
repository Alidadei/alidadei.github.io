import assert from 'node:assert/strict';
import test from 'node:test';

import {
  joinFrontmatter,
  parsePostMeta,
  setDraftFlag,
  splitFrontmatter,
} from '../src/components/admin/post-meta.ts';

const SAMPLE = `---
title: 测试文章
date: 2026-09-04
lang: zh
categories: ['学习笔记', 'ai']
tags:
  - llm
draft: false
---

正文第一段。

- 列表项
`;

test('setDraftFlag 行级改写,不影响其他 frontmatter 行', () => {
  const hidden = setDraftFlag(SAMPLE, true);
  assert.match(hidden, /^draft: true$/m);
  assert.doesNotMatch(hidden, /draft: false/);
  // 其他行原样保留(行级改写,不重序列化)
  assert.match(hidden, /^title: 测试文章$/m);
  assert.match(hidden, /^categories: \['学习笔记', 'ai'\]$/m);
  assert.match(hidden, /^  - llm$/m);
  assert.match(hidden, /\n\n正文第一段。/);

  const restored = setDraftFlag(hidden, false);
  assert.match(restored, /^draft: false$/m);
  // 除 draft 行外与原文完全一致
  const strip = (s) => s.replace(/^draft: .+$/m, '');
  assert.equal(strip(restored), strip(SAMPLE));
});

test('setDraftFlag 在缺 draft 行时插入块尾', () => {
  const noDraft = `---
title: 老文章
date: 2025-01-01
---

正文
`;
  const hidden = setDraftFlag(noDraft, true);
  assert.match(hidden, /date: 2025-01-01\ndraft: true\n---/);
  const out = setDraftFlag(hidden, false);
  assert.match(out, /^draft: false$/m);
});

test('setDraftFlag 无 frontmatter 时原样返回', () => {
  assert.equal(setDraftFlag('只是普通文本', true), '只是普通文本');
});

test('splitFrontmatter / joinFrontmatter 往返', () => {
  const { fm, body } = splitFrontmatter(SAMPLE);
  assert.match(fm ?? '', /^title: 测试文章/m);
  assert.match(fm ?? '', /draft: false$/m);
  assert.match(body, /^正文第一段。/);
  assert.equal(joinFrontmatter(fm, body), SAMPLE);
});

test('splitFrontmatter 处理无 frontmatter 内容', () => {
  assert.deepEqual(splitFrontmatter('纯文本'), { fm: null, body: '纯文本' });
});

test('parsePostMeta 提取标题/日期/草稿/语言', () => {
  const meta = parsePostMeta(SAMPLE);
  assert.equal(meta.title, '测试文章');
  assert.equal(meta.date, '2026-09-04');
  assert.equal(meta.draft, false);
  assert.equal(meta.lang, 'zh');

  const quoted = parsePostMeta("---\ntitle: '引号标题'\ndate: 2026-01-02\ndraft: true\n---\n\nx");
  assert.equal(quoted.title, '引号标题');
  assert.equal(quoted.draft, true);
});
