import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import knowledgeData from './data/knowledge.json';

// 收集 knowledge.json 所有合法 slug 路径,构建时校验文章 knowledge 字段
const VALID_KNOWLEDGE_PATHS = new Set<string>(
  (() => {
    const out: string[] = [];
    const walk = (nodes: any[], parent: string) => {
      for (const n of nodes) {
        const p = parent ? `${parent}/${n.slug}` : n.slug;
        out.push(p);
        walk(n.children || [], p);
      }
    };
    walk(knowledgeData as any[], '');
    return out;
  })(),
);

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.date(),
    updated: z.date().optional(),
    tags: z.array(z.string()).default([]),
    categories: z.array(z.string()).optional(),
    category: z.string().optional(), // legacy, migrate to categories
    image: z.string().optional(),
    draft: z.boolean().default(false),
    lang: z.enum(['zh', 'en']).default('zh'),
    knowledge: z.array(z.string()).default([]).refine(
      (arr) => arr.every((p) => VALID_KNOWLEDGE_PATHS.has(p)),
      (arr) => ({
        message: `knowledge 路径不在 knowledge.json:${arr.filter((p) => !VALID_KNOWLEDGE_PATHS.has(p)).map((p) => ` '${p}'`).join('')}`,
      }),
    ), // subject 主题路径(校验存在于 knowledge.json)
    maturity: z.enum(['基础', '当下热点', '未来展望']).optional(), // 时效定位
  }),
});

const portfolio = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/portfolio' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    image: z.string().optional(),
    link: z.string().optional(),
    categories: z.array(z.string()).optional(),
  }),
});

const about = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/about' }),
  schema: z.object({
    lang: z.enum(['zh', 'en']).default('zh'),
    news: z.array(z.object({
      date: z.string(),
      text: z.string(),
    })).default([]),
    education: z.array(z.object({
      school: z.string(),
      period: z.string(),
      degree: z.string(),
    })).default([]),
    internship: z.array(z.object({
      company: z.string(),
      period: z.string(),
      description: z.string(),
    })).default([]),
    research: z.array(z.object({
      title: z.string(),
      role: z.string().optional(),
      period: z.string().optional(),
      description: z.string(),
    })).default([]),
    awards: z.array(z.object({
      title: z.string(),
      desc: z.string().optional(),
    })).default([]),
    skills: z.array(z.object({
      name: z.string(),
      items: z.array(z.string()),
    })).default([]),
  }),
});

export const collections = {
  posts,
  portfolio,
  about,
};
