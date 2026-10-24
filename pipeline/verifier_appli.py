"""Vérifie les paquets de distribution sans les lancer (le paquet macOS ne peut pas tourner sous Windows).

macOS : exécutables Mach-O arm64 et x86_64, signature ad hoc de l'arm64 (sans elle, macOS refuse de
lancer un exécutable Apple Silicon), Info.plist valide, droits d'exécution conservés dans le zip, script
de démarrage aux fins de ligne Unix, ressources présentes.
Windows : exécutable PE en sous-système graphique (pas de console), icône intégrée, ressources présentes.

Usage : python -I pipeline/verifier_appli.py
"""

import plistlib
import struct
import sys
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DISTRIBUTION = RACINE / "distribution"
NOM = "Atlas d'anatomie"
echecs = 0


def verifier(ok, message):
    global echecs
    print(f"[{'OK' if ok else 'FAIL'}] {message}")
    echecs += not ok


def macho(donnees):
    """(type de processeur, commandes de chargement) d'un exécutable Mach-O 64 bits."""
    magie, cpu, _, _, ncmds, _, _, _ = struct.unpack_from("<IiiIIIII", donnees, 0)
    if magie != 0xFEEDFACF:
        return None, []
    commandes, pos = [], 32
    for _ in range(ncmds):
        cmd, taille = struct.unpack_from("<II", donnees, pos)
        commandes.append(cmd)
        pos += taille
    return cpu, commandes


def verifier_mac():
    z = zipfile.ZipFile(DISTRIBUTION / "Atlas-anatomie-Mac.zip")
    noms = set(z.namelist())
    app = f"{NOM}.app/Contents"
    plist = plistlib.loads(z.read(f"{app}/Info.plist"))
    verifier(plist["CFBundleExecutable"] == "atlas" and f"{app}/MacOS/atlas" in noms, "Info.plist valide, exécutable déclaré présent")
    verifier(f"{app}/Resources/{plist['CFBundleIconFile']}.icns" in noms, "icône ICNS présente")
    script = z.read(f"{app}/MacOS/atlas")
    verifier(script.startswith(b"#!/bin/sh\n") and b"\r" not in script, "script de démarrage : sh, fins de ligne Unix")
    for nom in ("atlas", "atlas-arm64", "atlas-amd64"):
        mode = (z.getinfo(f"{app}/MacOS/{nom}").external_attr >> 16) & 0o777
        verifier(mode == 0o755, f"{nom} : droits d'exécution conservés dans le zip ({oct(mode)})")
    for nom, attendu, libelle in (("atlas-arm64", 0x0100000C, "Apple Silicon"), ("atlas-amd64", 0x01000007, "Intel")):
        cpu, commandes = macho(z.read(f"{app}/MacOS/{nom}"))
        verifier(cpu == attendu, f"{nom} : exécutable Mach-O {libelle}")
        if nom == "atlas-arm64":
            verifier(0x1D in commandes, f"{nom} : signature ad hoc présente (LC_CODE_SIGNATURE)")
    for res in ("app/index.html", "app/donnees/atlas.json", "modeles/bp3d_arteres.glb", "sources.json", "graine.sqlite"):
        verifier(f"{app}/Resources/ressources/{res}" in noms, f"ressource présente : {res}")
    verifier("Lisez-moi.txt" in noms, "mode d'emploi présent")


def verifier_windows():
    z = zipfile.ZipFile(DISTRIBUTION / "Atlas-anatomie-Windows.zip")
    exe = z.read(f"{NOM}/{NOM}.exe")
    pe = struct.unpack_from("<I", exe, 0x3C)[0]
    verifier(exe[:2] == b"MZ" and exe[pe:pe + 4] == b"PE\0\0", "exécutable PE")
    machine, nsections, _, _, _, taille_opt, _ = struct.unpack_from("<HHIIIHH", exe, pe + 4)
    opt = pe + 24
    verifier(machine == 0x8664, "architecture x86-64")
    sous_systeme = struct.unpack_from("<H", exe, opt + 68)[0]
    verifier(sous_systeme == 2, "sous-système graphique : pas de fenêtre de console")
    sections = [exe[opt + taille_opt + 40 * i: opt + taille_opt + 40 * i + 8].rstrip(b"\0") for i in range(nsections)]
    verifier(b".rsrc" in sections, "ressources intégrées (icône, version)")
    noms = set(z.namelist())
    for res in ("app/index.html", "modeles/bp3d_arteres.glb", "sources.json", "graine.sqlite"):
        verifier(f"{NOM}/ressources/{res}" in noms, f"ressource présente : {res}")
    verifier(f"{NOM}/Lisez-moi.txt" in noms, "mode d'emploi présent")


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    print("--- macOS")
    verifier_mac()
    print("--- Windows")
    verifier_windows()
    print(f"[{'FAIL' if echecs else 'OK'}] {echecs or 'aucune'} anomalie{'s' if echecs > 1 else ''}.")
    sys.exit(1 if echecs else 0)


if __name__ == "__main__":
    main()
