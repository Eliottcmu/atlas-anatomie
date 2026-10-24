// Données de l'atlas produites par pipeline/construire_atlas.py

export type Cote = "droit" | "gauche" | null;

export interface Calque {
  id: string;
  nom: string;
  couleur: string;
  touche: string;
  visible: boolean;
  repere?: boolean;
  fichiers: string[];
}

export interface Structure {
  nom: string;
  synonymes: string[];
  systeme: string;
  region: string;
  niveau: "noyau" | "approfondissement";
  cote: "bilatéral" | "unique";
  fma_id: string;
  couverture: string;
  noeuds: string[];
}

export interface Noeud {
  calque: string;
  structure: string | null;
  propre: boolean;
  cote: Cote;
  nom: string;
  source_nom: string;
  nom_en: string;
  fma_id: string;
  source: string;
  ecart_origine_mm?: string;
  /** Rendu particulier : enveloppe translucide (lobes pulmonaires, plèvre), nœud lymphatique. */
  rendu?: "enveloppe" | "lymphatique";
  /** Maillage remplacé par des parties plus fines (hypophyse de BodyParts3D) : jamais affiché. */
  doublon?: boolean;
  /** Vaisseaux : lien avec le vaisseau d'origine (donnees/listes/arbre_vasculaire.csv). */
  lien?: "partie" | "branche" | "affluent" | "anastomose";
  /** Nom français du vaisseau d'origine (ou des vaisseaux, pour une anastomose). */
  parent?: string;
  remarque_arbre?: string;
  /** Étiquette de BodyParts3D corrigée d'après la position du maillage, et pourquoi. */
  etiquette_bp3d?: string;
  correction?: string;
}

/** Repère légendé sur un organe (hile du rein, pôle supérieur...) : pointe posée sur la surface. */
export interface Repere {
  nom: string;
  nom_en: string;
  cle: string;
  p: [number, number, number];
  inconstant?: boolean;
  /** Placé par le pipeline sur la géométrie (apex du cœur, sillons), faute de légende dans Z-Anatomy. */
  calcule?: boolean;
  /** Pointe de Z-Anatomy au centre d'un trou ou dans l'axe d'un os : posée sur le bord le plus proche. */
  approchee?: boolean;
  /** Nom cité tel quel dans les ronéos d'Eliott. */
  roneo?: boolean;
  /** Étiquette de Z-Anatomy corrigée (noms échangés), et pourquoi. */
  correction?: string;
  source_nom: string;
}

export type Boite = [[number, number, number], [number, number, number]];

export interface Region {
  id: string;
  nom: string;
  groupe: string;
  cote: Cote;
  vue: [number, number, number];
  boite: Boite;
}

export interface Organe {
  id: string;
  nom: string;
  groupe: string;
  vue: [number, number, number];
  /** Ce qu'on montre autour : vaisseaux centrés dans la boîte, os seuls, ou l'os et ses vaisseaux (masqués d'abord). */
  contexte: "parties" | "vaisseaux" | "os";
  parties: string[];
  reperes: Repere[];
  /** Os : focus du catalogue « Os », décliné par côté pour un os pair. */
  os?: boolean;
  cote?: Cote;
}

export interface Atlas {
  genere_le: string;
  calques: Calque[];
  structures: Record<string, Structure>;
  noeuds: Record<string, Noeud>;
  regions: Region[];
  organes: Organe[];
}

export class ErreurChargement extends Error {
  constructor(public cause_: string, public action: string) {
    super(cause_);
  }
}

export async function chargerAtlas(): Promise<Atlas> {
  let reponse: Response;
  try {
    reponse = await fetch("/donnees/atlas.json");
  } catch {
    throw new ErreurChargement("Le serveur local ne répond pas.", "Relancer lancer.bat.");
  }
  if (!reponse.ok) {
    throw new ErreurChargement(
      `Fichier atlas.json introuvable (erreur ${reponse.status}).`,
      "Lancer python -I pipeline/construire_atlas.py, puis recharger la page.",
    );
  }
  return (await reponse.json()) as Atlas;
}

/** Forme de comparaison pour la recherche : minuscules, sans accents, ligatures ni tirets (« coeur » trouve « Cœur »). */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYSTEMES: Record<string, string> = { "artère": "Artère", veine: "Veine" };

export function libelleSysteme(systeme: string): string {
  return SYSTEMES[systeme] ?? systeme;
}

export function libelleCote(cote: Cote): string {
  return cote === "droit" ? "côté droit" : cote === "gauche" ? "côté gauche" : "";
}
