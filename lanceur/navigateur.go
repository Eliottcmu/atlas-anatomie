package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// ouvrirFenetre ouvre l'atlas dans une fenêtre d'appli (Edge ou Chrome en mode « --app », sans barre
// d'adresse), avec un profil dédié dans le dossier personnel. À défaut, dans le navigateur par défaut.
func ouvrirFenetre(adresse, donnees string) {
	profil := filepath.Join(donnees, "fenetre")
	options := []string{"--app=" + adresse, "--user-data-dir=" + profil, "--no-first-run",
		"--no-default-browser-check", "--window-size=1440,900"}
	switch runtime.GOOS {
	case "windows":
		for _, chemin := range navigateursWindows() {
			if _, err := os.Stat(chemin); err == nil {
				if exec.Command(chemin, options...).Start() == nil {
					journal("OK", "Fenêtre ouverte avec "+filepath.Base(chemin)+".")
					return
				}
			}
		}
		exec.Command("rundll32", "url.dll,FileProtocolHandler", adresse).Start()
	case "darwin":
		for _, app := range navigateursMac() {
			if _, err := os.Stat(app); err == nil {
				args := append([]string{"-na", app, "--args"}, options...)
				if exec.Command("open", args...).Start() == nil {
					journal("OK", "Fenêtre ouverte avec "+filepath.Base(app)+".")
					return
				}
			}
		}
		// Safari n'a pas de mode appli : l'atlas s'ouvre dans un onglet
		exec.Command("open", adresse).Start()
	default:
		exec.Command("xdg-open", adresse).Start()
	}
	journal("OK", "Atlas ouvert dans le navigateur par défaut : "+adresse)
}

func navigateursWindows() []string {
	var res []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		if base == "" {
			continue
		}
		res = append(res,
			filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
	}
	return res
}

func navigateursMac() []string {
	var res []string
	maison, _ := os.UserHomeDir()
	for _, base := range []string{"/Applications", filepath.Join(maison, "Applications")} {
		for _, nom := range []string{"Google Chrome.app", "Microsoft Edge.app", "Brave Browser.app", "Chromium.app"} {
			res = append(res, filepath.Join(base, nom))
		}
	}
	return res
}

// erreurFatale prévient par une vraie boîte de dialogue (l'appli n'a pas de console), puis s'arrête.
func erreurFatale(quoi, cause, action string) {
	message := quoi + "\n\nCause : " + cause + "\n\nAction : " + action
	journal("FAIL", quoi+" Cause : "+cause+". Action : "+action)
	switch runtime.GOOS {
	case "windows":
		boiteWindows("Atlas d'anatomie", message)
	case "darwin":
		exec.Command("osascript", "-e", `display alert "Atlas d'anatomie" message `+chaineAppleScript(message)+` as critical`).Run()
	}
	os.Exit(1)
}

func chaineAppleScript(s string) string {
	res := `"`
	for _, r := range s {
		switch r {
		case '"':
			res += `\"`
		case '\\':
			res += `\\`
		default:
			res += string(r)
		}
	}
	return res + `"`
}
