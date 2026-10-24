"""Arbre vasculaire : rattache chaque maillage de vaisseau à la structure de la liste dont il fait partie.

Les tables de BodyParts3D ne suffisent pas : leur arbre « partie de » est aplati et asymétrique
(le tronc brachio-céphalique y contient tout l'arbre artériel droit, du cerveau à la main, l'ulnaire
y est rangée sous la subclavière, le tronc basilaire sous la vertébrale droite). Deux tables éditées
à la main font foi :
  - donnees/listes/arbre_vasculaire.csv : pour chaque concept (nom anglais FMA, sans côté quand il
    existe des deux côtés), son lien avec le vaisseau d'origine : structure de la liste, partie,
    branche (artère), affluent (veine), anastomose (plusieurs vaisseaux), hors arbre ;
  - donnees/listes/corrections_maillages.csv : maillages mal étiquetés dans BodyParts3D (repérés par
    leur position et leurs contacts) et doublons.

Résolution d'un maillage : on remonte de parent en parent jusqu'à une structure de la liste.
Le maillage est « propre » à la structure s'il n'a franchi que des liens « partie ».
"""

import csv
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ARBRE = RACINE / "donnees" / "listes" / "arbre_vasculaire.csv"
CORRECTIONS = RACINE / "donnees" / "listes" / "corrections_maillages.csv"

RELATIONS = ("structure", "partie", "branche", "affluent", "anastomose", "hors")
COTE_EN = {"droit": "right", "gauche": "left"}


def lire_csv(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def sans_cote(nom):
    """'acromial branch of right thoraco-acromial artery' -> ('acromial branch of thoraco-acromial artery', 'droit')."""
    m = re.search(r"\b(right|left)\b", nom)
    cote = ("droit" if m.group(1) == "right" else "gauche") if m else None
    return re.sub(r"\b(right|left) ", "", nom).strip(), cote


class Arbre:
    def __init__(self):
        self.lignes = {}
        self.erreurs = []
        for l in lire_csv(ARBRE):
            cle = l["concept"].strip().lower()
            if cle in self.lignes:
                self.erreurs.append(f"concept en double : {cle}")
            if l["relation"] not in RELATIONS:
                self.erreurs.append(f"{cle} : relation inconnue « {l['relation']} »")
            if l["relation"] == "structure" and not l["id_liste"]:
                self.erreurs.append(f"{cle} : structure sans id_liste")
            if l["relation"] in ("partie", "branche", "affluent", "anastomose") and not l["parent"]:
                self.erreurs.append(f"{cle} : {l['relation']} sans parent")
            self.lignes[cle] = l
        self.corrections = {l["fj"]: l for l in lire_csv(CORRECTIONS)} if CORRECTIONS.exists() else {}

    def nom_corrige(self, fj, nom_en):
        """Nom anglais à utiliser pour un maillage, et la correction appliquée (ou None)."""
        c = self.corrections.get(fj)
        if not c:
            return nom_en, None
        return (c["nom_en"] or nom_en), c

    def ligne(self, nom, cote):
        """Ligne de l'arbre pour un nom et un côté : nom complet, puis nom avec le côté, puis sans côté."""
        nom = nom.strip().lower()
        if nom in self.lignes:
            return self.lignes[nom], nom
        base, cote_nom = sans_cote(nom)
        cote = cote_nom or cote
        if cote and f"{COTE_EN[cote]} {base}" in self.lignes:
            cle = f"{COTE_EN[cote]} {base}"
            return self.lignes[cle], cle
        if base in self.lignes:
            return self.lignes[base], base
        return None, nom

    def resoudre(self, nom_en, cote=None):
        """Renvoie {structure, propre, relation, parent, chemin, remarque} ; structure None si le concept
        est inconnu de l'arbre, hors arbre, ou une anastomose entre structures différentes."""
        base, cote_nom = sans_cote(nom_en.lower())
        cote = cote_nom or cote
        ligne, cle = self.ligne(nom_en, cote)
        res = {"structure": None, "propre": False, "relation": None, "parent": None, "chemin": [],
               "remarque": ligne["remarque"] if ligne else "", "inconnu": ligne is None}
        if ligne is None:
            return res
        res["relation"] = ligne["relation"]
        propre, vus = True, set()
        while ligne and cle not in vus:
            vus.add(cle)
            res["chemin"].append(cle)
            if ligne["relation"] == "structure":
                res["structure"], res["propre"] = ligne["id_liste"], propre
                return res
            if ligne["relation"] == "hors":
                return res
            parent = ligne["parent_gauche"] if cote == "gauche" and ligne["parent_gauche"] else ligne["parent"]
            if ligne["relation"] != "partie":
                propre = False
            if res["parent"] is None:
                res["parent"] = parent
            if "|" in parent:
                # Anastomose ou affluent de plusieurs vaisseaux : structure commune seulement si elle est unique
                issues = {self.resoudre(p, cote)["structure"] for p in parent.split("|")}
                if len(issues) == 1:
                    res["structure"] = issues.pop()
                return res
            ligne, cle = self.ligne(parent, cote)
        return res
