const CACHE_NAME = 'sovann-ledger-cache-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// 1. Install & Cache ឯកសារស្នូល
self.addEventListener('install', (event) => {
    self.skipWaiting(); // ឲ្យ SW ថ្មីដំណើរការភ្លាមៗ
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Activate & លុប Cache ចាស់ៗចោល
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch: Network-First (មានអ៊ីនធឺណិតយកថ្មី គ្មានអ៊ីនធឺណិតយកពី Cache)
self.addEventListener('fetch', (event) => {
    // រំលងការ Cache សម្រាប់ Supabase API ឬ Request ដែលមិនមែន GET
    if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // បើទាញបានជោគជ័យ ធ្វើបច្ចុប្បន្នភាពក្នុង Cache ទុកប្រើពេល Offline
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // បើដាច់អ៊ីនធឺណិត ទាញពី Cache មកបង្ហាញ
                return caches.match(event.request);
            })
    );
});
