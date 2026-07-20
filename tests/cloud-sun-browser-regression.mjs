import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ASTRO_CLI = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const PROFILE_PREFIX = 'alidadei-cloud-sun-test-';
const HOST = '127.0.0.1';

const fixedTimeInjection = String.raw`(() => {
  const RealDate = Date;
  const readMinutes = () => {
    try {
      const stored = localStorage.getItem('__cloudSunTestMinutes');
      if (stored === null) return 840;
      const value = Number(stored);
      return Number.isFinite(value) ? value : 840;
    } catch {
      return 840;
    }
  };
  const timestamp = () => {
    const value = new RealDate();
    value.setHours(0, 0, 0, 0);
    return value.getTime() + readMinutes() * 60_000;
  };
  function FixedDate(...args) {
    if (!new.target) return new RealDate(timestamp()).toString();
    return args.length ? new RealDate(...args) : new RealDate(timestamp());
  }
  FixedDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(FixedDate, RealDate);
  FixedDate.now = timestamp;
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  Object.defineProperty(window, 'Date', { configurable: true, writable: true, value: FixedDate });

  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (handler, delay, ...args) =>
    realSetInterval(handler, Number(delay) >= 30_000 ? 120 : delay, ...args);
})();`;

const diagnosticsExpression = String.raw`(() => {
  const layer = document.querySelector('[data-sun-depth-layer]');
  const marker = document.querySelector('[aria-hidden="true"][style*="visibility: hidden"]');
  const frame = document.getElementById('bg-3d');
  if (!layer || !marker || !frame) return null;
  const layerRect = layer.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const polygons = Array.from(document.querySelectorAll('#sun-cloud-depth-mask polygon'));
  const globalPolygons = polygons.map((polygon) => {
    const points = polygon.getAttribute('points')?.trim() ?? '';
    return points ? points.split(/\s+/).map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x + layerRect.left, y: y + layerRect.top };
    }) : [];
  });
  const disc = layer.lastElementChild;
  const glow = layer.firstElementChild;
  const discRect = disc?.getBoundingClientRect();
  const glowRect = glow?.getBoundingClientRect();
  return {
    synced: layer.dataset.depthSynced === 'true',
    scrollY: window.scrollY,
    frameReady: frame.contentDocument?.readyState ?? null,
    layer: { left: layerRect.left, top: layerRect.top, width: layerRect.width, height: layerRect.height },
    center: { x: layerRect.left + layerRect.width / 2, y: layerRect.top + layerRect.height / 2 },
    marker: { x: markerRect.left, y: markerRect.top },
    disc: discRect ? {
      left: discRect.left,
      top: discRect.top,
      width: discRect.width,
      height: discRect.height,
      background: disc.style.background,
      boxShadow: disc.style.boxShadow,
    } : null,
    glow: glowRect ? {
      width: glowRect.width,
      height: glowRect.height,
      background: glow.style.background,
    } : null,
    mask: getComputedStyle(layer).maskImage || getComputedStyle(layer).webkitMaskImage,
    polygons: globalPolygons,
  };
})()`;

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
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

  send(method, params = {}, timeoutMs = 15_000) {
    return new Promise((resolvePromise, rejectPromise) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await check();
      if (lastValue) return lastValue;
    } catch {
      // Navigation can temporarily invalidate the execution context.
    }
    await delay(150);
  }
  throw new Error(`${label} timed out; last value: ${JSON.stringify(lastValue)}`);
}

async function findPort(preferred) {
  for (let port = preferred; port < preferred + 100; port += 1) {
    const available = await new Promise((resolvePromise) => {
      const server = createServer();
      server.once('error', () => resolvePromise(false));
      server.listen({ host: HOST, port }, () => server.close(() => resolvePromise(true)));
    });
    if (available) return port;
  }
  throw new Error(`No free port near ${preferred}.`);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToPolygonBoundary(point, polygon) {
  let distance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    distance = Math.min(distance, Math.hypot(
      point.x - (start.x + ratio * dx),
      point.y - (start.y + ratio * dy),
    ));
  }
  return distance;
}

function distanceToPolygon(point, polygon) {
  return pointInPolygon(point, polygon) ? 0 : distanceToPolygonBoundary(point, polygon);
}

function polygonCenter(polygon) {
  return polygon.reduce((center, point) => ({
    x: center.x + point.x / polygon.length,
    y: center.y + point.y / polygon.length,
  }), { x: 0, y: 0 });
}

function discCoverage(center, radius, polygons) {
  let covered = 0;
  let samples = 0;
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      samples += 1;
      const point = { x: center.x + dx, y: center.y + dy };
      if (polygons.some((polygon) => polygon.length >= 3 && pointInPolygon(point, polygon))) {
        covered += 1;
      }
    }
  }
  return covered / samples;
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function adjustCameraVertical(client, deltaVertical) {
  const deltaY = -deltaVertical / 0.003;
  await evaluate(client, `(() => {
    const target = document.getElementById('bg-3d')?.contentWindow;
    const scene = target?.document.getElementById('scene3d');
    if (!target || !scene) return false;
    scene.dispatchEvent(new target.MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    target.dispatchEvent(new target.MouseEvent('mousemove', { clientX: 0, clientY: ${deltaY} }));
    target.dispatchEvent(new target.MouseEvent('mouseup'));
    return true;
  })()`);
  await delay(400);
}

async function main() {
  assert.equal(process.platform, 'win32', 'This visual regression uses Microsoft Edge on Windows.');
  const edgePath = [
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((candidate) => candidate && existsSync(candidate));
  assert.ok(edgePath, 'Microsoft Edge executable was not found.');

  await build({
    absWorkingDir: PROJECT_ROOT,
    entryPoints: ['src/3d/background.ts'],
    bundle: true,
    format: 'esm',
    outfile: 'public/three-bg.js',
    logLevel: 'silent',
  });

  const webPort = await findPort(4420);
  const cdpPort = await findPort(9240);
  const profileDir = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
  const astro = spawn(process.execPath, [ASTRO_CLI, 'dev', '--host', HOST, '--port', String(webPort)], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { cwd: PROJECT_ROOT, stdio: 'ignore', windowsHide: true });

  let client;
  try {
    const previewUrl = `http://${HOST}:${webPort}/zh/?cloud-sun-test=1`;
    await waitFor(async () => {
      const response = await fetch(previewUrl, { cache: 'no-store' });
      return response.ok;
    }, 30_000, 'Astro server');
    const version = await waitFor(
      () => fetchJson(`http://${HOST}:${cdpPort}/json/version`),
      20_000,
      'Edge CDP',
    );
    const pages = await fetchJson(`http://${HOST}:${cdpPort}/json/list`);
    const page = pages.find((target) => target.type === 'page');
    assert.ok(page);
    client = await CdpClient.connect(page.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: fixedTimeInjection });
    await client.send('Page.navigate', { url: previewUrl });

    const initial = await waitFor(async () => {
      const value = await evaluate(client, diagnosticsExpression);
      return value?.synced && value.frameReady === 'complete' && value.polygons.length === 10
        ? value
        : null;
    }, 30_000, 'sun/cloud depth synchronization');

    assert.ok(Math.abs(initial.center.x - initial.marker.x) < 0.75);
    assert.ok(Math.abs(initial.center.y - initial.marker.y) < 0.75);
    assert.equal(initial.disc.width, 16);
    assert.equal(initial.disc.height, 16);
    assert.match(initial.disc.background, /radial-gradient/);
    assert.match(initial.disc.background, /rgb\(255, 248, 224\)/);
    assert.match(initial.disc.background, /rgb\(255, 224, 144\)/);
    assert.match(initial.disc.boxShadow, /rgba/);
    assert.match(initial.glow.background, /radial-gradient/);
    const initialAltitude = Math.sin((14 - 5.5) / (18.5 - 5.5) * Math.PI);
    assert.ok(Math.abs(initial.glow.width - (60 + 40 * initialAltitude)) < 0.05);
    assert.notEqual(initial.mask, 'none');

    await evaluate(client, `(() => {
      const spacer = document.createElement('div');
      spacer.id = '__cloud-sun-scroll-spacer';
      spacer.style.height = '1600px';
      document.body.appendChild(spacer);
      window.scrollTo(0, 500);
      localStorage.setItem('__cloudSunTestMinutes', '841');
    })()`);
    await delay(350);
    const scrolled = await evaluate(client, diagnosticsExpression);
    assert.ok(scrolled.scrollY >= 400);
    assert.ok(Math.abs(scrolled.center.y - initial.center.y) < 5);
    await evaluate(client, `(() => {
      document.getElementById('__cloud-sun-scroll-spacer')?.remove();
      window.scrollTo(0, 0);
      localStorage.setItem('__cloudSunTestMinutes', '840');
    })()`);
    await delay(300);

    let overlap = null;
    let closest = { distance: Infinity, minutes: null, point: null, polygons: null };
    const defaultTimeSamples = [
      ...Array.from({ length: 61 }, (_, index) => 5 * 60 + 30 + index * 2),
      ...Array.from({ length: 61 }, (_, index) => 16 * 60 + 30 + index * 2),
    ];
    for (const minutes of defaultTimeSamples) {
      await evaluate(client, `localStorage.setItem('__cloudSunTestMinutes', '${minutes}')`);
      await delay(160);
      const value = await evaluate(client, diagnosticsExpression);
      if (!value?.disc) continue;
      const discCenter = {
        x: value.disc.left + value.disc.width / 2,
        y: value.disc.top + value.disc.height / 2,
      };
      const nearest = Math.min(...value.polygons
        .filter((polygon) => polygon.length >= 3)
        .map((polygon) => distanceToPolygon(discCenter, polygon)));
      if (nearest < closest.distance) {
        closest = { distance: nearest, minutes, point: discCenter, polygons: value.polygons };
      }
      const coverage = discCoverage(discCenter, 7, value.polygons);
      if (coverage >= 0.15 && coverage <= 0.85) {
        overlap = { minutes, vertical: 0.35, coverage, value };
        break;
      }
    }

    if (!overlap && closest.minutes !== null) {
      await evaluate(client, `localStorage.setItem('__cloudSunTestMinutes', '${closest.minutes}')`);
      await delay(300);
      let currentVertical = 0.35;
      const verticalSamples = Array.from({ length: 35 }, (_, index) => 0.36 + index * 0.01);
      for (const vertical of verticalSamples) {
        await adjustCameraVertical(client, vertical - currentVertical);
        currentVertical = vertical;
        const value = await evaluate(client, diagnosticsExpression);
        const discCenter = {
          x: value.disc.left + value.disc.width / 2,
          y: value.disc.top + value.disc.height / 2,
        };
        const nearest = Math.min(...value.polygons
          .filter((polygon) => polygon.length >= 3)
          .map((polygon) => distanceToPolygon(discCenter, polygon)));
        if (nearest < closest.distance) {
          closest = { distance: nearest, minutes: closest.minutes, point: discCenter, polygons: value.polygons };
        }
        const coverage = discCoverage(discCenter, 7, value.polygons);
        if (coverage >= 0.15 && coverage <= 0.85) {
          overlap = { minutes: closest.minutes, vertical, coverage, value };
          break;
        }
      }
    }
    assert.ok(overlap, `The sun path never crossed a cloud silhouette. Closest: ${JSON.stringify(closest)}`);

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const screenshotPath = join(PROJECT_ROOT, 'record', 'cloud-sun-occlusion-edge.png');
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    const beforePitch = overlap.value;
    const pitchKey = overlap.vertical >= 0.6 ? 'w' : 's';
    await evaluate(client, `(() => {
      const target = document.getElementById('bg-3d')?.contentWindow;
      target?.dispatchEvent(new target.KeyboardEvent('keydown', { key: '${pitchKey}' }));
      setTimeout(() => target?.dispatchEvent(new target.KeyboardEvent('keyup', { key: '${pitchKey}' })), 650);
    })()`);
    await delay(1300);
    const afterPitch = await evaluate(client, diagnosticsExpression);
    const beforeCloud = polygonCenter(beforePitch.polygons[0]);
    const afterCloud = polygonCenter(afterPitch.polygons[0]);
    const sunDeltaY = afterPitch.center.y - beforePitch.center.y;
    const cloudDeltaY = afterCloud.y - beforeCloud.y;
    assert.ok(Math.abs(sunDeltaY) > 1);
    assert.equal(Math.sign(sunDeltaY), Math.sign(cloudDeltaY));

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.send('Page.navigate', { url: previewUrl });
    const mobile = await waitFor(async () => {
      const value = await evaluate(client, diagnosticsExpression);
      return value?.synced && value.frameReady === 'complete' && value.polygons.length === 10
        ? value
        : null;
    }, 30_000, 'mobile sun/cloud depth synchronization');
    assert.ok(Math.abs(mobile.center.x - mobile.marker.x) < 0.75);
    assert.ok(Math.abs(mobile.center.y - mobile.marker.y) < 0.75);
    assert.equal(mobile.disc.width, 16);
    assert.notEqual(mobile.mask, 'none');
    const mobileScreenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const mobileScreenshotPath = join(PROJECT_ROOT, 'record', 'cloud-sun-mobile-edge.png');
    await writeFile(mobileScreenshotPath, Buffer.from(mobileScreenshot.data, 'base64'));

    console.log(JSON.stringify({
      defaultCenterError: {
        x: initial.center.x - initial.marker.x,
        y: initial.center.y - initial.marker.y,
      },
      overlapMinutes: overlap.minutes,
      overlapVertical: overlap.vertical,
      overlapCoverage: overlap.coverage,
      overlapCenter: overlap.value.center,
      sunDeltaY,
      cloudDeltaY,
      mobileCenterError: {
        x: mobile.center.x - mobile.marker.x,
        y: mobile.center.y - mobile.marker.y,
      },
      screenshotPath,
      mobileScreenshotPath,
      cdpBrowser: version.Browser,
    }, null, 2));
  } finally {
    client?.close();
    if (edge.exitCode === null) edge.kill();
    if (astro.exitCode === null) astro.kill();
    await delay(500);
    const target = resolve(profileDir);
    const tempRoot = resolve(tmpdir());
    if (target.startsWith(`${tempRoot}${sep}`) && basename(target).startsWith(PROFILE_PREFIX)) {
      await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
    }
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
