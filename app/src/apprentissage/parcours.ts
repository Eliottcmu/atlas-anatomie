import { normaliser, SYSTEMES_PLURIEL, type Atlas, type Cote } from "../donnees";
import { api, type RelationBase } from "./api";
import type { FabriqueQuestions, Question } from "./questions";
import { echapper, type Plateau, type Seance } from "./seance";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// Parcours guidés : une leçon de 5 à 15 structures, dans l'ordre logique (la structure, ses branches,
// la suite), caméra placée, structure allumée, deux lignes tirées de la fiche, puis un mini-quiz de 5 questions.

export interface Etape {
  structure: string;
  cote: Cote;
}

export interface Parcours {
  id: string;
  titre: string;
  groupe: string;
  etapes: Etape[];
}

const REGIONS: [string, string][] = [
  ["Cœur et thorax", "du cœur et du thorax"], ["Tête et cou", "de la tête et du cou"],
  ["Membre supérieur", "du membre supérieur"], ["Abdomen", "de l'abdomen"],
  ["Abdomen et pelvis", "de l'abdomen et du pelvis"], ["Pelvis et membre inférieur", "du pelvis et du membre inférieur"],
  ["Membre inférieur", "du membre inférieur"],
  // Blocs 2 à 4 : muscles par région, organes par appareil, os par région
  ["Tronc", "du tronc"], ["Cardiorespiratoire", "cardiorespiratoires"], ["Digestif", "digestifs"],
  ["Urinaire et génital", "urinaires et génitaux"], ["Endocrine et nerveux", "endocrines et nerveux"],
  ["Tête et rachis", "de la tête et du rachis"], ["Thorax", "du thorax"], ["Pelvis", "du pelvis"],
];
// Blocs suivis dans les parcours ; pour les vaisseaux, l'ordre suit les relations des fiches, sinon celui de la liste
const SYSTEMES_PARCOURS = ["artère", "veine", "muscle", "organe", "os"];
const TAILLE_MAXI = 15;

/** Parcours générés : un par région et par système, ordre en profondeur selon les relations. */
export function construireParcours(atlas: Atlas, relations: RelationBase[]): Parcours[] {
  const res: Parcours[] = [];
  for (const systeme of SYSTEMES_PARCOURS) {
    for (const [region, complement] of REGIONS) {
      const ids = Object.entries(atlas.structures)
        .filter(([, s]) => s.niveau === "noyau" && s.systeme === systeme && s.region === region && s.noeuds.length)
        .map(([id]) => id).sort();
      if (ids.length < 3) continue;
      const dans = new Set(ids);
      // Enfants : pour une artère, ses branches et ce qui lui fait suite ; pour une veine, ses affluents et
      // la veine qu'elle continue (on remonte du cœur vers la périphérie)
      const enfants = new Map<string, string[]>();
      const aParent = new Set<string>();
      const lier = (parent: string, enfant: string) => {
        if (!dans.has(parent) || !dans.has(enfant) || parent === enfant) return;
        enfants.set(parent, [...(enfants.get(parent) ?? []), enfant]);
        aParent.add(enfant);
      };
      for (const r of relations) {
        if (systeme === "artère" && (r.type === "branche_de" || r.type === "fait_suite_a")) lier(r.cible, r.source);
        if (systeme === "veine" && r.type === "se_jette_dans") lier(r.cible, r.source);
        if (systeme === "veine" && r.type === "fait_suite_a") lier(r.source, r.cible);
      }
      const ordre: string[] = [];
      const visiter = (id: string) => {
        if (ordre.includes(id)) return;
        ordre.push(id);
        for (const e of [...new Set(enfants.get(id) ?? [])].sort()) visiter(e);
      };
      for (const id of ids) if (!aParent.has(id)) visiter(id);
      for (const id of ids) visiter(id);
      const etapes = ordre.map((id) => ({ structure: id, cote: (atlas.structures[id].cote === "bilatéral" ? "droit" : null) as Cote }));
      const nom = `${SYSTEMES_PLURIEL[systeme]} ${complement}`;
      const parties = Math.ceil(etapes.length / TAILLE_MAXI);
      const taille = Math.ceil(etapes.length / parties);
      for (let p = 0; p < parties; p++) {
        res.push({
          id: `${normaliser(SYSTEMES_PLURIEL[systeme]).replace(/ /g, "-")}-${region.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "-")}${parties > 1 ? `-${p + 1}` : ""}`,
          titre: nom + (parties > 1 ? `, partie ${p + 1} sur ${parties}` : ""), groupe: SYSTEMES_PLURIEL[systeme],
          etapes: etapes.slice(p * taille, (p + 1) * taille),
        });
      }
    }
  }
  return res;
}

interface FicheEtape {
  lignes: string[];
  statut: "verifie" | "brouillon" | "aucune";
  sources: string[];
}

/** Deux lignes d'explication tirées de la fiche : origine, puis terminaison (ou trajet) ; pour un muscle,
 * origine puis action ; pour un organe ou un os, situation puis description ou rapports. */
async function ficheEtape(id: string): Promise<FicheEtape> {
  try {
    const r = await (await fetch(`/api/fiches/${id}`)).json();
    const champs = r.fiche?.champs ?? {};
    // Première phrase, sans lookbehind (Safari ancien)
    const premiere = (t?: string) => ((t ?? "").match(/^.*?[.;](?=\s|$)/)?.[0] ?? (t ?? "")).replace(/;$/, ".").trim();
    const lignes: string[] = [];
    const sources: string[] = [];
    const muscle = r.structure?.systeme === "muscle";
    const ordre = muscle ? [["origine", "Origine"], ["action", "Action"], ["terminaison", "Terminaison"]]
      : [["origine", "Origine"], ["terminaison", "Terminaison"], ["trajet", "Trajet"], ["territoire", "Territoire"],
        ["situation", "Situation"], ["description", "Description"], ["configuration", "Configuration"], ["rapports", "Rapports"]];
    for (const [cle, libelle] of ordre) {
      if (lignes.length >= 2 || !champs[cle]?.texte) continue;
      lignes.push(`${libelle} : ${premiere(champs[cle].texte)}`);
      for (const s of champs[cle].sources ?? []) sources.push(typeof s === "string" ? s : `${s.roneo}:${(s.pages ?? []).join(",")}`);
    }
    return { lignes, statut: r.fiche ? r.fiche.statut : "aucune", sources: [...new Set(sources)] };
  } catch {
    return { lignes: [], statut: "aucune", sources: [] };
  }
}

export class Lecteur {
  actif: Parcours | null = null;
  private index = 0;
  parcours: Parcours[] = [];
  private suivi: Record<string, { dernier: string; fois: number; meilleur_score: number; total: number }> = {};

  constructor(private plateau: Plateau, private seance: Seance, private fabrique: () => FabriqueQuestions | null,
              private montrerEtape: (etape: Etape, toutes: Etape[]) => void, private apres: () => void) {
    $("parcours-liste").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-parcours]");
      if (b) {
        this.fermerListe();
        this.lancer(b.dataset.parcours!);
      }
      if ((e.target as HTMLElement).id === "parcours-liste" || (e.target as HTMLElement).closest("#parcours-liste-fermer")) this.fermerListe();
    });
    $("parcours-panneau").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-pas]");
      if (!b) return;
      if (b.dataset.pas === "suivant") this.suivant();
      if (b.dataset.pas === "precedent") this.precedent();
      if (b.dataset.pas === "quitter") this.quitter();
    });
  }

  get listeOuverte(): boolean {
    return !$("parcours-liste").hidden;
  }

  async ouvrirListe(): Promise<void> {
    this.suivi = await api.suiviParcours().catch(() => ({}));
    const groupes = new Map<string, Parcours[]>();
    for (const p of this.parcours) groupes.set(p.groupe, [...(groupes.get(p.groupe) ?? []), p]);
    let html = "";
    for (const [g, liste] of groupes) {
      html += `<section><h3 class="etiquette">${g}</h3><ul class="liste-parcours">`;
      html += liste.map((p) => {
        const s = this.suivi[p.id];
        const etat = s ? `<span class="etat-ligne verifie">fait ${s.fois} fois, meilleur ${s.meilleur_score}/${s.total}</span>`
          : `<span class="etat-ligne">${p.etapes.length} structures</span>`;
        return `<li><button data-parcours="${p.id}">${echapper(p.titre)}</button>${etat}</li>`;
      }).join("");
      html += "</ul></section>";
    }
    $("parcours-liste-contenu").innerHTML = html;
    $("parcours-liste").hidden = false;
    this.plateau.etat(`${this.parcours.length} parcours guidés, de 5 à 15 structures, chacun suivi d'un mini-quiz.`,
      "Choisis un parcours ; Échap pour fermer.");
  }

  fermerListe(): void {
    $("parcours-liste").hidden = true;
  }

  lancer(id: string): void {
    const p = this.parcours.find((x) => x.id === id);
    if (!p) return;
    this.actif = p;
    this.index = 0;
    document.body.classList.add("en-parcours");
    this.plateau.modeSeance(true, p.titre);
    $("parcours-panneau").hidden = false;
    this.afficher();
  }

  quitter(): void {
    if (!this.actif) return;
    const titre = this.actif.titre;
    this.actif = null;
    $("parcours-panneau").hidden = true;
    document.body.classList.remove("en-parcours");
    this.plateau.effacer();
    this.plateau.modeSeance(false);
    this.plateau.etat(`Parcours « ${titre} » quitté.`, "P pour reprendre un parcours, Q pour réviser.");
    this.apres();
  }

  suivant(): void {
    if (!this.actif) return;
    if (this.index < this.actif.etapes.length - 1) {
      this.index++;
      this.afficher();
    } else this.miniQuiz();
  }

  precedent(): void {
    if (!this.actif || this.index === 0) return;
    this.index--;
    this.afficher();
  }

  private async afficher(): Promise<void> {
    const p = this.actif!;
    const etape = p.etapes[this.index];
    const s = this.plateau.atlas.structures[etape.structure];
    this.montrerEtape(etape, p.etapes);
    const n = this.index + 1, total = p.etapes.length;
    const entete = `<div class="seance-entete"><span class="etiquette">Parcours</span><span class="etiquette">Étape ${n} sur ${total}</span></div>
      <p class="parcours-titre">${echapper(p.titre)}</p>
      <div class="parcours-barre"><i style="width:${(100 * n) / total}%"></i></div>
      <h2 class="seance-titre">${echapper(s.nom)}</h2>${etape.cote ? `<p class="fiche-cote">côté ${etape.cote}</p>` : ""}`;
    const pied = `<div class="seance-actions parcours-actions">
        <button data-pas="precedent" ${this.index === 0 ? "disabled" : ""}>Précédente <kbd>&larr;</kbd></button>
        <button data-pas="suivant" class="principal">${n === total ? "Mini-quiz" : "Suivante"} <kbd>Entrée</kbd></button></div>
      <div class="seance-pied"><button data-pas="quitter" class="fermer">Quitter <kbd>Échap</kbd></button></div>`;
    $("parcours-panneau").innerHTML = `${entete}<p class="aide">Chargement de la fiche...</p>${pied}`;
    this.plateau.etat(`Parcours : ${s.nom}, étape ${n} sur ${total}.`,
      `Entrée pour la suite, flèche gauche pour revenir, Échap pour quitter.${n === total ? " Un mini-quiz de 5 questions suit." : ""}`);
    const f = await ficheEtape(etape.structure);
    if (this.actif !== p || p.etapes[this.index] !== etape) return;
    const statut = f.statut === "verifie" ? `<p class="fiche-statut verifie">Fiche vérifiée</p>`
      : f.statut === "brouillon" ? `<p class="fiche-statut brouillon">Brouillon rédigé par Claude, à vérifier contre tes ronéos</p>`
      : `<p class="fiche-statut indisponible">Pas encore de fiche</p>`;
    const lignes = f.lignes.length ? `<ul class="parcours-lignes">${f.lignes.map((l) => `<li>${echapper(l)}</li>`).join("")}</ul>` : "";
    const sources = f.sources.length ? `<p class="sources">${f.sources.map((x) => `<a href="/roneos/${x.split(":")[0]}#page=${(x.split(":")[1] ?? "1").split(/[,-]/)[0]}" target="_blank" rel="noopener">${echapper(x)}</a>`).join("")}</p>` : "";
    $("parcours-panneau").innerHTML = `${entete}${statut}${lignes}${sources}${pied}`;
  }

  /** Mini-quiz : 5 structures du parcours, nommer ou localiser, non noté par FSRS. */
  private miniQuiz(): void {
    const p = this.actif!;
    const fab = this.fabrique();
    if (!fab) return;
    const tirage = [...p.etapes].sort(() => Math.random() - 0.5).slice(0, Math.min(5, p.etapes.length));
    const questions: Question[] = tirage.map((e, i) => fab.entrainement(e.structure, i % 2 ? "localiser" : "nommer"));
    $("parcours-panneau").hidden = true;
    document.body.classList.remove("en-parcours");
    this.plateau.effacer();
    const structures = p.etapes.map((e) => e.structure);
    this.actif = null;
    this.seance.demarrerEntrainement(`Mini-quiz : ${p.titre}`, questions, async (score, total) => {
      try {
        await api.parcoursTermine(p.id, score, total, structures);
      } catch { /* le parcours reste à refaire, rien d'autre à perdre */ }
      this.plateau.etat(`Parcours terminé : ${score} sur ${total} au mini-quiz.`,
        `Les ${structures.length} structures du parcours passent en tête de tes nouvelles cartes : Q pour réviser.`);
      this.apres();
    });
  }

  touche(e: KeyboardEvent): boolean {
    if (this.listeOuverte) {
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        e.preventDefault();
        this.fermerListe();
      }
      return true;
    }
    if (!this.actif) return false;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.suivant();
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "Backspace") {
      e.preventDefault();
      this.precedent();
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.quitter();
      return true;
    }
    return false;
  }
}
