"""Inventaire de couverture 3D des structures noyau (phase 0 pour le bloc 1, puis blocs 2 à 4).

Lit la liste noyau, les tables BodyParts3D et l'archive des maillages,
puis produit l'inventaire CSV et le rapport Markdown.

Usage : python -I pipeline/inventaire_couverture.py [--remplir]
  --remplir : recopie dans la liste noyau les identifiants FMA trouvés
              par correspondance exacte (les cases déjà remplies sont gardées).
"""

import csv
import difflib
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arbre_vasculaire import Arbre, sans_cote  # noqa: E402
from listes import ecrire_fichier, fichiers_listes, lire_fichier  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
TABLES = RACINE / "donnees" / "brut" / "bodyparts3d" / "tables"
ARCHIVE = RACINE / "donnees" / "brut" / "bodyparts3d" / "archive" / "isa_BP3D_4.0_obj_99.zip"
SORTIE_CSV = RACINE / "rapports" / "inventaire_couverture.csv"
SORTIE_MD = RACINE / "rapports" / "rapport_couverture.md"

DERIVE = RACINE / "donnees" / "derive"
TA2 = RACINE / "donnees" / "brut" / "z-anatomy" / "TA2.csv"

WIKIDATA = DERIVE / "wikidata_fma.csv"
INDEX_ZANATOMY = RACINE / "modeles" / "index_zanatomy.csv"

RESOLUES = ("exacte", "manuelle", "par côtés", "par parties", "absent de BodyParts3D", "sans concept FMA",
            "étiquette corrigée")
SOLUTIONS = {
    "Z-Anatomy": "Z-Anatomy : export GLB depuis Blender (licence CC BY-SA)",
    "HRA femme": "Human Reference Atlas, modèle féminin (GLB)",
    "HRA homme": "Human Reference Atlas, modèle masculin (GLB)",
}

ORDRE_REGIONS = [
    "Cœur et thorax", "Tête et cou", "Membre supérieur", "Abdomen",
    "Abdomen et pelvis", "Pelvis et membre inférieur", "Membre inférieur", "Tronc",
]
# Préfixe de l'identifiant -> système, dans l'ordre des blocs (pipeline/listes.py)
SYSTEMES_PAR_PREFIXE = {"A": "Artères", "V": "Veines", "M": "Muscles", "O": "Organes", "S": "Os"}


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def lire_tsv(chemin):
    with open(chemin, encoding="utf-8") as f:
        lignes = list(csv.reader(f, delimiter="\t"))
    return lignes[1:]


def charger_tables():
    """Charge noms, maillages élémentaires et arbres des deux hiérarchies."""
    noms = {}
    for fichier in ("isa_parts_list_e.txt", "partof_parts_list_e.txt"):
        for ligne in lire_tsv(TABLES / fichier):
            noms[ligne[0]] = ligne[2]

    elements = defaultdict(set)
    for fichier in ("isa_element_parts.txt", "partof_element_parts.txt"):
        for ligne in lire_tsv(TABLES / fichier):
            elements[ligne[0]].add(ligne[2])
            noms.setdefault(ligne[0], ligne[1])

    enfants = defaultdict(set)
    for fichier in ("isa_inclusion_relation_list.txt", "partof_inclusion_relation_list.txt"):
        for ligne in lire_tsv(TABLES / fichier):
            enfants[ligne[0]].add(ligne[2])
            noms.setdefault(ligne[0], ligne[1])
            noms.setdefault(ligne[2], ligne[3])

    par_nom = defaultdict(set)
    for fma, nom in noms.items():
        par_nom[nom.lower()].add(fma)
    return noms, elements, enfants, par_nom


def charger_archive():
    """Renvoie l'ensemble des identifiants FJ présents dans l'archive, ou None."""
    if not ARCHIVE.exists():
        journal("WARN", f"Archive absente : {ARCHIVE.name}. "
                "Conséquence : présence des maillages déduite des seules tables. "
                "Action : télécharger l'archive puis relancer.")
        return None
    try:
        with zipfile.ZipFile(ARCHIVE) as z:
            presents = {Path(n).stem for n in z.namelist() if n.lower().endswith(".obj")}
    except zipfile.BadZipFile:
        journal("WARN", f"Archive illisible : {ARCHIVE.name} (téléchargement incomplet ?). "
                "Conséquence : présence des maillages déduite des seules tables. "
                "Action : supprimer le fichier, le retélécharger puis relancer.")
        return None
    journal("OK", f"Archive lue : {len(presents)} maillages OBJ.")
    return presents


class Geometrie:
    """Côté d'un maillage d'après la position de son centre par rapport à la ligne médiane.

    La ligne médiane et le sens droite-gauche sont étalonnés sur des paires dont
    le côté est donné par le nom (carotides communes, subclavières, iliaques communes).
    """

    PAIRES = ("common carotid artery", "subclavian artery", "common iliac artery")
    TOLERANCE_MM = 5.0

    def __init__(self, noms, elements, par_nom):
        self.zip = zipfile.ZipFile(ARCHIVE)
        self.chemins = {Path(n).stem: n for n in self.zip.namelist() if n.lower().endswith(".obj")}
        self.cache = {}
        droits, gauches = [], []
        for paire in self.PAIRES:
            for cote, liste in (("right", droits), ("left", gauches)):
                for fma in par_nom.get(f"{cote} {paire}", ()):
                    liste += [self.centre_x(f) for f in elements.get(fma, ()) if f in self.chemins]
        if not droits or not gauches:
            raise ValueError("étalonnage impossible : paires de référence sans maillage")
        xd, xg = sum(droits) / len(droits), sum(gauches) / len(gauches)
        self.milieu, self.sens = (xd + xg) / 2, 1 if xd > xg else -1
        journal("OK", f"Ligne médiane étalonnée à x = {self.milieu:.1f}, droite vers x {'croissant' if self.sens > 0 else 'décroissant'}.")

    def centre_x(self, fichier):
        if fichier not in self.cache:
            xs = [float(l.split()[1]) for l in self.zip.read(self.chemins[fichier]).decode("ascii", "replace").splitlines()
                  if l.startswith("v ")]
            self.cache[fichier] = sum(xs) / len(xs) if xs else None
        return self.cache[fichier]

    def cote(self, fichier):
        x = self.centre_x(fichier) if fichier in self.chemins else None
        if x is None:
            return None
        ecart = (x - self.milieu) * self.sens
        if abs(ecart) < self.TOLERANCE_MM:
            return "médian"
        return "droit" if ecart > 0 else "gauche"


def descendants(fma, enfants):
    vus, pile = set(), [fma]
    while pile:
        for e in enfants.get(pile.pop(), ()):
            if e not in vus:
                vus.add(e)
                pile.append(e)
    return vus


def maillages(fma, elements, presents):
    fichiers = elements.get(fma, set())
    if presents is not None:
        fichiers = fichiers & presents
    return fichiers


def cote_du_nom(nom):
    mots = set(re.findall(r"[a-z]+", nom.lower()))
    if "right" in mots and "left" not in mots:
        return "droit"
    if "left" in mots and "right" not in mots:
        return "gauche"
    return None


def resoudre(ligne, noms, par_nom, wikidata):
    """Renvoie (fma_id, mode, suggestions). Ne tranche jamais un cas ambigu."""
    # Structure que BodyParts3D n'a que par chefs ou parties (deltoïde, biceps) : concepts des parties,
    # listés à la main dans la colonne parties_fma ; fma_id garde le vrai identifiant du muscle entier
    parties = (ligne.get("parties_fma") or "").strip()
    if parties:
        inconnus = [f for f in parties.split("|") if f not in noms]
        return (None, "identifiant inconnu", " | ".join(inconnus)) if inconnus else (parties, "par parties", "")
    fma = ligne["fma_id"].strip()
    if fma == "aucun":
        # Vérifié à la main : la structure n'existe pas comme concept dans la FMA
        return None, "sans concept FMA", ""
    if fma:
        ids = fma.split("|")
        if all(f in noms for f in ids):
            return fma, "manuelle", ""
        # Identifiant FMA réel (confirmé par Wikidata) mais absent des tables BodyParts3D
        if all(f in wikidata for f in ids):
            return None, "absent de BodyParts3D", ""
        return None, "identifiant inconnu", ""
    nom = ligne["nom_fma_en"].strip().lower()
    if not nom:
        return None, "sans nom FMA", ""
    trouves = par_nom.get(nom, set())
    if len(trouves) == 1:
        return next(iter(trouves)), "exacte", ""
    if len(trouves) > 1:
        return None, "ambiguë", " | ".join(f"{f} {noms[f]}" for f in sorted(trouves))
    # Concept général absent mais concepts droit et gauche présents : on garde les côtés
    cotes = [next(iter(par_nom[f"{c} {nom}"])) for c in ("right", "left") if len(par_nom.get(f"{c} {nom}", ())) == 1]
    if cotes:
        return "|".join(cotes), "par côtés", ""
    # Aucune correspondance exacte : candidats proches, à valider à la main
    mots = set(nom.split()) - {"artery", "vein", "of", "the"}
    candidats = [n for n in par_nom if mots and mots <= set(n.split())]
    candidats = sorted(candidats, key=len)[:4] or difflib.get_close_matches(nom, list(par_nom), n=4, cutoff=0.75)
    sugg = " | ".join(f"{'/'.join(sorted(par_nom[c]))} {c}" for c in candidats)
    return None, "à trancher", sugg


def rattachements_arbre():
    """Maillages de vaisseaux rattachés à chaque structure par l'arbre vasculaire (pipeline/arbre_vasculaire.py) :
    {id: {"propres": {fj: côté}, "branches": {fj}}}. None si l'index des maillages manque."""
    index = RACINE / "modeles" / "index_maillages.csv"
    if not index.exists():
        journal("WARN", "modeles/index_maillages.csv absent. Conséquence : maillages comptés par les tables "
                "BodyParts3D seules (arbre aplati). Action : lancer pipeline/convertir_glb.py puis relancer.")
        return None
    arbre = Arbre()
    for e in arbre.erreurs:
        journal("FAIL", f"arbre_vasculaire.csv : {e}")
    res = defaultdict(lambda: {"propres": {}, "branches": set()})
    with open(index, encoding="utf-8-sig", newline="") as f:
        for l in csv.DictReader(f, delimiter=";"):
            if l["systeme"] not in ("arteres", "veines"):
                continue
            nom, correction = arbre.nom_corrige(l["fj"], l["nom_en"])
            if correction and correction["action"] == "doublon":
                continue
            x = float(l["centre_x"])  # repère glTF : droite du sujet vers -X
            cote = "droit" if x < -0.005 else "gauche" if x > 0.005 else None
            r = arbre.resoudre(nom, cote)
            if not r["structure"]:
                continue
            if r["propre"]:
                res[r["structure"]]["propres"][l["fj"]] = sans_cote(nom.lower())[1] or cote
            else:
                res[r["structure"]]["branches"].add(l["fj"])
    return res


def appliquer_arbre(res, ligne, arbre):
    """Remplace les maillages trouvés par les tables (arbre « partie de » aplati) par ceux de l'arbre vasculaire.

    Une structure dont BodyParts3D n'a que des branches (artère profonde de la cuisse) n'a pas de maillage
    propre : elle passe en secours. Une structure absente des tables mais dont un maillage mal étiqueté
    a été identifié (artère fibulaire) devient couverte.
    """
    if arbre is None or ligne["systeme"] not in ("artère", "veine") or res["correspondance"] == "sans concept FMA":
        return
    r = arbre.get(ligne["id"], {"propres": {}, "branches": set()})
    fichiers = set(r["propres"]) | r["branches"]
    if not fichiers:
        # Rien dans l'arbre : structure absente, ou composée d'autres structures (cercle artériel du cerveau)
        return
    res["nb_fichiers"] = len(fichiers)
    res["fichiers"] = "|".join(sorted(fichiers))
    cotes = set(r["propres"].values())
    if ligne["cote"] == "bilatéral":
        res["droit"] = "oui" if "droit" in cotes else "non"
        res["gauche"] = "oui" if "gauche" in cotes else "non"
        res["maillage"] = "oui" if {"droit", "gauche"} <= cotes else "partiel" if r["propres"] else "non"
    else:
        res["maillage"] = "oui" if r["propres"] else "non"
    if r["propres"] and res["correspondance"] == "absent de BodyParts3D":
        res["correspondance"] = "étiquette corrigée"


def analyser(ligne, bp3d, presents, geo, sources, ta2, wikidata, arbre=None):
    res = analyser_bp3d(ligne, *bp3d, presents, geo, wikidata)
    appliquer_arbre(res, ligne, arbre)
    if res["correspondance"] in RESOLUES:
        dispo = disponibilite(ligne["nom_fma_en"], sources)
        # Objets Z-Anatomy désignés à la main (colonne zanatomy, noms sans côté) : « Deep part of masseter »
        if (ligne.get("zanatomy") or "").strip():
            dispo["Z-Anatomy"] = {"droit", "gauche"} if ligne["cote"] == "bilatéral" else {None}
        choisir_secours(res, ligne, dispo)
    nomenclature(res, ligne, ta2, wikidata)
    return res


def analyser_bp3d(ligne, noms, elements, enfants, par_nom, presents, geo, wikidata):
    fma, mode, sugg = resoudre(ligne, noms, par_nom, wikidata)
    if mode == "absent de BodyParts3D":
        # Identifiant FMA réel gardé comme clé pivot, nom anglais pris dans Wikidata
        fma_affiche = ligne["fma_id"].strip()
        nom_trouve = " | ".join(wikidata[f]["libelle_en"] for f in fma_affiche.split("|"))
    elif mode == "par parties":
        fma_affiche = ligne["fma_id"].strip()
        nom_trouve = " | ".join(noms[f] for f in fma.split("|"))
    else:
        fma_affiche = fma or ""
        nom_trouve = " | ".join(noms[f] for f in fma.split("|")) if fma else ""
    res = {
        "id": ligne["id"], "nom_fr": ligne["nom_fr"], "region": ligne["region"],
        "niveau": ligne["niveau"], "cote": ligne["cote"], "fma_id": fma_affiche,
        "nom_fma_trouve": nom_trouve, "correspondance": mode,
        "maillage": "non", "nb_fichiers": 0, "fichiers": "", "droit": "", "gauche": "",
        "fma_droit": "", "fma_gauche": "", "suggestions": sugg,
        "zanatomy": "", "hra_femme": "", "hra_homme": "", "solution_secours": "",
        "ta2_id": "", "nom_ta2_fr": "", "nom_differe_ta2": "",
        "qid_wikidata": "", "nom_wikidata_fr": "", "alias_wikidata_fr": "", "nom_differe_wikidata": "",
    }
    if not fma and mode not in RESOLUES:
        res["solution_secours"] = "à définir après correspondance FMA"
        return res
    if not fma:
        return res

    # Un identifiant peut en regrouper plusieurs (côtés droit et gauche), séparés par |
    concepts = fma.split("|")
    fichiers = set().union(*(maillages(f, elements, presents) for f in concepts))
    res["nb_fichiers"] = len(fichiers)
    res["fichiers"] = "|".join(sorted(fichiers))

    if ligne["cote"] == "bilatéral":
        # Côtés : concepts descendants nommés "right ..." ou "left ..." qui ont un maillage
        cotes = defaultdict(set)
        for d in set(concepts).union(*(descendants(f, enfants) for f in concepts)):
            c = cote_du_nom(noms.get(d, ""))
            if c and maillages(d, elements, presents):
                cotes[c].add(d)
        for c, cle in (("droit", "droit"), ("gauche", "gauche")):
            res[cle] = "oui" if cotes[c] else "non"
            # Concept le plus général du côté (nom le plus court)
            if cotes[c]:
                res[f"fma_{cle}"] = min(cotes[c], key=lambda d: len(noms[d]))
        # Côtés absents des noms : on regarde où se trouvent les maillages
        if fichiers and geo and not (cotes["droit"] and cotes["gauche"]):
            par_geo = {geo.cote(f) for f in fichiers}
            for c in ("droit", "gauche"):
                if c in par_geo and not cotes[c]:
                    cotes[c] = {"géométrie"}
                    res[c] = "oui (géométrie)"
        if fichiers and cotes["droit"] and cotes["gauche"]:
            res["maillage"] = "oui"
        elif fichiers:
            res["maillage"] = "partiel"
    elif fichiers:
        res["maillage"] = "oui"

    return res


def variantes_en(nom):
    """Formes anglaises à chercher : singulier et pluriel (Z-Anatomy écrit souvent "Lumbar arteries")."""
    nom = nom.strip().lower()
    if not nom:
        return []
    pluriel = re.sub(r"\bartery\b", "arteries", re.sub(r"\bvein\b", "veins", nom))
    return list(dict.fromkeys([nom, pluriel]))


def normaliser_zanatomy(nom):
    """'Middle cerebral artery (M1-segment).l' -> ('middle cerebral artery', 'gauche')."""
    m = re.match(r"^(.*?)(?:\.([a-z]))?$", nom)
    base = re.sub(r"\s*\(.*?\)", "", m.group(1)).strip().lower()
    return base, {"l": "gauche", "r": "droit"}.get(m.group(2))


def normaliser_hra(nom):
    """'VH_F_left_uterine_artery' ou 'VH_M_renal_vein_L' -> ('uterine artery', 'gauche')."""
    mots, cote = re.sub(r"^VH_[MF]_", "", nom).split("_"), None
    while mots and mots[-1] in ("a", "b", "c", "L", "R"):
        cote = {"L": "gauche", "R": "droit"}.get(mots.pop(), cote)
    if mots and mots[0] in ("left", "right"):
        cote = "gauche" if mots.pop(0) == "left" else "droit"
    return " ".join(mots).lower(), cote


def charger_secours():
    """Index {nom normalisé: côtés présents} pour chaque source 3D de secours."""
    fichiers = {
        "Z-Anatomy": ("zanatomy_objets.txt", normaliser_zanatomy),
        "HRA femme": ("hra_noeuds_female.txt", normaliser_hra),
        "HRA homme": ("hra_noeuds_male.txt", normaliser_hra),
    }
    sources = {}
    for source, (fichier, normaliser) in fichiers.items():
        chemin = DERIVE / fichier
        if not chemin.exists():
            journal("WARN", f"{fichier} absent. Conséquence : source {source} ignorée. "
                    "Action : lancer pipeline/extraire_noms_secours.py.")
            continue
        index = defaultdict(set)
        for nom in chemin.read_text(encoding="utf-8").split("\n"):
            if nom:
                base, cote = normaliser(nom)
                index[base].add(cote)
        sources[source] = index
    return sources


def disponibilite(nom_en, sources):
    """Renvoie {source: côtés trouvés} pour les sources qui ont la structure."""
    trouve = {}
    for source, index in sources.items():
        cotes = set().union(*(index[v] for v in variantes_en(nom_en) if v in index))
        if cotes:
            trouve[source] = cotes
    return trouve


def decrire_cotes(cotes, cote_attendu):
    if cote_attendu != "bilatéral":
        return "oui"
    presents = [c for c in ("droit", "gauche") if c in cotes]
    return "oui (" + " et ".join(presents) + ")" if presents else "oui (côté non précisé)"


def choisir_secours(res, ligne, dispo):
    """Remplit les colonnes de secours et la solution proposée."""
    for source, cle in (("Z-Anatomy", "zanatomy"), ("HRA femme", "hra_femme"), ("HRA homme", "hra_homme")):
        res[cle] = decrire_cotes(dispo[source], ligne["cote"]) if source in dispo else "non"
    if res["maillage"] == "oui":
        return
    if res["maillage"] == "partiel":
        if "Z-Anatomy" in dispo and {"droit", "gauche"} <= dispo["Z-Anatomy"]:
            res["solution_secours"] = "côté manquant pris dans Z-Anatomy, qui a les deux"
        else:
            res["solution_secours"] = "côté manquant : copie en miroir du côté présent"
        return
    for source in ("Z-Anatomy", "HRA femme", "HRA homme"):
        if source in dispo:
            res["solution_secours"] = SOLUTIONS[source]
            return
    res["solution_secours"] = "schéma 2D (planche de Gray) : absent des trois sources 3D"


def charger_ta2():
    """Index anglais et français de la TA2 traduite fournie par Z-Anatomy."""
    par_en, par_fr = {}, {}
    if not TA2.exists():
        journal("WARN", "TA2.csv absent. Conséquence : pas de contrôle de nomenclature. "
                "Action : lancer pipeline/telecharger_sources.py.")
        return par_en, par_fr
    with open(TA2, encoding="utf-8-sig") as f:
        for ligne in f:
            champs = ligne.strip().strip('"').split(";")
            if len(champs) >= 4 and champs[0].isdigit():
                entree = (champs[0], champs[3])
                par_en.setdefault(champs[1].lower(), entree)
                par_fr.setdefault(champs[3].lower(), entree)
    return par_en, par_fr


def charger_wikidata():
    """Index {fma_id: entrée} des libellés Wikidata, avec un index secondaire par nom anglais."""
    if not WIKIDATA.exists():
        journal("WARN", "wikidata_fma.csv absent. Conséquence : structures hors BodyParts3D non vérifiées, "
                "pas de libellés Wikidata. Action : lancer pipeline/libelles_wikidata.py.")
        return {}
    with open(WIKIDATA, encoding="utf-8-sig", newline="") as f:
        entrees = list(csv.DictReader(f, delimiter=";"))
    index = {e["fma_id"]: e for e in entrees}
    for e in entrees:
        index.setdefault("en:" + e["libelle_en"].lower(), e)
    return index


def nomenclature(res, ligne, ta2, wikidata):
    ids = [f for f in ligne["fma_id"].split("|") if f.startswith("FMA")]
    entree_wd = next((wikidata[f] for f in ids if f in wikidata), None) if len(ids) == 1 else None
    entree_wd = entree_wd or wikidata.get("en:" + ligne["nom_fma_en"].strip().lower())
    if entree_wd:
        res["qid_wikidata"] = entree_wd["qid"]
        res["nom_wikidata_fr"] = entree_wd["libelle_fr"]
        res["alias_wikidata_fr"] = entree_wd["alias_fr"]
        res["nom_differe_wikidata"] = "non" if entree_wd["libelle_fr"].lower() == ligne["nom_fr"].lower() else "oui"
    else:
        res["nom_differe_wikidata"] = "libellé non trouvé"

    par_en, par_fr = ta2
    entree = next((par_en[v] for v in variantes_en(ligne["nom_fma_en"]) if v in par_en), None)
    entree = entree or par_fr.get(ligne["nom_fr"].lower())
    res["ta2_id"], res["nom_ta2_fr"] = entree or ("", "")
    if entree:
        res["nom_differe_ta2"] = "non" if entree[1].lower() == ligne["nom_fr"].lower() else "oui"
    else:
        res["nom_differe_ta2"] = "terme TA2 non trouvé"


def noter_exports(resultats):
    """Ajoute le résultat de pipeline/zanatomy.py : objets exportés et écart à l'origine."""
    exports = defaultdict(list)
    if INDEX_ZANATOMY.exists():
        with open(INDEX_ZANATOMY, encoding="utf-8-sig", newline="") as f:
            for l in csv.DictReader(f, delimiter=";"):
                if l["role"] == "structure":
                    exports[l["id_liste"]].append(l["ecart_origine_mm"])
    for r in resultats:
        ecarts = [float(e) for e in exports.get(r["id"], []) if e]
        if r["id"] not in exports:
            r["export_zanatomy"] = "non" if "Z-Anatomy" in r["solution_secours"] else ""
        elif ecarts:
            r["export_zanatomy"] = f"oui, {len(exports[r['id']])} objets, écart à l'origine {max(ecarts):.1f} mm au plus"
        else:
            r["export_zanatomy"] = f"oui, {len(exports[r['id']])} objets, origine non contrôlée"


def ecrire_csv(resultats):
    SORTIE_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(SORTIE_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(resultats[0]), delimiter=";")
        w.writeheader()
        w.writerows(resultats)
    journal("OK", f"Inventaire écrit : {SORTIE_CSV.relative_to(RACINE)}")


def couverture(r):
    """Classe finale d'une structure : d'où viendra sa représentation."""
    if r["maillage"] == "oui":
        return "BodyParts3D"
    if r["maillage"] == "partiel":
        return "partiel"
    if r["solution_secours"] in SOLUTIONS.values():
        return "secours 3D"
    if r["solution_secours"].startswith("schéma 2D"):
        return "2D"
    return "non résolu"


def ecrire_rapport(resultats, archive_lue):
    noyau = [r for r in resultats if r["niveau"] == "noyau"]
    lignes = ["# Rapport de couverture 3D des structures noyau", "",
              "Fichier généré par pipeline/inventaire_couverture.py, ne pas éditer à la main.", ""]
    if not archive_lue:
        lignes += ["> Archive des maillages absente : présence déduite des seules tables.", ""]
    classes = ("BodyParts3D", "partiel", "secours 3D", "2D", "non résolu")
    compte = {c: sum(couverture(r) == c for r in noyau) for c in classes}
    lignes += [
        f"Structures noyau : {len(noyau)}. Maillage BodyParts3D complet : {compte['BodyParts3D']} "
        f"({100 * compte['BodyParts3D'] / len(noyau):.0f} %). Partiel : {compte['partiel']}. "
        f"Couvert par une source 3D de secours : {compte['secours 3D']}. "
        f"Schéma 2D seulement : {compte['2D']}. Non résolu : {compte['non résolu']}.", "",
        "## Couverture par région (structures noyau)", "",
        "| Système | Région | Structures | BodyParts3D | Partiel | Secours 3D | 2D | Taux 3D |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    groupes = defaultdict(list)
    for r in noyau:
        groupes[(SYSTEMES_PAR_PREFIXE.get(r["id"][0], "Autres"), r["region"])].append(r)
    ordre = {s: k for k, s in enumerate(SYSTEMES_PAR_PREFIXE.values())}

    def cle(kv):
        (systeme, region) = kv[0]
        return ordre.get(systeme, 99), ORDRE_REGIONS.index(region) if region in ORDRE_REGIONS else 99, region

    for (systeme, region), rs in sorted(groupes.items(), key=cle):
        n = {c: sum(couverture(r) == c for r in rs) for c in classes}
        en_3d = n["BodyParts3D"] + n["partiel"] + n["secours 3D"]
        lignes.append(f"| {systeme} | {region} | {len(rs)} | {n['BodyParts3D']} | {n['partiel']} | "
                      f"{n['secours 3D']} | {n['2D']} | {100 * en_3d / len(rs):.0f} % |")

    a_trancher = [r for r in resultats if r["correspondance"] not in RESOLUES]
    lignes += ["", "## Correspondances FMA à trancher", ""]
    if a_trancher:
        lignes += ["| Id | Nom français | Statut | Candidats |", "| --- | --- | --- | --- |"]
        lignes += [f"| {r['id']} | {r['nom_fr']} | {r['correspondance']} | {r['suggestions'] or 'aucun'} |" for r in a_trancher]
    else:
        lignes.append("Aucune : chaque structure a une correspondance exacte ou manuelle.")

    manquants = [r for r in resultats if r["maillage"] != "oui" and r["correspondance"] in RESOLUES]
    lignes += ["", "## Absents ou partiels dans BodyParts3D", ""]
    if manquants:
        lignes += ["| Id | Nom français | Niveau | BodyParts3D | Z-Anatomy | HRA femme | HRA homme | Solution proposée | Export Z-Anatomy |",
                   "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
        lignes += [f"| {r['id']} | {r['nom_fr']} | {r['niveau']} | {r['maillage']} | {r['zanatomy']} | "
                   f"{r['hra_femme']} | {r['hra_homme']} | {r['solution_secours']} | {r['export_zanatomy'] or '-'} |"
                   for r in manquants]
    else:
        lignes.append("Aucun.")

    ecarts = [r for r in resultats if r["nom_differe_ta2"] != "non" or r["nom_differe_wikidata"] != "non"]
    lignes += ["", "## Nomenclature : écarts avec la TA2 française et Wikidata", "",
               "Comparaison du nom de la liste avec deux références françaises non officielles : la traduction "
               "de la TA2 fournie par Z-Anatomy et le libellé français de Wikidata. "
               "Le nom retenu reste celui des ronéos.", ""]
    if ecarts:
        lignes += ["| Id | Nom de la liste | TA2 français | Wikidata français |", "| --- | --- | --- | --- |"]
        lignes += [f"| {r['id']} | {r['nom_fr']} | {'=' if r['nom_differe_ta2'] == 'non' else r['nom_ta2_fr'] or 'non trouvé'} | "
                   f"{'=' if r['nom_differe_wikidata'] == 'non' else r['nom_wikidata_fr'] or 'non trouvé'} |"
                   for r in ecarts]
        lignes += ["", "« = » : identique au nom de la liste."]
    else:
        lignes.append("Aucun écart.")
    SORTIE_MD.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    journal("OK", f"Rapport écrit : {SORTIE_MD.relative_to(RACINE)}")


def remplir_liste(listes, resultats):
    par_id = {r["id"]: r for r in resultats}
    n = 0
    for entete, lignes in listes:
        for l in lignes:
            r = par_id[l["id"]]
            if not l["fma_id"].strip() and r["correspondance"] in ("exacte", "par côtés"):
                l["fma_id"] = r["fma_id"]
                n += 1
        if lignes:
            ecrire_fichier(lignes[0]["_fichier"], entete, lignes)
    journal("OK", f"Liste noyau : {n} identifiants FMA ajoutés.")


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    if not TABLES.exists():
        journal("FAIL", f"Tables BodyParts3D introuvables dans {TABLES}. "
                "Conséquence : inventaire impossible. Action : télécharger les tables.")
        sys.exit(1)
    noms, elements, enfants, par_nom = charger_tables()
    journal("OK", f"Tables lues : {len(noms)} concepts FMA.")
    presents = charger_archive()

    listes = [lire_fichier(c) for c in fichiers_listes()]
    lignes = [l for _, ls in listes for l in ls]
    entete = listes[0][0]
    # Un ";" dans une remarque crée une colonne de trop (clé None) ou en retire une (valeur None)
    mal_formees = [l.get("id") or "?" for l in lignes if None in l or None in l.values()]
    if mal_formees:
        journal("FAIL", f"Lignes mal formées dans la liste noyau : {', '.join(mal_formees)}. "
                f"Conséquence : inventaire arrêté. Action : chaque ligne doit avoir {len(entete) + 1} colonnes, "
                "sans « ; » dans les textes.")
        sys.exit(1)
    journal("OK", f"Liste noyau lue : {len(lignes)} structures.")

    geo = Geometrie(noms, elements, par_nom) if presents is not None else None
    sources = charger_secours()
    ta2 = charger_ta2()
    wikidata = charger_wikidata()
    arbre = rattachements_arbre()
    resultats = [analyser(l, (noms, elements, enfants, par_nom), presents, geo, sources, ta2, wikidata, arbre)
                 for l in lignes]
    noter_exports(resultats)
    ecrire_csv(resultats)
    ecrire_rapport(resultats, presents is not None)
    if "--remplir" in sys.argv:
        remplir_liste(listes, resultats)

    a_trancher = sum(r["correspondance"] not in RESOLUES for r in resultats)
    if a_trancher:
        journal("WARN", f"{a_trancher} correspondances FMA non résolues. "
                "Conséquence : couverture incomplète pour ces structures. "
                "Action : voir la section « à trancher » du rapport.")


if __name__ == "__main__":
    main()
