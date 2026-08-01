const CACHE_ASSETS = [
  './',
  './index.html',
  './assets/bgm.mp3',
  './assets/start-character.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-256.png'
];
const EXTERNAL_HOSTS = ['firebaseio.com', 'firebasedatabase.app', 'gstatic.com'];

// 버전 확인 및 캐시 갱신
async function checkAndUpdateCache() {
  try {
    const response = await fetch('./version.json?t=' + Date.now());
    const data = await response.json();
    const newVersion = data.version;
    const currentVersion = await getCacheVersion();

    if (newVersion > currentVersion) {
      // 새 버전이 있으면 캐시 갱신
      const cacheName = 'obong-game-v' + newVersion;
      const cache = await caches.open(cacheName);
      await cache.addAll(CACHE_ASSETS).catch((err) => {
        console.warn('Service Worker: 일부 자산 캐싱 실패', err);
      });
      await setCacheVersion(newVersion);
      // 이전 캐시 정리
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.startsWith('obong-game-') && name !== cacheName) {
          await caches.delete(name);
        }
      }
      console.log('Service Worker: 캐시 업데이트됨 (v' + newVersion + ')');
      // 클라이언트에 업데이트 알림
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'CACHE_UPDATED', version: newVersion });
        });
      });
    }
  } catch (err) {
    console.warn('Service Worker: 버전 확인 실패', err);
  }
}

async function getCacheVersion() {
  const cache = await caches.open('obong-meta');
  const response = await cache.match('version');
  if (response) {
    const data = await response.json();
    return data.version || 0;
  }
  return 0;
}

async function setCacheVersion(version) {
  const cache = await caches.open('obong-meta');
  await cache.put('version', new Response(JSON.stringify({ version })));
}

// Install: 초기 캐싱 + 백그라운드 업데이트 스케줄
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const data = await fetch('./version.json?t=' + Date.now()).then(r => r.json());
        const cacheName = 'obong-game-v' + data.version;
        const cache = await caches.open(cacheName);
        await cache.addAll(CACHE_ASSETS).catch((err) => {
          console.warn('Service Worker: 일부 자산 캐싱 실패', err);
        });
        await setCacheVersion(data.version);
      } catch (err) {
        console.error('Service Worker install 실패:', err);
      }
      return self.skipWaiting();
    })()
  );
});

// Activate: 이전 캐시 정리 + 주기적 업데이트 시작
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 버전 메타 캐시 외 이전 버전 정리
      const cacheNames = await caches.keys();
      const currentVersion = await getCacheVersion();
      const expectedCacheName = 'obong-game-v' + currentVersion;

      for (const cacheName of cacheNames) {
        if (cacheName.startsWith('obong-game-') && cacheName !== expectedCacheName) {
          await caches.delete(cacheName);
        }
      }

      await self.clients.claim();

      // 처음 활성화 시 버전 확인
      await checkAndUpdateCache();
    })()
  );
});

// Fetch: Firebase는 네트워크로, 나머지는 캐시 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // version.json은 항상 최신 버전 확인 (캐싱 안 함)
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('{"version": 0}', { status: 503 });
      })
    );
    return;
  }

  // Firebase 도메인은 항상 네트워크로
  if (EXTERNAL_HOSTS.some(host => url.hostname.includes(host))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('Network error', { status: 503 });
      })
    );
    return;
  }

  // Same-origin 자산: 캐시 우선 전략
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const currentVersion = await getCacheVersion();
        const cacheName = 'obong-game-v' + currentVersion;
        const cached = await caches.match(event.request);
        if (cached) {
          return cached;
        }
        try {
          const fetchResponse = await fetch(event.request);
          const cache = await caches.open(cacheName);
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        } catch (err) {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // 다른 도메인: 그대로 네트워크로
  event.respondWith(fetch(event.request));
});

// 백그라운드에서 주기적으로 버전 확인 (30초마다)
setInterval(checkAndUpdateCache, 30000);
