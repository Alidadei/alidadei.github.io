// Service Worker — 强制缓存 3D 重资源,回访/硬刷新秒开
// 策略:
//   - 重资源 (vendor/*, 3d-background.html): Cache First(命中即返回,不走网络)
//   - HTML 导航: Network First(内容最新,离线回退)
//   - 其他静态 (JS/CSS/图片/字体): Stale While Revalidate
//
// VERSION 是占位:npm run build 末尾由 scripts/bump-sw-version.mjs 自动替换成本次构建时间戳,每次部署自动清 SW 缓存。
const VERSION = 'v20260714220000';
const HEAVY = `heavy-${VERSION}`;    // 重资源缓存
const RUNTIME = `runtime-${VERSION}`; // 其他静态运行时缓存

self.addEventListener('install', () => {
  self.skipWaiting(); // 立即激活,不等旧 SW 退出
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 仅同源

  // ① 重资源:Cache First(强制缓存,连硬刷新也命中)
  const isHeavy = url.pathname === '/three-bg.js' || url.pathname === '/3d-background.html';
  if (isHeavy) {
    event.respondWith(
      caches.open(HEAVY).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached; // 命中 → 直接返回,完全不走网络
          return fetch(request).then(resp => {
            if (resp.ok) cache.put(request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // ② HTML 导航:Network First(内容最新,离线回退缓存)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(resp => {
        const clone = resp.clone();
        caches.open(RUNTIME).then(c => c.put(request, clone));
        return resp;
      }).catch(() => caches.match(request).then(c => c || caches.match('/')))
    );
    return;
  }

  // ③ 其他静态:Stale While Revalidate(先返回缓存,后台更新)
  event.respondWith(
    caches.open(RUNTIME).then(cache =>
      cache.match(request).then(cached => {
        const network = fetch(request).then(resp => {
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
