import assert from 'node:assert/strict';
import test from 'node:test';
import remarkCjkFriendlyStrong from '../src/plugins/remark-cjk-friendly-strong.mjs';

function transform(children) {
  const tree = { type: 'root', children };
  remarkCjkFriendlyStrong()(tree);
  return tree.children;
}

test('converts CommonMark-unparsed CJK strong markers', () => {
  assert.deepEqual(
    transform([{
      type: 'paragraph',
      children: [{ type: 'text', value: '最典型的应用是在**对比学习（Contrastive Learning）**中。' }],
    }]),
    [{
      type: 'paragraph',
      children: [
        { type: 'text', value: '最典型的应用是在' },
        { type: 'strong', children: [{ type: 'text', value: '对比学习（Contrastive Learning）' }] },
        { type: 'text', value: '中。' },
      ],
    }],
  );
});

test('converts multiple unparsed strong spans in one text node', () => {
  assert.deepEqual(
    transform([{ type: 'text', value: '**第一项**与**第二项**都要加粗' }]),
    [
      { type: 'strong', children: [{ type: 'text', value: '第一项' }] },
      { type: 'text', value: '与' },
      { type: 'strong', children: [{ type: 'text', value: '第二项' }] },
      { type: 'text', value: '都要加粗' },
    ],
  );
});

test('leaves parsed strong nodes and inline code untouched', () => {
  const input = [
    { type: 'strong', children: [{ type: 'text', value: '已经解析' }] },
    { type: 'inlineCode', value: '**保留字面符号**' },
  ];
  assert.deepEqual(transform(structuredClone(input)), input);
});

test('does not mistake programming exponent syntax for CJK emphasis', () => {
  const input = [{ type: 'text', value: 'Python 中 x**2 + y**2 表示平方' }];
  assert.deepEqual(transform(structuredClone(input)), input);
});
