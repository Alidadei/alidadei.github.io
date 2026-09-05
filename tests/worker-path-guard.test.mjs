import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMAGES_ROOT,
  POSTS_ROOT,
  isAllowedFilePath,
  isAllowedImagePath,
  isAllowedPostPath,
  normalizeRepoPath,
} from '../worker/src/paths.ts';

test('文章接口只放行 src/content/posts/ 下的路径', () => {
  assert.equal(isAllowedPostPath('src/content/posts/zh/foo.md'), true);
  assert.equal(isAllowedPostPath('src/content/posts/en/bar.md'), true);
  assert.equal(isAllowedPostPath('src/content/portfolio/x.md'), false);
  assert.equal(isAllowedPostPath('src/data/categories.json'), false);
});

test('通用文件接口放行内容/数据/图片目录', () => {
  assert.equal(isAllowedFilePath('src/data/categories.json'), true);
  assert.equal(isAllowedFilePath('src/data/friends.json'), true);
  assert.equal(isAllowedFilePath('src/content/posts/zh/a.md'), true);
  assert.equal(isAllowedFilePath('src/content/portfolio/x.md'), true);
  assert.equal(isAllowedFilePath('public/images/posts/1.png'), true);
});

test('提权路径一律拒绝(workflow、仓库根、越界穿越)', () => {
  assert.equal(isAllowedFilePath('.github/workflows/deploy.yml'), false);
  assert.equal(isAllowedPostPath('.github/workflows/deploy.yml'), false);
  assert.equal(isAllowedFilePath('package.json'), false);
  assert.equal(isAllowedFilePath('worker/src/index.ts'), false);

  // .. 穿越规范化后逃出白名单
  assert.equal(isAllowedFilePath('src/content/../../../.github/workflows/deploy.yml'), false);
  assert.equal(isAllowedPostPath('src/content/posts/zh/../../data/leak.md'), false);
  assert.equal(isAllowedImagePath('public/images/../../src/index.astro'), false);
});

test('normalizeRepoPath 处理穿越、绝对路径与反斜杠', () => {
  assert.equal(normalizeRepoPath('a/b/../c'), 'a/c');
  assert.equal(normalizeRepoPath('../..'), '');
  assert.equal(normalizeRepoPath('/abs/path'), null);
  assert.equal(normalizeRepoPath('a\\b'), null);
  assert.equal(normalizeRepoPath('a//b///./c'), 'a/b/c');
});

test('图片接口只放行 public/images/', () => {
  assert.equal(isAllowedImagePath('public/images/posts/x.png'), true);
  assert.equal(isAllowedImagePath('public/images/logo.png'), true);
  assert.equal(isAllowedImagePath('src/content/posts/a.md'), false);
});

test('常量保持与路由一致', () => {
  assert.equal(POSTS_ROOT, 'src/content/posts/');
  assert.equal(IMAGES_ROOT, 'public/images/');
});
