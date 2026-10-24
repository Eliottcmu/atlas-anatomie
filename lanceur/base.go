package main

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// Champs des fiches, dans l'ordre d'affichage, selon le système (identique à pipeline/base.py)
var champsParSysteme = map[string][]string{
	"artère": {"origine", "trajet", "branches", "terminaison", "territoire", "rapports", "variations", "clinique",
		"pathologie", "reperes"},
	"veine": {"origine", "trajet", "affluents", "terminaison", "territoire", "rapports", "variations", "clinique",
		"pathologie", "reperes"},
	"muscle": {"situation", "origine", "terminaison", "innervation", "vascularisation", "action", "rapports",
		"variations", "clinique", "pathologie"},
	"organe": {"situation", "configuration", "rapports", "fixite", "vascularisation", "innervation", "variations",
		"clinique", "pathologie", "reperes"},
	"os": {"situation", "description", "articulations", "insertions", "rapports", "variations", "clinique",
		"pathologie"},
}

var libellesChamps = map[string]string{
	"origine": "Origine", "trajet": "Trajet", "branches": "Branches", "affluents": "Affluents",
	"terminaison": "Terminaison", "territoire": "Territoire", "rapports": "Rapports",
	"variations": "Variations", "clinique": "Intérêt clinique",
	"pathologie": "Pathologies", "reperes": "Repères physiologiques",
	"situation": "Situation", "innervation": "Innervation", "vascularisation": "Vascularisation",
	"action": "Action", "configuration": "Configuration", "fixite": "Moyens de fixité",
	"description": "Description", "articulations": "Articulations", "insertions": "Insertions musculaires",
}

var typesRelation = map[string]bool{
	"branche_de": true, "fait_suite_a": true, "se_jette_dans": true, "anastomose_avec": true,
	"s_insere_sur": true, "vascularise": true, "draine": true, "innerve": true,
}

const sauvegardesGardees = 15

type Source struct {
	Roneo   string `json:"roneo"`
	Titre   string `json:"titre,omitempty"`
	Fichier string `json:"fichier,omitempty"`
	Pages   []int  `json:"pages"`
}

type Champ struct {
	Texte   string   `json:"texte"`
	Sources []Source `json:"sources"`
}

type Relation struct {
	Type    string   `json:"type"`
	Cible   string   `json:"cible"`
	Cote    *string  `json:"cote"`
	Sources []Source `json:"sources"`
}

func maintenant() string { return time.Now().Format("2006-01-02T15:04:05") }

// ouvrirBase ouvre (ou crée) la base personnelle. Une seule connexion : les écritures sont sérialisées.
func ouvrirBase(chemin string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(chemin)+
		"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("schéma : %w", err)
	}
	return db, nil
}

// sauvegarder fait une copie cohérente de la base (VACUUM INTO) et garde les 15 dernières.
func sauvegarder(db *sql.DB, dossier, motif string) (string, error) {
	if err := os.MkdirAll(dossier, 0o755); err != nil {
		return "", err
	}
	cible := filepath.Join(dossier, fmt.Sprintf("anatomie_%s_%s.sqlite", time.Now().Format("20060102-150405"), motif))
	if _, err := db.Exec("VACUUM INTO ?", cible); err != nil {
		return "", err
	}
	anciennes, _ := filepath.Glob(filepath.Join(dossier, "anatomie_*.sqlite"))
	sort.Strings(anciennes)
	for len(anciennes) > sauvegardesGardees {
		os.Remove(anciennes[0])
		anciennes = anciennes[1:]
	}
	return cible, nil
}

type Fusion struct{ Inserees, MisesAJour, Inchangees, Propositions int }

// fusionnerGraine apporte les structures et les nouveaux brouillons de la graine, sans jamais toucher
// une fiche vérifiée ou corrigée par Eliott : un nouveau brouillon est alors rangé à côté, en proposition.
func fusionnerGraine(db *sql.DB, graine string) (Fusion, error) {
	var f Fusion
	if _, err := os.Stat(graine); err != nil {
		return f, nil
	}
	if _, err := db.Exec("ATTACH DATABASE ? AS g", "file:"+filepath.ToSlash(graine)+"?mode=ro"); err != nil {
		return f, fmt.Errorf("lecture de la graine : %w", err)
	}
	defer db.Exec("DETACH DATABASE g")
	tx, err := db.Begin()
	if err != nil {
		return f, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO structure (id, fma_id, nom_fr, synonymes_fr, nom_latin, systeme, region, cote, parent_id, niveau, couverture)
		SELECT id, fma_id, nom_fr, synonymes_fr, nom_latin, systeme, region, cote, parent_id, niveau, couverture FROM g.structure WHERE true
		ON CONFLICT(id) DO UPDATE SET fma_id = excluded.fma_id, nom_fr = excluded.nom_fr, synonymes_fr = excluded.synonymes_fr,
		  nom_latin = excluded.nom_latin, systeme = excluded.systeme, region = excluded.region, cote = excluded.cote,
		  parent_id = excluded.parent_id, niveau = excluded.niveau, couverture = excluded.couverture`); err != nil {
		return f, fmt.Errorf("structures : %w", err)
	}
	lignes, err := tx.Query(`SELECT gf.structure_id, gf.champs, gf.relations, gf.remarques, gf.empreinte_brouillon,
		f.empreinte_brouillon, f.modifie_par, f.statut
		FROM g.fiche gf LEFT JOIN fiche f ON f.structure_id = gf.structure_id`)
	if err != nil {
		return f, err
	}
	type ligne struct {
		sid, champs, relations, remarques, empreinte string
		actuelle, par, statut                        sql.NullString
	}
	var toutes []ligne
	for lignes.Next() {
		var l ligne
		if err := lignes.Scan(&l.sid, &l.champs, &l.relations, &l.remarques, &l.empreinte, &l.actuelle, &l.par, &l.statut); err != nil {
			lignes.Close()
			return f, err
		}
		toutes = append(toutes, l)
	}
	lignes.Close()
	for _, l := range toutes {
		switch {
		case !l.statut.Valid:
			if _, err := tx.Exec(`INSERT INTO fiche (structure_id, champs, relations, remarques, statut, empreinte_brouillon, modifie_par, modifie_le)
				VALUES (?, ?, ?, ?, 'brouillon', ?, 'claude', ?)`, l.sid, l.champs, l.relations, l.remarques, l.empreinte, maintenant()); err != nil {
				return f, err
			}
			if err := recalculerRelations(tx, l.sid, l.relations); err != nil {
				return f, err
			}
			f.Inserees++
		case l.actuelle.String == l.empreinte:
			f.Inchangees++
		case l.par.String == "claude" && l.statut.String == "brouillon":
			if err := historiser(tx, l.sid); err != nil {
				return f, err
			}
			if _, err := tx.Exec(`UPDATE fiche SET champs = ?, relations = ?, remarques = ?, empreinte_brouillon = ?, modifie_le = ?
				WHERE structure_id = ?`, l.champs, l.relations, l.remarques, l.empreinte, maintenant(), l.sid); err != nil {
				return f, err
			}
			if err := recalculerRelations(tx, l.sid, l.relations); err != nil {
				return f, err
			}
			f.MisesAJour++
		default:
			prop := fmt.Sprintf(`{"champs":%s,"relations":%s,"remarques":%s}`, l.champs, l.relations, l.remarques)
			if _, err := tx.Exec("UPDATE fiche SET proposition = ?, empreinte_brouillon = ? WHERE structure_id = ?",
				prop, l.empreinte, l.sid); err != nil {
				return f, err
			}
			f.Propositions++
		}
	}
	return f, tx.Commit()
}

type executeur interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func historiser(tx executeur, sid string) error {
	_, err := tx.Exec(`INSERT INTO fiche_historique (structure_id, champs, relations, statut, modifie_par, modifie_le)
		SELECT structure_id, champs, relations, statut, modifie_par, modifie_le FROM fiche WHERE structure_id = ?`, sid)
	return err
}

// recalculerRelations : la table relation reflète les relations déclarées dans les fiches (la fiche fait foi).
func recalculerRelations(tx executeur, sid, relationsJSON string) error {
	var relations []Relation
	if err := json.Unmarshal([]byte(relationsJSON), &relations); err != nil {
		return fmt.Errorf("relations de %s : %w", sid, err)
	}
	if _, err := tx.Exec("DELETE FROM relation WHERE source_id = ?", sid); err != nil {
		return err
	}
	for _, r := range relations {
		sources, _ := json.Marshal(r.Sources)
		if sources == nil || string(sources) == "null" {
			sources = []byte("[]")
		}
		if _, err := tx.Exec("INSERT OR IGNORE INTO relation (source_id, cible_id, type, cote, sources) VALUES (?, ?, ?, ?, ?)",
			sid, r.Cible, r.Type, r.Cote, string(sources)); err != nil {
			return err
		}
	}
	return nil
}

// valider renvoie les erreurs de forme d'une fiche (vide si elle est valable).
func valider(db *sql.DB, sid string, champs map[string]Champ, relations []Relation) []string {
	var systeme string
	if err := db.QueryRow("SELECT systeme FROM structure WHERE id = ?", sid).Scan(&systeme); err != nil {
		return []string{"structure " + sid + " inconnue"}
	}
	permis := map[string]bool{}
	for _, c := range champsParSysteme[systeme] {
		permis[c] = true
	}
	var erreurs []string
	for nom := range champs {
		if !permis[nom] {
			erreurs = append(erreurs, fmt.Sprintf("champ « %s » non prévu pour une %s (permis : %s)",
				nom, systeme, strings.Join(champsParSysteme[systeme], ", ")))
		}
	}
	for _, r := range relations {
		if !typesRelation[r.Type] {
			erreurs = append(erreurs, "relation de type inconnu : "+r.Type)
		}
		var n int
		db.QueryRow("SELECT COUNT(*) FROM structure WHERE id = ?", r.Cible).Scan(&n)
		if n == 0 {
			erreurs = append(erreurs, "relation vers une structure inconnue : "+r.Cible)
		}
		if r.Cote != nil && *r.Cote != "droit" && *r.Cote != "gauche" {
			erreurs = append(erreurs, "relation : côté inconnu « "+*r.Cote+" »")
		}
	}
	sort.Strings(erreurs)
	return erreurs
}
