const CACHE_VERSION = 'obong-game-v1';
const CACHE_ASSETS = [
  './',
  './index.html',
  './assets/bgm.mp3',
  './assets/start-character.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-256.png'
];
const EXTERNAL_HOSTS = ['firebaseio.com', 'firebasedatabase.app', 'gstatic.com'];

// Install: 정적 자산 미리 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(CACHE_ASSETS).catch((err) => {
        console.warn('Service Worker: 일부 자산 캐싱 실패', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Firebase는 네트워크로, 나머지는 캐시 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase 도메인은 항상 네트워크로 (랭킹 실시간 동기화)
  if (EXTERNAL_HOSTS.some(host => url.hostname.includes(host))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // 네트워크 실패 시 오프라인 메시지는 표시하지 않음 (게임 로직에서 처리)
        return new Response('Network error', { status: 503 });
      })
    );
    return;
  }

  // Same-origin 자산: 캐시 우선 전략
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          return caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // 다른 도메인: 그대로 네트워크로
  event.respondWith(fetch(event.request));
});
