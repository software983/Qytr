// ==================== Service Worker لتطبيق ورتّـل ====================
// يوفّر ثلاث سياسات تخزين مختلفة حسب نوع الملف:
// 1) الصفحة والخطوط: شبكة أولاً ثم الكاش عند تعذر الاتصال.
// 2) ملفات JSON (بيانات القراء والسور والإعدادات): عرض فوري من الكاش مع تحديث في الخلفية.
// 3) ملفات الصوت (السور): تُخزَّن تلقائياً بعد أول استماع لتتوفر لاحقاً بدون إنترنت.

const CACHE_VERSION = 'wartel-v2';
const STATIC_CACHE = CACHE_VERSION + '-static';
const DATA_CACHE = CACHE_VERSION + '-data';
const AUDIO_CACHE = CACHE_VERSION + '-audio';

// الملفات الأساسية التي يتم تخزينها فور تثبيت الـ Service Worker
const PRECACHE_URLS = [
    './',
    './index.html',
    './fonts/material-symbols-outlined.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return Promise.all(
                PRECACHE_URLS.map((url) => cache.add(url).catch(() => {
                    // نتجاهل أي ملف غير موجود بدل فشل التثبيت بالكامل
                }))
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key.indexOf(CACHE_VERSION) !== 0)
                    .map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

function isAudioRequest(url) {
    return /\.(mp3|m4a|aac|ogg|wav)(\?.*)?$/i.test(url);
}

function isJsonRequest(url) {
    return /\.json(\?.*)?$/i.test(url);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = req.url;

    // 1) ملفات الصوت: كاش أولاً، وتُحفظ تلقائياً بعد أول تشغيل ناجح
    if (isAudioRequest(url)) {
        event.respondWith(
            caches.open(AUDIO_CACHE).then(async (cache) => {
                const cached = await cache.match(req);
                if (cached) return cached;
                try {
                    const response = await fetch(req);
                    if (response && response.ok) {
                        cache.put(req, response.clone());
                    }
                    return response;
                } catch (e) {
                    return cached || Promise.reject(e);
                }
            })
        );
        return;
    }

    // 2) ملفات JSON: عرض فوري من الكاش (إن وُجد) مع تحديث في الخلفية (Stale-While-Revalidate)
    if (isJsonRequest(url)) {
        event.respondWith(
            caches.open(DATA_CACHE).then(async (cache) => {
                const cached = await cache.match(req);
                const fetchPromise = fetch(req)
                    .then((response) => {
                        if (response && response.ok) cache.put(req, response.clone());
                        return response;
                    })
                    .catch(() => cached);
                return cached || fetchPromise;
            })
        );
        return;
    }

    // 3) باقي الملفات (الصفحة نفسها، الخطوط...): شبكة أولاً ثم الكاش عند انقطاع الاتصال
    event.respondWith(
        fetch(req)
            .then((response) => {
                if (response && response.ok && (req.destination === 'document' || req.destination === 'font' || req.destination === '')) {
                    const resClone = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
                }
                return response;
            })
            .catch(() => caches.match(req))
    );
});
