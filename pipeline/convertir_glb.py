"""Convertit les maillages OBJ de BodyParts3D en un GLB par système.

Chaque fichier FJ devient un nœud nommé par son identifiant (FJ1234), avec en
extras son concept FMA et son nom anglais. Le repère est converti au standard
glTF : mètres, Y vers le haut, Z vers l'avant du sujet. Sujet en position
anatomique, vu de face : son côté droit est vers les X négatifs.

Sorties dans modeles/ :
  - bp3d_<systeme>.glb (arteres, veines, os, muscles, autres)
  - index_maillages.csv : une ligne par fichier FJ

Usage : python -I pipeline/convertir_glb.py [--systemes arteres,veines,os] [--compresser]
  --compresser : compression meshopt par gltf-transform (Node.js requis), environ 4 fois plus léger.
                three.js doit alors charger les fichiers avec MeshoptDecoder.
"""

import csv
import json
import re
import shutil
import struct
import subprocess
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parent.parent
TABLES = RACINE / "donnees" / "brut" / "bodyparts3d" / "tables"
ARCHIVE = RACINE / "donnees" / "brut" / "bodyparts3d" / "archive" / "isa_BP3D_4.0_obj_99.zip"
SORTIE = RACINE / "modeles"

# Ancêtres "est un" qui décident du système, par ordre de priorité
REGLES = [
    ("arteres", {"segment of arterial tree organ", "artery", "arterial tree organ", "arterial anastomosis"}),
    ("veines", {"segment of venous tree organ", "vein", "venous tree organ", "venous anastomosis"}),
    ("os", {"bone organ"}),
    ("muscles", {"muscle organ"}),
]
# Repli sur le nom quand les ancêtres ne disent rien ("set of dorsal digital arteries",
# "insular part of right middle cerebral artery") ; \b évite "hepatovenous segment" (segment du foie)
REPLI_NOM = [
    ("arteres", re.compile(r"\b(artery|arteries|arterial|aorta|aortic)\b")),
    ("veines", re.compile(r"\b(vein|veins|venous|vena|coronary sinus)\b")),
]
# Maillages écartés : doublons géométriques d'autres maillages
EXCLUS = {
    "FJ3427": "descending aorta : réunion de FJ1931 (aorte thoracique descendante) et FJ1932 (aorte abdominale)",
}
# Code couleur du plan : artères rouges, veines bleues, muscles brun-rouge, os ivoire
COULEURS = {
    "arteres": (0.80, 0.12, 0.12), "veines": (0.15, 0.30, 0.75), "os": (0.93, 0.90, 0.80),
    "muscles": (0.55, 0.22, 0.18), "autres": (0.85, 0.70, 0.60),
}
# (x, y, z) BodyParts3D en mm, Z vers le haut, avant vers -Y  ->  (x, z, -y) en m
ROTATION = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64)
ECHELLE = 0.001
# Version épinglée de l'outil de compression
GLTF_TRANSFORM = "@gltf-transform/cli@4.1.1"


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def lire_tsv(chemin):
    with open(chemin, encoding="utf-8") as f:
        return list(csv.reader(f, delimiter="\t"))[1:]


def charger_arbre():
    parents, noms = defaultdict(set), {}
    for p, nom_p, e, nom_e in lire_tsv(TABLES / "isa_inclusion_relation_list.txt"):
        parents[e].add(p)
        noms[p], noms[e] = nom_p, nom_e
    elements, par_fichier = defaultdict(set), defaultdict(set)
    for fichier in ("isa_element_parts.txt", "partof_element_parts.txt"):
        for concept, nom, fj in lire_tsv(TABLES / fichier):
            elements[concept].add(fj)
            par_fichier[fj].add(concept)
            noms.setdefault(concept, nom)
    return parents, noms, elements, par_fichier


def ancetres(concept, parents):
    vus, pile = set(), [concept]
    while pile:
        for p in parents.get(pile.pop(), ()):
            if p not in vus:
                vus.add(p)
                pile.append(p)
    return vus


def systeme_de(concept, parents, noms):
    noms_ancetres = {noms.get(a) for a in ancetres(concept, parents) | {concept}}
    for systeme, marqueurs in REGLES:
        if noms_ancetres & marqueurs:
            return systeme
    nom = noms.get(concept, "")
    for systeme, motif in REPLI_NOM:
        if motif.search(nom):
            return systeme
    return "autres"


def lire_obj(texte):
    """Renvoie (concept, sommets, normales, faces) d'un OBJ BodyParts3D."""
    concept = re.search(r"Concept ID : (FMA\d+)", texte[:1000])
    sommets, normales, faces = [], [], []
    for ligne in texte.splitlines():
        if ligne.startswith("v "):
            sommets.append(ligne.split()[1:4])
        elif ligne.startswith("vn "):
            normales.append(ligne.split()[1:4])
        elif ligne.startswith("f "):
            coins = [c.split("/") for c in ligne.split()[1:]]
            # Format "f a//a b//b c//c" : la normale porte le même indice que le sommet
            if any(c[0] != c[-1] for c in coins):
                raise ValueError("indices de normales différents de ceux des sommets")
            idx = [int(c[0]) - 1 for c in coins]
            faces += [(idx[0], idx[i], idx[i + 1]) for i in range(1, len(idx) - 1)]
    s = np.array(sommets, dtype=np.float64)
    n = np.array(normales, dtype=np.float64) if len(normales) == len(sommets) else None
    return (concept.group(1) if concept else None), s, n, np.array(faces, dtype=np.uint32)


def normales_calculees(s, f):
    """Normales par sommet, moyenne des normales de faces (secours si l'OBJ n'en a pas)."""
    n = np.zeros_like(s)
    fn = np.cross(s[f[:, 1]] - s[f[:, 0]], s[f[:, 2]] - s[f[:, 0]])
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    return n


class EcrivainGLB:
    """Assemble un GLB : un maillage et un nœud par fichier FJ, un matériau par système."""

    def __init__(self, systeme):
        r, g, b = COULEURS[systeme]
        self.binaire = bytearray()
        self.gltf = {
            "asset": {"version": "2.0", "generator": "atlas-anatomie pipeline/convertir_glb.py",
                      "copyright": "BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0"},
            "scene": 0, "scenes": [{"name": systeme, "nodes": []}], "nodes": [], "meshes": [],
            "materials": [{"name": systeme, "pbrMetallicRoughness": {
                "baseColorFactor": [r, g, b, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.7}}],
            "accessors": [], "bufferViews": [], "buffers": [],
        }

    def _vue(self, donnees, cible):
        while len(self.binaire) % 4:
            self.binaire.append(0)
        self.gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(self.binaire),
                                         "byteLength": len(donnees), "target": cible})
        self.binaire += donnees
        return len(self.gltf["bufferViews"]) - 1

    def _accesseur(self, tableau, type_composant, type_, cible, bornes=False):
        acc = {"bufferView": self._vue(tableau.tobytes(), cible), "componentType": type_composant,
               "count": len(tableau) if type_ != "SCALAR" else tableau.size, "type": type_}
        if bornes:
            acc["min"], acc["max"] = tableau.min(axis=0).tolist(), tableau.max(axis=0).tolist()
        self.gltf["accessors"].append(acc)
        return len(self.gltf["accessors"]) - 1

    def ajouter(self, nom, positions, normales, faces, extras):
        pos = self._accesseur(positions.astype(np.float32), 5126, "VEC3", 34962, bornes=True)
        nor = self._accesseur(normales.astype(np.float32), 5126, "VEC3", 34962)
        ind = self._accesseur(faces.astype(np.uint32).ravel(), 5125, "SCALAR", 34963)
        self.gltf["meshes"].append({"name": nom, "primitives": [
            {"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": ind, "material": 0}]})
        self.gltf["nodes"].append({"name": nom, "mesh": len(self.gltf["meshes"]) - 1, "extras": extras})
        self.gltf["scenes"][0]["nodes"].append(len(self.gltf["nodes"]) - 1)

    def ecrire(self, chemin):
        while len(self.binaire) % 4:
            self.binaire.append(0)
        self.gltf["buffers"] = [{"byteLength": len(self.binaire)}]
        entete_json = json.dumps(self.gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        entete_json += b" " * (-len(entete_json) % 4)
        total = 12 + 8 + len(entete_json) + 8 + len(self.binaire)
        with open(chemin, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(entete_json), 0x4E4F534A) + entete_json)
            f.write(struct.pack("<II", len(self.binaire), 0x004E4942) + self.binaire)


def compresser(chemin):
    """Compresse un GLB en place avec meshopt. Renvoie True si la compression a réussi."""
    npx = shutil.which("npx")
    if not npx:
        journal("WARN", "npx introuvable. Conséquence : GLB laissé non compressé. Action : installer Node.js.")
        return False
    temporaire = chemin.with_suffix(".tmp.glb")
    resultat = subprocess.run([npx, "-y", GLTF_TRANSFORM, "meshopt", str(chemin), str(temporaire)],
                              capture_output=True, text=True)
    if resultat.returncode != 0 or not temporaire.exists():
        journal("WARN", f"Compression de {chemin.name} en échec : {resultat.stderr.strip()[-200:]}. "
                "Conséquence : fichier laissé non compressé.")
        temporaire.unlink(missing_ok=True)
        return False
    temporaire.replace(chemin)
    return True


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    if not ARCHIVE.exists():
        journal("FAIL", "Archive BodyParts3D absente. Action : lancer pipeline/telecharger_sources.py.")
        sys.exit(1)
    voulus = None
    if "--systemes" in sys.argv:
        voulus = set(sys.argv[sys.argv.index("--systemes") + 1].split(","))

    parents, noms, elements, par_fichier = charger_arbre()
    ecrivains, index, recalculees = {}, [], 0
    with zipfile.ZipFile(ARCHIVE) as z:
        fichiers = sorted(n for n in z.namelist() if n.endswith(".obj"))
        for i, chemin in enumerate(fichiers, 1):
            fj = Path(chemin).stem
            if fj in EXCLUS:
                continue
            concept, s, n, f = lire_obj(z.read(chemin).decode("ascii", "replace"))
            if concept is None and par_fichier.get(fj):
                # En-tête vide : concept le plus spécifique qui contient ce fichier
                concept = min(par_fichier[fj], key=lambda c: len(elements[c]))
            systeme = systeme_de(concept, parents, noms) if concept else "autres"
            if voulus and systeme not in voulus:
                continue
            if n is None:
                n, recalculees = normales_calculees(s, f), recalculees + 1
            positions = s @ ROTATION.T * ECHELLE
            normales = n @ ROTATION.T
            normales /= np.maximum(np.linalg.norm(normales, axis=1, keepdims=True), 1e-12)
            extras = {"fma_id": concept or "", "nom_en": noms.get(concept, ""), "systeme": systeme}
            ecrivains.setdefault(systeme, EcrivainGLB(systeme)).ajouter(fj, positions, normales, f, extras)
            centre = positions.mean(axis=0)
            index.append({"fj": fj, "fma_id": concept or "", "nom_en": noms.get(concept, ""),
                          "systeme": systeme, "glb": f"bp3d_{systeme}.glb", "sommets": len(s),
                          "triangles": len(f), "centre_x": f"{centre[0]:.4f}",
                          "centre_y": f"{centre[1]:.4f}", "centre_z": f"{centre[2]:.4f}"})
            if i % 500 == 0:
                journal("OK", f"{i} fichiers lus sur {len(fichiers)}.")

    SORTIE.mkdir(exist_ok=True)
    for systeme, ecrivain in sorted(ecrivains.items()):
        chemin = SORTIE / f"bp3d_{systeme}.glb"
        ecrivain.ecrire(chemin)
        if "--compresser" in sys.argv:
            compresser(chemin)
        journal("OK", f"{chemin.name} : {len(ecrivain.gltf['nodes'])} maillages, "
                f"{chemin.stat().st_size / 1e6:.1f} Mo.")
    with open(SORTIE / "index_maillages.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(index[0]), delimiter=";")
        w.writeheader()
        w.writerows(index)
    journal("OK", f"index_maillages.csv : {len(index)} lignes, {len(EXCLUS)} doublon(s) écarté(s).")
    if recalculees:
        journal("WARN", f"{recalculees} maillages sans normales : normales recalculées.")


if __name__ == "__main__":
    main()
