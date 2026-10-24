-- Schéma de la base de l'atlas. Source unique, lue par le pipeline Python (pipeline/base.py)
-- et intégrée au lanceur Go (lanceur/base.go). Toute évolution doit rester compatible : CREATE ... IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS structure (
    id TEXT PRIMARY KEY,
    fma_id TEXT,
    nom_fr TEXT NOT NULL,
    synonymes_fr TEXT NOT NULL DEFAULT '[]',
    nom_latin TEXT,
    systeme TEXT NOT NULL,
    region TEXT NOT NULL,
    cote TEXT NOT NULL,
    parent_id TEXT REFERENCES structure(id),
    niveau TEXT NOT NULL CHECK (niveau IN ('noyau', 'approfondissement')),
    couverture TEXT
);
CREATE TABLE IF NOT EXISTS relation (
    id INTEGER PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES structure(id),
    cible_id TEXT NOT NULL REFERENCES structure(id),
    type TEXT NOT NULL,
    cote TEXT CHECK (cote IS NULL OR cote IN ('droit', 'gauche')),
    sources TEXT NOT NULL DEFAULT '[]',
    UNIQUE (source_id, cible_id, type, cote)
);
CREATE TABLE IF NOT EXISTS fiche (
    structure_id TEXT PRIMARY KEY REFERENCES structure(id),
    champs TEXT NOT NULL,
    relations TEXT NOT NULL DEFAULT '[]',
    remarques TEXT NOT NULL DEFAULT '[]',
    statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'verifie')),
    empreinte_brouillon TEXT,
    proposition TEXT,
    modifie_par TEXT NOT NULL DEFAULT 'claude',
    modifie_le TEXT NOT NULL,
    verifie_le TEXT,
    note TEXT
);
CREATE TABLE IF NOT EXISTS fiche_historique (
    id INTEGER PRIMARY KEY,
    structure_id TEXT NOT NULL REFERENCES structure(id),
    champs TEXT NOT NULL,
    relations TEXT NOT NULL,
    statut TEXT NOT NULL,
    modifie_par TEXT NOT NULL,
    modifie_le TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parcours (
    id TEXT PRIMARY KEY,
    titre TEXT NOT NULL,
    bloc TEXT NOT NULL,
    etapes TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS carte (
    id INTEGER PRIMARY KEY,
    structure_id TEXT NOT NULL REFERENCES structure(id),
    type TEXT NOT NULL,
    contenu TEXT NOT NULL DEFAULT '{}',
    etat_fsrs TEXT,
    echeance TEXT
);
-- Parcours guidés terminés : leurs structures passent en tête des nouvelles cartes
CREATE TABLE IF NOT EXISTS parcours_suivi (
    id INTEGER PRIMARY KEY,
    parcours_id TEXT NOT NULL,
    termine_le TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    structures TEXT NOT NULL DEFAULT '[]'
);
-- Les colonnes cle, statut, cree_le et ordre de carte sont ajoutées par le lanceur (lanceur/revisions.go)
CREATE TABLE IF NOT EXISTS revision (
    id INTEGER PRIMARY KEY,
    carte_id INTEGER NOT NULL REFERENCES carte(id),
    date TEXT NOT NULL,
    note INTEGER NOT NULL CHECK (note BETWEEN 1 AND 4),
    duree_ms INTEGER
);
CREATE INDEX IF NOT EXISTS relation_source ON relation(source_id);
CREATE INDEX IF NOT EXISTS relation_cible ON relation(cible_id);
CREATE INDEX IF NOT EXISTS historique_structure ON fiche_historique(structure_id);
