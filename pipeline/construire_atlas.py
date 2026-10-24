"""Construit app/public/donnees/atlas.json : ce que l'interface doit savoir de chaque maillage.

Pour chaque nœud des GLB (fichier FJ de BodyParts3D ou objet Z-Anatomy) :
  - la structure de la liste noyau à laquelle il se rattache : la plus petite qui le contient
    (la coronaire droite contient le rameau interventriculaire postérieur, qui n'est pas noyau) ;
  - s'il est la structure elle-même ou une de ses branches ;
  - son côté et un nom français, avec la source du nom (liste, Wikidata, TA2, anglais FMA).

Usage : python -I pipeline/construire_atlas.py
"""

import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from focus import organes, os_, regions  # noqa: E402
from arbre_vasculaire import COTE_EN, Arbre, sans_cote  # noqa: E402
from inventaire_couverture import charger_ta2, variantes_en  # noqa: E402
from listes import CALQUE_SYSTEME, lire_listes  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
INVENTAIRE = RACINE / "rapports" / "inventaire_couverture.csv"
WIKIDATA = RACINE / "donnees" / "derive" / "wikidata_fma.csv"
TRADUCTIONS = RACINE / "donnees" / "listes" / "traductions_fr.csv"
ORGANES_ZA = RACINE / "donnees" / "derive" / "organes_zanatomy.json"
LEGENDES_OS = RACINE / "donnees" / "derive" / "legendes_squelette.json"
RONEOS = RACINE / "donnees" / "derive" / "roneos"
MODELES = RACINE / "modeles"
SORTIE = RACINE / "app" / "public" / "donnees" / "atlas.json"

# Calques de l'interface : code couleur du plan, doublé d'une étiquette
CALQUES = [
    {"id": "arteres", "nom": "Artères", "couleur": "#c81e1e", "touche": "A", "visible": True,
     "fichiers": ["bp3d_arteres.glb", "zanatomy_arteres.glb"]},
    {"id": "veines", "nom": "Veines", "couleur": "#2a4fc0", "touche": "V", "visible": True,
     "fichiers": ["bp3d_veines.glb", "zanatomy_veines.glb"]},
    {"id": "os", "nom": "Os", "couleur": "#ede5cc", "touche": "O", "visible": True, "repere": True,
     "fichiers": ["bp3d_os.glb", "zanatomy_os.glb"]},
    {"id": "muscles", "nom": "Muscles", "couleur": "#8c382e", "touche": "M", "visible": False,
     "fichiers": ["bp3d_muscles.glb"]},
    {"id": "autres", "nom": "Organes et autres", "couleur": "#d9b399", "touche": "R", "visible": False,
     "fichiers": ["bp3d_autres.glb", "zanatomy_organes.glb"]},
]
SYSTEME_CALQUE = {"artère": "arteres", "veine": "veines"}


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def lire_csv(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def forme_recherche(texte):
    """Minuscules, sans accents ni ponctuation : « Épine iliaque antéro-supérieure » -> « epine iliaque antero superieure »."""
    import unicodedata
    t = unicodedata.normalize("NFD", texte.lower().replace("œ", "oe").replace("’", "'"))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return " " + re.sub(r"[^a-z0-9]+", " ", t).strip() + " "


def texte_roneos():
    """Texte de toutes les ronéos extraites, en forme de recherche (vide si elles manquent)."""
    if not RONEOS.exists():
        return ""
    return "".join(forme_recherche(f.read_text(encoding="utf-8", errors="replace")) for f in sorted(RONEOS.glob("*.txt")))


def cote_et_base(nom_en):
    """'right conus artery' -> ('droit', 'conus artery')."""
    m = re.match(r"^(right|left) (.+)$", nom_en)
    if m:
        return ("droit" if m.group(1) == "right" else "gauche"), m.group(2)
    return None, nom_en


def normaliser(nom):
    """Forme comparable d'un nom anglais : sans côté, sans 'trunk of', en minuscules."""
    nom = re.sub(r"\b(right|left) ", "", nom.lower())
    return re.sub(r"^(trunk of|segment of) ", "", nom).strip()


class Nommeur:
    """Nom français d'un concept : table de traduction (rédigée par Claude), sinon Wikidata, sinon TA2,
    sinon nom anglais FMA.

    La table (donnees/listes/traductions_fr.csv) prime : la TA2 traduite de Z-Anatomy contient des
    coquilles (« Troisème côte ») et Wikidata des titres d'articles plutôt que des termes anatomiques.
    Elle accepte un côté générique : « abdominal part of {side} pectoralis major » se traduit
    « partie abdominale du muscle grand pectoral {droit} », {droit} et {droite} donnant l'accord.
    """

    def __init__(self):
        self.wikidata = {l["fma_id"]: l["libelle_fr"] for l in lire_csv(WIKIDATA) if l["libelle_fr"]} \
            if WIKIDATA.exists() else {}
        self.ta2_en, _ = charger_ta2()
        self.table = {l["nom_en"].strip().lower(): l["nom_fr"].strip() for l in lire_csv(TRADUCTIONS)
                      if l["nom_fr"].strip()} if TRADUCTIONS.exists() else {}
        self.sans_traduction = set()

    def traduire(self, base):
        if base in self.table:
            return self.table[base]
        m = re.search(r"\b(right|left)\b", base)
        if m:
            # Tous les côtés du nom deviennent {side} ; l'accord suit le premier
            generique = re.sub(r"\b(right|left)\b", "{side}", base)
            if generique in self.table:
                droit = m.group(1) == "right"
                return (self.table[generique].replace("{droit}", "droit" if droit else "gauche")
                        .replace("{droite}", "droite" if droit else "gauche"))
        return None

    def nommer(self, fma_id, nom_en):
        _, base = cote_et_base(nom_en.lower().strip())
        # Le nom entier d'abord : « right border of heart » n'est pas le côté droit d'un organe pair
        traduit = self.traduire(nom_en.lower().strip()) if nom_en.lower().strip() in self.table else self.traduire(base)
        if traduit:
            return traduit, "traduction Claude"
        if fma_id in self.wikidata:
            return self.wikidata[fma_id], "Wikidata"
        for v in variantes_en(base):
            if v in self.ta2_en:
                return self.ta2_en[v][1].lower(), "TA2 (Z-Anatomy)"
        self.sans_traduction.add(base)
        return base, "anglais FMA"


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    for chemin in (INVENTAIRE, MODELES / "index_maillages.csv"):
        if not chemin.exists():
            journal("FAIL", f"{chemin.relative_to(RACINE)} absent. Action : relancer les étapes précédentes du pipeline.")
            sys.exit(1)
    liste = {l["id"]: l for l in lire_listes()}
    inventaire = {l["id"]: l for l in lire_csv(INVENTAIRE)}
    nommeur = Nommeur()

    structures = {}
    for i, l in liste.items():
        structures[i] = {
            "nom": l["nom_fr"], "synonymes": [s for s in l["synonymes_fr"].split("|") if s],
            "systeme": l["systeme"], "region": l["region"], "niveau": l["niveau"], "cote": l["cote"],
            "fma_id": l["fma_id"] if l["fma_id"].startswith("FMA") else "",
            "couverture": inventaire[i]["solution_secours"] or "BodyParts3D",
            "noeuds": [],
        }

    # Fichiers BodyParts3D de chaque structure : rattachement à la plus petite qui les contient
    contenants = defaultdict(list)
    for i, r in inventaire.items():
        for fj in filter(None, r["fichiers"].split("|")):
            contenants[fj].append(i)
    taille = {i: len([f for f in r["fichiers"].split("|") if f]) for i, r in inventaire.items()}

    index_bp3d = lire_csv(MODELES / "index_maillages.csv")
    # "right X" n'est un côté du corps que si "left X" existe aussi (sinon : coronaire droite, colique droite...)
    arbre = Arbre()
    for e in arbre.erreurs:
        journal("FAIL", f"arbre_vasculaire.csv : {e}. Action : corriger donnees/listes/arbre_vasculaire.csv.")
    if arbre.erreurs:
        sys.exit(1)
    # Noms corrigés compris (« right inferior phrenic vein » pour une veine mal étiquetée)
    noms_index = {arbre.nom_corrige(l["fj"], l["nom_en"])[0] for l in index_bp3d}
    paires = {n for n in noms_index if (c := cote_et_base(n))[0]
              and f"{'left' if c[0] == 'droit' else 'right'} {c[1]}" in noms_index}

    parents_sans_nom = set()

    def nom_parent(parent_en, cote):
        """Nom français du vaisseau d'origine : nom de la liste si c'est une structure, sinon traduction."""
        noms = []
        for p in parent_en.split("|"):
            ligne, _ = arbre.ligne(p, cote)
            if ligne and ligne["relation"] == "structure":
                noms.append(liste[ligne["id_liste"]]["nom_fr"])
                continue
            nom, source = nommeur.nommer("", p)
            if source == "anglais FMA" and cote:
                # La table écrit le côté là où l'anglais le place : « medial branch of {side} superior cerebellar artery »
                mots = p.split()
                for k in range(len(mots)):
                    traduit = nommeur.traduire(" ".join(mots[:k] + [COTE_EN[cote]] + mots[k:]))
                    if traduit:
                        nom, source = traduit, "traduction Claude"
                        break
            if source == "anglais FMA":
                parents_sans_nom.add(p)
            noms.append(nom)
        return " et ".join(noms)

    def rattacher(noeud, nom_en, cote):
        """Structure, propre, lien et parent d'un nœud de vaisseau d'après l'arbre vasculaire."""
        r = arbre.resoudre(nom_en, cote)
        if r["inconnu"]:
            inconnus.add(nom_en)
        noeud.update({"structure": r["structure"], "propre": r["propre"]})
        if r["parent"] and not r["propre"]:
            noeud["lien"] = r["relation"]
            noeud["parent"] = nom_parent(r["parent"], cote)
        elif r["parent"]:
            noeud["lien"] = "partie"
            noeud["parent"] = nom_parent(r["parent"], cote)
        if r["remarque"]:
            noeud["remarque_arbre"] = r["remarque"]
        return r

    inconnus = set()
    noeuds = {}
    for l in index_bp3d:
        fj, nom_en = l["fj"], l["nom_en"]
        vaisseau = l["systeme"] in ("arteres", "veines")
        correction = None
        if vaisseau:
            nom_en, correction = arbre.nom_corrige(fj, nom_en)
            x = float(l["centre_x"])  # repère glTF : droite du sujet vers -X
            cote_geo = "droit" if x < -0.005 else "gauche" if x > 0.005 else None
            structure = arbre.resoudre(nom_en, cote_geo)["structure"]
        else:
            structure = min(contenants[fj], key=lambda i: taille[i]) if contenants.get(fj) else None
        bilateral = liste[structure]["cote"] == "bilatéral" if structure else nom_en in paires
        if vaisseau and not bilateral:
            # « right inferior phrenic vein » : côté du corps quand l'arbre connaît le nom sans côté,
            # pas « right coronary artery », qui y figure en entier
            bilateral = arbre.ligne(nom_en, None)[1] != nom_en.lower().strip() and sans_cote(nom_en.lower())[1] is not None
        cote = None
        if bilateral:
            cote = cote_et_base(nom_en)[0]
            if cote is None:
                x = float(l["centre_x"])  # repère glTF : droite du sujet vers -X
                cote = "droit" if x < -0.005 else "gauche" if x > 0.005 else None
        # Un nom corrigé n'a plus de concept FMA fiable : la traduction se fait sur le nom seul
        nom, source_nom = nommeur.nommer("" if correction else l["fma_id"], nom_en)
        noeud = {"calque": l["systeme"], "structure": structure, "propre": False, "cote": cote,
                 "nom": nom, "source_nom": source_nom, "nom_en": nom_en, "fma_id": "" if correction else l["fma_id"],
                 "source": "BodyParts3D"}
        if vaisseau:
            rattacher(noeud, nom_en, cote or cote_geo)
        if correction:
            noeud["etiquette_bp3d"] = correction["etiquette_bp3d"]
            noeud["correction"] = correction["justification"]
            if correction["action"] == "doublon":
                noeud.update({"doublon": True, "structure": None, "propre": False})
        if noeud["propre"]:
            noeud["nom"], noeud["source_nom"] = liste[noeud["structure"]]["nom_fr"], "liste noyau"
        noeuds[fj] = noeud
        if noeud["structure"]:
            structures[noeud["structure"]]["noeuds"].append(fj)

    # Objets Z-Anatomy : structures et segments de raccord
    index_za = MODELES / "index_zanatomy.csv"
    for l in lire_csv(index_za) if index_za.exists() else []:
        objet = l["objet"]
        cote = {"r": "droit", "l": "gauche"}.get(objet[-1]) if objet[-2:-1] == "." else None
        if objet.startswith(("Right ", "Left ")):
            cote = "droit" if objet.startswith("Right ") else "gauche"
        nom, source_nom = nommeur.nommer("", l["nom_en"])
        noeud = {"calque": l["systeme"], "structure": None, "propre": False, "cote": cote, "nom": nom,
                 "source_nom": source_nom, "nom_en": l["nom_en"], "fma_id": l["fma_id"],
                 "source": "Z-Anatomy" + (" (segment de raccord)" if l["role"] == "raccord" else ""),
                 "ecart_origine_mm": l["ecart_origine_mm"]}
        if l["role"] == "structure":
            noeud.update({"structure": l["id_liste"], "propre": True})
        else:
            # Raccord : partie d'une structure de la liste (carotide commune) ou branche d'une autre
            rattacher(noeud, l["nom_en"], cote)
        if noeud["propre"]:
            noeud["nom"], noeud["source_nom"] = liste[noeud["structure"]]["nom_fr"], "liste noyau"
        noeuds[objet] = noeud
        if noeud["structure"]:
            structures[noeud["structure"]]["noeuds"].append(objet)

    # Structures faites d'autres structures (cercle artériel du cerveau) : leurs maillages d'après l'inventaire
    for i, s in structures.items():
        if not s["noeuds"] and inventaire[i]["fichiers"] and liste[i]["systeme"] in SYSTEME_CALQUE:
            s["noeuds"] = [fj for fj in inventaire[i]["fichiers"].split("|") if fj in noeuds]

    # Organes de Z-Anatomy (pipeline/organes_zanatomy.py) : nœuds du calque organes
    index_org = MODELES / "index_zanatomy_organes.csv"
    lignes_org = lire_csv(index_org) if index_org.exists() else []
    objets_org = {l["objet"] for l in lignes_org}
    for l in lignes_org:
        objet = l["objet"]
        # Un côté seulement si l'objet existe des deux côtés (Kidney.l et Kidney.r)
        cote = None
        if re.search(r"\.[lr]$", objet) and f"{objet[:-2]}.{'r' if objet[-1] == 'l' else 'l'}" in objets_org:
            cote = "droit" if objet.endswith(".r") else "gauche"
        nom, source_nom = nommeur.nommer("", l["nom_en"])
        noeuds[objet] = {"calque": l.get("systeme") or "autres", "structure": None, "propre": False, "cote": cote, "nom": nom,
                         "source_nom": source_nom, "nom_en": l["nom_en"], "fma_id": "",
                         "source": "Z-Anatomy (CC BY-SA 4.0), recalé sur BodyParts3D"}
        if l["rendu"]:
            noeuds[objet]["rendu"] = l["rendu"]
    extra = json.loads(ORGANES_ZA.read_text(encoding="utf-8")) if ORGANES_ZA.exists() else {}
    for fj in extra.get("doublons_bp3d", []):
        if fj in noeuds:
            noeuds[fj]["doublon"] = True

    les_regions = regions(index_bp3d)
    les_organes, organes_manquants = organes(index_bp3d, lignes_org, {k for k, n in noeuds.items() if n.get("doublon")})
    les_os, os_manquants = os_(index_bp3d, lignes_org)
    les_organes += les_os
    organes_manquants += os_manquants

    # Organes et os de la liste (blocs 3 et 4) : maillages de leur focus du catalogue (colonne « focus »),
    # Z-Anatomy compris (lobes pulmonaires, coccyx) ; un os pair prend ses deux focus, droit et gauche
    par_focus = {o["id"]: o for o in les_organes}
    for i, l in liste.items():
        f = (l.get("focus") or "").strip()
        if not f:
            continue
        ids = [k for k in par_focus if k == f or re.fullmatch(rf"{re.escape(f)}-(droit|gauche)", k)]
        if not ids:
            journal("WARN", f"{i} ({l['nom_fr']}) : focus « {f} » absent du catalogue. Conséquence : structure sans "
                    "maillage. Action : corriger la colonne focus de la liste noyau.")
            continue
        for k in ids:
            for cle in par_focus[k]["parties"]:
                n = noeuds.get(cle)
                if n is None or n.get("doublon"):
                    continue
                if n["structure"] is None or n["structure"] == i:
                    n["structure"] = i
                elif n["calque"] not in ("arteres", "veines"):
                    journal("WARN", f"{cle} ({n['nom']}) : rattaché à {n['structure']}, aussi dans le focus de {i}. "
                            "Conséquence : la plus petite structure garde le maillage.")
                structures[i]["noeuds"].append(cle)
    # Un maillage dans deux structures (un muscle et son groupe) fausserait « localiser » : signalé
    double = defaultdict(list)
    for i, s in structures.items():
        if liste[i]["systeme"] not in ("artère", "veine"):
            for cle in set(s["noeuds"]):
                double[cle].append(i)
    double = {k: v for k, v in double.items() if len(v) > 1}
    if double:
        exemples = ", ".join(f"{k} ({'/'.join(v)})" for k, v in list(double.items())[:4])
        journal("WARN", f"{len(double)} maillages dans plusieurs structures de la liste : {exemples}. Action : garder le "
                "groupe ou ses membres, pas les deux.")

    sans_noeud = [i for i, s in structures.items() if not s["noeuds"]]
    for s in structures.values():
        s["noeuds"] = sorted(set(s["noeuds"]))
    # Légendes de Z-Anatomy (organes, puis os : pipeline/legendes_squelette.py) : rattachées à chaque
    # organe ou os qui contient le maillage porteur
    legendes_os = json.loads(LEGENDES_OS.read_text(encoding="utf-8"))["legendes"] if LEGENDES_OS.exists() else []
    if not LEGENDES_OS.exists():
        journal("WARN", f"{LEGENDES_OS.relative_to(RACINE)} absent. Conséquence : os sans repères légendés. "
                "Action : lancer python -I pipeline/legendes_squelette.py.")
    reperes, sans_organe = 0, 0
    roneos = texte_roneos()
    cites = set()
    for o in les_organes:
        o["reperes"] = []
    for leg in extra.get("legendes", []) + legendes_os:
        nom, source_nom = nommeur.nommer("", leg["nom_en"])
        entree = {"nom": nom, "nom_en": leg["nom_en"], "cle": leg["cle"], "p": leg["p"], "source_nom": source_nom}
        if leg["inconstant"]:
            entree["inconstant"] = True
        if leg.get("calcule"):
            entree["calcule"] = True
        if leg.get("approchee"):
            entree["approchee"] = True
        if leg.get("reporte"):
            entree["reporte"] = nommeur.nommer("", leg["reporte"])[0]
        if leg.get("correction"):
            entree["correction"] = leg["correction"]
        # Nom cité tel quel dans les ronéos d'Eliott : repère du programme, à apprendre en premier
        if roneos and forme_recherche(nom) in roneos:
            entree["roneo"] = True
            cites.add(nom)
        porteurs = [o for o in les_organes if leg["cle"] in set(o["parties"])]
        for o in porteurs:
            o["reperes"].append(entree)
        reperes += bool(porteurs)
        sans_organe += not porteurs
    atlas = {"genere_le": date.today().isoformat(), "calques": CALQUES, "structures": structures, "noeuds": noeuds,
             "regions": les_regions, "organes": les_organes}
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    sources = defaultdict(int)
    for n in noeuds.values():
        sources[n["source_nom"]] += 1
    journal("OK", f"{SORTIE.relative_to(RACINE)} : {len(noeuds)} nœuds, {len(structures)} structures, "
            f"{SORTIE.stat().st_size // 1024} Ko.")
    journal("OK", "Noms des nœuds : " + ", ".join(f"{k} {v}" for k, v in sorted(sources.items(), key=lambda kv: -kv[1])) + ".")
    journal("OK", f"Focus : {len(les_regions)} régions, {len(les_organes) - len(les_os)} organes, {len(les_os)} os "
            f"({sum(len(o['parties']) for o in les_organes)} maillages).")
    tous_noms = {r["nom"] for o in les_organes for r in o["reperes"]}
    journal("OK", f"Repères : {len(cites)} noms sur {len(tous_noms)} cités tels quels dans les ronéos.")
    journal("OK", f"Repères légendés : {reperes} rattachés à un organe"
            + (f", {sans_organe} sans organe (porteur hors des organes du catalogue)." if sans_organe else "."))
    for m in organes_manquants:
        journal("WARN", f"Organe incomplet ou absent : {m}.")
    # Noms restés en anglais à l'affichage (un nom de la liste noyau remplace celui du nommeur)
    anglais = sorted({n["nom"] for n in noeuds.values() if n["source_nom"] == "anglais FMA"}
                     | {r["nom"] for o in les_organes for r in o["reperes"] if r["source_nom"] == "anglais FMA"})
    if anglais:
        journal("WARN", f"{len(anglais)} noms sans traduction française (affichés en anglais FMA). "
                f"Action : compléter {TRADUCTIONS.relative_to(RACINE)}. Exemples : " + ", ".join(anglais[:6]) + ".")
    else:
        journal("OK", "Tous les noms affichés sont en français.")
    if inconnus:
        journal("WARN", f"{len(inconnus)} vaisseaux absents de l'arbre vasculaire (rattachés à aucune structure). "
                f"Action : les ajouter à donnees/listes/arbre_vasculaire.csv. Exemples : {', '.join(sorted(inconnus)[:6])}.")
    if parents_sans_nom:
        journal("WARN", f"{len(parents_sans_nom)} vaisseaux d'origine sans nom français : "
                f"{', '.join(sorted(parents_sans_nom))}. Action : compléter {TRADUCTIONS.relative_to(RACINE)}.")
    if sans_noeud:
        journal("WARN", f"{len(sans_noeud)} structures sans aucun nœud 3D (schéma 2D ou autre modèle) : "
                f"{', '.join(sans_noeud)}.")


if __name__ == "__main__":
    main()
