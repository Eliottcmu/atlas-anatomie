# Atlas d'anatomie

Un atlas d'anatomie en 3D pour apprendre les vaisseaux, les muscles, les os et les organes : on tourne autour du corps, on clique sur une structure pour voir son nom et sa fiche, et l'atlas propose chaque jour des révisions adaptées à ce qu'on sait déjà.

Il fonctionne **sans connexion internet** et **sans rien installer** d'autre.

## Télécharger

Choisis la version de ton ordinateur :

| Windows | Mac |
| :---: | :---: |
| **[Télécharger pour Windows](https://github.com/Eliottcmu/atlas-anatomie/releases/latest/download/Atlas-anatomie-Windows.zip)** | **[Télécharger pour Mac](https://github.com/Eliottcmu/atlas-anatomie/releases/latest/download/Atlas-anatomie-Mac.zip)** |
| Windows 10 ou 11 | macOS 11 (Big Sur) ou plus récent |
| Fichier zip d'environ 50 Mo | Fichier zip d'environ 55 Mo, pour tous les Mac (puce Apple ou Intel) |

Les deux liens téléchargent toujours la dernière version. Toutes les versions sont sur la page [Versions](https://github.com/Eliottcmu/atlas-anatomie/releases).

Le plus simple est souvent l'**installation en une commande** décrite plus bas : elle télécharge, installe, crée les raccourcis et évite l'avertissement de sécurité du premier lancement.

## Configuration requise

| | Windows | Mac |
| --- | --- | --- |
| Système | Windows 10 ou 11, 64 bits | macOS 11 (Big Sur) ou plus récent, puce Apple (M1, M2...) ou Intel |
| Navigateur | Microsoft Edge, déjà présent sur tout Windows 10 et 11 | Chrome ou Edge conseillés ; sinon Safari 15 ou plus récent |
| Mémoire | 8 Go conseillés (4 Go au minimum) | 8 Go conseillés (4 Go au minimum) |
| Place sur le disque | Environ 60 Mo, plus quelques Mo pour ta progression | Environ 60 Mo, plus quelques Mo pour ta progression |
| Carte graphique | Compatible WebGL 2 : c'est le cas de presque tout ordinateur depuis 2015 | Tous les Mac compatibles avec macOS 11 |
| Internet | Seulement pour télécharger l'atlas | Seulement pour télécharger l'atlas |

Il faut un ordinateur avec souris ou pavé tactile et un clavier : l'atlas n'est pas prévu pour tablette ni téléphone. Aucun droit administrateur n'est nécessaire.

## Installer et ouvrir sur Windows

### Méthode simple : une commande (recommandée)

1. Ouvre le menu **Démarrer**, tape `PowerShell`, puis appuie sur **Entrée**. Une fenêtre bleue ou noire s'ouvre.
2. Copie la ligne ci-dessous (bouton de copie à droite du cadre), colle-la dans cette fenêtre avec un **clic droit**, puis appuie sur **Entrée** :

   ```
   irm https://raw.githubusercontent.com/Eliottcmu/atlas-anatomie/main/installation/installer-windows.ps1 | iex
   ```

3. Attends le message « C'est prêt » : l'atlas s'ouvre tout seul. Tu peux fermer la fenêtre PowerShell.

L'atlas est installé dans ton dossier personnel, avec un raccourci sur le **Bureau** et dans le menu **Démarrer**, sans écran d'avertissement de Windows. Pour le **mettre à jour**, relance la même commande : ta progression est gardée. Le script est lisible ici : [installation/installer-windows.ps1](installation/installer-windows.ps1).

### Méthode manuelle

1. Clique sur **Télécharger pour Windows**. Le fichier `Atlas-anatomie-Windows.zip` arrive dans ton dossier **Téléchargements**.
2. Fais un **clic droit** sur ce fichier, puis **Extraire tout...**, puis **Extraire**. Un dossier « Atlas d'anatomie » apparaît.
   (Ne lance pas l'atlas sans avoir extrait le dossier : depuis l'intérieur du zip, il ne marche pas.)
3. Ouvre ce dossier et double-clique sur **Atlas d'anatomie** (l'icône à l'arbre doré).
4. **La première fois seulement**, Windows affiche un écran bleu « Windows a protégé votre ordinateur ». C'est normal : l'atlas est gratuit et n'a pas acheté de certificat d'éditeur.
   Clique sur **Informations complémentaires**, puis sur le bouton **Exécuter quand même**.
5. L'atlas s'ouvre dans sa propre fenêtre. Le premier chargement prend quelques secondes.

Astuce : pour le retrouver facilement, fais un clic droit sur « Atlas d'anatomie », **Afficher d'autres options**, **Envoyer vers**, **Bureau (créer un raccourci)**.

## Installer et ouvrir sur Mac

### Méthode simple : une commande (recommandée)

1. Ouvre le **Terminal** : appuie sur **Cmd + Espace**, tape `Terminal`, puis appuie sur **Entrée**.
2. Copie la ligne ci-dessous (bouton de copie à droite du cadre), colle-la dans le Terminal avec **Cmd + V**, puis appuie sur **Entrée** :

   ```
   curl -fsSL https://raw.githubusercontent.com/Eliottcmu/atlas-anatomie/main/installation/installer-mac.sh | sh
   ```

3. Attends le message « C'est prêt » : l'atlas s'ouvre tout seul. Tu peux fermer le Terminal.

L'atlas est installé dans le dossier **Applications** (il apparaît aussi dans le Launchpad), sans avertissement de sécurité du Mac. Pour le **mettre à jour**, relance la même commande : ta progression est gardée. Le script est lisible ici : [installation/installer-mac.sh](installation/installer-mac.sh).

### Méthode manuelle

1. Clique sur **Télécharger pour Mac**. Le fichier arrive dans ton dossier **Téléchargements** ; en général, le Mac le décompresse tout seul. Sinon, double-clique sur `Atlas-anatomie-Mac.zip`.
2. Fais glisser **Atlas d'anatomie** dans le dossier **Applications** (dans le Finder, colonne de gauche).
3. Double-clique sur **Atlas d'anatomie** dans Applications.
4. **La première fois seulement**, le Mac affiche un message du type « Apple ne peut pas vérifier qu'Atlas d'anatomie ne contient pas de logiciel malveillant ». C'est normal : l'atlas est gratuit et n'a pas de compte développeur Apple payant. Clique sur **OK** (ou **Terminé**), puis :
   - **macOS 15 (Sequoia) ou plus récent** : ouvre **Réglages Système**, puis **Confidentialité et sécurité**. Descends tout en bas : un message parle d'Atlas d'anatomie. Clique sur **Ouvrir quand même**, puis confirme avec ton mot de passe.
   - **macOS 14 ou plus ancien** : dans Applications, fais un **clic droit** (ou Ctrl + clic) sur Atlas d'anatomie, choisis **Ouvrir**, puis encore **Ouvrir**.
5. L'atlas s'ouvre dans une fenêtre de Chrome ou d'Edge s'ils sont installés, sinon dans Safari.

## Premiers pas

- **Tourner** autour du corps : clic gauche maintenu et glisser (sur Mac : deux doigts sur le pavé tactile). **Zoomer** : molette ou pincement.
- **Cliquer** sur une structure : son nom et sa fiche s'affichent.
- **Chercher** une structure : `Ctrl K` (Windows) ou `Cmd K` (Mac), puis tape son nom.
- **Aller à une région ou un organe** (planche légendée) : touche `G`.
- **Réviser** : touche `Q`. **Parcours guidés** : touche `P`. **Progrès** : touche `B`.
- **Toutes les touches** : touche `?`.

Au premier lancement, une courte visite guidée présente l'essentiel.

## Bon à savoir

- **Tes progrès sont gardés sur ton ordinateur**, en dehors de l'application. Tu peux remplacer l'atlas par une nouvelle version sans rien perdre.
- **Les fiches sont des brouillons** rédigés par une intelligence artificielle (Claude) à partir de cours de médecine. Chaque fiche indique ce qui vient du cours et ce qui est « hors ronéos, à vérifier ». **Vérifie-les toujours avec ton propre cours** avant de les apprendre.
- **Les ronéos (supports de cours) ne sont pas fournies** : ce sont des documents de cours. Les fiches citent le cours et la page ; si tu as ce cours, ouvre-le à la page indiquée.
- **Mettre à jour** : relance la commande d'installation. Si tu as installé à la main, télécharge la nouvelle version et remplace l'ancienne (Windows : le dossier « Atlas d'anatomie » ; Mac : l'application dans Applications). Tes progrès restent.
- **Désinstaller** : Windows, supprime le dossier `%LOCALAPPDATA%\Programs\Atlas d'anatomie` (ou le dossier que tu avais décompressé) et ses raccourcis ; Mac, mets « Atlas d'anatomie » à la corbeille depuis Applications. Ta progression reste dans le dossier indiqué ci-dessous : supprime-le aussi pour tout effacer.
- **En cas de problème** : un fichier `journal.txt` explique ce qui s'est passé. Il se trouve dans `%LOCALAPPDATA%\AtlasAnatomie` sous Windows (colle ce chemin dans la barre d'adresse de l'Explorateur) et dans `~/Library/Application Support/AtlasAnatomie` sur Mac (Finder, menu **Aller**, **Aller au dossier...**).

## Ce que contient l'atlas

- Un corps entier en 3D : artères, veines, os, muscles et organes, chaque morceau cliquable et nommé en français.
- 91 vaisseaux et 118 muscles au programme, chacun avec sa fiche (brouillon à vérifier).
- 29 régions et 48 organes en vue de planche d'atlas, avec plus de 1 600 repères légendés sur les os et les organes.
- Des révisions espacées (méthode FSRS) : nommer une structure, la retrouver sur le modèle.

---

## Pour les développeurs

Application locale, sans connexion : lanceur Go (SQLite intégré, API des fiches et des révisions FSRS) qui sert une interface Vite, TypeScript et three.js. Plan complet : [docs/plan.md](docs/plan.md). Conventions : [CLAUDE.md](CLAUDE.md).

### Prérequis

Développement fait et testé sous Windows 11 ; les paquets Mac sont produits par compilation croisée depuis Windows.

| Outil | Version | Sert à | Installation |
| --- | --- | --- | --- |
| Python | 3.12 | pipeline de données, construction des paquets | `winget install Python.Python.3.12` |
| numpy, scipy, Pillow | voir [requirements.txt](requirements.txt) | géométrie, recalage, icônes | automatique (ci-dessous) |
| Node.js | 22.11 ou plus récent | interface (Vite 6), tests | `winget install OpenJS.NodeJS.LTS` |
| Dépendances de l'interface | voir `app/package-lock.json` | Vite, three.js, Playwright | automatique (`npm ci`) |
| Go | 1.27 | lanceur de l'appli (Windows et Mac) | automatique (Go portable, empreinte vérifiée) |
| Microsoft Edge | récent | tests de l'interface (Playwright) | présent sous Windows |
| Git | récent | versionnement ; fournit aussi `pdftotext` | `winget install Git.Git` |
| Blender | 5.2 | facultatif : régénérer les structures et légendes de Z-Anatomy | `winget install BlenderFoundation.Blender` |

Vérifier et installer d'un coup ce qui peut l'être (paquets Python, dépendances de l'interface, Go portable dans `%LOCALAPPDATA%\AtlasAnatomie\outils\go`) :

```
python -I pipeline/verifier_outils.py --installer
```

Sans `--installer`, le script fait seulement le bilan. Les modèles 3D (`modeles/*.glb`) et les sources brutes ne sont pas versionnés : sur un dépôt neuf, les régénérer avec le pipeline (section suivante ; Blender requis pour la partie Z-Anatomy). Les ronéos, personnelles, ne sont jamais versionnées : la version à partager s'en passe.

### Construire les paquets

- **Usage personnel**, ronéos comprises (ne jamais publier) : `python -I pipeline/construire_appli.py`, dans `distribution/`.
- **À partager**, sans ronéos : `python -I pipeline/construire_appli.py --partage`, dans `distribution/partage/`. Vérifier avec `python -I pipeline/verifier_appli.py --partage` et `cd app && node tests/appli.mjs --partage`.
- **Publier** les paquets à partager comme version GitHub (les liens de téléchargement ci-dessus pointent vers la dernière) :
  `gh release create vAAAA.MM.JJ distribution/partage/Atlas-anatomie-Windows.zip distribution/partage/Atlas-anatomie-Mac.zip --title "..." --notes "..."`

Mode développement (rechargement à chaud de l'interface) : `lancer.bat`.

### État

Phase 4, muscles (bloc 2), en cours : liste noyau de 118 muscles calée sur les ronéos UE10, modèles 3D (BodyParts3D, compléments Z-Anatomy), 118 brouillons de fiches. Restent les organes (bloc 3) et les os (bloc 4).

Phase 3, apprentissage : parcours guidés (P), révision du jour planifiée par FSRS (Q), tableau de bord et coloration du modèle selon la maîtrise (B), premier lancement guidé. Nommer et localiser dès maintenant ; relations, trajets et vrai ou faux à mesure que les fiches sont vérifiées. Journal : [docs/journal_phase3.md](docs/journal_phase3.md).

Phase 2, fiches des vaisseaux : liste noyau calée sur les ronéos (91 structures noyau), 91 brouillons de fiches rédigés à partir des cours de Montaudon, chaque champ sourcé. Journal : [docs/journal_phase2.md](docs/journal_phase2.md).

Phase 1, visualiseur 3D : mode Explorer (calques, os en repère, clic, recherche, fiche), focus sur les régions et les organes, coupes frontale, sagittale et horizontale. Journal : [docs/journal_phase1.md](docs/journal_phase1.md), test des clics : [rapports/test_clic.md](rapports/test_clic.md).

Phase 0, socle de données : inventaire de couverture 3D ([rapports/rapport_couverture.md](rapports/rapport_couverture.md)), maillages BodyParts3D convertis en GLB, structures manquantes exportées de Z-Anatomy puis recalées. Journal : [docs/journal_phase0.md](docs/journal_phase0.md).

### Reproduire les données

```
python -I pipeline/verifier_outils.py --installer  # outils en place
python -I pipeline/telecharger_sources.py      # environ 270 Mo, une seule fois
python -I pipeline/extraire_noms_secours.py    # noms disponibles dans Z-Anatomy et le Human Reference Atlas
python -I pipeline/libelles_wikidata.py        # identifiants FMA et libellés français (connexion requise)
python -I pipeline/inventaire_couverture.py    # inventaire CSV et rapport Markdown
python -I pipeline/convertir_glb.py --compresser  # un GLB par système dans modeles/ (environ 1 min 30)
python -I pipeline/zanatomy.py --compresser       # vaisseaux de Z-Anatomy recalés (environ 5 min, Blender requis)
python -I pipeline/organes_zanatomy.py --compresser  # organes, os et muscles de Z-Anatomy recalés (environ 15 min, Blender requis)
python -I pipeline/legendes_squelette.py        # légendes osseuses de Z-Anatomy posées sur les os (environ 8 min)
python -I pipeline/construire_atlas.py          # app/public/donnees/atlas.json : nom, côté et structure de chaque maillage
cd app && npm ci && npm run test:clic            # test du clic sur chaque structure noyau (Edge requis)
npm run test:focus                               # test de chaque focus de région et d'organe
python -I pipeline/extraire_roneos.py           # texte des ronéos page par page (donnees/derive/roneos/)
python -I pipeline/couverture_roneos.py         # nomenclature et couverture par les ronéos
python -I pipeline/construire_appli.py --dev    # base graine et lanceur de développement
python -I pipeline/controler_citations.py       # chaque champ de fiche face aux pages qu'il cite
npm run test:fiches                              # fiches : affichage, correction, vérification
npm run test:toutes-fiches                       # toutes les fiches s'ouvrent et affichent tous leurs champs
npm run test:navigation                          # fil d'Ariane, historique, légendes, raccourcis, pavé tactile
npm run test:apprentissage                       # cartes, révision FSRS, parcours et mini-quiz, tableau de bord
npm run test:os                                  # focus des os, légendes, interrogation, masquage annulable
cd lanceur && go test ./...                      # FSRS et API des révisions (Go portable, voir CLAUDE.md)
```

### Fichiers

| Chemin | Rôle |
| --- | --- |
| `donnees/listes/liste_noyau_bloc*.csv` | Listes noyau éditées à la main (bloc 1 vaisseaux, bloc 2 muscles) : la source de vérité |
| `donnees/brut/` | Téléchargements non modifiés, hors git |
| `donnees/derive/` | Listes de noms extraites des sources de secours, libellés Wikidata, légendes recalées |
| `modeles/bp3d_*.glb` | Un GLB par système (artères, veines, os, muscles, autres), un nœud par fichier FJ, hors git |
| `modeles/index_maillages.csv` | Fichier FJ, concept FMA, système, centre en mètres |
| `modeles/zanatomy_*.glb`, `modeles/index_zanatomy*.csv` | Structures prises dans Z-Anatomy et recalées sur BodyParts3D |
| `rapports/inventaire_couverture.csv` | Une ligne par structure : maillage, côtés, sources de secours, nom TA2 |
| `rapports/rapport_couverture.md` | Taux par région, manquants, écarts de nomenclature |
| `donnees/roneos/` | Ronéos déposées par Eliott (PDF), sources des fiches, hors git |
| `donnees/fiches/brouillons/*.json` | Brouillons de fiches rédigés par Claude, chaque champ sourcé (ronéo, pages) |
| `lanceur/` | Lanceur en Go : sert l'atlas, API des fiches, SQLite intégré ; un exécutable par système |
| `installation/` | Scripts d'installation et de mise à jour en une commande (Windows et Mac), qui téléchargent la dernière version publiée |
| `requirements.txt`, `pipeline/verifier_outils.py` | Paquets Python du pipeline ; bilan et installation des outils de développement |
| `lanceur/schema.sql` | Schéma de la base, commun au lanceur et au pipeline |
| `app/` | Interface : Vite 6, TypeScript, three.js ; `src/` le code, `tests/` les tests Playwright |
| `app/public/donnees/atlas.json` | Données de l'interface, générées par `pipeline/construire_atlas.py` |
| `donnees/listes/traductions_fr.csv` | Noms français des maillages et des légendes hors liste noyau (traduction Claude, à relire) |
| `pipeline/focus.py` | Définition des régions (boîtes calculées sur les os) et des organes (arbre « partie de ») |

## Sources et licences

- BodyParts3D 4.0, DBCLS, CC BY 4.0 : modèle principal.
- Z-Anatomy, CC BY-SA 4.0 : structures absentes de BodyParts3D (vaisseaux, organes, muscles, os de petite taille), légendes, traduction française de la TA2. Le partage à l'identique s'applique à tout maillage repris de Z-Anatomy.
- Human Reference Atlas (HuBMAP), vascularisation sanguine homme et femme v1.3, CC BY 4.0, d'après le Visible Human Dataset (NLM).
- Wikidata, CC0 : identifiants FMA et libellés français.
