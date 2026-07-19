const UNPARSED_STRONG = /\*\*([^\r\n]+?)\*\*/g;
const CJK_CONTEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function splitUnparsedStrong(node) {
  const value = node.value;
  const children = [];
  let cursor = 0;

  for (const match of value.matchAll(UNPARSED_STRONG)) {
    const index = match.index;
    const before = index > 0 ? value[index - 1] : '';
    const after = value[index + match[0].length] || '';
    if (!CJK_CONTEXT.test(`${before}${match[1]}${after}`)) continue;

    if (index > cursor) {
      children.push({ type: 'text', value: value.slice(cursor, index) });
    }

    children.push({
      type: 'strong',
      children: [{ type: 'text', value: match[1] }],
    });
    cursor = index + match[0].length;
  }

  if (children.length === 0) return [node];
  if (cursor < value.length) {
    children.push({ type: 'text', value: value.slice(cursor) });
  }
  return children;
}

function rewriteChildren(parent) {
  if (!Array.isArray(parent.children)) return;

  const children = [];
  for (const child of parent.children) {
    if (child.type === 'text' && child.value.includes('**')) {
      children.push(...splitUnparsedStrong(child));
      continue;
    }

    rewriteChildren(child);
    children.push(child);
  }
  parent.children = children;
}

/**
 * CommonMark may leave `**...**` as plain text when a closing delimiter is
 * adjacent to CJK text and the emphasized phrase ends in punctuation. Convert
 * only those still-unparsed text nodes; normal strong nodes and code are left
 * untouched. Literal Markdown markers should be written as inline code.
 */
export default function remarkCjkFriendlyStrong() {
  return (tree) => rewriteChildren(tree);
}
