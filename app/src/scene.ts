import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Repère des modèles (glTF) : mètres, Y vers le haut, Z vers l'avant du sujet, droite du sujet vers -X
export type Vue = "face" | "dos" | "droite" | "gauche" | "dessus" | "dessous";

const DIRECTIONS: Record<Vue, THREE.Vector3> = {
  face: new THREE.Vector3(0, 0, 1),
  dos: new THREE.Vector3(0, 0, -1),
  droite: new THREE.Vector3(-1, 0, 0), // on regarde le flanc droit du sujet
  gauche: new THREE.Vector3(1, 0, 0),
  // Légèrement inclinées vers l'avant : une vue strictement verticale bloque la rotation d'OrbitControls
  dessus: new THREE.Vector3(0, 1, 0.02),
  dessous: new THREE.Vector3(0, -1, 0.02),
};

/** Navigation au pavé tactile : deux doigts tournent, pincer zoome, Maj + deux doigts déplace. */
export type ModeNavigation = "souris" | "pave";

export interface EtatCamera {
  position: [number, number, number];
  cible: [number, number, number];
}

interface Transition {
  debut: number;
  duree: number;
  departPos: THREE.Vector3;
  departCible: THREE.Vector3;
  arriveePos: THREE.Vector3;
  arriveeCible: THREE.Vector3;
}

export class Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controles: OrbitControls;
  private aRendre = true;
  private transition: Transition | null = null;
  private derniereImage = 0;
  imagesParSeconde = 0;
  /** Appelé après chaque image rendue (légendes, gizmo d'orientation, compteur). */
  readonly apresRendu: (() => void)[] = [];
  /** Instant du dernier mouvement de caméra : les légendes attendent l'arrêt pour tester les occultations. */
  dernierMouvement = 0;
  modeNavigation: ModeNavigation = "souris";
  // Partie du canevas laissée libre par les panneaux (pixels) : on y cadre, et son centre est le centre optique
  private zone: { gauche: number; droite: number; haut: number; bas: number } | null = null;
  // Découpe : boîte du focus et plan de coupe, combinés (un point doit être du bon côté de tous les plans)
  private plansBoite: THREE.Plane[] = [];
  private planCoupe: THREE.Plane | null = null;

  constructor(private conteneur: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    conteneur.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
    this.camera.position.set(0, 0.95, 3.6);

    // Éclairage : ciel et sol doux, plus une lampe portée par la caméra pour un relief constant
    this.scene.add(new THREE.HemisphereLight(0xf2efe6, 0x1b2230, 1.4));
    const lampe = new THREE.DirectionalLight(0xffffff, 1.6);
    lampe.position.set(0.4, 0.6, 1);
    this.camera.add(lampe);
    this.scene.add(this.camera);

    this.controles = new OrbitControls(this.camera, this.renderer.domElement);
    this.controles.target.set(0, 0.95, 0);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.12;
    this.controles.minDistance = 0.08;
    this.controles.maxDistance = 6;
    this.controles.zoomToCursor = true;
    this.controles.addEventListener("change", () => {
      this.dernierMouvement = performance.now();
      this.demanderRendu();
    });
    // Le pavé tactile passe avant OrbitControls (phase de capture) pour détourner le défilement à deux doigts
    this.renderer.domElement.addEventListener("wheel", (e) => this.molette(e), { capture: true, passive: false });

    new ResizeObserver(() => this.redimensionner()).observe(conteneur);
    this.redimensionner();
    this.renderer.setAnimationLoop((t) => this.boucle(t));
  }

  demanderRendu(): void {
    this.aRendre = true;
  }

  private redimensionner(): void {
    const { clientWidth: l, clientHeight: h } = this.conteneur;
    if (!l || !h) return;
    this.renderer.setSize(l, h, false);
    this.camera.aspect = l / h;
    this.appliquerDecalage();
  }

  /**
   * Zone utile : la vue se cadre entre les panneaux, et non sous eux. Le centre optique est déplacé au
   * centre de cette zone (décalage de la projection), si bien que la rotation tourne autour d'un point visible.
   */
  definirZoneUtile(zone: { gauche: number; droite: number; haut: number; bas: number } | null): void {
    this.zone = zone && zone.droite - zone.gauche > 120 && zone.bas - zone.haut > 120 ? zone : null;
    this.appliquerDecalage();
  }

  private appliquerDecalage(): void {
    const { clientWidth: l, clientHeight: h } = this.conteneur;
    if (this.zone && l && h) {
      const cx = (this.zone.gauche + this.zone.droite) / 2, cy = (this.zone.haut + this.zone.bas) / 2;
      this.camera.setViewOffset(l, h, l / 2 - cx, h / 2 - cy, l, h);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.demanderRendu();
  }

  private boucle(t: number): void {
    if (this.transition) this.avancerTransition(t);
    // update() renvoie vrai tant que l'amortissement fait bouger la caméra
    if (this.controles.update()) this.aRendre = true;
    if (!this.aRendre) return;
    this.aRendre = false;
    this.renderer.render(this.scene, this.camera);
    // Fluidité mesurée sur des images consécutives seulement (le rendu se fait à la demande)
    const ecart = t - this.derniereImage;
    if (ecart > 0 && ecart < 100) {
      const ips = 1000 / ecart;
      this.imagesParSeconde = this.imagesParSeconde ? this.imagesParSeconde * 0.9 + ips * 0.1 : ips;
    }
    this.derniereImage = t;
    for (const f of this.apresRendu) f();
  }

  private avancerTransition(t: number): void {
    const tr = this.transition!;
    const k = Math.min(1, (t - tr.debut) / tr.duree);
    const e = 1 - Math.pow(1 - k, 3); // décélération douce
    this.camera.position.lerpVectors(tr.departPos, tr.arriveePos, e);
    this.controles.target.lerpVectors(tr.departCible, tr.arriveeCible, e);
    this.dernierMouvement = performance.now();
    this.aRendre = true;
    if (k >= 1) this.transition = null;
  }

  private allerVers(position: THREE.Vector3, cible: THREE.Vector3, duree = 650): void {
    // Mouvement réduit demandé par le système : on saute directement à la vue
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) duree = 1;
    this.transition = {
      debut: performance.now(), duree,
      departPos: this.camera.position.clone(), departCible: this.controles.target.clone(),
      arriveePos: position, arriveeCible: cible,
    };
    this.demanderRendu();
  }

  /** Cadre une boîte en gardant la direction de vue actuelle, ou en prenant celle de la vue demandée. */
  cadrer(boite: THREE.Box3, vue?: Vue | THREE.Vector3, marge = 1.35): void {
    if (boite.isEmpty()) return;
    const sphere = boite.getBoundingSphere(new THREE.Sphere());
    const rayon = Math.max(sphere.radius, 0.03);
    // Angles de champ ramenés à la zone utile : la boîte doit tenir entre les panneaux
    const { clientWidth: l, clientHeight: h } = this.conteneur;
    const fz = this.zone && h ? (this.zone.bas - this.zone.haut) / h : 1;
    const fx = this.zone && l ? (this.zone.droite - this.zone.gauche) / l : 1;
    const demi = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const fov = 2 * Math.atan(demi * fz);
    const fovH = 2 * Math.atan(demi * this.camera.aspect * fx);
    const distance = (rayon * marge) / Math.sin(Math.min(fov, fovH) / 2);
    const direction = vue instanceof THREE.Vector3 ? vue.clone().normalize()
      : vue ? DIRECTIONS[vue].clone().normalize()
      : this.camera.position.clone().sub(this.controles.target).normalize();
    this.allerVers(sphere.center.clone().addScaledVector(direction, distance), sphere.center.clone());
  }

  vue(vue: Vue, boite: THREE.Box3): void {
    this.cadrer(boite, vue, 1.05);
  }

  /** Position et cible de la caméra (fin de transition comprise) : sert à l'historique de navigation. */
  etatCamera(): EtatCamera {
    const tr = this.transition;
    const p = tr ? tr.arriveePos : this.camera.position;
    const c = tr ? tr.arriveeCible : this.controles.target;
    return { position: [p.x, p.y, p.z], cible: [c.x, c.y, c.z] };
  }

  restaurerCamera(e: EtatCamera): void {
    this.allerVers(new THREE.Vector3(...e.position), new THREE.Vector3(...e.cible), 500);
  }

  /** Coordonnées écran (pixels CSS, relatives au canevas) d'un point du monde. */
  versEcran(p: THREE.Vector3): { x: number; y: number; devant: boolean } {
    const v = p.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, devant: v.z < 1 && v.z > -1 };
  }

  definirBoite(boite: THREE.Box3 | null): void {
    this.plansBoite = boite ? [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -boite.min.x), new THREE.Plane(new THREE.Vector3(-1, 0, 0), boite.max.x),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -boite.min.y), new THREE.Plane(new THREE.Vector3(0, -1, 0), boite.max.y),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -boite.min.z), new THREE.Plane(new THREE.Vector3(0, 0, -1), boite.max.z),
    ] : [];
    this.majPlans();
  }

  definirCoupe(plan: THREE.Plane | null): void {
    this.planCoupe = plan;
    this.majPlans();
  }

  private majPlans(): void {
    this.renderer.clippingPlanes = this.planCoupe ? [...this.plansBoite, this.planCoupe] : this.plansBoite;
    this.dernierMouvement = performance.now();
    this.demanderRendu();
  }

  /** Vrai si le point n'est pas retiré par la découpe (sert à ignorer les clics sur les parties coupées). */
  estAffiche(p: THREE.Vector3): boolean {
    return this.renderer.clippingPlanes.every((pl) => pl.distanceToPoint(p) >= -1e-4);
  }

  get decoupeActive(): boolean {
    return this.renderer.clippingPlanes.length > 0;
  }

  get enTransition(): boolean {
    return this.transition !== null;
  }

  // ------------------------------------------------------------ pavé tactile

  /**
   * En mode pavé tactile, le défilement à deux doigts tourne la vue (Maj : la déplace) ; le pincement,
   * que les navigateurs transmettent comme une molette avec Ctrl, reste un zoom géré par OrbitControls.
   */
  private molette(e: WheelEvent): void {
    if (this.modeNavigation !== "pave" || e.ctrlKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.transition = null;
    const echelle = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * echelle, dy = e.deltaY * echelle;
    if (e.shiftKey) this.deplacer(dx, dy);
    else this.tourner(dx, dy);
  }

  private tourner(dx: number, dy: number): void {
    const decalage = this.camera.position.clone().sub(this.controles.target);
    const s = new THREE.Spherical().setFromVector3(decalage);
    s.theta -= dx * 0.005;
    s.phi = THREE.MathUtils.clamp(s.phi - dy * 0.005, 0.02, Math.PI - 0.02);
    this.camera.position.copy(this.controles.target).add(new THREE.Vector3().setFromSpherical(s));
    this.camera.lookAt(this.controles.target);
    this.controles.update();
    this.dernierMouvement = performance.now();
    this.demanderRendu();
  }

  private deplacer(dx: number, dy: number): void {
    const distance = this.camera.position.distanceTo(this.controles.target);
    const pas = (distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 2) / this.renderer.domElement.clientHeight;
    const droite = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0).multiplyScalar(dx * pas);
    const haut = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1).multiplyScalar(-dy * pas);
    const t = droite.add(haut);
    this.camera.position.add(t);
    this.controles.target.add(t);
    this.controles.update();
    this.dernierMouvement = performance.now();
    this.demanderRendu();
  }
}
