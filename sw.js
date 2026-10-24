// MANGAKI service worker：網路優先（自動取得最新版），離線時用快取
const CACHE = 'mangaki-v6';
const PRECACHE = ['./', './index.html', './manifest.json', './icon.png', './tailwind.css', './css/style.css',
    './js/core.js', './js/privacy.js', './js/ui.js', './js/comics.js', './js/backup.js', './js/github.js', './js/reader-data.js', './js/reader-view.js', './js/update.js', './js/app.js'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET' || !req.url.startsWith('http')) return;

    // version.json 一律走網路，才能正確判斷是否有新版
    if (new URL(req.url).pathname.endsWith('/version.json')) return;

    // GitHub API（含權杖的請求）不經過快取
    if (new URL(req.url).hostname === 'api.github.com') return;

    const sameOrigin = new URL(req.url).origin === self.location.origin;

    if (sameOrigin) {
        // 自己的檔案：每次先問網路（略過瀏覽器 HTTP 快取），失敗才用快取
        event.respondWith(
            fetch(req, { cache: 'no-cache' })
                .then(res => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put(req, copy));
                        return res;
                    }
                    // 部署中或暫時 404/5xx：有快取就先用快取，不要讓使用者看到錯誤頁
                    return caches.match(req, { ignoreSearch: true }).then(hit => hit || res);
                })
                .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
        );
        return;
    }

    // 外部資源（Tailwind、字型、圖示）：先用快取、背景更新，離線時仍可顯示樣式
    event.respondWith(
        caches.match(req).then(hit => {
            const network = fetch(req)
                .then(res => {
                    if (res.ok || res.type === 'opaque') {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put(req, copy));
                    }
                    return res;
                })
                .catch(() => hit);
            return hit || network;
        })
    );
});
