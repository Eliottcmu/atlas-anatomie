"""Familles d'affichage : ce que le panneau « Choisir » d'un calque propose de montrer ou de cacher.

Un calque (organes, nerfs, lymphatique) se découpe en familles (appareil digestif, nerfs crâniens...),
chacune faite d'éléments (foie, rein, nerf médian...) qui portent leurs maillages. Chaque maillage
appartient à un seul élément, pour qu'une case cochée ou décochée ait un effet sans ambiguïté.

Organes : les familles reprennent les groupes du catalogue de focus (pipeline/focus.py), un élément par
organe du catalogue. Ce que BodyParts3D range parmi les organes sans être un organe (peau, disques,
ligaments, sternum) va dans des familles à part : la peau, qui recouvre tout, est cachée par défaut.

Utilisé par pipeline/construire_atlas.py.
"""

import re

# Familles du calque des organes : (id, nom, groupes du catalogue, cachée par défaut)
FAMILLES_ORGANES = [
    ("cardiorespiratoire", "Cœur et appareil respiratoire", ["Cardiorespiratoire"], False),
    ("digestif", "Appareil digestif", ["Digestif"], False),
    ("urinaire-genital", "Appareil urinaire et génital", ["Urinaire et génital"], False),
    ("tete-cou", "Tête et cou", ["Tête et cou"], False),
    ("nerveux", "Système nerveux central", ["Nerveux"], False),
    ("endocrine-sens", "Glandes endocrines et organes des sens", ["Endocrine et sens"], False),
    ("soutien", "Cartilages, disques et ligaments", [], False),
    ("peau", "Peau et phanères", [], True),
    ("divers", "Divers", [], False),
]
# Maillages hors des organes du catalogue : (famille, élément, nom de l'élément, motif sur le nom anglais
# sans côté). Un nom None rattache les maillages à l'élément du catalogue de même id (yeux, encéphale).
ELEMENTS_HORS_CATALOGUE = [
    ("peau", "peau", "Peau", r"^skin$"),
    ("peau", "phaneres", "Cheveux, sourcils et poils", r"^(hair of head|pubic hair|eyebrow)$"),
    ("tete-cou", "levres", "Lèvres", r"^lip$"),
    ("endocrine-sens", "yeux", None, r"^(anterior chamber of eyeball|corona ciliaris)$"),
    ("nerveux", "encephale", None, r"superior temporal gyrus|brachium of (inferior|superior) colliculus"),
    ("urinaire-genital", "perinee", "Périnée", r"perineum"),
    ("soutien", "disques", "Disques intervertébraux", r"^intervertebral dis[ck]"),
    ("soutien", "cartilages-costaux", "Cartilages costaux", r"costal cartilage$"),
    ("soutien", "sternum", "Sternum (rangé parmi les organes par BodyParts3D)",
     r"^(body of sternum|manubrium|xiphoid process)$"),
    ("soutien", "ligaments", "Ligaments, tendons, membranes et raphés",
     r"ligament|tendon|membrane|raphe|retinaculum|tract$|linea alba"),
    ("divers", "petits-muscles", "Muscles groupés (rangés parmi les organes par BodyParts3D)",
     r"^set of |part of trapezius$"),
]

# Familles du calque des nerfs : (id, nom, motif sur le nom anglais), dans l'ordre d'essai
FAMILLES_NERFS = [
    ("nerfs-tronc", "Nerfs spinaux, intercostaux et sympathiques", r"intercostal|spinal nerve|sympathetic|cauda equina"),
    ("nerfs-craniens", "Nerfs crâniens et leurs branches",
     r"\((i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\)$|ophthalmic|maxillary|mandibular|buccal nerve|alveolar|lingual nerve|"
     r"mental nerve|mylohyoid|chorda tympani|vestibular nerve|cochlear nerve"),
    ("nerfs-membre-inferieur", "Plexus lombo-sacral et membre inférieur",
     r"femoral|obturator|sciatic|tibial|fibular|sural|saphenous|plantar|gluteal|pudendal|genitofemoral|ilio-?inguinal|"
     r"iliohypogastric|piriformis|quadratus femoris|of foot"),
    ("nerfs-membre-superieur", "Plexus brachial et membre supérieur",
     r"brachial|axillary|radial|median|ulnar|musculocutaneous|antebrachial|pectoral|subscapular|thoracodorsal|"
     r"long thoracic|dorsal scapular|suprascapular|subclavian nerve|of forearm|palmar"),
]


def sans_cote(nom_en):
    return re.sub(r"\b(right|left) ", "", nom_en.lower()).strip()


def familles(noeuds, organes):
    """Familles d'affichage de tous les calques qui en ont : liste de
    {"calque", "id", "nom", "masquee", "elements": [{"id", "nom", "cles"}]}, et les maillages non classés."""
    res = []
    pris = set()

    def famille(calque, id_, nom, masquee=False):
        f = {"calque": calque, "id": f"{calque}:{id_}", "nom": nom, "masquee": masquee, "elements": []}
        res.append(f)
        return f

    def element(f, id_, nom):
        e = next((x for x in f["elements"] if x["id"] == f"{f['calque']}:{id_}"), None)
        if e is None:
            e = {"id": f"{f['calque']}:{id_}", "nom": nom, "cles": []}
            f["elements"].append(e)
        return e

    def ajouter(e, cle):
        if cle not in pris:
            e["cles"].append(cle)
            pris.add(cle)

    utiles = {k for k, n in noeuds.items() if not n.get("doublon")}

    # Organes : un élément par organe du catalogue, dans l'ordre du catalogue. Un maillage de deux organes
    # (le cervelet est aussi dans l'encéphale) va au plus petit, pour qu'on puisse cacher le cervelet seul
    proprietaire = {}
    for o in sorted((o for o in organes if not o.get("os")), key=lambda o: len(o["parties"])):
        for cle in o["parties"]:
            proprietaire.setdefault(cle, o["id"])
    par_id = {}
    for fid, nom, groupes, masquee in FAMILLES_ORGANES:
        f = famille("autres", fid, nom, masquee)
        par_id[fid] = f
        for o in organes:
            if o.get("os") or o["groupe"] not in groupes:
                continue
            e = element(f, o["id"], o["nom"])
            for cle in o["parties"]:
                if cle in utiles and noeuds[cle]["calque"] == "autres" and proprietaire[cle] == o["id"]:
                    ajouter(e, cle)
    for fid, eid, nom, motif in ELEMENTS_HORS_CATALOGUE:
        f = par_id[fid]
        e = element(f, eid, nom or eid)
        m = re.compile(motif)
        for cle, n in noeuds.items():
            if cle in utiles and n["calque"] == "autres" and m.search(sans_cote(n["nom_en"])):
                ajouter(e, cle)
    reste = element(par_id["divers"], "autres-structures", "Autres structures")
    for cle, n in noeuds.items():
        if cle in utiles and n["calque"] == "autres":
            ajouter(reste, cle)

    # Nerfs : un élément par nerf (ses deux côtés ensemble), les nerfs et les troncs avant leurs branches
    fam_nerfs = {fid: famille("nerfs", fid, nom) for fid, nom, _ in FAMILLES_NERFS}
    fam_nerfs["autres-nerfs"] = famille("nerfs", "autres-nerfs", "Autres nerfs")
    motifs = [(fid, re.compile(m)) for fid, _, m in FAMILLES_NERFS]
    principal = re.compile(r"^(nerfs? |tronc|faisceau|racines? du plexus|queue)")
    for cle, n in sorted(noeuds.items(), key=lambda kv: (not principal.search(kv[1]["nom"]), kv[1]["nom"])):
        if cle not in utiles or n["calque"] != "nerfs":
            continue
        base = sans_cote(n["nom_en"])
        fid = next((f for f, m in motifs if m.search(base)), "autres-nerfs")
        ajouter(element(fam_nerfs[fid], re.sub(r"[^a-z0-9]+", "-", base).strip("-"), n["nom"]), cle)

    # Lymphatique : un élément par grande région (organes « Lymphatique » du catalogue)
    f = famille("lymphatique", "noeuds", "Nœuds lymphatiques")
    for o in organes:
        if o["groupe"] == "Lymphatique":
            e = element(f, o["id"], o["nom"])
            for cle in o["parties"]:
                if cle in utiles and noeuds[cle]["calque"] == "lymphatique":
                    ajouter(e, cle)
    reste_lymph = element(f, "autres-noeuds", "Autres nœuds")
    for cle, n in noeuds.items():
        if cle in utiles and n["calque"] == "lymphatique":
            ajouter(reste_lymph, cle)

    # Familles et éléments vides retirés (calque absent, organe sans maillage dans ce calque)
    for f in res:
        f["elements"] = [e for e in f["elements"] if e["cles"]]
    return [f for f in res if f["elements"]]
