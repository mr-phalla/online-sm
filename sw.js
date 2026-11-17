const CACHE_NAME = 'sovann-ledger-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json'
];

// Install Service Worker និងធ្វើការ Cache Files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Service Worker: កំពុង Cache ឯកសារ...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate និងលុប Cache ចាស់ៗចោល ពេលមាន Update ថ្មី
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: លុប Cache ចាស់', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Fetch - ទាញយកទិន្នន័យពី Cache មកបង្ហាញពេល Offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // បើមានក្នុង Cache គឺបង្ហាញពី Cache បើអត់ទេទាញពី Network ធម្មតា
            return response || fetch(event.request);
        })
    );
});
