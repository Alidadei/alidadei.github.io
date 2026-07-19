import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

import { corsHeaders, isAllowedCorsOrigin } from '../worker/src/utils.ts';

const ALLOWED_ORIGINS = [
  'https://alidadei.github.io',
  'http://localhost:*',
  'http://127.0.0.1:*',
].join(',');

const env = { ALLOWED_ORIGINS };

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

test('CORS 只接受官网与显式本机开发来源', () => {
  assert.equal(isAllowedCorsOrigin('https://alidadei.github.io', ALLOWED_ORIGINS), true);
  assert.equal(isAllowedCorsOrigin('https://alidadei.github.io.evil.example', ALLOWED_ORIGINS), false);
  assert.equal(isAllowedCorsOrigin('http://localhost:4321', ALLOWED_ORIGINS), true);
  assert.equal(isAllowedCorsOrigin('http://localhost:4327', ALLOWED_ORIGINS), true);
  assert.equal(isAllowedCorsOrigin('http://127.0.0.1:4321', ALLOWED_ORIGINS), true);
  assert.equal(isAllowedCorsOrigin('https://localhost:4321', ALLOWED_ORIGINS), false);
  assert.equal(isAllowedCorsOrigin('https://clone.example', ALLOWED_ORIGINS), false);
});

test('无 Origin 的 Worker/CI 请求可继续调用，缺少白名单时浏览器请求失败关闭', () => {
  assert.equal(isAllowedCorsOrigin(null, ALLOWED_ORIGINS), true);
  assert.equal(isAllowedCorsOrigin('https://alidadei.github.io', undefined), false);
});

test('仅对白名单来源返回可读取的凭据式 CORS 响应头', () => {
  const allowed = corsHeaders(new Request('https://worker.example/api/user', {
    headers: { Origin: 'https://alidadei.github.io' },
  }), env);
  assert.equal(allowed['Access-Control-Allow-Origin'], 'https://alidadei.github.io');
  assert.equal(allowed['Access-Control-Allow-Credentials'], 'true');
  assert.equal(allowed.Vary, 'Origin');

  const rejected = corsHeaders(new Request('https://worker.example/api/user', {
    headers: { Origin: 'https://clone.example' },
  }), env);
  assert.equal('Access-Control-Allow-Origin' in rejected, false);
  assert.equal('Access-Control-Allow-Credentials' in rejected, false);
  assert.equal(rejected.Vary, 'Origin');
});

test('Worker 路由入口拒绝陌生克隆站，并放行官网和无 Origin 的健康检查', async () => {
  const rejected = await worker.fetch(new Request('https://worker.example/api/health', {
    headers: { Origin: 'https://clone.example' },
  }), env);
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { error: 'Origin not allowed' });

  const allowed = await worker.fetch(new Request('https://worker.example/api/health', {
    headers: { Origin: 'https://alidadei.github.io' },
  }), env);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://alidadei.github.io');

  const serverToServer = await worker.fetch(
    new Request('https://worker.example/api/health'),
    env,
  );
  assert.equal(serverToServer.status, 200);
  assert.equal(serverToServer.headers.has('Access-Control-Allow-Origin'), false);
});
