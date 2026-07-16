/**
 * Keep Markdown image links usable from both Typora and the Astro site.
 *
 * Authors write a path relative to the Markdown file, for example:
 *
 *   ![diagram](../../../../public/images/posts/diagram.png)
 *
 * Typora resolves that path on disk. Before Astro collects Markdown image
 * assets, this plugin changes it to the public URL that the deployed site
 * serves: /images/posts/diagram.png.
 */

const RELATIVE_PUBLIC_IMAGE_RE = /^(?:(?:\.\.\/)|(?:\.\/))+public\/images\/(.+)$/;

/**
 * Convert a source-relative public image path to its deployed site URL.
 * Absolute URLs and already-normalized site URLs are left untouched.
 */
export function toSiteImagePath(value) {
  if (typeof value !== 'string') return value;
  const match = value.match(RELATIVE_PUBLIC_IMAGE_RE);
  return match ? `/images/${match[1]}` : value;
}

function rewriteImageUrls(node) {
  if ((node.type === 'image' || node.type === 'definition') && typeof node.url === 'string') {
    node.url = toSiteImagePath(node.url);
  }

  // Raw HTML is still a Markdown node at this stage, so rewrite it before
  // remark-rehype parses the tag. This keeps scaled <img> snippets portable.
  if (node.type === 'html' && typeof node.value === 'string') {
    node.value = node.value.replace(
      /(\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
      (_full, prefix, url, suffix) => `${prefix}${toSiteImagePath(url)}${suffix}`,
    );
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) rewriteImageUrls(child);
  }
}

export default function remarkPublicImagePaths() {
  return (tree) => rewriteImageUrls(tree);
}
