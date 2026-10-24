"""Cale la liste noyau sur les ronéos (décision du 21/10/2026, règle du plan : nom affiché = nom des ronéos).

- renomme les structures dont les ronéos de référence emploient un autre nom ; l'ancien nom passe en synonyme ;
- passe en « approfondissement » les structures absentes de toutes les ronéos déposées ;
- ajoute les synonymes relevés à la lecture.
Chaque changement est consigné dans la colonne remarque. Le script est idempotent.

Usage : python -I pipeline/caler_liste_roneos.py
"""

import csv
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
LISTE = RACINE / "donnees" / "listes" / "liste_noyau_bloc1.csv"

# id : (nouveau nom, raison) ; occurrences dans rapports/nomenclature_roneos.md
RENOMMER = {
    "A03": ("artère interventriculaire antérieure", "terme des ronéos de Montaudon"),
    "A04": ("artère circonflexe", "24 occurrences en référence contre 0"),
    "A06": ("aorte horizontale", "26 occurrences contre 2 pour arc aortique"),
    "A07": ("artère brachio-céphalique", "terme principal de Montaudon"),
    "A64": ("artère profonde de la cuisse", "10 occurrences contre 0"),
    "V26": ("veine hépatique moyenne", "terme des ronéos"),
    "V34": ("veine grande saphène", "terme de Montaudon 2026"),
    "V35": ("veine petite saphène", "terme de Montaudon 2026"),
}
ABSENTES = {
    **{i: "absente des ronéos déposées (tête et cou non traités par le cours cardiovasculaire)"
       for i in ("A17", "A18", "A19", "A20", "A21", "A22", "A23", "A25", "A26", "A27", "A28", "A29", "A30", "A31")},
    "A59": "absente des ronéos : Montaudon ne cite que les artères vésicales inférieures",
    "A68": "absente des ronéos : la fibulaire naît directement de la tibiale postérieure (Montaudon, FMA)",
    "V18": "absente des ronéos : le cours décrit les veines médianes céphalique et basilique (M veineux)",
}
SYNONYMES = {"A13": ["artère pulmonaire"]}
MARQUE = "[ronéos 21/10/2026]"


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    with open(LISTE, encoding="utf-8-sig", newline="") as f:
        lecteur = csv.DictReader(f, delimiter=";")
        entete, lignes = lecteur.fieldnames, list(lecteur)
    changements = 0
    for l in lignes:
        syn = [x for x in l["synonymes_fr"].split("|") if x]
        notes = [l["remarque"]] if l["remarque"] else []
        if l["id"] in RENOMMER and l["nom_fr"] != RENOMMER[l["id"]][0]:
            nouveau, raison = RENOMMER[l["id"]]
            syn = [l["nom_fr"]] + [x for x in syn if x != nouveau]
            notes.append(f"{MARQUE} renommée, ancien nom {l['nom_fr']} : {raison}")
            l["nom_fr"] = nouveau
            changements += 1
        if l["id"] in ABSENTES and l["niveau"] != "approfondissement":
            l["niveau"] = "approfondissement"
            notes.append(f"{MARQUE} passée en approfondissement : {ABSENTES[l['id']]}")
            changements += 1
        for s in SYNONYMES.get(l["id"], []):
            if s not in syn:
                syn.append(s)
                changements += 1
        l["synonymes_fr"] = "|".join(syn)
        # Pas de « ; » dans les remarques : il casserait le CSV
        l["remarque"] = " / ".join(notes).replace(";", ",")
    temporaire = LISTE.with_suffix(".csv.tmp")
    with open(temporaire, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=entete, delimiter=";")
        w.writeheader()
        w.writerows(lignes)
    temporaire.replace(LISTE)
    noyau = sum(l["niveau"] == "noyau" for l in lignes)
    print(f"[OK] {changements} changements appliqués. Liste : {noyau} structures noyau, "
          f"{len(lignes) - noyau} en approfondissement.")


if __name__ == "__main__":
    main()
