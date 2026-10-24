package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Chemins : ressources livrées avec l'appli (lecture seule) et dossier personnel (base, sauvegardes).
type Chemins struct {
	App     string // interface construite (index.html, assets, donnees/atlas.json)
	Modeles string // modèles 3D (GLB)
	Roneos  string // ronéos en PDF
	Sources string // codes des ronéos citables (sources.json)
	Graine  string // base graine : structures et brouillons de fiches
	Donnees string // dossier personnel : anatomie.sqlite, sauvegardes, journal
}

// resoudreChemins trouve les ressources à côté de l'exécutable (appli livrée) ou dans le dépôt (développement).
func resoudreChemins(racineProjet string) (Chemins, error) {
	var c Chemins
	if racineProjet != "" {
		r, err := filepath.Abs(racineProjet)
		if err != nil {
			return c, err
		}
		c = Chemins{
			App:     filepath.Join(r, "app", "dist"),
			Modeles: filepath.Join(r, "modeles"),
			Roneos:  filepath.Join(r, "donnees", "roneos"),
			Sources: filepath.Join(r, "donnees", "fiches", "sources.json"),
			Graine:  filepath.Join(r, "construction", "graine.sqlite"),
		}
	} else {
		exe, err := os.Executable()
		if err != nil {
			return c, err
		}
		exe, _ = filepath.EvalSymlinks(exe)
		dossier := filepath.Dir(exe)
		ressources := filepath.Join(dossier, "ressources")
		// macOS : Atlas d'anatomie.app/Contents/MacOS/atlas -> Contents/Resources/ressources
		if filepath.Base(dossier) == "MacOS" {
			ressources = filepath.Join(filepath.Dir(dossier), "Resources", "ressources")
		}
		if _, err := os.Stat(ressources); err != nil {
			return c, errors.New("dossier « ressources » introuvable à côté de l'application : " + ressources)
		}
		c = Chemins{
			App:     filepath.Join(ressources, "app"),
			Modeles: filepath.Join(ressources, "modeles"),
			Roneos:  filepath.Join(ressources, "roneos"),
			Sources: filepath.Join(ressources, "sources.json"),
			Graine:  filepath.Join(ressources, "graine.sqlite"),
		}
	}
	donnees, err := dossierPersonnel()
	if err != nil {
		return c, err
	}
	c.Donnees = donnees
	return c, os.MkdirAll(c.Donnees, 0o755)
}

// dossierPersonnel : là où vivent la base et les sauvegardes, hors de l'appli (une mise à jour ne les touche pas).
// Windows : %LOCALAPPDATA%\AtlasAnatomie ; macOS : ~/Library/Application Support/AtlasAnatomie.
func dossierPersonnel() (string, error) {
	if d := os.Getenv("ATLAS_DONNEES"); d != "" {
		return d, nil
	}
	if runtime.GOOS == "windows" {
		if l := os.Getenv("LOCALAPPDATA"); l != "" {
			return filepath.Join(l, "AtlasAnatomie"), nil
		}
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "AtlasAnatomie"), nil
}

// squelette : nom réduit à ses caractères ASCII, pour retrouver un fichier dont les accents sont
// décomposés (« e » suivi d'un accent combinant, fréquent après un passage par macOS ou OneDrive).
func squelette(nom string) string {
	var b strings.Builder
	for _, r := range nom {
		if r < 128 {
			b.WriteRune(r)
		}
	}
	return b.String()
}
