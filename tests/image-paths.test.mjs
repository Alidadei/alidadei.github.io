import assert from 'node:assert/strict';
import remarkPublicImagePaths, { toSiteImagePath } from '../src/plugins/remark-public-image-paths.mjs';

assert.equal(
  toSiteImagePath('../../../../public/images/posts/diagram.png'),
  '/images/posts/diagram.png',
);
assert.equal(
  toSiteImagePath('./../public/images/posts/diagram.png'),
  '/images/posts/diagram.png',
);
assert.equal(toSiteImagePath('/images/posts/diagram.png'), '/images/posts/diagram.png');
assert.equal(toSiteImagePath('https://example.com/diagram.png'), 'https://example.com/diagram.png');
assert.equal(toSiteImagePath('../../assets/diagram.png'), '../../assets/diagram.png');

const tree = {
  type: 'root',
  children: [
    { type: 'image', url: '../../../../public/images/posts/diagram.png' },
    { type: 'definition', url: '../../../../public/images/posts/other.png' },
    { type: 'html', value: '<img src="../../../../public/images/posts/html.png" alt="html">' },
    { type: 'link', url: '../../../../public/images/posts/not-an-image.png' },
  ],
};
remarkPublicImagePaths()(tree);
assert.equal(tree.children[0].url, '/images/posts/diagram.png');
assert.equal(tree.children[1].url, '/images/posts/other.png');
assert.equal(tree.children[2].value, '<img src="/images/posts/html.png" alt="html">');
assert.equal(tree.children[3].url, '../../../../public/images/posts/not-an-image.png');

console.log('image path compatibility tests passed');
