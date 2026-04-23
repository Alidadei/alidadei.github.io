import type { Lang } from '../data/site';
import { defaultLang } from '../data/site';

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang === 'zh' || lang === 'en') return lang;
  return defaultLang;
}

export function getPathWithoutLang(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'zh' || parts[0] === 'en') {
    parts.shift();
  }
  return '/' + parts.join('/');
}

export function getLocalizedPath(path: string, lang: Lang): string {
  const cleanPath = getPathWithoutLang(path);
  return `/${lang}${cleanPath === '/' ? '/' : cleanPath}`;
}

export function getAlternateLang(lang: Lang): Lang {
  return lang === 'zh' ? 'en' : 'zh';
}

export function getAlternateUrl(url: URL): string {
  const lang = getLangFromUrl(url);
  const altLang = getAlternateLang(lang);
  return getLocalizedPath(url.pathname, altLang);
}

export function getSafeAlternateUrl(url: URL): string {
  const lang = getLangFromUrl(url);
  const altLang = getAlternateLang(lang);
  const pathname = url.pathname;

  // For blog post pages, fall back to blog listing since articles may not have translations
  if (/^\/(zh|en)\/blog\/(?!category)(?!$)/.test(pathname)) {
    return `/${altLang}/blog/`;
  }

  return getLocalizedPath(pathname, altLang);
}
