import { normaliser } from "../donnees";

// Correction des réponses tapées : accents, ligatures, tirets et majuscules ignorés, synonymes et
// anciens noms acceptés, « artère » ou « veine » facultatifs, une faute de frappe tolérée par tranche de 7 lettres.

// Seuls « artère » et « veine » sont facultatifs : « horizontale » ne suffit pas pour l'aorte horizontale
const PREFIXES = /^(arteres?|veines?) /;

export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = ligne[0];
    ligne[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = ligne[j];
      ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return ligne[b.length];
}

function formes(nom: string): string[] {
  const n = normaliser(nom).replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  const sans = n.replace(PREFIXES, "");
  // « artères lombaires » et « artère lombaire » : on accepte le singulier et le pluriel
  // Sans lookbehind : Safari ne le connaît qu'à partir de la version 16.4
  const singulier = (t: string) => t.split(" ").map((m) => (m.length > 3 ? m.replace(/(s|x)$/, "") : m)).join(" ");
  return [...new Set([n, sans, singulier(n), singulier(sans)])].filter(Boolean);
}

export interface Correction {
  juste: boolean;
  /** Juste à une faute de frappe près : on le dit, sans pénaliser. */
  approchee: boolean;
}

/** La réponse correspond-elle à l'un des noms admis ? */
export function corriger(reponse: string, noms: string[]): Correction {
  const r = formes(reponse);
  if (!r[0]) return { juste: false, approchee: false };
  let approchee = false;
  for (const nom of noms) {
    for (const f of formes(nom)) {
      for (const x of r) {
        if (x === f) return { juste: true, approchee: false };
        const tolerance = Math.floor(f.length / 7);
        if (tolerance && distance(x, f) <= tolerance) approchee = true;
      }
    }
  }
  return { juste: approchee, approchee };
}
