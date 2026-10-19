import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { demanderSignature } from './signature.js';
import { genererPDF } from './permission-pdf.js';

// Nom EXACT de la collection Firestore qui reçoit les demandes (copie-le tel qu'il apparaît dans la console Firebase)
const COLLECTION = 'demande de permission';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chiffres = v => v.replace(/\D/g, '');
const chef = document.documentElement.dataset.profil === 'chef' ? await import('./chef-pour.js') : null;
const main = document.querySelector('main.pj'), msg = $('msg');

// Date du jour
const maintenant = new Date();
const aujourdhui = maintenant.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
$('date-jour').textContent = 'Demande permission du ' + aujourdhui;

// Préremplissage (modifiable) : téléphone et fonction de la personne connectée
let profil = null, dernier = { tel: '', fonction: '' };
const remplir = pour => {
  if (!profil) return;
  const fonctionMoi = profil.profil === 'chef' ? (profil.fonction === 'SOUS-CHEF' ? 'Sous-chef' : "Chef d'équipe") : 'Agent validateur';
  const m = pour === 'agent' ? { tel: '', fonction: 'Agent validateur' } : { tel: profil.telephone || '', fonction: fonctionMoi };
  [['tel', 'tel'], ['fonction', 'fonction']].forEach(([id, k]) => { const el = $(id); if (el.value === '' || el.value === dernier[k]) el.value = m[k]; });
  dernier = m;
};
onAuthStateChanged(auth, async u => {
  if (!u || profil) return;
  const p = await getDoc(doc(db, 'users', u.uid));
  if (p.exists()) { profil = p.data(); remplir('moi'); }
});
if (chef) { $('pour-moi').addEventListener('click', () => remplir('moi')); $('pour-agent').addEventListener('click', () => remplir('agent')); }

// Dates : saisie en JJ/MM/AAAA
document.querySelectorAll('.date-champ').forEach(i => i.addEventListener('input', () => {
  const d = chiffres(i.value).slice(0, 8);
  i.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}));
const lireDate = s => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] && +m[3] > 2000 ? d : null;
};

// Signature
let signature = null;
$('signature-boite').onclick = async () => {
  const s = await demanderSignature();
  if (!s) return;
  signature = s;
  $('signature-boite').innerHTML = `<img src="${s}" alt="Ta signature">`;
  $('signature-boite').classList.remove('erreur');
};

// ---------- Résumé (affiché à la place du formulaire) ----------
const formulaire = [...main.children].filter(el => !el.classList.contains('identite'));
const banniere = document.createElement('div');
banniere.className = 'resume-titre'; banniere.hidden = true;
banniere.innerHTML = "<h2>Résumé de la demande</h2><p>Vérifie les informations avant d'envoyer.</p>";
const vue = document.createElement('section');
vue.className = 'resume-vue'; vue.hidden = true;
main.prepend(banniere); main.append(vue);
const montrer = resume => {
  formulaire.forEach(el => (el.hidden = resume));
  banniere.hidden = vue.hidden = !resume;
  if (chef) chef.vueResume(resume);
  scrollTo({ top: 0, behavior: 'smooth' });
};

const LIGNES = [['Matricule', 'matricule'], ['Fonction', 'fonction'], ['Téléphone', 'telephone'], ['Adresse électronique', 'email'],
  ['Service', 'service'], ['Lieu de service', 'lieuService'], ["Motif de l'absence", 'motif', 'plein'], ['Destination', 'destination', 'plein'],
  ["Période d'absence", 'periode', 'plein'], ['Durée', 'duree'], ['Date de reprise', 'dateReprise']];

function afficherResume(d) {
  const valeur = k => (k === 'periode' ? `Du ${d.periodeDu} au ${d.periodeAu}` : d[k]) || '—';
  vue.innerHTML = `<dl class="fiche">${LIGNES.map(([l, k, c]) => `<div class="${c || ''}"><dt>${l}</dt><dd>${esc(valeur(k))}</dd></div>`).join('')}</dl>
    <div class="sig-resume"><small>Signature</small><img src="${d.signature}" alt="Signature"></div>
    <label class="confirme"><input type="checkbox" id="confirme"><i></i><span>Je confirme les informations</span></label>
    <p class="msg" id="msg-resume" role="alert"></p>
    <button class="btn modifier" id="modifier">« MODIFIER</button>
    <button class="btn envoyer" id="envoyer" disabled>ENVOYER</button>`;
  $('confirme').onchange = e => ($('envoyer').disabled = !e.target.checked);
  $('modifier').onclick = () => montrer(false);
  $('envoyer').onclick = () => envoyer(d);
  montrer(true);
}

// ---------- Envoi dans Firestore, puis page de confirmation ----------
async function envoyer(d) {
  const m = $('msg-resume'), b = $('envoyer'), u = auth.currentUser;
  if (!u) { m.textContent = 'Session expirée. Reconnecte-toi.'; return; }
  b.disabled = $('modifier').disabled = $('confirme').disabled = true;
  b.textContent = 'Envoi…'; m.textContent = '';
  try {
    const p = await getDoc(doc(db, 'users', u.uid));
    if (!p.exists()) throw { code: 'profil-introuvable' };
    const sujet = d.agent || { id: p.data().id, nom: p.data().nom };   // la personne concernée par la demande
    const { agent, ...champs } = d;
    await addDoc(collection(db, COLLECTION), {
      uid: u.uid, pour: agent ? 'agent' : 'moi', agentId: sujet.id, nom: sujet.nom,
      ...(agent ? { saisiParNom: p.data().nom } : {}),
      ...champs, envoyeLe: serverTimestamp()
    });
    confirmer(d, sujet.nom);
  } catch (e) {
    m.textContent = e.code === 'permission-denied'
      ? 'Envoi refusé : vérifie les règles Firebase et le nom de la collection.'
      : "Envoi impossible. Vérifie ta connexion puis réessaie.";
    b.textContent = 'ENVOYER';
    b.disabled = $('modifier').disabled = $('confirme').disabled = false;
  }
}

function confirmer(d, nom) {
  banniere.hidden = true;
  vue.innerHTML = `<div class="succes"><div class="coche">✓</div><h3>Demande envoyée</h3>
    ${d.agent ? `<p><b>${esc(nom)}</b></p>` : ''}<p>Du ${esc(d.periodeDu)} au ${esc(d.periodeAu)}</p>
    <p class="msg" id="msg-pdf" role="alert"></p>
    <button class="btn telecharger" id="telecharger">TÉLÉCHARGER (PDF)</button>
    <a class="btn vide" href="accueil.html">Retour à l'accueil</a>
    <button class="btn vide" id="nouveau">Faire une autre demande</button></div>`;
  $('nouveau').onclick = () => location.reload();
  $('telecharger').onclick = async () => {
    const b = $('telecharger'); b.disabled = true; $('msg-pdf').textContent = '';
    try { await genererPDF({ ...d, nom }); }
    catch (e) { console.error(e); $('msg-pdf').textContent = "Le PDF n'a pas pu être créé : " + (e.message || e); }
    b.disabled = false;
  };
}

// ---------- SUIVANT : vérifie puis affiche le résumé ----------
const erreur = (texte, el) => {
  msg.textContent = texte;
  if (el) { el.classList.add('erreur'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
};
$('suivant').onclick = () => {
  msg.textContent = '';
  document.querySelectorAll('.erreur').forEach(x => x.classList.remove('erreur'));
  if (chef) { const e = chef.verifier(); if (e) return erreur(e.texte, e.el); }
  const v = id => $(id).value.trim();
  const controles = [
    ['fonction', 'Renseigne la fonction.', v('fonction')],
    ['tel', 'Téléphone invalide (10 chiffres).', chiffres(v('tel')).length === 10],
    ['email', 'Adresse électronique invalide.', !v('email') || /^\S+@\S+\.\S+$/.test(v('email'))],   // matricule et e-mail : facultatifs
    ['service', 'Renseigne le service.', v('service')],
    ['lieu', 'Renseigne le lieu de service.', v('lieu')],
    ['motif', "Renseigne le motif de l'absence.", v('motif')],
    ['destination', 'Renseigne la destination.', v('destination')],
    ['du', 'Date de début invalide (JJ/MM/AAAA).', lireDate(v('du'))],
    ['au', 'Date de fin invalide (JJ/MM/AAAA).', lireDate(v('au'))],
    ['duree', 'Renseigne la durée (ex. 01 JOUR).', v('duree')],
    ['reprise', 'Date de reprise invalide (JJ/MM/AAAA).', lireDate(v('reprise'))]
  ];
  for (const [id, texte, ok] of controles) if (!ok) return erreur(texte, $(id));
  if (lireDate(v('au')) < lireDate(v('du'))) return erreur('La date de fin doit être après la date de début.', $('au'));
  if (lireDate(v('reprise')) <= lireDate(v('au'))) return erreur("La date de reprise doit être après la fin de l'absence.", $('reprise'));
  if (!signature) return erreur('Signe la demande (touche le cadre « Signature »).', $('signature-boite'));
  const cible = chef ? chef.cible() : { pour: 'moi' };
  afficherResume({
    agent: cible.pour === 'agent' ? { id: cible.id, nom: cible.nom } : null,
    date: aujourdhui, dateISO: maintenant.toLocaleDateString('sv-SE'),
    matricule: v('matricule'), fonction: v('fonction'), telephone: chiffres(v('tel')), email: v('email'),
    service: v('service'), lieuService: v('lieu'), motif: v('motif'), destination: v('destination'),
    periodeDu: v('du'), periodeAu: v('au'), duree: v('duree'), dateReprise: v('reprise'), signature
  });
};