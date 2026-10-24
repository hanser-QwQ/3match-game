/**
 * Service Worker（M17 离线能力）
 *
 * 策略：缓存优先、网络回源更新。
 * 已访问过的站点在断网后可正常进入并游玩已解锁关卡（FR-17 / AC-18）；
 * 首次访问即断网时，导航请求回退到缓存的首页，不出现空白页。
 */

const CACHE_NAME = 'match3-path-v17';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/core/constants.js',
  './js/core/events.js',
  './js/core/random.js',
  './js/data/changelog.js',
  './js/data/levels.embedded.js',
  './js/domain/board.js',
  './js/domain/boardFactory.js',
  './js/domain/matchEngine.js',
  './js/domain/cascadeResolver.js',
  './js/domain/deadlockDetector.js',
  './js/domain/scorer.js',
  './js/domain/goals.js',
  './js/domain/boosterService.js',
  './js/application/gameController.js',
  './js/application/gameSession.js',
  './js/application/nickname.js',
  './js/application/tutorialService.js',
  './js/infrastructure/levelRepository.js',
  './js/infrastructure/storageService.js',
  './js/infrastructure/audioService.js',
  './js/infrastructure/offlineService.js',
  './js/presentation/renderer.js',
  './js/presentation/inputController.js',
  './js/presentation/a11yService.js',
  './js/presentation/sceneManager.js',
  './js/presentation/shareCard.js',
  './levels/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 逐个缓存：个别资源缺失不应导致整个安装失败
      await Promise.all(
        CORE.map((url) => cache.add(url).catch(() => undefined))
      );
      // 关卡数据按索引清单预缓存，避免探测不存在的关卡号
      try {
        const res = await fetch('./levels/index.json', { cache: 'no-cache' });
        if (res.ok) {
          const index = await res.json();
          await Promise.all(
            (index.levels || []).map((id) => {
              const url = `./levels/level-${String(id).padStart(2, '0')}.json`;
              return cache.add(url).catch(() => undefined);
            })
          );
        }
      } catch {
        /* 索引不可用时跳过，运行时按需缓存 */
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(request)) || (await cache.match('./index.html'));
          return cached || new Response('离线且没有缓存', { status: 503 });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        // 后台更新，不阻塞当前请求
        fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
          })
          .catch(() => undefined);
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response('', { status: 504 });
      }
    })()
  );
});
