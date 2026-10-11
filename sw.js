// Service worker : rend l'app installable et utilisable avec une connexion faible.
// Réseau d'abord : tes modifications apparaissent tout de suite. Le cache ne sert qu'en secours hors-ligne.
const V = 'validatec-v1';   // change le numéro pour forcer un nettoyage du cache
const COEUR = ['index.html', 'css/commun.css', 'js/slider.js', 'js/pwa.js', 'img/logo-icone.png', 'img/logo-complet.png', 'img/fond.jpg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(COEUR.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const ok = u.origin === location.origin || u.hostname === 'www.gstatic.com';   // jamais les appels Firebase (auth, base de données)
  if (e.request.method !== 'GET' || !ok) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
