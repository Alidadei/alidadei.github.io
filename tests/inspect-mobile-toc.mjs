const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9223';
const baseUrl = process.env.TOC_BASE_URL || 'http://127.0.0.1:4173';

const defaultPages = [
  '/zh/blog/llm-post-training-basics-and-jargon/',
  '/zh/blog/claude-code-dynamic-workflows/',
];

const pages = process.env.MOBILE_TOC_PAGES?.split(',').filter(Boolean) || defaultPages;
const widths = process.env.MOBILE_TOC_WIDTHS?.split(',').map(Number).filter(Boolean)
  || [320, 360, 375, 390, 412, 430];
const includeDetails = process.env.MOBILE_TOC_DETAIL === '1';
const injectedCss = process.env.MOBILE_TOC_INJECT_CSS || '';

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function inspectPage(path, width) {
  const targetResponse = await fetch(
    `${cdpBase}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  );
  if (!targetResponse.ok) {
    throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);
  }

  const target = await targetResponse.json();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);

  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: 844,
    });
    await client.send('Page.navigate', {
      url: `${baseUrl}${path}`,
    });
    await client.send('Runtime.evaluate', {
      expression: `new Promise(resolve => {
        const finish = () => setTimeout(resolve, 900);
        if (document.readyState === 'complete') finish();
        else window.addEventListener('load', finish, { once: true });
      })`,
      awaitPromise: true,
    });
    if (injectedCss) {
      await client.send('Runtime.evaluate', {
        expression: `(() => {
          const style = document.createElement('style');
          style.dataset.mobileTocProbe = 'true';
          style.textContent = ${JSON.stringify(injectedCss)};
          document.head.appendChild(style);
        })()`,
      });
    }
    const evaluation = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const button = document.getElementById('toc-mobile-btn');
        const panel = document.getElementById('toc-mobile-panel');
        const article = document.querySelector('article');
        const prose = document.querySelector('.prose');
        const headingCount = prose?.querySelectorAll('h2, h3, h4').length || 0;
        const buttonRect = button?.getBoundingClientRect();
        const articleStyle = article ? getComputedStyle(article) : null;
        const visualWidth = window.visualViewport?.width || window.innerWidth;
        const proseRect = prose?.getBoundingClientRect();
        const proseOverflowers = proseRect
          ? [...prose.querySelectorAll('*')]
            .map(element => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                className: typeof element.className === 'string' ? element.className : '',
                left: rect.left,
                right: rect.right,
                width: rect.width,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                text: element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 80) || '',
              };
            })
            .filter(item => item.right > proseRect.right + 0.5)
            .sort((a, b) => a.right - b.right)
            .slice(0, 20)
          : [];
        const contentContainers = [...document.querySelectorAll('.prose table, .prose pre, .prose .katex-display')]
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            return {
              index,
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === 'string' ? element.className : '',
              left: rect.left,
              right: rect.right,
              width: rect.width,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
            };
          })
          .sort((a, b) => b.right - a.right);
        const mathBlocks = [...document.querySelectorAll('.katex-display')]
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            const child = element.firstElementChild;
            return {
              index,
              left: rect.left,
              right: rect.right,
              width: rect.width,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              overflowX: getComputedStyle(element).overflowX,
              childWidth: child?.getBoundingClientRect().width,
              text: element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 100) || '',
            };
          })
          .sort((a, b) => b.scrollWidth - a.scrollWidth)
          .slice(0, 10);
        const wideNonTableElements = [...document.body.querySelectorAll('*')]
          .filter(element => !element.closest('table') && !element.closest('#toc-mobile-panel'))
          .map(element => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id,
              className: typeof element.className === 'string' ? element.className : '',
              width: rect.width,
              right: rect.right,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              overflowX: getComputedStyle(element).overflowX,
              text: element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 80) || '',
            };
          })
          .sort((a, b) => b.scrollWidth - a.scrollWidth)
          .slice(0, 12);
        const overflowers = [...document.body.querySelectorAll('*')]
          .map(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id,
              className: typeof element.className === 'string' ? element.className : '',
              text: element.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 80) || '',
              left: Math.round(rect.left * 100) / 100,
              right: Math.round(rect.right * 100) / 100,
              width: Math.round(rect.width * 100) / 100,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              overflowX: style.overflowX,
            };
          })
          .filter(item => item.right > visualWidth + 0.5 || item.left < -0.5)
          .sort((a, b) => b.right - a.right)
          .slice(0, 20);

        if (headingCount > 0) {
          button?.click();
          await new Promise(resolve => setTimeout(resolve, 400));
        }
        const panelRect = panel?.getBoundingClientRect();

        return {
          requestedWidth: ${width},
          path: location.pathname,
          headingCount,
          viewport: {
            innerWidth: window.innerWidth,
            visualWidth: window.visualViewport?.width,
            visualScale: window.visualViewport?.scale,
            rootClientWidth: document.documentElement.clientWidth,
            rootScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
          },
          button: buttonRect && {
            left: buttonRect.left,
            right: buttonRect.right,
            width: buttonRect.width,
            expectedRight: visualWidth - 12,
            display: getComputedStyle(button).display,
            position: getComputedStyle(button).position,
            offsetParent: button.offsetParent?.tagName || null,
          },
          panel: panelRect && {
            left: panelRect.left,
            right: panelRect.right,
            width: panelRect.width,
            transform: getComputedStyle(panel).transform,
          },
          article: article && {
            width: article.getBoundingClientRect().width,
            transform: articleStyle.transform,
            animationName: articleStyle.animationName,
          },
          prose: prose && {
            clientWidth: prose.clientWidth,
            scrollWidth: prose.scrollWidth,
          },
          ...(${includeDetails} ? { proseOverflowers, contentContainers, mathBlocks, wideNonTableElements, overflowers } : {}),
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });

    return evaluation.result.value;
  } finally {
    client.close();
    await fetch(`${cdpBase}/json/close/${target.id}`).catch(() => {});
  }
}

const report = [];
for (const path of pages) {
  for (const width of widths) {
    try {
      report.push(await inspectPage(path, width));
    } catch (error) {
      report.push({
        requestedWidth: width,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const near = (actual, expected, tolerance = 0.75) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const results = report.map((entry) => {
  const errors = [];
  const width = entry.requestedWidth;
  if (entry.error) {
    return {
      path: entry.path,
      width,
      pass: false,
      errors: [entry.error],
      ...(includeDetails ? { details: entry } : {}),
    };
  }
  const viewport = entry.viewport;

  if (!near(viewport.visualWidth, width)) errors.push(`visual viewport is ${viewport.visualWidth}px`);
  if (!near(viewport.innerWidth, width)) errors.push(`layout viewport is ${viewport.innerWidth}px`);
  if (!near(viewport.rootClientWidth, width)) errors.push(`root client width is ${viewport.rootClientWidth}px`);
  if (!near(viewport.rootScrollWidth, width)) errors.push(`root scroll width is ${viewport.rootScrollWidth}px`);
  if (viewport.bodyScrollWidth > width + 0.75) errors.push(`body scroll width is ${viewport.bodyScrollWidth}px`);
  if (entry.headingCount === 0) {
    if (!entry.button || entry.button.display !== 'none') {
      errors.push('TOC button is visible even though the article has no TOC headings');
    }
  } else {
    if (!entry.button) errors.push('TOC button is missing');
    else {
      if (entry.button.display === 'none') errors.push('TOC button is hidden');
      if (!near(entry.button.right, width - 12)) errors.push(`TOC button right edge is ${entry.button.right}px`);
      if (!near(entry.button.width, 40)) errors.push(`TOC button width is ${entry.button.width}px`);
    }
    if (!entry.panel) errors.push('TOC panel is missing');
    else {
      if (!near(entry.panel.right, width)) errors.push(`open TOC panel right edge is ${entry.panel.right}px`);
      if (entry.panel.left < -0.75) errors.push(`open TOC panel starts at ${entry.panel.left}px`);
    }
  }
  return {
    path: entry.path,
    width,
    headingCount: entry.headingCount,
    bodyScrollWidth: viewport.bodyScrollWidth,
    buttonRight: entry.button?.right,
    panelRight: entry.panel?.right,
    pass: errors.length === 0,
    errors,
    ...(includeDetails ? { details: entry } : {}),
  };
});

const failures = results.filter(result => !result.pass);
console.log(JSON.stringify({
  checked: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  results,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
