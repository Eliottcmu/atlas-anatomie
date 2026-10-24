"""Listes noyau des quatre blocs du plan, éditées à la main : donnees/listes/liste_noyau_bloc*.csv.

Bloc 1 vaisseaux (A, V), bloc 2 muscles (M), bloc 3 organes (O), bloc 4 os (S). Toutes ont les mêmes
colonnes ; les scripts les lisent ensemble, dans l'ordre des blocs. Le système d'une structure
(artère, veine, muscle, organe, os) décide des champs de sa fiche (pipeline/base.py).
"""

import csv
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER = RACINE / "donnees" / "listes"
# Système d'une structure -> calque de l'atlas qui porte ses maillages
CALQUE_SYSTEME = {"artère": "arteres", "veine": "veines", "muscle": "muscles", "organe": "autres", "os": "os"}


def fichiers_listes():
    return sorted(DOSSIER.glob("liste_noyau_bloc*.csv"))


def lire_fichier(chemin):
    """(entête, lignes) d'une liste ; chaque ligne garde le chemin de son fichier sous « _fichier »."""
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        lecteur = csv.DictReader(f, delimiter=";")
        lignes = list(lecteur)
    for l in lignes:
        l["_fichier"] = chemin
    return lecteur.fieldnames, lignes


def lire_listes():
    """Toutes les structures de toutes les listes noyau, dans l'ordre des blocs."""
    res = []
    for chemin in fichiers_listes():
        res += lire_fichier(chemin)[1]
    return res


def ecrire_fichier(chemin, entete, lignes):
    """Réécrit une liste (fichier temporaire puis remplacement : un échec ne touche pas l'original)."""
    temporaire = chemin.with_suffix(".csv.tmp")
    with open(temporaire, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=entete, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)
    temporaire.replace(chemin)
