"""Exporte de Z-Anatomy les vaisseaux absents de BodyParts3D, recalés dans son repère.

Z-Anatomy dérive de BodyParts3D mais en a remodelé une partie (tibia plus court de 2 cm,
sacrum de 3 cm) : un recalage global ne suffit pas. Le recalage se fait donc en deux temps :
  1. similitude globale (échelle, rotation, translation) ajustée sur les centres des os ;
  2. pour chaque région et chaque côté, ICP rigide sur des vaisseaux repères présents dans
     les deux modèles (carotides commune et interne pour les branches de la carotide externe, etc.).
Le contrôle mesure, pour chaque vaisseau exporté, l'écart avec son vaisseau d'origine
dans BodyParts3D : un écart nul veut dire que le vaisseau s'y raccorde. Ce contrôle choisit,
région par région, entre la similitude globale seule et l'ICP.

BodyParts3D a aussi des trous dans des vaisseaux qu'il possède (bifurcation carotidienne,
partie haute de la jugulaire interne, troncs de l'iliaque interne) : des segments de raccord
sont pris dans Z-Anatomy, privés de ce que BodyParts3D couvre déjà.

Sorties : modeles/zanatomy_<systeme>.glb (même repère que modeles/bp3d_*.glb),
modeles/index_zanatomy.csv, donnees/derive/recalage_zanatomy.json.

Usage : python -I pipeline/zanatomy.py [--compresser]
Blender : chemin pris dans la variable BLENDER, sinon dans Program Files.
"""

import csv
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convertir_glb import ECHELLE, ROTATION, EcrivainGLB, compresser, lire_obj, normales_calculees  # noqa: E402
from inventaire_couverture import normaliser_zanatomy, variantes_en  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
ZIP_ZANAT = RACINE / "donnees" / "brut" / "z-anatomy" / "archive" / "Z-Anatomy.zip"
ARCHIVE_BP3D = RACINE / "donnees" / "brut" / "bodyparts3d" / "archive" / "isa_BP3D_4.0_obj_99.zip"
INVENTAIRE = RACINE / "rapports" / "inventaire_couverture.csv"
LISTE = RACINE / "donnees" / "listes" / "liste_noyau_bloc1.csv"
DERIVE = RACINE / "donnees" / "derive"
MODELES = RACINE / "modeles"
CACHE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "AtlasAnatomie" / "z-anatomy"
SCRIPT_BLENDER = Path(__file__).resolve().parent / "blender_zanatomy.py"

# Recalage global : un os dont le centre s'écarte de plus de ce seuil est écarté
SEUIL_ABERRANT_MM = 15.0
# ICP : appariements plus lointains ignorés, nombre maximal de points par nuage
SEUIL_ICP_MM, POINTS_ICP, ITERATIONS_ICP = 20.0, 4000, 40
# Raccords : triangles à moins de ce seuil d'une structure BodyParts3D de même nom retirés
SEUIL_RECOUVREMENT_MM = 4.0
# Contrôle : un vaisseau est dit raccordé à son origine sous cet écart
SEUIL_RACCORDE_MM = 3.0

# Régions de recalage : structures de la liste, vaisseaux repères (noms BodyParts3D sans côté),
# et vaisseau d'origine de chaque structure pour le contrôle de raccordement
REGIONS = {
    "branches de la carotide externe": {
        "ids": {"A17", "A20", "A21", "A22", "A23"},
        "reperes": ["common carotid artery", "internal carotid artery"],
        "raccords": ["common carotid artery"],
        "origine": {"A17": "common carotid artery"},
    },
    # Cérébrale moyenne (A28) et fibulaire (A70) retirées le 23/10/2026 : BodyParts3D les a
    # (parties sphénoïdale et insulaire, maillage fibulaire mal étiqueté), Z-Anatomy les doublait.
    "vertébrale": {
        "ids": set(),
        # BodyParts3D commence la vertébrale vers C6 : il manque le segment V1, entre la subclavière
        # et le foramen transversaire, des deux côtés
        "reperes": ["subclavian artery", "vertebral artery", "common carotid artery"],
        "raccords": ["vertebral artery"],
        "cotes": ("droit", "gauche"),
    },
    "veines du cou": {
        "ids": {"V12"},
        "reperes": ["internal jugular vein", "subclavian vein", "brachiocephalic vein"],
        "raccords": ["internal jugular vein"],
        "origine": {"V12": "subclavian vein"},
    },
    "sinus de la dure-mère": {
        "ids": {"V13", "V14", "V15"},
        "reperes": ["internal jugular vein", "occipital bone"],
        "raccords": ["internal jugular vein"],
        "origine": {"V15": "internal jugular vein"},
    },
    "pelvis": {
        "ids": {"A52", "A55", "A56", "A57", "A58"},
        "reperes": ["common iliac artery", "internal iliac artery", "external iliac artery", "abdominal aorta"],
        "raccords": ["anterior division of internal iliac artery", "posterior division of internal iliac artery"],
        "origine": {"A52": "abdominal aorta", "A55": "internal iliac artery", "A56": "internal iliac artery",
                    "A57": "internal iliac artery", "A58": "internal iliac artery"},
    },
    "cuisse": {
        # BodyParts3D n'a que des branches de l'artère profonde de la cuisse (circonflexe latérale, perforantes)
        "ids": {"A64"},
        "reperes": ["external iliac artery", "femoral artery", "popliteal artery"],
        "origine": {"A64": "femoral artery"},
    },
}


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def trouver_blender():
    if os.environ.get("BLENDER"):
        return Path(os.environ["BLENDER"])
    candidats = sorted(Path(os.environ.get("ProgramFiles", r"C:\Program Files"), "Blender Foundation").glob("*/blender.exe"))
    if not candidats:
        journal("FAIL", "Blender introuvable. Conséquence : export impossible. "
                "Action : installer Blender (winget install BlenderFoundation.Blender) ou définir BLENDER.")
        sys.exit(1)
    return candidats[-1]


def preparer_blend():
    blend = CACHE / "Startup.blend"
    if blend.exists():
        return blend
    CACHE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_ZANAT) as z, z.open("Z-Anatomy/Startup.blend") as src, open(blend, "wb") as dst:
        shutil.copyfileobj(src, dst, 1 << 22)
    journal("OK", f"Startup.blend extrait dans {CACHE}.")
    return blend


def lancer_blender(blender, blend, *args):
    # --disable-autoexec : aucun script embarqué dans le .blend ne s'exécute
    cmd = [str(blender), "-b", "--disable-autoexec", str(blend), "--python", str(SCRIPT_BLENDER), "--", *map(str, args)]
    resultat = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    for ligne in resultat.stdout.splitlines():
        if ligne.startswith("["):
            print("  Blender " + ligne)
    if resultat.returncode != 0:
        journal("FAIL", f"Blender a échoué (code {resultat.returncode}) : {resultat.stderr.strip()[-400:]}")
        sys.exit(1)


def nom_bp3d(nom_zanat):
    """'Patella.r' -> 'right patella' ; 'Body of sternum' -> 'body of sternum'."""
    base, cote = normaliser_zanatomy(nom_zanat)
    if nom_zanat[-2:-1] == "." and cote is None:
        return None  # suffixes .i, .j, .g, .t : reliefs et groupes, pas des structures entières
    return {"droit": "right ", "gauche": "left "}.get(cote, "") + base


def avec_cote(nom, cote):
    """Noms BodyParts3D d'une structure pour un côté ; les deux côtés et la forme sans côté si cote est None."""
    if cote == "droit":
        return ["right " + nom, nom]
    if cote == "gauche":
        return ["left " + nom, nom]
    return ["right " + nom, "left " + nom, nom]


# ---------------------------------------------------------------- géométrie

def similitude(a, b, echelle=True):
    """Umeyama : s, r, t minimisant |s r a + t - b| (s = 1 si echelle est faux)."""
    ma, mb = a.mean(axis=0), b.mean(axis=0)
    ca, cb = a - ma, b - mb
    u, d, vt = np.linalg.svd(cb.T @ ca / len(a))
    signe = np.diag([1, 1, np.sign(np.linalg.det(u @ vt))])
    r = u @ signe @ vt
    s = np.trace(np.diag(d) @ signe) / ca.var(axis=0).sum() if echelle else 1.0
    return s, r, mb - s * r @ ma


def plus_proches(a, b):
    """Pour chaque point de a : distance au plus proche point de b et son indice (par blocs)."""
    dist, idx = np.empty(len(a)), np.empty(len(a), dtype=np.int64)
    for i in range(0, len(a), 1024):
        d2 = ((a[i:i + 1024, None, :] - b[None, :, :]) ** 2).sum(axis=2)
        idx[i:i + 1024] = d2.argmin(axis=1)
        dist[i:i + 1024] = np.sqrt(d2[np.arange(len(d2)), idx[i:i + 1024]])
    return dist, idx


def sous_echantillon(p, n, graine=0):
    if len(p) <= n:
        return p
    return p[np.random.default_rng(graine).choice(len(p), n, replace=False)]


def icp(source, cible):
    """ICP rigide point à point. Renvoie (r, t, écart médian avant, écart médian après)."""
    src, cib = sous_echantillon(source, POINTS_ICP), sous_echantillon(cible, POINTS_ICP, 1)
    r_tot, t_tot = np.eye(3), np.zeros(3)
    avant = float(np.median(plus_proches(src, cib)[0]))
    courant = src
    for _ in range(ITERATIONS_ICP):
        dist, idx = plus_proches(courant, cib)
        garde = dist < SEUIL_ICP_MM
        if garde.sum() < 20:
            break
        _, r, t = similitude(courant[garde], cib[idx[garde]], echelle=False)
        courant = courant @ r.T + t
        r_tot, t_tot = r @ r_tot, r @ t_tot + t
        if np.linalg.norm(t) < 0.01:
            break
    apres = float(np.median(plus_proches(courant, cib)[0]))
    return r_tot, t_tot, avant, apres


def icp_inverse(source, cible):
    """ICP apparié depuis la cible : adapté quand la cible ne couvre qu'une partie de la source
    (jugulaire interne de BodyParts3D limitée à sa partie basse, par exemple)."""
    r, t, _, _ = icp(cible, source)
    r_inv, t_inv = r.T, -r.T @ t
    cib = sous_echantillon(cible, POINTS_ICP, 1)
    src = sous_echantillon(source, POINTS_ICP) @ r_inv.T + t_inv
    avant = float(np.median(plus_proches(cib, sous_echantillon(source, POINTS_ICP))[0]))
    apres = float(np.median(plus_proches(cib, src)[0]))
    return r_inv, t_inv, avant, apres


# ---------------------------------------------------------------- BodyParts3D

def charger_bp3d():
    """Bornes et sommets (mm) des structures BodyParts3D, par nom de concept feuille en minuscules.

    On travaille au niveau des fichiers FJ (concept feuille de l'en-tête OBJ) : les concepts
    composés regroupent tout un arbre vasculaire et fausseraient la comparaison.
    """
    with open(MODELES / "index_maillages.csv", encoding="utf-8-sig", newline="") as f:
        lignes = [l for l in csv.DictReader(f, delimiter=";") if l["systeme"] in ("os", "arteres", "veines")]
    nom_de = {l["fj"]: (l["nom_en"].lower(), "os" if l["systeme"] == "os" else "vaisseaux") for l in lignes}
    structures = {}
    with zipfile.ZipFile(ARCHIVE_BP3D) as z:
        for chemin in z.namelist():
            fj = Path(chemin).stem
            if fj not in nom_de:
                continue
            _, sommets, _, _ = lire_obj(z.read(chemin).decode("ascii", "replace"))
            nom, systeme = nom_de[fj]
            entree = structures.setdefault(nom, {"systeme": systeme, "sommets": []})
            entree["sommets"].append(sommets)
    for entree in structures.values():
        entree["sommets"] = np.concatenate(entree["sommets"])
    return structures


def recalage_global(bornes_zanat, bp3d):
    """Similitude ajustée sur les centres des boîtes des os présents dans les deux modèles."""
    a, b = [], []
    for nom, borne in bornes_zanat.items():
        cible = nom_bp3d(nom)
        if borne["systeme"] == "os" and cible in bp3d and bp3d[cible]["systeme"] == "os":
            a.append((np.array(borne["min"]) + np.array(borne["max"])) / 2 * 1000)  # m -> mm
            s = bp3d[cible]["sommets"]
            b.append((s.min(axis=0) + s.max(axis=0)) / 2)
    a, b = np.array(a), np.array(b)
    garde = np.ones(len(a), bool)
    for _ in range(5):
        s, r, t = similitude(a[garde], b[garde])
        ecarts = np.linalg.norm(a @ (s * r).T + t - b, axis=1)
        nouveau = ecarts < SEUIL_ABERRANT_MM
        if (nouveau == garde).all():
            break
        garde = nouveau
    angle = float(np.degrees(np.arccos(np.clip((np.trace(r) - 1) / 2, -1, 1))))
    resume = {"echelle": s, "rotation": r.tolist(), "translation_mm": t.tolist(), "angle_rotation_deg": angle,
              "os_apparies": len(a), "os_retenus": int(garde.sum()),
              "ecart_median_os_retenus_mm": float(np.median(ecarts[garde])),
              "ecart_median_tous_os_mm": float(np.median(ecarts))}
    journal("OK", f"Recalage global sur {garde.sum()} os sur {len(a)} : échelle {s:.4f}, rotation {angle:.2f} degrés, "
            f"écart médian {resume['ecart_median_tous_os_mm']:.1f} mm sur tous les os.")
    return (lambda p: p @ (s * r).T + t), resume


# ---------------------------------------------------------------- demandes

def cote_objet(nom):
    return normaliser_zanatomy(nom)[1]


def demandes():
    """Objets Z-Anatomy à exporter d'après l'inventaire : {objet: ligne de la liste}."""
    with open(INVENTAIRE, encoding="utf-8-sig", newline="") as f:
        a_prendre = {l["id"] for l in csv.DictReader(f, delimiter=";") if "Z-Anatomy" in l["solution_secours"]}
    with open(LISTE, encoding="utf-8-sig", newline="") as f:
        lignes = {l["id"]: l for l in csv.DictReader(f, delimiter=";") if l["id"] in a_prendre}
    objets = [o for o in (DERIVE / "zanatomy_objets.txt").read_text(encoding="utf-8").split("\n") if o]
    choix = {}
    for ligne in lignes.values():
        voulus = set(variantes_en(ligne["nom_fma_en"]))
        for o in objets:
            if normaliser_zanatomy(o)[0] in voulus:
                choix[o] = ligne
    sans_objet = sorted(set(lignes) - {l["id"] for l in choix.values()})
    if sans_objet:
        journal("WARN", f"Aucun objet Z-Anatomy pour : {', '.join(sans_objet)}.")
    sans_region = sorted({l["id"] for l in choix.values()} - set().union(*(r["ids"] for r in REGIONS.values())))
    if sans_region:
        journal("WARN", f"Structures sans région de recalage (recalage global seul) : {', '.join(sans_region)}.")
    return choix, objets


def objets_par_nom(objets, generiques, cote):
    """Paires (objet Z-Anatomy, nom BodyParts3D) pour des noms génériques et un côté."""
    par_nom = {}
    for o in objets:
        n = nom_bp3d(o)
        if n:
            par_nom.setdefault(n, o)
    return [(par_nom[n], n) for g in generiques for n in avec_cote(g, cote) if n in par_nom]


def hors_recouvrement(sommets, faces, existant):
    """Garde les triangles dont au moins un sommet est loin de la structure BodyParts3D existante."""
    loin = plus_proches(sommets, sous_echantillon(existant, 20000))[0] > SEUIL_RECOUVREMENT_MM
    faces = faces[loin[faces].any(axis=1)]
    utilises = np.unique(faces)
    nouvel_indice = np.full(len(sommets), -1)
    nouvel_indice[utilises] = np.arange(len(utilises))
    return sommets[utilises], nouvel_indice[faces]


def orienter_vers_exterieur(sommets, faces):
    """Retourne les triangles si leur volume signé est négatif (faces vers l'intérieur).

    Les objets côté droit de Z-Anatomy sont des copies en miroir (échelle négative dans Blender) :
    le miroir inverse l'ordre des sommets, donc les normales, et le tube s'afficherait à l'envers.
    """
    c = sommets - sommets.mean(axis=0)
    f = faces.astype(np.int64)
    volume = np.einsum("ij,ij->i", c[f[:, 0]], np.cross(c[f[:, 1]], c[f[:, 2]])).sum()
    return (faces[:, [0, 2, 1]], True) if volume < 0 else (faces, False)


def ecart_origine(p, cibles):
    if not cibles:
        return None
    return float(plus_proches(sous_echantillon(p, 3000), sous_echantillon(np.concatenate(cibles), 20000))[0].min())


# ---------------------------------------------------------------- principal

def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    blender, blend = trouver_blender(), preparer_blend()

    bornes_json = DERIVE / "zanatomy_bornes.json"
    if not bornes_json.exists():
        lancer_blender(blender, blend, "bornes", bornes_json)
    bp3d = charger_bp3d()
    globale, resume_global = recalage_global(json.loads(bornes_json.read_text(encoding="utf-8")), bp3d)

    choix, objets = demandes()
    region_de = {i: nom for nom, r in REGIONS.items() for i in r["ids"]}
    groupes = {}
    for o, ligne in choix.items():
        groupes.setdefault((region_de.get(ligne["id"]), cote_objet(o)), []).append(o)
    # Régions de raccord seul (pas de structure à exporter) : un groupe par côté
    for nom, r in REGIONS.items():
        for cote in r.get("cotes", ()):
            groupes.setdefault((nom, cote), [])
    reperes, raccords = {}, {}
    for cle in groupes:
        if cle[0]:
            reperes[cle] = objets_par_nom(objets, REGIONS[cle[0]]["reperes"], cle[1])
            raccords[cle] = objets_par_nom(objets, REGIONS[cle[0]].get("raccords", []), cle[1])
    a_exporter = sorted(set(choix) | {o for d in (reperes, raccords) for paires in d.values() for o, _ in paires})

    demandes_json, npz = CACHE / "demandes.json", CACHE / "export.npz"
    demandes_json.write_text(json.dumps({"objets": a_exporter}, ensure_ascii=False), encoding="utf-8")
    lancer_blender(blender, blend, "export", demandes_json, npz)
    donnees = np.load(npz)
    geometrie = {str(donnees[f"nom{k}"]): (donnees[f"s{k}"], donnees[f"t{k}"]) for k in range(len(donnees.files) // 3)}

    ecrivains, index, bilan = {}, [], {"global": resume_global, "regions": []}
    deja_raccordes = set()
    retournes = 0
    for (region, cote), membres in sorted(groupes.items(), key=lambda kv: (kv[0][0] or "", kv[0][1] or "")):
        info = {"region": region or "aucune", "cote": cote or "médian"}
        candidats = {"similitude globale": (np.eye(3), np.zeros(3))}
        paires = [(o, n) for o, n in reperes.get((region, cote), []) if o in geometrie and n in bp3d]
        if paires:
            source = np.concatenate([globale(geometrie[o][0] * 1000) for o, _ in paires])
            cible = np.concatenate([bp3d[n]["sommets"] for _, n in paires])
            r_loc, t_loc, avant, apres = icp(source, cible)
            candidats["ICP régional"] = (r_loc, t_loc)
            r_inv, t_inv, _, apres_inv = icp_inverse(source, cible)
            candidats["ICP régional inverse"] = (r_inv, t_inv)
            info.update({"reperes": [n for _, n in paires], "ecart_reperes_avant_mm": round(avant, 1),
                         "ecart_reperes_apres_mm": round(apres, 1), "ecart_reperes_inverse_mm": round(apres_inv, 1)})
        segments = [(o, n) for o, n in raccords.get((region, cote), []) if o in geometrie]

        def transformer(o, r, t):
            return globale(geometrie[o][0] * 1000) @ r.T + t

        def mesurer(r, t):
            """Écarts à l'origine de chaque structure du groupe ; les raccords du groupe comptent comme origine."""
            ecarts = {}
            for o in membres:
                origine = REGIONS.get(region, {}).get("origine", {}).get(choix[o]["id"])
                if not origine:
                    continue
                noms = avec_cote(origine, cote_objet(o))
                cibles = [bp3d[n]["sommets"] for n in noms if n in bp3d]
                cibles += [transformer(so, r, t) for so, _ in segments]
                ecarts[o] = ecart_origine(transformer(o, r, t), cibles)
            return ecarts

        mesures = {nom: mesurer(*rt) for nom, rt in candidats.items()}
        # Le contrôle choisit : médiane des écarts à l'origine la plus faible ; ICP par défaut
        def score(nom):
            valeurs = [v for v in mesures[nom].values() if v is not None]
            return np.median(valeurs) if valeurs else {"ICP régional": 0}.get(nom, 1)
        retenu = min(candidats, key=score)
        r_loc, t_loc = candidats[retenu]
        info["transformation"] = retenu
        info["structures"] = []

        a_ecrire = [(o, choix[o], "structure") for o in sorted(membres)]
        a_ecrire += [(o, None, "raccord") for o, _ in segments if o not in deja_raccordes]
        deja_raccordes.update(o for o, _ in segments)
        for o, ligne, role in a_ecrire:
            sommets_mm = transformer(o, r_loc, t_loc)
            faces, retourne = orienter_vers_exterieur(sommets_mm, geometrie[o][1])
            retournes += retourne
            if role == "raccord":
                nom = nom_bp3d(o)
                if nom in bp3d:
                    sommets_mm, faces = hors_recouvrement(sommets_mm, faces, bp3d[nom]["sommets"])
                if not len(faces):
                    continue
                ligne = {"id": "", "fma_id": "", "nom_fma_en": nom,
                         "systeme": "veine" if "vein" in nom else "artère"}
            else:
                ecart = mesures[retenu].get(o)
                info["structures"].append({"objet": o, "id": ligne["id"],
                                           "origine": REGIONS.get(region, {}).get("origine", {}).get(ligne["id"]),
                                           "ecarts_mm": {k: (None if v.get(o) is None else round(v[o], 1))
                                                         for k, v in mesures.items()}})

            systeme = "arteres" if ligne["systeme"] == "artère" else "veines"
            positions = sommets_mm @ ROTATION.T * ECHELLE      # BodyParts3D (mm) -> glTF (m)
            normales = normales_calculees(positions, faces.astype(np.int64))
            normales /= np.maximum(np.linalg.norm(normales, axis=1, keepdims=True), 1e-12)
            extras = {"fma_id": ligne["fma_id"], "nom_en": ligne["nom_fma_en"], "systeme": systeme,
                      "id_liste": ligne["id"], "role": role, "source": "Z-Anatomy (CC BY-SA 4.0)"}
            ecrivains.setdefault(systeme, EcrivainGLB(systeme)).ajouter(o, positions, normales, faces, extras)
            centre = positions.mean(axis=0)
            ecart = mesures[retenu].get(o) if role == "structure" else None
            index.append({"objet": o, "role": role, "id_liste": ligne["id"], "fma_id": ligne["fma_id"],
                          "nom_en": ligne["nom_fma_en"], "systeme": systeme, "glb": f"zanatomy_{systeme}.glb",
                          "region_recalage": info["region"], "transformation": retenu,
                          "ecart_origine_mm": "" if ecart is None else f"{ecart:.1f}",
                          "sommets": len(sommets_mm), "triangles": len(faces), "centre_x": f"{centre[0]:.4f}",
                          "centre_y": f"{centre[1]:.4f}", "centre_z": f"{centre[2]:.4f}"})
        bilan["regions"].append(info)
        detail = (f"repères {info['ecart_reperes_avant_mm']} -> {info['ecart_reperes_apres_mm']} mm, "
                  if "reperes" in info else "")
        journal("OK", f"{info['region']}, {info['cote']} : {detail}transformation retenue : {retenu}.")

    for systeme, ecrivain in sorted(ecrivains.items()):
        ecrivain.gltf["asset"]["copyright"] = "Z-Anatomy, CC BY-SA 4.0 ; d'après BodyParts3D, DBCLS, CC BY 4.0"
        chemin = MODELES / f"zanatomy_{systeme}.glb"
        ecrivain.ecrire(chemin)
        if "--compresser" in sys.argv:
            compresser(chemin)
        journal("OK", f"{chemin.name} : {len(ecrivain.gltf['nodes'])} objets, {chemin.stat().st_size / 1e6:.1f} Mo.")
    with open(MODELES / "index_zanatomy.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(index[0]), delimiter=";")
        w.writeheader()
        w.writerows(index)
    (DERIVE / "recalage_zanatomy.json").write_text(json.dumps(bilan, indent=1, ensure_ascii=False), encoding="utf-8")
    n_rac = sum(i["role"] == "raccord" for i in index)
    journal("OK", f"{retournes} objets réorientés (copies en miroir de Z-Anatomy, faces vers l'intérieur).")
    journal("OK", f"index_zanatomy.csv : {len(index) - n_rac} objets pour "
            f"{len({i['id_liste'] for i in index if i['id_liste']})} structures, plus {n_rac} segments de raccord.")

    for region in bilan["regions"]:
        for c in region["structures"]:
            ecart = c["ecarts_mm"][region["transformation"]]
            if ecart is None:
                continue
            niveau = "OK" if ecart <= SEUIL_RACCORDE_MM else "WARN"
            journal(niveau, f"{c['objet']} : écart à {c['origine']} {ecart:.1f} mm ({region['transformation']}).")


if __name__ == "__main__":
    main()
