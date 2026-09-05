import assert from 'node:assert/strict';
import test from 'node:test';

import {
  base64FromBytes,
  bytesFromBase64,
  decodeUtf8Base64,
  encodeUtf8Base64,
} from '../worker/src/base64.ts';

test('UTF-8 中文/emoji 编解码往返', () => {
  const samples = [
    '中文测试',
    '博客文章:分类与标签 ✅',
    '混排 English content 与公式 $x^2$',
    '换行\n以及\t制表符\r\nCRLF',
    '',
  ];
  for (const s of samples) {
    assert.equal(decodeUtf8Base64(encodeUtf8Base64(s)), s);
    assert.equal(encodeUtf8Base64(s), Buffer.from(s, 'utf8').toString('base64'));
  }
});

test('解码 GitHub Contents API 带换行的 base64', () => {
  const raw = '中文内容'.repeat(100);
  const b64 = Buffer.from(raw, 'utf8').toString('base64');
  // GitHub 实际返回每 60 字符插一个 \n
  const wrapped = (b64.match(/.{1,60}/g) || []).join('\n');
  assert.equal(decodeUtf8Base64(wrapped), raw);
});

test('大文件(5MB 随机字节)编码分块正确', () => {
  const bytes = new Uint8Array(5 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) % 256;
  const encoded = base64FromBytes(bytes);
  assert.equal(encoded, Buffer.from(bytes).toString('base64'));
  assert.deepEqual(Array.from(bytesFromBase64(encoded)), Array.from(bytes));
});

test('标准向量与 padding 边界', () => {
  assert.equal(Buffer.from(bytesFromBase64('aGVsbG8=')).toString(), 'hello');
  assert.deepEqual(Array.from(bytesFromBase64('YQ==')), [0x61]);
  assert.deepEqual(Array.from(bytesFromBase64('YWI=')), [0x61, 0x62]);
  assert.deepEqual(Array.from(bytesFromBase64('YWJj')), [0x61, 0x62, 0x63]);
  assert.deepEqual(Array.from(bytesFromBase64('')), []);
});

test('非法输入明确报错', () => {
  assert.throws(() => bytesFromBase64('abc'), /bad length/);
  assert.throws(() => bytesFromBase64('YW*j'), /Invalid base64 char/);
});
