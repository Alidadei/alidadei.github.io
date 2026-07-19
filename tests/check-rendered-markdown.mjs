import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const distRoot = path.resolve('dist');
const blogRoots = [path.join(distRoot, 'zh', 'blog'), path.join(distRoot, 'en', 'blog')];
const rawStrong = /\*\*[^*<>\r\n]+\*\*/g;

async function collectIndexFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectIndexFiles(entryPath));
    else if (entry.name === 'index.html') files.push(entryPath);
  }
  return files;
}

function stripLiteralContainers(html) {
  return html
    .replace(/<(pre|code|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[^]*?-->/g, '');
}

const files = (await Promise.all(blogRoots.map(collectIndexFiles))).flat();
const failures = [];

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const matches = stripLiteralContainers(html).match(rawStrong);
  if (matches) {
    failures.push({ file: path.relative(distRoot, file), matches: [...new Set(matches)] });
  }
}

const temperatureHtml = await readFile(
  path.join(distRoot, 'zh', 'blog', 'temperature-math', 'index.html'),
  'utf8',
);
if (!temperatureHtml.includes('<strong>对比学习（Contrastive Learning）</strong>')) {
  failures.push({
    file: 'zh/blog/temperature-math/index.html',
    matches: ['expected Contrastive Learning strong element is missing'],
  });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ checked: files.length, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ checked: files.length, rawStrongMarkers: 0 }, null, 2));

