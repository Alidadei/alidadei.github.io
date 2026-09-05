// 拷贝 Vditor 运行时资源到 public/vditor/dist(编辑器以 cdn:'/vditor' 按需加载)。
// 只拷编辑器会用到的子集:mathjax/graphviz/mermaid 等博客用不到,拷全量要多 17MB。
// dev/build 脚本都会调用;public/vditor/ 已 gitignore,不入库。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'node_modules', 'vditor', 'dist');
const DEST = path.join(ROOT, 'public', 'vditor', 'dist');

const COPY_JS = ['lute', 'katex', 'highlight.js', 'icons', 'i18n'];
const COPY_TOP = ['css', 'images', 'index.css'];

for (const dir of [...COPY_JS.map(d => path.join(SRC, 'js', d)), ...COPY_TOP.map(f => path.join(SRC, f))]) {
  if (!fs.existsSync(dir)) {
    console.error(`✗ 缺少 ${dir},先 npm install`);
    process.exit(1);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const name of COPY_TOP) {
  fs.cpSync(path.join(SRC, name), path.join(DEST, name), { recursive: true });
}
for (const name of COPY_JS) {
  fs.cpSync(path.join(SRC, 'js', name), path.join(DEST, 'js', name), { recursive: true });
}
console.log('✓ vditor assets → public/vditor/dist');
