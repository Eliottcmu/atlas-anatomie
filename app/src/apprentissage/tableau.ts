import type { Atlas } from "../donnees";
import { api, ErreurApi, type Bilan, type Maitrise, type Niveau } from "./api";
import type { Parcours } from "./parcours";
import { echapper } from "./seance";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// Couleurs de maîtrise : indépendantes du code des systèmes, chacune doublée d'une étiquette
export const COULEURS_NIVEAU: Record<Niveau, string> = {
  nouvelle: "#59606b", a_revoir: "#d9774a", en_cours: "#e2bf55", acquise: "#7fb38a",
};
export const NOMS_NIVEAU: Record<Niveau, string> = {
  nouvelle: "pas encore vue", a_revoir: "à revoir", en_cours: "en cours", acquise: "acquise",
};

export interface RappelsTableau {
  etat(action: string, ensuite: string, erreur?: boolean): void;
  colorer(niveaux: Map<string, Niveau> | null): void;
  reviser(): void;
  nouvellesParJour(): number;
  definirNouvellesParJour(n: number): void;
}

export class Tableau {
  coloration = false;
  private confirmation = false;

  constructor(private atlas: Atlas, private parcours: () => Parcours[], private rappels: RappelsTableau) {
    $("tableau").addEventListener("click", (e) => this.clic(e));
    $("tableau").addEventListener("change", (e) => {
      const champ = e.target as HTMLInputElement;
      if (champ.id === "tableau-nouvelles") {
        const n = Math.max(0, Math.min(100, Math.round(Number(champ.value) || 0)));
        this.rappels.definirNouvellesParJour(n);
        champ.value = String(n);
        this.rappels.etat(`Nouvelles cartes : ${n} par jour.`, "Réglage gardé pour les prochaines séances.");
      }
    });
  }

  get ouvert(): boolean {
    return !$("tableau").hidden;
  }

  fermer(): void {
    $("tableau").hidden = true;
    this.confirmation = false;
  }

  async ouvrir(): Promise<void> {
    let bilan: Bilan, maitrise: Maitrise;
    try {
      [bilan, maitrise] = await Promise.all([api.bilan(), api.maitrise()]);
    } catch (e) {
      this.rappels.etat(`Tableau de bord indisponible : ${(e as ErreurApi).message}`, "Relancer l'atlas.", true);
      return;
    }
    const retention = bilan.retention_30j === null ? "–" : `${Math.round(bilan.retention_30j * 100)} %`;
    const maxi = Math.max(1, ...bilan.jours.map((j) => j.revisions));
    const barres = bilan.jours.map((j, i) => {
      const h = (j.revisions / maxi) * 56, hj = (j.justes / maxi) * 56;
      return `<g><title>${j.jour} : ${j.revisions} révisions, ${j.justes} justes</title>
        <rect x="${i * 10}" y="${60 - h}" width="7" height="${h}" class="barre-total"/>
        <rect x="${i * 10}" y="${60 - hj}" width="7" height="${hj}" class="barre-justes"/></g>`;
    }).join("");
    // Maîtrise par parcours (région et système), en barres empilées
    const lignes = this.parcours().map((p) => {
      const compte: Record<Niveau, number> = { nouvelle: 0, a_revoir: 0, en_cours: 0, acquise: 0 };
      for (const e of p.etapes) compte[maitrise[e.structure]?.niveau ?? "nouvelle"]++;
      const total = p.etapes.length;
      const segments = (Object.keys(compte) as Niveau[]).filter((n) => compte[n])
        .map((n) => `<i style="width:${(100 * compte[n]) / total}%;background:${COULEURS_NIVEAU[n]}" title="${compte[n]} ${NOMS_NIVEAU[n]}"></i>`).join("");
      return `<li><span class="nom">${echapper(p.titre)}</span><span class="barre-maitrise">${segments}</span>
        <span class="compte">${compte.acquise}/${total}</span></li>`;
    }).join("");
    const legende = (Object.keys(COULEURS_NIVEAU) as Niveau[])
      .map((n) => `<span><i style="background:${COULEURS_NIVEAU[n]}"></i>${NOMS_NIVEAU[n]}</span>`).join("");
    $("tableau-contenu").innerHTML = `
      <div class="tableau-chiffres">
        <div><strong>${bilan.dues}</strong><span>cartes dues aujourd'hui</span></div>
        <div><strong>${Math.max(0, this.rappels.nouvellesParJour() - bilan.nouvelles_aujourdhui)}</strong><span>nouvelles encore aujourd'hui (${bilan.nouvelles} en réserve)</span></div>
        <div><strong>${bilan.serie}</strong><span>jour${bilan.serie > 1 ? "s" : ""} de révision d'affilée</span></div>
        <div><strong>${retention}</strong><span>de réponses justes sur 30 jours (${bilan.revisions_30j} révisions)</span></div>
      </div>
      <div class="seance-actions"><button data-tableau="reviser" class="principal">Réviser maintenant <kbd>Q</kbd></button>
        <button data-tableau="colorer">${this.coloration ? "Retirer les couleurs du modèle" : "Colorer le modèle selon la maîtrise"}</button></div>
      <div class="tableau-colonnes">
        <section><h3 class="etiquette">30 derniers jours</h3>
          ${bilan.revisions_30j ? `<svg class="histogramme" viewBox="0 0 300 62" preserveAspectRatio="none" aria-label="Révisions par jour">${barres}</svg>`
            : `<p class="aide">Pas encore de révision : la première séance (Q) remplira ce graphique.</p>`}
          <p class="aide"><span class="pastille-legende total"></span>révisions <span class="pastille-legende justes"></span>justes. Total depuis le début : ${bilan.revisions_total}.</p>
          <h3 class="etiquette">Cartes</h3>
          <p class="aide">${bilan.actives} cartes actives, dont ${bilan.nouvelles} jamais vues. ${bilan.suspendues ? `${bilan.suspendues} suspendues (fiche repassée en brouillon).` : ""}
            Nommer et localiser : dès maintenant. Relations, trajets et vrai ou faux : à mesure que tu vérifies les fiches (touche L).</p>
          <h3 class="etiquette">Réglages</h3>
          <label class="reglage">Nouvelles cartes par jour <input id="tableau-nouvelles" type="number" min="0" max="100" value="${this.rappels.nouvellesParJour()}" /></label>
          <div class="zone-danger">
            <button data-tableau="reinitialiser" class="lien danger">Réinitialiser la progression</button>
            <div id="tableau-confirmation"></div>
          </div>
        </section>
        <section><h3 class="etiquette">Maîtrise par parcours</h3>
          <div class="legende-maitrise">${legende}</div>
          <ul class="liste-maitrise">${lignes}</ul></section>
      </div>`;
    $("tableau").hidden = false;
    this.rappels.etat(`Tableau de bord : ${bilan.dues} cartes dues${bilan.retention_30j === null ? ", pas encore de révision" : `, ${retention} de réponses justes sur 30 jours`}.`,
      "Q pour réviser, Échap pour fermer.");
  }

  async basculerColoration(): Promise<void> {
    if (this.coloration) {
      this.coloration = false;
      this.rappels.colorer(null);
      this.rappels.etat("Couleurs de maîtrise retirées.", "B pour le tableau de bord.");
      return;
    }
    const maitrise = await api.maitrise().catch(() => ({} as Maitrise));
    const niveaux = new Map<string, Niveau>();
    for (const [id, s] of Object.entries(this.atlas.structures)) {
      if (s.niveau === "noyau" && s.noeuds.length) niveaux.set(id, maitrise[id]?.niveau ?? "nouvelle");
    }
    this.coloration = true;
    this.rappels.colorer(niveaux);
    const n = (x: Niveau) => [...niveaux.values()].filter((v) => v === x).length;
    this.rappels.etat(`Maîtrise sur le modèle : vert acquise (${n("acquise")}), jaune en cours (${n("en_cours")}), orange à revoir (${n("a_revoir")}), gris pas encore vue (${n("nouvelle")}).`,
      "Clique une structure pour sa fiche ; B puis « Retirer les couleurs » pour revenir.");
  }

  private async clic(e: MouseEvent): Promise<void> {
    const cible = e.target as HTMLElement;
    if (cible.id === "tableau" || cible.closest("#tableau-fermer")) {
      this.fermer();
      return;
    }
    const b = cible.closest<HTMLButtonElement>("button[data-tableau]");
    if (!b) return;
    if (b.dataset.tableau === "reviser") {
      this.fermer();
      this.rappels.reviser();
    } else if (b.dataset.tableau === "colorer") {
      this.fermer();
      this.basculerColoration();
    } else if (b.dataset.tableau === "reinitialiser") {
      const r = await api.reinitialiser(false).catch(() => null);
      if (!r) return;
      this.confirmation = true;
      $("tableau-confirmation").innerHTML = r.revisions
        ? `<p class="confirmation">Réinitialiser efface ${r.revisions} révision${r.revisions > 1 ? "s" : ""} : toutes les cartes redeviennent nouvelles. Cette action est définitive (une copie de la base est faite avant, dans le dossier « sauvegardes »).</p>
           <button data-tableau="confirmer" class="danger">Confirmer la réinitialisation</button> <button data-tableau="annuler">Annuler</button>`
        : `<p class="aide">Aucune révision à effacer.</p>`;
    } else if (b.dataset.tableau === "confirmer" && this.confirmation) {
      const r = await api.reinitialiser(true).catch((err: ErreurApi) => {
        this.rappels.etat(`Réinitialisation impossible : ${err.message}`, "Rien n'a été effacé.", true);
        return null;
      });
      if (!r) return;
      this.rappels.etat(`Progression réinitialisée : ${r.revisions} révisions effacées.`, "Copie de sécurité faite avant, dans le dossier « sauvegardes ».");
      this.ouvrir();
    } else if (b.dataset.tableau === "annuler") {
      this.confirmation = false;
      $("tableau-confirmation").innerHTML = "";
    }
  }
}
