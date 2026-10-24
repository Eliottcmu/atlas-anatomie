package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Serveur : API des fiches (mêmes réponses que l'ancien serveur FastAPI) et fichiers de l'appli.
type Serveur struct {
	db      *sql.DB
	chemins Chemins
	base    string
	sources map[string]InfoSource
	arret   chan<- string
}

type InfoSource struct {
	Titre   string `json:"titre"`
	Fichier string `json:"fichier"`
	Pages   *int   `json:"pages"`
}

func chargerSources(chemin string) (map[string]InfoSource, error) {
	brut, err := os.ReadFile(chemin)
	if err != nil {
		return nil, err
	}
	var tout map[string]json.RawMessage
	if err := json.Unmarshal(brut, &tout); err != nil {
		return nil, err
	}
	res := map[string]InfoSource{}
	for code, v := range tout {
		if strings.HasPrefix(code, "_") {
			continue
		}
		var s InfoSource
		if err := json.Unmarshal(v, &s); err != nil {
			return nil, err
		}
		res[code] = s
	}
	return res, nil
}

func (s *Serveur) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/etat", s.etat)
	mux.HandleFunc("GET /api/sources", func(w http.ResponseWriter, r *http.Request) { envoyer(w, s.sources) })
	mux.HandleFunc("GET /api/fiches", s.listeFiches)
	mux.HandleFunc("GET /api/fiches/{sid}", func(w http.ResponseWriter, r *http.Request) { s.envoyerFiche(w, r.PathValue("sid")) })
	mux.HandleFunc("PUT /api/fiches/{sid}", s.enregistrer)
	mux.HandleFunc("POST /api/fiches/{sid}/proposition", s.proposition)
	mux.HandleFunc("GET /api/fiches/{sid}/historique", s.historique)
	mux.HandleFunc("POST /api/battement", s.battement)
	mux.HandleFunc("POST /api/quitter", s.quitter)
	s.routesRevisions(mux)
	mux.HandleFunc("GET /roneos/{code}", s.roneo)
	mux.Handle("GET /modeles/", http.StripPrefix("/modeles/", fichiersStatiques(s.chemins.Modeles, false)))
	mux.Handle("GET /", fichiersStatiques(s.chemins.App, true))
}

// ------------------------------------------------------------ réponses

func envoyer(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

func refuser(w http.ResponseWriter, code int, detail string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}

func horsRoneo(champsJSON string) []string {
	var champs map[string]Champ
	json.Unmarshal([]byte(champsJSON), &champs)
	res := []string{}
	for nom, c := range champs {
		if strings.TrimSpace(c.Texte) != "" && len(c.Sources) == 0 {
			res = append(res, nom)
		}
	}
	return res
}

func (s *Serveur) etat(w http.ResponseWriter, r *http.Request) {
	var brouillons, verifiees, noyau, noyauVerifie int
	s.db.QueryRow("SELECT COUNT(*) FROM fiche WHERE statut = 'brouillon'").Scan(&brouillons)
	s.db.QueryRow("SELECT COUNT(*) FROM fiche WHERE statut = 'verifie'").Scan(&verifiees)
	s.db.QueryRow("SELECT COUNT(*) FROM structure WHERE niveau = 'noyau'").Scan(&noyau)
	s.db.QueryRow(`SELECT COUNT(*) FROM fiche f JOIN structure st ON st.id = f.structure_id
		WHERE st.niveau = 'noyau' AND f.statut = 'verifie'`).Scan(&noyauVerifie)
	envoyer(w, map[string]any{"atlas": true, "version": version, "base": s.base, "brouillons": brouillons,
		"verifiees": verifiees, "noyau": noyau, "noyau_verifie": noyauVerifie})
}

func (s *Serveur) listeFiches(w http.ResponseWriter, r *http.Request) {
	lignes, err := s.db.Query(`SELECT st.id, st.nom_fr, st.systeme, st.region, st.niveau, f.statut, f.modifie_par,
		f.modifie_le, f.verifie_le, f.champs, f.proposition IS NOT NULL
		FROM structure st LEFT JOIN fiche f ON f.structure_id = st.id ORDER BY st.id`)
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer lignes.Close()
	res := []map[string]any{}
	for lignes.Next() {
		var id, nom, systeme, region, niveau string
		var statut, par, modifie, verifie, champs sql.NullString
		var proposition sql.NullBool
		if err := lignes.Scan(&id, &nom, &systeme, &region, &niveau, &statut, &par, &modifie, &verifie, &champs, &proposition); err != nil {
			refuser(w, 500, err.Error())
			return
		}
		hors := []string{}
		if champs.Valid {
			hors = horsRoneo(champs.String)
		}
		res = append(res, map[string]any{"id": id, "nom_fr": nom, "systeme": systeme, "region": region, "niveau": niveau,
			"statut": nulle(statut), "modifie_par": nulle(par), "modifie_le": nulle(modifie), "verifie_le": nulle(verifie),
			"hors_roneo": hors, "proposition": proposition.Bool})
	}
	envoyer(w, res)
}

func nulle(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}

func brut(v sql.NullString, defaut string) json.RawMessage {
	if v.Valid && v.String != "" {
		return json.RawMessage(v.String)
	}
	return json.RawMessage(defaut)
}

// lireFiche : structure, fiche et relations dans les deux sens, comme l'attend l'interface.
func (s *Serveur) lireFiche(sid string) (map[string]any, error) {
	var id, nom, systeme, region, cote, niveau, synonymes string
	var fma, latin, parent, couverture sql.NullString
	err := s.db.QueryRow(`SELECT id, fma_id, nom_fr, synonymes_fr, nom_latin, systeme, region, cote, parent_id, niveau, couverture
		FROM structure WHERE id = ?`, sid).Scan(&id, &fma, &nom, &synonymes, &latin, &systeme, &region, &cote, &parent, &niveau, &couverture)
	if err != nil {
		return nil, err
	}
	structure := map[string]any{"id": id, "fma_id": nulle(fma), "nom_fr": nom, "synonymes_fr": json.RawMessage(synonymes),
		"nom_latin": nulle(latin), "systeme": systeme, "region": region, "cote": cote, "parent_id": nulle(parent),
		"niveau": niveau, "couverture": nulle(couverture)}

	var fiche any
	var champs, relations, remarques, statut, empreinte, proposition, par, modifie, verifie, note sql.NullString
	err = s.db.QueryRow(`SELECT champs, relations, remarques, statut, empreinte_brouillon, proposition, modifie_par,
		modifie_le, verifie_le, note FROM fiche WHERE structure_id = ?`, sid).Scan(
		&champs, &relations, &remarques, &statut, &empreinte, &proposition, &par, &modifie, &verifie, &note)
	if err == nil {
		fiche = map[string]any{"structure_id": sid, "champs": brut(champs, "{}"), "relations": brut(relations, "[]"),
			"remarques": brut(remarques, "[]"), "statut": statut.String, "empreinte_brouillon": nulle(empreinte),
			"proposition": brut(proposition, "null"), "modifie_par": par.String, "modifie_le": modifie.String,
			"verifie_le": nulle(verifie), "note": nulle(note), "hors_roneo": horsRoneo(champs.String)}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	noms := map[string]string{}
	toutes, err := s.db.Query("SELECT id, nom_fr FROM structure")
	if err != nil {
		return nil, err
	}
	for toutes.Next() {
		var i, n string
		toutes.Scan(&i, &n)
		noms[i] = n
	}
	toutes.Close()
	relationsVers := func(requete, cle string) ([]map[string]any, error) {
		lignes, err := s.db.Query(requete, sid)
		if err != nil {
			return nil, err
		}
		defer lignes.Close()
		res := []map[string]any{}
		for lignes.Next() {
			var autre, typ string
			var c sql.NullString
			lignes.Scan(&autre, &typ, &c)
			res = append(res, map[string]any{cle: autre, "type": typ, "cote": nulle(c), "nom": noms[autre]})
		}
		return res, nil
	}
	sortantes, err := relationsVers("SELECT cible_id, type, cote FROM relation WHERE source_id = ?", "cible_id")
	if err != nil {
		return nil, err
	}
	entrantes, err := relationsVers("SELECT source_id, type, cote FROM relation WHERE cible_id = ?", "source_id")
	if err != nil {
		return nil, err
	}
	permis := champsParSysteme[systeme]
	if permis == nil {
		permis = []string{}
	}
	return map[string]any{"structure": structure, "fiche": fiche, "champs_permis": permis, "libelles": libellesChamps,
		"relations_sortantes": sortantes, "relations_entrantes": entrantes}, nil
}

func (s *Serveur) envoyerFiche(w http.ResponseWriter, sid string) {
	f, err := s.lireFiche(sid)
	if errors.Is(err, sql.ErrNoRows) {
		refuser(w, 404, "Structure "+sid+" inconnue.")
		return
	}
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	envoyer(w, f)
}

type Modification struct {
	Champs    map[string]Champ `json:"champs"`
	Relations *[]Relation      `json:"relations"`
	Remarques *[]string        `json:"remarques"`
	Statut    string           `json:"statut"`
	Note      *string          `json:"note"`
}

func (s *Serveur) enregistrer(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	var m Modification
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		refuser(w, 422, "Requête illisible : "+err.Error())
		return
	}
	if m.Statut != "brouillon" && m.Statut != "verifie" {
		refuser(w, 422, "Statut inconnu : "+m.Statut+".")
		return
	}
	var relationsActuelles, remarquesActuelles sql.NullString
	existe := s.db.QueryRow("SELECT relations, remarques FROM fiche WHERE structure_id = ?", sid).
		Scan(&relationsActuelles, &remarquesActuelles) == nil
	relations := []Relation{}
	if m.Relations != nil {
		relations = *m.Relations
	} else if existe {
		json.Unmarshal([]byte(relationsActuelles.String), &relations)
	}
	remarques := []string{}
	if m.Remarques != nil {
		remarques = *m.Remarques
	} else if existe {
		json.Unmarshal([]byte(remarquesActuelles.String), &remarques)
	}
	if m.Champs == nil {
		m.Champs = map[string]Champ{}
	}
	if erreurs := valider(s.db, sid, m.Champs, relations); len(erreurs) > 0 {
		refuser(w, 422, strings.Join(erreurs, " ; "))
		return
	}
	champsJSON, _ := json.Marshal(m.Champs)
	relationsJSON, _ := json.Marshal(relations)
	remarquesJSON, _ := json.Marshal(remarques)
	quand := maintenant()
	var verifieLe any
	if m.Statut == "verifie" {
		verifieLe = quand
	}
	tx, err := s.db.Begin()
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer tx.Rollback()
	if existe {
		if err := historiser(tx, sid); err != nil {
			refuser(w, 500, err.Error())
			return
		}
		_, err = tx.Exec(`UPDATE fiche SET champs = ?, relations = ?, remarques = ?, statut = ?, modifie_par = 'eliott',
			modifie_le = ?, verifie_le = ?, note = ? WHERE structure_id = ?`,
			string(champsJSON), string(relationsJSON), string(remarquesJSON), m.Statut, quand, verifieLe, m.Note, sid)
	} else {
		_, err = tx.Exec(`INSERT INTO fiche (structure_id, champs, relations, remarques, statut, modifie_par, modifie_le, verifie_le, note)
			VALUES (?, ?, ?, ?, ?, 'eliott', ?, ?, ?)`,
			sid, string(champsJSON), string(relationsJSON), string(remarquesJSON), m.Statut, quand, verifieLe, m.Note)
	}
	if err == nil {
		err = recalculerRelations(tx, sid, string(relationsJSON))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	etat := "brouillon"
	if m.Statut == "verifie" {
		etat = "vérifiée"
	}
	journal("OK", "Fiche "+sid+" enregistrée ("+etat+").")
	s.envoyerFiche(w, sid)
}

func (s *Serveur) proposition(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	var d struct {
		Action string `json:"action"`
	}
	json.NewDecoder(r.Body).Decode(&d)
	var prop sql.NullString
	if s.db.QueryRow("SELECT proposition FROM fiche WHERE structure_id = ?", sid).Scan(&prop) != nil || !prop.Valid {
		refuser(w, 404, "Aucune proposition en attente pour "+sid+".")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer tx.Rollback()
	switch d.Action {
	case "accepter":
		var p struct {
			Champs    json.RawMessage `json:"champs"`
			Relations json.RawMessage `json:"relations"`
			Remarques json.RawMessage `json:"remarques"`
		}
		if err := json.Unmarshal([]byte(prop.String), &p); err != nil {
			refuser(w, 500, err.Error())
			return
		}
		historiser(tx, sid)
		// Accepter une proposition remet la fiche en brouillon : elle devra être revérifiée
		_, err = tx.Exec(`UPDATE fiche SET champs = ?, relations = ?, remarques = ?, statut = 'brouillon', proposition = NULL,
			modifie_par = 'eliott', modifie_le = ?, verifie_le = NULL WHERE structure_id = ?`,
			string(p.Champs), string(p.Relations), string(p.Remarques), maintenant(), sid)
		if err == nil {
			err = recalculerRelations(tx, sid, string(p.Relations))
		}
	case "ignorer":
		_, err = tx.Exec("UPDATE fiche SET proposition = NULL WHERE structure_id = ?", sid)
	default:
		refuser(w, 422, "Action attendue : accepter ou ignorer.")
		return
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	journal("OK", "Proposition "+sid+" : "+d.Action+".")
	s.envoyerFiche(w, sid)
}

func (s *Serveur) historique(w http.ResponseWriter, r *http.Request) {
	lignes, err := s.db.Query(`SELECT id, structure_id, champs, relations, statut, modifie_par, modifie_le
		FROM fiche_historique WHERE structure_id = ? ORDER BY id DESC`, r.PathValue("sid"))
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer lignes.Close()
	res := []map[string]any{}
	for lignes.Next() {
		var id int
		var sid, champs, relations, statut, par, modifie string
		lignes.Scan(&id, &sid, &champs, &relations, &statut, &par, &modifie)
		res = append(res, map[string]any{"id": id, "structure_id": sid, "champs": json.RawMessage(champs),
			"relations": json.RawMessage(relations), "statut": statut, "modifie_par": par, "modifie_le": modifie})
	}
	envoyer(w, res)
}

// ------------------------------------------------------------ fichiers

func (s *Serveur) roneo(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	src, ok := s.sources[code]
	if !ok {
		refuser(w, 404, "Code de ronéo inconnu : "+code+".")
		return
	}
	chemin := trouverPDF(s.chemins.Roneos, src.Fichier)
	if chemin == "" {
		refuser(w, 404, "Ronéo absente : "+src.Fichier+".pdf")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline")
	http.ServeFile(w, r, chemin)
}

// trouverPDF : nom exact d'abord, puis en tolérant les accents décomposés.
func trouverPDF(dossier, fichier string) string {
	exact := filepath.Join(dossier, fichier+".pdf")
	if _, err := os.Stat(exact); err == nil {
		return exact
	}
	voulu := squelette(fichier)
	entrees, _ := os.ReadDir(dossier)
	for _, e := range entrees {
		nom := strings.TrimSuffix(e.Name(), ".pdf")
		if nom != e.Name() && squelette(nom) == voulu {
			return filepath.Join(dossier, e.Name())
		}
	}
	return ""
}

// fichiersStatiques sert un dossier ; avec repli, une adresse inconnue renvoie index.html (appli d'une page).
func fichiersStatiques(dossier string, repli bool) http.Handler {
	fs := http.FileServer(http.Dir(dossier))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chemin := filepath.Join(dossier, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
		if strings.HasSuffix(r.URL.Path, ".glb") {
			w.Header().Set("Content-Type", "model/gltf-binary")
		}
		// Les fichiers des paquets portent tous la même date (zip reproductible) : une réponse
		// « non modifié » ferait garder à la fenêtre la page d'une version précédente. Seuls les fichiers
		// dont le nom contient leur empreinte (assets/index-BxbUvcqd.js) peuvent rester en cache.
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			r.Header.Del("If-Modified-Since")
			r.Header.Del("If-None-Match")
			w.Header().Set("Cache-Control", "no-store")
		}
		if _, err := os.Stat(chemin); err != nil && repli {
			http.ServeFile(w, r, filepath.Join(dossier, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}
