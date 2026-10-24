"""Extrait les noms des structures disponibles dans les sources 3D de secours.

Sorties dans donnees/derive/ :
  - zanatomy_objets.txt : noms d'objets du fichier Startup.blend de Z-Anatomy,
    lus en flux depuis le zip (le .blend de 300 Mo n'est jamais extrait)
  - hra_noeuds_male.txt, hra_noeuds_female.txt : noms des nœuds des GLB
    de vascularisation du Human Reference Atlas

Usage : python -I pipeline/extraire_noms_secours.py
"""

import json
import re
import struct
import sys
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BRUT = RACINE / "donnees" / "brut"
DERIVE = RACINE / "donnees" / "derive"

# Dans un .blend, chaque objet est un bloc ID dont le nom commence par "OB"
MOTIF_OBJET = re.compile(rb"OB([A-Za-z][ -~]{2,120}?)\x00")


def noms_blend(chemin_zip):
    noms, reste = set(), b""
    with zipfile.ZipFile(chemin_zip) as z, z.open("Z-Anatomy/Startup.blend") as f:
        if not f.read(7).startswith(b"BLENDER"):
            raise ValueError("Startup.blend non compressé attendu (en-tête BLENDER absent)")
        while bloc := f.read(1 << 22):
            donnees = reste + bloc
            noms.update(m.group(1).decode("ascii", "replace") for m in MOTIF_OBJET.finditer(donnees))
            reste = donnees[-200:]
    return noms


def noms_glb(chemin):
    with open(chemin, "rb") as f:
        f.read(12)
        longueur, _ = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(longueur))
    return {n["name"] for n in gltf.get("nodes", []) if n.get("name")}


def ecrire(nom_fichier, noms):
    DERIVE.mkdir(parents=True, exist_ok=True)
    (DERIVE / nom_fichier).write_text("\n".join(sorted(noms)) + "\n", encoding="utf-8")
    print(f"[OK] {nom_fichier} : {len(noms)} noms.")


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    zanat = BRUT / "z-anatomy" / "archive" / "Z-Anatomy.zip"
    if not zanat.exists():
        print("[FAIL] Z-Anatomy.zip absent. Action : lancer pipeline/telecharger_sources.py.")
        sys.exit(1)
    ecrire("zanatomy_objets.txt", noms_blend(zanat))
    for sexe, lettre in (("male", "m"), ("female", "f")):
        glb = BRUT / "hra" / sexe / f"3d-vh-{lettre}-blood-vasculature.glb"
        if not glb.exists():
            print(f"[FAIL] {glb.name} absent. Action : lancer pipeline/telecharger_sources.py.")
            sys.exit(1)
        ecrire(f"hra_noeuds_{sexe}.txt", noms_glb(glb))


if __name__ == "__main__":
    main()
