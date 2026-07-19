const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9227';
const baseUrl = process.env.TOC_BASE_URL || 'http://127.0.0.1:4321';
const pagePath = process.env.TOC_PAGE_PATH || '/zh/blog/llm-post-training-basics-and-jargon/';
const injectedCss = process.env.TOC_INJECT_CSS || '';
const width = Number(process.env.TOC_DESKTOP_WIDTH || 1280);
const height = Number(process.env.TOC_DESKTOP_HEIGHT || 720);

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

const targetResponse = await fetch(
  `${cdpBase}/json/new?${encodeURIComponent('about:blank')}`,
  { method: 'PUT' },
);
if (!targetResponse.ok) throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);

const target = await targetResponse.json();
const client = await CdpClient.connect(target.webSocketDebuggerUrl);

async function evaluate(expression, awaitPromise = false) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  return result.result.value;
}

const readStateExpression = `(() => {
  const root = document.documentElement;
  const body = document.body;
  const rootStyle = getComputedStyle(root);
  const bodyStyle = getComputedStyle(body);
  const scrollingElement = document.scrollingElement;
  const pointed = document.elementFromPoint(${Math.round(width * 0.4)}, ${Math.round(height * 0.7)});
  return {
    scrollY: window.scrollY,
    scrollingElement: scrollingElement?.tagName || null,
    scrollTop: scrollingElement?.scrollTop || 0,
    scrollHeight: scrollingElement?.scrollHeight || 0,
    clientHeight: scrollingElement?.clientHeight || 0,
    rootOverflowX: rootStyle.overflowX,
    rootOverflowY: rootStyle.overflowY,
    bodyOverflowX: bodyStyle.overflowX,
    bodyOverflowY: bodyStyle.overflowY,
    rootScrollHeight: root.scrollHeight,
    bodyScrollHeight: body.scrollHeight,
    pointedElement: pointed?.tagName || null,
    pointedClass: typeof pointed?.className === 'string' ? pointed.className : '',
  };
})()`;

try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await client.send('Page.navigate', { url: `${baseUrl}${pagePath}` });
  await evaluate(`new Promise(resolve => {
    const finish = () => setTimeout(resolve, 900);
    if (document.readyState === 'complete') finish();
    else window.addEventListener('load', finish, { once: true });
  })`, true);

  if (injectedCss) {
    await evaluate(`(() => {
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(injectedCss)};
      document.head.appendChild(style);
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`, true);
  }

  await client.send('Page.bringToFront');
  const states = [await evaluate(readStateExpression)];
  for (let index = 0; index < 5; index++) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.round(width * 0.4),
      y: Math.round(height * 0.7),
      deltaX: 0,
      deltaY: 500,
    });
    await evaluate('new Promise(resolve => setTimeout(resolve, 150))', true);
    states.push(await evaluate(readStateExpression));
  }

  const first = states[0];
  const last = states.at(-1);
  const passed = last.scrollY > first.scrollY + 100;
  console.log(JSON.stringify({
    url: `${baseUrl}${pagePath}`,
    viewport: { width, height },
    injectedCss: injectedCss || null,
    scrollPositions: states.map(state => state.scrollY),
    initialState: first,
    finalState: last,
    passed,
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  client.close();
  await fetch(`${cdpBase}/json/close/${target.id}`).catch(() => {});
}
