import * as THREE from "three";
import type { Scene3D, Vue } from "./scene";

const SVG = "http://www.w3.org/2000/svg";

// Axes anatomiques dans le repère des modèles : Y haut, Z avant, droite du sujet vers -X
const AXES: { lettre: string; titre: string; vue: Vue; dir: THREE.Vector3 }[] = [
  { lettre: "S", titre: "Supérieur : vue de dessus", vue: "dessus", dir: new THREE.Vector3(0, 1, 0) },
  { lettre: "I", titre: "Inférieur : vue de dessous", vue: "dessous", dir: new THREE.Vector3(0, -1, 0) },
  { lettre: "A", titre: "Antérieur : vue de face", vue: "face", dir: new THREE.Vector3(0, 0, 1) },
  { lettre: "P", titre: "Postérieur : vue de dos", vue: "dos", dir: new THREE.Vector3(0, 0, -1) },
  { lettre: "D", titre: "Droite du sujet : profil droit", vue: "droite", dir: new THREE.Vector3(-1, 0, 0) },
  { lettre: "G", titre: "Gauche du sujet : profil gauche", vue: "gauche", dir: new THREE.Vector3(1, 0, 0) },
];
const RAYON = 33;

/** Repère d'orientation : les six directions anatomiques suivent la caméra ; un clic donne la vue. */
export class Orientation {
  private groupes: { g: SVGGElement; trait: SVGLineElement; axe: (typeof AXES)[number] }[] = [];
  private inverse = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private derniere = "";

  constructor(private svg: SVGSVGElement, private scene: Scene3D, choisir: (vue: Vue) => void) {
    for (const axe of AXES) {
      const trait = document.createElementNS(SVG, "line");
      trait.setAttribute("x1", "0");
      trait.setAttribute("y1", "0");
      trait.setAttribute("class", `axe axe-${axe.lettre}`);
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", `pole pole-${axe.lettre}`);
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", axe.titre);
      const titre = document.createElementNS(SVG, "title");
      titre.textContent = axe.titre;
      const rond = document.createElementNS(SVG, "circle");
      rond.setAttribute("r", "9.5");
      const texte = document.createElementNS(SVG, "text");
      texte.textContent = axe.lettre;
      texte.setAttribute("text-anchor", "middle");
      texte.setAttribute("dominant-baseline", "central");
      g.append(titre, rond, texte);
      g.addEventListener("click", () => choisir(axe.vue));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choisir(axe.vue);
        }
      });
      svg.append(trait);
      this.groupes.push({ g, trait, axe });
    }
    for (const x of this.groupes) svg.append(x.g);
    scene.apresRendu.push(() => this.maj());
  }

  private maj(): void {
    this.inverse.copy(this.scene.camera.quaternion).invert();
    const cle = this.inverse.toArray().map((v) => v.toFixed(3)).join();
    if (cle === this.derniere) return;
    this.derniere = cle;
    const ordre = this.groupes.map((x) => {
      this.v.copy(x.axe.dir).applyQuaternion(this.inverse);
      return { x, px: this.v.x * RAYON, py: -this.v.y * RAYON, pz: this.v.z };
    }).sort((a, b) => a.pz - b.pz);
    for (const { x, px, py, pz } of ordre) {
      x.trait.setAttribute("x2", px.toFixed(1));
      x.trait.setAttribute("y2", py.toFixed(1));
      x.g.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
      // Pôles tournés vers l'arrière : estompés ; les plus proches passent devant
      x.g.classList.toggle("arriere", pz < -0.15);
      x.trait.classList.toggle("arriere", pz < -0.15);
      this.svg.append(x.g);
    }
  }
}
