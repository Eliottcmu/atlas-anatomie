// Fiches des structures : affichage dans le panneau, vérification et correction, liste de suivi.
// Les données viennent du lanceur local (lanceur/, en Go) ; sans lui, l'atlas reste utilisable.

import type { Cote } from "./donnees";
import { signalerPresence } from "./presence";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface Source { roneo: string; titre?: string; fichier?: string; pages: number[] }
interface Champ { texte: string; sources: Source[] }
interface Relation { type: string; cible: string; cote?: string | null; sources?: Source[] }
interface Fiche {
  structure_id: string;
  champs: Record<string, Champ>;
  relations: Relation[];
  remarques: string[];
  statut: "brouillon" | "verifie";
  modifie_par: string;
  modifie_le: string;
  verifie_le: string | null;
  note: string | null;
  proposition: { champs: Record<string, Champ>; relations: Relation[]; remarques: string[] } | null;
  hors_roneo: string[];
}
interface RelationVue { cible_id?: string; source_id?: string; type: string; cote: string | null; nom: string }
interface Reponse {
  structure: { id: string; nom_fr: string; nom_latin: string | null; systeme: string; niveau: string };
  fiche: Fiche | null;
  champs_permis: string[];
  libelles: Record<string, string>;
  relations_sortantes: RelationVue[];
  relations_entrantes: RelationVue[];
}
interface Ligne {
  id: string; nom_fr: string; systeme: string; region: string; niveau: string;
  statut: "brouillon" | "verifie" | null; modifie_par: string | null; hors_roneo: string[]; proposition: boolean;
}

export interface RappelsFiches {
  etat(action: string, ensuite: string, erreur?: boolean): void;
  selectionnerStructure(id: string, cote: Cote): void;
  /** Une fiche a changé de contenu ou de statut : les cartes de révision se recalculent. */
  ficheModifiee?(): void;
}

// Libellés des relations, lues depuis la structure (sortantes) ou vers elle (entrantes)
const SORTANTES: Record<string, string> = {
  branche_de: "Naît de", fait_suite_a: "Fait suite à", se_jette_dans: "Se jette dans", anastomose_avec: "S'anastomose avec",
};
const ENTRANTES: Record<string, string> = {
  branche_de: "Donne", fait_suite_a: "Se continue par", se_jette_dans: "Reçoit", anastomose_avec: "S'anastomose avec",
};

export class Fiches {
  disponible = false;
  edition = false;
  private courant: Reponse | null = null;
  private sources: Record<string, { titre: string; pages: number | null }> = {};
  private lignes: Ligne[] = [];
  private filtre: "a-verifier" | "verifiees" | "toutes" | "sans-fiche" = "a-verifier";

  constructor(private rappels: RappelsFiches) {
    $("ouvrir-liste-fiches").addEventListener("click", () => this.basculerListe());
    $("liste-fiches-fermer").addEventListener("click", () => this.fermerListe());
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-filtre-fiches]")) {
      b.addEventListener("click", () => { this.filtre = b.dataset.filtreFiches as typeof this.filtre; this.afficherListe(); });
    }
    $("liste-fiches-contenu").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-structure]");
      if (!b) return;
      this.fermerListe();
      this.rappels.selectionnerStructure(b.dataset.structure!, null);
    });
    $("fiche-contenu").addEventListener("click", (e) => this.clicContenu(e));
  }

  /** Vérifie une fois au démarrage que le serveur des fiches répond. */
  async demarrer(): Promise<void> {
    try {
      const r = await fetch("/api/etat");
      if (!r.ok) throw new Error(String(r.status));
      this.disponible = true;
      signalerPresence();
      this.sources = await (await fetch("/api/sources")).json();
      await this.majCompteur();
    } catch {
      this.disponible = false;
      $("ouvrir-liste-fiches").hidden = true;
    }
  }

  /** Fiches noyau vérifiées et total (premier lancement guidé) ; null si le lanceur ne répond pas. */
  bilan: { noyau: number; verifiees: number } | null = null;

  private async majCompteur(): Promise<void> {
    const e = await (await fetch("/api/etat")).json();
    this.bilan = { noyau: e.noyau, verifiees: e.noyau_verifie };
    $("compteur-fiches").textContent = `${e.noyau_verifie}/${e.noyau}`;
    $("ouvrir-liste-fiches").title = `${e.noyau_verifie} fiches noyau vérifiées sur ${e.noyau}, ${e.brouillons} brouillons en attente`;
  }

  // ------------------------------------------------------------ affichage dans le panneau

  /** Affiche la fiche d'une structure sous la carte d'identité ; vide le bloc si id est nul. */
  async afficher(id: string | null, brancheDe?: string): Promise<void> {
    const bloc = $("fiche-contenu");
    this.edition = false;
    this.courant = null;
    if (!id) {
      bloc.innerHTML = "";
      return;
    }
    if (brancheDe) {
      bloc.innerHTML = `<p class="aide">Pas de fiche pour cette branche, hors liste noyau. <button class="lien" data-ouvrir="${id}">Voir la fiche : ${echapper(brancheDe)}</button></p>`;
      return;
    }
    if (!this.disponible) {
      bloc.innerHTML = `<p class="fiche-statut indisponible">Fiches indisponibles : le serveur local ne répond pas. Lancer l'atlas avec lancer.bat.</p>`;
      return;
    }
    bloc.innerHTML = `<p class="aide">Chargement de la fiche...</p>`;
    try {
      const r = await fetch(`/api/fiches/${id}`);
      if (!r.ok) throw new Error(`erreur ${r.status}`);
      this.courant = await r.json();
    } catch (e) {
      bloc.innerHTML = `<p class="fiche-statut indisponible">Fiche illisible (${echapper(String(e))}). Vérifier que le serveur tourne.</p>`;
      return;
    }
    this.rendreLecture();
  }

  private rendreLecture(): void {
    const c = this.courant!;
    const f = c.fiche;
    const bloc = $("fiche-contenu");
    if (!f) {
      bloc.innerHTML = `<p class="fiche-statut brouillon">Pas encore de fiche pour cette structure.</p>
        ${c.structure.nom_latin ? `<p class="latin">${echapper(c.structure.nom_latin)}</p>` : ""}
        <button class="bouton-fiche" data-action-fiche="editer">Rédiger la fiche <kbd>E</kbd></button>`;
      return;
    }
    const statut = f.statut === "verifie"
      ? `<p class="fiche-statut verifie">Vérifiée le ${dateCourte(f.verifie_le)}${f.note ? ` · ${echapper(f.note)}` : ""}</p>`
      : `<p class="fiche-statut brouillon">Brouillon rédigé par ${f.modifie_par === "claude" ? "Claude" : "toi"}, à vérifier contre tes ronéos${
          f.hors_roneo.length ? ` · ${f.hors_roneo.length} champ${f.hors_roneo.length > 1 ? "s" : ""} sans source ronéo` : ""}</p>`;
    const proposition = f.proposition ? `<div class="fiche-proposition">
        <p>Claude a retravaillé ce brouillon après ta vérification.</p>
        <button data-action-fiche="voir-proposition">Comparer</button>
        <button data-action-fiche="accepter">Prendre la nouvelle version</button>
        <button data-action-fiche="ignorer">Garder la mienne</button></div>` : "";
    const champs = c.champs_permis.filter((n) => f.champs[n]?.texte).map((n) => {
      const ch = f.champs[n];
      const hors = !ch.sources.length;
      return `<dt>${c.libelles[n] ?? n}</dt><dd${hors ? ' class="hors-roneo"' : ""}><p>${echapper(ch.texte)}</p>
        <span class="sources">${hors ? `<span class="avertissement">hors ronéos, à vérifier</span>` : ch.sources.map(lienSource).join("")}</span></dd>`;
    }).join("");
    const relations = this.rendreRelations(c);
    const remarques = f.remarques.length
      ? `<div class="fiche-remarques"><h4 class="etiquette">Points à vérifier</h4><ul>${f.remarques.map((r) => `<li>${echapper(r)}</li>`).join("")}</ul></div>` : "";
    bloc.innerHTML = `${statut}${proposition}
      ${c.structure.nom_latin ? `<p class="latin">${echapper(c.structure.nom_latin)}</p>` : ""}
      ${relations}<dl class="fiche-champs">${champs}</dl>${remarques}
      <button class="bouton-fiche" data-action-fiche="editer">${f.statut === "verifie" ? "Corriger" : "Vérifier et corriger"} <kbd>E</kbd></button>`;
  }

  private rendreRelations(c: Reponse): string {
    const groupes = new Map<string, string[]>();
    const ajouter = (libelle: string, id: string, nom: string, cote: string | null) => {
      const lien = `<button class="lien" data-ouvrir="${id}"${cote ? ` data-cote="${cote}"` : ""}>${echapper(nom)}</button>${cote ? ` <span class="cote">(côté ${cote})</span>` : ""}`;
      groupes.set(libelle, [...(groupes.get(libelle) ?? []), lien]);
    };
    for (const r of c.relations_sortantes) if (SORTANTES[r.type]) ajouter(SORTANTES[r.type], r.cible_id!, r.nom, r.cote);
    for (const r of c.relations_entrantes) if (ENTRANTES[r.type]) ajouter(ENTRANTES[r.type], r.source_id!, r.nom, r.cote);
    if (!groupes.size) return "";
    return `<dl class="fiche-relations">${[...groupes].map(([l, v]) => `<dt>${l}</dt><dd>${v.join(", ")}</dd>`).join("")}</dl>`;
  }

  // ------------------------------------------------------------ édition

  basculerEdition(): void {
    if (!this.courant) return;
    if (this.edition) this.annulerEdition();
    else this.ouvrirEdition();
  }

  private ouvrirEdition(versionProposee = false): void {
    const c = this.courant!;
    const base = versionProposee && c.fiche?.proposition ? c.fiche.proposition : c.fiche;
    this.edition = true;
    $("fiche").classList.add("en-edition");
    const champs = c.champs_permis.map((n) => {
      const ch = base?.champs[n];
      const refs = (ch?.sources ?? []).map((s) => `${s.roneo}:${compacter(s.pages)}`).join(" ");
      return `<label class="champ-edition"><span class="etiquette">${c.libelles[n] ?? n}</span>
        <textarea name="${n}" rows="3">${echapper(ch?.texte ?? "")}</textarea>
        <input name="${n}__sources" value="${echapper(refs)}" placeholder="sources, ex. GV26:16-17 MB26:3" spellcheck="false" /></label>`;
    }).join("");
    $("fiche-contenu").innerHTML = `<form class="fiche-edition" novalidate>
      <p class="aide">Compare avec tes ronéos, corrige le texte, puis marque la fiche vérifiée. Sources : code de ronéo et pages (${
        Object.keys(this.sources).join(", ")}). Un champ vide est retiré.</p>
      ${champs}
      <label class="champ-edition"><span class="etiquette">Points à vérifier (un par ligne)</span>
        <textarea name="__remarques" rows="3">${echapper((base?.remarques ?? []).join("\n"))}</textarea></label>
      <label class="champ-edition"><span class="etiquette">Note de vérification (facultative)</span>
        <input name="__note" value="${echapper(c.fiche?.note ?? "")}" placeholder="ex. conforme au cours 2026" /></label>
      <p class="erreur-edition" id="erreur-edition" hidden></p>
      <div class="actions-edition" id="actions-edition">
        <button type="button" data-action-fiche="enregistrer">Enregistrer le brouillon</button>
        <button type="button" data-action-fiche="demander-verification" class="principal">Marquer vérifiée</button>
        <button type="button" data-action-fiche="annuler">Annuler <kbd>Échap</kbd></button>
      </div></form>`;
    $("fiche-contenu").querySelector("textarea")?.focus();
    this.rappels.etat(`Correction de la fiche : ${c.structure.nom_fr}.`, "Compare avec tes ronéos, puis Enregistrer ou Marquer vérifiée. Échap pour annuler.");
  }

  annulerEdition(): void {
    if (!this.edition) return;
    this.edition = false;
    $("fiche").classList.remove("en-edition");
    this.rendreLecture();
    this.rappels.etat("Correction annulée : la fiche n'a pas changé.", "E pour reprendre la correction.");
  }

  /** Lit le formulaire ; renvoie les champs ou une erreur lisible. */
  private lireFormulaire(): { champs: Record<string, Champ>; remarques: string[]; note: string } | string {
    const form = $("fiche-contenu").querySelector("form")!;
    const donnees = new FormData(form);
    const champs: Record<string, Champ> = {};
    for (const n of this.courant!.champs_permis) {
      const texte = String(donnees.get(n) ?? "").trim();
      if (!texte) continue;
      const sources: Source[] = [];
      for (const ref of String(donnees.get(`${n}__sources`) ?? "").split(/[\s;]+/).filter(Boolean)) {
        const m = ref.match(/^([A-Za-z0-9]+):([\d,-]+)$/);
        if (!m || !this.sources[m[1]]) return `Source illisible dans « ${this.courant!.libelles[n] ?? n} » : ${ref}. Format attendu CODE:pages, ex. GV26:16-17.`;
        const pages = developper(m[2]);
        const maxi = this.sources[m[1]].pages;
        if (maxi && pages.some((p) => p > maxi)) return `${m[1]} n'a que ${maxi} pages (source de « ${this.courant!.libelles[n] ?? n} »).`;
        sources.push({ roneo: m[1], titre: this.sources[m[1]].titre, pages });
      }
      champs[n] = { texte, sources };
    }
    const remarques = String(donnees.get("__remarques") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    return { champs, remarques, note: String(donnees.get("__note") ?? "").trim() };
  }

  private async enregistrer(statut: "brouillon" | "verifie"): Promise<void> {
    const lu = this.lireFormulaire();
    const erreur = $("erreur-edition");
    if (typeof lu === "string") {
      erreur.hidden = false;
      erreur.textContent = lu;
      return;
    }
    const id = this.courant!.structure.id;
    const r = await fetch(`/api/fiches/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champs: lu.champs, remarques: lu.remarques, note: lu.note || null, statut }),
    });
    if (!r.ok) {
      erreur.hidden = false;
      erreur.textContent = `Enregistrement refusé : ${(await r.json().catch(() => ({ detail: r.status }))).detail}`;
      return;
    }
    this.courant = await r.json();
    this.edition = false;
    $("fiche").classList.remove("en-edition");
    this.rendreLecture();
    await this.majCompteur();
    this.rappels.ficheModifiee?.();
    const nom = this.courant!.structure.nom_fr;
    this.rappels.etat(statut === "verifie"
      ? `Fiche vérifiée : ${nom}. Ses questions de relations entrent en révision.` : `Brouillon enregistré : ${nom}.`,
    statut === "verifie" ? "L pour la liste des fiches à vérifier." : "Marque-la vérifiée quand elle est conforme à tes ronéos.");
  }

  private async decider(action: "accepter" | "ignorer"): Promise<void> {
    const id = this.courant!.structure.id;
    const r = await fetch(`/api/fiches/${id}/proposition`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    if (!r.ok) return;
    this.courant = await r.json();
    this.rendreLecture();
    await this.majCompteur();
    this.rappels.ficheModifiee?.();
    this.rappels.etat(action === "accepter"
      ? "Nouvelle version prise : la fiche repasse en brouillon, à revérifier." : "Proposition écartée : ta version est gardée.",
    "E pour relire la fiche.");
  }

  private clicContenu(e: Event): void {
    const cible = e.target as HTMLElement;
    const ouvrir = cible.closest<HTMLButtonElement>("button[data-ouvrir]");
    if (ouvrir) {
      this.rappels.selectionnerStructure(ouvrir.dataset.ouvrir!, (ouvrir.dataset.cote || null) as Cote);
      return;
    }
    const b = cible.closest<HTMLButtonElement>("button[data-action-fiche]");
    if (!b) return;
    const action = b.dataset.actionFiche;
    if (action === "editer") this.ouvrirEdition();
    else if (action === "annuler") this.annulerEdition();
    else if (action === "enregistrer") this.enregistrer("brouillon");
    else if (action === "demander-verification") {
      // Confirmation explicite : une fiche vérifiée entrera en révision, une erreur serait apprise par cœur
      $("actions-edition").innerHTML = `<p class="confirmation">Tu confirmes que chaque champ est conforme à tes ronéos ?</p>
        <button type="button" data-action-fiche="verifier" class="principal">Oui, fiche vérifiée</button>
        <button type="button" data-action-fiche="annuler-verification">Pas encore</button>`;
    } else if (action === "verifier") this.enregistrer("verifie");
    else if (action === "annuler-verification") {
      $("actions-edition").innerHTML = `<button type="button" data-action-fiche="enregistrer">Enregistrer le brouillon</button>
        <button type="button" data-action-fiche="demander-verification" class="principal">Marquer vérifiée</button>
        <button type="button" data-action-fiche="annuler">Annuler <kbd>Échap</kbd></button>`;
    } else if (action === "voir-proposition") this.ouvrirEdition(true);
    else if (action === "accepter") this.decider("accepter");
    else if (action === "ignorer") this.decider("ignorer");
  }

  // ------------------------------------------------------------ liste de suivi

  get listeOuverte(): boolean {
    return !$("liste-fiches").hidden;
  }

  async basculerListe(): Promise<void> {
    if (this.listeOuverte) return this.fermerListe();
    if (!this.disponible) {
      this.rappels.etat("Liste des fiches indisponible : le serveur local ne répond pas.", "Lancer l'atlas avec lancer.bat.", true);
      return;
    }
    this.lignes = await (await fetch("/api/fiches")).json();
    this.afficherListe();
    $("liste-fiches").hidden = false;
  }

  fermerListe(): void {
    $("liste-fiches").hidden = true;
  }

  private afficherListe(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-filtre-fiches]")) {
      b.setAttribute("aria-checked", String(b.dataset.filtreFiches === this.filtre));
    }
    const noyau = this.lignes.filter((l) => l.niveau === "noyau");
    const verifiees = noyau.filter((l) => l.statut === "verifie").length;
    $("liste-fiches-bilan").textContent = `${verifiees} fiches noyau vérifiées sur ${noyau.length} · ${
      noyau.filter((l) => l.statut === "brouillon").length} brouillons · ${noyau.filter((l) => !l.statut).length} sans fiche`;
    const garder = (l: Ligne) => ({
      "a-verifier": l.statut === "brouillon", verifiees: l.statut === "verifie", toutes: true, "sans-fiche": !l.statut,
    })[this.filtre];
    const parRegion = new Map<string, Ligne[]>();
    for (const l of this.lignes.filter(garder)) {
      const cle = `${l.systeme === "artère" ? "Artères" : "Veines"} · ${l.region}`;
      parRegion.set(cle, [...(parRegion.get(cle) ?? []), l]);
    }
    const html = [...parRegion].map(([region, ls]) => `<section><h3 class="etiquette">${region} <span>${ls.length}</span></h3><ul>${
      ls.map((l) => `<li><button data-structure="${l.id}">${echapper(l.nom_fr)}</button>
        <span class="etat-ligne ${l.statut ?? "absente"}">${l.statut === "verifie" ? "vérifiée" : l.statut === "brouillon" ? "à vérifier" : "sans fiche"}${
          l.niveau !== "noyau" ? " · approfondissement" : ""}${l.hors_roneo.length ? ` · ${l.hors_roneo.length} hors ronéos` : ""}${
          l.proposition ? " · proposition" : ""}</span></li>`).join("")}</ul></section>`).join("");
    $("liste-fiches-contenu").innerHTML = html || `<p class="aide">Aucune fiche dans ce filtre.</p>`;
  }
}

function lienSource(s: Source): string {
  return `<a href="/roneos/${s.roneo}#page=${s.pages[0]}" target="_blank" rel="noopener" title="${echapper(s.titre ?? s.roneo)}, ouvrir à la page ${s.pages[0]}">${s.roneo} p.${compacter(s.pages)}</a>`;
}

/** [3, 4, 5, 9] -> « 3-5,9 ». */
function compacter(pages: number[]): string {
  const p = [...new Set(pages)].sort((a, b) => a - b);
  const res: string[] = [];
  for (let i = 0; i < p.length; i++) {
    let j = i;
    while (j + 1 < p.length && p[j + 1] === p[j] + 1) j++;
    res.push(j > i ? `${p[i]}-${p[j]}` : String(p[i]));
    i = j;
  }
  return res.join(",");
}

function developper(texte: string): number[] {
  return texte.split(",").flatMap((m) => {
    const [a, b] = m.split("-").map(Number);
    return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a];
  });
}

function dateCourte(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
}

function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
