const PLAIN_TEXT_LANGUAGES = new Set(['text', 'txt', 'plaintext']);
const BRANCH_OR_BOX = /[┌┐└┘├┤┬┴┼╭╮╰╯]/;
const BOX_CONNECTORS = /[│┃─━═]/g;
const UNICODE_ARROWS = /[←→↑↓↔↕⇒⇐⇑⇓]/g;
const ASCII_ARROWS = /(?:-{2,}|={2,})[>v^]|(?:->|=>|<-|<=)/g;

export function isTextDiagram(source, language = 'text') {
  if (!PLAIN_TEXT_LANGUAGES.has(String(language).toLowerCase())) return false;

  const text = String(source);
  if (!text.trim()) return false;

  const boxConnectorCount = text.match(BOX_CONNECTORS)?.length ?? 0;
  const arrowCount = (text.match(UNICODE_ARROWS)?.length ?? 0)
    + (text.match(ASCII_ARROWS)?.length ?? 0);

  return BRANCH_OR_BOX.test(text)
    || boxConnectorCount >= 3
    || arrowCount >= 2;
}

const shikiTextDiagram = {
  name: 'text-diagram',
  pre(hast) {
    if (!isTextDiagram(this.source, this.options.lang)) return;

    hast.properties ??= {};
    hast.properties['data-text-diagram'] = '';
    this.addClassToHast(hast, 'text-diagram');
  },
};

export default shikiTextDiagram;
