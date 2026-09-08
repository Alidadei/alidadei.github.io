import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// 与 worker-cors.test.mjs 相同的方式加载完整 Worker(fetch handler 走真实路由)
const workerBuild = await build({
  entryPoints: ['worker/src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  logLevel: 'silent',
});
const workerSource = Buffer.from(workerBuild.outputFiles[0].text).toString('base64');
const worker = (await import('data:text/javascript;base64,' + workerSource)).default;

function mockKV() {
  const store = new Map();
  return {
    put: async (key, value) => { store.set(key, value); },
    get: async (key) => store.get(key) ?? null,
    delete: async (key) => { store.delete(key); },
  };
}

const env = { ALLOWED_ORIGINS: 'https://alidadei.github.io', SESSIONS: mockKV() };

function siteModeRequest(method, { token, body } = {}) {
  const headers = { Origin: 'https://alidadei.github.io' };
  if (token) headers['X-Session-Token'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://worker.example/api/site-mode', {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function seedSession() {
  await env.SESSIONS.put('session:tok123', JSON.stringify({ userId: 1, accessToken: 'gh' }));
}

test('初始状态为正常开放', async () => {
  const res = await worker.fetch(siteModeRequest('GET'), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { hidden: false });
});

test('未携带会话不能切换开关(401)', async () => {
  const res = await worker.fetch(siteModeRequest('POST', { body: { hidden: true } }), env);
  assert.equal(res.status, 401);
});

test('携带无效会话不能切换开关(401)', async () => {
  const res = await worker.fetch(siteModeRequest('POST', { token: 'bad-token', body: { hidden: true } }), env);
  assert.equal(res.status, 401);
});

test('非法请求体被拒绝(400)', async () => {
  await seedSession();
  const missing = await worker.fetch(siteModeRequest('POST', { token: 'tok123' }), env);
  assert.equal(missing.status, 400);
  const wrongType = await worker.fetch(siteModeRequest('POST', { token: 'tok123', body: { hidden: 'yes' } }), env);
  assert.equal(wrongType.status, 400);
});

test('登录后可隐藏、查询、恢复,状态写入 KV', async () => {
  await seedSession();

  const hide = await worker.fetch(siteModeRequest('POST', { token: 'tok123', body: { hidden: true } }), env);
  assert.equal(hide.status, 200);
  assert.deepEqual(await hide.json(), { hidden: true });
  assert.equal(await env.SESSIONS.get('site_mode'), 'hidden');

  const getHidden = await worker.fetch(siteModeRequest('GET'), env);
  assert.deepEqual(await getHidden.json(), { hidden: true });

  const restore = await worker.fetch(siteModeRequest('POST', { token: 'tok123', body: { hidden: false } }), env);
  assert.equal(restore.status, 200);
  assert.deepEqual(await restore.json(), { hidden: false });
  assert.equal(await env.SESSIONS.get('site_mode'), null);

  const getOpen = await worker.fetch(siteModeRequest('GET'), env);
  assert.deepEqual(await getOpen.json(), { hidden: false });
});

test('响应携带白名单来源的 CORS 头', async () => {
  const res = await worker.fetch(siteModeRequest('GET'), env);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://alidadei.github.io');
  assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true');
});
