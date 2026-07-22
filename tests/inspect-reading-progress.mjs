import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { calculateVisibleRingProgress } from '../src/lib/reading-progress.mjs';

const cdpBase = process.env.CDP_URL || 'http://127.0.0.1:9228';
const baseUrl = process.env.TOC_BASE_URL || 'http://127.0.0.1:4321';
const pagePath = process.env.TOC_PAGE_PATH || '/zh/blog/llm-post-training-basics-and-jargon/';
const screenshotDir = process.env.TOC_SCREENSHOT_DIR || '';
const landmarkHeadingText = 'Reward model 与偏好概率';
const requiresLandmarkHeading = pagePath.includes('/llm-post-training-basics-and-jargon/');

const viewports = [
  { name: 'desktop', width: 1280, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  {
    name: 'mobile-visual-viewport',
    width: 390,
    height: 844,
    mobile: true,
    visualHeight: 600,
    visualOffsetTop: 200,
  },
].filter(viewport => !process.env.TOC_VIEWPORT || viewport.name === process.env.TOC_VIEWPORT);

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
    if (viewport.visualHeight) {
      await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          let visualHeight = ${viewport.visualHeight};
          let visualOffsetTop = ${viewport.visualOffsetTop ?? 0};
          const emulatedVisualViewport = new EventTarget();
          Object.defineProperties(emulatedVisualViewport, {
            height: { get: () => visualHeight },
            width: { get: () => window.innerWidth },
            pageTop: { get: () => window.scrollY + visualOffsetTop },
            pageLeft: { get: () => window.scrollX },
            offsetTop: { get: () => visualOffsetTop },
            offsetLeft: { get: () => 0 },
            scale: { get: () => 1 },
          });
          Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            get: () => emulatedVisualViewport,
          });
          window.__setReadingProgressVisualViewport = (nextHeight, nextOffsetTop) => {
            visualHeight = nextHeight;
            visualOffsetTop = nextOffsetTop;
            emulatedVisualViewport.dispatchEvent(new Event('resize'));
            emulatedVisualViewport.dispatchEvent(new Event('scroll'));
          };
        })();`,
      });
    }
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
        const visualViewport = window.visualViewport;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
        const documentHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        );
        const maximumViewportTop = Math.max(
          documentHeight - window.innerHeight + viewportOffsetTop,
          0,
        );
        const readingStart = proseTop - scrollOffset;
        const readingEnd = Math.min(proseBottom - scrollOffset, maximumViewportTop);
        const readingDistance = readingEnd - readingStart;
        const ringLength = ringValue.getTotalLength();
        const expectedProgresses = [0, 0.25, 0.5, 0.75, 1];

        const settle = () => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 160)));
        });
        const clamp = value => Math.min(Math.max(value, 0), 1);

        async function sampleAt(expectedProgress) {
          const targetViewportTop = readingStart + readingDistance * expectedProgress;
          const requestedScrollY = targetViewportTop - (window.visualViewport?.offsetTop ?? 0);
          window.scrollTo({ top: requestedScrollY, behavior: 'auto' });
          await settle();

          const trackHeight = track.clientHeight;
          const indicatorHeight = indicator.getBoundingClientRect().height;
          const dashOffset = Number.parseFloat(getComputedStyle(ringValue).strokeDashoffset);
          return {
            expectedProgress,
            requestedScrollY,
            actualScrollY: window.scrollY,
            actualViewportTop: window.visualViewport?.pageTop ?? window.scrollY,
            dataProgress: Number(indicator.dataset.progress),
            ringDataProgress: Number(ringValue.dataset.progress),
            indicatorRatio: trackHeight > 0 ? indicatorHeight / trackHeight : null,
            ringProgress: Number.isFinite(dashOffset) && ringLength > 0
              ? 1 - dashOffset / ringLength
              : null,
          };
        }

        const samples = [];
        for (const expectedProgress of expectedProgresses) {
          samples.push(await sampleAt(expectedProgress));
        }

        let visualResizeSample = null;
        if (typeof window.__setReadingProgressVisualViewport === 'function') {
          const requestedViewportTop = readingStart + readingDistance * 0.5;
          const requestedScrollY = requestedViewportTop - (window.visualViewport?.offsetTop ?? 0);
          window.scrollTo({ top: requestedScrollY, behavior: 'auto' });
          await settle();
          const previousHeight = window.visualViewport.height;
          const previousOffsetTop = window.visualViewport.offsetTop;
          const nextHeight = Math.max(previousHeight - 100, 1);
          const nextOffsetTop = previousOffsetTop + 20;
          window.__setReadingProgressVisualViewport(nextHeight, nextOffsetTop);
          await settle();
          const resizedMaximumViewportTop = Math.max(
            documentHeight - window.innerHeight + nextOffsetTop,
            0,
          );
          const resizedReadingEnd = Math.min(
            proseBottom - scrollOffset,
            resizedMaximumViewportTop,
          );
          const resizedDistance = resizedReadingEnd - readingStart;
          const expectedProgress = clamp(
            ((window.visualViewport.pageTop ?? window.scrollY) - readingStart) / resizedDistance,
          );
          visualResizeSample = {
            previousHeight,
            nextHeight,
            previousOffsetTop,
            nextOffsetTop,
            expectedProgress,
            dataProgress: Number(indicator.dataset.progress),
            ringDataProgress: Number(ringValue.dataset.progress),
          };
          window.__setReadingProgressVisualViewport(previousHeight, previousOffsetTop);
          await settle();
        }

        const formerReadingEnd = proseBottom - viewportHeight;
        let prematureCompletionSample = null;
        if (formerReadingEnd < readingEnd - 1) {
          const requestedScrollY = formerReadingEnd - (window.visualViewport?.offsetTop ?? 0);
          window.scrollTo({ top: requestedScrollY, behavior: 'auto' });
          await settle();
          const dashOffset = Number.parseFloat(getComputedStyle(ringValue).strokeDashoffset);
          const ringRect = ring.getBoundingClientRect();
          const viewBoxWidth = ring.viewBox.baseVal.width;
          prematureCompletionSample = {
            formerReadingEnd,
            expectedProgress: clamp((formerReadingEnd - readingStart) / readingDistance),
            dataProgress: Number(indicator.dataset.progress),
            ringDataProgress: Number(ringValue.dataset.progress),
            visibleRingDataProgress: Number(ringValue.dataset.visibleProgress),
            ringProgress: Number.isFinite(dashOffset) && ringLength > 0
              ? 1 - dashOffset / ringLength
              : null,
            renderedGapCssPixels: Number.isFinite(dashOffset) && viewBoxWidth > 0
              ? dashOffset * ringRect.width / viewBoxWidth
              : null,
          };
        }

        const headings = [...prose.querySelectorAll('h2, h3, h4, h5, h6')];
        const landmarkHeading = headings.find(
          heading => heading.textContent?.trim().includes(${JSON.stringify(landmarkHeadingText)}),
        );
        let landmarkHeadingSample = null;
        if (landmarkHeading) {
          const landmarkTop = landmarkHeading.getBoundingClientRect().top + window.scrollY;
          const landmarkViewportTop = landmarkTop - scrollOffset;
          const requestedScrollY = landmarkViewportTop - (window.visualViewport?.offsetTop ?? 0);
          window.scrollTo({ top: requestedScrollY, behavior: 'auto' });
          await settle();
          const actualViewportTop = window.visualViewport?.pageTop ?? window.scrollY;
          const dashOffset = Number.parseFloat(getComputedStyle(ringValue).strokeDashoffset);
          landmarkHeadingSample = {
            text: landmarkHeading.textContent?.trim() || null,
            requestedScrollY,
            actualScrollY: window.scrollY,
            expectedProgress: clamp((actualViewportTop - readingStart) / readingDistance),
            dataProgress: Number(indicator.dataset.progress),
            ringDataProgress: Number(ringValue.dataset.progress),
            visibleRingDataProgress: Number(ringValue.dataset.visibleProgress),
            ringProgress: Number.isFinite(dashOffset) && ringLength > 0
              ? 1 - dashOffset / ringLength
              : null,
            activeText: document.querySelector('#toc-nav .toc-link.is-active')?.textContent?.trim() || null,
          };
        }

        const lastHeading = headings.at(-1);
        let lastHeadingSample = null;
        if (lastHeading) {
          const lastHeadingTop = lastHeading.getBoundingClientRect().top + window.scrollY;
          const lastHeadingViewportTop = lastHeadingTop - scrollOffset;
          const lastHeadingScrollY = lastHeadingViewportTop - (window.visualViewport?.offsetTop ?? 0);
          window.scrollTo({ top: lastHeadingScrollY, behavior: 'auto' });
          await settle();
          lastHeadingSample = {
            expectedProgress: clamp((lastHeadingViewportTop - readingStart) / readingDistance),
            dataProgress: Number(indicator.dataset.progress),
            activeText: document.querySelector('#toc-nav .toc-link.is-active')?.textContent?.trim() || null,
            lastHeadingText: lastHeading.textContent?.trim() || null,
          };
        }

        const buttonRect = button.getBoundingClientRect();
        const ringRect = ring.getBoundingClientRect();
        const buttonStyle = getComputedStyle(button);
        const ringValueStyle = getComputedStyle(ringValue);
        return {
          viewport: {
            width: window.innerWidth,
            layoutHeight: window.innerHeight,
            visualHeight: viewportHeight,
            visualPageTop: window.visualViewport?.pageTop ?? window.scrollY,
          },
          readingStart,
          readingEnd,
          readingDistance,
          samples,
          visualResizeSample,
          prematureCompletionSample,
          landmarkHeadingSample,
          lastHeadingSample,
          mobileGeometry: {
            buttonDisplay: getComputedStyle(button).display,
            button: { left: buttonRect.left, right: buttonRect.right, top: buttonRect.top, bottom: buttonRect.bottom },
            buttonBorder: {
              width: buttonStyle.borderTopWidth,
              style: buttonStyle.borderTopStyle,
              color: buttonStyle.borderTopColor,
            },
            buttonShadow: buttonStyle.boxShadow,
            ring: { left: ringRect.left, right: ringRect.right, top: ringRect.top, bottom: ringRect.bottom },
            ringStroke: {
              pathLength: ringLength,
              dasharray: ringValueStyle.strokeDasharray,
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

    const details = evaluation.result.value;
    if (screenshotDir && viewport.mobile) {
      await client.send('Runtime.evaluate', {
        expression: `(async () => {
          const prose = document.querySelector('.prose');
          const heading = [...(prose?.querySelectorAll('h2, h3, h4, h5, h6') || [])]
            .find(item => item.textContent?.trim().includes(${JSON.stringify(landmarkHeadingText)}));
          const header = document.querySelector('header') || document.querySelector('nav');
          const offset = (header ? header.getBoundingClientRect().height : 0) + 24;
          if (heading) {
            const top = heading.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'auto' });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 200))));
          }
        })()`,
        awaitPromise: true,
      });
      const clipEvaluation = await client.send('Runtime.evaluate', {
        expression: `(() => {
          const rect = document.getElementById('toc-mobile-progress')?.getBoundingClientRect();
          return rect ? {
            x: Math.max(rect.left + window.scrollX - 8, 0),
            y: Math.max(rect.top + window.scrollY - 8, 0),
            width: rect.width + 16,
            height: rect.height + 16,
          } : null;
        })()`,
        returnByValue: true,
      });
      const clip = clipEvaluation.result?.value;
      if (clip) {
        const screenshot = await client.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          clip: { ...clip, scale: 4 },
        });
        const screenshotPath = join(screenshotDir, `${viewport.name}-reward-model-ring.png`);
        await mkdir(screenshotDir, { recursive: true });
        await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
        details.screenshotPath = screenshotPath;
      }
    }

    return details;
  } finally {
    client.close();
    await fetch(`${cdpBase}/json/close/${target.id}`).catch(() => {});
  }
}

const near = (actual, expected, tolerance = 0.002) =>
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
        if (!viewport.mobile && !near(sample.indicatorRatio, sample.expectedProgress)) {
          errors.push(`indicator ratio ${sample.indicatorRatio} at expected ${sample.expectedProgress}`);
        }
        if (viewport.mobile && !near(sample.ringProgress, sample.expectedProgress)) {
          errors.push(`ring progress ${sample.ringProgress} at expected ${sample.expectedProgress}`);
        }
      }

      if (viewport.visualHeight && !near(details.viewport.visualHeight, viewport.visualHeight, 0.1)) {
        errors.push(`visual viewport height is ${details.viewport.visualHeight}, expected ${viewport.visualHeight}`);
      }
      const visualResize = details.visualResizeSample;
      if (visualResize) {
        if (!near(visualResize.dataProgress, visualResize.expectedProgress, 0.0005)) {
          errors.push(
            `visual resize data progress ${visualResize.dataProgress}, expected ${visualResize.expectedProgress}`,
          );
        }
        if (!near(visualResize.ringDataProgress, visualResize.expectedProgress, 0.0005)) {
          errors.push(
            `visual resize ring progress ${visualResize.ringDataProgress}, expected ${visualResize.expectedProgress}`,
          );
        }
      }
      const prematureCompletion = details.prematureCompletionSample;
      if (prematureCompletion) {
        const expectedVisibleRingProgress = calculateVisibleRingProgress(
          prematureCompletion.expectedProgress,
        );
        if (!near(prematureCompletion.dataProgress, prematureCompletion.expectedProgress)) {
          errors.push(
            `former endpoint data progress ${prematureCompletion.dataProgress}, expected ${prematureCompletion.expectedProgress}`,
          );
        }
        if (!near(prematureCompletion.ringDataProgress, prematureCompletion.expectedProgress)) {
          errors.push(
            `former endpoint ring progress ${prematureCompletion.ringDataProgress}, expected ${prematureCompletion.expectedProgress}`,
          );
        }
        if (prematureCompletion.dataProgress >= 1) {
          errors.push('progress is full when the article bottom merely enters the viewport');
        }
        if (!near(prematureCompletion.visibleRingDataProgress, expectedVisibleRingProgress)) {
          errors.push(
            `former endpoint visible ring data ${prematureCompletion.visibleRingDataProgress}, expected ${expectedVisibleRingProgress}`,
          );
        }
        if (!near(prematureCompletion.ringProgress, expectedVisibleRingProgress)) {
          errors.push(
            `former endpoint rendered ring ${prematureCompletion.ringProgress}, expected ${expectedVisibleRingProgress}`,
          );
        }
        if (viewport.mobile && prematureCompletion.renderedGapCssPixels < 1.9) {
          errors.push(
            `former endpoint ring gap is only ${prematureCompletion.renderedGapCssPixels}px`,
          );
        }
      }

      const lastHeading = details.lastHeadingSample;
      if (lastHeading && !near(lastHeading.dataProgress, lastHeading.expectedProgress)) {
        errors.push(`last heading progress ${lastHeading.dataProgress}, expected ${lastHeading.expectedProgress}`);
      }
      if (lastHeading?.expectedProgress < 0.975 && lastHeading.dataProgress >= 0.99) {
        errors.push('progress is full at the last heading before the article is finished');
      }

      const landmark = details.landmarkHeadingSample;
      if (!landmark && requiresLandmarkHeading) {
        errors.push(`landmark heading ${landmarkHeadingText} was not found`);
      } else if (landmark) {
        const expectedVisibleRingProgress = calculateVisibleRingProgress(landmark.expectedProgress);
        if (!near(landmark.dataProgress, landmark.expectedProgress)) {
          errors.push(`landmark data progress ${landmark.dataProgress}, expected ${landmark.expectedProgress}`);
        }
        if (!near(landmark.ringDataProgress, landmark.expectedProgress)) {
          errors.push(`landmark ring data ${landmark.ringDataProgress}, expected ${landmark.expectedProgress}`);
        }
        if (!near(landmark.visibleRingDataProgress, expectedVisibleRingProgress)) {
          errors.push(
            `landmark visible ring data ${landmark.visibleRingDataProgress}, expected ${expectedVisibleRingProgress}`,
          );
        }
        if (!near(landmark.ringProgress, expectedVisibleRingProgress)) {
          errors.push(`landmark rendered ring ${landmark.ringProgress}, expected ${expectedVisibleRingProgress}`);
        }
        if (landmark.dataProgress >= 1 || landmark.ringProgress >= 1) {
          errors.push('progress is full at the Reward model landmark');
        }
      }

      if (viewport.mobile) {
        const {
          button,
          buttonBorder,
          buttonShadow,
          ring,
          ringStroke,
          buttonDisplay,
        } = details.mobileGeometry;
        if (buttonDisplay === 'none') errors.push('mobile TOC button is hidden');
        if (buttonBorder.width !== '0px' && buttonBorder.style !== 'none') {
          errors.push(
            `mobile TOC button has a full ${buttonBorder.width} ${buttonBorder.style} border beneath the progress ring`,
          );
        }
        if (buttonShadow !== 'none') {
          errors.push(`mobile TOC button shadow can visually complete the progress ring: ${buttonShadow}`);
        }
        if (!(ring.left < button.left && ring.right > button.right && ring.top < button.top && ring.bottom > button.bottom)) {
          errors.push('mobile progress ring does not surround the TOC button');
        }
        const minimumOuterSeparation = Math.min(
          button.left - ring.left,
          ring.right - button.right,
          button.top - ring.top,
          ring.bottom - button.bottom,
        );
        if (minimumOuterSeparation < 1.5) {
          errors.push(`mobile progress SVG is only ${minimumOuterSeparation}px outside the menu ball`);
        }
        const buttonCenterX = (button.left + button.right) / 2;
        const buttonCenterY = (button.top + button.bottom) / 2;
        const ringCenterX = (ring.left + ring.right) / 2;
        const ringCenterY = (ring.top + ring.bottom) / 2;
        if (!near(ringCenterX, buttonCenterX, 0.1) || !near(ringCenterY, buttonCenterY, 0.1)) {
          errors.push(`mobile progress ring center is (${ringCenterX}, ${ringCenterY}), button center is (${buttonCenterX}, ${buttonCenterY})`);
        }
        if (ringStroke.width !== '1px') errors.push(`mobile progress stroke width is ${ringStroke.width}`);
        const dashLength = Number.parseFloat(ringStroke.dasharray);
        if (!near(dashLength, ringStroke.pathLength, 0.01)) {
          errors.push(`mobile progress dash length is ${dashLength}, path length is ${ringStroke.pathLength}`);
        }
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
  screenshotDir: screenshotDir || null,
  checked: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  results,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
