"""Construit l'appli téléchargeable : un paquet pour Windows et un pour macOS (Apple Silicon et Intel).

Étapes :
  1. interface : npm run build (app/dist)
  2. base graine : structures et brouillons de fiches (construction/graine.sqlite)
  3. ressources communes : interface, modèles 3D, ronéos, codes des ronéos, graine
  4. icônes : PNG, ICO (Windows), ICNS (macOS)
  5. lanceur Go compilé pour windows/amd64, darwin/arm64, darwin/amd64
  6. paquets : distribution/Atlas-anatomie-Windows.zip et distribution/Atlas-anatomie-Mac.zip

Aucune donnée personnelle n'entre dans les paquets : la base d'Eliott reste dans son dossier utilisateur.

Usage : python -I pipeline/construire_appli.py [--dev | --partage]
  --dev : seulement la graine et le lanceur de développement (construction/lanceur-dev.exe), pour les tests
  --partage : paquets à diffuser (publication GitHub), SANS les ronéos, dans distribution/partage/ ;
              les liens de ronéo des fiches ouvrent alors une page « ronéo non incluse »
"""

import csv
import json
import math
import os
import plistlib
import shutil
import subprocess
import sys
import unicodedata
import zipfile
from datetime import date
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CONSTRUCTION = RACINE / "construction"
RESSOURCES = CONSTRUCTION / "ressources"
DISTRIBUTION = RACINE / "distribution"
LANCEUR = RACINE / "lanceur"
NOM = "Atlas d'anatomie"
IDENTIFIANT = "fr.atlas-anatomie.eliott"
VERSION = date.today().strftime("%Y.%m.%d")


def journal(niveau, message):
    print(f"[{niveau}] {message}", flush=True)


def echec(message, action):
    journal("FAIL", f"{message} Action : {action}")
    sys.exit(1)


def outil_go():
    for candidat in (Path(os.environ.get("LOCALAPPDATA", "")) / "AtlasAnatomie" / "outils" / "go" / "bin" / "go.exe",
                     shutil.which("go")):
        if candidat and Path(candidat).exists():
            return str(candidat)
    echec("Go introuvable.", "installer Go (voir CLAUDE.md, section Appli).")


def lancer(cmd, **kw):
    r = subprocess.run(cmd, **kw)
    if r.returncode != 0:
        echec(f"Commande en échec : {' '.join(map(str, cmd))}.", "lire le message ci-dessus.")


def compiler(go, cible, sortie, ldflags):
    systeme, archi = cible.split("/")
    env = {**os.environ, "GOOS": systeme, "GOARCH": archi, "CGO_ENABLED": "0", "GOFLAGS": "-mod=mod"}
    lancer([go, "build", "-trimpath", "-ldflags", ldflags, "-o", str(sortie), "."], cwd=LANCEUR, env=env)
    journal("OK", f"Lanceur {cible} : {sortie.name} ({sortie.stat().st_size // 1_000_000} Mo).")


# ------------------------------------------------------------ icône

def icone():
    """Icône : un arbre vasculaire ocre sur fond d'encre, dessiné en grand puis réduit (anticrénelage)."""
    from PIL import Image, ImageDraw, ImageFilter

    dossier = CONSTRUCTION / "icone"
    dossier.mkdir(parents=True, exist_ok=True)
    t = 2048
    im = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    marge, rayon = int(t * 0.09), int(t * 0.2)
    d.rounded_rectangle([marge, marge, t - marge, t - marge], rayon, fill=(13, 17, 23, 255))
    # Halo chaud, comme le fond de l'atlas
    halo = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([t * 0.22, t * 0.2, t * 0.78, t * 0.76], fill=(232, 169, 60, 46))
    halo = halo.filter(ImageFilter.GaussianBlur(t * 0.08))
    masque = Image.new("L", (t, t), 0)
    ImageDraw.Draw(masque).rounded_rectangle([marge, marge, t - marge, t - marge], rayon, fill=255)
    im = Image.composite(Image.alpha_composite(im, halo), im, masque)
    d = ImageDraw.Draw(im)

    def courbe(p0, p1, p2, largeur, couleur, fin=0.55):
        """Bézier quadratique tracée par une suite de disques, qui s'affine vers l'extrémité comme un vaisseau.
        (Les traits épais de Pillow laissent des entailles aux jointures.)"""
        n = 600
        for i in range(n + 1):
            u = i / n
            x = (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0]
            y = (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]
            r = largeur / 2 * (1 - (1 - fin) * u)
            d.ellipse([x - r, y - r, x + r, y + r], fill=couleur)

    ocre, ivoire = (232, 169, 60, 255), (233, 227, 212, 255)
    c = t / 2
    k = t / 1024
    courbe((c, 250 * k), (c, 520 * k), (c, 830 * k), int(84 * k), ocre, fin=0.7)   # tronc
    courbe((c, 420 * k), (c - 150 * k, 430 * k), (c - 255 * k, 650 * k), int(60 * k), ocre)
    courbe((c, 420 * k), (c + 150 * k, 430 * k), (c + 255 * k, 650 * k), int(60 * k), ocre)
    courbe((c, 610 * k), (c - 95 * k, 620 * k), (c - 160 * k, 770 * k), int(44 * k), ocre)
    courbe((c, 610 * k), (c + 95 * k, 620 * k), (c + 160 * k, 770 * k), int(44 * k), ocre)
    d.ellipse([c - 48 * k, 212 * k, c + 48 * k, 308 * k], fill=ivoire)             # origine, comme un ostium
    im = im.resize((1024, 1024), Image.LANCZOS)
    png = dossier / "icone.png"
    im.save(png)
    im.save(dossier / "icone.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    im.save(dossier / "icone.icns")
    journal("OK", "Icônes : PNG, ICO, ICNS.")
    return dossier


# ------------------------------------------------------------ ressources

def ressources(partage=False):
    if RESSOURCES.exists():
        shutil.rmtree(RESSOURCES)
    RESSOURCES.mkdir(parents=True)
    shutil.copytree(RACINE / "app" / "dist", RESSOURCES / "app")
    atlas = json.loads((RACINE / "app" / "public" / "donnees" / "atlas.json").read_text(encoding="utf-8"))
    (RESSOURCES / "modeles").mkdir()
    for calque in atlas["calques"]:
        for f in calque["fichiers"]:
            source = RACINE / "modeles" / f
            if not source.exists():
                echec(f"Modèle absent : {f}.", "lancer le pipeline des modèles (README, section Reproduire).")
            shutil.copy2(source, RESSOURCES / "modeles" / f)
    # Ronéos : noms en forme composée (é et non e + accent), lisibles à l'identique sur Windows et macOS
    (RESSOURCES / "roneos").mkdir()
    # Version à partager : jamais de ronéos (documents de cours d'Eliott, droits de l'université)
    for pdf in [] if partage else (RACINE / "donnees" / "roneos").glob("*.pdf"):
        shutil.copy2(pdf, RESSOURCES / "roneos" / unicodedata.normalize("NFC", pdf.name))
    sources = json.loads((RACINE / "donnees" / "fiches" / "sources.json").read_text(encoding="utf-8"))
    pages = {}
    with open(RACINE / "donnees" / "derive" / "roneos" / "index.csv", encoding="utf-8-sig", newline="") as f:
        for l in csv.DictReader(f, delimiter=";"):
            pages[unicodedata.normalize("NFC", Path(l["fichier"]).stem)] = int(l["pages"])
    for code, v in sources.items():
        if not code.startswith("_"):
            v["fichier"] = unicodedata.normalize("NFC", v["fichier"])
            v["pages"] = pages.get(v["fichier"])
    (RESSOURCES / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=1), encoding="utf-8")
    shutil.copy2(CONSTRUCTION / "graine.sqlite", RESSOURCES / "graine.sqlite")
    taille = sum(f.stat().st_size for f in RESSOURCES.rglob("*") if f.is_file())
    journal("OK", f"Ressources : {taille // 1_000_000} Mo (interface, {len(list((RESSOURCES / 'modeles').iterdir()))} modèles, "
            f"{len(list((RESSOURCES / 'roneos').iterdir()))} ronéos, graine).")


# ------------------------------------------------------------ paquets

LISEZ_MOI = """Atlas d'anatomie, version {version}
=====================================

{installation}

Utilisation
-----------
- L'atlas s'ouvre dans sa propre fenêtre. Le fermer arrête l'atlas (au bout de quelques secondes).
- Il fonctionne sans connexion internet.
- Pendant qu'il tourne, il est aussi accessible dans n'importe quel navigateur à l'adresse
  http://127.0.0.1:8765 (ou le port suivant si celui-ci est pris : voir le journal).

Premiers gestes
---------------
- Touche ? : tous les raccourcis, et le réglage souris ou pavé tactile (sur Mac, le pavé tactile est
  réglé par défaut : deux doigts pour tourner, pincer pour zoomer).
- Rechercher : Ctrl K sous Windows, Cmd K sur Mac.
- Aller à une région ou un organe : touche G. La vue est alors légendée comme une planche d'atlas ;
  touche N pour passer aux numéros seuls (planche muette) ou masquer les légendes.
- Revenir à l'étape précédente : Alt flèche gauche sous Windows, Cmd [ sur Mac, ou les flèches en haut.

Tes données
-----------
Ta progression et tes fiches vérifiées sont enregistrées hors de l'application, dans :
  {donnees}
Une copie datée est faite à chaque lancement, dans le sous-dossier « sauvegardes » (les 15 dernières).
Mettre à jour l'atlas (remplacer l'application par une nouvelle version) ne touche pas à ces données :
les nouvelles fiches arrivent en brouillon, et une fiche que tu as vérifiée n'est jamais écrasée.

En cas de problème
------------------
Le fichier journal.txt, dans le même dossier que tes données, explique ce qui s'est passé.

Sources et licences : BodyParts3D (DBCLS, CC BY 4.0), Z-Anatomy (CC BY-SA 4.0),
Human Reference Atlas (HuBMAP, CC BY 4.0), Wikidata (CC0). {mention_roneos}
"""
MENTION_PERSO = "Les ronéos sont tes documents de cours :\nce paquet est pour ton usage personnel, ne pas le diffuser."
MENTION_PARTAGE = ("Les ronéos citées dans les fiches ne sont pas\nfournies (documents de cours). Les fiches sont des "
                   "brouillons rédigés par Claude :\nles vérifier contre ton cours avant de les apprendre.")

INSTALLATION_WINDOWS = """Installation (Windows 10 ou 11)
-------------------------------
1. Décompresser le fichier zip (clic droit, « Extraire tout »), par exemple dans Documents.
2. Ouvrir le dossier « Atlas d'anatomie » et double-cliquer sur « Atlas d'anatomie.exe ».
3. Au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur » : l'application
   n'est pas signée par un éditeur payant. Cliquer sur « Informations complémentaires » puis
   « Exécuter quand même ». Cela ne se produit qu'une fois.
Astuce : clic droit sur l'exe, « Envoyer vers », « Bureau (créer un raccourci) »."""

INSTALLATION_MAC = """Installation (macOS 11 ou plus récent, puces Apple et Intel)
------------------------------------------------------------
1. Double-cliquer sur le fichier zip pour le décompresser.
2. Glisser « Atlas d'anatomie » dans le dossier Applications.
3. Au premier lancement, macOS indique qu'il ne peut pas vérifier le développeur : l'application
   n'est pas signée par un compte développeur Apple payant. Pour l'autoriser, une seule fois :
   ouvrir Réglages Système, Confidentialité et sécurité, puis « Ouvrir quand même » en bas de la page.
   (Sur macOS 14 et plus ancien : clic droit sur l'application, « Ouvrir », puis « Ouvrir ».)
   Copier l'application par clé USB plutôt que par internet évite généralement cet avertissement.
4. L'atlas s'ouvre dans une fenêtre de Chrome ou d'Edge s'ils sont installés, sinon dans Safari."""

LANCEUR_MAC = """#!/bin/sh
# Choisit l'exécutable selon la puce : Apple Silicon (arm64) ou Intel (x86_64)
ici="$(cd "$(dirname "$0")" && pwd)"
case "$(uname -m)" in
  arm64) exec "$ici/atlas-arm64" "$@" ;;
  *) exec "$ici/atlas-amd64" "$@" ;;
esac
"""


def ajouter_dossier(z, dossier, prefixe, executables=()):
    """Ajoute un dossier au zip avec des droits Unix explicites (sinon macOS perd le bit d'exécution)."""
    for f in sorted(dossier.rglob("*")):
        nom = f"{prefixe}/{f.relative_to(dossier).as_posix()}"
        info = zipfile.ZipInfo(nom + ("/" if f.is_dir() else ""), date_time=(2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        if f.is_dir():
            info.external_attr = (0o40755 << 16) | 0x10
            z.writestr(info, "")
        else:
            info.external_attr = ((0o100755 if f.name in executables else 0o100644) << 16)
            info.compress_type = zipfile.ZIP_STORED if f.suffix in (".glb", ".pdf", ".sqlite", ".icns") else zipfile.ZIP_DEFLATED
            with open(f, "rb") as source, z.open(info, "w") as cible:
                shutil.copyfileobj(source, cible, 1 << 20)


def paquet_windows(exe, dossier_icone, sorties, mention):
    racine = CONSTRUCTION / "windows" / NOM
    if racine.parent.exists():
        shutil.rmtree(racine.parent)
    racine.mkdir(parents=True)
    shutil.copy2(exe, racine / f"{NOM}.exe")
    shutil.copytree(RESSOURCES, racine / "ressources")
    (racine / "Lisez-moi.txt").write_text(LISEZ_MOI.format(
        version=VERSION, installation=INSTALLATION_WINDOWS, mention_roneos=mention,
        donnees=r"%LOCALAPPDATA%\AtlasAnatomie (taper ce chemin dans la barre de l'Explorateur)").replace("\n", "\r\n"),
        encoding="utf-8-sig")
    sorties.mkdir(parents=True, exist_ok=True)
    sortie = sorties / "Atlas-anatomie-Windows.zip"
    with zipfile.ZipFile(sortie, "w") as z:
        ajouter_dossier(z, racine, NOM)
    journal("OK", f"Paquet Windows : {sortie.relative_to(RACINE)} ({sortie.stat().st_size // 1_000_000} Mo).")
    return racine


def paquet_mac(binaires, dossier_icone, sorties, mention):
    app = CONSTRUCTION / "mac" / f"{NOM}.app"
    if app.parent.exists():
        shutil.rmtree(app.parent)
    macos, res = app / "Contents" / "MacOS", app / "Contents" / "Resources"
    macos.mkdir(parents=True)
    res.mkdir(parents=True)
    (macos / "atlas").write_text(LANCEUR_MAC, encoding="utf-8", newline="\n")
    for archi, chemin in binaires.items():
        shutil.copy2(chemin, macos / f"atlas-{archi}")
    shutil.copytree(RESSOURCES, res / "ressources")
    shutil.copy2(dossier_icone / "icone.icns", res / "icone.icns")
    with open(app / "Contents" / "Info.plist", "wb") as f:
        plistlib.dump({
            "CFBundleName": NOM, "CFBundleDisplayName": NOM, "CFBundleIdentifier": IDENTIFIANT,
            "CFBundleExecutable": "atlas", "CFBundleIconFile": "icone", "CFBundlePackageType": "APPL",
            "CFBundleShortVersionString": VERSION, "CFBundleVersion": VERSION.replace(".", ""),
            "CFBundleInfoDictionaryVersion": "6.0", "LSMinimumSystemVersion": "11.0",
            "NSHighResolutionCapable": True,
            # Pas d'icône dans le Dock pour le lanceur : la fenêtre de l'atlas est celle du navigateur
            "LSUIElement": True,
        }, f)
    lisez = CONSTRUCTION / "mac" / "Lisez-moi.txt"
    lisez.write_text(LISEZ_MOI.format(version=VERSION, installation=INSTALLATION_MAC, mention_roneos=mention,
                                      donnees="~/Library/Application Support/AtlasAnatomie"), encoding="utf-8")
    sortie = sorties / "Atlas-anatomie-Mac.zip"
    with zipfile.ZipFile(sortie, "w") as z:
        ajouter_dossier(z, app, f"{NOM}.app", executables={"atlas", "atlas-arm64", "atlas-amd64"})
        info = zipfile.ZipInfo("Lisez-moi.txt", date_time=(2026, 1, 1, 0, 0, 0))
        info.create_system, info.external_attr = 3, 0o100644 << 16
        z.writestr(info, lisez.read_bytes())
    journal("OK", f"Paquet macOS : {sortie.relative_to(RACINE)} ({sortie.stat().st_size // 1_000_000} Mo).")
    return app


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    dev = "--dev" in sys.argv
    go = outil_go()
    lancer([sys.executable, "-I", str(RACINE / "pipeline" / "construire_base.py")])
    if dev:
        compiler(go, "windows/amd64" if os.name == "nt" else f"{sys.platform}/amd64",
                 CONSTRUCTION / ("lanceur-dev.exe" if os.name == "nt" else "lanceur-dev"), "-X main.version=dev")
        return
    npm = shutil.which("npm") or echec("npm introuvable.", "installer Node.js.")
    lancer([npm, "run", "build", "--silent"], cwd=RACINE / "app")
    journal("OK", "Interface construite (app/dist).")
    partage = "--partage" in sys.argv
    ressources(partage)
    dossier_icone = icone()
    # Icône et version intégrées à l'exe Windows (fichier .syso lu automatiquement par go build)
    lancer([go, "run", "github.com/tc-hib/go-winres@v0.3.3", "simply", "--icon", str(dossier_icone / "icone.png"),
            "--manifest", "gui", "--product-name", NOM, "--file-description", NOM,
            "--product-version", VERSION, "--file-version", VERSION, "--arch", "amd64", "--out", "rsrc"],
           cwd=LANCEUR, env={**os.environ, "GOFLAGS": "-mod=mod"})
    commun = f"-s -w -X main.version={VERSION}"
    binaires = CONSTRUCTION / "binaires"
    binaires.mkdir(exist_ok=True)
    # -H=windowsgui : pas de fenêtre de console noire au lancement
    compiler(go, "windows/amd64", binaires / "atlas-windows-amd64.exe", f"{commun} -H=windowsgui")
    for archi in ("arm64", "amd64"):
        compiler(go, f"darwin/{archi}", binaires / f"atlas-darwin-{archi}", commun)
    for f in LANCEUR.glob("rsrc_windows_*.syso"):
        f.unlink()
    sorties = DISTRIBUTION / "partage" if partage else DISTRIBUTION
    mention = MENTION_PARTAGE if partage else MENTION_PERSO
    paquet_windows(binaires / "atlas-windows-amd64.exe", dossier_icone, sorties, mention)
    paquet_mac({"arm64": binaires / "atlas-darwin-arm64", "amd64": binaires / "atlas-darwin-amd64"}, dossier_icone,
               sorties, mention)
    journal("OK", f"Appli {VERSION} prête dans {sorties.relative_to(RACINE)}/"
            + (" (version à partager, sans ronéos)." if partage else " (usage personnel, ronéos comprises : ne pas diffuser)."))


if __name__ == "__main__":
    main()
