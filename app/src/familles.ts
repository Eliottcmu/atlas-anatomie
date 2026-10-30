import { normaliser, type Atlas, type Famille } from "./donnees";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface RappelsFamilles {
  etat(action: string, ensuite: string, erreur?: boolean): void;
  /** Charge et affiche le calque (une case cochée alors que le calque est masqué). */
  afficherCalque(id: string): Promise<void>;
  /** Maillages à cacher : ceux des éléments décochés. */
  appliquer(caches: Set<string>): void;
  lire(cle: string): string | null;
  ecrire(cle: string, valeur: string): void;
}

/**
 * Panneau « Choisir » d'un calque : familles (appareil digestif, nerfs crâniens) et leurs éléments (foie,
 * nerf médian), à cocher un par un. Les éléments décochés sont gardés d'une session à l'autre ; tant que
 * l'utilisateur n'a rien changé, les familles marquées « masquée » (la peau) sont décochées.
 */
export class ChoixFamilles {
  private familles: Famille[];
  private caches = new Set<string>();
  private elementDe = new Map<string, string>();
  private nomElement = new Map<string, string>();
  private clesElement = new Map<string, string[]>();
  calque: string | null = null;

  constructor(atlas: Atlas, private rappels: RappelsFamilles) {
    this.familles = atlas.familles ?? [];
    for (const f of this.familles) {
      for (const e of f.elements) {
        this.nomElement.set(e.id, e.nom);
        this.clesElement.set(e.id, e.cles);
        for (const c of e.cles) this.elementDe.set(c, e.id);
      }
    }
    const lu = rappels.lire("familles-cachees");
    let enregistres: string[] | null = null;
    try { enregistres = lu ? JSON.parse(lu) as string[] : null; } catch { enregistres = null; }
    if (Array.isArray(enregistres)) {
      for (const id of enregistres) if (this.nomElement.has(id)) this.caches.add(id);
    } else {
      for (const id of this.parDefaut()) this.caches.add(id);
    }
    $("choix-fermer").addEventListener("click", () => this.fermer());
    $("choix-liste").addEventListener("change", (e) => this.changement(e.target as HTMLInputElement));
    $("choix-liste").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-deplier]");
      if (!b) return;
      const ul = b.closest("section")!.querySelector("ul")!;
      ul.hidden = !ul.hidden;
      b.setAttribute("aria-expanded", String(!ul.hidden));
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-choix]")) {
      b.addEventListener("click", () => this.tout(b.dataset.choix as "tout" | "rien" | "defaut"));
    }
    $<HTMLInputElement>("choix-filtre").addEventListener("input", () => this.filtrer());
  }

  /** Appelé une fois l'interface prête : cache les éléments décochés. */
  demarrer(): void {
    this.rappels.appliquer(this.clesCachees());
  }

  aDesFamilles(calque: string): boolean {
    return this.familles.some((f) => f.calque === calque);
  }

  get ouvert(): boolean {
    return !$("choix-familles").hidden;
  }

  /** Éléments affichés et total d'un calque, pour le bouton « Choisir ». */
  bilan(calque: string): { affiches: number; total: number } {
    let total = 0, affiches = 0;
    for (const f of this.familles) {
      if (f.calque !== calque) continue;
      for (const e of f.elements) {
        total++;
        if (!this.caches.has(e.id)) affiches++;
      }
    }
    return { affiches, total };
  }

  basculer(calque: string, nomCalque: string): void {
    if (this.ouvert && this.calque === calque) this.fermer();
    else this.ouvrir(calque, nomCalque);
  }

  ouvrir(calque: string, nomCalque: string): void {
    this.calque = calque;
    $("choix-titre").textContent = nomCalque;
    $<HTMLInputElement>("choix-filtre").value = "";
    this.construire();
    $("choix-familles").hidden = false;
    this.rappels.etat(`${nomCalque} : coche les familles et les éléments à afficher.`,
      "Le choix est gardé pour les prochaines sessions. Échap pour fermer le panneau.");
  }

  fermer(): void {
    $("choix-familles").hidden = true;
    this.calque = null;
  }

  /**
   * Recoche les éléments qui portent ces maillages (structure cherchée, organe d'une famille décochée).
   * Renvoie leurs noms.
   */
  montrer(cles: Iterable<string>): string[] {
    const ids = new Set<string>();
    for (const c of cles) {
      const id = this.elementDe.get(c);
      if (id && this.caches.has(id)) ids.add(id);
    }
    if (!ids.size) return [];
    for (const id of ids) this.caches.delete(id);
    this.enregistrer();
    return [...ids].map((id) => this.nomElement.get(id)!);
  }

  private parDefaut(): string[] {
    return this.familles.filter((f) => f.masquee).flatMap((f) => f.elements.map((e) => e.id));
  }

  private clesCachees(): Set<string> {
    const res = new Set<string>();
    for (const id of this.caches) for (const c of this.clesElement.get(id) ?? []) res.add(c);
    return res;
  }

  private enregistrer(): void {
    this.rappels.ecrire("familles-cachees", JSON.stringify([...this.caches]));
    this.rappels.appliquer(this.clesCachees());
    if (this.ouvert) this.majCases();
    document.dispatchEvent(new CustomEvent("atlas:familles"));
  }

  private construire(): void {
    const html = this.familles.filter((f) => f.calque === this.calque).map((f) => `
      <section data-section="${f.id}">
        <div class="famille-tete">
          <label><input type="checkbox" data-famille="${f.id}"><span>${echapper(f.nom)}</span></label>
          <span class="compte" data-compte="${f.id}"></span>
          <button data-deplier aria-expanded="false" title="Voir les éléments de la famille" aria-label="Déplier ${echapper(f.nom)}">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
        </div>
        <ul hidden>${f.elements.map((e) => `<li data-nom="${echapper(normaliser(e.nom))}"><label>
          <input type="checkbox" data-element="${e.id}"><span>${echapper(e.nom)}</span></label>
          <span class="compte">${e.cles.length}</span></li>`).join("")}</ul>
      </section>`).join("");
    $("choix-liste").innerHTML = html;
    this.majCases();
  }

  private majCases(): void {
    for (const f of this.familles) {
      if (f.calque !== this.calque) continue;
      const n = f.elements.filter((e) => !this.caches.has(e.id)).length;
      const caseF = document.querySelector<HTMLInputElement>(`input[data-famille="${f.id}"]`);
      if (!caseF) continue;
      caseF.checked = n === f.elements.length;
      caseF.indeterminate = n > 0 && n < f.elements.length;
      document.querySelector(`[data-compte="${f.id}"]`)!.textContent = `${n}/${f.elements.length}`;
      for (const e of f.elements) {
        const c = document.querySelector<HTMLInputElement>(`input[data-element="${e.id}"]`);
        if (c) c.checked = !this.caches.has(e.id);
      }
    }
  }

  private changement(cible: HTMLInputElement): void {
    const famille = this.familles.find((f) => f.id === cible.dataset.famille);
    let ids: string[], nom: string;
    if (famille) {
      ids = famille.elements.map((e) => e.id);
      nom = famille.nom;
    } else if (cible.dataset.element) {
      ids = [cible.dataset.element];
      nom = this.nomElement.get(cible.dataset.element) ?? "";
    } else return;
    for (const id of ids) {
      if (cible.checked) this.caches.delete(id);
      else this.caches.add(id);
    }
    this.enregistrer();
    const calque = this.calque!;
    if (cible.checked) void this.rappels.afficherCalque(calque);
    this.rappels.etat(`${nom} : ${cible.checked ? "affiché" : "caché"}${ids.length > 1 ? ` (${ids.length} éléments)` : ""}.`,
      cible.checked ? "Décoche pour cacher de nouveau." : "Coche pour réafficher ; le choix est gardé.");
  }

  private tout(mode: "tout" | "rien" | "defaut"): void {
    const ids = this.familles.filter((f) => f.calque === this.calque).flatMap((f) => f.elements.map((e) => e.id));
    const defaut = new Set(this.parDefaut());
    for (const id of ids) {
      const cacher = mode === "rien" || (mode === "defaut" && defaut.has(id));
      if (cacher) this.caches.add(id);
      else this.caches.delete(id);
    }
    this.enregistrer();
    if (mode !== "rien") void this.rappels.afficherCalque(this.calque!);
    this.rappels.etat({ tout: "Tous les éléments sont affichés.", rien: "Tous les éléments sont cachés.",
      defaut: "Choix par défaut rétabli (peau cachée)." }[mode], "Coche une famille ou un élément pour l'ajuster.");
  }

  private filtrer(): void {
    const q = normaliser($<HTMLInputElement>("choix-filtre").value);
    for (const s of document.querySelectorAll<HTMLElement>("#choix-liste section")) {
      let visibles = 0;
      for (const li of s.querySelectorAll<HTMLLIElement>("li")) {
        const ok = !q || li.dataset.nom!.includes(q);
        li.hidden = !ok;
        visibles += Number(ok);
      }
      s.hidden = visibles === 0;
      const ul = s.querySelector("ul")!;
      ul.hidden = !q;
      s.querySelector("[data-deplier]")!.setAttribute("aria-expanded", String(!!q));
    }
  }
}

function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
