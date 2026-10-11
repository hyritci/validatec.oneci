// Enregistre le service worker (nécessaire pour l'installation de l'app).
if ('serviceWorker' in navigator) {
  const base = document.currentScript.src.replace('js/pwa.js', '');
  addEventListener('load', () => navigator.serviceWorker.register(base + 'sw.js').catch(() => {}));
}
