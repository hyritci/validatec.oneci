// Page « Point du jour » du chef / sous-chef : fenêtre « Pour… » (moi-même / un agent) et choix de l'agent.
import { LISTE } from '../data/agents.js';
import { listeRecherche } from './liste-recherche.js';

const $ = id => document.getElementById(id);
const modal = $('modal-pour'), nomMoi = $('nom-moi'), nomAgent = $('nom-agent'), choix = $('choix-agent'), changer = $('changer');
let pour = null, agent = null;               // pour = 'moi' ou 'agent'

// Liste de recherche des agents (data/agents.js), comme les autres recherches
listeRecherche(choix, LISTE, x => (agent = x));
choix.querySelector('.lr-btn span').textContent = "Nom et prénoms de l'agent";

const ouvrir = () => { modal.hidden = false; document.body.style.overflow = 'hidden'; $('pour-moi').focus(); };
const choisir = mode => {
  pour = mode;
  modal.hidden = true; document.body.style.overflow = '';
  nomMoi.hidden = mode !== 'moi';            // moi-même : mon nom
  choix.hidden = mode !== 'agent';           // un agent : la liste de recherche
  changer.hidden = false;
};
$('pour-moi').onclick = () => choisir('moi');
$('pour-agent').onclick = () => choisir('agent');
changer.onclick = ouvrir;
ouvrir();                                    // la fenêtre s'affiche dès l'ouverture de la page

export const cible = () => pour === 'agent' ? { pour, id: agent.id, nom: agent.nom } : { pour: 'moi' };

export function verifier() {                 // appelé au clic sur SUIVANT
  if (!pour) { ouvrir(); return { texte: 'Choisis pour qui tu fais le point.' }; }
  if (pour === 'agent' && !agent) return { texte: "Choisis l'agent dans la liste.", el: choix.querySelector('.lr-btn') };
  return null;
}

export function vueResume(resume) {          // résumé : le nom de l'agent remplace la liste
  changer.hidden = resume;
  if (pour !== 'agent') return;
  choix.hidden = resume;
  nomAgent.hidden = !resume;
  if (resume) nomAgent.textContent = agent.nom;
}