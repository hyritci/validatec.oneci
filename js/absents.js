import { auth, db } from './firebase-config.js';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { LISTE } from '../data/agents.js';
import { listeRecherche } from './liste-recherche.js';

// Nom EXACT de la collection Firestore qui reçoit les absents (copie-le tel qu'il apparaît dans la console Firebase)
const COLLECTION = 'absents';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const main = document.querySelector('main.pj'), msg = $('msg'), zone = $('lignes');

const maintenant = new Date();
const aujourdhui = maintenant.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
$('date-jour').textContent = 'du ' + aujourdhui;

// ---------- Lignes : « + ajouter » crée une nouvelle liste de recherche (liste des agents : data/agents.js) ----------
const lignes = [];
const numeroter = () => lignes.forEach((l, i) => (l.num.textContent = i + 1));

function ajouterLigne(ouvrir) {
  const el = document.createElement('div');
  el.className = 'ligne-absent';
  el.innerHTML = '<span class="num"></span><div class="choix"></div><button type="button" class="retirer" aria-label="Retirer cet agent">✕</button>';
  const l = { el, choix: null, num: el.querySelector('.num') }, liste = el.querySelector('.choix');
  listeRecherche(liste, LISTE, x => { l.choix = x; el.classList.remove('erreur-ligne'); });
  liste.querySelector('.lr-btn span').textContent = "Nom et prénoms de l'agent";
  el.querySelector('.retirer').onclick = () => retirer(l);
  lignes.push(l); zone.append(el); numeroter();
  if (ouvrir) {                                      // la liste s'ouvre tout de suite, prête à taper un nom
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => liste.querySelector('.lr-btn').click(), 60);
  }
}
function retirer(l) {
  l.el.remove(); lignes.splice(lignes.indexOf(l), 1);
  if (lignes.length) numeroter(); else ajouterLigne(false);   // il reste toujours une ligne
}
ajouterLigne(false);
$('ajouter').onclick = () => ajouterLigne(true);

// ---------- Résumé (affiché à la place du formulaire) ----------
const formulaire = [...main.children].filter(el => !el.classList.contains('identite'));
const banniere = document.createElement('div');
banniere.className = 'resume-titre'; banniere.hidden = true;
banniere.innerHTML = "<h2>Résumé des absents</h2><p>Vérifie les informations avant d'envoyer.</p>";
const vue = document.createElement('section');
vue.className = 'resume-vue'; vue.hidden = true;
main.prepend(banniere); main.append(vue);
const montrer = resume => {
  formulaire.forEach(el => (el.hidden = resume));
  $('titre-page').hidden = resume;
  banniere.hidden = vue.hidden = !resume;
  scrollTo({ top: 0, behavior: 'smooth' });
};

function afficherResume(d) {
  vue.innerHTML = `<p class="compte">${d.absents.length} agent(s) absent(s)</p>
    <ol class="liste-absents">${d.absents.map((a, i) => `<li><span class="num">${i + 1}</span>${esc(a.nom)}</li>`).join('')}</ol>
    <label class="confirme"><input type="checkbox" id="confirme"><i></i><span>Je confirme les informations</span></label>
    <p class="msg" id="msg-resume" role="alert"></p>
    <button class="btn modifier" id="modifier">« MODIFIER</button>
    <button class="btn envoyer" id="envoyer" disabled>ENVOYER</button>`;
  $('confirme').onchange = e => ($('envoyer').disabled = !e.target.checked);   // grisé tant que non coché
  $('modifier').onclick = () => montrer(false);                                // retour à la saisie (liste conservée)
  $('envoyer').onclick = () => envoyer(d);
  montrer(true);
}

// ---------- Envoi dans Firestore, puis confirmation ----------
async function envoyer(d) {
  const m = $('msg-resume'), b = $('envoyer'), u = auth.currentUser;
  if (!u) { m.textContent = 'Session expirée. Reconnecte-toi.'; return; }
  b.disabled = $('modifier').disabled = $('confirme').disabled = true;
  b.textContent = 'Envoi…'; m.textContent = '';
  try {
    const p = await getDoc(doc(db, 'users', u.uid));
    if (!p.exists()) throw { code: 'profil-introuvable' };
    await addDoc(collection(db, COLLECTION), {
      uid: u.uid, chefId: p.data().id, chefNom: p.data().nom, fonction: p.data().fonction || null,
      date: d.date, dateISO: d.dateISO, absents: d.absents, nombre: d.absents.length, envoyeLe: serverTimestamp()
    });
    banniere.hidden = true;
    vue.innerHTML = `<div class="succes"><div class="coche">✓</div><h3>Absents envoyés</h3>
      <p>${d.absents.length} agent(s) absent(s) · ${esc(d.date)}</p>
      <a class="btn" href="accueil.html">Retour à l'accueil</a>
      <button class="btn vide" id="nouveau">Nouvel envoi</button></div>`;
    $('nouveau').onclick = () => location.reload();
  } catch (e) {
    m.textContent = e.code === 'permission-denied'
      ? 'Envoi refusé : vérifie les règles Firebase et le nom de la collection.'
      : "Envoi impossible. Vérifie ta connexion puis réessaie.";
    b.textContent = 'ENVOYER';
    b.disabled = $('modifier').disabled = $('confirme').disabled = false;
  }
}

// ---------- SUIVANT : vérifie puis affiche la liste des agents sélectionnés ----------
const erreur = (texte, el) => {
  msg.textContent = texte;
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
};
$('suivant').onclick = () => {
  msg.textContent = '';
  lignes.forEach(l => l.el.classList.remove('erreur-ligne'));
  const choisis = lignes.filter(l => l.choix);                       // les lignes vides sont ignorées
  if (!choisis.length) { lignes[0].el.classList.add('erreur-ligne'); return erreur('Ajoute au moins un agent absent.', lignes[0].el); }
  const vus = new Set();
  for (const l of choisis) {
    if (vus.has(l.choix.id)) { l.el.classList.add('erreur-ligne'); return erreur(`${l.choix.nom} est ajouté deux fois.`, l.el); }
    vus.add(l.choix.id);
  }
  afficherResume({
    date: aujourdhui, dateISO: maintenant.toLocaleDateString('sv-SE'),
    absents: choisis.map(l => ({ id: l.choix.id, nom: l.choix.nom }))
  });
};