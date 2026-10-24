"""Contrôle des citations des brouillons de fiches.

Pour chaque champ sourcé, mesure la part de ses mots (5 lettres et plus) qu'on retrouve sur les
pages citées. Un taux bas ne prouve pas une erreur (paraphrase, faute de frappe de la ronéo), il
désigne les champs à relire en premier contre la ronéo. Signale aussi les champs et les relations
sans source, affichés « hors ronéos, à vérifier » dans l'appli.

Usage : python -I pipeline/controler_citations.py [seuil, défaut 0.6]
Prérequis : python -I pipeline/extraire_roneos.py (textes page par page).
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TEXTES = RACINE / "donnees" / "derive" / "roneos"
BROUILLONS = RACINE / "donnees" / "fiches" / "brouillons"
SOURCES = json.loads((RACINE / "donnees" / "fiches" / "sources.json").read_text(encoding="utf-8"))
MOTS_VIDES = set("dans avec pour elle elles leur leurs entre plus sont puis vers dont celle celles cette".split())


def sans_accents(texte: str) -> str:
    texte = unicodedata.normalize("NFD", texte.lower())
    return "".join(c for c in texte if unicodedata.category(c) != "Mn")


_pages: dict[str, dict[int, str]] = {}


def pages(code: str) -> dict[int, str]:
    if code not in _pages:
        nom = unicodedata.normalize("NFC", SOURCES[code]["fichier"]).strip()
        fichier = next((p for p in TEXTES.glob("*.txt") if unicodedata.normalize("NFC", p.stem).strip() == nom), None)
        if fichier is None:
            sys.exit(f"[FAIL] Texte de {code} introuvable dans {TEXTES}. Action : lancer python -I pipeline/extraire_roneos.py.")
        brut = fichier.read_text(encoding="utf-8")
        _pages[code] = {int(m.group(1)): sans_accents(m.group(2))
                        for m in re.finditer(r"=== page (\d+) ===\n(.*?)(?==== page|\Z)", brut, re.S)}
    return _pages[code]


def developper(ref: str) -> tuple[str, list[int]]:
    code, _, spec = ref.partition(":")
    numeros: list[int] = []
    for bloc in spec.split(","):
        debut, _, fin = bloc.partition("-")
        numeros += range(int(debut), int(fin or debut) + 1)
    return code, numeros


def main() -> None:
    seuil = float(sys.argv[1]) if len(sys.argv) > 1 else 0.6
    nb_champs = faibles = sans_source = 0
    for fichier in sorted(BROUILLONS.glob("*.json")):
        for fiche in json.loads(fichier.read_text(encoding="utf-8"))["fiches"]:
            for nom, champ in fiche["champs"].items():
                nb_champs += 1
                if not champ["sources"]:
                    sans_source += 1
                    print(f"[WARN] {fiche['id']}.{nom} : sans source, affiché « hors ronéos, à vérifier ».")
                    continue
                mots = {m for m in re.findall(r"[a-z0-9]+", sans_accents(champ["texte"]))
                        if len(m) >= 5 and m not in MOTS_VIDES}
                corpus = " ".join(pages(code).get(p, "")
                                  for code, numeros in map(developper, champ["sources"]) for p in numeros)
                # Racine de 5 lettres : tolère pluriels et accords
                trouves = {m for m in mots if m[:5] in corpus}
                taux = len(trouves) / max(1, len(mots))
                if taux < seuil:
                    faibles += 1
                    print(f"[WARN] {fiche['id']}.{nom} {champ['sources']} : {taux:.0%} des mots retrouvés ; "
                          f"absents : {', '.join(sorted(mots - trouves)[:10])}. Action : relire contre la ronéo.")
            for rel in fiche["relations"]:
                if not rel["sources"]:
                    sans_source += 1
                    print(f"[WARN] {fiche['id']} {rel['type']} {rel['cible']} : relation sans source.")
    print(f"[OK] {nb_champs} champs contrôlés : {faibles} sous {seuil:.0%}, {sans_source} éléments sans source.")


if __name__ == "__main__":
    main()
