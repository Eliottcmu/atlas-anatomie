// Accès à l'API de révision du lanceur (lanceur/revisions.go)

export type TypeCarte = "nommer" | "localiser" | "relation" | "vrai_faux" | "trajet";

export interface CarteFile {
  id: number;
  cle: string;
  type: TypeCarte;
  structure_id: string;
  contenu: { relation?: string; cible?: string; cote?: string; etapes?: string[] };
  phase: string;
  echeance: string | null;
  apercu: Record<"1" | "2" | "3" | "4", string>;
}

export interface FileDuJour {
  dues: CarteFile[];
  nouvelles: CarteFile[];
  nouvelles_restantes_aujourdhui: number;
  nouvelles_en_reserve: number;
  demain: number;
  prochaine_echeance: string | null;
}

export interface Bilan {
  jours: { jour: string; revisions: number; justes: number }[];
  serie: number;
  retention_30j: number | null;
  revisions_30j: number;
  revisions_total: number;
  dues: number;
  actives: number;
  suspendues: number;
  nouvelles: number;
  nouvelles_aujourdhui: number;
}

export type Niveau = "nouvelle" | "a_revoir" | "en_cours" | "acquise";
export type Maitrise = Record<string, { cartes: number; vues: number; dues: number; retenabilite: number | null; niveau: Niveau }>;

export interface RelationBase {
  source: string;
  cible: string;
  type: string;
  cote: string;
  verifiee: boolean;
}

export class ErreurApi extends Error {}

async function requete<T>(methode: string, url: string, corps?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: methode,
      headers: corps ? { "Content-Type": "application/json" } : undefined,
      body: corps ? JSON.stringify(corps) : undefined,
    });
  } catch {
    throw new ErreurApi("Le lanceur de l'atlas ne répond pas.");
  }
  if (!r.ok) {
    const detail = await r.json().then((d) => d.detail).catch(() => r.statusText);
    throw new ErreurApi(detail || `erreur ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  synchroniser: (avecModele: string[]) =>
    requete<{ creees: number; suspendues: number; actives: Record<string, number>; fiches_verifiees: number }>(
      "POST", "/api/cartes/synchroniser", { avec_modele: avecModele }),
  file: (nouvelles: number) => requete<FileDuJour>("GET", `/api/revisions/file?nouvelles=${nouvelles}`),
  noter: (id: number, note: number, dureeMs: number) =>
    requete<{ echeance: string; dans: string; phase: string }>("POST", `/api/revisions/${id}`, { note, duree_ms: dureeMs }),
  bilan: () => requete<Bilan>("GET", "/api/revisions/bilan"),
  maitrise: () => requete<Maitrise>("GET", "/api/maitrise"),
  reinitialiser: (confirmer: boolean) =>
    requete<{ revisions: number; efface: boolean; sauvegarde?: string }>("POST", "/api/revisions/reinitialiser", { confirmer }),
  relations: () => requete<RelationBase[]>("GET", "/api/relations"),
  suiviParcours: () => requete<Record<string, { dernier: string; fois: number; meilleur_score: number; total: number }>>(
    "GET", "/api/parcours/suivi"),
  parcoursTermine: (id: string, score: number, total: number, structures: string[]) =>
    requete<{ enregistre: boolean }>("POST", `/api/parcours/${encodeURIComponent(id)}/termine`, { score, total, structures }),
};
