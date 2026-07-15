export const siteConfig = {
  name: 'Harry Yu',
  title: 'About Harry Yu',
  description: {
    zh: 'Harry Yu 的个人网站',
    en: "Harry Yu's personal website",
  },
  url: 'https://alidadei.github.io',
  author: {
    name: 'Harry Yu',
    avatar: '/images/my_profile.png',
    bio: {
      zh: 'FDU Ph.D.student',
      en: 'Ph.D.student @ FDU',
    },
    location: 'Shanghai, China',
    email: '13427917163@163.com',
    github: 'Alidadei',
    researchInterests: [
      'Large Language Models',
      'Multi-Agent Systems',
      'Medical AI',
      'AI-Native Development',
    ],
  },
  nav: {
    zh: [
      { label: '首页', href: '/zh/' },
      { label: '关于我', href: '/zh/about/' },
      { label: '博客', href: '/zh/blog/' },
      { label: '项目', href: '/zh/projects/' },
      { label: '友链', href: '/zh/links/' },
    ],
    en: [
      { label: 'Home', href: '/en/' },
      { label: 'About', href: '/en/about/' },
      { label: 'Blog', href: '/en/blog/' },
      { label: 'Projects', href: '/en/projects/' },
      { label: 'Friends', href: '/en/links/' },
    ],
  },
} as const;

export type Lang = 'zh' | 'en';
export const languages: Lang[] = ['zh', 'en'];
export const defaultLang: Lang = 'zh';
