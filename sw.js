// 오봉역 입환게임 서비스워커
//
// 이전 버전은 모든 same-origin 요청에 "캐시 우선"을 썼고, 캐시 갱신은
//   (1) activate 이벤트  (2) setInterval(30초)
// 두 가지에 의존했다. 그런데
//   - activate는 sw.js 파일 자체가 바뀔 때만 실행되고,
//   - 서비스워커는 놀고 있으면 브라우저가 종료시키므로 setInterval은 사실상 안 돈다.
// 그래서 index.html만 배포하면 설치된 앱에는 계속 옛 화면이 남았다.
//
// 지금은 문서(HTML)를 네트워크 우선으로 가져오고, 나머지 자산은 캐시를 먼저 주되
// 뒤에서 조용히 갱신한다(stale-while-revalidate).
// 온라인이면 앱을 다시 열 때 최신 화면이 뜨고, 오프라인이면 캐시로 동작한다.
//
// 주의: 자산을 추가했다면 아래 CACHE 이름의 숫자를 올려야 이전 캐시가 정리된다.

const CACHE = 'obong-game-v78';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/bgm.mp3',
  './assets/bgm-start.mp3',
  './assets/bgm2.mp3',
  './assets/bgm3.mp3',
  './assets/qr-android.png',
  './assets/worker/walk1.png',
  './assets/worker/walk2.png',
  './assets/worker/walk3.png',
  './assets/worker/walk4.png',
  './assets/worker/walk5.png',
  './assets/worker/think.png',
  './assets/worker/surprise.png',
  './assets/worker/back1.png',
  './assets/worker/back2.png',
  './assets/worker/wave.png',
  './assets/radio.png',
  './assets/hazard-sign.png',
  './assets/cursor-hand.png',
  './assets/cursor-hand-active.png',
  './assets/worker-main/walk1.png',
  './assets/worker-main/walk2.png',
  './assets/worker-main/walk3.png',
  './assets/worker-main/walk4.png',
  './assets/worker-main/walk5.png',

  './assets/korail-logo.png',
  './assets/engine-move.mp3',
  './assets/horn.mp3',
  './assets/start-character.png',
  './assets/bg-game.jpg',
  './assets/bg-start.jpg',
  './assets/loco.png',
  './assets/hud-char.png',
  './assets/note.png',
  './assets/wagon.png',
  './assets/worker-yard.png',
  './assets/worker-main.png',
  './assets/icons/btn-stop.png',
  './assets/icons/btn-horn.png',
  './assets/icons/btn-couple.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-256.png',
  './assets/icons/icon-512.png',
];

const EXTERNAL_HOSTS = ['firebaseio.com', 'firebasedatabase.app', 'gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 파일 하나가 없어도 설치 자체는 계속되도록 개별로 담는다
    await Promise.all(PRECACHE.map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

function isHtmlRequest(req) {
  return req.mode === 'navigate'
      || req.destination === 'document'
      || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 랭킹 등 실시간 데이터는 서비스워커가 손대지 않는다
  if (EXTERNAL_HOSTS.some(h => url.hostname.includes(h))) return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(req).catch(() => new Response('{"version":0}', { status: 503 }))
    );
    return;
  }

  // 화면(HTML)은 네트워크 우선 — "배포했는데 앱은 그대로"를 막는 핵심
  if (isHtmlRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match(req))
            || (await caches.match('./index.html'))
            || new Response('오프라인입니다', {
                 status: 503,
                 headers: { 'Content-Type': 'text/plain; charset=utf-8' }
               });
      }
    })());
    return;
  }

  // 그 외 자산: 캐시를 바로 주고 뒤에서 새 버전을 받아 다음 실행에 반영
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});
