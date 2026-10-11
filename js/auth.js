import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { listeRecherche } from "./liste-recherche.js";

const $ = id => document.getElementById(id);
const dire = t => ($("msg").textContent = t);
// L'utilisateur ne voit jamais cet e-mail : il sert seulement à Firebase (ex. agent_a001@validatec.app)
const email = (profil, id) => `${profil}_${id}@validatec.app`.toLowerCase();
const ERREURS = {
  "auth/email-already-in-use": "Ce nom a déjà un compte. Connecte-toi.",
  "auth/invalid-credential": "Nom ou mot de passe incorrect.",
  "auth/network-request-failed": "Pas de connexion internet.",
  "auth/too-many-requests": "Trop d'essais. Réessaie plus tard."
};
const brancherAfficher = () => document.querySelectorAll("[data-voir]").forEach(b => b.onclick = () => {
  const i = $(b.dataset.voir), cache = i.type === "password";
  i.type = cache ? "text" : "password"; b.textContent = cache ? "Masquer" : "Afficher";
});

export function inscription(profil, liste) {
  let choix = null;
  listeRecherche($("nom"), liste, x => (choix = x)); brancherAfficher();
  $("valider").onclick = async () => {
    const tel = $("tel").value.replace(/\s/g, ""), mdp = $("mdp").value;
    if (!choix) return dire("Choisis ton nom dans la liste.");
    if (!/^\d{10}$/.test(tel)) return dire("Numéro invalide (10 chiffres).");
    if (mdp.length < 8) return dire("Mot de passe : 8 caractères minimum.");
    if (mdp !== $("mdp2").value) return dire("Les mots de passe ne correspondent pas.");
    $("valider").disabled = true; dire("");
    let c;
    try {
      c = await createUserWithEmailAndPassword(auth, email(profil, choix.id), mdp);
      await setDoc(doc(db, "users", c.user.uid), { nom: choix.nom, id: choix.id, fonction: choix.fonction || null, profil, telephone: tel, creeLe: Date.now() });
      location.href = "accueil.html";
    } catch (e) {
      if (c) await c.user.delete().catch(() => {});
      dire(ERREURS[e.code] || "Erreur : " + (e.code || e.message)); $("valider").disabled = false;
    }
  };
}

export function connexion(profil, liste) {
  let choix = null;
  listeRecherche($("nom"), liste, x => (choix = x)); brancherAfficher();
  $("valider").onclick = async () => {
    if (!choix) return dire("Choisis ton nom dans la liste.");
    if (!$("mdp").value) return dire("Entre ton mot de passe.");
    $("valider").disabled = true; dire("");
    try {
      const c = await signInWithEmailAndPassword(auth, email(profil, choix.id), $("mdp").value);
      const p = await getDoc(doc(db, "users", c.user.uid));
      if (!p.exists() || p.data().profil !== profil) { await signOut(auth); throw { code: "auth/invalid-credential" }; }
      location.href = "accueil.html";
    } catch (e) { dire(ERREURS[e.code] || "Erreur : " + (e.code || e.message)); $("valider").disabled = false; }
  };
}
