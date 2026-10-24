package main

import (
	"math"
	"time"
)

// FSRS-5 (Free Spaced Repetition Scheduler), l'algorithme proposé par Anki : chaque carte a une
// stabilité S (jours pour que la probabilité de rappel tombe à 90 %) et une difficulté D (1 à 10).
// Paramètres par défaut publiés par le projet open-spaced-repetition ; rétention visée : 90 %.
var poidsFSRS = [19]float64{0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
	0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621}

const (
	decroissance   = -0.5
	retentionVisee = 0.9
	intervalleMaxi = 36500.0 // jours
)

// facteur tel que R(S, S) = 0,9
var facteur = math.Pow(0.9, 1/decroissance) - 1

// Notes : 1 À revoir, 2 Difficile, 3 Bien, 4 Facile
type Note int

// EtatFSRS : mémoire d'une carte, enregistrée en JSON dans carte.etat_fsrs.
type EtatFSRS struct {
	Stabilite   float64 `json:"stabilite"`
	Difficulte  float64 `json:"difficulte"`
	Repetitions int     `json:"repetitions"`
	Oublis      int     `json:"oublis"`
	Derniere    string  `json:"derniere"`
	// nouvelle, apprentissage (premier jour), revision, reapprentissage (après un oubli)
	Phase string `json:"phase"`
}

const formatDate = "2006-01-02T15:04:05"

func borner(x, mini, maxi float64) float64 { return math.Max(mini, math.Min(maxi, x)) }

// Retenabilite : probabilité de rappel après t jours pour une stabilité s.
func Retenabilite(jours, s float64) float64 {
	if s <= 0 {
		return 0
	}
	return math.Pow(1+facteur*jours/s, decroissance)
}

func intervalleJours(s float64) float64 {
	return borner(s/facteur*(math.Pow(retentionVisee, 1/decroissance)-1), 1, intervalleMaxi)
}

func difficulteInitiale(n Note) float64 {
	return borner(poidsFSRS[4]-math.Exp(poidsFSRS[5]*float64(n-1))+1, 1, 10)
}

func difficulteSuivante(d float64, n Note) float64 {
	delta := -poidsFSRS[6] * float64(n-3)
	dp := d + delta*(10-d)/9 // amortissement linéaire : on approche des bornes de plus en plus lentement
	return borner(poidsFSRS[7]*difficulteInitiale(4)+(1-poidsFSRS[7])*dp, 1, 10)
}

func stabiliteApresRappel(d, s, r float64, n Note) float64 {
	penalite, bonus := 1.0, 1.0
	if n == 2 {
		penalite = poidsFSRS[15]
	}
	if n == 4 {
		bonus = poidsFSRS[16]
	}
	return s * (math.Exp(poidsFSRS[8])*(11-d)*math.Pow(s, -poidsFSRS[9])*(math.Exp(poidsFSRS[10]*(1-r))-1)*penalite*bonus + 1)
}

func stabiliteApresOubli(d, s, r float64) float64 {
	sf := poidsFSRS[11] * math.Pow(d, -poidsFSRS[12]) * (math.Pow(s+1, poidsFSRS[13]) - 1) * math.Exp(poidsFSRS[14]*(1-r))
	return math.Min(sf, s)
}

// Révision le jour même (après un « À revoir ») : formule court terme de FSRS-5.
func stabiliteCourtTerme(s float64, n Note) float64 {
	return s * math.Exp(poidsFSRS[17]*(float64(n)-3+poidsFSRS[18]))
}

// Planifier calcule l'état et l'échéance après une note donnée à l'instant maintenant.
// Une carte notée « À revoir » revient dans quelques minutes (étape d'apprentissage) ;
// sinon l'intervalle est celui où la probabilité de rappel retombe à 90 %.
func Planifier(e EtatFSRS, n Note, maintenant time.Time) (EtatFSRS, time.Time) {
	nouveau := e
	nouveau.Repetitions++
	nouveau.Derniere = maintenant.Format(formatDate)
	if e.Phase == "" || e.Phase == "nouvelle" {
		nouveau.Stabilite = poidsFSRS[n-1]
		nouveau.Difficulte = difficulteInitiale(n)
	} else {
		ecoule := 0.0
		if t, err := time.ParseInLocation(formatDate, e.Derniere, time.Local); err == nil {
			ecoule = math.Max(0, maintenant.Sub(t).Hours()/24)
		}
		nouveau.Difficulte = difficulteSuivante(e.Difficulte, n)
		switch {
		case ecoule < 1:
			nouveau.Stabilite = stabiliteCourtTerme(e.Stabilite, n)
		case n == 1:
			nouveau.Stabilite = stabiliteApresOubli(e.Difficulte, e.Stabilite, Retenabilite(ecoule, e.Stabilite))
		default:
			nouveau.Stabilite = stabiliteApresRappel(e.Difficulte, e.Stabilite, Retenabilite(ecoule, e.Stabilite), n)
		}
		if n == 1 && e.Phase == "revision" {
			nouveau.Oublis++
		}
	}
	nouveau.Stabilite = borner(nouveau.Stabilite, 0.01, intervalleMaxi)
	if n == 1 {
		if e.Phase == "revision" || e.Phase == "reapprentissage" {
			nouveau.Phase = "reapprentissage"
			return nouveau, maintenant.Add(5 * time.Minute)
		}
		nouveau.Phase = "apprentissage"
		return nouveau, maintenant.Add(1 * time.Minute)
	}
	nouveau.Phase = "revision"
	jours := math.Round(intervalleJours(nouveau.Stabilite))
	// Échéance au début de la journée visée : une carte due « dans 3 jours » l'est dès le matin
	debut := time.Date(maintenant.Year(), maintenant.Month(), maintenant.Day(), 4, 0, 0, 0, time.Local)
	return nouveau, debut.AddDate(0, 0, int(jours))
}

// LibelleIntervalle : « 1 min », « 5 min », « 3 j », « 2 mois », « 1,4 an ».
func LibelleIntervalle(de, a time.Time) string {
	d := a.Sub(de)
	if d < time.Hour {
		return formatEntier(math.Max(1, math.Round(d.Minutes()))) + " min"
	}
	// Au-delà : jours de calendrier (journées commençant à 4 h), pas heures écoulées
	jours := math.Round(debutJournee(a).Sub(debutJournee(de)).Hours() / 24)
	if jours == 0 {
		return formatEntier(math.Round(d.Hours())) + " h"
	}
	switch {
	case jours < 31:
		return formatEntier(math.Max(1, jours)) + " j"
	case jours < 365:
		return formatEntier(math.Round(jours/30.4)) + " mois"
	}
	return formatDecimal(jours/365) + " an"
}

func formatEntier(x float64) string { return itoa(int(x)) }

func formatDecimal(x float64) string {
	entier := int(x)
	dixieme := int(math.Round((x - float64(entier)) * 10))
	if dixieme == 10 {
		entier, dixieme = entier+1, 0
	}
	if dixieme == 0 {
		return itoa(entier)
	}
	return itoa(entier) + "," + itoa(dixieme)
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	signe, s := "", ""
	if i < 0 {
		signe, i = "-", -i
	}
	for i > 0 {
		s = string(rune('0'+i%10)) + s
		i /= 10
	}
	return signe + s
}
