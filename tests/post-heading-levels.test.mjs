import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layout = await readFile(
  new URL('../src/layouts/PostLayout.astro', import.meta.url),
  'utf8',
);
const styles = await readFile(
  new URL('../src/styles/global.css', import.meta.url),
  'utf8',
);

test('post TOC includes every supported body heading from H2 through H6', () => {
  assert.match(
    layout,
    /querySelectorAll\('h2, h3, h4, h5, h6'\)/,
  );
  for (const level of [2, 3, 4, 5, 6]) {
    assert.match(layout, new RegExp('level === ' + level));
  }
});

test('post typography defines H5 and H6 styles', () => {
  assert.match(styles, /\.prose h5\s*\{/);
  assert.match(styles, /\.prose h6\s*\{/);
});
