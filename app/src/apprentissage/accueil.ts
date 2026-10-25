import type { Atlas } from "../donnees";
import type { Parcours } from "./parcours";
import { echapper } from "./seance";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// Premier lancement guidé, en trois étapes : données installées, choix du bloc, premier parcours.

export interface ControleDonnees {
  maillages: number;
  organes: number;
  fiches: { noyau: number; verifiees: number } | null;
  cartes: number | null;
}

export class Accueil {
  private etape = 1;

  constructor(private atlas: Atlas, private premierParcours: () => Parcours | null, private controle: () => ControleDonnees,
              private lancerParcours: (id: string) => void, private fermerRappel: () => void) {
    $("accueil-guide").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-accueil]");
      if (!b) return;
      const a = b.dataset.accueil;
      if (a === "suivant") this.afficher(this.etape + 1);
      else if (a === "precedent") this.afficher(this.etape - 1);
      else if (a === "parcours") {
        const p = this.premierParcours();
        this.fermer();
        if (p) this.lancerParcours(p.id);
      } else if (a === "explorer") this.fermer();
    });
  }

  get ouvert(): boolean {
    return !$("accueil-guide").hidden;
  }

  ouvrir(): void {
    $("accueil-guide").hidden = false;
    this.afficher(1);
  }

  fermer(): void {
    $("accueil-guide").hidden = true;
    this.fermerRappel();
  }

  /** Nombre de structures noyau de ces systèmes. */
  private noyau(...systemes: string[]): number {
    return Object.values(this.atlas.structures).filter((s) => s.niveau === "noyau" && systemes.includes(s.systeme)).length;
  }

  private afficher(etape: number): void {
    this.etape = Math.max(1, Math.min(3, etape));
    const points = [1, 2, 3].map((i) => `<li class="${i === this.etape ? "actif" : i < this.etape ? "fait" : ""}">${i}</li>`).join("");
    let corps = "";
    if (this.etape === 1) {
      const c = this.controle();
      const ligne = (ok: boolean, texte: string) => `<li class="${ok ? "ok" : "warn"}"><span class="etiquette">${ok ? "OK" : "À faire"}</span>${texte}</li>`;
      corps = `<h2>Données installées</h2><ul class="controle">
        ${ligne(c.maillages > 0, `Modèle 3D : ${c.maillages.toLocaleString("fr-FR")} structures prêtes à l'affichage.`)}
        ${ligne(c.organes > 0, `${c.organes} organes et 29 régions pour le focus, légendés.`)}
        ${c.fiches ? ligne(c.fiches.verifiees === c.fiches.noyau, `Fiches : ${c.fiches.verifiees} vérifiées sur ${c.fiches.noyau} ; les autres sont des brouillons à vérifier contre tes ronéos (touche L).`) : ligne(false, "Fiches indisponibles : le lanceur ne répond pas.")}
        ${c.cartes !== null ? ligne(c.cartes > 0, `${c.cartes} cartes de révision prêtes (nommer et localiser) ; les questions sur les relations arrivent avec les fiches vérifiées.`) : ""}
        </ul>`;
    } else if (this.etape === 2) {
      corps = `<h2>Choisis ton bloc</h2>
        <div class="blocs"><button class="bloc actif" disabled><strong>Bloc 1</strong><span>Vaisseaux : ${this.noyau("artère", "veine")} artères et veines</span></button>
        <button class="bloc actif" disabled><strong>Bloc 2</strong><span>Muscles : ${this.noyau("muscle")} muscles</span></button>
        <button class="bloc" disabled><strong>Bloc 3</strong><span>Organes, à venir</span></button>
        <button class="bloc" disabled><strong>Bloc 4</strong><span>Os, à venir</span></button></div>
        <p class="aide">Les organes sont déjà consultables en focus (touche G) ; leurs fiches et leurs cartes arriveront avec le bloc 3.</p>`;
    } else {
      const p = this.premierParcours();
      corps = `<h2>Premier parcours</h2>
        <p>${p ? `Propose : <strong>${echapper(p.titre)}</strong>, ${p.etapes.length} structures, puis un mini-quiz de 5 questions.` : "Aucun parcours disponible."}</p>
        <ul class="astuces"><li><strong>Tourner</strong> : glisser ; <strong>zoomer</strong> : molette ou pincement ; double-clic : cadrer.</li>
        <li><strong>Apprendre</strong> : P pour les parcours, Q pour la révision du jour, B pour tes progrès.</li>
        <li><strong>Tous les raccourcis</strong> : touche ?.</li></ul>`;
    }
    const actions = this.etape < 3
      ? `${this.etape > 1 ? `<button data-accueil="precedent">Précédent</button>` : ""}<button data-accueil="suivant" class="principal">Continuer <kbd>Entrée</kbd></button>`
      : `<button data-accueil="precedent">Précédent</button><button data-accueil="explorer">Explorer d'abord</button>
         <button data-accueil="parcours" class="principal">Lancer le parcours <kbd>Entrée</kbd></button>`;
    $("accueil-guide-contenu").innerHTML = `<ol class="etapes-accueil">${points}</ol>${corps}<div class="seance-actions">${actions}</div>`;
  }

  touche(e: KeyboardEvent): boolean {
    if (!this.ouvert) return false;
    if (e.key === "Enter") {
      e.preventDefault();
      if (this.etape < 3) this.afficher(this.etape + 1);
      else document.querySelector<HTMLButtonElement>('[data-accueil="parcours"]')?.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.fermer();
    }
    return true;
  }
}
