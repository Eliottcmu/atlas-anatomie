package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func serveurDeTest(t *testing.T) (*Serveur, *http.ServeMux) {
	t.Helper()
	dossier := t.TempDir()
	db, err := ouvrirBase(filepath.Join(dossier, "anatomie.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := migrerRevisions(db); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"A09", "A34", "A35", "A24"} {
		if _, err := db.Exec(`INSERT INTO structure (id, nom_fr, systeme, region, cote, niveau) VALUES (?, ?, 'artère', 'Membre supérieur', 'bilatéral', 'noyau')`,
			id, "artère "+id); err != nil {
			t.Fatal(err)
		}
	}
	for _, rel := range [][3]string{{"A34", "A09", "fait_suite_a"}, {"A35", "A34", "fait_suite_a"}, {"A24", "A09", "branche_de"}} {
		db.Exec("INSERT INTO relation (source_id, cible_id, type) VALUES (?, ?, ?)", rel[0], rel[1], rel[2])
	}
	for _, id := range []string{"A09", "A34", "A35", "A24"} {
		db.Exec("INSERT INTO fiche (structure_id, champs, statut, modifie_le) VALUES (?, '{}', 'brouillon', ?)", id, maintenant())
	}
	s := &Serveur{db: db, chemins: Chemins{Donnees: dossier}}
	mux := http.NewServeMux()
	s.routesRevisions(mux)
	return s, mux
}

func appeler(t *testing.T, mux *http.ServeMux, methode, url string, corps any) map[string]any {
	t.Helper()
	var b bytes.Buffer
	if corps != nil {
		json.NewEncoder(&b).Encode(corps)
	}
	req := httptest.NewRequest(methode, url, &b)
	rep := httptest.NewRecorder()
	mux.ServeHTTP(rep, req)
	if rep.Code != 200 {
		t.Fatalf("%s %s : %d %s", methode, url, rep.Code, rep.Body.String())
	}
	var res map[string]any
	json.Unmarshal(rep.Body.Bytes(), &res)
	return res
}

func TestCartesDesFichesVerifieesSeulement(t *testing.T) {
	s, mux := serveurDeTest(t)
	b := appeler(t, mux, "POST", "/api/cartes/synchroniser", map[string]any{"avec_modele": []string{"A09", "A34", "A35", "A24"}})
	actives := b["actives"].(map[string]any)
	if actives["nommer"].(float64) != 4 || actives["localiser"].(float64) != 4 || actives["relation"] != nil {
		t.Fatalf("brouillons : seules nommer et localiser attendues, obtenu %v", actives)
	}
	s.db.Exec("UPDATE fiche SET statut = 'verifie'")
	b = appeler(t, mux, "POST", "/api/cartes/synchroniser", map[string]any{"avec_modele": []string{"A09", "A34", "A35", "A24"}})
	actives = b["actives"].(map[string]any)
	if actives["relation"].(float64) != 3 || actives["trajet"].(float64) != 1 || actives["vrai_faux"].(float64) != 3 {
		t.Fatalf("fiches vérifiées : 3 relations, 1 trajet (A09>A34>A35), 3 vrai ou faux attendus, obtenu %v", actives)
	}
	// Fiche repassée en brouillon : ses cartes de relation sont suspendues
	s.db.Exec("UPDATE fiche SET statut = 'brouillon' WHERE structure_id = 'A24'")
	b = appeler(t, mux, "POST", "/api/cartes/synchroniser", map[string]any{"avec_modele": []string{"A09", "A34", "A35", "A24"}})
	if b["suspendues"].(float64) != 2 {
		t.Fatalf("A24 repassée en brouillon : 2 cartes suspendues attendues (relation, vrai ou faux), obtenu %v", b)
	}
}

func TestFileEtNotation(t *testing.T) {
	_, mux := serveurDeTest(t)
	appeler(t, mux, "POST", "/api/cartes/synchroniser", map[string]any{"avec_modele": []string{"A09", "A34", "A35", "A24"}})
	f := appeler(t, mux, "GET", "/api/revisions/file?nouvelles=3", nil)
	nouvelles := f["nouvelles"].([]any)
	if len(nouvelles) != 3 || len(f["dues"].([]any)) != 0 {
		t.Fatalf("file : 3 nouvelles et aucune échue attendues, obtenu %d et %d", len(nouvelles), len(f["dues"].([]any)))
	}
	carte := nouvelles[0].(map[string]any)
	if carte["apercu"].(map[string]any)["3"] != "3 j" {
		t.Fatalf("aperçu de « Bien » sur une nouvelle carte : %v", carte["apercu"])
	}
	id := int(carte["id"].(float64))
	r := appeler(t, mux, "POST", "/api/revisions/"+itoa(id), map[string]any{"note": 1, "duree_ms": 4000})
	if r["dans"] != "1 min" || r["phase"] != "apprentissage" {
		t.Fatalf("À revoir : %v", r)
	}
	f = appeler(t, mux, "GET", "/api/revisions/file?nouvelles=3", nil)
	if len(f["dues"].([]any)) != 1 || len(f["nouvelles"].([]any)) != 2 {
		t.Fatalf("après une nouvelle vue : 1 échue et 2 nouvelles restantes attendues, obtenu %v", f)
	}
	m := appeler(t, mux, "GET", "/api/maitrise", nil)
	if m[carte["structure_id"].(string)].(map[string]any)["niveau"] != "a_revoir" {
		t.Fatalf("maîtrise après un oubli : %v", m)
	}
	b := appeler(t, mux, "POST", "/api/revisions/reinitialiser", map[string]any{"confirmer": false})
	if b["revisions"].(float64) != 1 || b["efface"] != false {
		t.Fatalf("réinitialisation non confirmée : %v", b)
	}
	b = appeler(t, mux, "POST", "/api/revisions/reinitialiser", map[string]any{"confirmer": true})
	if b["efface"] != true {
		t.Fatalf("réinitialisation confirmée : %v", b)
	}
}
