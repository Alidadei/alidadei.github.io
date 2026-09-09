import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

// 守卫脚本内联在构建产物里:从 dist 提取后用桩 DOM 环境验证行为。
// 需要先构建(npm run build)以获得最新产物。
// 双通道语义:① workers.dev /api/site-mode ② 同源 /site-mode.json
// API 可达时以 API 为准;否则用同源文件;两通道都不可达时维持现状。

function loadGuardScript({ isDev = false } = {}) {
  const html = fs.readFileSync('dist/zh/index.html', 'utf-8');
  const chunk = html.split('<script>').find((c) => c.includes('site_lock_cache'));
  assert.ok(chunk, 'dist/zh/index.html 中未找到守卫脚本(先 npm run build)');
  let script = chunk.slice(0, chunk.indexOf('</script>'));
  if (isDev) script = script.replace('const isDev = false', 'const isDev = true');
  return script;
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    style: { cssText: '', opacity: '0' },
    textContent: '',
    children: [],
    parentElement: null,
    appendChild(child) { el.children.push(child); child.parentElement = el; },
    remove() { if (el.parentElement) el.parentElement.children = el.children.filter((c) => c !== el); },
  };
  return el;
}

// channel 值:true/false = 返回 hidden 状态;'unreachable' = 网络失败;404 对应 http 错误;'pending' = 永不返回(模拟被墙挂起)
function channelResponse(v) {
  if (v === 'pending') return new Promise(() => {});
  if (v === 'unreachable') return Promise.reject(new TypeError('network down'));
  if (v === 404) return Promise.resolve({ ok: false, json: async () => ({}) });
  return Promise.resolve({ ok: true, json: async () => ({ hidden: !!v }) });
}

function makeSandbox({ pathname, api = false, file = false, owner = false, cached = null, lastLock = null, lastTs = null }) {
  const calls = { fetches: [], replacedTo: null, appended: [] };
  const docEl = { classSet: new Set(), classList: {
    add: (c) => docEl.classSet.add(c),
    remove: (c) => docEl.classSet.delete(c),
    contains: (c) => docEl.classSet.has(c),
  } };

  const sandbox = {
    console,
    location: { pathname, replace: (to) => { calls.replacedTo = to; } },
    document: {
      readyState: 'complete',
      addEventListener() {},
      documentElement: docEl,
      body: { appendChild: (el) => calls.appended.push(el) },
      getElementById: () => null,
      createElement: (tag) => makeElement(tag),
    },
    sessionStorage: makeStorage(),
    localStorage: makeStorage(),
    setTimeout,
  };
  sandbox.window = sandbox;
  if (owner) sandbox.localStorage.setItem('cms_owner_at', String(Date.now()));
  if (cached !== null) sandbox.sessionStorage.setItem('site_lock_cache', cached);
  if (lastLock !== null) {
    sandbox.localStorage.setItem('site_lock_last', lastLock);
    sandbox.localStorage.setItem('site_lock_ts', String(lastTs ?? Date.now()));
  }

  sandbox.fetch = (url) => {
    const u = String(url);
    calls.fetches.push(u);
    if (u.includes('/api/site-mode')) return channelResponse(api);
    if (u.includes('/site-mode.json')) return channelResponse(file);
    return Promise.resolve({ ok: true, json: async () => ({ zh: ['今日测试句'], en: ['daily test'] }) });
  };

  vm.createContext(sandbox);
  return { sandbox, calls };
}

async function flush() {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

const isLocked = (s) => s.document.documentElement.classList.contains('site-locked');

test('开发模式直接跳过:不请求、不上锁', async () => {
  const script = loadGuardScript({ isDev: true });
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/', api: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(calls.fetches.length, 0);
  assert.equal(isLocked(sandbox), false);
});

test('管理后台路径豁免:锁站时也能进入', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/admin/', api: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(calls.fetches.length, 0);
  assert.equal(isLocked(sandbox), false);
});

test('双通道都报隐藏:上锁并展示每日一句与提示', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/', api: true, file: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), true);
  assert.equal(sandbox.window.__SITE_LOCKED__, true);
  assert.equal(calls.replacedTo, null);
  const box = calls.appended.find((el) => el.id === 'site-lock-quote');
  assert.ok(box, '未创建每日一句容器');
  assert.equal(box.children[0].id, 'quote-2d');
  assert.equal(box.children[0].textContent, '今日测试句');
  const note = calls.appended.find((el) => el.id === 'site-lock-note');
  assert.ok(note, '未创建锁站提示');
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), '1');
});

test('国内直连关键场景:workers.dev 不可达,仅同源文件报隐藏 → 仍上锁', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/', api: 'unreachable', file: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), true);
  void calls;
});

test('同源文件 404(旧构建),仅 API 报隐藏 → 上锁', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', api: true, file: 404 });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), true);
});

test('任一通道报隐藏即锁:API 报开放、文件报隐藏 → 上锁(隐藏优先,不等 API)', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', api: false, file: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), true);
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), '1');
});

test('workers.dev 被墙挂起未应答,同源文件报隐藏 → 立即上锁,不等 API', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', api: 'pending', file: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), true);
});

test('API 挂起、文件报开放 → 暂不上锁也不写缓存(等 API 回话再定)', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', api: 'pending', file: false });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), false);
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), null);
  assert.equal(sandbox.localStorage.getItem('site_lock_last'), null);
});

test('localStorage 记忆:sessionStorage 被重置(微信场景),5 分钟内锁过 → 同步立即锁', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', cached: null, lastLock: '1', lastTs: Date.now() - 60000, api: 'pending', file: 'pending' });
  vm.runInContext(script, sandbox);
  assert.equal(isLocked(sandbox), true); // 同步阶段即锁,不等任何探测
  await flush();
  assert.equal(isLocked(sandbox), true);
});

test('localStorage 记忆超过 5 分钟 → 不再同步锁,由探测决定', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', cached: null, lastLock: '1', lastTs: Date.now() - 400000, api: false, file: false });
  vm.runInContext(script, sandbox);
  assert.equal(isLocked(sandbox), false);
  await flush();
  assert.equal(isLocked(sandbox), false); // 两通道报开放 → 维持解锁
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), '0');
});

test('恢复后写 localStorage 记忆,后续微信重进(记忆=0)不闪锁', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', api: false, file: false });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(sandbox.localStorage.getItem('site_lock_last'), '0');
  assert.ok(Number(sandbox.localStorage.getItem('site_lock_ts')) > 0);
  // 模拟微信重进:sessionStorage 清空,localStorage 记忆仍在
  sandbox.sessionStorage.removeItem('site_lock_cache');
  vm.runInContext(script, sandbox);
  assert.equal(isLocked(sandbox), false);
});

test('双通道都不可达:维持现状,不误伤正常浏览', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', api: 'unreachable', file: 'unreachable' });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), false);
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), null);
});

test('锁站 + 非首页:立即跳回对应语言首页', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/en/blog/', cached: '1', api: true });
  vm.runInContext(script, sandbox);
  assert.equal(calls.replacedTo, '/en/');
  assert.equal(isLocked(sandbox), false);
});

test('锁站 + 站长浏览器(localStorage 标记):豁免不上锁', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', cached: '1', owner: true, api: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), false);
});

test('会话缓存:同步先锁,恢复后(API+文件都报开放)解除', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', cached: '1', api: false, file: false });
  vm.runInContext(script, sandbox);
  assert.equal(isLocked(sandbox), true); // 同步先锁(缓存)
  await flush();
  assert.equal(isLocked(sandbox), false); // 异步确认已开放 → 解除
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), '0');
  assert.equal(sandbox.window.__SITE_LOCKED__, false);
});

test('会话缓存为锁、双通道不可达:维持锁状态(已锁不因断网解锁)', async () => {
  const script = loadGuardScript();
  const { sandbox } = makeSandbox({ pathname: '/zh/', cached: '1', api: 'unreachable', file: 'unreachable' });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), true);
});
