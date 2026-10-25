import type { Atlas, Cote } from "../donnees";
import { api, ErreurApi, type CarteFile, type FileDuJour } from "./api";
import { FabriqueQuestions, type Question, type Verdict } from "./questions";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Ce que la séance demande à l'atlas : montrer, capter un clic, masquer ce qui trahirait la réponse. */
export interface Plateau {
  atlas: Atlas;
  etat(action: string, ensuite: string, erreur?: boolean): void;
  /** Surligne une structure (un côté), estompe le reste, cadre la vue ; sans fiche ni nom affiché. */
  montrer(structure: string, cote: Cote, cadrer?: boolean): void;
  /** Surligne plusieurs structures (correction d'un trajet). */
  montrerPlusieurs(structures: string[]): void;
  /** Vue d'ensemble, rien de surligné : pour localiser (le calque de la structure est affiché s'il était masqué). */
  vueEnsemble(structure?: string): void;
  effacer(): void;
  /** Clic dans la vue détourné vers la séance (localiser) ; null pour rendre la main. */
  capturerClic(f: ((cle: string | null) => void) | null): void;
  infoNoeud(cle: string): { structure: string | null; cote: Cote; nom: string };
  modeSeance(actif: boolean, titre?: string): void;
}

type ModeSeance = "revision" | "entrainement";

interface Element_ {
  question: Question;
  repasse: number;   // passages en fin de séance après un « À revoir »
}

const NOTES = [
  { n: 1, nom: "À revoir" }, { n: 2, nom: "Difficile" }, { n: 3, nom: "Bien" }, { n: 4, nom: "Facile" },
];

export class Seance {
  actif = false;
  private mode: ModeSeance = "revision";
  private titre = "";
  private file: Element_[] = [];
  private index = 0;
  private courant: Element_ | null = null;
  private verdict: Verdict | null = null;
  private debut = 0;
  private ordre: string[] = [];
  private justes = 0;
  private faites = 0;
  private suggestion = 3;
  private enAttente = false;
  private fin: ((score: number, total: number) => void) | null = null;
  fabrique: FabriqueQuestions | null = null;

  constructor(private plateau: Plateau, private nouvellesParJour: () => number, private apres: () => void) {
    $("seance").addEventListener("click", (e) => this.clic(e));
    $("seance").addEventListener("keydown", (e) => {
      const cible = e.target as HTMLElement;
      // Après la correction, Entrée note la carte : le champ, désactivé mais parfois encore focalisé, ne doit pas l'avaler
      if (cible.id === "seance-saisie" && e.key === "Enter" && !this.verdict) {
        e.preventDefault();
        e.stopPropagation();
        this.repondre({ texte: (cible as HTMLInputElement).value });
      }
    });
  }

  get question(): Question | null {
    return this.courant?.question ?? null;
  }

  /** Révision du jour : cartes échues puis nouvelles, mêlées (une nouvelle toutes les deux échues). */
  async demarrerRevision(): Promise<void> {
    if (!this.fabrique) return;
    let f: FileDuJour;
    try {
      f = await api.file(this.nouvellesParJour());
    } catch (e) {
      this.plateau.etat(`Révision impossible : ${(e as ErreurApi).message}`, "Relancer l'atlas ; le journal explique la cause.", true);
      return;
    }
    const dues = [...f.dues], nouvelles = [...f.nouvelles], cartes: CarteFile[] = [];
    while (dues.length || nouvelles.length) {
      if (dues.length) cartes.push(dues.shift()!);
      if (dues.length) cartes.push(dues.shift()!);
      if (nouvelles.length) cartes.push(nouvelles.shift()!);
    }
    const questions = cartes.map((c) => this.fabrique!.construire(c)).filter((q): q is Question => q !== null);
    if (!questions.length) {
      const reserve = f.nouvelles_en_reserve
        ? `Les nouvelles cartes du jour sont faites (${this.nouvellesParJour()} par jour) ; ${f.nouvelles_en_reserve} attendent.` : "";
      this.plateau.etat(`Tout est à jour. Prochaines cartes demain : ${f.demain}. ${reserve}`.trim(),
        "Tu peux lancer un parcours (P) ou explorer le modèle.");
      this.afficherVide(f);
      return;
    }
    this.lancer("revision", "Révision du jour", questions, null);
  }

  /** Séance d'entraînement non notée : mini-quiz d'un parcours, quiz libre. */
  demarrerEntrainement(titre: string, questions: Question[], fin: (score: number, total: number) => void): void {
    this.lancer("entrainement", titre, questions, fin);
  }

  private lancer(mode: ModeSeance, titre: string, questions: Question[], fin: ((score: number, total: number) => void) | null): void {
    this.mode = mode;
    this.titre = titre;
    this.file = questions.map((q) => ({ question: q, repasse: 0 }));
    this.index = 0;
    this.justes = 0;
    this.faites = 0;
    this.fin = fin;
    this.actif = true;
    this.plateau.modeSeance(true, titre);
    $("seance").hidden = false;
    document.body.classList.add("en-seance");
    this.suivante();
  }

  quitter(): void {
    if (!this.actif) return;
    const fin = this.fin;
    const score = this.justes, total = this.faites;
    this.terminer(true);
    if (fin) fin(score, total);
  }

  private terminer(interrompue = false): void {
    this.actif = false;
    this.courant = null;
    this.plateau.capturerClic(null);
    this.plateau.effacer();
    this.plateau.modeSeance(false);
    document.body.classList.remove("en-seance");
    const pct = this.faites ? Math.round((100 * this.justes) / this.faites) : 0;
    if (this.mode === "revision") {
      $("seance").hidden = false;
      $("seance").innerHTML = `<span class="etiquette">${this.titre}</span>
        <h2 class="seance-titre">${interrompue ? "Séance interrompue" : "Séance terminée"}</h2>
        <p class="seance-bilan"><strong>${this.faites}</strong> carte${this.faites > 1 ? "s" : ""}, <strong>${this.justes}</strong> juste${this.justes > 1 ? "s" : ""}${this.faites ? ` (${pct} %)` : ""}.</p>
        <p class="aide">Les cartes notées sont enregistrées${interrompue ? " ; les autres attendent la prochaine séance" : ""}.</p>
        <div class="seance-actions"><button data-seance="fermer" class="principal">Fermer <kbd>Entrée</kbd></button>
        <button data-seance="tableau">Progrès <kbd>B</kbd></button></div>`;
      this.plateau.etat(`Séance ${interrompue ? "interrompue" : "terminée"} : ${this.faites} cartes, ${this.justes} justes.`,
        "Entrée pour fermer, B pour le tableau de bord, P pour un parcours.");
      this.enAttente = true;
    } else {
      $("seance").hidden = true;
      $("seance").innerHTML = "";
    }
    this.apres();
  }

  private afficherVide(f: FileDuJour): void {
    $("seance").hidden = false;
    $("seance").innerHTML = `<span class="etiquette">Révision du jour</span>
      <h2 class="seance-titre">Tout est à jour</h2>
      <p class="seance-bilan">Prochaines cartes demain : <strong>${f.demain}</strong>${f.prochaine_echeance ? `, la première le ${dateLisible(f.prochaine_echeance)}` : ""}.</p>
      <p class="aide">${f.nouvelles_en_reserve ? `${f.nouvelles_en_reserve} nouvelles cartes attendent ; ${this.nouvellesParJour()} entrent chaque jour (réglage dans Progrès).` : "Aucune nouvelle carte en réserve."}
        Les cartes de relations, de trajets et de vrai ou faux arrivent à mesure que tu vérifies les fiches.</p>
      <div class="seance-actions"><button data-seance="fermer" class="principal">Fermer <kbd>Entrée</kbd></button>
      <button data-seance="parcours">Parcours <kbd>P</kbd></button></div>`;
    this.enAttente = true;
  }

  fermerPanneau(): void {
    this.enAttente = false;
    $("seance").hidden = true;
  }

  // ------------------------------------------------------------ déroulé

  private suivante(): void {
    if (this.index >= this.file.length) {
      this.terminer();
      if (this.fin) this.fin(this.justes, this.faites);
      return;
    }
    this.courant = this.file[this.index];
    this.verdict = null;
    this.ordre = [];
    const q = this.courant.question;
    this.debut = performance.now();
    if (q.type === "localiser" || q.type === "trajet") {
      this.plateau.vueEnsemble(q.type === "localiser" ? q.structure : undefined);
      if (q.type === "localiser") this.plateau.capturerClic((cle) => this.repondre({ cle }));
    } else {
      this.plateau.capturerClic(null);
      this.plateau.montrer(q.structure, q.cote);
    }
    this.afficherQuestion();
  }

  private progression(): string {
    return `Carte ${Math.min(this.index + 1, this.file.length)} sur ${this.file.length}`;
  }

  private afficherQuestion(): void {
    const q = this.courant!.question;
    let corps = "";
    if (q.type === "nommer") {
      corps = `<div class="champ seance-champ"><input id="seance-saisie" type="text" autocomplete="off" spellcheck="false"
        placeholder="Nom de la structure, puis Entrée" aria-label="Nom de la structure surlignée" /></div>
        <div class="seance-actions"><button data-seance="valider" class="principal">Valider <kbd>Entrée</kbd></button>
        <button data-seance="passe">Je ne sais pas</button></div>`;
    } else if (q.type === "localiser") {
      corps = `<p class="aide">Tourne et zoome librement : la réponse est le premier clic sur une structure.</p>
        <div class="seance-actions"><button data-seance="passe">Je ne sais pas</button></div>`;
    } else if (q.type === "relation") {
      corps = `<div class="seance-choix">${q.choix!.map((c, i) => `<button data-choix="${c.id}"><kbd>${i + 1}</kbd><span>${echapper(c.nom)}</span></button>`).join("")}</div>`;
    } else if (q.type === "vrai_faux") {
      corps = `<div class="seance-actions vrai-faux"><button data-vrai="1" class="principal">Vrai <kbd>V</kbd></button>
        <button data-vrai="0">Faux <kbd>F</kbd></button></div>`;
    } else if (q.type === "trajet") {
      corps = `<ol class="seance-ordre" id="seance-ordre"></ol>
        <div class="seance-choix">${q.choix!.map((c, i) => `<button data-etape="${c.id}"><kbd>${i + 1}</kbd><span>${echapper(c.nom)}</span></button>`).join("")}</div>
        <div class="seance-actions"><button data-seance="effacer-ordre">Recommencer</button></div>`;
    }
    $("seance").innerHTML = `<div class="seance-entete"><span class="etiquette">${echapper(this.titre)}</span>
        <span class="etiquette">${this.progression()}</span></div>
      ${q.titre ? `<h2 class="seance-titre">${echapper(q.titre)}</h2>` : ""}
      <p class="seance-consigne">${echapper(q.consigne)}</p>
      ${corps}
      <div class="seance-pied"><button data-seance="quitter" class="fermer">Quitter <kbd>Échap</kbd></button></div>`;
    const saisie = document.getElementById("seance-saisie") as HTMLInputElement | null;
    if (saisie) setTimeout(() => saisie.focus(), 30);
    const aides: Record<string, string> = {
      nommer: "Tape le nom puis Entrée ; accents et synonymes acceptés.",
      localiser: "Clique la structure dans la vue.",
      relation: "Touches 1 à 4, ou clic sur la réponse.",
      vrai_faux: "V pour vrai, F pour faux.",
      trajet: "Clique dans l'ordre, ou touches 1 à " + (q.choix?.length ?? 0) + ".",
    };
    this.plateau.etat(`${this.titre}, ${this.progression().toLowerCase()}.`, `${aides[q.type]} Échap pour quitter.`);
  }

  repondre(r: { texte?: string; choix?: string; cle?: string | null; vrai?: boolean; ordre?: string[]; passe?: boolean }): void {
    if (!this.courant || this.verdict || !this.fabrique) return;
    const q = this.courant.question;
    let verdict: Verdict;
    if (r.passe) {
      verdict = { juste: false, explication: `Réponse : ${this.fabrique.nom(q.structure)}${q.cote ? `, côté ${q.cote}` : ""}.` };
      if (q.type === "relation" || q.type === "vrai_faux") verdict.explication = `Réponse : ${this.fabrique.nom(q.attendu[0])}.`;
      if (q.type === "trajet") verdict.explication = `L'ordre était : ${q.attendu.map((x) => this.fabrique!.nom(x)).join(", puis ")}.`;
    } else if (q.type === "localiser") {
      const info = r.cle ? this.plateau.infoNoeud(r.cle) : null;
      verdict = this.fabrique.corriger(q, { clic: info ?? undefined });
    } else {
      verdict = this.fabrique.corriger(q, { texte: r.texte, choix: r.choix, vrai: r.vrai, ordre: r.ordre });
    }
    this.verdict = verdict;
    this.plateau.capturerClic(null);
    if (q.type === "trajet") this.plateau.montrerPlusieurs(q.attendu);
    else this.plateau.montrer(q.structure, q.cote, q.type === "localiser");
    this.faites++;
    if (verdict.juste) this.justes++;
    this.suggestion = verdict.juste ? (verdict.approchee ? 2 : 3) : 1;
    this.afficherCorrection();
  }

  private afficherCorrection(): void {
    const q = this.courant!.question;
    const v = this.verdict!;
    const nomReponse = q.type === "nommer" || q.type === "localiser"
      ? `<p class="seance-reponse">${echapper(this.fabrique!.nom(q.structure))}${q.cote ? ` <span class="cote">côté ${q.cote}</span>` : ""}</p>` : "";
    let actions = "";
    if (this.mode === "revision" && q.carte) {
      actions = `<div class="seance-notes">${NOTES.map((n) => `<button data-note="${n.n}" class="${n.n === this.suggestion ? "suggeree" : ""}">
          <span class="note-nom"><kbd>${n.n}</kbd> ${n.nom}</span><span class="note-delai">${q.carte!.apercu[String(n.n) as "1"]}</span></button>`).join("")}</div>
        <p class="aide">Entrée : ${NOTES[this.suggestion - 1].nom.toLowerCase()} (suggéré). Note selon ta réponse réelle, pas selon la chance.</p>`;
    } else {
      actions = `<div class="seance-actions"><button data-seance="suivante" class="principal">Suivante <kbd>Entrée</kbd></button></div>`;
    }
    const zone = $("seance");
    zone.querySelector(".seance-verdict")?.remove();
    const bloc = document.createElement("div");
    bloc.className = `seance-verdict ${v.juste ? "juste" : "faux"}`;
    bloc.innerHTML = `<p class="seance-explication">${echapper(v.explication)}</p>${nomReponse}${actions}`;
    zone.querySelector(".seance-pied")!.before(bloc);
    for (const b of zone.querySelectorAll<HTMLButtonElement>("[data-choix], [data-vrai], [data-etape], [data-seance='valider'], [data-seance='passe'], [data-seance='effacer-ordre']")) {
      b.disabled = true;
      if (b.dataset.choix && b.dataset.choix === q.attendu[0]) b.classList.add("bonne");
    }
    const saisie = document.getElementById("seance-saisie") as HTMLInputElement | null;
    if (saisie) {
      saisie.disabled = true;
      saisie.blur();
    }
    const suite = this.mode === "revision" ? "1 à 4 pour noter, Entrée pour la note suggérée" : "Entrée pour continuer";
    this.plateau.etat(v.explication, `${suite}. ${this.progression()}.`);
  }

  private async noter(note: number): Promise<void> {
    const el = this.courant;
    if (!el || !this.verdict) return;
    const q = el.question;
    if (q.carte && this.mode === "revision") {
      try {
        const r = await api.noter(q.carte.id, note, Math.round(performance.now() - this.debut));
        const debutTexte = this.verdict.juste ? "Réponse correcte" : "Réponse à revoir";
        this.plateau.etat(`${debutTexte} : ${this.fabrique!.nom(q.structure)}. Prochaine révision dans ${r.dans}.`,
          `${this.progression()}.`);
      } catch (e) {
        this.plateau.etat(`Note non enregistrée : ${(e as ErreurApi).message}`, "La carte reviendra à la prochaine séance.", true);
      }
      // « À revoir » : la carte repasse en fin de séance (deux fois au plus), avec son nouvel aperçu
      if (note === 1 && el.repasse < 2) {
        const nouvelle = await api.file(0).then((f) => f.dues.find((c) => c.id === q.carte!.id)).catch(() => undefined);
        const carte = nouvelle ?? q.carte;
        const question = this.fabrique!.construire(carte);
        if (question) this.file.push({ question, repasse: el.repasse + 1 });
      }
    }
    this.index++;
    this.suivante();
  }

  // ------------------------------------------------------------ clavier et clics

  /** Renvoie vrai si la touche est prise par la séance. */
  touche(e: KeyboardEvent): boolean {
    if (this.enAttente && !this.actif) {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        this.fermerPanneau();
        return true;
      }
      this.fermerPanneau();
      return false;
    }
    if (!this.actif || !this.courant) return false;
    const balise = (e.target as HTMLElement).tagName;
    if (e.key === "Escape") {
      e.preventDefault();
      this.quitter();
      return true;
    }
    if (balise === "INPUT" && !this.verdict) return true;
    const q = this.courant.question;
    if (this.verdict) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (this.mode === "revision" && q.carte) this.noter(this.suggestion);
        else {
          this.index++;
          this.suivante();
        }
        return true;
      }
      if (this.mode === "revision" && q.carte && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        this.noter(Number(e.key));
        return true;
      }
      return /^[1-9vVfF]$/.test(e.key);
    }
    if ((q.type === "relation" || q.type === "trajet") && /^[1-9]$/.test(e.key)) {
      const c = q.choix?.[Number(e.key) - 1];
      if (c) {
        e.preventDefault();
        if (q.type === "relation") this.repondre({ choix: c.id });
        else this.ajouterEtape(c.id);
      }
      return true;
    }
    if (q.type === "vrai_faux" && /^[vVfF]$/.test(e.key)) {
      e.preventDefault();
      this.repondre({ vrai: e.key.toLowerCase() === "v" });
      return true;
    }
    // Les autres touches (vues, cadrage) restent à l'atlas, sauf les calques qui trahiraient la réponse
    return /^[avomrnAVOMRN]$/.test(e.key);
  }

  private ajouterEtape(id: string): void {
    if (this.ordre.includes(id)) return;
    this.ordre.push(id);
    const q = this.courant!.question;
    const ol = document.getElementById("seance-ordre");
    if (ol) ol.innerHTML = this.ordre.map((x) => `<li>${echapper(this.fabrique!.nom(x))}</li>`).join("");
    document.querySelector<HTMLButtonElement>(`[data-etape="${id}"]`)?.setAttribute("disabled", "");
    if (this.ordre.length === q.attendu.length) this.repondre({ ordre: this.ordre });
  }

  private clic(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    if (b.dataset.note) this.noter(Number(b.dataset.note));
    else if (b.dataset.choix) this.repondre({ choix: b.dataset.choix });
    else if (b.dataset.vrai) this.repondre({ vrai: b.dataset.vrai === "1" });
    else if (b.dataset.etape) this.ajouterEtape(b.dataset.etape);
    else if (b.dataset.seance === "valider") this.repondre({ texte: ($("seance-saisie") as HTMLInputElement).value });
    else if (b.dataset.seance === "passe") this.repondre({ passe: true });
    else if (b.dataset.seance === "effacer-ordre") {
      this.ordre = [];
      document.getElementById("seance-ordre")!.innerHTML = "";
      for (const x of document.querySelectorAll<HTMLButtonElement>("[data-etape]")) x.disabled = false;
    } else if (b.dataset.seance === "suivante") {
      this.index++;
      this.suivante();
    } else if (b.dataset.seance === "quitter") this.quitter();
    else if (b.dataset.seance === "fermer") this.fermerPanneau();
    else if (b.dataset.seance === "tableau") {
      this.fermerPanneau();
      document.getElementById("ouvrir-tableau")?.click();
    } else if (b.dataset.seance === "parcours") {
      this.fermerPanneau();
      document.getElementById("ouvrir-parcours")?.click();
    }
  }
}

function dateLisible(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
