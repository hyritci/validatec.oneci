// Ouvre / ferme le menu latéral (bouton, clic sur le fond sombre, touche Échap).
const btn = document.getElementById('menu-btn'), fond = document.getElementById('menu-fond');
const ouvrir = o => { document.body.classList.toggle('menu-ouvert', o); btn.setAttribute('aria-expanded', o); };
btn.onclick = () => ouvrir(!document.body.classList.contains('menu-ouvert'));
fond.onclick = () => ouvrir(false);
addEventListener('keydown', e => e.key === 'Escape' && ouvrir(false));
document.querySelectorAll('.menu nav a[aria-current]').forEach(a => a.onclick = e => { e.preventDefault(); ouvrir(false); });