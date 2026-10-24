import type { ItemLegende, Legendes, ModeLegendes } from "./legendes";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface RappelsInterrogation {
  etat(action: string, ensuite: string, erreur?: boolean): void;
  definirModeLegendes(mode: ModeLegendes): void;
  /** Nom du focus en cours, pour le titre du bilan. */
  sujet(): string;
}

/**
 * Interrogation sur la planche muette du focus (touche T) : un nom est demandé, on clique son numéro.
 * Exercice libre, hors révisions FSRS : les noms des repères viennent de Z-Anatomy et de la table de
 * traduction, pas encore des ronéos. Les numéros sont tirés au hasard (l'ordre alphabétique trahirait la réponse).
 */
export class Interrogation {
  private file: ItemLegende[] = [];
  private index = 0;
  private justes = 0;
  private manques: string[] = [];
  private attente = false; // réponse fausse ou passée : Entrée pour continuer
  private fini = false;
  private modeAvant: ModeLegendes | null = null;
  private minuteur = 0;

  constructor(private legendes: Legendes, private rappels: RappelsInterrogation) {
    $("interrogation").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (!b) return;
      const action = b.dataset.action;
      if (action === "passer") this.passer();
      else if (action === "suivant") this.suivant();
      else if (action === "recommencer") this.demarrer();
      else if (action === "arreter") this.arreter();
    });
  }

  get active(): boolean {
    return this.modeAvant !== null;
  }

  /** État lisible par les tests. */
  get etatTest(): { active: boolean; question: string | null; index: number; total: number; justes: number; fini: boolean } {
    return { active: this.active, question: this.active && !this.fini ? this.question()?.nom ?? null : null,
      index: this.index, total: this.file.length, justes: this.justes, fini: this.fini };
  }

  basculer(): void {
    if (this.active && !this.fini) this.arreter();
    else this.demarrer();
  }

  demarrer(): void {
    window.clearTimeout(this.minuteur);
    if (this.modeAvant === null) this.modeAvant = this.legendes.mode;
    this.legendes.effacerMarques();
    const dejaPlacees = this.legendes.affichees.length > 0;
    this.rappels.definirModeLegendes("numeros");
    this.legendes.numeroterAuHasard();
    // Légendes masquées jusque-là (N) : on attend qu'elles soient placées pour tirer les questions
    if (dejaPlacees) this.lancer();
    else this.minuteur = window.setTimeout(() => this.lancer(), 450);
  }

  private lancer(): void {
    // Questions : les étiquettes visibles depuis ce point de vue, un nom une seule fois
    const vus = new Set<string>();
    const pool = this.legendes.affichees.map((a) => this.legendes.item(a.id)!)
      .filter((x) => x && !vus.has(x.nom) && vus.add(x.nom));
    if (pool.length < 2) {
      this.arreter();
      this.rappels.etat("Interrogation impossible : moins de deux légendes visibles.",
        "Entre dans un focus d'os ou d'organe (G), oriente la vue, puis T.", true);
      return;
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.file = pool;
    this.index = 0;
    this.justes = 0;
    this.manques = [];
    this.fini = false;
    this.legendes.interception = (item) => this.repondre(item);
    document.body.classList.add("en-interrogation");
    $("interrogation").hidden = false;
    this.legendes.invalider(); // le panneau prend la colonne de droite : les étiquettes se rangent à sa gauche
    this.poser();
  }

  arreter(): void {
    window.clearTimeout(this.minuteur);
    if (this.modeAvant === null) return;
    const mode = this.modeAvant;
    this.modeAvant = null;
    this.legendes.interception = null;
    this.legendes.effacerMarques();
    this.legendes.numeroterParNom();
    document.body.classList.remove("en-interrogation");
    $("interrogation").hidden = true;
    this.legendes.invalider();
    this.rappels.definirModeLegendes(mode);
  }

  /** Touches de l'interrogation ; vrai si la touche est prise. */
  touche(e: KeyboardEvent): boolean {
    if (!this.active) return false;
    const k = e.key;
    if (k === "Escape") this.arreter();
    else if (k === "Enter" && (this.attente || this.fini)) {
      if (this.fini) this.arreter();
      else this.suivant();
    } else if (k.toLowerCase() === "t") {
      if (this.fini) this.demarrer();
      else this.arreter();
    } else if (k === " " && !this.attente && !this.fini) this.passer();
    else return false;
    e.preventDefault();
    return true;
  }

  private question(): ItemLegende {
    return this.file[this.index];
  }

  private poser(): void {
    this.attente = false;
    const q = this.question();
    $("interrogation-progres").textContent = `${this.index + 1} / ${this.file.length}`;
    $("interrogation-texte").innerHTML = `Où est : <strong>${echapper(q.nom)}</strong> ?`;
    $("interrogation-boutons").innerHTML = `<button data-action="passer">Passer <kbd>Espace</kbd></button>`
      + `<button data-action="arreter">Arrêter <kbd>Échap</kbd></button>`;
    this.rappels.etat(`Interrogation, question ${this.index + 1} sur ${this.file.length} : ${q.nom}.`,
      "Clique le numéro de ce repère sur la vue ; tourne la vue s'il est caché. Espace pour passer.");
  }

  /** Étiquettes qui portent le nom demandé (un repère peut figurer des deux côtés). */
  private attendues(): ItemLegende[] {
    const nom = this.question().nom;
    return this.legendes.affichees.map((a) => this.legendes.item(a.id)!).filter((x) => x?.nom === nom);
  }

  private repondre(item: ItemLegende): void {
    if (this.attente || this.fini) return;
    const q = this.question();
    this.legendes.reveler(item.id);
    if (item.nom === q.nom) {
      this.justes++;
      this.legendes.marquer(item.id, "juste");
      $("interrogation-texte").innerHTML = `Juste : <strong>${echapper(q.nom)}</strong>.`;
      this.minuteur = window.setTimeout(() => this.suivant(), 700);
      return;
    }
    this.legendes.marquer(item.id, "faux");
    this.montrerReponse(`Non, c'est ${echapper(item.nom)}.`);
  }

  private passer(): void {
    if (this.attente || this.fini) return;
    this.montrerReponse("Passé.");
  }

  private montrerReponse(debut: string): void {
    const q = this.question();
    this.manques.push(q.nom);
    this.attente = true;
    const attendues = this.attendues();
    for (const a of attendues) {
      this.legendes.reveler(a.id);
      this.legendes.marquer(a.id, "attendu");
    }
    const ou = attendues.length ? "Le repère demandé est allumé." : "Le repère demandé n'est plus visible depuis ce point de vue.";
    $("interrogation-texte").innerHTML = `${debut} ${ou}`;
    $("interrogation-boutons").innerHTML = `<button data-action="suivant">Continuer <kbd>Entrée</kbd></button>`
      + `<button data-action="arreter">Arrêter <kbd>Échap</kbd></button>`;
    this.rappels.etat(`Raté : ${q.nom}.`, "Entrée pour la question suivante.");
  }

  private suivant(): void {
    window.clearTimeout(this.minuteur);
    this.legendes.effacerMarques();
    this.legendes.cacherNoms();
    this.index++;
    if (this.index < this.file.length) {
      this.poser();
      return;
    }
    this.fini = true;
    const n = this.file.length;
    $("interrogation-progres").textContent = `${this.justes} / ${n}`;
    const manques = this.manques.length
      ? ` À revoir : ${this.manques.map(echapper).join(", ")}.` : " Aucune erreur.";
    $("interrogation-texte").innerHTML = `<strong>${this.rappels.sujet()}</strong> : ${this.justes} sur ${n} du premier coup.${manques}`;
    $("interrogation-boutons").innerHTML = `<button data-action="recommencer">Recommencer <kbd>T</kbd></button>`
      + `<button data-action="arreter">Fermer <kbd>Entrée</kbd></button>`;
    this.rappels.etat(`Interrogation terminée : ${this.justes} sur ${n}.`, "T pour recommencer (autre ordre, autres numéros), Entrée pour fermer.");
  }
}

function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
