import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkCjkFriendlyStrong from './src/plugins/remark-cjk-friendly-strong.mjs';
import remarkPublicImagePaths from './src/plugins/remark-public-image-paths.mjs';
import shikiTextDiagram from './src/plugins/shiki-text-diagram.mjs';
import redirects from './src/data/redirects.json' with { type: 'json' };

export default defineConfig({
  site: 'https://alidadei.github.io',
  redirects,
  markdown: {
    remarkPlugins: [remarkCjkFriendlyStrong, remarkPublicImagePaths, remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
      transformers: [shikiTextDiagram],
    },
  },
  integrations: [
    react(),
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', en: 'en-US' },
      },
      filter: (page) => {
        const url = new URL(page);
        return url.pathname !== '/';
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
});
