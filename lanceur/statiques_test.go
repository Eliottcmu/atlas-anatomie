package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Une fenêtre qui a gardé la page d'une version précédente doit recevoir la nouvelle, même si les
// deux versions portent la même date de fichier (zip reproductible).
func TestPageJamaisNonModifiee(t *testing.T) {
	dossier := t.TempDir()
	os.MkdirAll(filepath.Join(dossier, "assets"), 0o755)
	os.WriteFile(filepath.Join(dossier, "index.html"), []byte("<p>nouvelle version</p>"), 0o644)
	os.WriteFile(filepath.Join(dossier, "assets", "index-abc.js"), []byte("1"), 0o644)
	date := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	os.Chtimes(filepath.Join(dossier, "index.html"), date, date)
	h := fichiersStatiques(dossier, true)

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("If-Modified-Since", date.Add(time.Hour).Format(http.TimeFormat))
	rep := httptest.NewRecorder()
	h.ServeHTTP(rep, req)
	if rep.Code != 200 || rep.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("page : code %d, Cache-Control %q ; attendu 200 et no-store", rep.Code, rep.Header().Get("Cache-Control"))
	}
	rep = httptest.NewRecorder()
	h.ServeHTTP(rep, httptest.NewRequest("GET", "/assets/index-abc.js", nil))
	if rep.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("fichier à empreinte : Cache-Control %q", rep.Header().Get("Cache-Control"))
	}
}
