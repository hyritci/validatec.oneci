import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Noms EXACTS des collections Firestore (copie-les tels qu'ils apparaissent dans la console Firebase)
const COLLECTION = 'justificatif';   // les justificatifs envoyés
const ABSENTS = 'absents';           // les absences déclarées par les chefs

const TAILLE_PARTIE = 700000;        // un fichier est découpé en morceaux de 700 000 caractères (limite d'un document Firestore)
const PDF_MAX = 1.5 * 1024 * 1024;   // taille maximale d'un PDF
const TOTAL_MAX = 7000000;           // taille maximale de tous les fichiers (en caractères)

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const frDe = iso => iso.split('-').reverse().join('/');
const chef = document.documentElement.dataset.profil === 'chef' ? await import('./chef-pour.js') : null;

const maintenant = new Date();
const aujourdhui = maintenant.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Profil de la personne connectée (nom, identifiant)
const profilPret = new Promise(resolve => {
  let off = onAuthStateChanged(auth, async u => {
    if (!u) return;
    const p = await getDoc(doc(db, 'users', u.uid));
    if (p.exists()) { off(); resolve(p.data()); }
  });
});

// ---------- Étapes : 0 = dates, 1 = justifier, 2 = confirmation ----------
const ETAPES = ['etape-dates', 'etape-justifier', 'etape-confirmation'];
const aller = n => {
  ETAPES.forEach((id, i) => ($(id).hidden = i !== n));
  if (chef) chef.vueResume(n > 0);                       // chef : le nom de l'agent remplace la liste
  scrollTo({ top: 0, behavior: 'smooth' });
};
const erreur = (texte, el, zone = 'msg') => {
  $(zone).textContent = texte;
  if (el) { el.classList.add('erreur'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
};

// ---------- 1. Dates d'absence (déclarées par les chefs dans « Les absents ») ----------
let absencesIso = new Set(), justifieesIso = new Set(), manuelles = new Set(), selection = new Set(), jeton = 0, derniereCle = null, idCourant = '';

function dessiner() {
  const toutes = new Set([...absencesIso, ...justifieesIso, ...manuelles]);
  if (!toutes.size) { $('dates').innerHTML = `<p class="aucun">Aucune absence enregistrée pour le moment.<br><small>Identifiant recherché : ${esc(idCourant)}</small></p>`; return; }
  const aJustifier = [...toutes].filter(i => !justifieesIso.has(i)).sort();
  const justifiees = [...toutes].filter(i => justifieesIso.has(i)).sort();
  $('dates').innerHTML = aJustifier.map(i => {
    const on = selection.has(i);
    return `<div class="sc${on ? ' actif' : ''}" data-iso="${i}"><label class="sc-tete"><span class="sc-nom">${frDe(i)}</span>
      <input type="checkbox" role="switch" class="sw"${on ? ' checked' : ''}><i class="sw-ui"></i></label></div>`;
  }).join('') + justifiees.map(i =>
    `<div class="sc justifie"><span class="sc-tete"><span class="sc-nom">${frDe(i)}</span><span class="etiquette">justifié</span></span></div>`).join('');
}
$('dates').addEventListener('change', e => {
  const c = e.target.closest('.sc'); if (!c || !e.target.classList.contains('sw')) return;
  e.target.checked ? selection.add(c.dataset.iso) : selection.delete(c.dataset.iso);
  c.classList.toggle('actif', e.target.checked);
});

async function charger(force) {
  let id = null, pourMoi = true;
  if (chef) {
    const e = chef.verifier();
    if (e) { jeton++; derniereCle = null; $('ajout-date').hidden = true; $('dates').innerHTML = "<p class=\"aucun\">Choisis l'agent pour voir ses absences.</p>"; return; }
    const c = chef.cible(); pourMoi = c.pour === 'moi'; id = c.id;
  }
  const cle = pourMoi ? 'moi' : id;
  if (cle === derniereCle && force !== true) return;     // même cible : on garde les dates déjà cochées
  derniereCle = cle;
  const mon = ++jeton;                                   // ignore les réponses d'un chargement plus ancien
  selection.clear(); manuelles.clear(); $('msg').textContent = ''; $('ajout-date').hidden = true;
  $('dates').innerHTML = '<p class="aucun">Chargement…</p>';
  try {
    const profil = await profilPret;
    if (pourMoi) id = profil.id;
    idCourant = id;
    const [a, j] = await Promise.all([
      getDocs(query(collection(db, ABSENTS), where('agentId', '==', id))),
      getDocs(query(collection(db, COLLECTION), where('agentId', '==', id)))
    ]);
    if (mon !== jeton) return;
    absencesIso = new Set(a.docs.map(d => d.data().dateISO));
    justifieesIso = new Set(j.docs.flatMap(d => d.data().dates || []));
    $('ajout-date').hidden = !(chef && pourMoi);         // chef pour lui-même : il peut ajouter ses dates à la main
    dessiner();
  } catch (e) {
    if (mon !== jeton) return;
    derniereCle = null;                                  // permet de réessayer
    console.error(e);
    $('dates').innerHTML = `<p class="aucun">${e.code === 'permission-denied' ? 'Impossible de charger les absences (règles Firebase non publiées ?).' : 'Chargement impossible : ' + esc(e.code || e.message)}</p>`;
  }
}
if (chef) {
  let t; const planifier = () => { clearTimeout(t); t = setTimeout(charger, 80); };
  document.addEventListener('cible-changee', planifier);                                       // envoyé par chef-pour.js
  ['pour-moi', 'pour-agent'].forEach(id => $(id).addEventListener('click', planifier));        // au cas où l'ancien chef-pour.js est encore en place
  $('choix-agent').addEventListener('click', planifier);
} else charger();

// Ajout manuel d'une date (JJ/MM/AAAA)
const lireDate = s => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] && +m[3] > 2000 ? d : null;
};
$('date-manuelle').addEventListener('input', e => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 8);
  e.target.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
});
$('ajouter-date').onclick = () => {
  $('msg').textContent = '';
  const d = lireDate($('date-manuelle').value.trim());
  if (!d) return erreur('Date invalide (JJ/MM/AAAA).');
  const iso = d.toLocaleDateString('sv-SE');
  manuelles.add(iso); if (!justifieesIso.has(iso)) selection.add(iso);
  $('date-manuelle').value = ''; dessiner();
};

$('suivant').onclick = () => {
  $('msg').textContent = '';
  if (chef) { const e = chef.verifier(); if (e) return erreur(e.texte); }
  if (!selection.size) return erreur("Active au moins une date d'absence.");
  $('dates-choisies').innerHTML = [...selection].sort().map(i => `<div class="date-box">${frDe(i)}</div>`).join('');   // en colonne
  aller(1);
};

// ---------- 2. Justificatifs : 3 cases (appareil photo ou sélection dans le téléphone) ----------
const fichiers = [null, null, null];
let caseCourante = 0;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function majCase(i) {
  const b = document.querySelector(`.case[data-i="${i}"]`), x = document.querySelector(`.case-x[data-x="${i}"]`), f = fichiers[i];
  if (!f) { b.className = 'case'; b.innerHTML = '<span class="plus">+</span><span>ajouter</span><small>pdf, jpeg, png</small>'; x.hidden = true; return; }
  b.className = 'case plein';
  b.innerHTML = f.type === 'application/pdf' ? `<span class="pdf">PDF</span><span class="nom">${esc(f.nom)}</span>` : `<img src="${f.data}" alt="">`;
  x.hidden = false;
}
const lireDataURL = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(new Error('Fichier illisible.')); r.readAsDataURL(f); });
const compresser = f => new Promise((ok, ko) => {          // photo réduite (1600 px max, JPEG) pour rester légère
  const url = URL.createObjectURL(f), img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.75));
  };
  img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image illisible.')); };
  img.src = url;
});
async function lireFichier(f, i) {
  $('msg2').textContent = '';
  try {
    if (!TYPES.includes(f.type)) throw new Error('Format non accepté (pdf, jpeg ou png).');
    let data, nom = f.name || 'photo.jpg', type = f.type;
    if (type === 'application/pdf') {
      if (f.size > PDF_MAX) throw new Error('PDF trop lourd (1,5 Mo maximum). Envoie plutôt une photo.');
      data = await lireDataURL(f);
    } else { data = await compresser(f); type = 'image/jpeg'; nom = nom.replace(/\.\w+$/, '') + '.jpg'; }
    fichiers[i] = { nom, type, data, taille: Math.round(data.length * 0.75) };
    $('cases').classList.remove('erreur'); majCase(i);
  } catch (e) { $('msg2').textContent = e.message; }
}
document.querySelectorAll('.case').forEach(b => (b.onclick = () => { caseCourante = +b.dataset.i; $('src-fond').hidden = false; }));
document.querySelectorAll('.case-x').forEach(b => (b.onclick = () => { fichiers[+b.dataset.x] = null; majCase(+b.dataset.x); }));
$('src-photo').onclick = () => { $('src-fond').hidden = true; $('in-photo').click(); };
$('src-fichier').onclick = () => { $('src-fond').hidden = true; $('in-fichier').click(); };
$('src-annuler').onclick = () => ($('src-fond').hidden = true);
['in-photo', 'in-fichier'].forEach(id => ($(id).onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (f) await lireFichier(f, caseCourante);
}));

// ---------- 3. Envoi dans Firestore ----------
$('confirme').onchange = e => ($('envoyer').disabled = !e.target.checked);   // grisé tant que non coché
$('modifier').onclick = () => aller(0);
$('envoyer').onclick = async () => {
  $('msg2').textContent = ''; $('motif').classList.remove('erreur'); $('cases').classList.remove('erreur');
  const motif = $('motif').value.trim(), envoyes = fichiers.filter(Boolean);
  if (!motif) return erreur("Renseigne le motif d'absence.", $('motif'), 'msg2');
  if (!envoyes.length) return erreur('Ajoute au moins un justificatif (pdf, jpeg ou png).', $('cases'), 'msg2');
  if (envoyes.reduce((s, f) => s + f.data.length, 0) > TOTAL_MAX) return erreur('Fichiers trop lourds au total. Retire-en un ou envoie des photos.', $('cases'), 'msg2');
  const u = auth.currentUser;
  if (!u) return erreur('Session expirée. Reconnecte-toi.', null, 'msg2');
  const b = $('envoyer');
  b.disabled = $('modifier').disabled = $('confirme').disabled = true; b.textContent = 'Envoi…';
  try {
    const profil = await profilPret;
    const c = chef ? chef.cible() : { pour: 'moi' };
    const sujet = c.pour === 'agent' ? { id: c.id, nom: c.nom } : { id: profil.id, nom: profil.nom };   // la personne concernée
    const isos = [...selection].sort();
    const batch = writeBatch(db), ref = doc(collection(db, COLLECTION));
    batch.set(ref, {
      uid: u.uid, pour: c.pour, agentId: sujet.id, nom: sujet.nom,
      ...(c.pour === 'agent' ? { saisiParNom: profil.nom } : {}),
      dates: isos, datesFr: isos.map(frDe), motif,
      fichiers: envoyes.map(f => ({ nom: f.nom, type: f.type, taille: f.taille })),
      date: aujourdhui, dateISO: maintenant.toLocaleDateString('sv-SE'), envoyeLe: serverTimestamp()
    });
    envoyes.forEach((f, i) => {                          // les fichiers sont enregistrés dans la sous-collection « fichiers »
      const n = Math.ceil(f.data.length / TAILLE_PARTIE);
      for (let p = 0; p < n; p++)
        batch.set(doc(collection(ref, 'fichiers')), { fichier: i, partie: p, parties: n, nom: f.nom, type: f.type, data: f.data.slice(p * TAILLE_PARTIE, (p + 1) * TAILLE_PARTIE) });
    });
    await batch.commit();
    isos.forEach(i => justifieesIso.add(i)); selection.clear(); dessiner();      // les dates passent en vert « justifié »
    $('conf-texte').textContent = `${isos.length} date(s) justifiée(s)${c.pour === 'agent' ? ' pour ' + sujet.nom : ''}`;
    $('motif').value = ''; $('confirme').checked = false; fichiers.fill(null); [0, 1, 2].forEach(majCase);
    aller(2);
  } catch (e) {
    $('msg2').textContent = e.code === 'permission-denied'
      ? 'Envoi refusé : vérifie les règles Firebase et le nom de la collection.'
      : "Envoi impossible. Vérifie ta connexion puis réessaie.";
  }
  b.textContent = 'ENVOYER'; b.disabled = !$('confirme').checked; $('modifier').disabled = $('confirme').disabled = false;
};
$('autres').onclick = () => aller(0);