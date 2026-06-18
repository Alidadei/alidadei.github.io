export type FeedPost = {
  title: string;
  link: string;
  pubDate: Date;
};

// 构建时同一 feed 只抓一次(zh/en 两个友链页共享)
const cache = new Map<string, FeedPost[]>();

// CI 跑在 GitHub 数据中心,无 UA 的请求会被 Cloudflare 等 bot 防护拦截 →
// 带一个真实浏览器 UA(ngaizean.com 等套 Cloudflare 的站点必须)
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// 轻量 RSS/Atom 提取器:已知 feed 为 Hugo 等生成的规整 XML,够用且零依赖
function parseFeed(xml: string): FeedPost[] {
  const out: FeedPost[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const pick = (tag: string) => {
      const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const r = re.exec(block);
      return r ? decodeEntities(r[1].trim()) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pubRaw = pick('pubDate');
    if (!title || !link) continue;
    const pubDate = pubRaw ? new Date(pubRaw) : new Date(0);
    out.push({ title, link, pubDate });
  }
  return out;
}

/**
 * 构建时抓取 RSS feed,返回最新的 limit 篇。
 * 任何网络/解析失败都返回 [] —— 绝不因外部 feed 挂掉而破坏构建。
 * predicate 可用于过滤非文章页(如 /friends/ /about/)。
 */
export async function getLatestPosts(
  feedUrl: string,
  limit = 3,
  predicate?: (p: FeedPost) => boolean,
): Promise<FeedPost[]> {
  let posts = cache.get(feedUrl);
  if (!posts) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(feedUrl, {
        signal: ctrl.signal,
        headers: {
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          'user-agent': BROWSER_UA,
        },
      });
      clearTimeout(timer);
      if (!res.ok) {
        // 诊断:打印真实状态码 + 响应体片段,确认是否 CF 质询(403/503)
        const body = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
        console.error(`[friend-feed] ${feedUrl} -> HTTP ${res.status} ${res.statusText} | body: ${body}`);
        return [];
      }
      const xml = await res.text();
      // 200 但内容不是 feed:可能是 CF 的 200 质询页或空文档
      if (!/<(rss|feed|item|entry)\b/i.test(xml)) {
        console.error(`[friend-feed] ${feedUrl} -> 200 but not a feed (likely CF challenge page) | body: ${xml.slice(0, 200).replace(/\s+/g, ' ')}`);
        return [];
      }
      posts = parseFeed(xml).sort((a, b) => (b.pubDate.getTime() || 0) - (a.pubDate.getTime() || 0));
      cache.set(feedUrl, posts);
    } catch (e) {
      // 诊断:区分超时(abort)与其它网络错误
      const err = e as { name?: string; message?: string };
      const reason = err?.name === 'AbortError' ? 'timeout(8s)' : (err?.message || String(e));
      console.error(`[friend-feed] ${feedUrl} -> fetch threw: ${reason}`);
      return [];
    }
  }
  const filtered = predicate ? posts.filter(predicate) : posts;
  return filtered.slice(0, limit);
}
