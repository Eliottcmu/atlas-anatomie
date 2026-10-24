"""Construit la base « graine » livrée avec l'appli : structures de la liste noyau et brouillons de fiches.

Au démarrage, le lanceur (lanceur/) fusionne cette graine dans la base personnelle d'Eliott.

Entrées :
  - donnees/listes/liste_noyau_bloc1.csv (structures)
  - donnees/fiches/brouillons/*.json (brouillons rédigés par Claude à partir des ronéos)
  - donnees/fiches/sources.json (codes des ronéos citées)
Règles de fusion, pour ne jamais perdre une vérification :
  - fiche absente : le brouillon est inséré, statut « brouillon » ;
  - fiche encore au stade du brouillon de Claude : remplacée si le brouillon a changé (ancienne version historisée) ;
  - fiche vérifiée ou modifiée par Eliott : jamais touchée ; un nouveau brouillon est rangé à côté, en « proposition ».

Usage : python -I pipeline/construire_base.py [--graine CHEMIN]
  --graine : base neuve à ce chemin (défaut : construction/graine.sqlite). Sans l'option,
             la graine est construite au chemin par défaut.
"""

import csv
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import base  # noqa: E402

LISTE = RACINE / "donnees" / "listes" / "liste_noyau_bloc1.csv"
INVENTAIRE = RACINE / "rapports" / "inventaire_couverture.csv"
TA2 = RACINE / "donnees" / "brut" / "z-anatomy" / "TA2.csv"
FICHES = RACINE / "donnees" / "fiches"
INDEX_RONEOS = RACINE / "donnees" / "derive" / "roneos" / "index.csv"
GRAINE = RACINE / "construction" / "graine.sqlite"


def journal(niveau, message):
    print(f"[{niveau}] {message}")


def lire_csv(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def noms_latins():
    """Nom latin par nom anglais (minuscules), d'après la TA2 traduite fournie par Z-Anatomy."""
    latins = {}
    if TA2.exists():
        with open(TA2, encoding="utf-8-sig") as f:
            for ligne in f:
                champs = ligne.strip().strip('"').split(";")
                if len(champs) >= 3 and champs[0].isdigit():
                    latins.setdefault(champs[1].lower(), champs[2])
    return latins


def importer_structures(cnx):
    liste, inventaire, latins = lire_csv(LISTE), {l["id"]: l for l in lire_csv(INVENTAIRE)}, noms_latins()
    for l in liste:
        cnx.execute("""INSERT INTO structure (id, fma_id, nom_fr, synonymes_fr, nom_latin, systeme, region, cote,
                                              niveau, couverture)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET fma_id = excluded.fma_id, nom_fr = excluded.nom_fr,
                         synonymes_fr = excluded.synonymes_fr, nom_latin = excluded.nom_latin,
                         systeme = excluded.systeme, region = excluded.region, cote = excluded.cote,
                         niveau = excluded.niveau, couverture = excluded.couverture""",
                    (l["id"], l["fma_id"] if l["fma_id"].startswith("FMA") else None, l["nom_fr"],
                     json.dumps([s for s in l["synonymes_fr"].split("|") if s], ensure_ascii=False),
                     latins.get(l["nom_fma_en"].lower()), l["systeme"], l["region"],
                     "bilatéral" if l["cote"] == "bilatéral" else "unique", l["niveau"],
                     inventaire.get(l["id"], {}).get("solution_secours") or "BodyParts3D"))
    return len(liste)


class Sources:
    """Développe « GV26:16-17,19 » en {roneo, titre, fichier, pages} et vérifie que les pages existent."""

    def __init__(self):
        self.codes = {k: v for k, v in json.loads((FICHES / "sources.json").read_text(encoding="utf-8")).items()
                      if not k.startswith("_")}
        self.pages = {}
        if INDEX_RONEOS.exists():
            for l in lire_csv(INDEX_RONEOS):
                self.pages[unicodedata.normalize("NFC", Path(l["fichier"]).stem)] = int(l["pages"])

    def developper(self, ref, erreurs, ou):
        m = re.fullmatch(r"([A-Za-z0-9]+):([\d,\- ]+)", ref.strip())
        if not m or m.group(1) not in self.codes:
            erreurs.append(f"{ou} : référence illisible ou code inconnu « {ref} »")
            return None
        pages = []
        for morceau in m.group(2).split(","):
            a, _, b = morceau.strip().partition("-")
            pages += list(range(int(a), int(b or a) + 1))
        code = self.codes[m.group(1)]
        maxi = self.pages.get(unicodedata.normalize("NFC", code["fichier"]))
        if maxi and max(pages) > maxi:
            erreurs.append(f"{ou} : page {max(pages)} au-delà des {maxi} pages de {m.group(1)}")
        return {"roneo": m.group(1), "titre": code["titre"], "fichier": code["fichier"], "pages": pages}


def lire_brouillons(sources):
    brouillons, erreurs = {}, []
    for chemin in sorted((FICHES / "brouillons").glob("*.json")):
        try:
            contenu = json.loads(chemin.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            erreurs.append(f"{chemin.name} : JSON invalide ({e})")
            continue
        for f in contenu["fiches"]:
            ou = f"{chemin.name} {f['id']}"
            champs = {}
            for nom, valeur in f["champs"].items():
                refs = [sources.developper(r, erreurs, f"{ou} {nom}") for r in valeur.get("sources", [])]
                champs[nom] = {"texte": valeur["texte"].strip(), "sources": [r for r in refs if r]}
            relations = []
            for r in f.get("relations", []):
                refs = [sources.developper(x, erreurs, f"{ou} relation") for x in r.get("sources", [])]
                relations.append({"type": r["type"], "cible": r["cible"], "cote": r.get("cote"),
                                  "sources": [x for x in refs if x]})
            if f["id"] in brouillons:
                erreurs.append(f"{ou} : fiche en double")
            brouillons[f["id"]] = {"champs": champs, "relations": relations, "remarques": f.get("remarques", [])}
    return brouillons, erreurs


def empreinte(b):
    return hashlib.sha256(json.dumps(b, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def fusionner(cnx, brouillons):
    compte = {"inserees": 0, "mises_a_jour": 0, "inchangees": 0, "propositions": 0}
    for sid, b in brouillons.items():
        e = empreinte(b)
        actuelle = cnx.execute("SELECT * FROM fiche WHERE structure_id = ?", (sid,)).fetchone()
        valeurs = (json.dumps(b["champs"], ensure_ascii=False), json.dumps(b["relations"], ensure_ascii=False),
                   json.dumps(b["remarques"], ensure_ascii=False))
        if not actuelle:
            cnx.execute("""INSERT INTO fiche (structure_id, champs, relations, remarques, statut, empreinte_brouillon,
                                              modifie_par, modifie_le) VALUES (?, ?, ?, ?, 'brouillon', ?, 'claude', ?)""",
                        (sid, *valeurs, e, base.maintenant()))
            base.recalculer_relations(cnx, sid, b["relations"])
            compte["inserees"] += 1
        elif actuelle["empreinte_brouillon"] == e:
            compte["inchangees"] += 1
        elif actuelle["modifie_par"] == "claude" and actuelle["statut"] == "brouillon":
            base.historiser(cnx, sid)
            cnx.execute("""UPDATE fiche SET champs = ?, relations = ?, remarques = ?, empreinte_brouillon = ?,
                           modifie_le = ? WHERE structure_id = ?""", (*valeurs, e, base.maintenant(), sid))
            base.recalculer_relations(cnx, sid, b["relations"])
            compte["mises_a_jour"] += 1
        else:
            # Vérifiée ou retouchée par Eliott : on ne touche à rien, le nouveau brouillon attend à côté
            cnx.execute("UPDATE fiche SET proposition = ?, empreinte_brouillon = ? WHERE structure_id = ?",
                        (json.dumps(b, ensure_ascii=False), e, sid))
            compte["propositions"] += 1
    return compte


def importer(cnx, sauvegarde=True):
    """Structures et brouillons dans la base. Renvoie (nombre de structures, compte, erreurs) ;
    en cas d'erreur dans les brouillons, rien n'est importé."""
    sources = Sources()
    brouillons, erreurs = lire_brouillons(sources)
    with cnx:
        n = importer_structures(cnx)
        for sid, b in brouillons.items():
            erreurs += [f"{sid} : {e}" for e in base.valider(cnx, sid, b["champs"], b["relations"])]
    if erreurs:
        return n, None, erreurs
    if sauvegarde and cnx.execute("SELECT COUNT(*) FROM fiche").fetchone()[0]:
        journal("OK", f"Sauvegarde avant import : {base.sauvegarder(cnx, 'import').name}")
    with cnx:
        compte = fusionner(cnx, brouillons)
    return n, compte, []


def main():
    # Console Windows : accents lisibles quel que soit le code de page
    sys.stdout.reconfigure(encoding="utf-8")
    chemin = Path(sys.argv[sys.argv.index("--graine") + 1]) if "--graine" in sys.argv else GRAINE
    # La graine est toujours neuve : aucune donnée personnelle n'y entre
    for suffixe in ("", "-wal", "-shm"):
        Path(f"{chemin}{suffixe}").unlink(missing_ok=True)
    cnx = base.ouvrir(chemin)
    n, compte, erreurs = importer(cnx, sauvegarde=False)
    if erreurs:
        for e in erreurs:
            journal("FAIL", e)
        journal("FAIL", f"{len(erreurs)} erreurs dans les brouillons. Conséquence : aucune fiche importée. "
                "Action : corriger les fichiers de donnees/fiches/brouillons/ puis relancer.")
        sys.exit(1)
    noyau = cnx.execute("SELECT COUNT(*) FROM structure WHERE niveau = 'noyau'").fetchone()[0]
    avec = cnx.execute("""SELECT COUNT(*) FROM fiche f JOIN structure s ON s.id = f.structure_id
                          WHERE s.niveau = 'noyau'""").fetchone()[0]
    cnx.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    cnx.execute("PRAGMA journal_mode = DELETE")
    cnx.close()
    journal("OK", f"Graine : {chemin}")
    journal("OK", f"{n} structures, {compte['inserees']} brouillons de fiches ; structures noyau avec fiche : {avec} sur {noyau}.")


if __name__ == "__main__":
    main()
