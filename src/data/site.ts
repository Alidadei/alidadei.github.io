export const siteConfig = {
  name: 'Harry Yu',
  title: 'About Harry Yu',
  description: {
    zh: 'Harry Yu 的个人网站 - 复旦大学生物医学工程（人工智能方向）博士研究生',
    en: 'Harry Yu\'s personal website - Ph.D. student in Biomedical Engineering (AI) at Fudan University',
  },
  url: 'https://alidadei.github.io',
  author: {
    name: 'Harry Yu',
    avatar: '/images/my_profile.png',
    bio: {
      zh: '复旦大学生物医学工程（人工智能方向）博士研究生',
      en: 'Ph.D. student in Biomedical Engineering (AI) at Fudan University',
    },
    location: 'Shanghai, China',
    email: 'yuhl@stu.ouc.edu.cn',
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
      { label: '关于', href: '/zh/about/' },
      { label: '博客', href: '/zh/blog/' },
      { label: '项目', href: '/zh/projects/' },
      { label: '论文', href: '/zh/publications/' },
      { label: '简历', href: '/zh/cv/' },
      { label: '联系', href: '/zh/contact/' },
    ],
    en: [
      { label: 'Home', href: '/en/' },
      { label: 'About', href: '/en/about/' },
      { label: 'Blog', href: '/en/blog/' },
      { label: 'Projects', href: '/en/projects/' },
      { label: 'Publications', href: '/en/publications/' },
      { label: 'CV', href: '/en/cv/' },
      { label: 'Contact', href: '/en/contact/' },
    ],
  },
} as const;

export type Lang = 'zh' | 'en';
export const languages: Lang[] = ['zh', 'en'];
export const defaultLang: Lang = 'zh';
