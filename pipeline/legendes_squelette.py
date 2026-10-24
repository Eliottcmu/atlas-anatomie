"""Légendes osseuses de Z-Anatomy (trochanters, tubercules, faces, bords...) posées sur les os de BodyParts3D.

Z-Anatomy légende ses os (collection « 1: Skeletal system ») : près de 900 repères, des deux côtés,
dont les cartilages du larynx et une molaire. Les os de Z-Anatomy sont remodelés (tibia 2 cm plus
court, sacrum 3 cm) : une similitude globale ne suffit pas. Ce script :
  1. relève les légendes du squelette dans Blender (texte, pointe du trait, sommets de l'os porteur) ;
  2. recale chaque os porteur sur son homologue BodyParts3D : similitude globale sur tous les os
     (comme pipeline/zanatomy.py), ICP rigide de l'os, puis ICP affine (allongement, aplatissement),
     refusé si l'os se déforme de plus de 25 % ou si l'écart ne baisse pas ;
  3. pose chaque pointe sur le sommet le plus proche de l'os BodyParts3D, à 18 mm au plus, sinon
     la légende est écartée et signalée. Les pointes de Z-Anatomy visent parfois le centre d'un trou
     (foramen obturé) ou l'axe d'un os long (corps du tibia) : au-delà de 10 mm, la légende est posée
     sur le bord le plus proche et marquée « approchée ». Les os absents de BodyParts3D (coccyx, osselets)
     sont importés de Z-Anatomy par pipeline/organes_zanatomy.py : leurs légendes sont posées sur le
     maillage importé (à lancer avant ce script) ;
  4. reporte les repères d'un os type sur les autres os de sa famille : Z-Anatomy ne légende que L3, T8,
     C4, la sixième côte, le troisième métacarpien... Report de proche en proche (L3 vers L2, puis L1, T12...),
     par ICP rigide puis affine d'un os sur son voisin, avec une liste des os où chaque repère existe
     (pas de fossette costale transverse sur T11 et T12). Marqués « reportés », à vérifier ;
  5. calcule quelques repères de la face, que Z-Anatomy ne légende pas (processus du maxillaire et de
     l'os zygomatique, tête, processus coronoïde et angle de la mandibule) : sommet le plus avancé dans
     une direction, marqués « position calculée ».

Sorties : donnees/derive/legendes_squelette.json (lu par construire_atlas.py), rapports/legendes_squelette.md.

Usage : python -I pipeline/legendes_squelette.py [--reexporter]
"""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convertir_glb import ECHELLE, ROTATION  # noqa: E402
from organes_zanatomy import charger_bp3d, charger_index, cote_de  # noqa: E402
from zanatomy import (CACHE, DERIVE, RACINE, icp, journal, lancer_blender, preparer_blend,  # noqa: E402
                      recalage_global, sous_echantillon, trouver_blender)

COLLECTION = "1: Skeletal system"
SORTIE_JSON = DERIVE / "legendes_squelette.json"
RAPPORT = RACINE / "rapports" / "legendes_squelette.md"
SEUIL_LEGENDE_MM, SEUIL_APPROCHEE_MM = 18.0, 10.0
DEFORMATION_MAX = 0.25  # écart maximal des valeurs singulières de l'affine à 1
POINTS_AFFINE, ITERATIONS_AFFINE, SEUIL_APPARIEMENT_MM = 4000, 40, 12.0
ORDINAUX = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
            "eleventh", "twelfth"]

# Os que Z-Anatomy ne légende pas : repères calculés sur BodyParts3D, sommet le plus avancé dans une
# direction (repère BodyParts3D : avant -Y, haut +Z ; la composante X est latérale, vers l'extérieur du
# côté de l'os), marqués « calculés ». Moitié : os impair d'un seul tenant (mandibule), un repère par côté.
REPERES_CALCULES = [
    ("base of patella", r"^(right|left) patella$", (0, 0, 1), False),
    ("apex of patella", r"^(right|left) patella$", (0, 0, -1), False),
    ("anterior surface of patella", r"^(right|left) patella$", (0, -1, 0), False),
    ("articular surface of patella", r"^(right|left) patella$", (0, 1, 0), False),
    # Mandibule : la tête est le point le plus haut et le plus en arrière de la branche, le processus
    # coronoïde le plus haut en avant d'elle (les incisives sont 3 à 4 cm plus bas), l'angle en bas et en arrière
    ("head of mandible", r"^mandible$", (0, 0.5, 1), True),
    ("coronoid process of mandible", r"^mandible$", (0, -0.3, 1), True),
    ("angle of mandible", r"^mandible$", (0.3, 1, -1), True),
    ("frontal process of maxilla", r"^(right|left) maxilla$", (0, 0, 1), False),
    ("alveolar process of maxilla", r"^(right|left) maxilla$", (0, 0, -1), False),
    ("zygomatic process of maxilla", r"^(right|left) maxilla$", (1, 0, 0), False),
    ("frontal process of zygomatic bone", r"^(right|left) zygomatic bone$", (0, 0, 1), False),
    ("temporal process of zygomatic bone", r"^(right|left) zygomatic bone$", (0, 1, 0), False),
]
# Moitié d'un os impair : sommets à plus de 10 mm du plan médian de l'os
MOITIE_MM = 10.0

# Report des repères d'un os type sur sa famille. Chaînes de noms BodyParts3D, de proche en proche depuis
# l'os type ({cote} : right ou left) ; pour chaque repère, les os où il existe (None : toute la famille).
CERVICALES = [f"{o} cervical vertebra" for o in ORDINAUX[2:7]]
THORACIQUES = [f"{o} thoracic vertebra" for o in ORDINAUX]
LOMBAIRES = [f"{o} lumbar vertebra" for o in ORDINAUX[:5]]
RACHIS = CERVICALES + THORACIQUES + LOMBAIRES  # de haut en bas, C3 à L5 (C1 et C2 ont leurs propres repères)


def vertebres(*noms):
    """'T2-T9' -> noms BodyParts3D de T2 à T9."""
    res = []
    for n in noms:
        a, b = n.split("-") if "-" in n else (n, n)
        etage = {"C": CERVICALES, "T": THORACIQUES, "L": LOMBAIRES}[a[0]]
        decalage = 3 if a[0] == "C" else 1
        res += etage[int(a[1:]) - decalage:int(b[1:]) - decalage + 1]
    return set(res)


def chaine(liste, depart):
    """Deux chaînes de proche en proche depuis l'os type : vers le début de la liste, puis vers la fin."""
    i = liste.index(depart)
    return [liste[i::-1], liste[i:]]


DOIGTS_MAIN = ["thumb", "index finger", "middle finger", "ring finger", "little finger"]
ORTEILS = ["big toe", "second toe", "third toe", "fourth toe", "little toe"]
TRANSFERTS = [
    {"source": "Vertebra L3", "chaines": chaine(RACHIS, "third lumbar vertebra"), "vertebre": True, "reperes": {
        **{n: vertebres("C3-C7", "T1-T12", "L1-L5") for n in (
            "vertebral body", "pedicle of vertebral arch", "lamina of vertebral arch", "vertebral arch", "spinous process",
            "transverse process", "superior articular process of vertebra", "superior articular facet of vertebra",
            "inferior articular facet of vertebra", "superior vertebral notch", "inferior vertebral notch",
            "vertebral foramen", "intervertebral surface", "annular epiphysis")},
        "pars interarticularis of vertebral arch": vertebres("L1-L5"),
        "costal part of transverse process": vertebres("L1-L5")}},
    # Fossettes costales : demi-fossettes supérieure et inférieure de T2 à T9 (T1 a une fossette entière pour
    # la première côte, T10 à T12 une seule fossette) ; fossette transverse de T1 à T10
    {"source": "Vertebra T8", "chaines": chaine(THORACIQUES, "eighth thoracic vertebra"), "vertebre": True, "reperes": {
        "superior costal facet": vertebres("T2-T9"), "inferior costal facet": vertebres("T1-T8"),
        "transverse costal facet": vertebres("T1-T10")}},
    {"source": "Vertebra C4", "chaines": chaine(CERVICALES, "fourth cervical vertebra"), "vertebre": True, "reperes": {
        "foramen transversarium": vertebres("C3-C7"), "uncinate process of vertebra": vertebres("C3-C7"),
        "anterior tubercle of transverse process": vertebres("C3-C6"),
        "posterior tubercle of transverse process": vertebres("C3-C6"), "groove for spinal nerve": vertebres("C3-C6")}},
    # Côtes typiques : de la troisième à la neuvième
    *[{"source": f"Sixth rib.{c}", "chaines": chaine([f"{cote} {o} rib" for o in ORDINAUX[2:9]], f"{cote} sixth rib"),
       "reperes": {n: None for n in ("head of rib", "articular facets of head of rib", "crest of head of rib", "neck of rib",
                                     "crest of neck of rib", "tubercle of rib", "articular facet of tubercle of rib",
                                     "body of rib", "angle of rib", "costal groove")}}
      for c, cote in (("r", "right"), ("l", "left"))],
    *[t for c, cote in (("r", "right"), ("l", "left")) for t in (
        {"source": f"Third metacarpal bone.{c}",
         "chaines": chaine([f"{cote} {o} metacarpal bone" for o in ORDINAUX[:5]], f"{cote} third metacarpal bone"),
         "reperes": {n: None for n in ("metacarpal base", "body of metacarpal bone", "head of metacarpal bone")}},
        # Phalanges proximales, puis moyennes depuis la proximale du majeur (même forme, plus courte)
        {"source": f"Proximal phalanx of third finger of hand.{c}",
         "chaines": chaine([f"proximal phalanx of {cote} {d}" for d in DOIGTS_MAIN], f"proximal phalanx of {cote} middle finger")
         + [[f"proximal phalanx of {cote} middle finger", f"middle phalanx of {cote} middle finger",
             f"middle phalanx of {cote} index finger"],
            [f"middle phalanx of {cote} middle finger", f"middle phalanx of {cote} ring finger",
             f"middle phalanx of {cote} little finger"]],
         "reperes": {n: None for n in ("base of phalanx of hand", "body of phalanx of hand", "head of phalanx of hand",
                                       "trochlea of phalanx of hand")}},
        {"source": f"Distal phalanx of third finger of hand.{c}",
         "chaines": chaine([f"distal phalanx of {cote} {d}" for d in DOIGTS_MAIN], f"distal phalanx of {cote} middle finger"),
         "reperes": {"tuberosity of distal phalanx of hand": None}},
        {"source": f"Third metatarsal bone.{c}",
         "chaines": chaine([f"{cote} {o} metatarsal bone" for o in ORDINAUX[:5]], f"{cote} third metatarsal bone"),
         "reperes": {n: None for n in ("base of metatarsal bone", "body of metatarsal bone", "head of metatarsal bone")}},
        {"source": f"Proximal phalanx of third finger of foot.{c}",
         "chaines": chaine([f"proximal phalanx of {cote} {d}" for d in ORTEILS], f"proximal phalanx of {cote} third toe")
         + [[f"proximal phalanx of {cote} third toe", f"middle phalanx of {cote} third toe",
             f"middle phalanx of {cote} second toe"],
            [f"middle phalanx of {cote} third toe", f"middle phalanx of {cote} fourth toe",
             f"middle phalanx of {cote} little toe"]],
         "reperes": {n: None for n in ("base of phalanx of foot", "body of phalanx of foot", "head of phalanx of foot",
                                       "trochlea of phalanx of foot")}})],
]
# Report refusé si les deux os restent à plus de cet écart médian après recalage (formes trop différentes),
# repère écarté s'il tombe à plus de cette distance de la surface de l'os cible
ECART_REPORT_MAX_MM, POSE_REPORT_MAX_MM = 2.0, 6.0

# Étiquettes de Z-Anatomy fausses, repérées par pipeline/controler_legendes_os.py : noms échangés,
# avec la justification géométrique (affichée dans l'appli)
ECHANGES = [
    ("Femur", "lateral supracondylar line", "medial supracondylar line",
     "Z-Anatomy inverse les deux lignes supracondylaires du fémur, des deux côtés : la ligne nommée latérale "
     "y est à 2 cm de l'épicondyle médial et à 6 cm du latéral. Noms échangés."),
]

ETAGES ={"C": "cervical", "T": "thoracic", "L": "lumbar"}
DOIGTS = {"hand": {"first": "thumb", "second": "index finger", "third": "middle finger", "fourth": "ring finger",
                   "fifth": "little finger"},
          "foot": {"first": "big toe", "second": "second toe", "third": "third toe", "fourth": "fourth toe",
                   "fifth": "little toe"}}


def noms_bp3d(porteur):
    """Noms BodyParts3D candidats de l'os porteur : 'Vertebra L3' -> 'third lumbar vertebra'."""
    base, cote = re.sub(r"\.[lr]$", "", porteur), cote_de(porteur)
    pre = {"droit": "right ", "gauche": "left "}.get(cote, "")
    if m := re.match(r"^Vertebra ([CTL])(\d+)$", base):
        return [f"{ORDINAUX[int(m.group(2)) - 1]} {ETAGES[m.group(1)]} vertebra"]
    if m := re.match(r"^(Atlas|Axis) \(C[12]\)$", base):
        return [m.group(1).lower()]
    if m := re.match(r"^(Proximal|Middle|Distal) phalanx of (\w+) finger of (hand|foot)$", base):
        return [f"{m.group(1).lower()} phalanx of {pre}{DOIGTS[m.group(3)][m.group(2)]}"]
    if m := re.match(r"^(Lower|Upper) (first|second) (molar|premolar) tooth$", base):
        return [f"{pre}{m.group(1).lower()} {m.group(2)} secondary {m.group(3)} tooth"]
    if base == "Navicular bone":
        return [f"navicular bone of {pre}foot"]
    if base == "Manubrium of sternum":
        return ["manubrium"]
    b = base.lower()
    return [pre + b, pre + re.sub(r" bone$", "", b)]


def nom_legende(objet):
    """'(Third trochanter).t' -> ('third trochanter', inconstant)."""
    nom = re.sub(r"\.(t|s)$", "", objet)
    inconstant = nom.startswith("(") and nom.endswith(")")
    nom = (nom[1:-1] if inconstant else nom).replace("*", "").strip()
    return re.sub(r"\s+", " ", nom).lower(), inconstant


def icp_affine(source, cible):
    """ICP affine à appariements symétriques (source vers cible et retour), après l'ICP rigide.

    Renvoie (a, t, écart avant, écart après), écarts médians symétriques en mm ; a = None si refusé.
    """
    src, cib = sous_echantillon(source, POINTS_AFFINE), sous_echantillon(cible, POINTS_AFFINE, 1)
    arbre_c = cKDTree(cib)

    def ecart(a, t):
        cour = src @ a.T + t
        return float(np.median(np.concatenate([arbre_c.query(cour)[0], cKDTree(cour).query(cib)[0]])))

    a, t = np.eye(3), np.zeros(3)
    avant = ecart(a, t)
    for _ in range(ITERATIONS_AFFINE):
        cour = src @ a.T + t
        d1, i1 = arbre_c.query(cour)
        d2, i2 = cKDTree(cour).query(cib)
        p = np.concatenate([src[d1 < SEUIL_APPARIEMENT_MM], src[i2[d2 < SEUIL_APPARIEMENT_MM]]])
        q = np.concatenate([cib[i1[d1 < SEUIL_APPARIEMENT_MM]], cib[d2 < SEUIL_APPARIEMENT_MM]])
        if len(p) < 50:
            break
        x, *_ = np.linalg.lstsq(np.hstack([p, np.ones((len(p), 1))]), q, rcond=None)
        a_n, t_n = x[:3].T, x[3]
        fini = np.abs(a_n - a).max() < 1e-4 and np.linalg.norm(t_n - t) < 0.01
        a, t = a_n, t_n
        if fini:
            break
    apres = ecart(a, t)
    sv = np.linalg.svd(a, compute_uv=False)
    if apres >= avant or np.abs(sv - 1).max() > DEFORMATION_MAX:
        return None, None, avant, apres
    return a, t, avant, apres


def en_gltf(point_mm):
    """Point BodyParts3D (mm) en coordonnées glTF (m, arrondies)."""
    return [round(float(v), 4) for v in point_mm @ ROTATION.T * ECHELLE]


def os_importes():
    """Os importés de Z-Anatomy par organes_zanatomy.py : {objet: sommets placés (mm, repère BodyParts3D)}."""
    npz = CACHE / "os_importes.npz"
    if not npz.exists():
        journal("WARN", "Os importés de Z-Anatomy introuvables (coccyx, osselets). Conséquence : leurs légendes restent "
                "en réserve. Action : lancer python -I pipeline/organes_zanatomy.py, puis relancer ce script.")
        return {}
    d = np.load(npz)
    return {str(d[k]): d["s" + k[3:]] for k in d.files if k.startswith("nom")}


def rotation_entre(u, v):
    """Rotation qui amène la direction u sur la direction v (formule de Rodrigues)."""
    u, v = u / np.linalg.norm(u), v / np.linalg.norm(v)
    axe = np.cross(u, v)
    s, c = np.linalg.norm(axe), float(u @ v)
    if s < 1e-9:
        return np.eye(3)
    k = axe / s
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * kx + (1 - c) * kx @ kx


def recaler_voisin(src, cib, r0):
    """Recale un os sur son voisin de famille : centres superposés après la rotation r0, ICP rigide puis
    affine (bornée comme pour Z-Anatomy). Renvoie (transformation des points, écart médian final en mm)."""
    cs, cc = src.mean(axis=0), cib.mean(axis=0)

    def initial(q):
        return (q - cs) @ r0.T + cc

    s0 = initial(src)
    r, t, avant, rigide = icp(s0, cib)
    if rigide >= avant:
        r, t, rigide = np.eye(3), np.zeros(3), avant
    a, ta, _, apres = icp_affine(s0 @ r.T + t, cib)
    if a is None:
        a, ta, apres = np.eye(3), np.zeros(3), rigide
    return (lambda q: (initial(q) @ r.T + t) @ a.T + ta), apres


def reporter_familles(index, geo_bp3d, recalages, sorties):
    """Report des repères des os types sur leur famille (TRANSFERTS). Renvoie (repères reportés, refus)."""
    fj_os = {}
    for l in index:
        if l["systeme"] == "os" and l["fj"] in geo_bp3d:
            fj_os.setdefault(l["nom_en"].lower(), l["fj"])
    # Axe du rachis : la rotation initiale d'une vertèbre vers sa voisine suit la courbure (lordose, cyphose)
    centres = {n: geo_bp3d[fj_os[n]].mean(axis=0) for n in RACHIS if n in fj_os}

    def tangente(n):
        i = RACHIS.index(n)
        haut = next((centres[RACHIS[j]] for j in (i - 1, i) if j >= 0 and RACHIS[j] in centres), centres[n])
        bas = next((centres[RACHIS[j]] for j in (i + 1, i) if j < len(RACHIS) and RACHIS[j] in centres), centres[n])
        return haut - bas

    deja = {(s["cle"], s["nom_en"]) for s in sorties}
    reportes, refus = [], []
    for tr in TRANSFERTS:
        if tr["source"] not in recalages:
            refus.append(f"{tr['source']} : os type sans légendes posées")
            continue
        depart = tr["chaines"][0][0]
        connus = {depart: [(s["nom_en"], s["inconstant"], s["_mm"]) for s in sorties
                           if s["porteur"] == tr["source"] and s["nom_en"] in tr["reperes"]]}
        for ch in tr["chaines"]:
            for prec, cour in zip(ch, ch[1:]):
                if prec not in connus or cour in connus:
                    continue
                if prec not in fj_os or cour not in fj_os:
                    refus.append(f"{cour} : maillage absent de BodyParts3D")
                    continue
                src, cib = geo_bp3d[fj_os[prec]], geo_bp3d[fj_os[cour]]
                r0 = rotation_entre(tangente(prec), tangente(cour)) if tr.get("vertebre") else np.eye(3)
                transfo, ecart = recaler_voisin(src, cib, r0)
                if ecart > ECART_REPORT_MAX_MM:
                    refus.append(f"{cour} depuis {prec} : formes trop différentes ({ecart:.1f} mm après recalage)")
                    continue
                if not connus[prec]:
                    connus[cour] = []
                    continue
                d, i = cKDTree(cib).query(transfo(np.array([p for _, _, p in connus[prec]])))
                connus[cour] = []
                cote = "droit" if " right " in f" {cour} " else "gauche" if " left " in f" {cour} " else None
                for (nom, inconstant, _), di, ii in zip(connus[prec], d, i):
                    if di > POSE_REPORT_MAX_MM:
                        refus.append(f"{nom} sur {cour} : {di:.0f} mm de la surface")
                        continue
                    connus[cour].append((nom, inconstant, cib[ii]))
                    autorise = tr["reperes"][nom]
                    if (autorise is not None and cour not in autorise) or (fj_os[cour], nom) in deja:
                        continue
                    deja.add((fj_os[cour], nom))
                    reportes.append({"nom_en": nom, "inconstant": inconstant, "cle": fj_os[cour], "cote": cote,
                                     "porteur": f"report:{cour}", "ecart_mm": round(float(di), 1), "p": en_gltf(cib[ii]),
                                     "reporte": depart})
    journal("OK", f"{len(reportes)} repères reportés des os types sur leur famille"
            + (f" ; {len(refus)} reports refusés." if refus else "."))
    return reportes, refus


def legendes_brutes(blender, blend, reexporter):
    sortie, npz = CACHE / "legendes_squelette.json", CACHE / "legendes_squelette_sommets.npz"
    if reexporter or not sortie.exists() or not npz.exists():
        lancer_blender(blender, blend, "legendes", sortie, npz, COLLECTION)
    d = np.load(npz)
    porteurs = {str(d[k]): d["s" + k[3:]] for k in d.files if k.startswith("nom")}
    return json.loads(sortie.read_text(encoding="utf-8")), porteurs


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    legendes, sommets_za = legendes_brutes(trouver_blender(), preparer_blend(), "--reexporter" in sys.argv)
    index = charger_index()
    fj_par_nom = defaultdict(list)
    for l in index:
        fj_par_nom[l["nom_en"].lower()].append(l["fj"])

    # Os porteurs et leurs maillages BodyParts3D (os, et cartilages ou dents rangés dans « autres »)
    porteurs = sorted({leg["porteur"] for leg in legendes})
    fjs_de = {}
    for p in porteurs:
        fjs_de[p] = next((fj_par_nom[n] for n in noms_bp3d(p) if fj_par_nom.get(n)), [])
    besoins = {fj for v in fjs_de.values() for fj in v} | {l["fj"] for l in index if l["systeme"] == "os"}
    besoins |= {l["fj"] for l in index if any(re.search(c[1], l["nom_en"]) for c in REPERES_CALCULES)}
    geo_bp3d = charger_bp3d(besoins)
    importes = os_importes()

    # Similitude globale sur les os (bornes relevées par pipeline/zanatomy.py)
    bornes = json.loads((DERIVE / "zanatomy_bornes.json").read_text(encoding="utf-8"))
    bp3d_os = defaultdict(list)
    for l in index:
        if l["systeme"] == "os" and l["fj"] in geo_bp3d:
            bp3d_os[l["nom_en"].lower()].append(geo_bp3d[l["fj"]])
    globale, resume_global = recalage_global(bornes, {k: {"systeme": "os", "sommets": np.concatenate(v)}
                                                      for k, v in bp3d_os.items()})

    # Recalage de chaque os porteur sur son homologue
    recalages, bilan_os, sans_homologue = {}, {}, []
    for p in porteurs:
        fjs = [fj for fj in fjs_de[p] if fj in geo_bp3d]
        if p not in sommets_za or not (fjs or p in importes):
            sans_homologue.append(p)
            continue
        if fjs:
            cible = np.concatenate([geo_bp3d[fj] for fj in fjs])
            etiquettes = np.concatenate([np.full(len(geo_bp3d[fj]), fj, dtype=object) for fj in fjs])
        else:
            # Os importé de Z-Anatomy : la cible est le maillage affiché, sa clé le nom de l'objet
            cible, fjs = importes[p], [p]
            etiquettes = np.full(len(cible), p, dtype=object)
        source = globale(sommets_za[p].astype(float) * 1000)
        r, t, avant, rigide = icp(source, cible)
        if rigide >= avant:
            r, t, rigide = np.eye(3), np.zeros(3), avant
        a, ta, avant_aff, apres = icp_affine(source @ r.T + t, cible)
        if a is None:
            a, ta, apres, mode = np.eye(3), np.zeros(3), rigide, "rigide"
        else:
            mode = "affine"
        transfo = (lambda q, r=r, t=t, a=a, ta=ta: (globale(q * 1000) @ r.T + t) @ a.T + ta)
        recalages[p] = (transfo, cKDTree(cible), cible, etiquettes)
        bilan_os[p] = {"maillages": fjs, "avant_mm": round(avant, 2), "rigide_mm": round(rigide, 2),
                       "apres_mm": round(apres, 2), "mode": mode}

    # Pose des légendes
    sorties, ecartees, reserve = [], [], []
    for leg in legendes:
        nom, inconstant = nom_legende(leg["objet"])
        p = leg["porteur"]
        base = re.sub(r"\.[lr]$", "", p).lower()
        # Légende qui nomme l'os entier (« Femur ») : déjà une partie légendée
        if nom == base or nom in noms_bp3d(re.sub(r"\.[lr]$", "", p)):
            continue
        if p not in recalages:
            reserve.append(f"{nom} ({p})")
            continue
        ext, texte = np.array(leg["extremites"]), np.array(leg["position_texte"])
        pointe = ext[leg["pointe"]] if leg.get("pointe") is not None else ext[np.argmax(np.linalg.norm(ext - texte, axis=1))]
        transfo, arbre, cible, etiquettes = recalages[p]
        q = transfo(pointe[None, :])[0]
        d, i = arbre.query(q)
        if d > SEUIL_LEGENDE_MM:
            ecartees.append(f"{nom} ({p} : {d:.0f} mm de la surface)")
            continue
        sorties.append({"nom_en": nom, "inconstant": inconstant, "cle": str(etiquettes[i]), "cote": cote_de(p),
                        "porteur": p, "ecart_mm": round(float(d), 1), "p": en_gltf(cible[i]), "_mm": cible[i]})
        if d > SEUIL_APPROCHEE_MM:
            sorties[-1]["approchee"] = True

    for os_, a, b, raison in ECHANGES:
        for leg in sorties:
            if re.sub(r"\.[lr]$", "", leg["porteur"]) == os_ and leg["nom_en"] in (a, b):
                leg["nom_en"] = b if leg["nom_en"] == a else a
                leg["correction"] = raison

    reportes, refus = reporter_familles(index, geo_bp3d, recalages, sorties)
    sorties += reportes

    # Repères calculés : posés sur un sommet de l'os, donc sur la surface affichée
    for nom, motif, direction, moitie in REPERES_CALCULES:
        for l in index:
            if not re.search(motif, l["nom_en"]) or l["fj"] not in geo_bp3d:
                continue
            pts = geo_bp3d[l["fj"]]
            cote_os = "droit" if l["nom_en"].startswith("right") else "gauche" if l["nom_en"].startswith("left") else None
            if moitie:
                cx = pts[:, 0].mean()
                cas = [("droit", pts[:, 0] < cx - MOITIE_MM), ("gauche", pts[:, 0] > cx + MOITIE_MM)]
            else:
                cas = [(cote_os, np.ones(len(pts), bool))]
            for cote, masque in cas:
                d = np.array(direction, float)
                d[0] *= -1 if cote == "droit" else 1  # composante latérale ; gauche du sujet vers +X
                sous = pts[masque]
                i = int(np.argmax(sous @ (d / np.linalg.norm(d))))
                sorties.append({"nom_en": nom, "inconstant": False, "cle": l["fj"], "cote": cote, "porteur": "calculé",
                                "ecart_mm": 0.0, "p": en_gltf(sous[i]), "calcule": True})

    for s in sorties:
        s.pop("_mm", None)
    SORTIE_JSON.write_text(json.dumps({"legendes": sorties, "ecartees": ecartees, "reserve": reserve,
                                       "reports_refuses": refus, "os": bilan_os, "global": resume_global},
                                      ensure_ascii=False, indent=1), encoding="utf-8")
    affines = sum(b["mode"] == "affine" for b in bilan_os.values())
    journal("OK", f"{len(sorties)} légendes osseuses posées sur {len(bilan_os)} os ({affines} recalés en affine), "
            f"écart de pose médian {np.median([s['ecart_mm'] for s in sorties]):.1f} mm.")
    if ecartees:
        journal("WARN", f"{len(ecartees)} légendes trop loin de la surface après recalage, écartées : "
                f"{'; '.join(ecartees[:6])}.")
    if sans_homologue:
        journal("WARN", f"{len(sans_homologue)} os porteurs absents de BodyParts3D ({', '.join(sans_homologue)}). "
                f"Conséquence : {len(reserve)} légendes en réserve. Action : importer ces os de Z-Anatomy si besoin.")

    lignes = ["# Légendes osseuses de Z-Anatomy", "",
              "Fichier généré par pipeline/legendes_squelette.py, ne pas éditer à la main.", "",
              f"Similitude globale : écart médian {resume_global['ecart_median_tous_os_mm']:.1f} mm sur les os. "
              "Puis, pour chaque os porteur, ICP rigide et ICP affine (écarts médians symétriques des surfaces).", "",
              "| Os Z-Anatomy | Légendes | Avant (mm) | Rigide (mm) | Final (mm) | Recalage |",
              "| --- | --- | --- | --- | --- | --- |"]
    par_porteur = Counter(s["porteur"] for s in sorties)
    for p, b in sorted(bilan_os.items()):
        lignes.append(f"| {p} | {par_porteur[p]} | {b['avant_mm']} | {b['rigide_mm']} | {b['apres_mm']} | {b['mode']} |")
    lignes += ["", f"**{len(sorties)} légendes posées** ; écart de pose médian "
               f"{np.median([s['ecart_mm'] for s in sorties]):.1f} mm, maximal {max(s['ecart_mm'] for s in sorties):.1f} mm.", ""]
    lignes += ["Étiquettes de Z-Anatomy corrigées :", ""] + [f"- {os_} : {a} et {b}. {r}" for os_, a, b, r in ECHANGES] + [""]
    par_os_type = Counter(r["reporte"] for r in reportes)
    lignes += [f"**{len(reportes)} repères reportés** d'un os type sur sa famille (de proche en proche, ICP rigide "
               "puis affine) :", "", "| Os type | Repères reportés | Os légendés |", "| --- | --- | --- |"]
    for depart, n in sorted(par_os_type.items()):
        lignes.append(f"| {depart} | {n} | {len({r['cle'] for r in reportes if r['reporte'] == depart})} |")
    lignes += [""]
    if refus:
        lignes += ["Reports refusés :", ""] + [f"- {e}" for e in refus] + [""]
    if ecartees:
        lignes += ["Légendes écartées (pointe trop loin de l'os après recalage) :", ""] + [f"- {e}" for e in ecartees] + [""]
    if reserve:
        lignes += ["Légendes en réserve (os absent de BodyParts3D) :", ""] + [f"- {e}" for e in reserve] + [""]
    RAPPORT.write_text("\n".join(lignes), encoding="utf-8")
    journal("OK", f"Rapport : {RAPPORT.relative_to(RACINE)}.")


if __name__ == "__main__":
    main()
