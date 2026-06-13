import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
  }),
});

const portfolio = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/portfolio' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    collection: z.literal('portfolio'),
    image: z.string().optional(),
    link: z.string().optional(),
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
