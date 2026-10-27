import { LIEUX } from '../data/lieux.js';
import { SCENARIOS } from '../data/scenarios.js';
import { auth, db } from './firebase-config.js';
import { collection, addDoc, doc, getDoc, getDocs, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Nom EXACT de la collection Firestore qui reçoit les points (copie-le tel qu'il apparaît dans la console Firebase)
const COLLECTION = 'point du jour';

const $ = id => document.getElementById(id);
const lieu = $('lieu'), heure = $('heure'), msg = $('msg');
const main = document.querySelector('main.pj');
// Sur la page chef, le module chef-pour.js gère la fenêtre « Pour… » et le choix de l'agent
const chef = document.documentElement.dataset.profil === 'chef' ? await import('./chef-pour.js') : null;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 1. Date du jour sous le nom
const maintenant = new Date();
const aujourdhui = maintenant.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
$('date-jour').textContent = 'Points du ' + aujourdhui;

// ---------- Un agent déclaré absent aujourd'hui (voir « Les absents ») ne peut pas faire ses points ----------
const aujourdhuiISO = maintenant.toLocaleDateString('sv-SE');
const profilPret = new Promise(resolve => {
  let off = onAuthStateChanged(auth, async u => {
    if (!u) return;
    const p = await getDoc(doc(db, 'users', u.uid));
    if (p.exists()) { off(); resolve(p.data()); }
  });
});
async function estAbsent(id) {
  try {
    const r = await getDocs(query(collection(db, 'absents'), where('agentId', '==', id), where('dateISO', '==', aujourdhuiISO)));
    return !r.empty;
  } catch (e) { console.warn('Vérification des absences impossible :', e.code || e.message); return false; }
}
let bloque = '', jetonAbsence = 0;
const bandeau = document.createElement('p');
bandeau.className = 'msg'; bandeau.style.cssText = 'margin:14px 0 0;font-weight:700;text-align:center'; bandeau.hidden = true;
main.querySelector('.identite').after(bandeau);
async function controlerAbsence() {
  const mon = ++jetonAbsence;
  let id = null, texte = '';
  if (chef) {
    if (chef.verifier()) id = null;                                   // mode ou agent pas encore choisi
    else { const c = chef.cible(); if (c.pour === 'agent') { id = c.id; texte = `${c.nom} est déclaré absent aujourd'hui : ses points ne peuvent pas être faits.`; } }
  } else { id = (await profilPret).id; texte = "Tu es déclaré absent aujourd'hui : tu ne peux pas faire tes points."; }
  const absent = id ? await estAbsent(id) : false;
  if (mon !== jetonAbsence) return;
  bloque = absent ? texte : '';
  bandeau.textContent = bloque; bandeau.hidden = !absent; $('suivant').disabled = absent;
}
if (chef) {
  let t; const planifier = () => { clearTimeout(t); t = setTimeout(controlerAbsence, 80); };
  document.addEventListener('cible-changee', planifier);                                    // envoyé par chef-pour.js
  ['pour-moi', 'pour-agent'].forEach(i => $(i).addEventListener('click', planifier));       // au cas où l'ancien chef-pour.js est en place
  $('choix-agent').addEventListener('click', planifier);
} else controlerAbsence();

// 2. Lieu → heures
LIEUX.forEach((l, i) => lieu.add(new Option(l.nom, i)));
const majResume = () => {
  const ok = lieu.value !== '' && heure.value !== '';
  $('resume').hidden = !ok;
  if (ok) $('resume').textContent = `${LIEUX[lieu.value].nom} · ${heure.value}`;
};
lieu.onchange = () => {
  heure.length = 1;                                   // garde seulement « Choisir l'heure »
  const l = LIEUX[lieu.value];
  l.heures.forEach(h => heure.add(new Option(h, h)));
  heure.disabled = false;
  if (l.heures.length === 1) heure.value = l.heures[0]; // un seul horaire : choisi automatiquement
  majResume();
};
heure.onchange = majResume;

// Règle : dans un scénario déverrouillé, la somme des autres champs doit être égale à ce champ (le total)
const CHAMP_TOTAL = 'Dt';
const totaux = c => {
  let dt = null, somme = 0, saisi = false;
  c.querySelectorAll('.ch').forEach(i => {
    if (i.value !== '') saisi = true;
    if (i.dataset.champ === CHAMP_TOTAL) dt = Number(i.value) || 0; else somme += Number(i.value) || 0;
  });
  return { dt, somme, saisi };
};
const majSomme = c => {                                // petit indicateur en direct sous les champs
  const p = c.querySelector('.sc-somme'); if (!p) return;
  const { dt, somme, saisi } = totaux(c);
  p.hidden = !c.classList.contains('actif') || !saisi || dt === null;
  p.textContent = `Total des champs : ${somme} / ${CHAMP_TOTAL} : ${dt}`;
  p.className = 'sc-somme ' + (somme === dt ? 'ok' : 'ko');
};

// 3 et 4. Scénarios : nom complet quand verrouillé, sigle + champs quand déverrouillé
const zone = $('scenarios');
SCENARIOS.forEach(s => {
  const c = document.createElement('div');
  c.className = 'sc'; c.dataset.id = s.id; c.dataset.sigle = s.sigle || s.nom;
  c.innerHTML = `<label class="sc-tete"><span class="sc-nom">${s.nom}</span>
      <input type="checkbox" role="switch" class="sw"><i class="sw-ui"></i></label>
    ${s.champs.length ? `<div class="sc-champs" hidden>${s.champs.map(h =>
      `<input class="ch" inputmode="numeric" maxlength="5" placeholder="${h}" aria-label="${h}" data-champ="${h}">`).join('')}</div><p class="sc-somme" hidden></p>` : ''}`;
  const sw = c.querySelector('.sw'), champs = c.querySelector('.sc-champs');
  sw.onchange = () => {
    c.classList.toggle('actif', sw.checked);
    c.querySelector('.sc-nom').textContent = sw.checked && s.sigle ? s.sigle : s.nom;
    if (champs) champs.hidden = !sw.checked;
    majSomme(c);
  };
  if (champs) champs.oninput = e => {
    e.target.value = e.target.value.replace(/\D/g, '');   // chiffres seulement
    majSomme(c);
  };
  zone.append(c);
});

// ---------- Page « Résumé des points » (affichée à la place du formulaire) ----------
const formulaire = [...main.children].filter(el => !el.classList.contains('identite')); // tout sauf nom + date
const banniere = document.createElement('div');
banniere.className = 'resume-titre'; banniere.hidden = true;
banniere.innerHTML = "<h2>Résumé des points</h2><p>Vérifie les informations avant d'envoyer.</p>";
const vue = document.createElement('section');
vue.className = 'resume-vue'; vue.hidden = true;
main.prepend(banniere); main.append(vue);

const montrer = resume => {                                // true = résumé, false = formulaire
  formulaire.forEach(el => (el.hidden = resume));
  banniere.hidden = vue.hidden = !resume;
  if (chef) chef.vueResume(resume);
  scrollTo({ top: 0, behavior: 'smooth' });
};

function afficherResume(d) {
  vue.innerHTML = `
    <div class="infos">
      <div class="info"><small>Lieu</small><b>${esc(d.lieu)}</b></div>
      <div class="info"><small>Heure</small><b>${esc(d.heure)}</b></div>
    </div>
    ${Object.values(d.scenarios).map(s => `
      <div class="rsc">
        <div class="rsc-nom">${esc(s.sigle || s.nom)}${s.sigle ? `<span>${esc(s.nom)}</span>` : ''}</div>
        ${s.champs ? `<div class="puces">${Object.entries(s.champs).map(([k, v]) =>
          `<div class="puce"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      </div>`).join('')}
    <label class="confirme"><input type="checkbox" id="confirme"><i></i><span>Je confirme les informations</span></label>
    <p class="msg" id="msg-resume" role="alert"></p>
    <button class="btn modifier" id="modifier">« MODIFIER</button>
    <button class="btn envoyer" id="envoyer" disabled>ENVOYER</button>`;
  $('confirme').onchange = e => ($('envoyer').disabled = !e.target.checked); // grisé tant que non coché
  $('modifier').onclick = () => montrer(false);                              // retour au formulaire (valeurs conservées)
  $('envoyer').onclick = () => envoyer(d);
  montrer(true);
}

// Envoi dans Firestore
async function envoyer(d) {
  const m = $('msg-resume'), b = $('envoyer');
  const u = auth.currentUser;
  if (!u) { m.textContent = 'Session expirée. Reconnecte-toi.'; return; }
  b.disabled = $('modifier').disabled = $('confirme').disabled = true;
  b.textContent = 'Envoi…'; m.textContent = '';
  try {
    const p = await getDoc(doc(db, 'users', u.uid));
    if (!p.exists()) throw { code: 'profil-introuvable' };
    const sujet = d.agent || { id: p.data().id, nom: p.data().nom };   // la personne concernée par le point
    if (await estAbsent(sujet.id)) throw { code: 'absent' };           // dernier contrôle avant l'envoi
    await addDoc(collection(db, COLLECTION), {
      uid: u.uid, pour: d.agent ? 'agent' : 'moi', agentId: sujet.id, nom: sujet.nom,
      ...(d.agent ? { saisiParNom: p.data().nom } : {}),                // chef qui a saisi le point pour un agent
      date: d.date, dateISO: d.dateISO, lieu: d.lieu, heure: d.heure,
      scenarios: d.scenarios, envoyeLe: serverTimestamp()
    });
    banniere.hidden = true;
    vue.innerHTML = `<div class="succes"><div class="coche">✓</div><h3>Point envoyé</h3>
      ${d.agent ? `<p><b>${esc(d.agent.nom)}</b></p>` : ''}<p>${esc(d.lieu)} · ${esc(d.heure)}</p>
      <a class="btn" href="accueil.html">Retour à l'accueil</a>
      <button class="btn vide" id="nouveau">Saisir un autre point</button></div>`;
    $('nouveau').onclick = () => location.reload();
  } catch (e) {
    m.textContent = e.code === 'absent' ? "Cet agent est déclaré absent aujourd'hui : les points ne peuvent pas être envoyés."
      : e.code === 'permission-denied'
      ? 'Envoi refusé : vérifie les règles Firebase et le nom de la collection.'
      : "Envoi impossible. Vérifie ta connexion puis réessaie.";
    b.textContent = 'ENVOYER';
    b.disabled = $('modifier').disabled = $('confirme').disabled = false;
  }
}

// SUIVANT : vérifie puis affiche le résumé
const erreur = (texte, el) => {
  msg.textContent = texte;
  if (el) { el.classList.add('erreur'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
};
$('suivant').onclick = () => {
  msg.textContent = '';
  document.querySelectorAll('.erreur').forEach(x => x.classList.remove('erreur'));
  if (bloque) return erreur(bloque);
  if (chef) { const e = chef.verifier(); if (e) return erreur(e.texte, e.el); }
  if (!lieu.value) return erreur('Choisis le lieu.', lieu);
  if (!heure.value) return erreur("Choisis l'heure.", heure);
  const actifs = [...zone.querySelectorAll('.sc.actif')];
  if (!actifs.length) return erreur('Déverrouille au moins un scénario.');
  const cible = chef ? chef.cible() : { pour: 'moi' };
  const d = { agent: cible.pour === 'agent' ? { id: cible.id, nom: cible.nom } : null, date: aujourdhui, dateISO: maintenant.toLocaleDateString('sv-SE'), lieu: LIEUX[lieu.value].nom, heure: heure.value, scenarios: {} };
  for (const c of actifs) {
    const s = SCENARIOS.find(x => x.id === c.dataset.id);
    const sc = { nom: s.nom };
    if (s.sigle) sc.sigle = s.sigle;
    const champs = {};
    for (const i of c.querySelectorAll('.ch')) {
      if (i.value === '') return erreur(`Renseigne tous les champs de ${c.dataset.sigle}.`, i);
      champs[i.dataset.champ] = Number(i.value);
    }
    const { dt, somme } = totaux(c);
    if (dt !== null && somme !== dt) {
      c.querySelectorAll('.ch').forEach(i => i.classList.add('erreur'));
      return erreur(`${c.dataset.sigle} : la somme des champs (${somme}) doit être égale à ${CHAMP_TOTAL} (${dt}).`, c.querySelector(`[data-champ="${CHAMP_TOTAL}"]`));
    }
    if (s.champs.length) sc.champs = champs;
    d.scenarios[s.id] = sc;
  }
  afficherResume(d);
};