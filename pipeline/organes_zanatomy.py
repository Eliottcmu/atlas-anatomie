"""Organes de Z-Anatomy absents de BodyParts3D, et légendes des organes, recalés sur BodyParts3D.

BodyParts3D n'a ni surface des poumons, ni lobules du cervelet, ni sillons du cerveau, ni pharynx,
thyroïde, parotides, épiploons, nœuds lymphatiques... Z-Anatomy les a, et pose aussi sur ses organes
des légendes (hile du rein, pôles, faces, segments du foie et des poumons). Ce script :
  1. exporte de Z-Anatomy les objets des groupes ci-dessous et les légendes des organes ;
  2. les recale : similitude globale sur les os (comme pipeline/zanatomy.py), puis, par groupe,
     ICP rigide sur des repères présents dans les deux modèles (les 50 parties de l'encéphale
     communes aux deux, l'œil, les viscères, la trachée et les côtes...) ;
  3. écarte les doublons : un objet dont 60 % de la surface tombe à moins de 2 mm d'un maillage
     BodyParts3D est déjà présent ; à l'inverse, un maillage BodyParts3D couvert à 70 % par
     plusieurs objets plus fins de Z-Anatomy (lobe occipital découpé en gyrus) est remplacé ;
  4. pose chaque légende sur la surface affichée : sommet le plus proche du maillage qui la porte,
     à 12 mm au plus après recalage, sinon la légende est écartée et signalée.

Sorties : modeles/zanatomy_organes.glb, modeles/zanatomy_os.glb (coccyx, osselets), modeles/zanatomy_muscles.glb
(masséter, temporal, ptérygoïdiens, muscles de la paroi abdominale, grand dorsal, trapèze), modeles/index_zanatomy_organes.csv,
donnees/derive/organes_zanatomy.json (doublons, légendes, bilan du recalage),
rapports/recalage_organes.md.

Usage : python -I pipeline/organes_zanatomy.py [--compresser] [--reexporter]
  --reexporter : relance Blender même si les exports en cache existent.
"""

import csv
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convertir_glb import ECHELLE, ROTATION, EcrivainGLB, compresser, lire_obj, normales_calculees  # noqa: E402
from zanatomy import (ARCHIVE_BP3D, CACHE, DERIVE, MODELES, RACINE, icp, journal, lancer_blender,  # noqa: E402
                      nom_bp3d, preparer_blend, recalage_global, trouver_blender)

RAPPORT = RACINE / "rapports" / "recalage_organes.md"
SORTIE_JSON = DERIVE / "organes_zanatomy.json"

# Doublons : distance de recouvrement, part d'un objet déjà présente, part d'un maillage remplacé
SEUIL_RECOUVREMENT_MM, PART_DOUBLON, PART_REMPLACE = 2.0, 0.6, 0.7
# Légendes : distance maximale entre la pointe recalée et la surface affichée
SEUIL_LEGENDE_MM = 12.0

COTES = r"(\.[lr])?"
# Parties de l'encéphale communes aux deux modèles : repères du recalage de l'encéphale et du cervelet
ENCEPHALE_COMMUN = (r"^(Angular gyrus|Caudate nucleus|Cingulate gyrus \(Posteroventral part\*\)|Corpus callosum|"
                    r"Fourth ventricle|Globus pallidus|Habenula|Hippocampus|Hypothalamus|Inferior colliculus|"
                    r"Inferior temporal gyrus|Lateral geniculate body|Lateral ventricle|Medial geniculate body|"
                    r"Medulla oblongata|Midbrain|Middle frontal gyrus|Middle temporal gyrus|Optic chiasm|Optic tract|"
                    r"Pons|Postcentral gyrus|Posterior commissure|Precentral gyrus|Putamen|Superior colliculus|"
                    r"Superior frontal gyrus|Superior parietal lobule|Supramarginal gyrus|Thalamus|Third ventricle)"
                    + COTES + "$")
COTES_THORAX = r"^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth) rib\.[lr]$"

# Groupes : objets à importer (motif sur le nom Z-Anatomy), repères du recalage local, rendu
GROUPES = [
    {"id": "poumons", "motif": r"^((Superior|Middle|Inferior) lobe of (right|left) lung|Pleura)$",
     "reperes": [r"^Trachea$", COTES_THORAX], "rendu": "enveloppe"},
    {"id": "cervelet", "reperes": [ENCEPHALE_COMMUN], "remplace": r"^((right|left) )?cerebellum$", "motif": (
        r"^(Anterior quadrangular lobule|Biventral lobule|Central lobule|Culmen|Declive|Flocculus|Folium of vermis|"
        r"Gracile lobule|Inferior semilunar lobule|Lingula of cerebellum|Nodule of vermis|Peduncle of flocculus|"
        r"Posterior quadrangular lobule|Pyramis of vermis|Superior cerebellar peduncle|Superior semilunar lobule|"
        r"Tonsil of cerebellum|Tuber of vermis|Uvula of vermis|Wing of central lobule)" + COTES + "$")},
    {"id": "encephale", "reperes": [ENCEPHALE_COMMUN], "motif": (
        r"^( ?Posterior transverse collateral sulcus|Anterior occipital sulcus\*|Calcarine sulcus|Central sulcus|"
        r"Cingulate gyrus and sulcus \(.*\)|Cingulate sulcus \(Marginal part\*\)|Circular sulcus of insula|"
        r"Collateral sulcus|Cuneus|Inferior frontal sulcus|Inferior occipital gyrus and sulcus\*|Inferior temporal sulcus|"
        r"Intraparietal sulcus|Lat_Fis-ant-Horizont|Lat_Fis-ant-Vertical|Lat_Fis-post|"
        r"Lateral occipital gyrus \(Middle occipital gyrus\*\)|Lateral occipitotemporal gyrus|Lingual gyrus|Lunate sulcus|"
        r"Medial occipitotemporal gyrus \(Parahippocampal\*\)|Occipital pole|Occipitotemporal sulcus \(Lateral part\*\)|"
        r"Olfactory sulcus|Opercular part of inferior frontal gyrus|Orbital gyri( \(Frontomarginal gyrus and sulcus\*\))?|"
        r"Orbital part of  ?inferior frontal gyrus|Orbital sulci \(.*\)|Paracentral gyrus and sulcus\*|Paracentral sulcus|"
        r"Parieto-occipital sulcus|Postcentral sulcus|Precentral sulcus \(.*\)\*|Precuneus|Straight gyrus \(Gyrus rectus\)|"
        r"Subparietal sulcus|Sulcus interm_prim-Jensen|Superior frontal sulcus|Superior occipital gyri|"
        r"Superior temporal gyrus \(Lateral part\)|Superior temporal sulcus|Temporal plane|Temporal pole|"
        r"Transverse frontopolar gyrus and sulcus\*|Transverse occipital sulcus|Transverse temporal gyri|"
        r"Triangular part of inferior frontal gyrus|Amygdaloid body|Septal nuclei|Mamillary body|Red nucleus|Olive|"
        r"Pyramid of medulla oblongata|Base of peduncle|Vestibular nuclei|Posterior cochlear nucleus|Fornix|"
        r"Hippocampal commissure|Septum pellucidum|Stria medullaris thalami|Choroid plexus|Falx cerebri|"
        r"Motor root of trigeminal nerve|Sensory root of trigeminal nerve|Cochlear nerve)" + COTES + "$")},
    {"id": "moelle", "reperes": [COTES_THORAX, r"^Hip bone\.[lr]$", r"^Sacrum$", r"^(Atlas \(C1\)|Axis \(C2\))$"],
     "motif": r"^(Spinal dura|Spinal ganglion|Ganglia of sympathetic trunk)" + COTES + "$", "enveloppes": r"dura"},
    {"id": "yeux", "reperes": [r"^(Cornea|Iris|Lens|Sclera|Vitreous body)\.[lr]$"],
     "motif": r"^(Retina|Ampulla of lacrimal canaliculus)" + COTES + "$"},
    {"id": "oreilles", "reperes": [r"^Temporal bone\.[lr]$"],
     "motif": r"^(Tympanic membrane|Vestibule|Cochlea|Auditory tube)" + COTES + "$"},
    {"id": "pharynx", "reperes": [r"^(Tongue|Epiglottis)$", r"^(Sublingual|Submandibular) gland\.[lr]$", r"^Mandible$",
                                  r"^Hyoid bone$"],
     "motif": r"^(Nasopharynx|Oropharynx|Laryngopharynx|Soft palate|Uvula of palate|Mucosa of nasal cavity|Parotid gland|"
              r"Palatine tonsil)" + COTES + "$"},
    {"id": "endocrines", "reperes": [r"^(Trachea|Epiglottis)$", r"^Hyoid bone$", r"^(Hypothalamus|Optic chiasm(\.[lr])?)$",
                                     r"^Sphenoid bone$"],
     "motif": r"^(Thyroid gland|Adenohypophysis|Neurohypophysis)$"},
    {"id": "abdomen", "reperes": [r"^(Stomach|Duodenum|Pancreas|Gallbladder|Ascending colon|Transverse colon|"
                                  r"Descending colon)$", r"^Kidney\.[lr]$"],
     "motif": r"^(Greater omentum|Lesser omentum|Renal pelvis\.[lr]|Sigmoid colon)$", "enveloppes": r"omentum"},
    # Os absents de BodyParts3D : calque des os (modeles/zanatomy_os.glb), légendés par legendes_squelette.py.
    # Osselets recalés côté par côté sur leur os temporal : quelques millimètres d'écart les sortiraient de la caisse
    {"id": "coccyx", "systeme": "os", "motif": r"^Coccyx$", "reperes": [r"^Sacrum$", r"^Hip bone\.[lr]$"]},
    {"id": "osselets-droits", "systeme": "os", "motif": r"^(Malleus|Incus|Stapes)\.r$", "reperes": [r"^Temporal bone\.r$"]},
    {"id": "osselets-gauches", "systeme": "os", "motif": r"^(Malleus|Incus|Stapes)\.l$", "reperes": [r"^Temporal bone\.l$"]},
    # Muscles absents de BodyParts3D : calque des muscles (modeles/zanatomy_muscles.glb). Seuls les corps
    # musculaires (.l, .r) : .ol, .el, .o1l... sont les zones d'insertion. Trapèze : BodyParts3D n'a que la
    # partie transverse ; long du cou : seulement le côté gauche (le droit est importé, le gauche écarté en doublon)
    {"id": "muscles-tete", "systeme": "muscles",
     "motif": r"^((Superficial|Deep) part of masseter|Temporalis muscle|(Superior|Inferior) head of lateral pterygoid "
              r"muscle|Medial pterygoid muscle)\.[lr]$",
     "reperes": [r"^(Mandible|Sphenoid bone|Frontal bone|Occipital bone)$",
                 r"^(Temporal bone|Zygomatic bone|Maxilla|Parietal bone)\.[lr]$"]},
    {"id": "muscles-cou", "systeme": "muscles", "motif": r"^Longus colli muscle\.[lr]$",
     "reperes": [r"^(Atlas \(C1\)|Axis \(C2\)|Occipital bone)$", r"^(First|Second) rib\.[lr]$"]},
    {"id": "muscles-abdomen", "systeme": "muscles",
     "motif": r"^(Rectus abdominis muscle|Internal abdominal oblique muscle|Transversus abdominis muscle|"
              r"Quadratus lumborum muscle|Pyramidalis muscle)\.[lr]$",
     # Recalés sur l'oblique externe, présent dans les deux modèles : sur les côtes seules, l'oblique interne
     # perçait par endroits l'oblique externe de BodyParts3D
     "reperes": [r"^External abdominal oblique muscle\.[lr]$"]},
    {"id": "muscles-dos", "systeme": "muscles",
     "motif": r"^(Latissimus dorsi muscle|(Descending|Ascending) part of trapezius muscle)\.[lr]$",
     "reperes": [r"^Transverse part of trapezius muscle\.[lr]$", COTES_THORAX, r"^(Scapula|Clavicle|Humerus)\.[lr]$"]},
    {"id": "lymphatiques", "reperes": "os", "rendu": "lymphatique",
     # Nœuds lymphatiques ; pas les nœuds sinu-atrial et atrio-ventriculaire du cœur
     "motif": r"^\(?(?!Sinu|Atrioventricular)[A-Z].*(nodes?|Node)\)?" + COTES + "$"},
]
# Légendes portées par un organe de BodyParts3D : noms BodyParts3D du porteur (cible du recalage et de la pose)
PORTEURS_BP3D = {
    "Liver": [r"^hepatovenous segment (ii|iii|iv|v|vi|vii|viii|ix)$", r"^caudate lobe of liver$"],
    "Pancreas": [r"^(pancreas|parenchyma of pancreas)$"], "Spleen": [r"^spleen$"], "Stomach": [r"^stomach$"],
    "Gallbladder": [r"^gallbladder$"], "Urinary bladder": [r"^urinary bladder$"],
    "Kidney": [r"^{cote}kidney$"], "Testis": [r"^{cote}testis$"], "Suprarenal gland": [r"^{cote}adrenal gland$"],
    "Iris": [r"^{cote}iris$"], "Cornea": [r"^{cote}cornea$"], "Sclera": [r"^{cote}sclera$"],
    "Medulla oblongata": [r"^medulla oblongata$"],
}
# Repères calculés sur BodyParts3D là où Z-Anatomy ne légende rien (cœur, langue, prostate) :
# (nom anglais, porteur, méthode, paramètre). « extrême » : sommet le plus avancé dans une direction
# (repère BodyParts3D : gauche du sujet +X, avant -Y, haut +Z) ; « proche » : sommet du porteur le plus
# proche du milieu d'un vaisseau (le sillon interventriculaire antérieur est celui de l'IVA).
REPERES_CALCULES = [
    ("apex of heart", r"^wall of ventricle$", "extreme", (1, -1, -1)),
    ("sternocostal surface of heart", r"^wall of ventricle$", "extreme", (0, -1, 0.2)),
    ("diaphragmatic surface of heart", r"^wall of ventricle$", "extreme", (0, 0.2, -1)),
    ("pulmonary surface of heart", r"^wall of ventricle$", "extreme", (1, 0, 0)),
    ("right border of heart", r"^wall of right atrium$", "extreme", (-1, 0, 0)),
    ("anterior interventricular sulcus", r"^wall of ventricle$", "proche", r"^trunk of anterior interventricular branch"),
    ("posterior interventricular sulcus", r"^wall of ventricle$", "proche",
     r"^posterior interventricular branch of right coronary artery$"),
    ("coronary sulcus", r"^wall of (ventricle|right atrium)$", "proche", r"^trunk of right coronary artery$"),
    ("apex of tongue", r"^tongue$", "extreme", (0, -1, 0)),
    ("dorsum of tongue", r"^tongue$", "extreme", (0, 0, 1)),
    ("root of tongue", r"^tongue$", "extreme", (0, 1, -0.6)),
    ("base of prostate", r"^prostate$", "extreme", (0, 0, 1)),
    ("apex of prostate", r"^prostate$", "extreme", (0, 0, -1)),
]
# Les légendes de Z-Anatomy ne sont posées que du côté droit : on les reporte en miroir du côté gauche
PORTEURS_BILATERAUX = {"Kidney", "Testis", "Suprarenal gland", "Iris", "Cornea", "Sclera", "Vestibule", "Cochlea"}
# Régions osseuses du recalage des nœuds lymphatiques (objets dispersés dans tout le corps)
REGIONS_OS = {
    "tête et cou": r"^(Frontal bone|Parietal bone\.[lr]|Occipital bone|Temporal bone\.[lr]|Sphenoid bone|Mandible|"
                   r"Maxilla\.[lr]|Zygomatic bone\.[lr]|Hyoid bone|Atlas \(C1\)|Axis \(C2\))$",
    "thorax": COTES_THORAX,
    "membre supérieur droit": r"^(Scapula|Clavicle|Humerus|Radius|Ulna)\.r$",
    "membre supérieur gauche": r"^(Scapula|Clavicle|Humerus|Radius|Ulna)\.l$",
    "bassin": r"^(Hip bone\.[lr]|Sacrum)$",
    "membre inférieur droit": r"^(Femur|Patella|Tibia|Fibula)\.r$",
    "membre inférieur gauche": r"^(Femur|Patella|Tibia|Fibula)\.l$",
}


# ---------------------------------------------------------------- BodyParts3D

def charger_index():
    with open(MODELES / "index_maillages.csv", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def charger_bp3d(fjs):
    """Sommets (mm, repère BodyParts3D) des fichiers FJ demandés."""
    res = {}
    with zipfile.ZipFile(ARCHIVE_BP3D) as z:
        for chemin in z.namelist():
            fj = Path(chemin).stem
            if fj in fjs:
                _, sommets, _, _ = lire_obj(z.read(chemin).decode("ascii", "replace"))
                res[fj] = sommets
    return res


# ---------------------------------------------------------------- Z-Anatomy

def nom_en(objet):
    """'Cingulate gyrus and sulcus (Middle anterior part).l' -> 'cingulate gyrus and sulcus (middle anterior part)'."""
    base = re.sub(r"\.[lr]$", "", objet).replace("*", "").strip()
    return re.sub(r"\s+", " ", base).lower()


def cote_de(objet):
    return {"l": "gauche", "r": "droit"}.get(objet[-1]) if re.search(r"\.[lr]$", objet) else None


def exporter(blender, blend, objets, reexporter):
    """Géométrie des objets (cache) : {nom: (sommets m, faces, miroir)}."""
    demandes, npz = CACHE / "demandes_organes.json", CACHE / "export_organes.npz"
    voulu = sorted(objets)
    if reexporter or not npz.exists() or not demandes.exists() \
            or json.loads(demandes.read_text(encoding="utf-8")).get("objets") != voulu:
        demandes.write_text(json.dumps({"objets": voulu}, ensure_ascii=False), encoding="utf-8")
        lancer_blender(blender, blend, "export", demandes, npz)
    d = np.load(npz)
    miroirs = set(map(str, d["miroirs"])) if "miroirs" in d.files else set()
    return {str(d[f"nom{k}"]): (d[f"s{k}"], d[f"t{k}"], str(d[f"nom{k}"]) in miroirs)
            for k in range(len(d.files) // 3)}


def legendes_brutes(blender, blend, reexporter):
    sortie, npz = CACHE / "legendes.json", CACHE / "legendes_sommets.npz"
    if reexporter or not sortie.exists() or not npz.exists():
        lancer_blender(blender, blend, "legendes", sortie, npz)
    d = np.load(npz)
    # Numérotation à trous : un porteur sans géométrie n'a pas d'entrée
    porteurs = {str(d[k]): d["s" + k[3:]] for k in d.files if k.startswith("nom")}
    return json.loads(sortie.read_text(encoding="utf-8")), porteurs


# ---------------------------------------------------------------- recalage

# Muscles présents dans les deux modèles sous des noms différents, repères des groupes de muscles
ALIAS_REPERES = {"External abdominal oblique muscle": "{cote}external oblique",
                 "Transverse part of trapezius muscle": "transverse part of {cote}trapezius"}


def nom_repere(objet):
    """Nom BodyParts3D d'un objet Z-Anatomy, alias compris : 'External abdominal oblique muscle.l' -> 'left external oblique'."""
    base = re.sub(r"\.[lr]$", "", objet)
    if base in ALIAS_REPERES:
        return ALIAS_REPERES[base].replace("{cote}", {"l": "left ", "r": "right "}.get(objet[-1], "")
                                           if re.search(r"\.[lr]$", objet) else "")
    return nom_bp3d(objet)


def appariements(motifs, objets_za, index_noms):
    """Paires (objet Z-Anatomy, nom BodyParts3D) dont le nom correspond à l'un des motifs."""
    regex = [re.compile(m) for m in motifs]
    return [(o, nom_repere(o)) for o in objets_za if any(r.search(o) for r in regex)
            and nom_repere(o) in index_noms]


def transformation_locale(paires, geo_za, geo_bp3d, fj_par_nom, globale):
    """ICP des repères (Z-Anatomy recalé globalement) sur leurs homologues BodyParts3D."""
    paires = [(o, n) for o, n in paires if o in geo_za and any(fj in geo_bp3d for fj in fj_par_nom[n])]
    if not paires:
        return np.eye(3), np.zeros(3), None
    source = np.concatenate([globale(geo_za[o][0] * 1000) for o, _ in paires])
    cible = np.concatenate([geo_bp3d[fj] for _, n in paires for fj in fj_par_nom[n] if fj in geo_bp3d])
    r, t, avant, apres = icp(source, cible)
    if apres >= avant:  # l'ICP n'améliore rien : similitude globale seule
        return np.eye(3), np.zeros(3), {"reperes": len(paires), "avant_mm": round(avant, 2), "apres_mm": round(avant, 2),
                                        "transformation": "similitude globale"}
    return r, t, {"reperes": len(paires), "avant_mm": round(avant, 2), "apres_mm": round(apres, 2),
                  "transformation": "ICP local"}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    reexporter = "--reexporter" in sys.argv
    blender, blend = trouver_blender(), preparer_blend()
    index = charger_index()
    index_noms = {l["nom_en"].lower() for l in index}
    fj_par_nom = defaultdict(list)
    for l in index:
        fj_par_nom[l["nom_en"].lower()].append(l["fj"])
    objets_za = [o for o in (DERIVE / "zanatomy_objets.txt").read_text(encoding="utf-8").split("\n") if o]

    # Objets demandés par groupe, et repères des recalages locaux
    choix = {}
    for g in GROUPES:
        motif = re.compile(g["motif"])
        for o in objets_za:
            if motif.search(o) and nom_bp3d(o) not in index_noms and o not in choix:
                choix[o] = g["id"]
    reperes = {g["id"]: appariements(g["reperes"], objets_za, index_noms) for g in GROUPES if g["reperes"] != "os"}
    reperes_os = {r: appariements([m], objets_za, index_noms) for r, m in REGIONS_OS.items()}
    tous_os = appariements([m for m in REGIONS_OS.values()], objets_za, index_noms)

    legendes, sommets_porteurs = legendes_brutes(blender, blend, reexporter)
    a_exporter = set(choix) | {o for p in reperes.values() for o, _ in p} | {o for p in reperes_os.values() for o, _ in p}
    # Porteurs des légendes et leur homologue gauche (report en miroir)
    for leg in legendes:
        a_exporter.add(leg["porteur"])
        if leg["porteur"].endswith(".r"):
            a_exporter.add(leg["porteur"][:-2] + ".l")
    a_exporter &= set(objets_za)
    geo_za = exporter(blender, blend, a_exporter, reexporter)
    manquants = sorted(set(choix) - set(geo_za))
    if manquants:
        journal("WARN", f"{len(manquants)} objets sans géométrie dans Z-Anatomy, ignorés : {', '.join(manquants[:8])}...")

    # BodyParts3D : os pour la similitude globale, repères, porteurs, organes voisins pour les doublons
    autres = [l for l in index if l["systeme"] == "autres"]
    # Doublons cherchés parmi les organes et les muscles de BodyParts3D
    voisins = [l for l in index if l["systeme"] in ("autres", "muscles")]
    fjs = {fj for p in [*reperes.values(), tous_os] for _, n in p for fj in fj_par_nom[n]}
    fjs |= {l["fj"] for l in voisins} | {l["fj"] for l in index if l["systeme"] == "os"}
    vaisseaux_reperes = [re.compile(v) for _, _, methode, v in REPERES_CALCULES if methode == "proche"]
    fjs |= {l["fj"] for l in index if any(v.search(l["nom_en"]) for v in vaisseaux_reperes)}
    geo_bp3d = charger_bp3d(fjs)
    bornes = json.loads((DERIVE / "zanatomy_bornes.json").read_text(encoding="utf-8"))
    bp3d_os = defaultdict(lambda: {"systeme": "os", "sommets": []})
    for l in index:
        if l["systeme"] == "os" and l["fj"] in geo_bp3d:
            bp3d_os[l["nom_en"].lower()]["sommets"].append(geo_bp3d[l["fj"]])
    bp3d_os = {k: {"systeme": "os", "sommets": np.concatenate(v["sommets"])} for k, v in bp3d_os.items()}
    globale, resume_global = recalage_global(bornes, bp3d_os)

    # Transformations : une par groupe ; pour les nœuds lymphatiques, une par région osseuse
    transformations, bilan = {}, {"global": resume_global, "groupes": {}, "regions_os": {}}
    for g in GROUPES:
        if g["reperes"] == "os":
            continue
        r, t, info = transformation_locale(reperes[g["id"]], geo_za, geo_bp3d, fj_par_nom, globale)
        transformations[g["id"]] = (r, t)
        bilan["groupes"][g["id"]] = info
        if info:
            journal("OK", f"{g['id']} : {info['reperes']} repères, écart médian {info['avant_mm']} -> "
                    f"{info['apres_mm']} mm ({info['transformation']}).")
    boites_os = {}
    for region, paires in reperes_os.items():
        r, t, info = transformation_locale(paires, geo_za, geo_bp3d, fj_par_nom, globale)
        transformations[f"os:{region}"] = (r, t)
        bilan["regions_os"][region] = info
        if paires:
            pts = np.concatenate([geo_za[o][0] for o, _ in paires if o in geo_za])
            boites_os[region] = (pts.min(axis=0) - 0.05, pts.max(axis=0) + 0.05)

    def transformation_de(objet):
        groupe = choix.get(objet)
        if groupe and groupe != "lymphatiques":
            return transformations[groupe], groupe
        centre = geo_za[objet][0].mean(axis=0)
        dedans = [(np.prod(hi - lo), reg) for reg, (lo, hi) in boites_os.items() if (centre >= lo).all() and (centre <= hi).all()]
        if dedans:
            reg = min(dedans)[1]
            return transformations[f"os:{reg}"], f"os:{reg}"
        return (np.eye(3), np.zeros(3)), "similitude globale"

    def placer(objet, points_m=None):
        (r, t), _ = transformation_de(objet)
        p = geo_za[objet][0] if points_m is None else points_m
        return globale(p * 1000) @ r.T + t  # mm, repère BodyParts3D

    # Doublons : recouvrement des objets candidats avec les organes de BodyParts3D
    autres_fj = [l["fj"] for l in voisins if l["fj"] in geo_bp3d]
    pts_bp3d = np.concatenate([geo_bp3d[fj] for fj in autres_fj])
    etiq_bp3d = np.concatenate([np.full(len(geo_bp3d[fj]), i) for i, fj in enumerate(autres_fj)])
    arbre_bp3d = cKDTree(pts_bp3d)
    places = {o: placer(o) for o in choix if o in geo_za}
    recouvre = {}  # objet -> (part recouverte, maillage BodyParts3D le plus recouvert)
    for o, p in places.items():
        ech = p[np.random.default_rng(0).choice(len(p), min(len(p), 3000), replace=False)]
        d, i = arbre_bp3d.query(ech, distance_upper_bound=SEUIL_RECOUVREMENT_MM)
        proches = d <= SEUIL_RECOUVREMENT_MM
        part = float(proches.mean())
        cible = autres_fj[Counter(etiq_bp3d[i[proches]]).most_common(1)[0][0]] if proches.any() else None
        recouvre[o] = (part, cible)
    candidats_par_fj = defaultdict(list)
    for o, (part, cible) in recouvre.items():
        if part >= PART_DOUBLON and cible:
            candidats_par_fj[cible].append(o)
    doublons_bp3d, ecartes = [], {}
    for fj, objets in candidats_par_fj.items():
        couverture = 0.0
        if len(objets) >= 2:
            arbre = cKDTree(np.concatenate([places[o] for o in objets]))
            d, _ = arbre.query(geo_bp3d[fj], distance_upper_bound=SEUIL_RECOUVREMENT_MM)
            couverture = float((d <= SEUIL_RECOUVREMENT_MM).mean())
        if len(objets) >= 2 and couverture >= PART_REMPLACE:
            doublons_bp3d.append(fj)  # découpé plus finement par Z-Anatomy : BodyParts3D remplacé
        else:
            for o in objets:
                ecartes[o] = fj
    # Remplacements déclarés : maillage BodyParts3D d'un seul tenant, découpé par Z-Anatomy en parties
    # qui le recouvrent à 2 ou 3 mm près (lobules du cervelet), sous le seuil automatique
    for g in GROUPES:
        if not g.get("remplace"):
            continue
        motif = re.compile(g["remplace"])
        objets_g = [o for o in places if choix.get(o) == g["id"]]
        for l in autres:
            if motif.search(l["nom_en"]) and l["fj"] not in doublons_bp3d:
                doublons_bp3d.append(l["fj"])
                candidats_par_fj[l["fj"]] = objets_g
                for o in objets_g:
                    ecartes.pop(o, None)
    retenus = sorted(o for o in places if o not in ecartes)
    nom_fj = {l["fj"]: l["nom_en"] for l in index}
    journal("OK", f"{len(retenus)} objets retenus sur {len(places)} ; {len(ecartes)} déjà présents dans BodyParts3D ; "
            f"{len(doublons_bp3d)} maillages BodyParts3D remplacés par des parties plus fines.")
    for fj in doublons_bp3d:
        journal("OK", f"Remplacé : {nom_fj[fj]} ({fj}) par {len(candidats_par_fj[fj])} parties de Z-Anatomy.")

    # Écriture des GLB : organes (calque « autres ») et os absents de BodyParts3D (calque des os)
    ecrivains = {"autres": EcrivainGLB("autres"), "os": EcrivainGLB("os"), "muscles": EcrivainGLB("muscles")}
    fichiers_glb = {"autres": "zanatomy_organes.glb", "os": "zanatomy_os.glb", "muscles": "zanatomy_muscles.glb"}
    lignes, retournes = [], 0
    groupe_de = {g["id"]: g for g in GROUPES}
    for o in retenus:
        sommets_mm, faces, miroir = places[o], geo_za[o][1], geo_za[o][2]
        if miroir:
            faces, retournes = faces[:, [0, 2, 1]], retournes + 1
        positions = sommets_mm @ ROTATION.T * ECHELLE
        normales = normales_calculees(positions, faces.astype(np.int64))
        normales /= np.maximum(np.linalg.norm(normales, axis=1, keepdims=True), 1e-12)
        g = groupe_de[choix[o]]
        rendu = g.get("rendu", "")
        if g.get("enveloppes") and re.search(g["enveloppes"], o, re.I):
            rendu = "enveloppe"
        (_, _), transfo = transformation_de(o)
        systeme = g.get("systeme", "autres")
        extras = {"nom_en": nom_en(o), "systeme": systeme, "groupe": g["id"], "rendu": rendu,
                  "source": "Z-Anatomy (CC BY-SA 4.0)"}
        ecrivains[systeme].ajouter(o, positions, normales, faces, extras)
        c = positions.mean(axis=0)
        lignes.append({"objet": o, "groupe": g["id"], "systeme": systeme, "nom_en": nom_en(o), "cote": cote_de(o) or "",
                       "rendu": rendu, "transformation": transfo, "recouvrement_bp3d": f"{recouvre[o][0]:.2f}",
                       "sommets": len(positions), "triangles": len(faces),
                       "centre_x": f"{c[0]:.4f}", "centre_y": f"{c[1]:.4f}", "centre_z": f"{c[2]:.4f}"})
    for systeme, ecrivain in ecrivains.items():
        ecrivain.gltf["asset"]["copyright"] = "Z-Anatomy, CC BY-SA 4.0 ; d'après BodyParts3D, DBCLS, CC BY 4.0"
        chemin = MODELES / fichiers_glb[systeme]
        ecrivain.ecrire(chemin)
        if "--compresser" in sys.argv:
            compresser(chemin)
        n = sum(l["systeme"] == systeme for l in lignes)
        journal("OK", f"{chemin.name} : {n} objets, {chemin.stat().st_size / 1e6:.1f} Mo.")
    journal("OK", f"{retournes} copies en miroir réorientées.")
    with open(MODELES / "index_zanatomy_organes.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(lignes[0]), delimiter=";")
        w.writeheader()
        w.writerows(lignes)
    # Os importés : sommets placés (mm, repère BodyParts3D), pour que legendes_squelette.py pose leurs
    # légendes exactement sur la surface affichée
    os_importes = [l["objet"] for l in lignes if l["systeme"] == "os"]
    np.savez(CACHE / "os_importes.npz", **{f"nom{k}": o for k, o in enumerate(os_importes)},
             **{f"s{k}": places[o] for k, o in enumerate(os_importes)})

    # Légendes : pointe recalée avec son porteur, puis posée sur la surface affichée
    surfaces = {}  # porteur -> (arbre, sommets mm, clés de nœud par sommet)

    def surface(porteur):
        if porteur in surfaces:
            return surfaces[porteur]
        base, cote = re.sub(r"\.[lr]$", "", porteur), cote_de(porteur)
        cles, pts = [], []
        if base in PORTEURS_BP3D:
            prefixe = {"droit": "right ", "gauche": "left "}.get(cote, "")
            motifs = [re.compile(m.replace("{cote}", prefixe)) for m in PORTEURS_BP3D[base]]
            for l in autres:
                if any(m.search(l["nom_en"]) for m in motifs) and l["fj"] in geo_bp3d:
                    cles.append(np.full(len(geo_bp3d[l["fj"]]), l["fj"], dtype=object))
                    pts.append(geo_bp3d[l["fj"]])
        elif porteur in retenus:
            cles.append(np.full(len(places[porteur]), porteur, dtype=object))
            pts.append(places[porteur])
        if not pts:
            surfaces[porteur] = None
            return None
        p = np.concatenate(pts)
        surfaces[porteur] = (cKDTree(p), p, np.concatenate(cles))
        return surfaces[porteur]

    recalages = {}

    def recalage_porteur(porteur):
        if porteur not in recalages:
            recalages[porteur] = calculer_recalage_porteur(porteur)
        return recalages[porteur]

    def calculer_recalage_porteur(porteur):
        """Porteur présent dans BodyParts3D : ICP du porteur lui-même ; sinon transformation de son groupe."""
        s = surface(porteur)
        if porteur in geo_za and s is not None and porteur not in retenus:
            source = globale(geo_za[porteur][0] * 1000)
            r, t, avant, apres = icp(source, s[1])
            if apres < avant:
                return lambda p: globale(p * 1000) @ r.T + t
        if porteur in choix:
            return lambda p: placer(porteur, p)
        return lambda p: globale(p * 1000)

    sorties, ecartees = [], []
    for leg in legendes:
        nom = re.sub(r"\.(t|s)$", "", leg["objet"])
        # « (Pyramidal lobe) » : structure inconstante ; « Apical segment of right lung (SI) » garde sa parenthèse
        inconstant = nom.startswith("(") and nom.endswith(")")
        nom = (nom[1:-1] if inconstant else nom).replace("*", "").strip()
        texte = np.array(leg["position_texte"])
        ext = np.array(leg["extremites"])
        # Sommet accroché à l'organe ; à défaut, l'extrémité la plus éloignée du texte
        pointe = ext[leg["pointe"]] if leg.get("pointe") is not None else ext[np.argmax(np.linalg.norm(ext - texte, axis=1))]
        cas = [(leg["porteur"], pointe)]
        base = re.sub(r"\.[lr]$", "", leg["porteur"])
        if leg["porteur"].endswith(".r") and base in PORTEURS_BILATERAUX:
            cas.append((base + ".l", pointe * np.array([-1, 1, 1])))  # miroir : droite du sujet vers -X
        for porteur, p in cas:
            s = surface(porteur)
            if s is None:
                ecartees.append(f"{nom} ({porteur} : porteur absent)")
                continue
            q = recalage_porteur(porteur)(p[None, :])[0]
            d, i = s[0].query(q)
            if d > SEUIL_LEGENDE_MM:
                ecartees.append(f"{nom} ({porteur} : {d:.0f} mm de la surface)")
                continue
            pos = s[1][i] @ ROTATION.T * ECHELLE
            sorties.append({"nom_en": nom.lower(), "inconstant": inconstant, "cle": str(s[2][i]),
                            "cote": cote_de(porteur), "porteur": porteur, "ecart_mm": round(float(d), 1),
                            "p": [round(float(v), 4) for v in pos]})
    # Repères calculés : posés sur un sommet du porteur, donc sur la surface affichée
    calcules = 0
    for nom, porteur, methode, param in REPERES_CALCULES:
        cible = [l for l in autres if re.search(porteur, l["nom_en"]) and l["fj"] in geo_bp3d]
        if not cible:
            ecartees.append(f"{nom} (calculé : porteur {porteur} absent)")
            continue
        pts = np.concatenate([geo_bp3d[l["fj"]] for l in cible])
        cles = np.concatenate([np.full(len(geo_bp3d[l["fj"]]), l["fj"], dtype=object) for l in cible])
        if methode == "extreme":
            i = int(np.argmax(pts @ (np.array(param, float) / np.linalg.norm(param))))
        else:
            vaisseau = [l for l in index if re.search(param, l["nom_en"]) and l["fj"] in geo_bp3d]
            if not vaisseau:
                ecartees.append(f"{nom} (calculé : vaisseau {param} absent)")
                continue
            v = np.concatenate([geo_bp3d[l["fj"]] for l in vaisseau])
            milieu = v[np.argmin(np.linalg.norm(v - v.mean(axis=0), axis=1))]
            i = int(np.argmin(np.linalg.norm(pts - milieu, axis=1)))
        sorties.append({"nom_en": nom, "inconstant": False, "cle": str(cles[i]), "cote": None, "porteur": "calculé",
                        "ecart_mm": 0.0, "p": [round(float(x), 4) for x in pts[i] @ ROTATION.T * ECHELLE],
                        "calcule": True})
        calcules += 1
    journal("OK", f"{len(sorties)} légendes posées sur les organes ({len(legendes)} dans Z-Anatomy, reports en miroir "
            f"compris, et {calcules} repères calculés sur BodyParts3D).")
    if ecartees:
        journal("WARN", f"{len(ecartees)} légendes écartées : {'; '.join(ecartees[:10])}.")

    SORTIE_JSON.write_text(json.dumps({
        "doublons_bp3d": sorted(doublons_bp3d), "deja_presents": ecartes, "legendes": sorties,
        "legendes_ecartees": ecartees, "bilan": bilan,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    # Rapport
    lignes_md = ["# Recalage des organes de Z-Anatomy", "",
                 "Fichier généré par pipeline/organes_zanatomy.py, ne pas éditer à la main.", "",
                 f"Similitude globale sur {resume_global['os_retenus']} os : écart médian "
                 f"{resume_global['ecart_median_tous_os_mm']:.1f} mm. Recalage local par groupe ensuite :", "",
                 "| Groupe | Repères | Écart médian avant (mm) | Après (mm) | Transformation |", "| --- | --- | --- | --- | --- |"]
    for gid, info in {**bilan["groupes"], **{f"os : {k}": v for k, v in bilan["regions_os"].items()}}.items():
        if info:
            lignes_md.append(f"| {gid} | {info['reperes']} | {info['avant_mm']} | {info['apres_mm']} | {info['transformation']} |")
    compte = Counter(l["groupe"] for l in lignes)
    lignes_md += ["", f"**{len(lignes)} objets importés** : " + ", ".join(f"{k} {v}" for k, v in sorted(compte.items())) + ".",
                  "", f"**{len(ecartes)} objets écartés**, déjà présents dans BodyParts3D (60 % de leur surface à moins de 2 mm) :",
                  ""]
    lignes_md += [f"- {o} : {nom_fj[fj]}" for o, fj in sorted(ecartes.items())]
    lignes_md += ["", f"**{len(doublons_bp3d)} maillages BodyParts3D remplacés** par des parties plus fines :", ""]
    lignes_md += [f"- {nom_fj[fj]} ({fj}) : {', '.join(sorted(candidats_par_fj[fj]))}" for fj in sorted(doublons_bp3d)]
    lignes_md += ["", f"**{len(sorties)} légendes posées** ; écart de pose médian "
                  f"{np.median([s['ecart_mm'] for s in sorties]):.1f} mm, maximal {max(s['ecart_mm'] for s in sorties):.1f} mm.", ""]
    if ecartees:
        lignes_md += ["Légendes écartées :", ""] + [f"- {e}" for e in ecartees]
    RAPPORT.write_text("\n".join(lignes_md) + "\n", encoding="utf-8")
    journal("OK", f"Rapport : {RAPPORT.relative_to(RACINE)}.")


if __name__ == "__main__":
    main()
