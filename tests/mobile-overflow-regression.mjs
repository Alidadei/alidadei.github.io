import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASTRO_CLI = join(PROJECT_ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
const HOST = '127.0.0.1';
const PROFILE_PREFIX = 'alidadei-mobile-overflow-';
const WIDTHS = parseWidths(process.env.MOBILE_OVERFLOW_WIDTHS) ?? [320, 360, 390, 430];
const ROUTE_FILTER = parseRoutes(process.env.MOBILE_OVERFLOW_ROUTES);
const MAX_DISCOVERED_ROUTES = 250;
const DESKTOP_BLOG_LAYOUT_SPEC = Object.freeze({
  route: '/zh/blog/llm-post-training-basics-and-jargon/',
  referenceViewport: { width: 1749, height: 900 },
  guideLines: { articleLeft: 215, articleRight: 1336, tocLeft: 1366, tocRight: 1645 },
  widths: [1024, 1280, 1440, 1749, 1920],
});

function normalizeError(value) {
  if (value instanceof Error) return value;
  const message = value && typeof value === 'object' && 'message' in value
    ? String(value.message)
    : String(value);
  return new Error(message);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();

    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });

    socket.addEventListener('close', () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('Edge 调试连接已关闭。'));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', rejectPromise, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error('Edge 调试命令超时: ' + method));
      }, 15_000);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('移动端横向溢出回归目前使用 Microsoft Edge，仅支持 Windows。');
  }

  const edgePath = findEdgeExecutable();
  if (!edgePath) throw new Error('未找到 Microsoft Edge。');

  const state = {
    astro: null,
    edge: null,
    profileDir: null,
    cdpOrigin: null,
  };

  try {
    const webPort = await findAvailablePort(4340);
    const cdpPort = await findAvailablePort(9240, new Set([webPort]));
    const baseUrl = 'http://' + HOST + ':' + webPort;
    state.cdpOrigin = 'http://' + HOST + ':' + cdpPort;

    state.astro = spawn(
      process.execPath,
      [ASTRO_CLI, 'dev', '--host', HOST, '--port', String(webPort)],
      {
        cwd: PROJECT_ROOT,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const readAstroOutput = captureProcessOutput(state.astro);
    await waitForHttp(baseUrl + '/zh/', 30_000, state.astro, readAstroOutput);

    state.profileDir = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
    state.edge = spawn(
      edgePath,
      [
        '--headless=new',
        '--remote-debugging-address=' + HOST,
        '--remote-debugging-port=' + cdpPort,
        '--user-data-dir=' + state.profileDir,
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-gpu-early-init',
        '--disable-gpu-rasterization',
        '--disable-gpu-shader-disk-cache',
        '--disable-software-rasterizer',
        '--disable-features=SkiaGraphite',
        '--disable-skia-graphite',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ],
      { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    const readEdgeOutput = captureProcessOutput(state.edge);
    try {
      await waitForHttp(state.cdpOrigin + '/json/version', 20_000, state.edge);
    } catch (caught) {
      const error = normalizeError(caught);
      const edgeOutput = readEdgeOutput().trim();
      if (edgeOutput) error.message += '\nBrowser output:\n' + edgeOutput;
      throw error;
    }

    const routes = ROUTE_FILTER ?? await discoverRoutes(baseUrl);
    let report;
    try {
      report = await runBrowserAudit({
        cdpOrigin: state.cdpOrigin,
        baseUrl,
        routes,
        widths: WIDTHS,
      });
    } catch (caught) {
      const error = normalizeError(caught);
      const edgeOutput = readEdgeOutput().trim();
      if (edgeOutput) error.message += '\nEdge output:\n' + edgeOutput;
      throw error;
    }

    const failures = report.pageResults.filter((item) => item.issues.length > 0);
    const fixtureFailures = report.fixtureResults.filter((item) => item.issues.length > 0);
    const desktopLayoutFailures = report.desktopLayoutResults.filter(
      (item) => item.issues.length > 0,
    );

    console.log(JSON.stringify({
      routes: routes.length,
      widths: WIDTHS,
      pageChecks: report.pageResults.length,
      pageFailures: failures.length,
      fixtureChecks: report.fixtureResults.length,
      fixtureFailures: fixtureFailures.length,
      desktopWidths: DESKTOP_BLOG_LAYOUT_SPEC.widths,
      desktopLayoutChecks: report.desktopLayoutResults.length,
      desktopLayoutFailures: desktopLayoutFailures.length,
    }));

    if (failures.length || fixtureFailures.length || desktopLayoutFailures.length) {
      console.error(JSON.stringify({
        failures,
        fixtureFailures,
        desktopLayoutFailures,
      }, null, 2));
      return 1;
    }

    console.log(
      'PASS: 全站 ' + routes.length + ' 个路由及极端内容夹具在 '
      + WIDTHS.join(', ') + 'px 下均无页面溢出、正文裁切或失控宽元素；'
      + '桌面博客布局在 ' + DESKTOP_BLOG_LAYOUT_SPEC.widths.join(', ')
      + 'px 下保持参考比例且字体按视口缩放。',
    );
    return 0;
  } finally {
    await shutdown(state);
  }
}

async function runBrowserAudit({ cdpOrigin, baseUrl, routes, widths }) {
  let auditStep = 'create-target';
  const targetResponse = await fetch(
    cdpOrigin + '/json/new?' + encodeURIComponent('about:blank'),
    { method: 'PUT' },
  );
  if (!targetResponse.ok) {
    throw new Error('无法创建 Edge 调试页: ' + targetResponse.status);
  }

  const target = await targetResponse.json();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const pageResults = [];
  const fixtureResults = [];
  const desktopLayoutResults = [];

  try {
    auditStep = 'enable-page-and-runtime';
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    for (const width of widths) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: 844,
      });

      for (const route of routes) {
        auditStep = width + 'px ' + route;
        await navigateAndWait(client, baseUrl + route, route);
        const result = await evaluateByValue(client, inspectPageOverflow);
        pageResults.push({ width, route, ...result });
      }

      auditStep = width + 'px synthetic-fixture';
      await navigateAndWait(client, baseUrl + '/zh/', '/zh/');
      const fixture = await evaluateByValue(client, inspectSyntheticFixture);
      fixtureResults.push({ width, route: '/zh/#overflow-fixture', ...fixture });
    }

    for (const width of DESKTOP_BLOG_LAYOUT_SPEC.widths) {
      auditStep = 'desktop-responsive-layout ' + width + 'px';
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: DESKTOP_BLOG_LAYOUT_SPEC.referenceViewport.height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: width,
        screenHeight: DESKTOP_BLOG_LAYOUT_SPEC.referenceViewport.height,
      });
      await navigateAndWait(
        client,
        baseUrl + DESKTOP_BLOG_LAYOUT_SPEC.route,
        DESKTOP_BLOG_LAYOUT_SPEC.route,
      );
      await waitForSelector(client, '#toc-nav .toc-link[data-level="2"]', 3_000);
      const desktopLayout = await evaluateByValue(client, measureDesktopBlogLayout);
      const expected = getExpectedDesktopBlogLayout(width);
      desktopLayoutResults.push({
        width,
        route: DESKTOP_BLOG_LAYOUT_SPEC.route,
        ...desktopLayout,
        expected,
        issues: compareDesktopBlogLayout(desktopLayout, expected),
      });
    }
  } catch (caught) {
    const error = normalizeError(caught);
    error.message += '\nAudit step: ' + auditStep;
    throw error;
  } finally {
    await client.send('Target.closeTarget', { targetId: target.id }).catch(() => {});
    client.close();
  }

  return { pageResults, fixtureResults, desktopLayoutResults };
}

function measureDesktopBlogLayout() {
  const toRect = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
    };
  };

  const articleHeader = document.querySelector('.post-article-header');
  const prose = document.querySelector('.post-article-body');
  const sidebar = document.getElementById('toc-sidebar');
  const title = articleHeader?.querySelector('h1');
  const firstH2 = prose?.querySelector('h2');
  const firstTocLevel2 = document.querySelector('#toc-nav .toc-link[data-level="2"]');
  const toFontSize = (element) => element
    ? Number.parseFloat(getComputedStyle(element).fontSize)
    : null;
  const articleHeaderRect = toRect(articleHeader);
  const proseRect = toRect(prose);
  const sidebarRect = toRect(sidebar);
  const visibleRects = [articleHeaderRect, proseRect, sidebarRect].filter(Boolean);
  const group = visibleRects.length === 3
    ? {
        left: Math.min(...visibleRects.map(rect => rect.left)),
        right: Math.max(...visibleRects.map(rect => rect.right)),
        width: Math.max(...visibleRects.map(rect => rect.right))
          - Math.min(...visibleRects.map(rect => rect.left)),
      }
    : null;

  return {
    viewportWidth: window.innerWidth,
    articleHeader: articleHeaderRect,
    prose: proseRect,
    sidebar: sidebarRect,
    sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
    group,
    proseToSidebarGap: proseRect && sidebarRect ? sidebarRect.left - proseRect.right : null,
    fontSizes: {
      body: toFontSize(prose),
      title: toFontSize(title),
      h2: toFontSize(firstH2),
      tocLevel2: toFontSize(firstTocLevel2),
    },
  };
}

function getExpectedDesktopBlogLayout(viewportWidth) {
  const { referenceViewport, guideLines } = DESKTOP_BLOG_LAYOUT_SPEC;
  const scale = viewportWidth / referenceViewport.width;
  const articleLeft = guideLines.articleLeft * scale;
  const articleRight = guideLines.articleRight * scale;
  const tocLeft = guideLines.tocLeft * scale;
  const tocRight = guideLines.tocRight * scale;
  const clamp = (minimum, value, maximum) => Math.min(Math.max(value, minimum), maximum);

  return {
    viewportWidth,
    group: {
      left: articleLeft,
      right: tocRight,
      width: tocRight - articleLeft,
    },
    articleHeader: {
      left: articleLeft,
      right: articleRight,
      width: articleRight - articleLeft,
    },
    prose: {
      left: articleLeft,
      right: articleRight,
      width: articleRight - articleLeft,
    },
    sidebar: {
      left: tocLeft,
      right: tocRight,
      width: tocRight - tocLeft,
    },
    proseToSidebarGap: tocLeft - articleRight,
    fontSizes: {
      body: clamp(15, 13.586 + viewportWidth * 0.00138, 18),
      title: clamp(30, 21.524 + viewportWidth * 0.008276, 42),
      h2: clamp(25, 17.938 + viewportWidth * 0.006897, 35),
      tocLevel2: clamp(12.5, 11.086 + viewportWidth * 0.001379, 14.5),
    },
  };
}

function compareDesktopBlogLayout(actual, expected) {
  const tolerance = 0.1;
  const issues = [];
  const compareNumber = (label, value, expectedValue, allowedDrift = tolerance) => {
    if (!Number.isFinite(value) || Math.abs(value - expectedValue) > allowedDrift) {
      issues.push({
        type: 'desktop-layout-drift',
        field: label,
        expected: expectedValue,
        actual: value,
      });
    }
  };
  const compareRect = (name, expectedRect) => {
    const rect = actual[name];
    if (!rect) {
      issues.push({ type: 'desktop-layout-element-missing', element: name });
      return;
    }
    for (const field of ['left', 'right', 'width']) {
      compareNumber(name + '.' + field, rect[field], expectedRect[field]);
    }
  };

  compareNumber('viewportWidth', actual.viewportWidth, expected.viewportWidth);
  compareRect('group', expected.group);
  compareRect('articleHeader', expected.articleHeader);
  compareRect('prose', expected.prose);
  compareRect('sidebar', expected.sidebar);
  compareNumber('proseToSidebarGap', actual.proseToSidebarGap, expected.proseToSidebarGap);
  for (const [name, expectedFontSize] of Object.entries(expected.fontSizes)) {
    compareNumber('fontSizes.' + name, actual.fontSizes?.[name], expectedFontSize, 0.12);
  }
  if (actual.sidebarDisplay === 'none' || actual.sidebarDisplay === null) {
    issues.push({
      type: 'desktop-layout-sidebar-hidden',
      actual: actual.sidebarDisplay,
    });
  }

  return issues;
}

async function navigateAndWait(client, url, expectedPath) {
  await client.send('Page.navigate', { url });
  const deadline = Date.now() + 15_000;
  const expression = [
    'location.pathname === ',
    JSON.stringify(expectedPath),
    ' && (document.readyState === "interactive" || document.readyState === "complete")',
  ].join('');

  while (Date.now() < deadline) {
    try {
      const response = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });
      if (response.result.value === true) {
        await delay(180);
        return;
      }
    } catch {
      // Navigation briefly invalidates the execution context.
    }
    await delay(50);
  }

  throw new Error('页面加载超时: ' + url);
}

async function waitForSelector(client, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const expression = 'document.querySelector(' + JSON.stringify(selector) + ') !== null';

  while (Date.now() < deadline) {
    try {
      const response = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });
      if (response.result.value === true) return;
    } catch {
      // Navigation or HMR can briefly replace the execution context.
    }
    await delay(50);
  }

  throw new Error('等待页面元素超时: ' + selector);
}

async function evaluateByValue(client, callback) {
  const response = await client.send('Runtime.evaluate', {
    expression: '(' + callback.toString() + ')()',
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || '浏览器评估失败');
  }
  return response.result.value;
}

function inspectPageOverflow() {
  const tolerance = 1;
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const issues = [];
  const checked = new Set();
  const ignoredSelector = [
    'script',
    'style',
    'template',
    '[hidden]',
    '.katex-mathml',
    '#toc-mobile-panel',
    '#toc-mobile-backdrop',
  ].join(',');

  const describe = (element) => {
    const className = typeof element.className === 'string'
      ? element.className.trim().replace(/\s+/g, '.').slice(0, 90)
      : '';
    return element.tagName.toLowerCase()
      + (element.id ? '#' + element.id : '')
      + (className ? '.' + className : '');
  };

  const isRendered = (element) => {
    if (element.closest(ignoredSelector)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity || '1') === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isContainedByScroller = (element) => {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const overflowX = style.overflowX;
      if (
        (overflowX === 'auto' || overflowX === 'scroll')
        && parent.clientWidth > 0
      ) {
        const rect = parent.getBoundingClientRect();
        if (rect.left >= -tolerance && rect.right <= viewportWidth + tolerance) return true;
      }
    }
    return false;
  };

  const rootScrollWidth = document.documentElement.scrollWidth;
  const bodyScrollWidth = document.body.scrollWidth;
  if (rootScrollWidth > viewportWidth + tolerance) {
    issues.push({
      type: 'page-root-overflow',
      viewportWidth,
      scrollWidth: rootScrollWidth,
    });
  }
  const roots = document.querySelectorAll('body > header, main, article, body > footer');
  for (const root of roots) {
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (checked.has(element) || !isRendered(element)) continue;
      checked.add(element);
      const rect = element.getBoundingClientRect();
      const outsideViewport = rect.left < -tolerance || rect.right > viewportWidth + tolerance;
      if (outsideViewport && !isContainedByScroller(element)) {
        issues.push({
          type: 'visible-element-outside-viewport',
          element: describe(element),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        });
      }
    }
  }

  for (const prose of document.querySelectorAll('.prose')) {
    for (const element of [prose, ...prose.querySelectorAll('*')]) {
      if (!isRendered(element) || element.clientWidth <= 0) continue;
      if (element.closest('.katex') && !element.matches('.katex, .katex-display')) continue;
      if (element.scrollWidth <= element.clientWidth + tolerance) continue;

      const style = getComputedStyle(element);
      const overflowX = style.overflowX;
      if (overflowX === 'hidden' || overflowX === 'clip') {
        issues.push({
          type: 'clipped-prose-content',
          element: describe(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        });
      } else if (
        overflowX !== 'auto'
        && overflowX !== 'scroll'
        && !isContainedByScroller(element)
      ) {
        issues.push({
          type: 'uncontained-prose-width',
          element: describe(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX,
        });
      }
    }
  }

  // 移动端表格依靠表格自身横向滚动展示完整行；单元格及其行内后代都不能
  // 被全局的长文本断行规则重新开启换行。
  for (const cell of document.querySelectorAll('.prose table th, .prose table td')) {
    const candidates = [cell, ...cell.querySelectorAll('*')];
    const wrappingElement = candidates.find((element) => {
      if (!isRendered(element)) return false;
      const style = getComputedStyle(element);
      return style.whiteSpace !== 'nowrap'
        || style.overflowWrap !== 'normal'
        || style.wordBreak !== 'normal';
    });
    if (!wrappingElement) continue;

    const style = getComputedStyle(wrappingElement);
    issues.push({
      type: 'mobile-table-wrap-enabled',
      cell: describe(cell),
      element: describe(wrappingElement),
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak,
    });
  }

  return {
    viewportWidth,
    rootScrollWidth,
    bodyScrollWidth,
    issues: issues.slice(0, 40),
  };
}

function inspectSyntheticFixture() {
  const longToken = 'MobileOverflowGuard'.repeat(90);
  const fixture = document.createElement('section');
  fixture.id = 'mobile-overflow-regression-fixture';
  fixture.className = 'prose';
  fixture.style.cssText = [
    'box-sizing:border-box',
    'width:calc(100% - 32px)',
    'max-width:calc(100% - 32px)',
    'margin:0 16px',
    'padding:0',
    'position:relative',
    'z-index:1',
  ].join(';');
  fixture.innerHTML = [
    '<p data-case="plain-text">' + longToken + '</p>',
    '<p><a data-case="long-link" href="#">https://example.invalid/' + longToken + '</a></p>',
    '<p><code data-case="inline-code">' + longToken + '</code></p>',
    '<div data-case="raw-block" style="width:2000px;min-width:2000px">' + longToken + '</div>',
    '<figure data-case="figure" style="width:2000px;min-width:2000px"><figcaption>' + longToken + '</figcaption></figure>',
    '<img data-case="image" alt="" width="2000" height="80" style="width:2000px;min-width:2000px" />',
    '<video data-case="video" width="2000" height="80" style="width:2000px;min-width:2000px"></video>',
    '<audio data-case="audio" controls style="width:2000px;min-width:2000px"></audio>',
    '<iframe data-case="iframe" title="fixture" width="2000" height="80" style="width:2000px;min-width:2000px" srcdoc="<p>fixture</p>"></iframe>',
    '<object data-case="object" width="2000" height="80" style="width:2000px;min-width:2000px"></object>',
    '<embed data-case="embed" type="image/svg+xml" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%222000%22 height=%2280%22%3E%3C/svg%3E" width="2000" height="80" style="width:2000px;min-width:2000px" />',
    '<svg data-case="svg" width="2000" height="80" viewBox="0 0 2000 80" style="width:2000px;min-width:2000px"><rect width="2000" height="80"></rect></svg>',
    '<canvas data-case="canvas" width="2000" height="80" style="width:2000px;min-width:2000px"></canvas>',
    '<form data-case="form" style="width:2000px;min-width:2000px"><input data-case="input" style="width:2000px;min-width:2000px" value="' + longToken + '" /></form>',
    '<pre data-case="pre"><code>' + longToken + '</code></pre>',
    '<table data-case="table"><tbody><tr><td>' + longToken + '</td><td><code data-table-inline-code>log(0.42) ≈ -0.87</code></td></tr></tbody></table>',
    '<div class="katex-display" data-case="display-math"><span style="display:inline-block;width:2000px;min-width:2000px">x=' + longToken + '</span></div>',
    '<p><span class="katex" data-case="inline-math"><span style="display:inline-block;width:2000px;min-width:2000px">x=' + longToken + '</span></span></p>',
  ].join('');
  document.body.appendChild(fixture);

  const tolerance = 1;
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const fixtureRect = fixture.getBoundingClientRect();
  const issues = [];
  const scrollCases = new Set(['pre', 'table', 'display-math', 'inline-math']);
  const nativeInnerScrollCases = new Set(['input']);

  for (const element of fixture.querySelectorAll('[data-case]')) {
    const name = element.dataset.case;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      issues.push({ type: 'fixture-element-not-rendered', case: name });
      continue;
    }
    if (rect.left < fixtureRect.left - tolerance || rect.right > fixtureRect.right + tolerance) {
      issues.push({
        type: 'fixture-element-outside-container',
        case: name,
        fixtureLeft: fixtureRect.left,
        fixtureRight: fixtureRect.right,
        left: rect.left,
        right: rect.right,
      });
    }

    if (scrollCases.has(name)) {
      const overflowX = getComputedStyle(element).overflowX;
      if (overflowX !== 'auto' && overflowX !== 'scroll') {
        issues.push({ type: 'fixture-scroll-container-missing', case: name, overflowX });
      }
      if (element.scrollWidth <= element.clientWidth + tolerance) {
        issues.push({
          type: 'fixture-scroll-content-not-covered',
          case: name,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        });
      }
      if (name === 'inline-math') {
        const style = getComputedStyle(element);
        const scrollbarStyle = getComputedStyle(element, '::-webkit-scrollbar');
        if (
          style.scrollbarWidth !== 'none'
          || (scrollbarStyle.display !== 'none' && scrollbarStyle.height !== '0px')
        ) {
          issues.push({
            type: 'fixture-inline-math-scrollbar-visible',
            scrollbarWidth: style.scrollbarWidth,
            webkitScrollbarDisplay: scrollbarStyle.display,
            webkitScrollbarHeight: scrollbarStyle.height,
          });
        }
      }
    } else if (
      !nativeInnerScrollCases.has(name)
      && element.scrollWidth > element.clientWidth + tolerance
    ) {
      issues.push({
        type: 'fixture-uncontained-width',
        case: name,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      });
    }
  }

  const tableInlineCode = fixture.querySelector('[data-table-inline-code]');
  const tableInlineCodeStyle = getComputedStyle(tableInlineCode);
  if (
    tableInlineCodeStyle.whiteSpace !== 'nowrap'
    || tableInlineCodeStyle.overflowWrap !== 'normal'
    || tableInlineCodeStyle.wordBreak !== 'normal'
  ) {
    issues.push({
      type: 'fixture-table-inline-code-wrap-enabled',
      whiteSpace: tableInlineCodeStyle.whiteSpace,
      overflowWrap: tableInlineCodeStyle.overflowWrap,
      wordBreak: tableInlineCodeStyle.wordBreak,
    });
  }

  const rootScrollWidth = document.documentElement.scrollWidth;
  const bodyScrollWidth = document.body.scrollWidth;
  if (rootScrollWidth > viewportWidth + tolerance) {
    issues.push({ type: 'fixture-root-overflow', viewportWidth, rootScrollWidth });
  }
  if (bodyScrollWidth > viewportWidth + tolerance) {
    issues.push({ type: 'fixture-body-overflow', viewportWidth, bodyScrollWidth });
  }

  fixture.remove();
  return {
    viewportWidth,
    rootScrollWidth,
    bodyScrollWidth,
    issues,
  };
}

async function discoverRoutes(baseUrl) {
  const seeds = [];
  for (const lang of ['zh', 'en']) {
    for (const path of ['/', '/about/', '/admin/', '/blog/', '/cv/', '/links/', '/projects/']) {
      seeds.push('/' + lang + path);
    }
  }

  const queue = [...seeds];
  const queued = new Set(queue);
  const routes = new Set();

  while (queue.length > 0) {
    if (queued.size > MAX_DISCOVERED_ROUTES) {
      throw new Error('站内路由超过安全上限 ' + MAX_DISCOVERED_ROUTES + '，请检查链接循环。');
    }

    const path = queue.shift();
    let response;
    try {
      response = await fetch(baseUrl + path, { redirect: 'follow' });
    } catch {
      continue;
    }
    if (!response.ok) continue;

    const finalUrl = new URL(response.url);
    const normalizedPath = normalizeRoute(finalUrl.pathname);
    if (!isAuditableRoute(normalizedPath)) continue;
    routes.add(normalizedPath);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) continue;
    const html = await response.text();

    for (const href of extractHrefs(html)) {
      let url;
      try {
        url = new URL(href, baseUrl + normalizedPath);
      } catch {
        continue;
      }
      if (url.origin !== baseUrl) continue;
      const candidate = normalizeRoute(url.pathname);
      if (!isAuditableRoute(candidate) || queued.has(candidate)) continue;
      queued.add(candidate);
      queue.push(candidate);
    }
  }

  return [...routes].sort();
}

function extractHrefs(html) {
  const hrefs = [];
  const pattern = /href\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(pattern)) {
    hrefs.push(decodeHtmlAttribute(match[2]));
  }
  return hrefs;
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function normalizeRoute(pathname) {
  if (pathname === '/') return pathname;
  return pathname.endsWith('/') ? pathname : pathname + '/';
}

function isAuditableRoute(pathname) {
  if (!pathname.startsWith('/zh/') && !pathname.startsWith('/en/')) return false;
  return !/\.(?:css|js|mjs|json|xml|txt|png|jpe?g|gif|webp|svg|ico|pdf|zip|woff2?)\/$/i.test(pathname);
}

function parseWidths(value) {
  if (!value) return null;
  const widths = value.split(',').map(Number).filter((width) => Number.isInteger(width) && width > 0);
  return widths.length > 0 ? widths : null;
}

function parseRoutes(value) {
  if (!value) return null;
  const routes = value
    .split(',')
    .map(route => normalizeRoute(route.trim()))
    .filter(isAuditableRoute);
  return routes.length > 0 ? [...new Set(routes)] : null;
}

function findEdgeExecutable() {
  const candidates = [
    process.env.MOBILE_OVERFLOW_EDGE,
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function captureProcessOutput(child) {
  let output = '';
  const append = (chunk) => {
    output += chunk.toString();
    if (output.length > 8_000) output = output.slice(-8_000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return () => output;
}

async function waitForHttp(url, timeoutMs, child, readOutput = () => '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error('子进程提前退出: ' + url + '\n' + readOutput());
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the deadline.
    }
    await delay(200);
  }
  throw new Error('等待服务超时: ' + url + '\n' + readOutput());
}

async function findAvailablePort(preferred, excluded = new Set()) {
  for (let port = preferred; port <= 65_535; port += 1) {
    if (excluded.has(port)) continue;
    if (await canListen(port)) return port;
  }
  throw new Error('从端口 ' + preferred + ' 开始没有找到可用端口。');
}

function canListen(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen({ host: HOST, port }, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function shutdown(state) {
  if (state.cdpOrigin) await closeEdgeGracefully(state.cdpOrigin);
  if (state.edge?.exitCode === null) state.edge.kill();
  if (state.astro?.exitCode === null) {
    state.astro.kill();
    await Promise.race([once(state.astro, 'exit').catch(() => {}), delay(2_000)]);
    if (state.astro.exitCode === null) state.astro.kill('SIGKILL');
  }
  if (state.profileDir) await removeTemporaryProfile(state.profileDir);
}

async function closeEdgeGracefully(cdpOrigin) {
  try {
    const version = await (await fetch(cdpOrigin + '/json/version')).json();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', rejectPromise, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await delay(300);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  } catch {
    // Edge may already be closed.
  }
}

async function removeTemporaryProfile(profileDir) {
  const tempRoot = resolve(tmpdir());
  const target = resolve(profileDir);
  const safe = target.startsWith(tempRoot + sep)
    && basename(target).startsWith(PROFILE_PREFIX);
  if (!safe) throw new Error('拒绝清理非预期目录: ' + target);
  await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error('[mobile-overflow] ' + (error.stack || error.message));
    process.exitCode = 1;
  });
