"""Vérifie les outils nécessaires pour travailler sur le projet, et installe ceux qui peuvent l'être.

Chaque outil est rangé selon ce qu'il permet : interface et appli (obligatoires pour construire et
tester), régénération des modèles 3D, extraction des ronéos. Ce script ne concerne pas les
utilisateurs de l'atlas : eux téléchargent l'appli (README, section Télécharger).

Avec --installer, installe sans rien demander ce qui ne touche pas au système :
  - paquets Python de requirements.txt (pip) ;
  - dépendances de l'interface (npm ci dans app/) ;
  - Go portable dans %LOCALAPPDATA%\\AtlasAnatomie\\outils\\go (Windows), empreinte SHA-256 vérifiée
    contre la liste officielle de go.dev.
Les logiciels du système (Node.js, Git, Blender, Edge) restent à installer soi-même : la commande
winget à copier est donnée.

Usage : python -I pipeline/verifier_outils.py [--installer]
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from importlib import metadata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
OUTILS = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local" / "share")) / "AtlasAnatomie" / "outils"
NODE_MIN = (22, 11)
PYTHON_MIN = (3, 12)
resultats = []  # (niveau, outil, détail, action)


def noter(niveau, outil, detail, action=""):
    resultats.append((niveau, outil, detail, action))
    print(f"[{niveau}] {outil} : {detail}" + (f" Action : {action}" if action and niveau != "OK" else ""), flush=True)


def sortie(cmd):
    """Sortie d'une commande, ou None si elle est introuvable ou échoue."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return (r.stdout or r.stderr).strip() if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def nombres(texte):
    return tuple(int(x) for x in re.findall(r"\d+", texte))


# ------------------------------------------------------------ Python

def requis_python():
    lignes = (RACINE / "requirements.txt").read_text(encoding="utf-8").splitlines()
    return dict(re.match(r"^([\w.-]+)==([\w.]+)", l).groups() for l in lignes if re.match(r"^[\w.-]+==", l))


def verifier_python(installer):
    v = sys.version_info
    if (v.major, v.minor) < PYTHON_MIN:
        noter("FAIL", "Python", f"{v.major}.{v.minor} trouvé, {PYTHON_MIN[0]}.{PYTHON_MIN[1]} ou plus requis.",
              "winget install Python.Python.3.12")
        return
    noter("OK", "Python", f"{v.major}.{v.minor}.{v.micro}.")
    manquants = {}
    for paquet, voulu in requis_python().items():
        try:
            trouve = metadata.version(paquet)
        except metadata.PackageNotFoundError:
            trouve = None
        if trouve != voulu:
            manquants[paquet] = (trouve, voulu)
    if manquants and installer:
        print(f"[OK] Installation des paquets Python : {', '.join(manquants)}...", flush=True)
        r = subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(RACINE / "requirements.txt")])
        if r.returncode == 0:
            manquants = {}
    for paquet, voulu in requis_python().items():
        if paquet in manquants:
            trouve, _ = manquants[paquet]
            noter("FAIL", f"Python : {paquet}", f"{trouve or 'absent'}, version {voulu} attendue.",
                  "python -I pipeline/verifier_outils.py --installer")
        else:
            noter("OK", f"Python : {paquet}", f"{voulu}.")


# ------------------------------------------------------------ Node.js et interface

def verifier_node(installer):
    v = sortie(["node", "--version"])
    if not v:
        noter("FAIL", "Node.js", "introuvable (interface, tests).", "winget install OpenJS.NodeJS.LTS")
        return
    if nombres(v)[:2] < NODE_MIN:
        noter("FAIL", "Node.js", f"{v} trouvé, {NODE_MIN[0]}.{NODE_MIN[1]} ou plus requis.", "winget install OpenJS.NodeJS.LTS")
        return
    noter("OK", "Node.js", f"{v}.")
    npm = shutil.which("npm")
    installe = (RACINE / "app" / "node_modules" / ".package-lock.json").exists()
    if not installe and installer and npm:
        print("[OK] Installation des dépendances de l'interface (npm ci)...", flush=True)
        installe = subprocess.run([npm, "ci"], cwd=RACINE / "app").returncode == 0
    if installe:
        noter("OK", "Interface : dépendances", "installées (app/node_modules).")
    else:
        noter("FAIL", "Interface : dépendances", "non installées.", "python -I pipeline/verifier_outils.py --installer")


# ------------------------------------------------------------ Go

def go_voulu():
    texte = (RACINE / "lanceur" / "go.mod").read_text(encoding="utf-8")
    return re.search(r"^go (\d+\.\d+)", texte, re.M).group(1)


def trouver_go():
    for candidat in (OUTILS / "go" / "bin" / ("go.exe" if os.name == "nt" else "go"), shutil.which("go")):
        if candidat and Path(candidat).exists():
            return str(candidat)
    return None


def installer_go(voulu):
    """Dernière version stable de la série voulue (1.27.x), archive vérifiée par son SHA-256."""
    if os.name != "nt":
        return False
    with urllib.request.urlopen("https://go.dev/dl/?mode=json&include=all", timeout=60) as r:
        versions = json.load(r)
    serie = [v for v in versions if v.get("stable") and re.fullmatch(rf"go{re.escape(voulu)}(\.\d+)?", v["version"])]
    if not serie:
        noter("FAIL", "Go", f"aucune version stable {voulu} sur go.dev.", "installer Go à la main (https://go.dev/dl/).")
        return False
    version = max(serie, key=lambda v: nombres(v["version"]))
    archive = next(f for f in version["files"] if f["os"] == "windows" and f["arch"] == "amd64" and f["kind"] == "archive")
    print(f"[OK] Téléchargement de {archive['filename']} ({archive['size'] // 1_000_000} Mo)...", flush=True)
    with tempfile.TemporaryDirectory() as dossier:
        chemin = Path(dossier) / archive["filename"]
        urllib.request.urlretrieve(f"https://go.dev/dl/{archive['filename']}", chemin)
        empreinte = hashlib.sha256(chemin.read_bytes()).hexdigest()
        if empreinte != archive["sha256"]:
            noter("FAIL", "Go", "empreinte SHA-256 de l'archive différente de celle de go.dev : archive rejetée.",
                  "relancer plus tard ; si cela persiste, ne pas forcer.")
            return False
        if (OUTILS / "go").exists():
            shutil.rmtree(OUTILS / "go")
        OUTILS.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(chemin) as z:
            z.extractall(OUTILS)
    print(f"[OK] Go {version['version']} installé dans {OUTILS / 'go'} (empreinte vérifiée).", flush=True)
    return True


def verifier_go(installer):
    voulu = go_voulu()
    go = trouver_go()
    v = sortie([go, "version"]) if go else None
    if (not v or nombres(v)[:2] < nombres(voulu)) and installer:
        if installer_go(voulu):
            go = trouver_go()
            v = sortie([go, "version"])
    if not v:
        noter("FAIL", "Go", f"introuvable (lanceur de l'appli), {voulu} requis.", "python -I pipeline/verifier_outils.py --installer")
    elif nombres(v)[:2] < nombres(voulu):
        noter("FAIL", "Go", f"{v.split()[2]} trouvé, {voulu} ou plus requis.", "python -I pipeline/verifier_outils.py --installer")
    else:
        noter("OK", "Go", f"{v.split()[2]} ({go}).")


# ------------------------------------------------------------ logiciels du système

def verifier_systeme():
    if os.name == "nt":
        edge = [Path(os.environ.get(k, "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
                for k in ("ProgramFiles(x86)", "ProgramFiles")]
        if any(p.exists() for p in edge):
            noter("OK", "Microsoft Edge", "présent (tests de l'interface).")
        else:
            noter("FAIL", "Microsoft Edge", "introuvable : les tests de l'interface le pilotent.", "winget install Microsoft.Edge")
    v = sortie(["git", "--version"])
    noter("OK" if v else "WARN", "Git", f"{v}." if v else "introuvable (versionnement, et pdftotext sous Windows).",
          "winget install Git.Git")
    pdftotext = shutil.which("pdftotext") or next(
        (str(p) for p in [Path(os.environ.get("ProgramFiles", "")) / "Git" / "mingw64" / "bin" / "pdftotext.exe"] if p.exists()), None)
    noter("OK" if pdftotext else "WARN", "pdftotext", f"présent ({pdftotext})." if pdftotext else
          "introuvable : seulement pour extraire le texte des ronéos (pipeline/extraire_roneos.py).",
          "installer Git pour Windows (il le fournit), puis l'ajouter au PATH.")
    blender = os.environ.get("BLENDER") or next(iter(sorted(
        Path(os.environ.get("ProgramFiles", r"C:\Program Files"), "Blender Foundation").glob("*/blender.exe"), reverse=True)), None)
    noter("OK" if blender else "WARN", "Blender", f"présent ({blender})." if blender else
          "introuvable : seulement pour régénérer les modèles et légendes de Z-Anatomy.", "winget install BlenderFoundation.Blender")


# ------------------------------------------------------------ données

def verifier_donnees():
    atlas = json.loads((RACINE / "app" / "public" / "donnees" / "atlas.json").read_text(encoding="utf-8"))
    glb = [f for c in atlas["calques"] for f in c["fichiers"]]
    absents = [f for f in glb if not (RACINE / "modeles" / f).exists()]
    noter("OK" if not absents else "WARN", "Modèles 3D", "présents." if not absents else
          f"{len(absents)} GLB absents ({', '.join(absents[:3])}...) : ils ne sont pas versionnés.",
          "régénérer avec le pipeline (README, section Reproduire les données ; Blender requis pour Z-Anatomy).")
    brut = (RACINE / "donnees" / "brut" / "bodyparts3d").exists()
    noter("OK" if brut else "WARN", "Sources brutes", "téléchargées." if brut else "absentes (nécessaires pour régénérer les modèles).",
          "python -I pipeline/telecharger_sources.py")
    roneos = list((RACINE / "donnees" / "roneos").glob("*.pdf"))
    noter("OK" if roneos else "WARN", "Ronéos", f"{len(roneos)} PDF (personnels, jamais versionnés)." if roneos else
          "absentes : le paquet personnel et l'extraction du texte en ont besoin ; la version à partager s'en passe.",
          "déposer les PDF dans donnees/roneos/.")


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    installer = "--installer" in sys.argv
    print("--- Obligatoire : interface, lanceur, paquets de l'appli")
    verifier_python(installer)
    verifier_node(installer)
    verifier_go(installer)
    print("--- Logiciels du système")
    verifier_systeme()
    print("--- Données")
    verifier_donnees()
    echecs = [r for r in resultats if r[0] == "FAIL"]
    avertissements = [r for r in resultats if r[0] == "WARN"]
    if echecs:
        print(f"[FAIL] {len(echecs)} outil(s) obligatoire(s) manquant(s). Action : suivre les actions ci-dessus"
              + ("" if installer else ", ou relancer avec --installer") + ".")
    else:
        print("[OK] Tout l'obligatoire est en place" + (f" ; {len(avertissements)} élément(s) facultatif(s) à voir ci-dessus."
                                                         if avertissements else "."))
    sys.exit(1 if echecs else 0)


if __name__ == "__main__":
    main()
