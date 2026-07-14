// 构建时把 dist/sw.js 的 VERSION 替换成"本次构建时间戳",实现每次部署自动清 Service Worker 缓存。
// 在 npm run build 末尾执行(astro build 之后)。源 public/sw.js 的 VERSION 只是占位,不用手动改。
import fs from 'fs';

const file = 'dist/sw.js';
if (!fs.existsSync(file)) {
  console.log('跳过: dist/sw.js 不存在(astro build 还没跑?)');
  process.exit(0);
}

let s = fs.readFileSync(file, 'utf8');
// 时间戳格式跟原来一致:v + 年月日时分秒(14位),如 v20260714220000
const ts = 'v' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
s = s.replace(/const VERSION = '[^']*';/, `const VERSION = '${ts}';`);
fs.writeFileSync(file, s);
console.log(`✓ SW VERSION → ${ts}(本次部署自动清缓存)`);
