import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ASTRO_CLI = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const HOST = '127.0.0.1';
const PROFILE_PREFIX = 'alidadei-sky-preview-edge-';

const injection = String.raw`(() => {
  const STORAGE_KEY = '__codexSkyPreviewMinutes';
  const RealDate = Date;

  const readMinutes = () => {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) ? Math.max(0, Math.min(1439, value)) : 0;
    } catch {
      return 0;
    }
  };

  const previewTimestamp = () => {
    const today = new RealDate();
    today.setHours(0, 0, 0, 0);
    return today.getTime() + readMinutes() * 60_000;
  };

  function PreviewDate(...args) {
    if (!new.target) return new RealDate(previewTimestamp()).toString();
    return args.length ? new RealDate(...args) : new RealDate(previewTimestamp());
  }

  PreviewDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(PreviewDate, RealDate);
  PreviewDate.now = previewTimestamp;
  PreviewDate.parse = RealDate.parse;
  PreviewDate.UTC = RealDate.UTC;
  Object.defineProperty(window, 'Date', {
    configurable: true,
    writable: true,
    value: PreviewDate,
  });

  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (handler, delay, ...args) =>
    realSetInterval(handler, Number(delay) >= 30_000 ? 120 : delay, ...args);

  if (window.top !== window) return;

  const mountControls = () => {
    if (document.getElementById('__codex-sky-preview')) return;

    try {
      localStorage.setItem(STORAGE_KEY, '0');
    } catch {}

    let minutes = 0;
    let playing = true;
    let previous = performance.now();
    let committedMinute = -1;

    const panel = document.createElement('section');
    panel.id = '__codex-sky-preview';
    panel.setAttribute('aria-label', '全天天空配色调试');
    panel.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:18px',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:12px',
      'width:min(760px,calc(100vw - 32px))',
      'box-sizing:border-box',
      'padding:12px 14px',
      'border:1px solid rgba(255,255,255,.22)',
      'border-radius:14px',
      'background:rgba(35,28,30,.88)',
      'box-shadow:0 12px 38px rgba(0,0,0,.28)',
      'backdrop-filter:blur(14px)',
      'color:#fff',
      'font:600 13px/1.2 system-ui,sans-serif',
    ].join(';');

    const label = document.createElement('output');
    label.style.cssText = 'min-width:128px;font-variant-numeric:tabular-nums;white-space:nowrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1439';
    slider.step = '1';
    slider.value = '0';
    slider.setAttribute('aria-label', '一天中的时间');
    slider.style.cssText = 'flex:1;min-width:120px;accent-color:#d2a06f;cursor:pointer';

    const buttonStyle = [
      'border:1px solid rgba(255,255,255,.28)',
      'border-radius:8px',
      'background:rgba(255,255,255,.1)',
      'color:#fff',
      'padding:7px 12px',
      'cursor:pointer',
      'font:inherit',
    ].join(';');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '暂停';
    toggle.style.cssText = buttonStyle;

    const realtime = document.createElement('button');
    realtime.type = 'button';
    realtime.textContent = '当前时刻';
    realtime.style.cssText = buttonStyle;

    const normalize = (value) => ((Math.floor(value) % 1440) + 1440) % 1440;
    const format = (value) => {
      const whole = normalize(value);
      return String(Math.floor(whole / 60)).padStart(2, '0')
        + ':'
        + String(whole % 60).padStart(2, '0');
    };

    const commit = (value) => {
      const whole = normalize(value);
      if (whole === committedMinute) return;
      committedMinute = whole;
      slider.value = String(whole);
      label.textContent = '全天预览 · ' + format(whole);
      try {
        localStorage.setItem(STORAGE_KEY, String(whole));
      } catch {}
    };

    slider.addEventListener('input', () => {
      minutes = Number(slider.value);
      playing = false;
      toggle.textContent = '播放';
      commit(minutes);
    });

    toggle.addEventListener('click', () => {
      playing = !playing;
      toggle.textContent = playing ? '暂停' : '播放';
      previous = performance.now();
    });

    realtime.addEventListener('click', () => {
      const now = new RealDate();
      minutes = now.getHours() * 60 + now.getMinutes();
      playing = false;
      toggle.textContent = '播放';
      commit(minutes);
    });

    panel.append(label, slider, toggle, realtime);
    document.body.append(panel);
    commit(0);

    // Twelve simulated minutes per real second: one full day in two minutes.
    const tick = () => {
      const now = performance.now();
      if (playing) {
        minutes = (minutes + (now - previous) * 0.012) % 1440;
        commit(minutes);
      }
      previous = now;
    };
    realSetInterval(tick, 100);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountControls, { once: true });
  } else {
    mountControls();
  }
})();`;

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

  send(method, params = {}, timeoutMs = 10_000) {
    return new Promise((resolvePromise, rejectPromise) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`Edge 调试命令超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }
}

export async function attachSkyPreview({ cdpOrigin, previewUrl, width = 1440, height = 900 }) {
  const pages = await fetchJson(`${cdpOrigin}/json/list`);
  const target = pages.find((page) => page.type === 'page' && page.url === 'about:blank')
    ?? pages.find((page) => page.type === 'page');

  if (!target) throw new Error('没有找到可用的 Microsoft Edge 页面调试目标。');

  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const current = await client.send('Runtime.evaluate', {
      expression: `Boolean(document.getElementById('__codex-sky-preview'))`,
      returnByValue: true,
    });

    if (!current.result.value) {
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
      await client.send('Page.navigate', { url: previewUrl });
    }

    return await waitForPreview(client, 30_000);
  } finally {
    client.close();
  }
}

async function waitForPreview(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult = null;
  let firstSyncedTime = null;

  while (Date.now() < deadline) {
    try {
      const response = await client.send('Runtime.evaluate', {
        expression: `(() => {
          const frame = document.getElementById('bg-3d');
          return {
            title: document.title,
            panel: Boolean(document.getElementById('__codex-sky-preview')),
            width: innerWidth,
            time: new Date().toTimeString().slice(0, 5),
            frameReady: frame?.contentDocument?.readyState ?? null,
            frameTime: frame?.contentWindow?.Date
              ? new frame.contentWindow.Date().toTimeString().slice(0, 5)
              : null,
          };
        })()`,
        returnByValue: true,
      });
      lastResult = response.result.value;
      if (
        lastResult?.panel
        && lastResult.frameReady === 'complete'
        && lastResult.time === lastResult.frameTime
      ) {
        if (firstSyncedTime === null) firstSyncedTime = lastResult.time;
        else if (lastResult.time !== firstSyncedTime) return lastResult;
      } else {
        firstSyncedTime = null;
      }
    } catch {
      // Navigation temporarily destroys the execution context; retry.
    }
    await delay(250);
  }

  throw new Error(`全天预览加载超时。最后状态: ${JSON.stringify(lastResult)}`);
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('一键天空预览目前只支持 Windows 上的 Microsoft Edge。');
  }

  const edgePath = findEdgeExecutable();
  if (!edgePath) {
    throw new Error('未找到 Microsoft Edge。请确认 Edge 已安装。');
  }

  const state = {
    astro: null,
    edge: null,
    profileDir: null,
    cdpOrigin: null,
    shuttingDown: false,
  };

  let exitCode = 0;
  try {
    console.log('[sky-preview] 正在打包 3D 背景并同步每日一句...');
    await build({
      absWorkingDir: PROJECT_ROOT,
      entryPoints: ['src/3d/background.ts'],
      bundle: true,
      format: 'esm',
      outfile: 'public/three-bg.js',
      logLevel: 'silent',
    });
    await runNodeScript('scripts/sync-quotes.mjs');

    const webPort = await findAvailablePort(4330);
    const cdpPort = await findAvailablePort(9230, new Set([webPort]));
    const previewUrl = `http://${HOST}:${webPort}/zh/?sky-day-preview=1`;
    state.cdpOrigin = `http://${HOST}:${cdpPort}`;

    console.log(`[sky-preview] 启动开发服务器: http://${HOST}:${webPort}/`);
    state.astro = spawn(
      process.execPath,
      [ASTRO_CLI, 'dev', '--host', HOST, '--port', String(webPort)],
      { cwd: PROJECT_ROOT, env: process.env, stdio: 'inherit', windowsHide: true },
    );
    await waitForHttp(previewUrl, 30_000);

    state.profileDir = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
    console.log('[sky-preview] 打开 Microsoft Edge...');
    state.edge = spawn(
      edgePath,
      [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${state.profileDir}`,
        '--new-window',
        '--window-size=1440,1000',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ],
      { cwd: PROJECT_ROOT, stdio: 'ignore', windowsHide: false },
    );

    await waitForHttp(`${state.cdpOrigin}/json/version`, 20_000);
    const result = await attachSkyPreview({ cdpOrigin: state.cdpOrigin, previewUrl });
    console.log(`[sky-preview] 已就绪: ${JSON.stringify(result)}`);
    console.log('[sky-preview] 一天约 2 分钟；关闭 Edge 或按 Ctrl+C 即可结束。');

    const reason = await waitUntilClosed(state);
    if (reason.kind === 'server-exit') {
      exitCode = 1;
      console.error(`[sky-preview] 开发服务器意外退出，退出码: ${reason.code ?? 'unknown'}`);
    } else {
      console.log('[sky-preview] 正在结束预览...');
    }
  } finally {
    await shutdown(state);
  }

  process.exitCode = exitCode;
}

function findEdgeExecutable() {
  const candidates = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function runNodeScript(relativePath) {
  const child = spawn(process.execPath, [relativePath], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(`${relativePath} 执行失败: ${signal ?? code}`);
  }
}

async function findAvailablePort(preferred, excluded = new Set()) {
  for (let port = preferred; port <= 65_535; port += 1) {
    if (excluded.has(port)) continue;
    if (await canListen(port)) return port;
  }
  throw new Error(`从端口 ${preferred} 开始没有找到可用端口。`);
}

function canListen(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    const finish = (available) => {
      server.removeAllListeners();
      if (server.listening) server.close(() => resolvePromise(available));
      else resolvePromise(available);
    };
    server.once('error', () => finish(false));
    server.listen({ host: HOST, port }, () => finish(true));
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }
  throw new Error(`等待服务超时: ${url} (${lastError?.message ?? 'unknown'})`);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`);
  return response.json();
}

function waitUntilClosed(state) {
  return new Promise((resolvePromise) => {
    let settled = false;
    let failedChecks = 0;

    const finish = (reason) => {
      if (settled) return;
      settled = true;
      clearInterval(monitor);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      resolvePromise(reason);
    };

    const onSigint = () => finish({ kind: 'signal', signal: 'SIGINT' });
    const onSigterm = () => finish({ kind: 'signal', signal: 'SIGTERM' });
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);

    state.astro.once('exit', (code) => {
      if (!state.shuttingDown) finish({ kind: 'server-exit', code });
    });

    const monitor = setInterval(async () => {
      try {
        await fetchJson(`${state.cdpOrigin}/json/version`);
        failedChecks = 0;
      } catch {
        failedChecks += 1;
        if (failedChecks >= 3) finish({ kind: 'edge-closed' });
      }
    }, 1_000);
  });
}

async function shutdown(state) {
  if (state.shuttingDown) return;
  state.shuttingDown = true;

  if (state.cdpOrigin) await closeEdgeGracefully(state.cdpOrigin);
  if (state.edge?.exitCode === null) state.edge.kill();
  if (state.astro?.exitCode === null) {
    state.astro.kill();
    await Promise.race([once(state.astro, 'exit').catch(() => {}), delay(2_000)]);
    if (state.astro.exitCode === null) state.astro.kill('SIGKILL');
  }

  if (state.profileDir) {
    await delay(500);
    await removeTemporaryProfile(state.profileDir);
  }
}

async function closeEdgeGracefully(cdpOrigin) {
  try {
    const version = await fetchJson(`${cdpOrigin}/json/version`);
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolvePromise, rejectPromise) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', rejectPromise, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await delay(300);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  } catch {
    // Edge was already closed by the user.
  }
}

async function removeTemporaryProfile(profileDir) {
  const tempRoot = resolve(tmpdir());
  const target = resolve(profileDir);
  const isExpectedTarget = target.startsWith(`${tempRoot}${sep}`)
    && basename(target).startsWith(PROFILE_PREFIX);

  if (!isExpectedTarget) {
    console.warn(`[sky-preview] 拒绝清理非预期目录: ${target}`);
    return;
  }

  try {
    await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  } catch (error) {
    console.warn(`[sky-preview] 临时 Edge 配置未能完全清理: ${target} (${error.message})`);
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`[sky-preview] 启动失败: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
