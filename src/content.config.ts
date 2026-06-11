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

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    tags: z.array(z.string()).default([]),
    github: z.string().optional(),
    demo: z.string().optional(),
    image: z.string().optional(),
    featured: z.boolean().default(false),
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

export const collections = {
  posts,
  projects,
  portfolio,
};
