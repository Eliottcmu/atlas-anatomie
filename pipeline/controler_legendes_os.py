"""Contrôle d'orientation des légendes osseuses posées par pipeline/legendes_squelette.py.

Sur chaque os, deux repères qui ne diffèrent que par « medial » et « lateral » (épicondyles, condyles,
malléoles, lèvres de la ligne âpre...) doivent être dans le bon ordre selon l'axe transversal, en tenant
compte du côté ; de même « anterior » et « posterior » (axe antéro-postérieur), « superior » et
« inferior » (axe vertical). Repère glTF : droite du sujet vers -X, haut +Y, avant +Z.
Une inversion signale un recalage raté ou une étiquette de Z-Anatomy fausse, à corriger avant d'apprendre.

Usage : python -I pipeline/controler_legendes_os.py
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "donnees" / "derive" / "legendes_squelette.json"
# (mot a, mot b, axe, signe) : la coordonnée de a moins celle de b doit avoir ce signe
PAIRES = [("lateral", "medial", 0, None), ("anterior", "posterior", 2, 1), ("superior", "inferior", 1, 1)]
# Écart en deçà duquel l'ordre ne veut rien dire (repères quasi confondus sur l'axe), mètres
TOLERANCE = 0.002


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    legendes = json.loads(SOURCE.read_text(encoding="utf-8"))["legendes"]
    par_os = defaultdict(dict)
    for l in legendes:
        par_os[l["porteur"]].setdefault(l["nom_en"], l)
    controles, inversions = 0, []
    for porteur, reperes in par_os.items():
        cote = "droit" if porteur.endswith(".r") else "gauche" if porteur.endswith(".l") else None
        for nom, l in reperes.items():
            for a, b, axe, signe in PAIRES:
                if not re.search(rf"\b{a}\b", nom):
                    continue
                autre = re.sub(rf"\b{a}\b", b, nom)
                if autre not in reperes:
                    continue
                # Latéral : plus loin de la ligne médiane, donc vers -X à droite et +X à gauche
                s = signe if signe is not None else (-1 if cote == "droit" else 1)
                if signe is None and cote is None:
                    continue  # os impair : latéral et médial n'ont pas de sens global
                ecart = (l["p"][axe] - reperes[autre]["p"][axe]) * s
                # Repères à des hauteurs très différentes d'un os incliné (bords du radius) : pas comparables
                hauteur = abs(l["p"][1] - reperes[autre]["p"][1])
                if abs(ecart) < TOLERANCE or (axe != 1 and hauteur > 2 * abs(ecart)):
                    continue
                controles += 1
                if ecart < 0:
                    inversions.append(f"{porteur} : {nom} / {autre} ({ecart * 1000:.0f} mm)")
    journal("OK" if not inversions else "WARN",
            f"{controles} paires de repères contrôlées, {len(inversions)} inversées.")
    for i in inversions:
        journal("WARN", f"Inversion : {i}. Action : vérifier la pose sur le modèle, corriger ou écarter le repère.")


if __name__ == "__main__":
    main()
