import * as THREE from "three";
import type { Atlas, Cote, Organe } from "./donnees";
import type { Modeles } from "./modeles";
import type { Scene3D } from "./scene";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SVG = "http://www.w3.org/2000/svg";

/** Noms : planche légendée ; numéros : planche muette (clic sur un numéro pour révéler le nom). */
export type ModeLegendes = "noms" | "numeros" | "aucune";
export const MODES_LEGENDES: ModeLegendes[] = ["noms", "numeros", "aucune"];

export interface ItemLegende {
  id: string;
  nom: string;
  type: "structure" | "partie" | "repere";
  /** Maillages désignés : surlignés au survol, et au moins un doit être affiché. */
  cles: string[];
  /** Points d'ancrage candidats (repère du monde), par ordre de préférence : le premier visible gagne. */
  ancres: THREE.Vector3[];
  inconstant?: boolean;
  calcule?: boolean;
  approchee?: boolean;
  correction?: string;
  structure?: string;
  cote?: Cote;
}

export interface RappelsLegendes {
  survoler(item: ItemLegende | null): void;
  choisir(item: ItemLegende): void;
  /** Zone de l'écran laissée libre par les panneaux (pixels de la page). */
  zoneLibre(): { gauche: number; droite: number; haut: number; bas: number };
}

interface Place {
  item: ItemLegende;
  numero: number;
  ancre: THREE.Vector3;
  x: number;
  y: number;
  profondeur: number;
}

const ESPACEMENT = 19;      // hauteur d'une ligne d'étiquette, pixels
const ECART_COLONNE = 36;   // distance entre l'organe et la colonne d'étiquettes
const DELAI_OCCULTATION = 140; // attente après le dernier mouvement avant de tester les occultations

export class Legendes {
  mode: ModeLegendes = "noms";
  /** Interrogation en cours : le clic sur une étiquette est une réponse, pas une révélation ni une sélection. */
  interception: ((item: ItemLegende) => void) | null = null;
  private items: ItemLegende[] = [];
  private numeros = new Map<string, number>();
  private visibles = new Map<string, THREE.Vector3 | null>(); // id -> ancre retenue (null : cachée)
  private occultationAFaire = true;
  private dernierTest = 0;
  private elements = new Map<string, HTMLButtonElement>();
  private reveles = new Set<string>();
  private selection = new Set<string>();
  // Repère choisi : seule son étiquette s'allume (sur un os, tous les repères portent sur le même maillage)
  private repereChoisi: string | null = null;
  private survole: string | null = null;
  private calque: HTMLElement;
  private traits: SVGSVGElement;
  private rayon = new THREE.Raycaster();
  private dernierePlace: Place[] = [];
  private minuteur = 0;

  constructor(private atlas: Atlas, private scene: Scene3D, private modeles: Modeles, private rappels: RappelsLegendes) {
    this.calque = $("legendes");
    this.traits = document.getElementById("legendes-traits") as unknown as SVGSVGElement;
    (this.rayon as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    scene.apresRendu.push(() => this.maj());
    window.addEventListener("resize", () => this.invalider());
    const remesurer = () => {
      for (const el of this.elements.values()) el.dataset.largeur = "";
      const cache = this.calque.hidden;
      this.calque.hidden = false;
      for (const item of this.items) this.mesurer(item);
      this.calque.hidden = cache;
      this.invalider();
    };
    document.fonts?.ready.then(remesurer);
    document.fonts?.addEventListener?.("loadingdone", remesurer);
    this.calque.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-legende]");
      if (!b) return;
      const item = this.items.find((x) => x.id === b.dataset.legende);
      if (!item) return;
      if (this.interception) {
        this.interception(item);
        return;
      }
      // Planche muette : le premier clic révèle le nom, le second sélectionne
      if (this.mode === "numeros" && !this.reveles.has(item.id)) {
        this.reveles.add(item.id);
        this.majTexte(item);
        this.mesurer(item);
        this.scene.demanderRendu();
        return;
      }
      this.rappels.choisir(item);
    });
    this.calque.addEventListener("pointerover", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-legende]");
      const item = b ? this.items.find((x) => x.id === b.dataset.legende) ?? null : null;
      if ((item?.id ?? null) === this.survole) return;
      this.survole = item?.id ?? null;
      this.rappels.survoler(item);
      this.scene.demanderRendu();
    });
    this.calque.addEventListener("pointerleave", () => {
      if (this.survole === null) return;
      this.survole = null;
      this.rappels.survoler(null);
      this.scene.demanderRendu();
    });
  }

  get nombre(): number {
    return this.items.length;
  }

  /** Étiquettes actuellement affichées (tests). */
  get affichees(): { id: string; nom: string; x: number; y: number }[] {
    return this.dernierePlace.map((p) => ({ id: p.item.id, nom: p.item.nom, x: p.x, y: p.y }));
  }

  definir(items: ItemLegende[]): void {
    this.items = items;
    this.reveles.clear();
    this.numeros = numerotation(items, false);
    for (const el of this.elements.values()) el.remove();
    this.elements.clear();
    for (const item of items) {
      const b = document.createElement("button");
      b.className = `legende ${item.type}${item.inconstant ? " inconstant" : ""}`;
      b.dataset.legende = item.id;
      b.title = item.nom + (item.inconstant ? " (inconstant)" : "") + (item.calcule ? ", position calculée sur le modèle" : "")
        + (item.approchee ? ", pointe posée sur le bord le plus proche" : "") + (item.correction ? `. ${item.correction}` : "");
      this.elements.set(item.id, b);
      this.majTexte(item);
      this.calque.appendChild(b);
    }
    // Largeurs mesurées tout de suite (calque affiché le temps de la mesure) : sans elles, la colonne
    // de droite déborde sous le panneau de la fiche
    const cache = this.calque.hidden;
    this.calque.hidden = false;
    for (const item of items) this.mesurer(item);
    this.calque.hidden = cache;
    this.invalider();
  }

  private mesurer(item: ItemLegende): void {
    const b = this.elements.get(item.id);
    if (!b) return;
    b.hidden = false;
    b.dataset.largeur = b.offsetWidth > 0 ? String(b.offsetWidth) : "";
  }

  vider(): void {
    this.definir([]);
  }

  /** Numéros tirés au hasard (interrogation) ou dans l'ordre alphabétique des noms. */
  numeroterAuHasard(): void {
    this.numeros = numerotation(this.items, true);
    this.cacherNoms();
  }

  numeroterParNom(): void {
    this.numeros = numerotation(this.items, false);
    this.cacherNoms();
  }

  reveler(id: string): void {
    const item = this.item(id);
    if (!item || this.reveles.has(id)) return;
    this.reveles.add(id);
    this.majTexte(item);
    this.mesurer(item);
    this.scene.demanderRendu();
  }

  /** Planche muette de nouveau entière : les noms révélés repassent en numéros. */
  cacherNoms(): void {
    this.reveles.clear();
    const cache = this.calque.hidden;
    this.calque.hidden = false;
    for (const item of this.items) {
      this.majTexte(item);
      this.mesurer(item);
    }
    this.calque.hidden = cache;
    this.scene.demanderRendu();
  }

  marquer(id: string, etat: "juste" | "faux" | "attendu"): void {
    this.elements.get(id)?.classList.add(etat);
  }

  effacerMarques(): void {
    for (const el of this.elements.values()) el.classList.remove("juste", "faux", "attendu");
  }

  definirMode(mode: ModeLegendes): void {
    this.mode = mode;
    this.reveles.clear();
    for (const item of this.items) this.majTexte(item);
    const cache = this.calque.hidden;
    this.calque.hidden = false;
    for (const item of this.items) this.mesurer(item);
    this.calque.hidden = cache;
    document.body.classList.toggle("legendes-muettes", mode === "numeros");
    this.invalider();
  }

  definirSelection(cles: Set<string> | null, repere: string | null = null): void {
    this.selection = cles ?? new Set();
    this.repereChoisi = repere;
    this.scene.demanderRendu();
  }

  item(id: string): ItemLegende | undefined {
    return this.items.find((x) => x.id === id);
  }

  estAffichee(id: string): boolean {
    return this.dernierePlace.some((p) => p.item.id === id);
  }

  /** Étiquette allumée : survolée, repère choisi, ou structure et partie de la sélection. */
  private estActif(item: ItemLegende): boolean {
    if (this.survole === item.id) return true;
    if (item.type === "repere") return item.id === this.repereChoisi;
    return item.cles.some((c) => this.selection.has(c));
  }

  /** À appeler quand la scène change sans bouger la caméra (calques, masquage, coupe). */
  invalider(): void {
    this.occultationAFaire = true;
    this.scene.demanderRendu();
  }

  private majTexte(item: ItemLegende): void {
    const b = this.elements.get(item.id);
    if (!b) return;
    const n = this.numeros.get(item.id) ?? 0;
    if (this.mode === "numeros" && !this.reveles.has(item.id)) {
      b.innerHTML = `<span class="numero">${n}</span>`;
    } else if (this.mode === "numeros") {
      b.innerHTML = `<span class="numero">${n}</span><span class="nom">${echapper(item.nom)}</span>`;
    } else {
      b.innerHTML = `<span class="nom">${echapper(item.nom)}</span>`;
    }
    b.dataset.largeur = "";
  }

  // ------------------------------------------------------------ visibilité

  private maillageAffiche(cle: string): boolean {
    const m = this.modeles.maillages.get(cle);
    return !!m && m.visible && this.modeles.estVisible(m.userData.calque);
  }

  /** Ancre visible de chaque item : devant la caméra, non coupée, non cachée par une autre structure. */
  private testerOccultations(): void {
    const cam = this.scene.camera.position;
    const obstacles = this.modeles.cliquables()
      .filter((m) => this.atlas.noeuds[m.userData.cle]?.rendu !== "enveloppe");
    const dir = new THREE.Vector3();
    this.visibles.clear();
    for (const item of this.items) {
      let retenue: THREE.Vector3 | null = null;
      if (item.cles.some((c) => this.maillageAffiche(c))) {
        const propres = new Set(item.cles);
        for (const a of item.ancres.slice(0, 4)) {
          if (!this.scene.estAffiche(a)) continue;
          const e = this.scene.versEcran(a);
          if (!e.devant) continue;
          dir.copy(a).sub(cam);
          const distance = dir.length();
          this.rayon.set(cam, dir.normalize());
          this.rayon.far = distance + 0.01;
          const touche = this.rayon.intersectObjects(obstacles, false)
            .find((h) => this.scene.estAffiche(h.point));
          const tolerance = Math.max(0.004, distance * 0.006);
          if (!touche || touche.distance >= distance - tolerance
              || (propres.has(touche.object.userData.cle) && touche.distance >= distance - 3 * tolerance)) {
            retenue = a;
            break;
          }
        }
      }
      this.visibles.set(item.id, retenue);
    }
    this.occultationAFaire = false;
    this.dernierTest = performance.now();
  }

  // ------------------------------------------------------------ mise en page

  private maj(): void {
    const actif = this.mode !== "aucune" && this.items.length > 0;
    this.calque.hidden = !actif;
    this.traits.style.display = actif ? "" : "none";
    if (!actif) {
      this.dernierePlace = [];
      return;
    }
    const maintenant = performance.now();
    const immobile = maintenant - this.scene.dernierMouvement > DELAI_OCCULTATION && !this.scene.enTransition;
    if (immobile && (this.occultationAFaire || this.scene.dernierMouvement > this.dernierTest)) this.testerOccultations();
    // En mouvement, on garde les dernières visibilités ; un test sera refait à l'arrêt
    if (!immobile && !this.minuteur) {
      this.minuteur = window.setTimeout(() => { this.minuteur = 0; this.scene.demanderRendu(); }, DELAI_OCCULTATION + 20);
    }

    const r = this.scene.renderer.domElement.getBoundingClientRect();
    const zone = this.rappels.zoneLibre();
    const places: Place[] = [];
    for (const item of this.items) {
      const a = this.visibles.get(item.id);
      if (!a) continue;
      const e = this.scene.versEcran(a);
      const x = e.x + r.left, y = e.y + r.top;
      if (x < zone.gauche || x > zone.droite || y < zone.haut || y > zone.bas) continue;
      places.push({ item, numero: this.numeros.get(item.id) ?? 0, ancre: a, x, y,
        profondeur: a.distanceTo(this.scene.camera.position) });
    }
    this.disposer(places, zone);
  }

  private largeur(item: ItemLegende): number {
    const b = this.elements.get(item.id)!;
    if (b.dataset.largeur) return Number(b.dataset.largeur);
    const mesure = b.offsetWidth;
    if (mesure > 0) {
      b.dataset.largeur = String(mesure);
      return mesure;
    }
    // Étiquette pas encore affichée : estimation, sans la retenir
    return this.mode === "numeros" && !this.reveles.has(item.id) ? 26 : 14 + item.nom.length * 6.6;
  }

  private disposer(places: Place[], zone: { gauche: number; droite: number; haut: number; bas: number }): void {
    const visibles = new Set<string>();
    while (this.traits.firstChild) this.traits.removeChild(this.traits.firstChild);
    if (places.length) {
      const xs = places.map((p) => p.x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const centre = (minX + maxX) / 2;
      let gauche = places.filter((p) => p.x < centre);
      let droite = places.filter((p) => p.x >= centre);
      // Équilibre des colonnes : on bascule les ancres les plus proches du centre
      const equilibrer = (de: Place[], vers: Place[], sens: number) => {
        de.sort((a, b) => sens * (a.x - b.x));
        while (de.length > vers.length + 3) vers.push(de.shift()!);
      };
      if (gauche.length > droite.length + 3) equilibrer(gauche, droite, -1);
      if (droite.length > gauche.length + 3) equilibrer(droite, gauche, 1);
      const capacite = Math.max(1, Math.floor((zone.bas - zone.haut - 16) / ESPACEMENT));
      const garder = (liste: Place[]) => {
        if (liste.length <= capacite) return liste;
        // Trop d'étiquettes pour la hauteur : priorité à la sélection, puis aux structures, puis aux plus proches
        const rang = (p: Place) => (this.estActif(p.item) ? 0 : 1) * 10
          + ({ structure: 0, partie: 1, repere: 2 }[p.item.type]) + p.profondeur * 0.01;
        return [...liste].sort((a, b) => rang(a) - rang(b)).slice(0, capacite);
      };
      gauche = garder(gauche);
      droite = garder(droite);
      const largeurMax = (liste: Place[]) => Math.max(0, ...liste.map((p) => this.largeur(p.item)));
      // Colonne gauche : texte aligné à droite sur xG ; colonne droite : aligné à gauche sur xD
      const xG = Math.max(zone.gauche + 8 + largeurMax(gauche), minX - ECART_COLONNE);
      const xD = Math.min(zone.droite - 8 - largeurMax(droite), maxX + ECART_COLONNE);
      this.colonne(gauche, xG, "gauche", zone, visibles);
      this.colonne(droite, xD, "droite", zone, visibles);
    }
    for (const [id, el] of this.elements) el.hidden = !visibles.has(id);
    this.dernierePlace = places.filter((p) => visibles.has(p.item.id));
  }

  private colonne(liste: Place[], x: number, cote: "gauche" | "droite", zone: { haut: number; bas: number },
                  visibles: Set<string>): void {
    liste.sort((a, b) => a.y - b.y);
    const ys = liste.map((p) => p.y);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + ESPACEMENT);
    const bas = zone.bas - ESPACEMENT / 2;
    if (ys.length && ys[ys.length - 1] > bas) {
      ys[ys.length - 1] = bas;
      for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - ESPACEMENT);
    }
    const haut = zone.haut + ESPACEMENT / 2;
    for (let i = 0; i < ys.length && ys[i] < haut; i++) ys[i] = haut + i * ESPACEMENT;
    liste.forEach((p, i) => {
      const el = this.elements.get(p.item.id)!;
      const y = ys[i];
      const actif = this.estActif(p.item);
      el.classList.toggle("actif", actif);
      el.classList.toggle("a-gauche", cote === "gauche");
      el.style.transform = cote === "gauche"
        ? `translate(${Math.round(x - this.largeur(p.item))}px, ${Math.round(y - ESPACEMENT / 2)}px)`
        : `translate(${Math.round(x)}px, ${Math.round(y - ESPACEMENT / 2)}px)`;
      visibles.add(p.item.id);
      const coude = cote === "gauche" ? x + 6 : x - 6;
      const trait = document.createElementNS(SVG, "path");
      trait.setAttribute("d", `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${coude.toFixed(1)},${y.toFixed(1)} L${(cote === "gauche" ? x + 1 : x - 1).toFixed(1)},${y.toFixed(1)}`);
      trait.setAttribute("class", actif ? "trait actif" : "trait");
      this.traits.appendChild(trait);
      const point = document.createElementNS(SVG, "circle");
      point.setAttribute("cx", p.x.toFixed(1));
      point.setAttribute("cy", p.y.toFixed(1));
      point.setAttribute("r", actif ? "3.2" : "2.3");
      point.setAttribute("class", actif ? "point actif" : "point");
      this.traits.appendChild(point);
    });
  }
}

// ------------------------------------------------------------ construction des items

/** Sommets d'un maillage dans le repère du monde, éventuellement limités à une boîte. */
function sommetsMonde(m: THREE.Mesh, boite?: THREE.Box3, maxi = 600): THREE.Vector3[] {
  m.updateWorldMatrix(true, false);
  const pos = m.geometry.getAttribute("position");
  const pas = Math.max(1, Math.floor(pos.count / maxi));
  const res: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i += pas) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    if (!boite || boite.containsPoint(v)) res.push(v);
  }
  return res;
}

/** Ancres candidates : le sommet le plus proche du centre, puis des sommets répartis (plus loin les uns des autres). */
export function ancresDe(points: THREE.Vector3[], n = 6): THREE.Vector3[] {
  if (!points.length) return [];
  const centre = points.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(points.length);
  let premier = points[0];
  for (const p of points) if (p.distanceToSquared(centre) < premier.distanceToSquared(centre)) premier = p;
  const res = [premier];
  const dist = points.map((p) => p.distanceToSquared(premier));
  while (res.length < Math.min(n, points.length)) {
    let k = 0;
    for (let i = 1; i < dist.length; i++) if (dist[i] > dist[k]) k = i;
    if (dist[k] === 0) break;
    res.push(points[k]);
    for (let i = 0; i < dist.length; i++) dist[i] = Math.min(dist[i], points[i].distanceToSquared(points[k]));
  }
  return res;
}

/** Parties nommées d'un organe (calque organes) et ses repères légendés. */
export function itemsOrgane(atlas: Atlas, modeles: Modeles, organe: Organe): ItemLegende[] {
  const parNom = new Map<string, string[]>();
  for (const cle of organe.parties) {
    const n = atlas.noeuds[cle];
    if (!n || (n.calque !== "autres" && n.calque !== "os") || n.doublon || !modeles.maillages.has(cle)) continue;
    const nom = n.propre && n.structure ? atlas.structures[n.structure].nom : n.nom;
    const cleNom = `${nom}|${n.cote ?? ""}`;
    parNom.set(cleNom, [...(parNom.get(cleNom) ?? []), cle]);
  }
  const items: ItemLegende[] = [];
  // Focus d'un seul os : son nom est déjà le titre, l'étiquette de l'os entier n'apprend rien
  if (organe.os && parNom.size === 1) parNom.clear();
  for (const [cleNom, cles] of parNom) {
    const nom = cleNom.split("|")[0];
    // Ancres : celles du plus grand maillage d'abord
    const tries = [...cles].sort((a, b) => modeles.maillages.get(b)!.geometry.getAttribute("position").count
      - modeles.maillages.get(a)!.geometry.getAttribute("position").count);
    const ancres = tries.flatMap((c) => ancresDe(sommetsMonde(modeles.maillages.get(c)!), 4));
    items.push({ id: `partie:${cleNom}`, nom, type: "partie", cles, ancres });
  }
  for (const r of organe.reperes ?? []) {
    if (!modeles.maillages.has(r.cle)) continue;
    items.push({ id: `repere:${r.nom}:${r.cle}`, nom: r.nom, type: "repere", cles: [r.cle],
      ancres: [new THREE.Vector3(...r.p)], inconstant: r.inconstant, calcule: r.calcule, approchee: r.approchee,
      correction: r.correction });
  }
  return items;
}

/** Rubriques des repères, pour décrire un os ou un organe dans l'ordre d'un cours : d'après le nom anglais. */
export const RUBRIQUES = ["Parties", "Faces et bords", "Surfaces articulaires", "Reliefs : processus, tubercules, crêtes",
  "Fosses, trous et sillons", "Autres repères"] as const;
export type Rubrique = typeof RUBRIQUES[number];

export function rubriqueDe(nomEn: string): Rubrique {
  const n = nomEn.toLowerCase();
  if (/articular|facet|\bcondyle\b|capitulum|trochlea\b|glenoid|acetabul|semilunar|surface for|patellar surface/.test(n)) return "Surfaces articulaires";
  if (/fossa|foramen|notch|incisure|groove|sulcus|canal|hiatus|fovea|\bpit\b|meatus|sinus|opening|aperture|impression|fissure|hilum|hilus|porta/.test(n)) return "Fosses, trous et sillons";
  if (/process|tubercle|tuberosity|trochanter|spine\b|spinous|crest|\bline\b|linea|ridge|epicondyle|malleolus|eminence|protuberance|horn|cornu|\blip\b|hamulus|tubercule|prominence|promontory|ala\b|wing|lingula|clinoid|styloid|mastoid|coracoid|acromion|olecranon|coronoid|dens\b/.test(n)) return "Reliefs : processus, tubercules, crêtes";
  if (/surface|\bface\b|border|margin|aspect/.test(n)) return "Faces et bords";
  if (/head|neck|body|shaft|\bbase\b|apex|ramus|angle|pole|lobe|segment|part\b|extremity|arch|lamina|pedicle|ligament|lobule|isthmus|fundus|cardia|pylorus|curvature|cusp|crown|root/.test(n)) return "Parties";
  return "Autres repères";
}

/** Structures de la liste noyau présentes dans une région : une étiquette par structure et par côté. */
export function itemsRegion(atlas: Atlas, modeles: Modeles, boite: THREE.Box3,
                            presentes: { id: string; cles: string[] }[]): ItemLegende[] {
  const items: ItemLegende[] = [];
  for (const { id, cles } of presentes) {
    const s = atlas.structures[id];
    const parCote = new Map<string, string[]>();
    for (const c of cles) {
      const cote = s.cote === "bilatéral" ? atlas.noeuds[c]?.cote ?? "" : "";
      parCote.set(cote, [...(parCote.get(cote) ?? []), c]);
    }
    for (const [cote, groupe] of parCote) {
      const points = groupe.flatMap((c) => {
        const m = modeles.maillages.get(c);
        return m ? sommetsMonde(m, boite, 400) : [];
      });
      if (!points.length) continue;
      items.push({ id: `structure:${id}:${cote}`, nom: s.nom, type: "structure", cles: groupe,
        ancres: ancresDe(points, 6), structure: id, cote: (cote || null) as Cote });
    }
  }
  return items;
}

function numerotation(items: ItemLegende[], hasard: boolean): Map<string, number> {
  const ordre = [...items];
  if (hasard) {
    for (let i = ordre.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
    }
  } else ordre.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return new Map(ordre.map((x, i) => [x.id, i + 1]));
}

function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
