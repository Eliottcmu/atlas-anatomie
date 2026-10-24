package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Cartes et révisions (phase 3). Une carte = une question révisable, planifiée par FSRS.
//   nommer:A09, localiser:A09 : identification sur le modèle, actives dès que la structure a un modèle 3D
//     (son nom vient de la liste noyau, validée par Eliott) ;
//   relation:A24:branche_de:A09, vrai_faux:A24, trajet:A09>A34>A35 : tirées des fiches, actives seulement
//     quand toutes les fiches concernées sont vérifiées (règle du plan : rien de faux appris par cœur).

// Types de relation qui donnent une question (les autres sont trop rares pour l'instant)
var relationsQuestion = map[string]bool{"branche_de": true, "fait_suite_a": true, "se_jette_dans": true, "anastomose_avec": true}

func migrerRevisions(db *sql.DB) error {
	colonnes := map[string]bool{}
	lignes, err := db.Query("PRAGMA table_info(carte)")
	if err != nil {
		return err
	}
	for lignes.Next() {
		var cid int
		var nom, typ string
		var nonNul, pk int
		var defaut sql.NullString
		lignes.Scan(&cid, &nom, &typ, &nonNul, &defaut, &pk)
		colonnes[nom] = true
	}
	lignes.Close()
	for _, c := range []struct{ nom, def string }{
		{"cle", "TEXT"}, {"statut", "TEXT NOT NULL DEFAULT 'active'"}, {"cree_le", "TEXT"}, {"ordre", "INTEGER NOT NULL DEFAULT 0"},
	} {
		if !colonnes[c.nom] {
			if _, err := db.Exec(fmt.Sprintf("ALTER TABLE carte ADD COLUMN %s %s", c.nom, c.def)); err != nil {
				return err
			}
		}
	}
	_, err = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS carte_cle ON carte(cle);
		CREATE INDEX IF NOT EXISTS carte_echeance ON carte(echeance);
		CREATE INDEX IF NOT EXISTS revision_carte ON revision(carte_id);
		CREATE INDEX IF NOT EXISTS revision_date ON revision(date)`)
	return err
}

func (s *Serveur) routesRevisions(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/cartes/synchroniser", s.synchroniser)
	mux.HandleFunc("GET /api/revisions/file", s.file)
	mux.HandleFunc("POST /api/revisions/{id}", s.noter)
	mux.HandleFunc("GET /api/revisions/bilan", s.bilan)
	mux.HandleFunc("GET /api/maitrise", s.maitrise)
	mux.HandleFunc("POST /api/revisions/reinitialiser", s.reinitialiser)
	mux.HandleFunc("GET /api/parcours/suivi", s.suiviParcours)
	mux.HandleFunc("POST /api/parcours/{id}/termine", s.parcoursTermine)
	mux.HandleFunc("GET /api/relations", s.relations)
}

// relations : toutes les relations, avec le statut de la fiche qui les porte (parcours, questions).
func (s *Serveur) relations(w http.ResponseWriter, r *http.Request) {
	lignes, err := s.db.Query(`SELECT r.source_id, r.cible_id, r.type, COALESCE(r.cote, ''), COALESCE(f.statut, '')
		FROM relation r LEFT JOIN fiche f ON f.structure_id = r.source_id ORDER BY r.source_id, r.type, r.cible_id`)
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer lignes.Close()
	res := []map[string]any{}
	for lignes.Next() {
		var src, cible, typ, cote, statut string
		lignes.Scan(&src, &cible, &typ, &cote, &statut)
		res = append(res, map[string]any{"source": src, "cible": cible, "type": typ, "cote": cote, "verifiee": statut == "verifie"})
	}
	envoyer(w, res)
}

// ------------------------------------------------------------ synchronisation des cartes

type demandeSynchro struct {
	AvecModele []string `json:"avec_modele"`
}

type carteVoulue struct {
	cle, structure, typ string
	contenu             map[string]any
	ordre               int
}

func (s *Serveur) synchroniser(w http.ResponseWriter, r *http.Request) {
	var d demandeSynchro
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		refuser(w, 422, "Requête illisible : "+err.Error())
		return
	}
	bilan, err := s.synchroniserCartes(d.AvecModele)
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	envoyer(w, bilan)
}

func (s *Serveur) synchroniserCartes(avecModele []string) (map[string]any, error) {
	modele := map[string]bool{}
	for _, id := range avecModele {
		modele[id] = true
	}
	ordre := map[string]int{}
	verifiees := map[string]bool{}
	lignes, err := s.db.Query(`SELECT st.id, COALESCE(f.statut, '') FROM structure st LEFT JOIN fiche f ON f.structure_id = st.id
		WHERE st.niveau = 'noyau' ORDER BY st.id`)
	if err != nil {
		return nil, err
	}
	var noyau []string
	for lignes.Next() {
		var id, statut string
		lignes.Scan(&id, &statut)
		ordre[id] = len(noyau)
		noyau = append(noyau, id)
		verifiees[id] = statut == "verifie"
	}
	lignes.Close()

	voulues := map[string]carteVoulue{}
	ajouter := func(c carteVoulue) { voulues[c.cle] = c }
	for _, id := range noyau {
		if modele[id] {
			ajouter(carteVoulue{"nommer:" + id, id, "nommer", map[string]any{}, ordre[id] * 10})
			ajouter(carteVoulue{"localiser:" + id, id, "localiser", map[string]any{}, ordre[id]*10 + 5})
		}
	}
	// Relations des fiches vérifiées, entre structures noyau vérifiées
	rel, err := s.db.Query("SELECT source_id, cible_id, type, COALESCE(cote, '') FROM relation ORDER BY source_id, type, cible_id")
	if err != nil {
		return nil, err
	}
	suite := map[string][]string{} // parent -> structures qui lui font suite
	aRelation := map[string]bool{}
	for rel.Next() {
		var src, cible, typ, cote string
		rel.Scan(&src, &cible, &typ, &cote)
		if !relationsQuestion[typ] || !verifiees[src] || !verifiees[cible] {
			continue
		}
		aRelation[src] = true
		cle := "relation:" + src + ":" + typ + ":" + cible
		if cote != "" {
			cle += ":" + cote
		}
		ajouter(carteVoulue{cle, src, "relation", map[string]any{"relation": typ, "cible": cible, "cote": cote}, ordre[src]*10 + 7})
		if typ == "fait_suite_a" {
			suite[cible] = append(suite[cible], src)
		}
	}
	rel.Close()
	for id := range aRelation {
		ajouter(carteVoulue{"vrai_faux:" + id, id, "vrai_faux", map[string]any{}, ordre[id]*10 + 8})
	}
	// Trajets : suites de « fait suite à » d'au moins trois structures (aorte, subclavière, axillaire...)
	aUnParent := map[string]bool{}
	for _, enfants := range suite {
		for _, e := range enfants {
			aUnParent[e] = true
		}
	}
	var parcourir func(chemin []string)
	parcourir = func(chemin []string) {
		dernier := chemin[len(chemin)-1]
		enfants := suite[dernier]
		if len(enfants) == 0 && len(chemin) >= 3 {
			cle := "trajet:" + strings.Join(chemin, ">")
			ajouter(carteVoulue{cle, chemin[0], "trajet", map[string]any{"etapes": chemin}, ordre[chemin[0]]*10 + 9})
		}
		for _, e := range enfants {
			parcourir(append(append([]string{}, chemin...), e))
		}
	}
	for parent := range suite {
		if !aUnParent[parent] {
			parcourir([]string{parent})
		}
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	existantes := map[string]string{}
	lc, err := tx.Query("SELECT cle, statut FROM carte WHERE cle IS NOT NULL")
	if err != nil {
		return nil, err
	}
	for lc.Next() {
		var cle, statut string
		lc.Scan(&cle, &statut)
		existantes[cle] = statut
	}
	lc.Close()
	creees, reactivees, suspendues := 0, 0, 0
	for cle, c := range voulues {
		contenu, _ := json.Marshal(c.contenu)
		statut, existe := existantes[cle]
		switch {
		case !existe:
			_, err = tx.Exec(`INSERT INTO carte (cle, structure_id, type, contenu, statut, cree_le, ordre) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
				cle, c.structure, c.typ, string(contenu), maintenant(), c.ordre)
			creees++
		case statut != "active":
			_, err = tx.Exec("UPDATE carte SET statut = 'active', contenu = ?, ordre = ? WHERE cle = ?", string(contenu), c.ordre, cle)
			reactivees++
		default:
			_, err = tx.Exec("UPDATE carte SET contenu = ?, ordre = ? WHERE cle = ?", string(contenu), c.ordre, cle)
		}
		if err != nil {
			return nil, err
		}
	}
	// Carte devenue sans objet (fiche repassée en brouillon, relation corrigée) : suspendue, son historique gardé
	for cle, statut := range existantes {
		if _, ok := voulues[cle]; !ok && statut == "active" {
			if _, err := tx.Exec("UPDATE carte SET statut = 'suspendue' WHERE cle = ?", cle); err != nil {
				return nil, err
			}
			suspendues++
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	parType := map[string]int{}
	lt, err := s.db.Query("SELECT type, COUNT(*) FROM carte WHERE statut = 'active' GROUP BY type")
	if err == nil {
		for lt.Next() {
			var t string
			var n int
			lt.Scan(&t, &n)
			parType[t] = n
		}
		lt.Close()
	}
	return map[string]any{"creees": creees, "reactivees": reactivees, "suspendues": suspendues, "actives": parType,
		"fiches_verifiees": compterVrai(verifiees)}, nil
}

func compterVrai(m map[string]bool) int {
	n := 0
	for _, v := range m {
		if v {
			n++
		}
	}
	return n
}

// ------------------------------------------------------------ file du jour

type CarteFile struct {
	ID        int64             `json:"id"`
	Cle       string            `json:"cle"`
	Type      string            `json:"type"`
	Structure string            `json:"structure_id"`
	Contenu   json.RawMessage   `json:"contenu"`
	Phase     string            `json:"phase"`
	Echeance  *string           `json:"echeance"`
	Apercu    map[string]string `json:"apercu"`
}

// debutJournee : 4 h du matin, comme Anki ; une révision de minuit et demi compte pour la veille.
func debutJournee(t time.Time) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 4, 0, 0, 0, time.Local)
	if t.Before(d) {
		d = d.AddDate(0, 0, -1)
	}
	return d
}

func lireEtat(brut sql.NullString) EtatFSRS {
	e := EtatFSRS{Phase: "nouvelle"}
	if brut.Valid && brut.String != "" {
		json.Unmarshal([]byte(brut.String), &e)
	}
	return e
}

func apercu(e EtatFSRS, t time.Time) map[string]string {
	res := map[string]string{}
	for n := Note(1); n <= 4; n++ {
		_, ech := Planifier(e, n, t)
		res[strconv.Itoa(int(n))] = LibelleIntervalle(t, ech)
	}
	return res
}

func (s *Serveur) nouvellesDuJour(maintenantT time.Time) int {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM (SELECT carte_id, MIN(date) premiere FROM revision GROUP BY carte_id) WHERE premiere >= ?`,
		debutJournee(maintenantT).Format(formatDate)).Scan(&n)
	return n
}

func (s *Serveur) file(w http.ResponseWriter, r *http.Request) {
	t := time.Now()
	limite, err := strconv.Atoi(r.URL.Query().Get("nouvelles"))
	if err != nil || limite < 0 {
		limite = 20
	}
	restantes := limite - s.nouvellesDuJour(t)
	if restantes < 0 {
		restantes = 0
	}
	// Échues : tout ce qui arrive à échéance avant la fin de la journée d'apprentissage (4 h le lendemain)
	finJournee := debutJournee(t).AddDate(0, 0, 1).Format(formatDate)
	dues, err := s.lireCartes(`WHERE statut = 'active' AND echeance IS NOT NULL AND echeance < ? ORDER BY echeance`, t, finJournee)
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	// Nouvelles : d'abord les structures des parcours terminés, puis l'ordre de la liste noyau
	nouvelles, err := s.lireCartes(`LEFT JOIN (SELECT json_each.value AS sid, MIN(termine_le) AS vu FROM parcours_suivi, json_each(parcours_suivi.structures)
		GROUP BY json_each.value) p ON p.sid = carte.structure_id
		WHERE statut = 'active' AND echeance IS NULL ORDER BY p.vu IS NULL, p.vu, ordre LIMIT ?`, t, restantes)
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	var totalNouvelles, prochaine int
	var prochaineDate sql.NullString
	s.db.QueryRow("SELECT COUNT(*) FROM carte WHERE statut = 'active' AND echeance IS NULL").Scan(&totalNouvelles)
	demain := debutJournee(t).AddDate(0, 0, 2).Format(formatDate)
	s.db.QueryRow("SELECT COUNT(*) FROM carte WHERE statut = 'active' AND echeance >= ? AND echeance < ?", finJournee, demain).Scan(&prochaine)
	s.db.QueryRow("SELECT MIN(echeance) FROM carte WHERE statut = 'active' AND echeance >= ?", finJournee).Scan(&prochaineDate)
	envoyer(w, map[string]any{"dues": dues, "nouvelles": nouvelles, "nouvelles_restantes_aujourdhui": restantes,
		"nouvelles_en_reserve": totalNouvelles, "demain": prochaine, "prochaine_echeance": nulle(prochaineDate)})
}

func (s *Serveur) lireCartes(fin string, t time.Time, args ...any) ([]CarteFile, error) {
	lignes, err := s.db.Query(`SELECT carte.id, cle, type, carte.structure_id, contenu, etat_fsrs, echeance FROM carte `+fin, args...)
	if err != nil {
		return nil, err
	}
	defer lignes.Close()
	res := []CarteFile{}
	for lignes.Next() {
		var c CarteFile
		var contenu string
		var etat, echeance sql.NullString
		if err := lignes.Scan(&c.ID, &c.Cle, &c.Type, &c.Structure, &contenu, &etat, &echeance); err != nil {
			return nil, err
		}
		c.Contenu = json.RawMessage(contenu)
		e := lireEtat(etat)
		c.Phase = e.Phase
		if echeance.Valid {
			c.Echeance = &echeance.String
		}
		c.Apercu = apercu(e, t)
		res = append(res, c)
	}
	return res, nil
}

// ------------------------------------------------------------ notation

type demandeNote struct {
	Note    int    `json:"note"`
	DureeMs int    `json:"duree_ms"`
	Reponse string `json:"reponse"`
	Juste   *bool  `json:"juste"`
}

func (s *Serveur) noter(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		refuser(w, 404, "Carte inconnue.")
		return
	}
	var d demandeNote
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil || d.Note < 1 || d.Note > 4 {
		refuser(w, 422, "Note attendue entre 1 (À revoir) et 4 (Facile).")
		return
	}
	var etat sql.NullString
	if err := s.db.QueryRow("SELECT etat_fsrs FROM carte WHERE id = ? AND statut = 'active'", id).Scan(&etat); err != nil {
		refuser(w, 404, "Carte inconnue ou suspendue.")
		return
	}
	t := time.Now()
	nouvel, echeance := Planifier(lireEtat(etat), Note(d.Note), t)
	brutEtat, _ := json.Marshal(nouvel)
	tx, err := s.db.Begin()
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE carte SET etat_fsrs = ?, echeance = ? WHERE id = ?", string(brutEtat), echeance.Format(formatDate), id); err != nil {
		refuser(w, 500, err.Error())
		return
	}
	if _, err := tx.Exec("INSERT INTO revision (carte_id, date, note, duree_ms) VALUES (?, ?, ?, ?)", id, t.Format(formatDate), d.Note, d.DureeMs); err != nil {
		refuser(w, 500, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		refuser(w, 500, err.Error())
		return
	}
	envoyer(w, map[string]any{"echeance": echeance.Format(formatDate), "dans": LibelleIntervalle(t, echeance),
		"phase": nouvel.Phase, "stabilite": nouvel.Stabilite, "difficulte": nouvel.Difficulte})
}

// ------------------------------------------------------------ bilan et maîtrise

func (s *Serveur) bilan(w http.ResponseWriter, r *http.Request) {
	t := time.Now()
	debut := debutJournee(t)
	parJour := map[string]map[string]int{}
	lignes, err := s.db.Query("SELECT date, note FROM revision WHERE date >= ?", debut.AddDate(0, 0, -29).Format(formatDate))
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	justes, total := 0, 0
	for lignes.Next() {
		var date string
		var note int
		lignes.Scan(&date, &note)
		d, err := time.ParseInLocation(formatDate, date, time.Local)
		if err != nil {
			continue
		}
		jour := debutJournee(d).Format("2006-01-02")
		if parJour[jour] == nil {
			parJour[jour] = map[string]int{}
		}
		parJour[jour]["revisions"]++
		if note > 1 {
			parJour[jour]["justes"]++
			justes++
		}
		total++
	}
	lignes.Close()
	jours := []map[string]any{}
	serie := 0
	for i := 29; i >= 0; i-- {
		j := debut.AddDate(0, 0, -i).Format("2006-01-02")
		jours = append(jours, map[string]any{"jour": j, "revisions": parJour[j]["revisions"], "justes": parJour[j]["justes"]})
	}
	// Jours consécutifs de révision, jusqu'à aujourd'hui (une journée sans révision encore aujourd'hui ne rompt pas la série)
	for i := 0; i < 365; i++ {
		j := debut.AddDate(0, 0, -i).Format("2006-01-02")
		if parJour[j]["revisions"] == 0 && i < 30 {
			if i == 0 {
				continue
			}
			break
		}
		if i >= 30 {
			break
		}
		serie++
	}
	var dues, actives, suspendues, nouvelles, totalRevisions int
	fin := debut.AddDate(0, 0, 1).Format(formatDate)
	s.db.QueryRow("SELECT COUNT(*) FROM carte WHERE statut = 'active' AND echeance IS NOT NULL AND echeance < ?", fin).Scan(&dues)
	s.db.QueryRow("SELECT COUNT(*) FROM carte WHERE statut = 'active'").Scan(&actives)
	s.db.QueryRow("SELECT COUNT(*) FROM carte WHERE statut = 'suspendue'").Scan(&suspendues)
	s.db.QueryRow("SELECT COUNT(*) FROM carte WHERE statut = 'active' AND echeance IS NULL").Scan(&nouvelles)
	s.db.QueryRow("SELECT COUNT(*) FROM revision").Scan(&totalRevisions)
	retention := any(nil)
	if total > 0 {
		retention = float64(justes) / float64(total)
	}
	envoyer(w, map[string]any{"jours": jours, "serie": serie, "retention_30j": retention, "revisions_30j": total,
		"revisions_total": totalRevisions, "dues": dues, "actives": actives, "suspendues": suspendues, "nouvelles": nouvelles,
		"nouvelles_aujourdhui": s.nouvellesDuJour(t)})
}

// maitrise : pour chaque structure, probabilité de rappel moyenne de ses cartes vues, et niveau.
func (s *Serveur) maitrise(w http.ResponseWriter, r *http.Request) {
	t := time.Now()
	lignes, err := s.db.Query("SELECT structure_id, type, etat_fsrs, echeance FROM carte WHERE statut = 'active'")
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer lignes.Close()
	type agregat struct {
		cartes, vues, dues         int
		sommeR, minR, minStabilite float64
	}
	parStructure := map[string]*agregat{}
	finJournee := debutJournee(t).AddDate(0, 0, 1)
	for lignes.Next() {
		var sid, typ string
		var etat, echeance sql.NullString
		lignes.Scan(&sid, &typ, &etat, &echeance)
		a := parStructure[sid]
		if a == nil {
			a = &agregat{minR: 1, minStabilite: intervalleMaxi}
			parStructure[sid] = a
		}
		a.cartes++
		e := lireEtat(etat)
		if e.Phase == "nouvelle" {
			continue
		}
		a.vues++
		derniere, err := time.ParseInLocation(formatDate, e.Derniere, time.Local)
		r := 1.0
		if err == nil {
			r = Retenabilite(t.Sub(derniere).Hours()/24, e.Stabilite)
		}
		a.sommeR += r
		if r < a.minR {
			a.minR = r
		}
		if e.Stabilite < a.minStabilite {
			a.minStabilite = e.Stabilite
		}
		if echeance.Valid {
			if d, err := time.ParseInLocation(formatDate, echeance.String, time.Local); err == nil && d.Before(finJournee) {
				a.dues++
			}
		}
	}
	res := map[string]any{}
	ids := make([]string, 0, len(parStructure))
	for id := range parStructure {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		a := parStructure[id]
		niveau := "nouvelle"
		var moyenne any
		if a.vues > 0 {
			m := a.sommeR / float64(a.vues)
			moyenne = m
			switch {
			case a.minR < 0.8 || a.dues > 0:
				niveau = "a_revoir"
			case a.vues == a.cartes && a.minStabilite >= 21:
				niveau = "acquise"
			default:
				niveau = "en_cours"
			}
		}
		res[id] = map[string]any{"cartes": a.cartes, "vues": a.vues, "dues": a.dues, "retenabilite": moyenne, "niveau": niveau}
	}
	envoyer(w, res)
}

// reinitialiser : efface les révisions (sauvegarde faite avant), toutes les cartes redeviennent nouvelles.
func (s *Serveur) reinitialiser(w http.ResponseWriter, r *http.Request) {
	var d struct {
		Confirmer bool `json:"confirmer"`
	}
	json.NewDecoder(r.Body).Decode(&d)
	var n int
	s.db.QueryRow("SELECT COUNT(*) FROM revision").Scan(&n)
	if !d.Confirmer {
		envoyer(w, map[string]any{"revisions": n, "efface": false})
		return
	}
	copie, err := sauvegarder(s.db, filepath.Join(s.chemins.Donnees, "sauvegardes"), "avant-reinitialisation")
	if err != nil {
		refuser(w, 500, "Sauvegarde impossible, rien n'a été effacé : "+err.Error())
		return
	}
	if _, err := s.db.Exec("DELETE FROM revision; UPDATE carte SET etat_fsrs = NULL, echeance = NULL; DELETE FROM parcours_suivi"); err != nil {
		refuser(w, 500, err.Error())
		return
	}
	journal("OK", fmt.Sprintf("Progression réinitialisée : %d révisions effacées. Copie de sécurité : %s.", n, copie))
	envoyer(w, map[string]any{"revisions": n, "efface": true, "sauvegarde": copie})
}

// ------------------------------------------------------------ parcours

func (s *Serveur) suiviParcours(w http.ResponseWriter, r *http.Request) {
	lignes, err := s.db.Query(`SELECT parcours_id, MAX(termine_le), COUNT(*), MAX(score), MAX(total) FROM parcours_suivi GROUP BY parcours_id`)
	if err != nil {
		refuser(w, 500, err.Error())
		return
	}
	defer lignes.Close()
	res := map[string]any{}
	for lignes.Next() {
		var id, date string
		var fois, score, total int
		lignes.Scan(&id, &date, &fois, &score, &total)
		res[id] = map[string]any{"dernier": date, "fois": fois, "meilleur_score": score, "total": total}
	}
	envoyer(w, res)
}

func (s *Serveur) parcoursTermine(w http.ResponseWriter, r *http.Request) {
	var d struct {
		Score      int      `json:"score"`
		Total      int      `json:"total"`
		Structures []string `json:"structures"`
	}
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		refuser(w, 422, "Requête illisible : "+err.Error())
		return
	}
	structures, _ := json.Marshal(d.Structures)
	if _, err := s.db.Exec("INSERT INTO parcours_suivi (parcours_id, termine_le, score, total, structures) VALUES (?, ?, ?, ?, ?)",
		r.PathValue("id"), maintenant(), d.Score, d.Total, string(structures)); err != nil {
		refuser(w, 500, err.Error())
		return
	}
	envoyer(w, map[string]any{"enregistre": true})
}
