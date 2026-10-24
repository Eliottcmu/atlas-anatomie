"""Couverture de la liste noyau par les ronéos : quels noms y apparaissent, combien de fois, où.

Pour chaque structure, compte les occurrences de son nom et de chacun de ses synonymes dans
chaque ronéo (comparaison sans accents ni majuscules, au singulier comme au pluriel), et relève
les pages. Sert à deux choses : caler le nom affiché sur celui des ronéos (règle du plan), et
savoir quelle ronéo citer comme source de chaque fiche.

Sorties :
  - donnees/derive/couverture_roneos.csv : une ligne par (structure, nom, ronéo)
  - rapports/nomenclature_roneos.md : nom le plus employé par structure, structures absentes

Usage : python -I pipeline/couverture_roneos.py
"""

import csv
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from listes import lire_listes  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
TEXTES = RACINE / "donnees" / "derive" / "roneos"
SORTIE_CSV = RACINE / "donnees" / "derive" / "couverture_roneos.csv"
SORTIE_MD = RACINE / "rapports" / "nomenclature_roneos.md"

# Ronéos de référence pour le bloc 1 : cours de Montaudon (UE cardiovasculaire, DFGSM2), année la plus récente
REFERENCES = ("(2026)", "1. (2025) Anatomie médiastinale")


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def plat(texte):
    """Minuscules, sans accents, tirets supprimés, apostrophes en espaces.

    « Brachio-céphalique » et « brachiocéphalique » deviennent tous deux « brachiocephalique ».
    """
    t = unicodedata.normalize("NFD", texte.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"\s*[-‐‑]\s*", "", t)
    t = re.sub(r"['’]", " ", t)
    return re.sub(r"\s+", " ", t)


def motif(nom):
    """Motif tolérant : pluriel de chaque mot, espaces variables, « tronc artériel » facultatif."""
    mots = plat(nom).split()
    morceaux = [re.escape(m) + ("s?" if not m.endswith("s") and len(m) > 2 else "") for m in mots]
    return re.compile(r"\b" + r"\s+".join(morceaux) + r"\b")


def pages(texte):
    """[(numéro de page, texte aplati)] d'un fichier extrait par extraire_roneos.py."""
    res = []
    for bloc in re.split(r"^=== page (\d+) ===$", texte, flags=re.M)[1:]:
        if bloc.isdigit():
            res.append([int(bloc), ""])
        else:
            res[-1][1] = plat(bloc)
    return res


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    fichiers = sorted(TEXTES.glob("*.txt"))
    if not fichiers:
        journal("FAIL", "Aucun texte de ronéo. Action : lancer pipeline/extraire_roneos.py.")
        sys.exit(1)
    corpus = {f.stem: pages(f.read_text(encoding="utf-8")) for f in fichiers}
    liste = lire_listes()

    lignes, bilan = [], []
    for s in liste:
        noms = [s["nom_fr"]] + [x for x in s["synonymes_fr"].split("|") if x]
        par_nom = defaultdict(lambda: [0, 0])  # nom -> [occurrences en référence, ailleurs]
        sources = defaultdict(set)
        for nom in noms:
            m = motif(nom)
            for roneo, pp in corpus.items():
                for num, texte in pp:
                    n = len(m.findall(texte))
                    if not n:
                        continue
                    ref = any(r in roneo for r in REFERENCES)
                    par_nom[nom][0 if ref else 1] += n
                    sources[(nom, roneo)].add(num)
        for (nom, roneo), nums in sorted(sources.items()):
            lignes.append({"id": s["id"], "nom": nom, "roneo": roneo, "pages": " ".join(map(str, sorted(nums))),
                           "reference": "oui" if any(r in roneo for r in REFERENCES) else "non"})
        # Une forme courte contenue dans une forme longue présente (« coronaire droite » dans « artère
        # coronaire droite ») est comptée aussi dans la longue : la longue l'emporte si elle apparaît
        candidats = [n for n in noms if not any(plat(n) != plat(m) and plat(n) in plat(m) and par_nom[m][0]
                                                 for m in noms)]
        prefere = max(candidats, key=lambda n: (par_nom[n][0], par_nom[n][1])) if par_nom else None
        bilan.append({"s": s, "par_nom": par_nom, "prefere": prefere})

    SORTIE_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(SORTIE_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "nom", "roneo", "pages", "reference"], delimiter=";")
        w.writeheader()
        w.writerows(lignes)

    md = ["# Nomenclature et couverture par les ronéos", "",
          "Fichier généré par pipeline/couverture_roneos.py, ne pas éditer à la main.", "",
          f"Référence : cours de Montaudon, UE cardiovasculaire ({', '.join(REFERENCES)}). "
          "Occurrences comptées sans accents ni majuscules, singulier et pluriel confondus.", "",
          "## Nom de la liste différent du nom le plus employé en référence", "",
          "| Id | Nom de la liste | Nom le plus employé | Occurrences (référence / autres) |", "| --- | --- | --- | --- |"]
    absents, ecarts = [], 0
    for b in bilan:
        s, pn = b["s"], b["par_nom"]
        total_ref = sum(v[0] for v in pn.values())
        if not pn:
            absents.append(s)
            continue
        if b["prefere"] != s["nom_fr"] and pn[b["prefere"]][0] > pn[s["nom_fr"]][0]:
            ecarts += 1
            detail = ", ".join(f"{n} {v[0]}/{v[1]}" for n, v in sorted(pn.items(), key=lambda kv: -kv[1][0]))
            md.append(f"| {s['id']} | {s['nom_fr']} | **{b['prefere']}** | {detail} |")
        elif total_ref == 0:
            pass
    md += ["", "## Structures absentes des ronéos de référence", "",
           "Aucune occurrence dans les cours de Montaudon : candidates au niveau « approfondissement » si "
           "elles ne figurent pas non plus dans les autres ronéos.", "",
           "| Id | Structure | Niveau actuel | Occurrences ailleurs |", "| --- | --- | --- | --- |"]
    for b in bilan:
        s, pn = b["s"], b["par_nom"]
        if sum(v[0] for v in pn.values()) == 0:
            ailleurs = sum(v[1] for v in pn.values())
            md.append(f"| {s['id']} | {s['nom_fr']} | {s['niveau']} | {ailleurs or 'aucune'} |")
    SORTIE_MD.write_text("\n".join(md) + "\n", encoding="utf-8")
    sans_ref = sum(1 for b in bilan if sum(v[0] for v in b["par_nom"].values()) == 0)
    journal("OK", f"{len(liste)} structures : {ecarts} noms à caler sur les ronéos, "
            f"{sans_ref} absentes des cours de référence, {len(absents)} absentes de toutes les ronéos.")
    journal("OK", f"Rapport : {SORTIE_MD.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
