import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { siteConfig } from '../data/site';
import { getDefaultCategories } from '../data/categories';

export async function GET(context: any) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const sorted = posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  return rss({
    title: siteConfig.title,
    description: siteConfig.description.en,
    site: context.site,
    items: sorted.map((post) => {
      const slug = post.id.split('/').slice(1).join('/');
      const cats = post.data.categories || (post.data.category ? [post.data.category] : getDefaultCategories());
      return {
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.description || '',
        link: `/${post.data.lang}/blog/${slug}/`,
        categories: cats,
      };
    }),
    customData: `<language>zh-cn</language>`,
  });
}
