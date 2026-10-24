import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import type { Atlas, Calque } from "./donnees";

// Accélération des tests de rayon : indispensable pour cliquer des vaisseaux fins parmi 2 000 maillages
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Les GLB compressés (meshopt) stockent les positions en entiers 16 bits normalisés :
 * on repasse en flottants pour les tests de rayon, plus simples et exacts.
 */
function dequantifierPositions(g: THREE.BufferGeometry): void {
  const p = g.getAttribute("position");
  if (!p.normalized && p.array instanceof Float32Array) return;
  const f = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    f[3 * i] = p.getX(i);
    f[3 * i + 1] = p.getY(i);
    f[3 * i + 2] = p.getZ(i);
  }
  g.setAttribute("position", new THREE.BufferAttribute(f, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

export type Etat = "normal" | "survol" | "selection" | "attenue";
export type ModeOs = "repere" | "opaque" | "masque";

const OCRE = new THREE.Color("#e8a93c");
// Nœuds lymphatiques : vert tilleul des atlas, distinct des organes
const LYMPHATIQUE = new THREE.Color("#a9c46c");
type Variante = "" | "enveloppe" | "lymphatique";

export interface Progression {
  fichier: string;
  calque: string;
  charge: number;
  total: number;
  termine: boolean;
}

export class Modeles {
  readonly racine = new THREE.Group();
  readonly maillages = new Map<string, THREE.Mesh>();
  // Matériaux par calque et par variante de rendu (enveloppe translucide, nœud lymphatique)
  private materiaux = new Map<string, Record<Etat, THREE.MeshStandardMaterial>>();
  private etats = new Map<THREE.Mesh, Etat>();
  private groupes = new Map<string, THREE.Group>();
  private chargements = new Map<string, Promise<void>>();
  readonly calquesCharges = new Set<string>();
  private boites = new Map<THREE.Mesh, THREE.Box3>();
  // Filtre du focus : un maillage qui n'y passe pas est caché, en plus du masquage manuel
  private filtre: ((m: THREE.Mesh) => boolean) | null = null;
  modeOs: ModeOs = "repere";
  private chargeur: GLTFLoader;

  constructor(private atlas: Atlas, private onChange: () => void) {
    this.chargeur = new GLTFLoader();
    this.chargeur.setMeshoptDecoder(MeshoptDecoder);
    for (const c of atlas.calques) {
      const g = new THREE.Group();
      g.name = c.id;
      g.visible = c.visible;
      this.groupes.set(c.id, g);
      this.racine.add(g);
      this.materiaux.set(c.id, this.creerMateriaux(c));
      if (c.id === "autres") {
        this.materiaux.set("autres:enveloppe", this.creerMateriaux(c, "enveloppe"));
        this.materiaux.set("autres:lymphatique", this.creerMateriaux(c, "lymphatique"));
      }
    }
    this.appliquerModeOs();
  }

  private creerMateriaux(c: Calque, variante: Variante = ""): Record<Etat, THREE.MeshStandardMaterial> {
    const base = new THREE.MeshStandardMaterial({ color: c.couleur, roughness: 0.62, metalness: 0.0 });
    if (variante === "lymphatique") base.color = LYMPHATIQUE.clone();
    if (variante === "enveloppe") {
      // Enveloppe : on voit au travers les bronches, les vaisseaux et les organes qu'elle contient
      base.transparent = true;
      base.opacity = 0.3;
      base.depthWrite = false;
      base.side = THREE.DoubleSide;
    }
    const survol = base.clone();
    survol.emissive = OCRE.clone();
    survol.emissiveIntensity = 0.28;
    const selection = base.clone();
    selection.color = OCRE.clone();
    selection.emissive = OCRE.clone();
    selection.emissiveIntensity = 0.45;
    if (variante === "enveloppe") {
      survol.opacity = 0.45;
      selection.opacity = 0.55;
    }
    const attenue = base.clone();
    attenue.transparent = true;
    attenue.opacity = variante === "enveloppe" ? 0.08 : 0.14;
    attenue.depthWrite = false;
    return { normal: base, survol, selection, attenue };
  }

  /** Jeu de matériaux d'un maillage : celui de son calque, ou de sa variante de rendu. */
  private materiauxDe(m: THREE.Mesh): Record<Etat, THREE.MeshStandardMaterial> {
    const rendu = this.atlas.noeuds[m.userData.cle]?.rendu;
    return (rendu && this.materiaux.get(`${m.userData.calque}:${rendu}`)) || this.materiaux.get(m.userData.calque)!;
  }

  /** Charge les fichiers d'un calque (une seule fois). */
  charger(calqueId: string, progression: (p: Progression) => void): Promise<void> {
    const existant = this.chargements.get(calqueId);
    if (existant) return existant;
    const calque = this.atlas.calques.find((c) => c.id === calqueId)!;
    const promesse = Promise.all(calque.fichiers.map((f) => this.chargerFichier(calque, f, progression)))
      .then(() => {
        this.calquesCharges.add(calqueId);
        this.onChange();
      });
    this.chargements.set(calqueId, promesse);
    return promesse;
  }

  private chargerFichier(calque: Calque, fichier: string, progression: (p: Progression) => void): Promise<void> {
    return new Promise((resoudre, rejeter) => {
      this.chargeur.load(
        `/modeles/${fichier}`,
        (gltf) => {
          const groupe = this.groupes.get(calque.id)!;
          const noeudsJson = (gltf.parser.json.nodes ?? []) as { name?: string }[];
          gltf.scene.traverse((o) => {
            if (!(o as THREE.Mesh).isMesh) return;
            const m = o as THREE.Mesh;
            // Le nom du nœud (FJ1234 ou nom d'objet Z-Anatomy) est la clé de atlas.json. GLTFLoader
            // assainit les noms (espaces, points) : on reprend le nom d'origine dans le JSON du GLB.
            const assoc = gltf.parser.associations.get(m) as { nodes?: number } | undefined;
            const cle = (assoc?.nodes !== undefined ? noeudsJson[assoc.nodes]?.name : undefined) ?? m.name;
            m.userData.cle = cle;
            m.userData.calque = calque.id;
            m.userData.doublon = this.atlas.noeuds[cle]?.doublon === true;
            if (m.userData.doublon) m.visible = false;
            m.material = this.materiauxDe(m).normal;
            // Les enveloppes translucides se dessinent après les organes opaques qu'elles contiennent
            if (this.atlas.noeuds[cle]?.rendu === "enveloppe") m.renderOrder = 2;
            dequantifierPositions(m.geometry);
            // Un objet et sa copie en miroir ont les mêmes triangles : la compression partage alors leur
            // tableau d'indices, que three-mesh-bvh réordonne sur place. Sans copie, le second index
            // construit casse le premier (0 rayon sur 20 touchait le sinus transverse gauche).
            if (m.geometry.index) m.geometry.setIndex(m.geometry.index.clone());
            m.geometry.computeBoundsTree();
            this.maillages.set(cle, m);
            this.etats.set(m, "normal");
          });
          groupe.add(gltf.scene);
          this.appliquerModeOs();
          if (this.filtre) this.appliquerVisibilite();
          progression({ fichier, calque: calque.id, charge: 1, total: 1, termine: true });
          resoudre();
        },
        (evt) => progression({ fichier, calque: calque.id, charge: evt.loaded, total: evt.total || 0, termine: false }),
        () => rejeter(new Error(fichier)),
      );
    });
  }

  /** Boîte englobante d'un maillage dans le repère du monde (calculée une fois). */
  boiteDe(m: THREE.Mesh): THREE.Box3 {
    let b = this.boites.get(m);
    if (!b) {
      m.updateWorldMatrix(true, false);
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      this.boites.set(m, b);
    }
    return b;
  }

  /** Part des sommets du maillage situés dans la boîte (la boîte englobante peut l'effleurer sans lui). */
  fractionDans(m: THREE.Mesh, boite: THREE.Box3): number {
    if (!this.boiteDe(m).intersectsBox(boite)) return 0;
    const pos = m.geometry.getAttribute("position");
    const v = new THREE.Vector3();
    const pas = Math.max(1, Math.floor(pos.count / 2000));
    let dedans = 0, total = 0;
    for (let i = 0; i < pos.count; i += pas, total++) {
      if (boite.containsPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))) dedans++;
    }
    return total ? dedans / total : 0;
  }

  definirFiltre(filtre: ((m: THREE.Mesh) => boolean) | null): void {
    this.filtre = filtre;
    this.appliquerVisibilite();
  }

  /** Visibilité d'un maillage = ni masqué à la main, ni écarté par le focus. */
  private appliquerVisibilite(): void {
    for (const m of this.maillages.values()) {
      m.userData.horsFocus = this.filtre ? !this.filtre(m) : false;
      m.visible = !m.userData.masque && !m.userData.horsFocus && !m.userData.doublon;
    }
    this.onChange();
  }

  estVisible(calqueId: string): boolean {
    return this.groupes.get(calqueId)!.visible;
  }

  afficherCalque(calqueId: string, visible: boolean): void {
    this.groupes.get(calqueId)!.visible = visible;
    this.onChange();
  }

  definirModeOs(mode: ModeOs): void {
    this.modeOs = mode;
    this.appliquerModeOs();
    this.onChange();
  }

  private appliquerModeOs(): void {
    const os = this.materiaux.get("os");
    const groupe = this.groupes.get("os");
    if (!os || !groupe) return;
    groupe.visible = this.modeOs !== "masque";
    const repere = this.modeOs === "repere";
    // En repère, les os sont translucides et ne cachent pas les vaisseaux
    os.normal.transparent = repere;
    os.normal.opacity = repere ? 0.17 : 1;
    os.normal.depthWrite = !repere;
    os.normal.needsUpdate = true;
    groupe.traverse((o) => { o.renderOrder = repere ? 1 : 0; });
  }

  /** Les os en repère ne se cliquent pas : le clic traverse vers les vaisseaux. */
  estCliquable(m: THREE.Mesh): boolean {
    if (!m.visible || !this.estVisible(m.userData.calque)) return false;
    if (m.userData.calque === "os" && this.modeOs === "repere") return false;
    return this.etats.get(m) !== "attenue" && m.userData.masque !== true && m.userData.horsFocus !== true
      && m.userData.doublon !== true;
  }

  cliquables(): THREE.Mesh[] {
    return [...this.maillages.values()].filter((m) => this.estCliquable(m));
  }

  // Coloration de maîtrise : une couleur par niveau, à la place de la couleur du système
  private materiauxCouleur = new Map<string, THREE.MeshStandardMaterial>();

  colorer(m: THREE.Mesh, couleur: string): void {
    let mat = this.materiauxCouleur.get(couleur);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.6, metalness: 0 });
      this.materiauxCouleur.set(couleur, mat);
    }
    m.material = mat;
    // État à part : le prochain definirEtat, quel qu'il soit, remet le matériau du système
    this.etats.set(m, "colore" as Etat);
  }

  definirEtat(m: THREE.Mesh, etat: Etat): void {
    this.etats.set(m, etat);
    m.material = this.materiauxDe(m)[etat];
  }

  etat(m: THREE.Mesh): Etat {
    return this.etats.get(m) ?? "normal";
  }

  masquer(cles: Iterable<string>, masque: boolean): void {
    for (const c of cles) {
      const m = this.maillages.get(c);
      if (m) m.userData.masque = masque;
    }
    this.appliquerVisibilite();
  }

  toutReafficher(): void {
    for (const m of this.maillages.values()) m.userData.masque = false;
    this.appliquerVisibilite();
  }

  /** Boîte des maillages affichés parmi ces clés ; de tous s'il n'y en a aucun d'affiché (focus). */
  boite(cles: Iterable<string>): THREE.Box3 {
    const visibles = new THREE.Box3();
    const tous = new THREE.Box3();
    for (const c of cles) {
      const m = this.maillages.get(c);
      if (!m) continue;
      tous.union(this.boiteDe(m));
      if (m.visible) visibles.union(this.boiteDe(m));
    }
    return visibles.isEmpty() ? tous : visibles;
  }

  boiteVisible(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const id of ["arteres", "veines", "os"]) {
      const g = this.groupes.get(id);
      if (g && g.visible) b.expandByObject(g);
    }
    return b;
  }

  compter(calqueId: string): number {
    let n = 0;
    for (const m of this.maillages.values()) if (m.userData.calque === calqueId) n++;
    return n;
  }
}
