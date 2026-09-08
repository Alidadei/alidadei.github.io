// 仓库路径白名单:所有读写接口的路径必须落在允许的目录树内。
// 背景:/api/file/、/api/posts/ 接受任意路径,等于允许改 .github/workflows/——
// 改 workflow 即可在 CI 里执行任意代码。OAuth + 用户白名单之外,这里再加一道兜底。
// 单测:tests/worker-path-guard.test.mjs

// 允许读写的目录(前缀匹配,均以 / 结尾)
const ALLOWED_ROOTS = ['src/content/', 'src/data/', 'public/images/'];

// 额外精确放行的单文件:站点锁开关(在线后台「站点开关」双通道的仓库侧文件)
const ALLOWED_FILES = ['public/site-mode.json'];

// 各路由的收窄限制
export const POSTS_ROOT = 'src/content/posts/';
export const IMAGES_ROOT = 'public/images/';

// 规范化相对路径:去空段、解析 . 与 ..,拒绝绝对路径和反斜杠
export function normalizeRepoPath(raw: string): string | null {
  if (raw.includes('\\') || raw.includes('\0')) return null;
  if (raw.startsWith('/')) return null;
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
}

function isUnderAnyRoot(path: string, roots: string[]): boolean {
  return roots.some(root => path.startsWith(root));
}

// 通用文件接口(/api/file/*):允许内容、数据与图片目录,以及精确放行的开关文件
export function isAllowedFilePath(raw: string): boolean {
  const path = normalizeRepoPath(raw);
  if (path === null) return false;
  if (ALLOWED_FILES.includes(path)) return true;
  return isUnderAnyRoot(path + (path.endsWith('/') ? '' : '/'), ALLOWED_ROOTS);
}

// 文章接口(/api/posts/*):只允许文章目录
export function isAllowedPostPath(raw: string): boolean {
  const path = normalizeRepoPath(raw);
  return path !== null && path.startsWith(POSTS_ROOT);
}

// 图片接口(/api/images/*):只允许图片目录
export function isAllowedImagePath(raw: string): boolean {
  const path = normalizeRepoPath(raw);
  return path !== null && path.startsWith(IMAGES_ROOT);
}
