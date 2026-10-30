import * as THREE from "three";
import type { Modeles } from "./modeles";
import type { Scene3D } from "./scene";

// Points de la cible testés, rayons lancés de loin (2 m) vers chacun, le long de la direction de vue
const POINTS_CIBLE = 48;
const RECUL = 2;
// Une vue où moins de 12 % de la face visible de la cible est cachée se passe de dégagement
export const PART_ACCEPTABLE = 0.12;

export interface Degagement {
  /** Direction de la caméra vers laquelle regarder (de la cible vers l'œil). */
  direction: THREE.Vector3;
  /** Part de la face visible de la cible cachée par d'autres structures, dans cette direction. */
  partCachee: number;
  /** Même part dans la direction de vue actuelle. */
  partActuelle: number;
  /** Structures qui cachent la cible dans la direction retenue, de la plus gênante à la moins gênante. */
  occultants: string[];
}

/** Directions essayées : les 26 directions du cube (faces, arêtes, coins), plus la direction actuelle. */
function directions(actuelle: THREE.Vector3): THREE.Vector3[] {
  const res = [actuelle.clone().normalize()];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x || y || z) res.push(new THREE.Vector3(x, y, z).normalize());
  }
  return res;
}

/** Sommets de la cible (repère du monde) et leurs normales, répartis sur ses maillages. */
function echantillon(modeles: Modeles, scene: Scene3D, cles: Iterable<string>): { p: THREE.Vector3; n: THREE.Vector3 }[] {
  const maillages = [...cles].map((c) => modeles.maillages.get(c)).filter((m): m is THREE.Mesh => !!m && m.visible);
  const res: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  const total = maillages.reduce((s, m) => s + m.geometry.getAttribute("position").count, 0);
  if (!total) return res;
  for (const m of maillages) {
    const pos = m.geometry.getAttribute("position");
    const nor = m.geometry.getAttribute("normal");
    if (!nor) continue;
    m.updateWorldMatrix(true, false);
    const matN = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    const voulus = Math.max(2, Math.round((POINTS_CIBLE * pos.count) / total));
    const pas = Math.max(1, Math.floor(pos.count / voulus));
    for (let i = 0; i < pos.count; i += pas) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (!scene.estAffiche(p)) continue; // partie retirée par la coupe
      res.push({ p, n: new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(matN).normalize() });
    }
  }
  return res;
}

/**
 * Cherche d'où regarder une structure enfouie (actuelle : direction de la caméra en fin de transition) : pour chaque direction, part de sa face tournée vers l'œil
 * que d'autres structures affichées cachent. Renvoie la meilleure direction et ce qui gêne encore.
 * Les os en repère, translucides, ne cachent rien ; les structures estompées non plus.
 */
export function chercherVue(scene: Scene3D, modeles: Modeles, cles: Set<string>, exclus: Set<string>,
  actuelle: THREE.Vector3): Degagement | null {
  const points = echantillon(modeles, scene, cles);
  if (points.length < 3) return null;
  // La structure sélectionnée entière (ses branches comprises) ne compte pas comme obstacle
  const obstacles = modeles.cliquables().filter((m) => !cles.has(m.userData.cle) && !exclus.has(m.userData.cle));
  const rayon = new THREE.Raycaster();
  let meilleure: Degagement | null = null;
  let scoreMeilleur = Infinity;
  let partActuelle = 1;
  directions(actuelle).forEach((d, k) => {
    const faces = points.filter((x) => x.n.dot(d) > 0.15);
    if (faces.length < Math.max(3, points.length * 0.1)) return;
    const gene = new Map<string, number>();
    let caches = 0;
    for (const { p } of faces) {
      rayon.set(p.clone().addScaledVector(d, RECUL), d.clone().negate());
      rayon.far = RECUL - 0.002;
      let cache = false;
      for (const h of rayon.intersectObjects(obstacles, false)) {
        if (!scene.estAffiche(h.point)) continue;
        cache = true;
        const c = (h.object as THREE.Mesh).userData.cle as string;
        gene.set(c, (gene.get(c) ?? 0) + 1);
      }
      caches += Number(cache);
    }
    const part = caches / faces.length;
    if (k === 0) partActuelle = part;
    // À gêne égale : la vue actuelle, puis les vues horizontales (de face, de profil) plutôt que d'en haut
    const score = part + (k === 0 ? -0.04 : 0) + 0.03 * Math.abs(d.y) + (d.z < -0.5 ? 0.01 : 0);
    if (score < scoreMeilleur) {
      scoreMeilleur = score;
      meilleure = {
        direction: d, partCachee: part, partActuelle: 0,
        occultants: [...gene.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
      };
    }
  });
  if (meilleure) (meilleure as Degagement).partActuelle = partActuelle;
  return meilleure;
}

/**
 * Coupe qui dégage le mieux une structure : pour chacune des six directions des axes, plan posé juste devant
 * la structure (4 mm), et part de sa face visible encore cachée par ce qui reste derrière le plan.
 * Renvoie la direction de vue retenue (de face à gêne égale).
 */
export function chercherCoupe(scene: Scene3D, modeles: Modeles, cles: Set<string>, exclus: Set<string>,
  boite: THREE.Box3): THREE.Vector3 | null {
  const points = echantillon(modeles, scene, cles);
  if (points.length < 3) return null;
  const obstacles = modeles.cliquables().filter((m) => !cles.has(m.userData.cle) && !exclus.has(m.userData.cle));
  const rayon = new THREE.Raycaster();
  const axes = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
  let meilleure: THREE.Vector3 | null = null, scoreMeilleur = Infinity;
  axes.forEach((d, k) => {
    const faces = points.filter((x) => x.n.dot(d) > 0.15);
    if (faces.length < Math.max(3, points.length * 0.1)) return;
    // Plan de coupe : bord de la boîte du côté de la caméra, plus 4 mm ; ce qui est devant disparaît
    const bord = d.dot(d.x + d.y + d.z > 0 ? boite.max : boite.min) + 0.004;
    let caches = 0;
    for (const { p } of faces) {
      rayon.set(p.clone().addScaledVector(d, RECUL), d.clone().negate());
      rayon.far = RECUL - 0.002;
      caches += Number(rayon.intersectObjects(obstacles, false)
        .some((h) => scene.estAffiche(h.point) && h.point.dot(d) <= bord));
    }
    const score = caches / faces.length + k * 0.005;
    if (score < scoreMeilleur) {
      scoreMeilleur = score;
      meilleure = d;
    }
  });
  return meilleure;
}
