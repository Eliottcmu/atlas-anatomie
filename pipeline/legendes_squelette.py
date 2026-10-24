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
     sur le bord le plus proche et marquée « approchée ». Les os absents de BodyParts3D (manubrium, coccyx,
     osselets) gardent leurs légendes en réserve, signalées.

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

# Os que Z-Anatomy ne légende pas : repères calculés sur BodyParts3D, sommet le plus avancé dans une
# direction (repère BodyParts3D : gauche du sujet +X, avant -Y, haut +Z), marqués « calculés »
REPERES_CALCULES = [
    ("base of patella", r"^(right|left) patella$", (0, 0, 1)),
    ("apex of patella", r"^(right|left) patella$", (0, 0, -1)),
    ("anterior surface of patella", r"^(right|left) patella$", (0, -1, 0)),
    ("articular surface of patella", r"^(right|left) patella$", (0, 1, 0)),
]

# Étiquettes de Z-Anatomy fausses, repérées par pipeline/controler_legendes_os.py : noms échangés,
# avec la justification géométrique (affichée dans l'appli)
ECHANGES = [
    ("Femur", "lateral supracondylar line", "medial supracondylar line",
     "Z-Anatomy inverse les deux lignes supracondylaires du fémur, des deux côtés : la ligne nommée latérale "
     "y est à 2 cm de l'épicondyle médial et à 6 cm du latéral. Noms échangés."),
]

ORDINAUX = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
            "eleventh", "twelfth"]
ETAGES = {"C": "cervical", "T": "thoracic", "L": "lumbar"}
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
    besoins |= {l["fj"] for l in index if any(re.search(m, l["nom_en"]) for _, m, _ in REPERES_CALCULES)}
    geo_bp3d = charger_bp3d(besoins)

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
        if not fjs or p not in sommets_za:
            sans_homologue.append(p)
            continue
        cible = np.concatenate([geo_bp3d[fj] for fj in fjs])
        etiquettes = np.concatenate([np.full(len(geo_bp3d[fj]), fj, dtype=object) for fj in fjs])
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
        pos = cible[i] @ ROTATION.T * ECHELLE
        sorties.append({"nom_en": nom, "inconstant": inconstant, "cle": str(etiquettes[i]), "cote": cote_de(p),
                        "porteur": p, "ecart_mm": round(float(d), 1), "p": [round(float(v), 4) for v in pos]})
        if d > SEUIL_APPROCHEE_MM:
            sorties[-1]["approchee"] = True

    for os_, a, b, raison in ECHANGES:
        for leg in sorties:
            if re.sub(r"\.[lr]$", "", leg["porteur"]) == os_ and leg["nom_en"] in (a, b):
                leg["nom_en"] = b if leg["nom_en"] == a else a
                leg["correction"] = raison

    # Repères calculés : posés sur un sommet de l'os, donc sur la surface affichée
    for nom, motif, direction in REPERES_CALCULES:
        for l in index:
            if not re.search(motif, l["nom_en"]) or l["fj"] not in geo_bp3d:
                continue
            pts = geo_bp3d[l["fj"]]
            i = int(np.argmax(pts @ (np.array(direction, float) / np.linalg.norm(direction))))
            cote = "droit" if l["nom_en"].startswith("right") else "gauche" if l["nom_en"].startswith("left") else None
            sorties.append({"nom_en": nom, "inconstant": False, "cle": l["fj"], "cote": cote, "porteur": "calculé",
                            "ecart_mm": 0.0, "p": [round(float(v), 4) for v in pts[i] @ ROTATION.T * ECHELLE],
                            "calcule": True})

    SORTIE_JSON.write_text(json.dumps({"legendes": sorties, "ecartees": ecartees, "reserve": reserve,
                                       "os": bilan_os, "global": resume_global}, ensure_ascii=False, indent=1),
                           encoding="utf-8")
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
    if ecartees:
        lignes += ["Légendes écartées (pointe trop loin de l'os après recalage) :", ""] + [f"- {e}" for e in ecartees] + [""]
    if reserve:
        lignes += ["Légendes en réserve (os absent de BodyParts3D) :", ""] + [f"- {e}" for e in reserve] + [""]
    RAPPORT.write_text("\n".join(lignes), encoding="utf-8")
    journal("OK", f"Rapport : {RAPPORT.relative_to(RACINE)}.")


if __name__ == "__main__":
    main()
