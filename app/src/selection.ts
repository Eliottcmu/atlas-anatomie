import * as THREE from "three";
import type { Modeles } from "./modeles";
import type { Scene3D } from "./scene";

// Anneaux de tolérance autour du pointeur (pixels) : un vaisseau fin ne fait que 2 à 3 pixels à l'écran
const ANNEAUX = [0, 3, 6, 10];
const DIRECTIONS_PAR_ANNEAU = 8;

export interface Touche {
  maillage: THREE.Mesh;
  point: THREE.Vector3;
  ecartPixels: number;
}

export class Selecteur {
  private rayon = new THREE.Raycaster();
  private rayonComplet = new THREE.Raycaster();

  constructor(private scene: Scene3D, private modeles: Modeles) {
    this.rayon.firstHitOnly = true;
  }

  /** Toutes les structures traversées par le rayon du pointeur, de la plus proche à la plus profonde. */
  empilement(x: number, y: number): THREE.Mesh[] {
    const r = this.scene.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    this.rayonComplet.setFromCamera(ndc, this.scene.camera);
    const vus = new Set<THREE.Mesh>();
    for (const hit of this.rayonComplet.intersectObjects(this.modeles.cliquables(), false)) {
      if (this.scene.estAffiche(hit.point)) vus.add(hit.object as THREE.Mesh);
    }
    return [...vus];
  }

  /** Structure sous le pointeur (x, y en pixels relatifs au canevas), avec tolérance pour les vaisseaux fins. */
  toucher(x: number, y: number, tolerance = true): Touche | null {
    const cibles = this.modeles.cliquables();
    const r = this.scene.renderer.domElement.getBoundingClientRect();
    const anneaux = tolerance ? ANNEAUX : [0];
    for (const rayonPx of anneaux) {
      let meilleur: Touche | null = null;
      const n = rayonPx === 0 ? 1 : DIRECTIONS_PAR_ANNEAU;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * rayonPx;
        const py = y + Math.sin(a) * rayonPx;
        const ndc = new THREE.Vector2((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1);
        this.rayon.setFromCamera(ndc, this.scene.camera);
        // Avec une découpe, le premier impact peut tomber dans la partie coupée : on prend le premier affiché
        this.rayon.firstHitOnly = !this.scene.decoupeActive;
        const hit = this.rayon.intersectObjects(cibles, false).find((h) => this.scene.estAffiche(h.point));
        if (hit && (!meilleur || hit.distance < meilleur.point.distanceTo(this.scene.camera.position))) {
          meilleur = { maillage: hit.object as THREE.Mesh, point: hit.point.clone(), ecartPixels: rayonPx };
        }
      }
      // On s'arrête au premier anneau qui touche : le plus proche du pointeur gagne
      if (meilleur) return meilleur;
    }
    return null;
  }
}
