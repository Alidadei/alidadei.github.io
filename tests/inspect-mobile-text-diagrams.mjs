const cdpBase = process.env.CDP_URL ?? 'http://127.0.0.1:9232';
const baseUrl = process.env.DIAGRAM_BASE_URL ?? 'http://127.0.0.1:4173';
const pagePath = '/zh/blog/llm-post-training-basics-and-jargon/';
const widths = [320, 360, 390, 430];

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
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
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
if (!targetResponse.ok) throw new Error(`无法创建 Edge 调试页: ${targetResponse.status}`);

const target = await targetResponse.json();
const client = await CdpClient.connect(target.webSocketDebuggerUrl);
const failures = [];
let sawContainedOverflow = false;

try {
  await client.send('Page.enable');

  for (const width of widths) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: 844,
    });
    await client.send('Page.navigate', { url: `${baseUrl}${pagePath}` });
    await client.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const done = () => setTimeout(resolve, 350);
        if (document.readyState === 'complete') done();
        else window.addEventListener('load', done, { once: true });
      })`,
      awaitPromise: true,
    });

    const response = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const diagrams = [...document.querySelectorAll('pre[data-text-diagram]')];
        const targets = ['原始语料', '模型输出 logits'].map((prefix) => {
          const pre = diagrams.find((element) => element.textContent.trim().startsWith(prefix));
          if (!pre) return { prefix, missing: true };
          const style = getComputedStyle(pre);
          return {
            prefix,
            whiteSpace: style.whiteSpace,
            overflowX: style.overflowX,
            clientWidth: pre.clientWidth,
            scrollWidth: pre.scrollWidth,
          };
        });
        const ordinaryTextBlock = document.querySelector(
          'pre[data-language="text"]:not([data-text-diagram])',
        );
        return {
          viewportWidth: innerWidth,
          diagramCount: diagrams.length,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          ordinaryWhiteSpace: ordinaryTextBlock
            ? getComputedStyle(ordinaryTextBlock).whiteSpace
            : null,
          targets,
        };
      })()`,
      returnByValue: true,
    });

    const result = response.result.value;
    console.log(JSON.stringify(result));

    if (result.diagramCount < 2) failures.push(`${width}px: 流程图标记缺失`);
    if (result.pageOverflow > 1) failures.push(`${width}px: 页面产生 ${result.pageOverflow}px 横向溢出`);
    if (result.ordinaryWhiteSpace !== 'pre-wrap') {
      failures.push(`${width}px: 普通 text 代码块换行规则被误改`);
    }
    for (const diagram of result.targets) {
      if (diagram.missing) failures.push(`${width}px: 未找到 ${diagram.prefix}`);
      else {
        if (diagram.whiteSpace !== 'pre') failures.push(`${width}px: ${diagram.prefix} 仍会换行`);
        if (!['auto', 'scroll'].includes(diagram.overflowX)) {
          failures.push(`${width}px: ${diagram.prefix} 不可横向滚动`);
        }
        if (diagram.scrollWidth > diagram.clientWidth) sawContainedOverflow = true;
      }
    }
  }
} finally {
  await client.send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  client.close();
}

if (!sawContainedOverflow) failures.push('测试视口内没有覆盖需要块内横向滚动的流程图');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${widths.join(', ')}px 的文本流程图均保持单行结构并在块内滚动。`);
}
