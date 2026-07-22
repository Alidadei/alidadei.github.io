export const DEV_SW_RELOAD_KEY = 'alidadei:dev-sw-cleanup-reloaded';

const PROJECT_SW_PATH = '/sw.js';
const PROJECT_CACHE_PATTERN = /^(?:heavy|runtime)-v/;

function usesProjectServiceWorker(registration) {
  return ['installing', 'waiting', 'active'].some((state) => {
    const scriptURL = registration?.[state]?.scriptURL;
    if (!scriptURL) return false;

    try {
      return new URL(scriptURL).pathname === PROJECT_SW_PATH;
    } catch {
      return false;
    }
  });
}

function readReloadMarker(storage) {
  if (!storage) return true;
  try {
    return storage.getItem(DEV_SW_RELOAD_KEY) === '1';
  } catch {
    // If session storage is blocked, do not risk a reload loop.
    return true;
  }
}

function writeReloadMarker(storage) {
  if (!storage) return false;
  try {
    storage.setItem(DEV_SW_RELOAD_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

function removeReloadMarker(storage) {
  if (!storage) return;
  try {
    storage.removeItem(DEV_SW_RELOAD_KEY);
  } catch {
    // Storage is optional; cleanup has already completed.
  }
}

/**
 * Remove only this project's production Service Worker state while Astro is
 * running in development. A previously opened `astro preview` can otherwise
 * keep serving stale CSS from the same localhost origin.
 */
export async function clearDevServiceWorkerState({
  navigatorRef = globalThis.navigator,
  cachesRef = globalThis.caches,
  locationRef = globalThis.location,
  sessionStorageRef = globalThis.sessionStorage,
} = {}) {
  const serviceWorker = navigatorRef?.serviceWorker;
  if (!serviceWorker || typeof serviceWorker.getRegistrations !== 'function') {
    return { registrationsRemoved: 0, cachesRemoved: 0, reloaded: false };
  }

  const registrations = await serviceWorker.getRegistrations();
  const projectRegistrations = registrations.filter(usesProjectServiceWorker);
  const cacheNames = cachesRef && typeof cachesRef.keys === 'function'
    ? await cachesRef.keys()
    : [];
  const projectCacheNames = cacheNames.filter((name) => PROJECT_CACHE_PATTERN.test(name));
  const wasControlled = Boolean(serviceWorker.controller);
  const hadProjectState = projectRegistrations.length > 0 || projectCacheNames.length > 0;

  const [registrationResults, cacheResults] = await Promise.all([
    Promise.all(projectRegistrations.map((registration) => registration.unregister())),
    cachesRef && typeof cachesRef.delete === 'function'
      ? Promise.all(projectCacheNames.map((name) => cachesRef.delete(name)))
      : Promise.resolve([]),
  ]);

  const registrationsRemoved = registrationResults.filter(Boolean).length;
  const cachesRemoved = cacheResults.filter(Boolean).length;
  const alreadyReloaded = readReloadMarker(sessionStorageRef);
  const shouldReload = wasControlled && hadProjectState && !alreadyReloaded;
  let reloaded = false;

  if (
    shouldReload
    && writeReloadMarker(sessionStorageRef)
    && locationRef
    && typeof locationRef.reload === 'function'
  ) {
    reloaded = true;
    locationRef.reload();
  } else {
    removeReloadMarker(sessionStorageRef);
  }

  return { registrationsRemoved, cachesRemoved, reloaded };
}
