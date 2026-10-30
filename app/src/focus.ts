import * as THREE from "three";
import { libelleSysteme, normaliser, type Atlas, type Cote, type Organe, type Region } from "./donnees";
import { itemsOrgane, itemsRegion, rubriqueDe, RUBRIQUES, type ItemLegende, type Rubrique } from "./legendes";
import type { Modeles, ModeOs } from "./modeles";
import type { Scene3D } from "./scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type ModeCoupe = "aucune" | "frontale" | "sagittale" | "horizontale";
/** Calques dont les maillages sont des parties d'organe nommées (liste de la zone, légendes). */
export const CALQUES_PARTIES = new Set(["autres", "os", "lymphatique"]);
const MODES_COUPE: ModeCoupe[] = ["aucune", "frontale", "sagittale", "horizontale"];

export interface FocusActif {
  type: "region" | "organe";
  id: string;
  nom: string;
  boite: THREE.Box3;
  vue: THREE.Vector3;
  parties: Set<string>;
}

export interface Rappels {
  etat(action: string, ensuite: string, erreur?: boolean): void;
  selectionnerStructure(id: string, cote: Cote): void;
  selectionnerNoeud(cle: string, cadrer?: boolean): void;
  chargerCalque(id: string): Promise<void>;
  ficheVisible(): boolean;
  legendes(items: ItemLegende[]): void;
  /** Repère choisi dans la liste de la zone : son étiquette s'allume, comme un clic sur la légende. */
  choisirRepere(nom: string, cle: string): void;
  /** Mode d'affichage des os, sans message (focus d'un os : opaques et cliquables). */
  modeOs(mode: ModeOs): void;
  /** Le focus va changer : l'historique note le point de vue qu'on quitte ; en entrant, la fiche ouverte se ferme. */
  avant(entree: boolean): void;
  /** Le focus a changé (entrée, sortie) : fil d'Ariane et historique. */
  change(): void;
}

export class Focus {
  actif: FocusActif | null = null;
  private coteMembres: "droit" | "gauche" = "droit";
  private calquesAvant: Record<string, boolean> | null = null;
  // Mode des os avant un focus d'os (translucides par défaut), rétabli en sortant
  private osAvant: ModeOs | null = null;
  coupe: ModeCoupe = "aucune";
  // Part de chaque maillage dans la région ; la liste ne retient que ce qui y est vraiment (3 % au moins)
  private presence = new Map<string, number>();
  private positionCoupe = 0.5;
  private coupeInversee = false;

  constructor(private atlas: Atlas, private scene: Scene3D, private modeles: Modeles, private rappels: Rappels) {
    this.construireCatalogue();
    this.brancherCoupe();
    $("ouvrir-catalogue").addEventListener("click", () => this.basculerCatalogue());
    $("catalogue-fermer").addEventListener("click", () => this.fermerCatalogue());
  }

  get catalogueOuvert(): boolean {
    return !$("catalogue").hidden;
  }

  get libelle(): string {
    return this.actif ? `Focus : ${this.actif.nom}` : "";
  }

  // ------------------------------------------------------------ catalogue

  private construireCatalogue(): void {
    const groupes = (liste: (Region | Organe)[]) => {
      const g = new Map<string, (Region | Organe)[]>();
      for (const x of liste) g.set(x.groupe, [...(g.get(x.groupe) ?? []), x]);
      return g;
    };
    // Régions : celles des membres n'apparaissent qu'une fois, le côté se choisit à part
    const regions = this.atlas.regions.filter((r) => r.cote !== "gauche");
    let html = "";
    for (const [groupe, liste] of groupes(regions)) {
      const membre = liste.some((r) => "cote" in r && r.cote);
      html += `<section><h3 class="etiquette">${groupe}</h3><div class="grille">`;
      html += liste.map((r) => {
        const nom = r.nom.replace(/ droite?$/, "");
        return `<button data-region="${r.id.replace(/-droit$/, "")}" data-membre="${membre}" data-filtre="${normaliser(nom)}">${nom}</button>`;
      }).join("");
      html += "</div></section>";
    }
    $("catalogue-regions").innerHTML = html;
    html = "";
    for (const [groupe, liste] of groupes(this.atlas.organes.filter((o) => !o.os))) {
      html += `<section><h3 class="etiquette">${groupe}</h3><div class="grille">`;
      html += liste.map((o) => {
        const n = (o as Organe).reperes?.length ?? 0;
        const detail = n ? ` title="${n} repère${n > 1 ? "s" : ""} légendé${n > 1 ? "s" : ""}"` : "";
        return `<button data-organe="${o.id}" data-filtre="${normaliser(o.nom)}"${detail}>${o.nom}${n ? `<span class="pastille-reperes">${n}</span>` : ""}</button>`;
      }).join("");
      html += "</div></section>";
    }
    $("catalogue-organes").innerHTML = html;
    // Os : un seul bouton pour un os pair, le côté se choisit comme pour les membres
    html = "";
    for (const [groupe, liste] of groupes(this.atlas.organes.filter((o) => o.os && o.cote !== "gauche"))) {
      html += `<section><h3 class="etiquette">${groupe}</h3><div class="grille">`;
      html += liste.map((x) => {
        const o = x as Organe;
        const pair = o.cote === "droit";
        const nom = pair ? o.nom.replace(/ droite?$/, "") : o.nom;
        const n = o.reperes?.length ?? 0;
        const detail = n ? ` title="${n} repère${n > 1 ? "s" : ""} légendé${n > 1 ? "s" : ""}"` : "";
        return `<button data-organe="${pair ? o.id.replace(/-droit$/, "") : o.id}" data-membre="${pair}" data-filtre="${normaliser(nom)} os"${detail}>${nom}${n ? `<span class="pastille-reperes">${n}</span>` : ""}</button>`;
      }).join("");
      html += "</div></section>";
    }
    $("catalogue-os").innerHTML = html;

    $("catalogue").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      if (b.dataset.cote) {
        this.coteMembres = b.dataset.cote as "droit" | "gauche";
        for (const x of document.querySelectorAll<HTMLButtonElement>("#catalogue [data-cote]")) {
          x.setAttribute("aria-checked", String(x.dataset.cote === this.coteMembres));
        }
      } else if (b.dataset.region) {
        const id = b.dataset.membre === "true" ? `${b.dataset.region}-${this.coteMembres}` : b.dataset.region;
        this.fermerCatalogue();
        this.entrerRegion(id);
      } else if (b.dataset.organe) {
        const id = b.dataset.membre === "true" ? `${b.dataset.organe}-${this.coteMembres}` : b.dataset.organe;
        this.fermerCatalogue();
        this.entrerOrgane(id);
      }
    });
    // Le catalogue compte plus de 60 entrées : un filtre au clavier, Entrée ouvre la première
    const filtre = $<HTMLInputElement>("catalogue-filtre");
    filtre.addEventListener("input", () => this.filtrerCatalogue(filtre.value));
    filtre.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>("#catalogue .grille button:not([hidden])")?.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (filtre.value) {
          filtre.value = "";
          this.filtrerCatalogue("");
        } else this.fermerCatalogue();
      }
    });
  }

  private filtrerCatalogue(texte: string): void {
    const mots = normaliser(texte).split(" ").filter(Boolean);
    for (const b of document.querySelectorAll<HTMLButtonElement>("#catalogue .grille button")) {
      b.hidden = !mots.every((m) => (b.dataset.filtre ?? "").includes(m));
    }
    for (const s of document.querySelectorAll<HTMLElement>("#catalogue section")) {
      s.hidden = !s.querySelector(".grille button:not([hidden])");
    }
  }

  basculerCatalogue(): void {
    if (this.catalogueOuvert) this.fermerCatalogue();
    else {
      $("catalogue").hidden = false;
      const filtre = $<HTMLInputElement>("catalogue-filtre");
      filtre.value = "";
      this.filtrerCatalogue("");
      filtre.focus();
      this.rappels.etat("Catalogue des régions, des os et des organes ouvert.",
        "Tape pour filtrer, Entrée ouvre la première ; Échap ou G pour fermer.");
    }
  }

  fermerCatalogue(): void {
    $("catalogue").hidden = true;
    ($("catalogue-filtre") as HTMLInputElement).blur();
  }

  // ------------------------------------------------------------ entrer et quitter

  async entrerRegion(id: string): Promise<void> {
    const r = this.atlas.regions.find((x) => x.id === id);
    if (!r) return;
    this.rappels.avant(true);
    const boite = new THREE.Box3(new THREE.Vector3(...r.boite[0]), new THREE.Vector3(...r.boite[1]));
    this.restaurerCalques();
    this.restaurerOs();
    this.actif = { type: "region", id, nom: r.nom, boite, vue: new THREE.Vector3(...r.vue), parties: new Set() };
    // Région : tout ce qui a une partie dans la boîte, découpé à la boîte, comme une planche d'atlas.
    // Les sommets, pas la boîte englobante : celle de la fibulaire effleure le genou sans que l'artère y soit.
    this.presence.clear();
    this.modeles.definirFiltre((m) => {
      const f = this.modeles.fractionDans(m, boite);
      this.presence.set(m.userData.cle, f);
      return f > 0;
    });
    this.appliquer();
    const n = this.compterVisibles();
    this.rappels.etat(`Focus : ${r.nom.toLowerCase()}. ${n.total} structures dans la zone (${n.detail}).`,
      "Les noms sont légendés sur la vue (N pour changer) ; clique un nom ou une structure. Échap pour quitter le focus.");
  }

  async entrerOrgane(id: string): Promise<void> {
    const o = this.atlas.organes.find((x) => x.id === id);
    if (!o) return;
    this.rappels.avant(true);
    // Les organes sont dans le calque « Organes et autres » : on le charge et on l'affiche le temps du focus
    // (pour un os aussi : BodyParts3D y range le sternum) ; les nœuds lymphatiques ont leur propre calque
    const calquesParties = new Set(["autres", ...o.parties.map((c) => this.atlas.noeuds[c]?.calque).filter(Boolean)]);
    calquesParties.delete("os");
    for (const id of calquesParties) {
      if (this.modeles.calquesCharges.has(id)) continue;
      this.rappels.etat(`Chargement des structures pour le focus sur ${o.nom.toLowerCase()}.`, "Quelques secondes.");
      await this.rappels.chargerCalque(id);
    }
    if (!this.calquesAvant) {
      this.calquesAvant = Object.fromEntries(this.atlas.calques.map((c) => [c.id, this.modeles.estVisible(c.id)]));
    }
    if (o.os) {
      // Os : opaques et cliquables ; vaisseaux de la boîte masqués d'abord (A et V pour les voir longer l'os)
      if (this.osAvant === null) this.osAvant = this.modeles.modeOs;
      this.rappels.modeOs("opaque");
      for (const c of ["arteres", "veines"]) this.modeles.afficherCalque(c, false);
      this.modeles.afficherCalque("autres", true);
    } else {
      this.restaurerOs();
      for (const c of ["arteres", "veines", ...calquesParties]) this.modeles.afficherCalque(c, true);
    }
    const parties = new Set(o.parties.filter((c) => !this.atlas.noeuds[c]?.doublon));
    const boiteOrgane = new THREE.Box3();
    for (const cle of parties) {
      const m = this.modeles.maillages.get(cle);
      if (m) boiteOrgane.union(this.modeles.boiteDe(m));
    }
    if (boiteOrgane.isEmpty()) {
      this.rappels.etat(`${o.nom} : aucun maillage chargé.`, "Relancer pipeline/construire_atlas.py.", true);
      return;
    }
    const boite = boiteOrgane.clone().expandByScalar(0.02);
    const centre = new THREE.Vector3();
    this.actif = { type: "organe", id, nom: o.nom, boite, vue: new THREE.Vector3(...o.vue), parties };
    // Organe : ses parties, plus les vaisseaux et les os centrés dans sa boîte ; les autres organes sont écartés.
    // Le centre, et non le simple contact : sinon le cœur s'entoure de toutes les intercostales.
    this.modeles.definirFiltre((m) => {
      if (parties.has(m.userData.cle)) return true;
      const calque = m.userData.calque;
      if (o.contexte === "os" && calque !== "arteres" && calque !== "veines") return false;
      if (o.contexte === "parties" && calque !== "os") return false;
      if (calque !== "arteres" && calque !== "veines" && calque !== "os") return false;
      return boiteOrgane.containsPoint(this.modeles.boiteDe(m).getCenter(centre));
    }, parties);
    this.appliquer();
    const n = this.compterVisibles();
    const reperes = o.reperes?.length ? `, ${o.reperes.length} repères légendés` : "";
    if (o.os) {
      this.rappels.etat(`Focus : ${o.nom.toLowerCase()}, ${parties.size} os${reperes}. Os opaques, vaisseaux masqués.`,
        "N : noms, numéros, aucune ; T pour s'interroger sur les repères ; A et V pour voir les vaisseaux. Échap pour quitter.");
      return;
    }
    const vaisseaux = o.contexte === "parties" ? `dont ${n.vaisseaux} vaisseaux propres à l'organe` : `avec ${n.vaisseaux} vaisseaux centrés dans sa boîte`;
    this.rappels.etat(`Focus : ${o.nom.toLowerCase()}, ${parties.size} parties${reperes}, ${vaisseaux}.`,
      "Les parties sont légendées sur la vue (N : noms, numéros, aucune ; T pour s'interroger). Échap pour quitter le focus.");
  }

  private appliquer(): void {
    const a = this.actif!;
    $("infobulle").hidden = true;
    this.scene.definirBoite(a.boite);
    this.appliquerCoupe();
    this.scene.cadrer(a.boite, a.vue, 1.02);
    this.majBandeau();
    this.majZone();
    this.majLegendes();
    this.rappels.change();
  }

  quitter(vue = true): void {
    if (!this.actif) return;
    this.rappels.avant(false);
    const nom = this.actif.nom;
    this.actif = null;
    this.modeles.definirFiltre(null);
    this.scene.definirBoite(null);
    this.restaurerCalques();
    this.restaurerOs();
    this.appliquerCoupe();
    if (vue) this.scene.vue("face", this.modeles.boiteVisible());
    this.majBandeau();
    this.majZone();
    this.rappels.legendes([]);
    this.rappels.change();
    this.rappels.etat(`Focus ${nom.toLowerCase()} quitté : corps entier.`, "G pour un autre focus, ou clique une structure.");
  }

  private restaurerCalques(): void {
    if (!this.calquesAvant) return;
    for (const [id, v] of Object.entries(this.calquesAvant)) {
      if (id !== "os") this.modeles.afficherCalque(id, v);
    }
    this.calquesAvant = null;
  }

  private restaurerOs(): void {
    if (this.osAvant === null) return;
    this.rappels.modeOs(this.osAvant);
    this.osAvant = null;
  }

  /** Boîte à cadrer pour les vues : celle du focus s'il y en a un. */
  boiteCourante(): THREE.Box3 | null {
    return this.actif?.boite ?? null;
  }

  recadrer(): void {
    if (this.actif) this.scene.cadrer(this.actif.boite, this.actif.vue, 1.02);
  }

  // ------------------------------------------------------------ légendes

  /** Légendes du focus : parties et repères de l'organe, ou structures noyau de la région. */
  majLegendes(): void {
    if (!this.actif) {
      this.rappels.legendes([]);
      return;
    }
    if (this.actif.type === "organe") {
      const o = this.atlas.organes.find((x) => x.id === this.actif!.id)!;
      this.rappels.legendes(itemsOrgane(this.atlas, this.modeles, o));
    } else {
      this.rappels.legendes(itemsRegion(this.atlas, this.modeles, this.actif.boite,
        this.structuresPresentes().map((x) => ({ id: x.id, cles: x.cles }))));
    }
  }

  // ------------------------------------------------------------ bandeau et liste de la zone

  private majBandeau(): void {
    document.body.classList.toggle("en-focus", !!this.actif);
  }

  private compterVisibles(): { total: number; vaisseaux: number; detail: string } {
    const n: Record<string, number> = {};
    for (const m of this.modeles.maillages.values()) {
      if (m.visible && this.modeles.estVisible(m.userData.calque)) n[m.userData.calque] = (n[m.userData.calque] ?? 0) + 1;
    }
    const noms: Record<string, string> = {
      arteres: "artères", veines: "veines", os: "os", muscles: "muscles", nerfs: "nerfs", lymphatique: "nœuds lymphatiques",
      autres: "autres",
    };
    const detail = Object.entries(n).map(([c, k]) => `${k} ${noms[c] ?? c}`).join(", ");
    return { total: Object.values(n).reduce((a, b) => a + b, 0), vaisseaux: (n.arteres ?? 0) + (n.veines ?? 0), detail };
  }

  private visibleDansZone(cle: string): boolean {
    const m = this.modeles.maillages.get(cle);
    if (!m || !m.visible || !this.modeles.estVisible(m.userData.calque)) return false;
    return this.actif?.type !== "region" || (this.presence.get(cle) ?? 1) >= 0.03;
  }

  /** Structures noyau de la zone, avec leurs segments présents et leurs côtés. */
  structuresPresentes(): { id: string; nom: string; systeme: string; cles: string[]; cotes: Set<string> }[] {
    const res = [];
    // Segments d'un membre : la boîte touche le flanc du tronc (veine hépatique, phrénique inférieure à
    // hauteur du bras) ; on n'y garde que les vaisseaux de ce membre
    const id = this.actif?.type === "region" ? this.actif.id : "";
    const regionsPermises = /^(bras|coude|avant-bras|main)-/.test(id) ? ["Membre supérieur"]
      : /^(cuisse|genou|jambe|pied)-/.test(id) ? ["Membre inférieur", "Pelvis et membre inférieur"] : null;
    for (const [id, s] of Object.entries(this.atlas.structures)) {
      if (regionsPermises && !regionsPermises.includes(s.region)) continue;
      // Segments propres de la structure : le tronc brachiocéphalique ne doit pas figurer dans la main
      // au motif que son arbre, ou une petite branche orpheline, y descend. Une structure composée
      // sans segment propre (cercle artériel du cerveau) garde les segments qui lui sont rattachés.
      const rattaches = s.noeuds.filter((c) => this.atlas.noeuds[c]?.structure === id);
      const propres = rattaches.filter((c) => this.atlas.noeuds[c].propre);
      const presents = (propres.length ? propres : rattaches).filter((c) => this.visibleDansZone(c));
      if (!presents.length) continue;
      const cotes = new Set(presents.map((c) => this.atlas.noeuds[c]?.cote).filter(Boolean) as string[]);
      res.push({ id, nom: s.nom, systeme: s.systeme, cles: presents, cotes });
    }
    return res;
  }

  /** Panneau de droite quand aucune fiche n'est ouverte : ce que contient la zone. */
  majZone(): void {
    const panneau = $("zone");
    panneau.hidden = !this.actif || this.rappels.ficheVisible();
    if (!this.actif) return;
    $("zone-titre").textContent = this.actif.nom;

    let html = "";
    if (this.actif.type === "organe") {
      const o = this.atlas.organes.find((x) => x.id === this.actif!.id)!;
      // Parties de l'organe, regroupées par nom
      const parNom = new Map<string, string[]>();
      for (const cle of this.actif.parties) {
        const n = this.atlas.noeuds[cle];
        if (!n || !CALQUES_PARTIES.has(n.calque) || !this.visibleDansZone(cle)) continue;
        const nom = n.propre && n.structure ? this.atlas.structures[n.structure].nom : n.nom;
        parNom.set(nom, [...(parNom.get(nom) ?? []), cle]);
      }
      if (parNom.size) {
        html += `<h3 class="etiquette">${o.os ? (parNom.size > 1 ? "Os du groupe" : "Os") : "Parties de l'organe"} <span>${parNom.size}</span></h3><ul>`;
        html += [...parNom.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"))
          .map(([nom, cles]) => `<li><button data-noeud="${cles[0]}">${echapper(nom)}</button>${cles.length > 1 ? `<span class="compte">${cles.length}</span>` : ""}</li>`).join("");
        html += "</ul>";
      }
      const reperes = (o.reperes ?? []).filter((r) => this.modeles.maillages.has(r.cle));
      if (reperes.length) {
        // Un nom par repère, rangé par rubrique de description (parties, faces et bords, reliefs...)
        const parNomR = new Map<string, { cle: string; rubrique: Rubrique; roneo: boolean }>();
        for (const r of reperes) {
          if (!parNomR.has(r.nom)) parNomR.set(r.nom, { cle: r.cle, rubrique: rubriqueDe(r.nom_en), roneo: !!r.roneo });
        }
        const cites = [...parNomR.values()].filter((v) => v.roneo).length;
        const presentes = RUBRIQUES.filter((x) => [...parNomR.values()].some((v) => v.rubrique === x));
        const rubriques: (Rubrique | null)[] = parNomR.size > 8 ? presentes : [null];
        html += `<h3 class="etiquette">Repères légendés <span>${parNomR.size}</span></h3>`;
        if (cites) html += `<p class="aide">${cites} nom${cites > 1 ? "s" : ""} cité${cites > 1 ? "s" : ""} tel${cites > 1 ? "s" : ""} quel${cites > 1 ? "s" : ""} dans tes ronéos (marque « ronéo ») ; les autres viennent de Z-Anatomy, à vérifier.</p>`;
        for (const rub of rubriques) {
          const liste = [...parNomR.entries()].filter(([, v]) => rub === null || v.rubrique === rub)
            .sort((a, b) => a[0].localeCompare(b[0], "fr"));
          if (rub) html += `<h4 class="rubrique">${rub} <span>${liste.length}</span></h4>`;
          html += "<ul>" + liste.map(([nom, v]) => `<li><button data-noeud="${v.cle}" data-repere="${echapper(nom)}">${echapper(nom)}</button>`
            + `${v.roneo ? `<span class="compte roneo" title="Nom cité dans les ronéos">ronéo</span>` : ""}</li>`).join("") + "</ul>";
        }
      }
    }

    // Structures noyau de la zone, par système
    const parSysteme = new Map<string, { id: string; nom: string; cotes: Set<string> }[]>();
    for (const x of this.structuresPresentes()) {
      const sys = libelleSysteme(x.systeme) + "s";
      parSysteme.set(sys, [...(parSysteme.get(sys) ?? []), x]);
    }
    const lateral = this.actif.type === "region" && !!this.atlas.regions.find((r) => r.id === this.actif!.id)?.cote;
    for (const [sys, liste] of parSysteme) {
      html += `<h3 class="etiquette">${sys} de la liste noyau <span>${liste.length}</span></h3><ul>`;
      html += liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((x) => {
        const cote = x.cotes.size === 1 ? [...x.cotes][0] : "";
        const mention = !lateral && x.cotes.size === 2 ? `<span class="compte">D et G</span>` : "";
        return `<li><button data-structure="${x.id}" data-cote="${cote}">${echapper(x.nom)}</button>${mention}</li>`;
      }).join("");
      html += "</ul>";
    }
    if (!html) html = `<p class="aide">Aucune structure de la liste noyau dans cette zone. Active d'autres calques (M, R) pour voir les muscles ou les organes.</p>`;
    $("zone-liste").innerHTML = html;
  }

  brancherZone(): void {
    $("zone-liste").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      if (b.dataset.structure) this.rappels.selectionnerStructure(b.dataset.structure, (b.dataset.cote || null) as Cote);
      else if (b.dataset.repere && b.dataset.noeud) this.rappels.choisirRepere(b.dataset.repere, b.dataset.noeud);
      else if (b.dataset.noeud) this.rappels.selectionnerNoeud(b.dataset.noeud, true);
    });
  }

  // ------------------------------------------------------------ coupe

  private brancherCoupe(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-coupe]")) {
      b.addEventListener("click", () => this.definirCoupe(b.dataset.coupe as ModeCoupe));
    }
    $<HTMLInputElement>("coupe-position").addEventListener("input", (e) => {
      this.positionCoupe = Number((e.target as HTMLInputElement).value) / 100;
      this.appliquerCoupe();
    });
    $("coupe-inverser").addEventListener("click", () => {
      this.coupeInversee = !this.coupeInversee;
      this.appliquerCoupe();
      this.orienterVersCoupe();
      this.rappels.etat("Côté conservé inversé.", "Déplace le curseur pour faire défiler la coupe.");
    });
    this.majCoupeUI();
  }

  cyclerCoupe(): void {
    this.definirCoupe(MODES_COUPE[(MODES_COUPE.indexOf(this.coupe) + 1) % MODES_COUPE.length]);
  }

  definirCoupe(mode: ModeCoupe): void {
    this.coupe = mode;
    this.positionCoupe = 0.5;
    $<HTMLInputElement>("coupe-position").value = "50";
    this.appliquerCoupe();
    this.orienterVersCoupe();
    this.majCoupeUI();
    const textes: Record<ModeCoupe, string> = {
      aucune: "Coupe retirée.", frontale: "Coupe frontale : on regarde la moitié postérieure, de face.",
      sagittale: "Coupe sagittale : on regarde la moitié gauche, depuis la droite.",
      horizontale: "Coupe horizontale : on regarde la moitié inférieure, d'en haut.",
    };
    this.rappels.etat(textes[mode], mode === "aucune" ? "C pour une nouvelle coupe."
      : "Curseur pour déplacer le plan, Inverser pour changer de côté, C pour le mode suivant.");
  }

  /**
   * Coupe qui passe juste devant une structure, vue de la direction donnée : on garde ce qui est derrière
   * le plan, la structure entière comprise. Axe : celui qui est le plus proche de la direction de vue.
   */
  couperDevant(boite: THREE.Box3, direction: THREE.Vector3): void {
    const a = [Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z)];
    const axe = (["x", "y", "z"] as const)[a.indexOf(Math.max(...a))];
    const mode: ModeCoupe = { x: "sagittale", y: "horizontale", z: "frontale" }[axe] as ModeCoupe;
    const vers = direction[axe] > 0;
    const ref = this.reference();
    const bord = vers ? boite.max[axe] + 0.004 : boite.min[axe] - 0.004;
    this.coupe = mode;
    // Côté gardé par défaut : moins (frontale, horizontale), plus (sagittale) ; on garde le côté opposé à la caméra
    this.coupeInversee = mode === "sagittale" ? vers : !vers;
    this.positionCoupe = THREE.MathUtils.clamp((bord - ref.min[axe]) / Math.max(ref.max[axe] - ref.min[axe], 1e-6), 0, 1);
    $<HTMLInputElement>("coupe-position").value = String(Math.round(this.positionCoupe * 100));
    this.appliquerCoupe();
    this.majCoupeUI();
    const vue = new THREE.Vector3();
    vue[axe] = vers ? 1 : -1;
    if (axe === "y") vue.z = 0.25;
    this.scene.cadrer(boite.clone().expandByScalar(0.03), vue);
  }

  private reference(): THREE.Box3 {
    return this.actif?.boite ?? this.modeles.boiteVisible();
  }

  private appliquerCoupe(): void {
    if (this.coupe === "aucune") {
      this.scene.definirCoupe(null);
      return;
    }
    const b = this.reference();
    const axe = { frontale: "z", sagittale: "x", horizontale: "y" }[this.coupe] as "x" | "y" | "z";
    const p = b.min[axe] + (b.max[axe] - b.min[axe]) * this.positionCoupe;
    // Côté conservé par défaut : postérieur (frontale), gauche du sujet (sagittale), inférieur (horizontale)
    const garderPlus = this.coupe === "sagittale" ? !this.coupeInversee : this.coupeInversee;
    const n = new THREE.Vector3();
    n[axe] = garderPlus ? 1 : -1;
    this.scene.definirCoupe(new THREE.Plane(n, garderPlus ? -p : p));
  }

  /** Tourne la caméra vers la face coupée. */
  private orienterVersCoupe(): void {
    if (this.coupe === "aucune") return;
    const s = this.coupeInversee ? -1 : 1;
    const dir = {
      frontale: new THREE.Vector3(0, 0, s), sagittale: new THREE.Vector3(-s, 0, 0),
      horizontale: new THREE.Vector3(0, s, 0.25 * s),
    }[this.coupe];
    this.scene.cadrer(this.reference(), dir, 1.05);
  }

  private majCoupeUI(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-coupe]")) {
      b.setAttribute("aria-checked", String(b.dataset.coupe === this.coupe));
    }
    $("coupe-reglages").hidden = this.coupe === "aucune";
    document.body.classList.toggle("en-coupe", this.coupe !== "aucune");
  }

  // ------------------------------------------------------------ recherche

  /** Régions et organes dont le nom contient tous les mots cherchés. */
  chercher(mots: string[], normaliserTexte: (t: string) => string): { type: "region" | "organe"; id: string; nom: string; sousTitre: string }[] {
    const res: { type: "region" | "organe"; id: string; nom: string; sousTitre: string }[] = [];
    for (const r of this.atlas.regions) {
      const n = normaliserTexte(r.nom);
      if (mots.every((m) => n.includes(m))) res.push({ type: "region", id: r.id, nom: r.nom, sousTitre: `Focus région · ${r.groupe}` });
    }
    for (const o of this.atlas.organes) {
      const n = normaliserTexte(o.nom);
      if (mots.every((m) => n.includes(m))) res.push({ type: "organe", id: o.id, nom: o.nom, sousTitre: `Focus ${o.os ? "os" : "organe"} · ${o.groupe}` });
    }
    return res;
  }
}

function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
