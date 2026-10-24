"""Télécharge les sources brutes dans donnees/brut/ (fichiers déjà présents ignorés).

Usage : python -I pipeline/telecharger_sources.py
"""

import sys
import urllib.request
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BRUT = RACINE / "donnees" / "brut"

BP3D = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/"
HRA = "https://cdn.humanatlas.io/digital-objects/ref-organ/"
ZANAT = "https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/"

# (destination relative à donnees/brut, URL)
SOURCES = [
    *[(f"bodyparts3d/tables/{f}", BP3D + f) for f in (
        "README_e.html", "isa_parts_list_e.txt", "partof_parts_list_e.txt",
        "isa_inclusion_relation_list.txt", "partof_inclusion_relation_list.txt",
        "isa_element_parts.txt", "partof_element_parts.txt")],
    ("bodyparts3d/archive/isa_BP3D_4.0_obj_99.zip", BP3D + "isa_BP3D_4.0_obj_99.zip"),
    *[(f"hra/{sexe}/{f}", f"{HRA}blood-vasculature-{sexe}/v1.3/{f}")
      for sexe in ("male", "female") for f in ("metadata.json", "graph.json")],
    ("hra/male/3d-vh-m-blood-vasculature.glb", HRA + "blood-vasculature-male/v1.3/assets/3d-vh-m-blood-vasculature.glb"),
    ("hra/female/3d-vh-f-blood-vasculature.glb", HRA + "blood-vasculature-female/v1.3/assets/3d-vh-f-blood-vasculature.glb"),
    ("z-anatomy/TA2.csv", ZANAT + "TA2.csv"),
    ("z-anatomy/License.txt", ZANAT + "License.txt"),
    ("z-anatomy/archive/Z-Anatomy.zip", "https://github.com/Z-Anatomy/Models-of-human-anatomy/raw/master/Z-Anatomy.zip"),
]


def telecharger(destination, url):
    chemin = BRUT / destination
    if chemin.exists() and chemin.stat().st_size > 0:
        if chemin.suffix != ".zip" or zipfile.is_zipfile(chemin):
            print(f"[OK] Déjà présent : {destination}")
            return True
        print(f"[WARN] Archive incomplète : {destination}. Conséquence : retéléchargement.")
    chemin.parent.mkdir(parents=True, exist_ok=True)
    partiel = chemin.with_name(chemin.name + ".partiel")
    try:
        urllib.request.urlretrieve(url, partiel)
    except OSError as e:
        print(f"[FAIL] {destination} : {e}. Conséquence : source manquante. "
              "Action : vérifier la connexion puis relancer.")
        partiel.unlink(missing_ok=True)
        return False
    partiel.replace(chemin)
    print(f"[OK] Téléchargé : {destination} ({chemin.stat().st_size // 1024} Ko)")
    return True


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    echecs = sum(not telecharger(d, u) for d, u in SOURCES)
    if echecs:
        print(f"[FAIL] {echecs} téléchargements en échec sur {len(SOURCES)}.")
        sys.exit(1)
    print(f"[OK] {len(SOURCES)} sources disponibles dans {BRUT.relative_to(RACINE)}.")


if __name__ == "__main__":
    main()
