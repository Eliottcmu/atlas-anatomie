"""Base SQLite de l'atlas : schéma, emplacement, sauvegardes, accès aux fiches.

Utilisé par le pipeline (pipeline/construire_base.py) pour construire la base « graine » livrée
avec l'appli. Le schéma est commun avec le lanceur Go : lanceur/schema.sql.

La base vit hors OneDrive (%LOCALAPPDATA%\\AtlasAnatomie\\anatomie.sqlite) : OneDrive qui
synchronise un fichier SQLite ouvert peut le corrompre. Des copies datées sont faites dans
donnees/sauvegardes/ (synchronisées, elles), à chaque démarrage du serveur.
"""

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SCHEMA = (RACINE / "lanceur" / "schema.sql").read_text(encoding="utf-8")
DOSSIER_LOCAL = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "AtlasAnatomie"
CHEMIN_BASE = Path(os.environ.get("ATLAS_BASE", DOSSIER_LOCAL / "anatomie.sqlite"))
SAUVEGARDES = Path(os.environ.get("ATLAS_SAUVEGARDES", RACINE / "donnees" / "sauvegardes"))
SAUVEGARDES_GARDEES = 15

# Champs des fiches, dans l'ordre d'affichage, selon le système
CHAMPS = {
    "artère": ["origine", "trajet", "branches", "terminaison", "territoire", "rapports", "variations", "clinique",
               "pathologie", "reperes"],
    "veine": ["origine", "trajet", "affluents", "terminaison", "territoire", "rapports", "variations", "clinique",
              "pathologie", "reperes"],
}
LIBELLES_CHAMPS = {
    "origine": "Origine", "trajet": "Trajet", "branches": "Branches", "affluents": "Affluents",
    "terminaison": "Terminaison", "territoire": "Territoire", "rapports": "Rapports",
    "variations": "Variations", "clinique": "Intérêt clinique",
    "pathologie": "Pathologies", "reperes": "Repères physiologiques",
}
TYPES_RELATION = ("branche_de", "fait_suite_a", "se_jette_dans", "anastomose_avec",
                  "s_insere_sur", "vascularise", "draine", "innerve")
STATUTS = ("brouillon", "verifie")



def maintenant():
    return datetime.now().isoformat(timespec="seconds")


def ouvrir(chemin=None):
    chemin = Path(chemin or CHEMIN_BASE)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    cnx = sqlite3.connect(chemin)
    cnx.row_factory = sqlite3.Row
    cnx.execute("PRAGMA foreign_keys = ON")
    cnx.execute("PRAGMA journal_mode = WAL")
    cnx.executescript(SCHEMA)
    return cnx


def sauvegarder(cnx, motif="demarrage"):
    """Copie cohérente de la base (API de sauvegarde SQLite) dans donnees/sauvegardes/ ; garde les 15 dernières."""
    SAUVEGARDES.mkdir(parents=True, exist_ok=True)
    cible = SAUVEGARDES / f"anatomie_{datetime.now():%Y%m%d-%H%M%S}_{motif}.sqlite"
    with sqlite3.connect(cible) as copie:
        cnx.backup(copie)
    anciennes = sorted(SAUVEGARDES.glob("anatomie_*.sqlite"))[:-SAUVEGARDES_GARDEES]
    for f in anciennes:
        f.unlink()
    return cible


def lire_fiche(cnx, structure_id):
    ligne = cnx.execute("SELECT * FROM fiche WHERE structure_id = ?", (structure_id,)).fetchone()
    if not ligne:
        return None
    fiche = dict(ligne)
    for cle in ("champs", "relations", "remarques"):
        fiche[cle] = json.loads(fiche[cle])
    fiche["proposition"] = json.loads(fiche["proposition"]) if fiche["proposition"] else None
    return fiche


def historiser(cnx, structure_id):
    """Garde une copie de l'état actuel de la fiche avant de la modifier."""
    cnx.execute("""INSERT INTO fiche_historique (structure_id, champs, relations, statut, modifie_par, modifie_le)
                   SELECT structure_id, champs, relations, statut, modifie_par, modifie_le
                   FROM fiche WHERE structure_id = ?""", (structure_id,))


def recalculer_relations(cnx, structure_id, relations):
    """La table relation reflète les relations déclarées dans les fiches (la fiche fait foi)."""
    cnx.execute("DELETE FROM relation WHERE source_id = ?", (structure_id,))
    for r in relations:
        cnx.execute("INSERT OR IGNORE INTO relation (source_id, cible_id, type, cote, sources) VALUES (?, ?, ?, ?, ?)",
                    (structure_id, r["cible"], r["type"], r.get("cote"),
                     json.dumps(r.get("sources", []), ensure_ascii=False)))


def valider(cnx, structure_id, champs, relations):
    """Erreurs de forme d'une fiche (liste vide si elle est valable)."""
    erreurs = []
    s = cnx.execute("SELECT systeme FROM structure WHERE id = ?", (structure_id,)).fetchone()
    if not s:
        return [f"structure {structure_id} inconnue"]
    permis = CHAMPS.get(s["systeme"], [])
    for nom, valeur in champs.items():
        if nom not in permis:
            erreurs.append(f"champ « {nom} » non prévu pour une {s['systeme']} (permis : {', '.join(permis)})")
        elif not isinstance(valeur, dict) or not isinstance(valeur.get("texte", ""), str):
            erreurs.append(f"champ « {nom} » : forme attendue {{texte, sources}}")
    ids = {r["id"] for r in cnx.execute("SELECT id FROM structure")}
    for r in relations:
        if r.get("type") not in TYPES_RELATION:
            erreurs.append(f"relation de type inconnu : {r.get('type')}")
        if r.get("cible") not in ids:
            erreurs.append(f"relation vers une structure inconnue : {r.get('cible')}")
        if r.get("cote") not in (None, "droit", "gauche"):
            erreurs.append(f"relation : côté inconnu « {r.get('cote')} »")
    return erreurs
