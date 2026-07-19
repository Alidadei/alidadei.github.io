import test from 'node:test';
import assert from 'node:assert/strict';
import shikiTextDiagram, { isTextDiagram } from '../src/plugins/shiki-text-diagram.mjs';

test('detects multiline branch diagrams used by the post', () => {
  assert.equal(isTextDiagram(`模型输出 logits
  ├─ 直接取最大值 ────→ greedy decoding
  └─ temperature 调整（可选）
       ↓ softmax 得到概率`, 'text'), true);
});

test('detects single-line pipelines with multiple arrows', () => {
  assert.equal(
    isTextDiagram('字符串 → token 序列 → token ID 序列 → Transformer', 'text'),
    true,
  );
});

test('keeps ordinary text snippets and non-text code out', () => {
  assert.equal(isTextDiagram('整条回答正确 -> reward 高', 'text'), false);
  assert.equal(isTextDiagram('a -> b -> c', 'javascript'), false);
  assert.equal(isTextDiagram('普通说明文字，没有结构连接符。', 'text'), false);
});

test('Shiki transformer marks only detected diagrams', () => {
  const diagramPre = { properties: { className: ['astro-code'] } };
  const plainPre = { properties: { className: ['astro-code'] } };
  const addClassToHast = (node, className) => {
    node.properties.className.push(className);
  };

  shikiTextDiagram.pre.call({
    source: '输入 → 处理 → 输出',
    options: { lang: 'text' },
    addClassToHast,
  }, diagramPre);
  shikiTextDiagram.pre.call({
    source: '这是一段普通说明。',
    options: { lang: 'text' },
    addClassToHast,
  }, plainPre);

  assert.equal(diagramPre.properties['data-text-diagram'], '');
  assert.deepEqual(diagramPre.properties.className, ['astro-code', 'text-diagram']);
  assert.equal(plainPre.properties['data-text-diagram'], undefined);
  assert.deepEqual(plainPre.properties.className, ['astro-code']);
});
