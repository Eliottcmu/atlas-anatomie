"""Extrait le texte des ronéos (PDF) page par page, pour rédiger et sourcer les fiches.

Entrée : donnees/roneos/*.pdf (déposés par Eliott)
Sorties dans donnees/derive/roneos/ :
  - <nom>.txt : texte de chaque page, précédé d'une ligne "=== page N ==="
  - index.csv : fichier, pages, pages sans texte (scans, schémas seuls), caractères

Usage : python -I pipeline/extraire_roneos.py
Requiert pdftotext (poppler), fourni avec Git pour Windows.
"""

import csv
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
RONEOS = RACINE / "donnees" / "roneos"
SORTIE = RACINE / "donnees" / "derive" / "roneos"
# Une page avec moins de caractères que ce seuil est un scan ou un schéma : à lire sur le PDF
SEUIL_PAGE_VIDE = 80


def journal(niveau, message):
    print(f"[{niveau}] {message}")


# Bruit des ronéos des Carabins : pied de page, compteur "3/28", lignes faites d'espaces invisibles
BRUIT = re.compile(r"^(CDBX \d{4}-\d{4} ©.*|\d{1,3}/\d{1,3}|[\s​ ]*)$")


def nettoyer(page):
    lignes = [l.replace("​", "").rstrip() for l in page.splitlines()]
    return "\n".join(l for l in lignes if not BRUIT.match(l))


def extraire(pdf, pdftotext):
    # pdftotext n'ouvre pas les noms à accents décomposés (« e » + accent combinant, fréquent après
    # un copier depuis macOS ou OneDrive) : on lui passe une copie au nom simple
    with tempfile.TemporaryDirectory() as dossier:
        copie = Path(dossier) / "roneo.pdf"
        shutil.copyfile(pdf, copie)
        resultat = subprocess.run([pdftotext, "-enc", "UTF-8", str(copie), "-"], capture_output=True)
    if resultat.returncode != 0:
        raise RuntimeError(resultat.stderr.decode("utf-8", "replace").strip())
    # pdftotext sépare les pages par un saut de page ; la dernière est vide
    pages = resultat.stdout.decode("utf-8", "replace").split("\f")
    pages = pages[:-1] if pages and not pages[-1].strip() else pages
    return [nettoyer(p) for p in pages]


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        journal("FAIL", "pdftotext introuvable. Conséquence : texte des ronéos non extrait. "
                "Action : installer Git pour Windows ou poppler, puis relancer.")
        sys.exit(1)
    pdfs = sorted(RONEOS.glob("*.pdf"))
    if not pdfs:
        journal("FAIL", f"Aucun PDF dans {RONEOS.relative_to(RACINE)}. Action : y déposer les ronéos.")
        sys.exit(1)
    SORTIE.mkdir(parents=True, exist_ok=True)
    lignes = []
    for pdf in pdfs:
        try:
            pages = extraire(pdf, pdftotext)
        except RuntimeError as e:
            journal("WARN", f"{pdf.name} illisible : {e}. Conséquence : ronéo ignorée.")
            continue
        vides = [str(i + 1) for i, p in enumerate(pages) if len(p.strip()) < SEUIL_PAGE_VIDE]
        texte = "".join(f"=== page {i + 1} ===\n{p.strip()}\n\n" for i, p in enumerate(pages))
        # Nom de sortie en forme composée (é et non e + accent), stable d'une machine à l'autre
        nom = unicodedata.normalize("NFC", pdf.stem)
        (SORTIE / f"{nom}.txt").write_text(texte, encoding="utf-8")
        lignes.append({"fichier": unicodedata.normalize("NFC", pdf.name), "pages": len(pages), "pages_sans_texte": " ".join(vides),
                       "caracteres": sum(len(p) for p in pages)})
    with open(SORTIE / "index.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(lignes[0]), delimiter=";")
        w.writeheader()
        w.writerows(lignes)
    total = sum(l["pages"] for l in lignes)
    sans = sum(len(l["pages_sans_texte"].split()) for l in lignes)
    journal("OK", f"{len(lignes)} ronéos, {total} pages extraites, dont {sans} sans texte exploitable.")


if __name__ == "__main__":
    main()
