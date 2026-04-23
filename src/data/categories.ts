import categoryData from './categories.json';
import type { Lang } from './site';

export interface CategoryNode {
  slug: string;
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  aliases: string[];
  children: CategoryNode[];
}

export const categoryTree: CategoryNode[] = categoryData as CategoryNode[];

// Validate category tree at build time
const slugConflicts = validateUniqueSlugs(categoryTree);
if (slugConflicts.length > 0) {
  console.warn(`[categories] Duplicate slugs detected: ${slugConflicts.join(', ')}`);
}
function validateNodes(nodes: CategoryNode[]): void {
  for (const node of nodes) {
    if (!validateSlug(node.slug)) {
      console.warn(`[categories] Invalid slug: "${node.slug}"`);
    }
    validateNodes(node.children);
  }
}
validateNodes(categoryTree);

export function getTopLevelCategories(): CategoryNode[] {
  return categoryTree;
}

export function findCategoryByPath(path: string[]): CategoryNode | null {
  if (path.length === 0) return null;
  let nodes = categoryTree;
  let current: CategoryNode | undefined;
  for (const segment of path) {
    current = nodes.find((n) => n.slug === segment);
    if (!current) return null;
    nodes = current.children;
  }
  return current ?? null;
}

export function getCategoryLabel(path: string[], lang: Lang): string {
  let nodes = categoryTree;
  const labels: string[] = [];
  for (const segment of path) {
    const node = nodes.find((n) => n.slug === segment);
    if (!node) break;
    labels.push(node.label[lang]);
    nodes = node.children;
  }
  return labels.join(' > ');
}

export function getCategoryLabelSingle(slug: string, lang: Lang): string {
  const node = findInTree(categoryTree, slug);
  return node ? node.label[lang] : slug;
}

function findInTree(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const found = findInTree(node.children, slug);
    if (found) return found;
  }
  return null;
}

export function flattenCategoryPaths(): string[][] {
  const paths: string[][] = [];
  function walk(nodes: CategoryNode[], current: string[]) {
    for (const node of nodes) {
      const path = [...current, node.slug];
      paths.push(path);
      walk(node.children, path);
    }
  }
  walk(categoryTree, []);
  return paths;
}

export function getPostsInCategory(posts: { data: { categories?: string[]; category?: string } }[], categoryPath: string[]): typeof posts {
  return posts.filter((post) => {
    const cats = post.data.categories || (post.data.category ? [post.data.category] : ['tech-learning']);
    if (categoryPath.length === 0) return true;
    if (cats.length < categoryPath.length) return false;
    return categoryPath.every((seg, i) => cats[i] === seg);
  });
}

export function countPostsInCategory(posts: { data: { categories?: string[]; category?: string } }[], categoryPath: string[]): number {
  return getPostsInCategory(posts, categoryPath).length;
}

export function getDefaultCategories(): string[] {
  return ['tech-learning'];
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) && slug.length > 0 && slug.length <= 64;
}

export function validateUniqueSlugs(nodes: CategoryNode[], seen = new Set<string>()): string[] {
  const conflicts: string[] = [];
  for (const node of nodes) {
    if (seen.has(node.slug)) conflicts.push(node.slug);
    seen.add(node.slug);
    const childConflicts = validateUniqueSlugs(node.children, seen);
    conflicts.push(...childConflicts);
  }
  return conflicts;
}
