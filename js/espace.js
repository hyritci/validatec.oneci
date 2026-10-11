// Protège la page d'accueil de chaque espace : redirige vers la connexion si personne n'est connecté.
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
export function espace(profil) {
  onAuthStateChanged(auth, async u => {
    if (!u) return (location.href = "connexion.html");
    const p = await getDoc(doc(db, "users", u.uid));
    if (!p.exists() || p.data().profil !== profil) { await signOut(auth); return (location.href = "connexion.html"); }
    const nom = p.data().nom;
    const b = document.getElementById("bonjour"); if (b) b.textContent = "Bonjour, " + nom;
    document.querySelectorAll("[data-nom]").forEach(x => (x.textContent = nom));
    document.querySelectorAll("[data-initiales]").forEach(x => (x.textContent = nom.split(" ").slice(0, 2).map(m => m[0]).join("")));
  });
  document.getElementById("quitter").onclick = async () => { await signOut(auth); location.href = "connexion.html"; };
}