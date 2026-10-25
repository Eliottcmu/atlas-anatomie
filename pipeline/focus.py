"""Régions du corps et organes pour le focus de l'interface (appelé par construire_atlas.py).

Régions : une boîte (repère glTF, mètres) calculée à partir des os qui la délimitent, lus dans
les en-têtes des OBJ de BodyParts3D. Les membres sont déclinés côté droit et côté gauche.
Organes : la liste des nœuds (fichiers FJ) qui les composent, d'après l'arbre "partie de"
de BodyParts3D, complétée par les noms des maillages.
"""

import csv
import re
import zipfile
from collections import defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TABLES = RACINE / "donnees" / "brut" / "bodyparts3d" / "tables"
ARCHIVE = RACINE / "donnees" / "brut" / "bodyparts3d" / "archive" / "isa_BP3D_4.0_obj_99.zip"

CRANE = r"^(frontal bone|parietal bone|occipital bone|temporal bone|sphenoid bone|ethmoid|maxilla|mandible|zygomatic bone|nasal bone|lacrimal bone|palatine bone|vomer|inferior nasal concha)$"
CERVICALES = r"^(atlas|axis|(third|fourth|fifth|sixth|seventh) cervical vertebra)$"
MAIN = r"^(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|\w+ metacarpal bone|.*phalanx of .*(finger|thumb))$"
PIED = r"^(talus|calcaneus|navicular bone of .*|cuboid bone|\w+ cuneiform bone|\w+ metatarsal bone|.*phalanx of .*toe|sesamoid bone of .*)$"

# Vue par défaut : direction de la caméra depuis la région (X vers la gauche du sujet, Y haut, Z avant)
FACE, DOS = (0, 0, 1), (0, 0, -1)


class Os:
    """Bornes des os de BodyParts3D par nom sans côté et par côté, dans le repère glTF."""

    def __init__(self, index):
        self.bornes = defaultdict(list)  # (nom sans côté, côté) -> [(min, max)]
        fichiers = {l["fj"]: l["nom_en"] for l in index if l["systeme"] == "os"}
        with zipfile.ZipFile(ARCHIVE) as z:
            for chemin in z.namelist():
                fj = Path(chemin).stem
                if fj not in fichiers:
                    continue
                entete = z.read(chemin)[:1200].decode("ascii", "replace")
                lo, hi = ([float(v) for v in g.split(",")]
                          for g in re.search(r"Bounds\(mm\): \(([^)]*)\)-\(([^)]*)\)", entete).groups())
                # BodyParts3D (mm, Z haut, avant vers -Y) -> glTF (m, Y haut, Z avant)
                mini = [lo[0] / 1000, lo[2] / 1000, -hi[1] / 1000]
                maxi = [hi[0] / 1000, hi[2] / 1000, -lo[1] / 1000]
                nom = fichiers[fj]
                cote = "droit" if re.search(r"\bright\b", nom) else "gauche" if re.search(r"\bleft\b", nom) else None
                base = re.sub(r"\b(right|left) ", "", nom)
                self.bornes[(base, cote)].append((mini, maxi))

    def boite(self, motif, cote=None):
        """Boîte englobante des os dont le nom (sans côté) correspond au motif, pour un côté ou tous."""
        m = re.compile(motif)
        boites = [b for (nom, c), bs in self.bornes.items() if m.search(nom) and (cote is None or c in (cote, None))
                  for b in bs]
        if not boites:
            raise ValueError(f"aucun os pour {motif} ({cote})")
        return ([min(b[0][k] for b in boites) for k in range(3)], [max(b[1][k] for b in boites) for k in range(3)])


def elargir(boite, marge):
    mx = marge if isinstance(marge, (list, tuple)) else (marge,) * 3
    return ([boite[0][k] - mx[k] for k in range(3)], [boite[1][k] + mx[k] for k in range(3)])


def union(*boites):
    return ([min(b[0][k] for b in boites) for k in range(3)], [max(b[1][k] for b in boites) for k in range(3)])


def tranche(boite, y_bas, y_haut):
    return ([boite[0][0], y_bas, boite[0][2]], [boite[1][0], y_haut, boite[1][2]])


def regions(index):
    os_ = Os(index)
    b = os_.boite
    res = []

    def ajouter(id_, nom, groupe, boite, vue=FACE, cote=None):
        res.append({"id": id_, "nom": nom, "groupe": groupe, "cote": cote, "vue": list(vue),
                    "boite": [[round(v, 4) for v in boite[0]], [round(v, 4) for v in boite[1]]]})

    # Tête et cou
    ajouter("tete", "Tête", "Tête et cou", elargir(b(CRANE), 0.02))
    cervicales, mandibule, clavicules = b(CERVICALES), b(r"^mandible$"), b(r"^clavicle$")
    cou = ([mandibule[0][0], clavicules[1][1] - 0.01, cervicales[0][2] - 0.015],
           [mandibule[1][0], cervicales[1][1] + 0.01, b(r"^hyoid bone$")[1][2] + 0.035])
    ajouter("cou", "Cou", "Tête et cou", cou)

    # Tronc
    thorax = union(b(r"\brib$"), b(r"thoracic vertebra$"))
    ajouter("thorax", "Thorax", "Tronc", elargir(thorax, 0.015))
    coxaux, lombaires = b(r"^hip bone$"), b(r"lumbar vertebra$")
    abdomen = ([coxaux[0][0], coxaux[1][1] - 0.04, lombaires[0][2] - 0.01],
               [coxaux[1][0], b(r"^eleventh thoracic vertebra$")[1][1], coxaux[1][2] + 0.07])
    ajouter("abdomen", "Abdomen", "Tronc", abdomen)
    ajouter("bassin", "Bassin", "Tronc", elargir(union(coxaux, b(r"^sacrum$")), 0.02))

    for cote, suffixe in (("droit", "droite"), ("gauche", "gauche")):
        masc = "droit" if cote == "droit" else "gauche"  # bras, coude, genou, pied, membre
        # Membre supérieur
        humerus, avant_bras, main = b(r"^humerus$", cote), b(r"^(radius|ulna)$", cote), b(MAIN, cote)
        # Moitié latérale de la clavicule seulement : sa moitié médiale atteint le sternum et la ligne médiane
        clav = b(r"^clavicle$", cote)
        milieu = (clav[0][0] + clav[1][0]) / 2
        clav_lat = ([clav[0][0], clav[0][1], clav[0][2]], [milieu, clav[1][1], clav[1][2]]) if cote == "droit"             else ([milieu, clav[0][1], clav[0][2]], [clav[1][0], clav[1][1], clav[1][2]])
        ceinture = union(b(r"^scapula$", cote), clav_lat)
        g = "Membre supérieur"
        epaule = union(ceinture, tranche(humerus, humerus[1][1] - 0.09, humerus[1][1]))
        ajouter(f"epaule-{cote}", f"Épaule {suffixe}", g, elargir(epaule, 0.025), cote=cote)
        ajouter(f"bras-{cote}", f"Bras {masc}", g, elargir(humerus, (0.035, 0.0, 0.035)), cote=cote)
        coude_y = humerus[0][1]
        coude = tranche(union(humerus, avant_bras), coude_y - 0.06, coude_y + 0.06)
        ajouter(f"coude-{cote}", f"Coude {masc}", g, elargir(coude, (0.025, 0, 0.025)), cote=cote)
        ajouter(f"avant-bras-{cote}", f"Avant-bras {masc}", g, elargir(avant_bras, (0.03, 0.0, 0.03)), cote=cote)
        ajouter(f"main-{cote}", f"Main {suffixe}", g, elargir(main, 0.015), cote=cote)
        ajouter(f"membre-superieur-{cote}", f"Membre supérieur {masc}", g,
                elargir(union(ceinture, humerus, avant_bras, main), 0.03), cote=cote)

        # Membre inférieur
        femur, jambe, pied = b(r"^femur$", cote), b(r"^(tibia|fibula)$", cote), b(PIED, cote)
        coxal = b(r"^hip bone$", cote)
        g = "Membre inférieur"
        hanche = tranche(union(coxal, femur), femur[1][1] - 0.12, femur[1][1] + 0.05)
        ajouter(f"hanche-{cote}", f"Hanche {suffixe}", g, elargir(hanche, 0.02), cote=cote)
        ajouter(f"cuisse-{cote}", f"Cuisse {suffixe}", g, elargir(femur, (0.055, 0.0, 0.06)), cote=cote)
        genou_y = femur[0][1]
        genou = tranche(union(femur, jambe, b(r"^patella$", cote)), genou_y - 0.07, genou_y + 0.07)
        ajouter(f"genou-{cote}", f"Genou {masc}", g, elargir(genou, (0.03, 0, 0.035)), cote=cote)
        ajouter(f"jambe-{cote}", f"Jambe {suffixe}", g, elargir(jambe, (0.04, 0.0, 0.045)), cote=cote)
        # Pied vu d'en haut et de l'avant, pour voir le dos du pied et ses arcades
        ajouter(f"pied-{cote}", f"Pied {masc}", g, elargir(pied, 0.02), vue=(0, 0.75, 0.65), cote=cote)
        ajouter(f"membre-inferieur-{cote}", f"Membre inférieur {masc}", g,
                elargir(union(tranche(coxal, femur[1][1] - 0.05, femur[1][1] + 0.05), femur, jambe, pied), 0.05),
                cote=cote)
    return res


# Organes : (id, nom, groupe, concepts "partie de" de BodyParts3D, motif sur les noms BodyParts3D,
# motif sur les objets de Z-Anatomy importés par pipeline/organes_zanatomy.py)
CERVELET_ZA = (r"^(Anterior quadrangular lobule|Biventral lobule|Culmen|Declive|Flocculus|Folium of vermis|Gracile lobule|"
               r"Inferior semilunar lobule|Lingula of cerebellum|Nodule of vermis|Peduncle of flocculus|"
               r"Posterior quadrangular lobule|Pyramis of vermis|Superior cerebellar peduncle|Superior semilunar lobule|"
               r"Tonsil of cerebellum|Tuber of vermis|Uvula of vermis|Wing of central lobule)(\.[lr])?$")
TRONC_ZA = (r"^(Olive|Pyramid of medulla oblongata|Base of peduncle|Vestibular nuclei|Posterior cochlear nucleus|"
            r"Motor root of trigeminal nerve|Sensory root of trigeminal nerve|Cochlear nerve|Red nucleus)(\.[lr])?$")
NOYAUX_BP3D = (r"^((right|left) )?(thalamus|caudate nucleus|putamen|globus pallidus|amygdala|hypothalamus|mammillary body|"
               r"lateral geniculate body|medial geniculate body|habenula|internal capsule|stria terminalis|"
               r"stria medullaris of thalamus)$")
NOYAUX_ZA = r"^(Amygdaloid body|Septal nuclei|Mamillary body|Red nucleus|Stria medullaris thalami)(\.[lr])?$"
ENCEPHALE_BP3D = (r"^((right|left) )?(corpus callosum|fornix of forebrain|commissure of fornix of forebrain|anterior commissure|"
                  r"posterior commissure|septum of telencephalon|lamina terminalis|interventricular foramen|"
                  r"choroid plexus of cerebral hemisphere|optic chiasm|optic tract|peduncle of midbrain|"
                  r"brachium of (inferior|superior) colliculus|interpeduncular fossa|orbital gyrus|"
                  r"(anterior|posterior) part of superior temporal gyrus|tentorium cerebelli)$")
# Encéphale : les groupes encephale et cervelet de Z-Anatomy entiers
ENCEPHALE_ZA = r".*"
ORGANES = [
    # La paroi des ventricules n'est pas rattachée au cœur dans l'arbre « partie de » de BodyParts3D
    ("coeur", "Cœur", "Cardiorespiratoire", ["heart"], r"^wall of ventricle$", None),
    ("poumon-droit", "Poumon droit", "Cardiorespiratoire", ["right lung"], None, r"lobe of right lung$"),
    ("poumon-gauche", "Poumon gauche", "Cardiorespiratoire", ["left lung"], None, r"lobe of left lung$"),
    ("plevres", "Plèvres et lobes pulmonaires", "Cardiorespiratoire", [], None,
     r"^(Pleura|(Superior|Middle|Inferior) lobe of (right|left) lung)$"),
    ("trachee-bronches", "Trachée et bronches", "Cardiorespiratoire", ["trachea"], r"main bronchus|bronchial tree", None),
    ("larynx", "Larynx", "Cardiorespiratoire", [],
     r"^(cricoid cartilage|thyroid cartilage|epiglottis|.*(arytenoid|corniculate|cuneiform) cartilage|.*vocal ligament|"
     r".*cricothyroid.*|.*aryepiglotticus|hyo-epiglottic ligament|thyro-epiglottic ligament|.*thyrohyoid (membrane|ligament)|"
     r".*conus elasticus)$", None),
    ("pharynx", "Pharynx et voile du palais", "Tête et cou", [], None,
     r"^(Nasopharynx|Oropharynx|Laryngopharynx|Soft palate|Uvula of palate|Mucosa of nasal cavity|Palatine tonsil(\.[lr])?)$"),
    ("glandes-salivaires", "Glandes salivaires", "Tête et cou", [], r"\b(submandibular|sublingual) gland$", r"^Parotid gland\.[lr]$"),
    ("dents", "Dents et gencives", "Tête et cou", [], r"(secondary .*tooth|gingiva of (upper|lower) jaw)$", None),
    ("langue", "Langue", "Tête et cou", ["tongue"], None, None),
    ("thyroide", "Glande thyroïde", "Tête et cou", [], None, r"^Thyroid gland$"),
    ("thymus", "Thymus", "Tête et cou", [], r"lobe of thymus$", None),
    ("oesophage", "Œsophage", "Digestif", ["esophagus"], None, None),
    ("estomac", "Estomac", "Digestif", ["stomach"], None, None),
    ("duodenum", "Duodénum", "Digestif", ["duodenum"], None, None),
    ("intestin-grele", "Jéjunum et iléon", "Digestif", ["jejunum", "ileum"], None, None),
    ("colon", "Côlon, cæcum et appendice", "Digestif", ["cecum", "appendix"],
     r"^((ascending|transverse|descending|sigmoid) colon|taenia (libera|mesocolica|omentalis))$", r"^Sigmoid colon$"),
    ("rectum", "Rectum", "Digestif", ["rectum"], None, None),
    ("peritoine", "Péritoine : épiploons et mésos", "Digestif", [],
     r"^(mesentery of small intestine|transverse mesocolon|mesoappendix)$", r"^(Greater|Lesser) omentum$"),
    ("foie", "Foie", "Digestif", ["liver"], r"^(hepatovenous segment ix|duct of caudate lobe of liver)$", None),
    ("voies-biliaires", "Vésicule et voies biliaires", "Digestif", ["gallbladder"],
     r"cystic duct|common bile duct|common hepatic duct|hepatic biliary tree|(right|left) hepatic duct|duct of caudate lobe", None),
    ("pancreas", "Pancréas", "Digestif", ["pancreas"], None, None),
    ("rate", "Rate", "Digestif", [], r"^spleen$", None),
    ("reins", "Reins", "Urinaire et génital", ["right kidney", "left kidney"], None, r"^Renal pelvis\.[lr]$"),
    ("ureteres", "Uretères", "Urinaire et génital", [], r"\bureter$", None),
    ("vessie", "Vessie", "Urinaire et génital", ["urinary bladder"], None, None),
    ("prostate", "Prostate et vésicules séminales", "Urinaire et génital", ["prostate"], r"\bseminal vesicle$", None),
    ("testicules", "Testicules et conduits déférents", "Urinaire et génital", [], r"\b(testis|epididymis|deferent duct)$", None),
    ("penis", "Pénis et urètre", "Urinaire et génital", [],
     r"^(corpus cavernosum of penis|corpus spongiosum of penis|glans penis|urethra)$", None),
    ("plancher-pelvien", "Plancher pelvien", "Urinaire et génital", [],
     r"^((right|left) )?(iliococcygeus|pubococcygeus|puborectalis|tendinous arch of levator ani)$", None),
    ("encephale", "Encéphale", "Nerveux", ["brain"], ENCEPHALE_BP3D, ENCEPHALE_ZA),
    ("noyaux-gris", "Noyaux gris centraux et diencéphale", "Nerveux", [], NOYAUX_BP3D, NOYAUX_ZA),
    ("cervelet", "Cervelet", "Nerveux", ["cerebellum"], None, CERVELET_ZA),
    ("tronc-cerebral", "Tronc cérébral", "Nerveux", ["brainstem"],
     r"^((right|left) )?(peduncle of midbrain|brachium of (inferior|superior) colliculus)$", TRONC_ZA),
    ("moelle", "Moelle spinale et ganglions", "Nerveux", ["spinal cord"], None,
     r"^(Spinal dura|Spinal ganglion|Ganglia of sympathetic trunk)(\.[lr])?$"),
    ("nerfs-orbite", "Nerf optique et nerfs de l'orbite", "Nerveux", [],
     r"^((right|left) )?(optic nerve|optic chiasm|optic tract|ciliary ganglion|.*ciliary nerve|nasociliary nerve|frontal nerve|"
     r"lacrimal nerve|ophthalmic nerve|supra-orbital nerve|supratrochlear nerve|infratrochlear nerve|trochlear nerve|"
     r"(anterior|posterior) ethmoidal nerve|(inferior|superior) branch of ((right|left) )?oculomotor nerve|"
     r"communicating branch of .*nasociliary nerve.*)$", None),
    ("hypophyse", "Hypophyse", "Endocrine et sens", ["pituitary gland"], None, r"^(Adenohypophysis|Neurohypophysis)$"),
    ("surrenales", "Glandes surrénales", "Endocrine et sens", [], r"\badrenal gland$", None),
    ("yeux", "Yeux", "Endocrine et sens", ["right eyeball", "left eyeball"], r"optic part of (right|left) retina", r"^Retina\.[lr]$"),
    ("orbites", "Orbite : paupières et muscles de l'œil", "Endocrine et sens", [],
     r"^((right|left) )?(tarsal plate of .*eyelid|check ligament of .*|common tendinous ring|trochlea of .*superior oblique|"
     r"tendon of .*levator palpebrae superioris)$", None),
    ("appareil-lacrymal", "Appareil lacrymal", "Endocrine et sens", [],
     r"^((right|left) )?(lacrimal (gland|sac|canaliculus|lake)|nasolacrimal duct)$", None),
    ("oreilles", "Oreilles : tympan et oreille interne", "Endocrine et sens", [], r"^external ear$",
     r"^(Tympanic membrane|Vestibule|Cochlea|Auditory tube)\.[lr]$"),
    ("nez", "Cartilages du nez", "Endocrine et sens", [], r"(lateral nasal cartilage|major alar cartilage|septal nasal cartilage)$", None),
]
# Nœuds lymphatiques : un organe par grande région, d'après la région du focus qui contient le nœud
LYMPHATIQUES = [
    ("lymph-tete-cou", "Nœuds lymphatiques de la tête et du cou", ("tete", "cou")),
    ("lymph-thorax", "Nœuds lymphatiques du thorax et de l'aisselle", ("thorax", "epaule")),
    ("lymph-abdomen", "Nœuds lymphatiques de l'abdomen et du pelvis", ("abdomen", "bassin", "hanche")),
    ("lymph-membre-sup", "Nœuds lymphatiques des membres supérieurs", ("bras", "coude", "avant-bras", "main",
                                                                       "membre-superieur")),
    ("lymph-membre-inf", "Nœuds lymphatiques des membres inférieurs", ("cuisse", "genou", "jambe", "pied",
                                                                       "membre-inferieur")),
]


# Os : un focus par os ou groupe d'os, légendé par les repères de Z-Anatomy (pipeline/legendes_squelette.py).
# (id, nom, groupe, motif sur les noms BodyParts3D sans côté, accord du côté pour un os pair, vue) ;
# accord : « m » (fémur droit), « f » (ulna droite), « main » ou « pied » (métacarpe et doigts, main droite),
# « mp » (osselets droits) ; motif None : os pris seulement dans Z-Anatomy (OS_ZANATOMY)
# Le sternum et le processus xiphoïde sont rangés par BodyParts3D hors du système osseux : le motif les prend.
COTE_EXT = (1, 0, 0.35)  # vue latérale du côté gauche ; inversée pour le côté droit
OS = [
    ("crane", "Os du crâne", "Tête et rachis",
     r"^(frontal bone|parietal bone|occipital bone|temporal bone|sphenoid bone|ethmoid)$", None, (0.55, 0.25, 0.8)),
    ("face", "Os de la face", "Tête et rachis",
     r"^(maxilla|zygomatic bone|nasal bone|lacrimal bone|palatine bone|vomer|inferior nasal concha)$", None, FACE),
    ("mandibule", "Mandibule et os hyoïde", "Tête et rachis", r"^(mandible|hyoid bone)$", None, (0.5, 0.1, 0.85)),
    ("vertebres-cervicales", "Vertèbres cervicales", "Tête et rachis", CERVICALES, None, (0.7, 0.1, 0.7)),
    ("vertebres-thoraciques", "Vertèbres thoraciques", "Tête et rachis", r"thoracic vertebra$", None, (0.7, 0, -0.7)),
    ("vertebres-lombaires", "Vertèbres lombaires", "Tête et rachis", r"lumbar vertebra$", None, (0.7, 0, -0.7)),
    ("osselets", "Osselets de l'ouïe", "Tête et rachis", None, "mp", COTE_EXT),
    ("sacrum", "Sacrum et coccyx", "Tête et rachis", r"^sacrum$", None, DOS),
    ("cotes-sternum", "Côtes et sternum", "Tête et rachis", r"(\brib|^manubrium|^body of sternum|^xiphoid process)$", None,
     FACE),
    ("clavicule", "Clavicule", "Membre supérieur", r"^clavicle$", "f", (0, 0.6, 0.8)),
    ("scapula", "Scapula", "Membre supérieur", r"^scapula$", "f", DOS),
    ("humerus", "Humérus", "Membre supérieur", r"^humerus$", "m", FACE),
    ("radius", "Radius", "Membre supérieur", r"^radius$", "m", FACE),
    ("ulna", "Ulna", "Membre supérieur", r"^ulna$", "f", FACE),
    ("carpe", "Carpe", "Membre supérieur", r"^(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate)$",
     "m", FACE),
    ("metacarpe", "Métacarpe et doigts", "Membre supérieur", r"(metacarpal bone|phalanx of .*(finger|thumb))$", "main", FACE),
    ("coxal", "Os coxal", "Membre inférieur", r"^hip bone$", "m", COTE_EXT),
    ("femur", "Fémur", "Membre inférieur", r"^femur$", "m", FACE),
    ("patella", "Patella", "Membre inférieur", r"^patella$", "f", FACE),
    ("tibia", "Tibia", "Membre inférieur", r"^tibia$", "m", FACE),
    ("fibula", "Fibula", "Membre inférieur", r"^fibula$", "f", COTE_EXT),
    ("tarse", "Tarse", "Membre inférieur", r"^(talus|calcaneus|navicular bone of .*|cuboid bone|\w+ cuneiform bone)$",
     "m", (0, 0.75, 0.65)),
    ("metatarse", "Métatarse et orteils", "Membre inférieur", r"(metatarsal bone|phalanx of .*toe|sesamoid bone of .*)$",
     "pied", (0, 0.75, 0.65)),
]


# Os de Z-Anatomy absents de BodyParts3D (pipeline/organes_zanatomy.py) : focus d'accueil et motif sur l'objet
OS_ZANATOMY = {"osselets": r"^(Malleus|Incus|Stapes)\.[lr]$", "sacrum": r"^Coccyx$"}


def os_(index, lignes_za=()):
    """Focus des os : maillages de chaque os ou groupe d'os, par côté pour les os pairs.

    lignes_za : objets de Z-Anatomy importés (index_zanatomy_organes.csv) ; ceux du calque des os
    (coccyx, osselets) rejoignent le focus que leur donne OS_ZANATOMY.
    """
    res, manquants = [], []
    for id_, nom, groupe, motif, genre, vue in OS:
        m = re.compile(motif) if motif else None
        par_cote = defaultdict(list)
        for l in index if m else []:
            if l["systeme"] not in ("os", "autres"):
                continue
            cote = "droit" if re.search(r"\bright\b", l["nom_en"]) else "gauche" if re.search(r"\bleft\b", l["nom_en"]) else None
            base = re.sub(r"\b(right|left) ", "", l["nom_en"])
            # Le sternum seul est pris dans « autres » ; un muscle « sternocostal » ne l'est pas
            if m.search(base) and (l["systeme"] == "os" or re.search(r"sternum|xiphoid|^manubrium", base)):
                par_cote[cote if genre else None].append(l["fj"])
        if id_ in OS_ZANATOMY:
            mz = re.compile(OS_ZANATOMY[id_])
            for l in lignes_za:
                if l.get("systeme") == "os" and mz.search(l["objet"]):
                    cote = {"r": "droit", "l": "gauche"}.get(l["objet"][-1]) if re.search(r"\.[lr]$", l["objet"]) else None
                    par_cote[cote if genre else None].append(l["objet"])
        if not par_cote:
            manquants.append(f"{nom} : aucun maillage")
            continue
        for cote, fjs in sorted(par_cote.items(), key=lambda kv: kv[0] or ""):
            if genre and cote is None:
                continue
            accord = "" if not genre else {
                "m": f" {cote}", "f": f" {'droite' if cote == 'droit' else 'gauche'}",
                "main": f", main {'droite' if cote == 'droit' else 'gauche'}", "pied": f", pied {cote}",
                "mp": f" {cote}s"}[genre]
            v = list(vue)
            if cote == "droit" and v == list(COTE_EXT):
                v[0] = -v[0]
            res.append({"id": f"{id_}-{cote}" if genre else id_, "nom": nom + accord, "groupe": groupe, "vue": v,
                        "contexte": "os", "parties": sorted(fjs), "cote": cote, "os": True})
    return res, manquants


# Organes rétropéritonéaux ou postérieurs : mieux vus de dos
VUES_ORGANES = {"reins": DOS, "surrenales": DOS, "moelle": DOS, "ureteres": DOS,
                # Orbite et plancher pelvien : vus d'en haut et de l'avant, comme en dissection
                "nerfs-orbite": (0, 0.8, 0.6), "plancher-pelvien": (0, 0.8, 0.6)}
# Organes qui contiennent déjà leurs vaisseaux (pulmonaires, hépatiques) : pas de vaisseaux de contexte,
# sinon la boîte du poumon ramène intercostales, hépatique commune et rénale
PARTIES_SEULES = {"poumon-droit", "poumon-gauche", "trachee-bronches", "foie", "plevres"}


def organes(index, lignes_za=(), doublons=frozenset()):
    """Organes et nœuds qui les composent ; un organe introuvable est signalé, pas inventé.

    lignes_za : objets de Z-Anatomy importés (index_zanatomy_organes.csv) ; doublons : maillages
    BodyParts3D remplacés par des parties plus fines, retirés des organes.
    """
    elements, noms = defaultdict(set), {}
    with open(TABLES / "partof_element_parts.txt", encoding="utf-8") as f:
        for concept, nom, fj in list(csv.reader(f, delimiter="\t"))[1:]:
            elements[concept].add(fj)
            noms[nom] = concept
    presents = {l["fj"]: l for l in index}
    res, manquants = [], []
    for id_, nom, groupe, concepts, motif, motif_za in ORGANES:
        parties = set()
        for c in concepts:
            if c in noms:
                parties |= elements[noms[c]] & presents.keys()
            else:
                manquants.append(f"{nom} : concept « {c} » absent")
        if motif:
            m = re.compile(motif)
            parties |= {fj for fj, l in presents.items() if m.search(l["nom_en"])}
        if motif_za:
            m = re.compile(motif_za)
            # L'encéphale prend ses groupes de Z-Anatomy entiers (hémisphères et cervelet)
            parties |= {l["objet"] for l in lignes_za if m.search(l["objet"]) and l["groupe"] != "lymphatiques"
                        and l.get("systeme", "autres") == "autres"
                        and (id_ != "encephale" or l["groupe"] in ("encephale", "cervelet"))}
        parties -= set(doublons)
        if not parties:
            manquants.append(f"{nom} : aucun maillage")
            continue
        res.append({"id": id_, "nom": nom, "groupe": groupe, "vue": list(VUES_ORGANES.get(id_, FACE)),
                    "contexte": "parties" if id_ in PARTIES_SEULES else "vaisseaux", "parties": sorted(parties)})

    # Nœuds lymphatiques : la plus petite région du focus qui contient le centre du nœud décide de son organe
    boites = {r["id"]: r["boite"] for r in regions(index)}
    par_organe = defaultdict(list)
    for l in lignes_za:
        if l["groupe"] != "lymphatiques":
            continue
        c = [float(l["centre_x"]), float(l["centre_y"]), float(l["centre_z"])]
        dans = [r for r, b in boites.items() if all(b[0][k] <= c[k] <= b[1][k] for k in range(3))]
        if not dans:
            manquants.append(f"nœud lymphatique hors des régions : {l['objet']}")
            continue
        region = re.sub(r"-(droit|gauche)$", "", min(dans, key=lambda r: volume(boites[r])))
        organe = next((o for o, _, regs in LYMPHATIQUES if region in regs), None)
        if organe:
            par_organe[organe].append(l["objet"])
    for id_, nom, _ in LYMPHATIQUES:
        if par_organe[id_]:
            res.append({"id": id_, "nom": nom, "groupe": "Lymphatique", "vue": list(FACE), "contexte": "vaisseaux",
                        "parties": sorted(par_organe[id_])})
    return res, manquants


def volume(boite):
    return (boite[1][0] - boite[0][0]) * (boite[1][1] - boite[0][1]) * (boite[1][2] - boite[0][2])
