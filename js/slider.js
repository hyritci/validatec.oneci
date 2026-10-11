// Page d'accueil : glisse (ou touche les points) pour passer du profil agent au profil chef et sous-chef.
const SLIDES = [
  { p: 'agent', badge: 'Profil agent', titre: "APPLICATION DE L'AGENT DE VALIDATION" },
  { p: 'chef', badge: 'Profil chef et sous-chef', titre: 'ESPACE CHEF ET SOUS-CHEF' }
];
const $ = id => document.getElementById(id);
let i = 0;
function voir(n) {
  i = (n + SLIDES.length) % SLIDES.length;
  const s = SLIDES[i];
  document.documentElement.dataset.profil = s.p;
  $('badge').textContent = s.badge; $('titre').textContent = s.titre;
  $('co').href = `${s.p}/connexion.html`; $('ins').href = `${s.p}/inscription.html`;
  document.querySelectorAll('.points i').forEach((d, k) => d.classList.toggle('on', k === i));
}
document.querySelectorAll('.points i').forEach((d, k) => d.onclick = () => voir(k));
let x0 = null;
$('fond').ontouchstart = e => (x0 = e.touches[0].clientX);
$('fond').ontouchend = e => {
  if (x0 === null) return;
  const d = e.changedTouches[0].clientX - x0;
  if (Math.abs(d) > 50) voir(i + (d < 0 ? 1 : -1));
  x0 = null;
};
voir(0);
