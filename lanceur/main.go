// Lanceur de l'atlas d'anatomie : un exécutable par système (Windows, macOS Apple Silicon et Intel).
//
// Au double-clic : ouvre la base personnelle (la crée au premier lancement), fait une sauvegarde,
// apporte les nouveaux brouillons de fiches, sert l'atlas sur http://127.0.0.1 et ouvre une fenêtre
// d'appli. S'arrête de lui-même quand la dernière fenêtre de l'atlas est fermée.
//
// Développement : go run . -racine-projet .. -sans-navigateur -arret-inactivite 0
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"time"
)

var version = "dev"

var sortieJournal io.Writer = os.Stdout

func journal(niveau, message string) {
	fmt.Fprintf(sortieJournal, "%s [%s] %s\n", time.Now().Format("15:04:05"), niveau, message)
}

func main() {
	port := flag.Int("port", 0, "port local (0 : 8765, ou le premier libre)")
	sansNavigateur := flag.Bool("sans-navigateur", false, "ne pas ouvrir de fenêtre (tests)")
	racineProjet := flag.String("racine-projet", "", "développement : ressources lues dans le dépôt")
	inactivite := flag.Duration("arret-inactivite", 20*time.Second, "arrêt après fermeture de la dernière fenêtre (0 : jamais)")
	graine := flag.String("graine", "", "tests : autre base graine")
	flag.Parse()

	chemins, err := resoudreChemins(*racineProjet)
	if err != nil {
		erreurFatale("L'atlas ne trouve pas ses fichiers.", err.Error(), "Retélécharger l'application et la décompresser entièrement.")
	}
	if *graine != "" {
		chemins.Graine = *graine
	}
	fichierJournal := ouvrirJournal(chemins.Donnees)
	if fichierJournal != nil {
		defer fichierJournal.Close()
	}
	journal("OK", fmt.Sprintf("Atlas d'anatomie %s ; données personnelles : %s", version, chemins.Donnees))

	// Une seule instance : un second lancement ouvre simplement la fenêtre de l'atlas déjà en marche
	if adresse := instanceEnCours(chemins.Donnees); adresse != "" {
		journal("OK", "Atlas déjà ouvert sur "+adresse+" : nouvelle fenêtre.")
		if !*sansNavigateur {
			ouvrirFenetre(adresse, chemins.Donnees)
		}
		return
	}

	cheminBase := filepath.Join(chemins.Donnees, "anatomie.sqlite")
	db, err := ouvrirBase(cheminBase)
	if err != nil {
		erreurFatale("La base de l'atlas est illisible.", err.Error(),
			"Restaurer la dernière copie du dossier « sauvegardes » à la place de anatomie.sqlite, dans "+chemins.Donnees+".")
	}
	defer db.Close()
	var fiches int
	db.QueryRow("SELECT COUNT(*) FROM fiche").Scan(&fiches)
	if fiches > 0 {
		if copie, err := sauvegarder(db, filepath.Join(chemins.Donnees, "sauvegardes"), "demarrage"); err != nil {
			journal("WARN", "Sauvegarde impossible : "+err.Error()+". Conséquence : pas de copie aujourd'hui. Action : vérifier l'espace disque.")
		} else {
			journal("OK", "Sauvegarde : "+filepath.Base(copie))
		}
	}
	// Après la sauvegarde du jour : une base d'avant la phase 3 est copiée telle quelle avant d'être complétée
	if err := migrerRevisions(db); err != nil {
		erreurFatale("La base de l'atlas n'a pas pu être mise à jour pour les révisions.", err.Error(),
			"Restaurer la dernière copie du dossier « sauvegardes » à la place de anatomie.sqlite, dans "+chemins.Donnees+".")
	}
	if f, err := fusionnerGraine(db, chemins.Graine); err != nil {
		journal("WARN", "Nouveaux brouillons non importés : "+err.Error()+". Conséquence : fiches existantes intactes.")
	} else {
		journal("OK", fmt.Sprintf("Fiches : %d nouvelles, %d mises à jour, %d inchangées, %d propositions.",
			f.Inserees, f.MisesAJour, f.Inchangees, f.Propositions))
	}
	sources, err := chargerSources(chemins.Sources)
	if err != nil {
		journal("WARN", "Liste des ronéos illisible : "+err.Error()+". Conséquence : liens vers les ronéos inactifs.")
		sources = map[string]InfoSource{}
	}

	ecoute, err := ecouter(*port)
	if err != nil {
		erreurFatale("L'atlas ne peut pas démarrer son serveur local.", err.Error(), "Fermer les autres fenêtres de l'atlas puis relancer.")
	}
	adresse := "http://" + ecoute.Addr().String()
	arret := make(chan string, 4)
	s := &Serveur{db: db, chemins: chemins, base: cheminBase, sources: sources, arret: arret}
	mux := http.NewServeMux()
	s.routes(mux)
	serveur := &http.Server{Handler: entetes(mux), ReadHeaderTimeout: 10 * time.Second}
	ecrireInstance(chemins.Donnees, adresse)
	defer os.Remove(filepath.Join(chemins.Donnees, "instance.json"))

	surveiller(*inactivite, arret)
	go func() {
		interruption := make(chan os.Signal, 1)
		signal.Notify(interruption, os.Interrupt)
		<-interruption
		arret <- "interruption"
	}()
	go func() {
		if err := serveur.Serve(ecoute); err != nil && !errors.Is(err, http.ErrServerClosed) {
			arret <- "erreur du serveur : " + err.Error()
		}
	}()
	journal("OK", "Atlas prêt sur "+adresse)
	if !*sansNavigateur {
		ouvrirFenetre(adresse, chemins.Donnees)
	}
	raison := <-arret
	journal("OK", "Arrêt : "+raison+".")
	ctx, annuler := context.WithTimeout(context.Background(), 3*time.Second)
	defer annuler()
	serveur.Shutdown(ctx)
}

// ecouter : 8765 de préférence (adresse stable), sinon un port voisin, sinon n'importe lequel.
func ecouter(port int) (net.Listener, error) {
	if port != 0 {
		return net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	}
	for p := 8765; p < 8776; p++ {
		if l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); err == nil {
			return l, nil
		}
	}
	return net.Listen("tcp", "127.0.0.1:0")
}

func entetes(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		h.ServeHTTP(w, r)
	})
}

func ouvrirJournal(dossier string) *os.File {
	chemin := filepath.Join(dossier, "journal.txt")
	if info, err := os.Stat(chemin); err == nil && info.Size() > 1<<20 {
		os.Rename(chemin, chemin+".ancien")
	}
	f, err := os.OpenFile(chemin, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil
	}
	sortieJournal = io.MultiWriter(os.Stdout, f)
	return f
}

// ------------------------------------------------------------ instance unique

func ecrireInstance(dossier, adresse string) {
	contenu, _ := json.Marshal(map[string]any{"adresse": adresse, "pid": os.Getpid()})
	os.WriteFile(filepath.Join(dossier, "instance.json"), contenu, 0o644)
}

func instanceEnCours(dossier string) string {
	contenu, err := os.ReadFile(filepath.Join(dossier, "instance.json"))
	if err != nil {
		return ""
	}
	var i struct{ Adresse string }
	if json.Unmarshal(contenu, &i) != nil || i.Adresse == "" {
		return ""
	}
	client := http.Client{Timeout: 1500 * time.Millisecond}
	r, err := client.Get(i.Adresse + "/api/etat")
	if err != nil {
		return ""
	}
	defer r.Body.Close()
	var e struct{ Atlas bool }
	if json.NewDecoder(r.Body).Decode(&e) != nil || !e.Atlas {
		return ""
	}
	return i.Adresse
}

// ------------------------------------------------------------ arrêt quand la dernière fenêtre se ferme

// Chaque page envoie un battement toutes les 15 s avec son identifiant, et un « départ » en se fermant.
// Un onglet en arrière-plan peut être ralenti par le navigateur : on le garde 3 minutes sans nouvelles.
var (
	verrouPages sync.Mutex
	pages       = map[string]time.Time{}
	dejaVu      bool
	departA     time.Time
)

func (s *Serveur) battement(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("page")
	verrouPages.Lock()
	if r.URL.Query().Get("depart") == "1" {
		delete(pages, id)
		departA = time.Now()
	} else if id != "" {
		pages[id] = time.Now()
		dejaVu = true
	}
	verrouPages.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Serveur) quitter(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
	select {
	case s.arret <- "demande de l'interface":
	default:
	}
}

func surveiller(delai time.Duration, arret chan<- string) {
	if delai == 0 {
		return
	}
	debut := time.Now()
	go func() {
		for range time.Tick(2 * time.Second) {
			verrouPages.Lock()
			for id, vu := range pages {
				if time.Since(vu) > 3*time.Minute {
					delete(pages, id)
				}
			}
			ouvertes, vu, depart := len(pages), dejaVu, departA
			verrouPages.Unlock()
			switch {
			case !vu && time.Since(debut) > 10*time.Minute:
				arret <- "aucune fenêtre ouverte depuis 10 minutes"
				return
			case vu && ouvertes == 0 && !depart.IsZero() && time.Since(depart) > delai:
				arret <- "dernière fenêtre fermée"
				return
			case vu && ouvertes == 0 && depart.IsZero():
				// Fenêtre disparue sans prévenir (plantage du navigateur) : les 3 minutes ont expiré
				arret <- "plus aucune fenêtre ne répond"
				return
			}
		}
	}()
}
