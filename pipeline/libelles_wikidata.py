"""Récupère dans Wikidata les identifiants FMA et les libellés français.

Interroge Wikidata par identifiant FMA (propriété P1402) pour les structures de la
liste noyau et pour tous les concepts des maillages (modeles/index_maillages.csv,
s'il existe), par lots ; et par libellé anglais pour les structures de la liste.
Sortie : donnees/derive/wikidata_fma.csv (qid, fma_id, libellé anglais,
libellé français, alias français séparés par |).

Usage : python -I pipeline/libelles_wikidata.py
"""

import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
LISTE = RACINE / "donnees" / "listes" / "liste_noyau_bloc1.csv"
INDEX_MAILLAGES = RACINE / "modeles" / "index_maillages.csv"
TAILLE_LOT = 300
SORTIE = RACINE / "donnees" / "derive" / "wikidata_fma.csv"
POINT_SPARQL = "https://query.wikidata.org/sparql"
AGENT = "AtlasAnatomieLocal/0.1 (usage personnel, hors ligne ensuite)"

REQUETE = """
SELECT ?item ?fma ?en ?fr (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?alias_fr) WHERE {
  { VALUES ?fma { %s } ?item wdt:P1402 ?fma . }
  UNION
  { VALUES ?en { %s } ?item rdfs:label ?en ; wdt:P1402 ?fma . }
  OPTIONAL { ?item rdfs:label ?en_l FILTER(lang(?en_l) = "en") }
  BIND(COALESCE(?en, ?en_l) AS ?en)
  OPTIONAL { ?item rdfs:label ?fr FILTER(lang(?fr) = "fr") }
  OPTIONAL { ?item skos:altLabel ?alias FILTER(lang(?alias) = "fr") }
}
GROUP BY ?item ?fma ?en ?fr
"""


def interroger(fma_ids, noms_en):
    requete = REQUETE % (
        " ".join(f'"{f}"' for f in sorted(fma_ids)),
        " ".join(f'"{n}"@en' for n in sorted(noms_en)) or '""@en',
    )
    # POST : une requête de plusieurs centaines d'identifiants dépasse la longueur permise en GET
    corps = urllib.parse.urlencode({"query": requete, "format": "json"}).encode("utf-8")
    demande = urllib.request.Request(POINT_SPARQL, data=corps, headers={
        "User-Agent": AGENT, "Accept": "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(demande, timeout=120) as reponse:
        return json.load(reponse)["results"]["bindings"]


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    with open(LISTE, encoding="utf-8-sig", newline="") as f:
        lignes = list(csv.DictReader(f, delimiter=";"))
    fma_ids = {f.removeprefix("FMA") for l in lignes for f in l["fma_id"].split("|") if f.startswith("FMA")}
    noms_en = {l["nom_fma_en"].strip() for l in lignes if l["nom_fma_en"].strip()}
    if INDEX_MAILLAGES.exists():
        with open(INDEX_MAILLAGES, encoding="utf-8-sig", newline="") as f:
            fma_ids |= {l["fma_id"].removeprefix("FMA") for l in csv.DictReader(f, delimiter=";") if l["fma_id"]}
    ids = sorted(fma_ids, key=int)
    try:
        resultats = []
        for i in range(0, len(ids), TAILLE_LOT):
            # Les noms anglais ne sont demandés qu'avec le premier lot
            resultats += interroger(set(ids[i:i + TAILLE_LOT]), noms_en if i == 0 else set())
    except OSError as e:
        print(f"[FAIL] Wikidata injoignable : {e}. Conséquence : libellés non mis à jour. "
              "Action : vérifier la connexion puis relancer.")
        sys.exit(1)

    vus, lignes_sortie = set(), []
    for r in resultats:
        val = {k: v["value"] for k, v in r.items()}
        cle = (val["item"], val["fma"])
        if cle in vus:
            continue
        vus.add(cle)
        lignes_sortie.append({
            "qid": val["item"].rsplit("/", 1)[-1], "fma_id": "FMA" + val["fma"],
            "libelle_en": val.get("en", ""), "libelle_fr": val.get("fr", ""), "alias_fr": val.get("alias_fr", ""),
        })
    lignes_sortie.sort(key=lambda l: int(l["fma_id"][3:]))
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(lignes_sortie[0]), delimiter=";")
        w.writeheader()
        w.writerows(lignes_sortie)
    print(f"[OK] {SORTIE.relative_to(RACINE)} : {len(lignes_sortie)} entrées "
          f"pour {len(fma_ids)} identifiants et {len(noms_en)} noms anglais demandés.")


if __name__ == "__main__":
    main()
