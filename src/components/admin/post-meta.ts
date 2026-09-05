// 文章 frontmatter 的行级处理纯函数(无 JSX,node --experimental-strip-types 可直接单测)。
// 与 scripts/cms.mjs 同一约定:只改目标行、绝不重序列化整个 frontmatter,避免污染 git diff。
// 单测:tests/admin-post-meta.test.mjs

export interface PostMeta {
  title: string;
  date: string;
  draft: boolean;
  lang: string;
}

// 拆出 frontmatter 与正文。无 frontmatter 时 fm 为 null,body 为原文。
// 正文的前导空行剥掉,join 时统一补「--- 后一个空行」的标准分隔。
export function splitFrontmatter(content: string): { fm: string | null; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { fm: null, body: content };
  const body = content.slice(m[0].length).replace(/^(?:\r?\n)+/, '');
  return { fm: m[1], body };
}

export function joinFrontmatter(fm: string | null, body: string): string {
  if (fm === null) return body;
  return `---\n${fm}\n---\n\n${body}`;
}

// 行级设置 draft 值。frontmatter 里没有 draft 行时插到块尾;没有 frontmatter 时原样返回。
export function setDraftFlag(content: string, draft: boolean): string {
  const { fm, body } = splitFrontmatter(content);
  if (fm === null) return content;
  const line = `draft: ${draft}`;
  if (/^draft:\s*(true|false)\s*$/m.test(fm)) {
    const newFm = fm.replace(/^draft:\s*(true|false)\s*.*$/m, line);
    return joinFrontmatter(newFm, body);
  }
  return joinFrontmatter(`${fm}\n${line}`, body);
}

// 从 frontmatter 提取列表展示要用的字段(轻量正则,不做完整 YAML 解析)
export function parsePostMeta(content: string): PostMeta {
  const { fm } = splitFrontmatter(content);
  const pick = (key: string): string => {
    const m = fm?.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  return {
    title: pick('title'),
    date: pick('date'),
    draft: /^draft:\s*true\s*$/m.test(fm ?? ''),
    lang: pick('lang') || 'zh',
  };
}
