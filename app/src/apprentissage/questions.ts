import type { Atlas, Cote } from "../donnees";
import type { CarteFile, RelationBase, TypeCarte } from "./api";
import { corriger } from "./reponses";

// Construction des questions à partir des cartes : consigne, choix, bonne réponse, et correction.

export const LIBELLES_RELATION: Record<string, string> = {
  branche_de: "Naît de", fait_suite_a: "Fait suite à", se_jette_dans: "Se jette dans", anastomose_avec: "S'anastomose avec",
};

export interface Question {
  type: TypeCarte;
  carte: CarteFile | null;       // null : question d'entraînement, non notée
  structure: string;
  cote: Cote;
  titre: string;                 // ce qu'on voit en grand (vide pour « nommer » : le nom est la réponse)
  consigne: string;
  choix?: { id: string; nom: string }[];
  attendu: string[];             // ids attendus : un seul, sauf trajet (dans l'ordre)
  enonce?: { cible: string; vrai: boolean };
}

export interface Verdict {
  juste: boolean;
  approchee?: boolean;
  explication: string;           // phrase de correction, cause puis conséquence
}

type Hasard = () => number;

function melanger<T>(t: T[], h: Hasard): T[] {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(h() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export class FabriqueQuestions {
  private parSource = new Map<string, RelationBase[]>();

  constructor(private atlas: Atlas, relations: RelationBase[], private hasard: Hasard = Math.random) {
    for (const r of relations) this.parSource.set(r.source, [...(this.parSource.get(r.source) ?? []), r]);
  }

  nom(id: string): string {
    return this.atlas.structures[id]?.nom ?? id;
  }

  private bilateral(id: string): boolean {
    return this.atlas.structures[id]?.cote === "bilatéral";
  }

  /** Côté tiré au hasard pour une structure paire, sinon aucun. */
  private coteAuHasard(id: string): Cote {
    return this.bilateral(id) ? (this.hasard() < 0.5 ? "droit" : "gauche") : null;
  }

  /** Structures du même système, de préférence de la même région, pour les choix et les pièges. */
  private voisines(id: string, exclus: Set<string>, n: number): string[] {
    const s = this.atlas.structures[id];
    const candidates = Object.entries(this.atlas.structures)
      .filter(([k, x]) => !exclus.has(k) && x.niveau === "noyau" && x.systeme === s?.systeme)
      .map(([k, x]) => ({ k, proche: x.region === s?.region ? 0 : 1, h: this.hasard() }))
      .sort((a, b) => a.proche - b.proche || a.h - b.h);
    return candidates.slice(0, n).map((c) => c.k);
  }

  /** Toutes les cibles valables d'un type de relation pour une structure (pour ne pas en proposer une comme piège). */
  private cibles(source: string, type: string): Set<string> {
    return new Set((this.parSource.get(source) ?? []).filter((r) => r.type === type).map((r) => r.cible));
  }

  construire(carte: CarteFile): Question | null {
    const id = carte.structure_id;
    if (!this.atlas.structures[id]) return null;
    switch (carte.type) {
      case "nommer":
        return { type: "nommer", carte, structure: id, cote: this.coteAuHasard(id), titre: "",
          consigne: "Quelle est la structure surlignée ?", attendu: [id] };
      case "localiser": {
        const cote = this.coteAuHasard(id);
        return { type: "localiser", carte, structure: id, cote, titre: this.nom(id) + (cote ? `, côté ${cote}` : ""),
          consigne: "Clique cette structure sur le modèle.", attendu: [id] };
      }
      case "relation": {
        const { relation = "", cible = "", cote = "" } = carte.contenu;
        const valables = this.cibles(id, relation);
        const pieges = this.voisines(cible, new Set([id, ...valables]), 3);
        if (pieges.length < 3) return null;
        const choix = melanger([cible, ...pieges], this.hasard).map((c) => ({ id: c, nom: this.nom(c) }));
        return { type: "relation", carte, structure: id, cote: (cote || null) as Cote,
          titre: this.nom(id) + (cote ? `, côté ${cote}` : ""), consigne: `${LIBELLES_RELATION[relation] ?? relation} :`,
          choix, attendu: [cible] };
      }
      case "vrai_faux": {
        const relations = (this.parSource.get(id) ?? []).filter((r) => r.verifiee && LIBELLES_RELATION[r.type]);
        if (!relations.length) return null;
        const r = relations[Math.floor(this.hasard() * relations.length)];
        // Une fois sur deux, une seule inversion rend l'affirmation fausse, comme dans les QCM à discordances
        const vrai = this.hasard() < 0.5;
        const cible = vrai ? r.cible : this.voisines(r.cible, new Set([id, ...this.cibles(id, r.type)]), 1)[0];
        if (!cible) return null;
        return { type: "vrai_faux", carte, structure: id, cote: (r.cote || null) as Cote,
          titre: this.nom(id) + (r.cote ? `, côté ${r.cote}` : ""),
          consigne: `${LIBELLES_RELATION[r.type]} : ${this.nom(cible)}. Vrai ou faux ?`,
          attendu: [r.cible], enonce: { cible, vrai } };
      }
      case "trajet": {
        const etapes = carte.contenu.etapes ?? [];
        if (etapes.length < 3) return null;
        return { type: "trajet", carte, structure: etapes[0], cote: null, titre: "Trajet",
          consigne: "Clique les structures dans l'ordre, de l'amont vers l'aval.",
          choix: melanger(etapes, this.hasard).map((c) => ({ id: c, nom: this.nom(c) })), attendu: etapes };
      }
    }
    return null;
  }

  /** Question d'entraînement (mini-quiz d'un parcours, quiz libre) : nommer ou localiser, non notée. */
  entrainement(id: string, type: "nommer" | "localiser"): Question {
    const faux: CarteFile = { id: 0, cle: "", type, structure_id: id, contenu: {}, phase: "", echeance: null,
      apercu: { 1: "", 2: "", 3: "", 4: "" } };
    return { ...this.construire(faux)!, carte: null };
  }

  /** Correction d'une réponse : texte tapé, choix, structure cliquée, booléen ou ordre. */
  corriger(q: Question, reponse: { texte?: string; choix?: string; clic?: { structure: string | null; cote: Cote; nom: string };
    vrai?: boolean; ordre?: string[] }): Verdict {
    const nomJuste = this.nom(q.structure) + (q.cote ? `, côté ${q.cote}` : "");
    switch (q.type) {
      case "nommer": {
        const s = this.atlas.structures[q.structure];
        const c = corriger(reponse.texte ?? "", [s.nom, ...s.synonymes]);
        if (c.juste && c.approchee) return { juste: true, approchee: true, explication: `Réponse acceptée, à une faute près : ${s.nom}.` };
        if (c.juste) return { juste: true, explication: `Réponse correcte : ${s.nom}.` };
        const tape = (reponse.texte ?? "").trim();
        return { juste: false, explication: `${tape ? `« ${tape} » n'est pas le bon nom.` : "Pas de réponse."} C'était : ${s.nom}.` };
      }
      case "localiser": {
        const clic = reponse.clic;
        if (!clic || !clic.structure) {
          return { juste: false, explication: `${clic ? `Tu as cliqué : ${clic.nom}.` : "Rien de cliqué."} La structure demandée est surlignée : ${nomJuste}.` };
        }
        const memeStructure = clic.structure === q.structure;
        const memeCote = !q.cote || !clic.cote || clic.cote === q.cote;
        if (memeStructure && memeCote) return { juste: true, explication: `Bien localisée : ${nomJuste}.` };
        if (memeStructure) return { juste: false, explication: `Bonne structure, mauvais côté : on demandait le côté ${q.cote}.` };
        return { juste: false, explication: `Tu as cliqué : ${clic.nom}. La structure demandée est surlignée : ${nomJuste}.` };
      }
      case "relation": {
        const juste = reponse.choix === q.attendu[0];
        return { juste, explication: juste ? `Réponse correcte : ${q.consigne.replace(/ :$/, "").toLowerCase()} ${this.nom(q.attendu[0])}.`
          : `Non : ${q.titre}, ${q.consigne.replace(/ :$/, "").toLowerCase()} ${this.nom(q.attendu[0])}.` };
      }
      case "vrai_faux": {
        const juste = reponse.vrai === q.enonce!.vrai;
        const verite = q.enonce!.vrai ? "C'était vrai." : `C'était faux : la bonne réponse est ${this.nom(q.attendu[0])}.`;
        return { juste, explication: `${juste ? "Bonne réponse." : "Mauvaise réponse."} ${verite}` };
      }
      case "trajet": {
        const ordre = reponse.ordre ?? [];
        const juste = ordre.length === q.attendu.length && ordre.every((x, i) => x === q.attendu[i]);
        return { juste, explication: juste ? "Ordre correct." : `L'ordre était : ${q.attendu.map((x) => this.nom(x)).join(", puis ")}.` };
      }
    }
  }
}
