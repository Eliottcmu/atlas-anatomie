import type { Cote } from "./donnees";
import type { EtatCamera } from "./scene";

/** Ce qu'il faut pour revenir à une étape : focus, sélection, point de vue. */
export interface EtapeNavigation {
  focus: { type: "region" | "organe"; id: string } | null;
  selection: { structure: string | null; noeud: string | null; cote: Cote } | null;
  camera: EtatCamera;
  libelle: string;
}

const MAXI = 80;

/** Historique des étapes de navigation, comme les boutons Précédent et Suivant d'un navigateur. */
export class Historique {
  private pile: EtapeNavigation[] = [];
  private index = -1;
  /** Vrai pendant qu'on rejoue une étape : ce qui se passe alors ne s'enregistre pas. */
  restauration = false;

  get peutReculer(): boolean {
    return this.index > 0;
  }

  get peutAvancer(): boolean {
    return this.index < this.pile.length - 1;
  }

  /** Met à jour le point de vue de l'étape courante (l'utilisateur a tourné ou zoomé depuis). */
  majCamera(camera: EtatCamera): void {
    if (this.index >= 0 && !this.restauration) this.pile[this.index].camera = camera;
  }

  enregistrer(etape: EtapeNavigation): void {
    if (this.restauration) return;
    const courante = this.pile[this.index];
    // Même focus et même sélection : on ne fait que suivre le point de vue
    if (courante && memeEtape(courante, etape)) {
      courante.camera = etape.camera;
      return;
    }
    this.pile = this.pile.slice(0, this.index + 1);
    this.pile.push(etape);
    if (this.pile.length > MAXI) this.pile.shift();
    this.index = this.pile.length - 1;
  }

  reculer(): EtapeNavigation | null {
    if (!this.peutReculer) return null;
    return this.pile[--this.index];
  }

  avancer(): EtapeNavigation | null {
    if (!this.peutAvancer) return null;
    return this.pile[++this.index];
  }

  /** Étapes récentes distinctes, de la plus récente à la plus ancienne (catalogue). */
  recentes(n = 8): EtapeNavigation[] {
    const vues = new Set<string>();
    const res: EtapeNavigation[] = [];
    for (let i = this.index; i >= 0 && res.length < n; i--) {
      const e = this.pile[i];
      if (!e.libelle || vues.has(e.libelle)) continue;
      vues.add(e.libelle);
      res.push(e);
    }
    return res;
  }
}

function memeEtape(a: EtapeNavigation, b: EtapeNavigation): boolean {
  return JSON.stringify([a.focus, a.selection]) === JSON.stringify([b.focus, b.selection]);
}

/** Système de l'utilisateur : libellés des touches (Ctrl ou Cmd) et réglage par défaut du pavé tactile. */
export const SUR_MAC = /Mac|iPhone|iPad/.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent,
);

export function touche(nom: string): string {
  if (!SUR_MAC) return nom;
  return ({ Ctrl: "⌘", Alt: "⌥", "Échap": "esc", Maj: "⇧", "Entrée": "↩" } as Record<string, string>)[nom] ?? nom;
}
