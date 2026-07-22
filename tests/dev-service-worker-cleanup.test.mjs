import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearDevServiceWorkerState,
  DEV_SW_RELOAD_KEY,
} from '../src/lib/dev-service-worker.mjs';

function createStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('development cleanup removes only this project worker and caches, then reloads once', async () => {
  const unregistered = [];
  const deletedCaches = [];
  let reloads = 0;
  const projectRegistration = {
    active: { scriptURL: 'http://localhost:4321/sw.js' },
    async unregister() {
      unregistered.push('/sw.js');
      return true;
    },
  };
  const unrelatedRegistration = {
    active: { scriptURL: 'http://localhost:4321/other-worker.js' },
    async unregister() {
      unregistered.push('/other-worker.js');
      return true;
    },
  };
  const sessionStorageRef = createStorage();

  const result = await clearDevServiceWorkerState({
    navigatorRef: {
      serviceWorker: {
        controller: {},
        async getRegistrations() {
          return [projectRegistration, unrelatedRegistration];
        },
      },
    },
    cachesRef: {
      async keys() {
        return ['heavy-v1', 'runtime-v1', 'unrelated-cache'];
      },
      async delete(name) {
        deletedCaches.push(name);
        return true;
      },
    },
    locationRef: { reload() { reloads += 1; } },
    sessionStorageRef,
  });

  assert.deepEqual(unregistered, ['/sw.js']);
  assert.deepEqual(deletedCaches, ['heavy-v1', 'runtime-v1']);
  assert.equal(reloads, 1);
  assert.equal(sessionStorageRef.getItem(DEV_SW_RELOAD_KEY), '1');
  assert.deepEqual(result, { registrationsRemoved: 1, cachesRemoved: 2, reloaded: true });
});

test('reload marker prevents loops while cleanup still removes stale state', async () => {
  let reloads = 0;
  const sessionStorageRef = createStorage([[DEV_SW_RELOAD_KEY, '1']]);

  const result = await clearDevServiceWorkerState({
    navigatorRef: {
      serviceWorker: {
        controller: {},
        async getRegistrations() {
          return [{
            active: { scriptURL: 'http://localhost:4321/sw.js' },
            async unregister() { return true; },
          }];
        },
      },
    },
    cachesRef: { async keys() { return []; }, async delete() { return false; } },
    locationRef: { reload() { reloads += 1; } },
    sessionStorageRef,
  });

  assert.equal(reloads, 0);
  assert.equal(sessionStorageRef.getItem(DEV_SW_RELOAD_KEY), null);
  assert.deepEqual(result, { registrationsRemoved: 1, cachesRemoved: 0, reloaded: false });
});

test('cleanup is a no-op when Service Workers are unavailable', async () => {
  const result = await clearDevServiceWorkerState({ navigatorRef: {} });
  assert.deepEqual(result, { registrationsRemoved: 0, cachesRemoved: 0, reloaded: false });
});
