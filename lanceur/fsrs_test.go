package main

import (
	"math"
	"testing"
	"time"
)

func TestRetenabiliteVautQuatreVingtDixPourCentAStabilite(t *testing.T) {
	for _, s := range []float64{1, 3.17, 15, 200} {
		if r := Retenabilite(s, s); math.Abs(r-0.9) > 1e-9 {
			t.Fatalf("R(%v, %v) = %v, attendu 0,9", s, s, r)
		}
	}
}

func TestNouvelleCarte(t *testing.T) {
	t0 := time.Date(2026, 10, 22, 20, 0, 0, 0, time.Local)
	attendus := map[Note]float64{2: 1, 3: 3, 4: 16} // stabilités initiales 1,18, 3,17 et 15,7 jours, arrondies
	for n, jours := range attendus {
		e, ech := Planifier(EtatFSRS{Phase: "nouvelle"}, n, t0)
		// Jours de calendrier : le passage à l'heure d'hiver (25 octobre) fausserait un calcul en heures
		if got := float64(ech.YearDay() - t0.YearDay()); got != jours || ech.Hour() != 4 {
			t.Fatalf("note %d : échéance dans %v jours, attendu %v", n, got, jours)
		}
		if e.Phase != "revision" || e.Repetitions != 1 {
			t.Fatalf("note %d : état %+v", n, e)
		}
	}
	e, ech := Planifier(EtatFSRS{Phase: "nouvelle"}, 1, t0)
	if e.Phase != "apprentissage" || ech.Sub(t0) != time.Minute {
		t.Fatalf("À revoir sur une nouvelle carte : %+v dans %v", e, ech.Sub(t0))
	}
}

func TestReussitesSuccessivesAllongentLIntervalle(t *testing.T) {
	t0 := time.Date(2026, 10, 1, 9, 0, 0, 0, time.Local)
	e, ech := Planifier(EtatFSRS{Phase: "nouvelle"}, 3, t0)
	precedent := ech.Sub(t0)
	for i := 0; i < 5; i++ {
		maintenant := ech.Add(10 * time.Hour)
		e, ech = Planifier(e, 3, maintenant)
		if ech.Sub(maintenant) <= precedent {
			t.Fatalf("révision %d : intervalle %v, pas plus long que %v", i, ech.Sub(maintenant), precedent)
		}
		precedent = ech.Sub(maintenant)
	}
}

func TestOubliReduitLaStabiliteEtCompteUnOubli(t *testing.T) {
	t0 := time.Date(2026, 10, 1, 9, 0, 0, 0, time.Local)
	e, ech := Planifier(EtatFSRS{Phase: "nouvelle"}, 3, t0)
	e, ech = Planifier(e, 3, ech.Add(time.Hour))
	avant := e.Stabilite
	e2, ech2 := Planifier(e, 1, ech.Add(time.Hour))
	if e2.Stabilite >= avant || e2.Oublis != 1 || e2.Phase != "reapprentissage" || ech2.Sub(ech.Add(time.Hour)) != 5*time.Minute {
		t.Fatalf("après oubli : %+v, échéance %v", e2, ech2)
	}
	// Réussite le jour même : court terme, retour en révision à un jour au moins
	e3, ech3 := Planifier(e2, 3, ech2.Add(time.Minute))
	if e3.Phase != "revision" || ech3.Before(ech2.Add(20*time.Hour)) {
		t.Fatalf("réapprentissage réussi : %+v, échéance %v", e3, ech3)
	}
}

func TestDifficulteBornee(t *testing.T) {
	e := EtatFSRS{Phase: "nouvelle"}
	maintenant := time.Date(2026, 1, 1, 9, 0, 0, 0, time.Local)
	for i := 0; i < 30; i++ {
		e, _ = Planifier(e, 1, maintenant)
		maintenant = maintenant.Add(48 * time.Hour)
	}
	if e.Difficulte > 10 || e.Difficulte < 1 {
		t.Fatalf("difficulté hors bornes : %v", e.Difficulte)
	}
}

func TestLibelles(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 9, 0, 0, 0, time.Local)
	cas := map[time.Duration]string{time.Minute: "1 min", 5 * time.Minute: "5 min", 72 * time.Hour: "3 j",
		90 * 24 * time.Hour: "3 mois", 500 * 24 * time.Hour: "1,4 an"}
	for d, attendu := range cas {
		if got := LibelleIntervalle(t0, t0.Add(d)); got != attendu {
			t.Fatalf("%v : %q, attendu %q", d, got, attendu)
		}
	}
}
