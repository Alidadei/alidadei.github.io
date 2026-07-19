const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9228';
const baseUrl = process.env.TOC_BASE_URL || 'http://127.0.0.1:4321';
const pagePath = process.env.TOC_PAGE_PATH || '/zh/blog/llm-post-training-basics-and-jargon/';

const viewports = [
  { name: 'desktop', width: 1280, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

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

async function inspectViewport(viewport) {
  const targetResponse = await fetch(
    `${cdpBase}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  );
  if (!targetResponse.ok) throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);

  const target = await targetResponse.json();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);

  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await client.send('Page.navigate', { url: `${baseUrl}${pagePath}` });
    await client.send('Runtime.evaluate', {
      expression: `new Promise(resolve => {
        const finish = () => setTimeout(resolve, 900);
        if (document.readyState === 'complete') finish();
        else window.addEventListener('load', finish, { once: true });
      })`,
      awaitPromise: true,
    });

    const evaluation = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const prose = document.querySelector('.prose');
        const track = document.getElementById('toc-track');
        const indicator = document.getElementById('toc-active-indicator');
        const button = document.getElementById('toc-mobile-btn');
        const ring = document.getElementById('toc-mobile-progress');
        const ringValue = document.getElementById('toc-mobile-progress-value');
        if (!prose || !track || !indicator || !button || !ring || !ringValue) {
          return { error: 'Required reading-progress element is missing' };
        }

        const header = document.querySelector('header') || document.querySelector('nav');
        const scrollOffset = (header ? header.getBoundingClientRect().height : 0) + 24;
        const initialProseRect = prose.getBoundingClientRect();
        const proseTop = initialProseRect.top + window.scrollY;
        const proseBottom = initialProseRect.bottom + window.scrollY;
        const readingStart = proseTop - scrollOffset;
        const readingEnd = proseBottom - window.innerHeight;
        const readingDistance = readingEnd - readingStart;
        const expectedProgresses = [0, 0.25, 0.5, 0.75, 1];

        const settle = () => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 160)));
        });
        const clamp = value => Math.min(Math.max(value, 0), 1);

        async function sampleAt(expectedProgress) {
          const requestedScrollY = readingStart + readingDistance * expectedProgress;
          window.scrollTo({ top: requestedScrollY, behavior: 'auto' });
          await settle();

          const trackHeight = track.clientHeight;
          const indicatorHeight = indicator.getBoundingClientRect().height;
          const dashOffset = Number.parseFloat(getComputedStyle(ringValue).strokeDashoffset);
          return {
            expectedProgress,
            requestedScrollY,
            actualScrollY: window.scrollY,
            dataProgress: Number(indicator.dataset.progress),
            ringDataProgress: Number(ringValue.dataset.progress),
            indicatorRatio: trackHeight > 0 ? indicatorHeight / trackHeight : null,
            ringProgress: Number.isFinite(dashOffset) ? 1 - dashOffset : null,
          };
        }

        const samples = [];
        for (const expectedProgress of expectedProgresses) {
          samples.push(await sampleAt(expectedProgress));
        }

        const headings = [...prose.querySelectorAll('h2, h3, h4')];
        const lastHeading = headings.at(-1);
        let lastHeadingSample = null;
        if (lastHeading) {
          const lastHeadingTop = lastHeading.getBoundingClientRect().top + window.scrollY;
          const lastHeadingScrollY = lastHeadingTop - scrollOffset;
          window.scrollTo({ top: lastHeadingScrollY, behavior: 'auto' });
          await settle();
          lastHeadingSample = {
            expectedProgress: clamp((lastHeadingScrollY - readingStart) / readingDistance),
            dataProgress: Number(indicator.dataset.progress),
            activeText: document.querySelector('#toc-nav .toc-link.is-active')?.textContent?.trim() || null,
            lastHeadingText: lastHeading.textContent?.trim() || null,
          };
        }

        const buttonRect = button.getBoundingClientRect();
        const ringRect = ring.getBoundingClientRect();
        const ringValueStyle = getComputedStyle(ringValue);
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          readingStart,
          readingEnd,
          readingDistance,
          samples,
          lastHeadingSample,
          mobileGeometry: {
            buttonDisplay: getComputedStyle(button).display,
            button: { left: buttonRect.left, right: buttonRect.right, top: buttonRect.top, bottom: buttonRect.bottom },
            ring: { left: ringRect.left, right: ringRect.right, top: ringRect.top, bottom: ringRect.bottom },
            ringStroke: {
              width: ringValueStyle.strokeWidth,
              linecap: ringValueStyle.strokeLinecap,
              filter: ringValueStyle.filter,
              transitionDuration: ringValueStyle.transitionDuration,
            },
          },
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

const near = (actual, expected, tolerance = 0.025) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const results = [];
for (const viewport of viewports) {
  try {
    const details = await inspectViewport(viewport);
    const errors = [];

    if (details.error) {
      errors.push(details.error);
    } else {
      if (!(details.readingDistance > 0)) errors.push(`reading distance is ${details.readingDistance}`);
      for (const sample of details.samples) {
        if (!near(sample.dataProgress, sample.expectedProgress)) {
          errors.push(`data progress ${sample.dataProgress} at expected ${sample.expectedProgress}`);
        }
        if (!near(sample.ringDataProgress, sample.expectedProgress)) {
          errors.push(`ring data progress ${sample.ringDataProgress} at expected ${sample.expectedProgress}`);
        }
        if (viewport.name === 'desktop' && !near(sample.indicatorRatio, sample.expectedProgress)) {
          errors.push(`indicator ratio ${sample.indicatorRatio} at expected ${sample.expectedProgress}`);
        }
        if (viewport.name === 'mobile' && !near(sample.ringProgress, sample.expectedProgress, 0.035)) {
          errors.push(`ring progress ${sample.ringProgress} at expected ${sample.expectedProgress}`);
        }
      }

      const lastHeading = details.lastHeadingSample;
      if (lastHeading && !near(lastHeading.dataProgress, lastHeading.expectedProgress)) {
        errors.push(`last heading progress ${lastHeading.dataProgress}, expected ${lastHeading.expectedProgress}`);
      }
      if (lastHeading?.expectedProgress < 0.975 && lastHeading.dataProgress >= 0.99) {
        errors.push('progress is full at the last heading before the article is finished');
      }

      if (viewport.name === 'mobile') {
        const { button, ring, ringStroke, buttonDisplay } = details.mobileGeometry;
        if (buttonDisplay === 'none') errors.push('mobile TOC button is hidden');
        if (!(ring.left < button.left && ring.right > button.right && ring.top < button.top && ring.bottom > button.bottom)) {
          errors.push('mobile progress ring does not surround the TOC button');
        }
        const buttonCenterX = (button.left + button.right) / 2;
        const buttonCenterY = (button.top + button.bottom) / 2;
        const ringCenterX = (ring.left + ring.right) / 2;
        const ringCenterY = (ring.top + ring.bottom) / 2;
        if (!near(ringCenterX, buttonCenterX, 0.1) || !near(ringCenterY, buttonCenterY, 0.1)) {
          errors.push(`mobile progress ring center is (${ringCenterX}, ${ringCenterY}), button center is (${buttonCenterX}, ${buttonCenterY})`);
        }
        if (ringStroke.width !== '1px') errors.push(`mobile progress stroke width is ${ringStroke.width}`);
        if (ringStroke.linecap !== 'butt') errors.push(`mobile progress stroke linecap is ${ringStroke.linecap}`);
        if (ringStroke.filter !== 'none') errors.push(`mobile progress stroke filter is ${ringStroke.filter}`);
        if (ringStroke.transitionDuration !== '0s') {
          errors.push(`mobile progress transition duration is ${ringStroke.transitionDuration}`);
        }
      }
    }

    results.push({ viewport: viewport.name, pass: errors.length === 0, errors, details });
  } catch (error) {
    results.push({
      viewport: viewport.name,
      pass: false,
      errors: [error instanceof Error ? error.message : String(error)],
    });
  }
}

const failures = results.filter(result => !result.pass);
console.log(JSON.stringify({
  checked: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  results,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
