import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

// 守卫脚本内联在构建产物里:从 dist 提取后用桩 DOM 环境验证行为。
// 需要先构建(npm run build)以获得最新产物。

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

// 桩浏览器环境;quotes/siteMode 配置守卫 fetch 的两种响应
function makeSandbox({ pathname, quotes = ['今日测试句'], siteMode = { hidden: true }, siteModeFail = false, owner = false, cached = null }) {
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

  sandbox.fetch = (url) => {
    calls.fetches.push(String(url));
    if (String(url).includes('/api/site-mode')) {
      if (siteModeFail) return Promise.reject(new TypeError('network down'));
      return Promise.resolve({ ok: true, json: async () => siteMode });
    }
    return Promise.resolve({ ok: true, json: async () => ({ zh: quotes, en: ['daily test'] }) });
  };

  vm.createContext(sandbox);
  return { sandbox, calls };
}

async function flush() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

const isLocked = (s) => s.document.documentElement.classList.contains('site-locked');

test('开发模式直接跳过:不请求、不上锁', async () => {
  const script = loadGuardScript({ isDev: true });
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/' });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(calls.fetches.length, 0);
  assert.equal(isLocked(sandbox), false);
});

test('管理后台路径豁免:锁站时也能进入', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/admin/' });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(calls.fetches.length, 0);
  assert.equal(isLocked(sandbox), false);
});

test('锁站 + 访客 + 首页:上锁并展示每日一句与提示', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/' });
  vm.runInContext(script, sandbox);
  // 同步阶段:cached 为空,先不上锁;异步 fetch 确认 hidden 后上锁
  assert.equal(isLocked(sandbox), false);
  await flush();
  assert.equal(isLocked(sandbox), true);
  assert.equal(sandbox.window.__SITE_LOCKED__, true);
  assert.equal(calls.replacedTo, null);
  // 兜底每日一句已重建且拿到当日文案
  const box = calls.appended.find((el) => el.id === 'site-lock-quote');
  assert.ok(box, '未创建每日一句容器');
  const p = box.children[0];
  assert.equal(p.id, 'quote-2d');
  assert.equal(p.textContent, '今日测试句');
  const note = calls.appended.find((el) => el.id === 'site-lock-note');
  assert.ok(note, '未创建锁站提示');
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), '1');
});

test('锁站 + 访客 + 非首页:立即跳回对应语言首页', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/en/blog/', cached: '1' });
  vm.runInContext(script, sandbox);
  assert.equal(calls.replacedTo, '/en/');
  assert.equal(isLocked(sandbox), false);
});

test('锁站 + 站长浏览器(localStorage 标记):豁免不上锁', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/', cached: '1', owner: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), false);
  assert.ok(calls.fetches.some((u) => u.includes('/api/site-mode')));
});

test('会话缓存命中:同步立即上锁,随后 fetch 恢复则解除', async () => {
  const script = loadGuardScript();
  // 先隐藏:cached='1' 同步上锁
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/', cached: '1', siteMode: { hidden: true } });
  vm.runInContext(script, sandbox);
  assert.equal(isLocked(sandbox), true);
  await flush();
  assert.equal(isLocked(sandbox), true);

  // 再恢复:同一脚本重新执行(模拟下一页),fetch 返回 hidden:false → 解除
  const { sandbox: s2, calls: c2 } = makeSandbox({ pathname: '/zh/', cached: '1', siteMode: { hidden: false } });
  vm.runInContext(script, s2);
  assert.equal(isLocked(s2), true); // 同步先锁(缓存)
  await flush();
  assert.equal(isLocked(s2), false); // 异步确认已开放 → 解除
  assert.equal(s2.sessionStorage.getItem('site_lock_cache'), '0');
  assert.equal(s2.window.__SITE_LOCKED__, false);
  void calls;
});

test('Worker 不可达:保持现状不误伤(失败开放)', async () => {
  const script = loadGuardScript();
  const { sandbox, calls } = makeSandbox({ pathname: '/zh/', siteModeFail: true });
  vm.runInContext(script, sandbox);
  await flush();
  assert.equal(isLocked(sandbox), false);
  assert.equal(calls.replacedTo, null);
  assert.equal(sandbox.sessionStorage.getItem('site_lock_cache'), null);
});
