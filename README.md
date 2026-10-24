# Atlas d'anatomie local

Application locale, sans connexion, pour apprendre à nommer, situer et décrire les vaisseaux, muscles et organes sur un modèle 3D cliquable, avec révisions espacées (FSRS). Plan complet : [docs/plan.md](docs/plan.md).

## Utiliser l'atlas

L'atlas est une appli téléchargeable, pour Windows 10 et 11 et pour macOS 11 ou plus récent (puces Apple et Intel), sans rien à installer :

- `distribution/Atlas-anatomie-Windows.zip` : décompresser, double-cliquer sur « Atlas d'anatomie.exe ».
- `distribution/Atlas-anatomie-Mac.zip` : décompresser, glisser « Atlas d'anatomie » dans Applications, l'ouvrir.

Le mode d'emploi (`Lisez-moi.txt`, dans chaque paquet) explique l'avertissement du premier lancement, propre aux applis non signées. L'atlas s'ouvre dans sa propre fenêtre ; pendant qu'il tourne, il est aussi accessible dans un navigateur à http://127.0.0.1:8765. La base personnelle (progression, fiches vérifiées) vit hors de l'appli, dans `%LOCALAPPDATA%\AtlasAnatomie` ou `~/Library/Application Support/AtlasAnatomie`, avec une sauvegarde datée à chaque lancement.

Construire les paquets : `python -I pipeline/construire_appli.py` (environ 1 min 30), puis `python -I pipeline/verifier_appli.py` et `cd app && npm run test:appli`.

Mode développement (rechargement à chaud de l'interface) : `lancer.bat`.

## État

Phase 3, apprentissage, en cours : parcours guidés (P), révision du jour planifiée par FSRS (Q), tableau de bord et coloration du modèle selon la maîtrise (B), premier lancement guidé. Nommer et localiser dès maintenant ; relations, trajets et vrai ou faux à mesure que les fiches sont vérifiées. Journal : [docs/journal_phase3.md](docs/journal_phase3.md).

Phase 2, fiches des vaisseaux : liste noyau calée sur les ronéos (91 structures noyau), 91 brouillons de fiches rédigés à partir des cours de Montaudon, chaque champ sourcé ; appli téléchargeable Windows et macOS. Reste la vérification des fiches par Eliott dans l'appli, qui franchit le portail. Journal : [docs/journal_phase2.md](docs/journal_phase2.md).

Phase 1, visualiseur 3D, terminée : mode Explorer (calques, os en repère, clic, recherche, fiche), focus sur 29 régions et 28 organes, coupes frontale, sagittale et horizontale. Journal : [docs/journal_phase1.md](docs/journal_phase1.md), test des clics : [rapports/test_clic.md](rapports/test_clic.md).

Phase 0, socle de données, terminée : inventaire de couverture 3D des vaisseaux noyau (bloc 1), dans [rapports/rapport_couverture.md](rapports/rapport_couverture.md), maillages BodyParts3D convertis en GLB, et vaisseaux manquants exportés de Z-Anatomy puis recalés. Journal : [docs/journal_phase0.md](docs/journal_phase0.md).

## Reproduire l'inventaire

Python 3.12 avec numpy ; Node.js pour la compression des GLB ; Blender 5.2 pour Z-Anatomy.

```
python -I pipeline/telecharger_sources.py      # environ 270 Mo, une seule fois
python -I pipeline/extraire_noms_secours.py    # noms disponibles dans Z-Anatomy et le Human Reference Atlas
python -I pipeline/libelles_wikidata.py        # identifiants FMA et libellés français (connexion requise)
python -I pipeline/inventaire_couverture.py    # inventaire CSV et rapport Markdown
python -I pipeline/convertir_glb.py --compresser  # un GLB par système dans modeles/ (environ 1 min 30)
python -I pipeline/zanatomy.py --compresser       # vaisseaux de Z-Anatomy recalés (environ 5 min, Blender requis)
python -I pipeline/organes_zanatomy.py --compresser  # organes et légendes de Z-Anatomy recalés (environ 15 min, Blender requis)
python -I pipeline/construire_atlas.py          # app/public/donnees/atlas.json : nom, côté et structure de chaque maillage
cd app && npm ci && npm run test:clic            # test du clic sur chaque structure noyau (Edge requis)
npm run test:focus                               # test de chaque focus de région et d'organe
python -I pipeline/extraire_roneos.py           # texte des ronéos page par page (donnees/derive/roneos/)
python -I pipeline/couverture_roneos.py         # nomenclature et couverture par les ronéos
python -I pipeline/construire_appli.py --dev    # base graine et lanceur de développement
python -I pipeline/controler_citations.py       # chaque champ de fiche face aux pages qu'il cite
npm run test:fiches                              # fiches : affichage, correction, vérification
npm run test:toutes-fiches                       # les 91 fiches s'ouvrent et affichent tous leurs champs
npm run test:navigation                          # fil d'Ariane, historique, légendes, raccourcis, pavé tactile
npm run test:apprentissage                       # cartes, révision FSRS, parcours et mini-quiz, tableau de bord
cd lanceur && go test ./...                      # FSRS et API des révisions (Go portable, voir CLAUDE.md)
```

## Fichiers

| Chemin | Rôle |
| --- | --- |
| `donnees/listes/liste_noyau_bloc1.csv` | Liste noyau des vaisseaux, éditée à la main : c'est la source de vérité |
| `donnees/brut/` | Téléchargements non modifiés, hors git |
| `donnees/derive/` | Listes de noms extraites des sources de secours, libellés Wikidata |
| `modeles/bp3d_*.glb` | Un GLB par système (artères, veines, os, muscles, autres), un nœud par fichier FJ, hors git |
| `modeles/index_maillages.csv` | Fichier FJ, concept FMA, système, centre en mètres |
| `modeles/zanatomy_*.glb`, `modeles/index_zanatomy.csv` | Vaisseaux et segments de raccord pris dans Z-Anatomy, écart à l'origine contrôlé |
| `rapports/inventaire_couverture.csv` | Une ligne par structure : maillage, côtés, sources de secours, nom TA2 |
| `rapports/rapport_couverture.md` | Taux par région, manquants, écarts de nomenclature |
| `donnees/roneos/` | Ronéos déposées par Eliott (PDF), sources des fiches |
| `donnees/fiches/brouillons/*.json` | Brouillons de fiches rédigés par Claude, chaque champ sourcé (ronéo, pages) |
| `lanceur/` | Lanceur en Go : sert l'atlas, API des fiches, SQLite intégré ; un exécutable par système |
| `lanceur/schema.sql` | Schéma de la base, commun au lanceur et au pipeline |
| `rapports/nomenclature_roneos.md` | Noms employés par les ronéos, structures absentes des cours |
| `app/` | Interface : Vite 6, TypeScript, three.js ; `src/` le code, `tests/clic.mjs` le test du portail |
| `app/public/donnees/atlas.json` | Données de l'interface, générées par `pipeline/construire_atlas.py` |
| `donnees/listes/traductions_fr.csv` | Noms français des maillages et des légendes hors liste noyau (traduction Claude, à relire) |
| `rapports/recalage_organes.md` | Recalage des organes de Z-Anatomy, doublons écartés, légendes posées |
| `rapports/test_clic.md`, `rapports/test_focus.md` | Résultats des tests des clics et du focus |
| `pipeline/focus.py` | Définition des régions (boîtes calculées sur les os) et des organes (arbre « partie de ») |

## Sources et licences

- BodyParts3D 4.0, DBCLS, CC BY 4.0 : modèle principal.
- Human Reference Atlas (HuBMAP), vascularisation sanguine homme et femme v1.3, CC BY 4.0, d'après le Visible Human Dataset (NLM).
- Wikidata, CC0 : identifiants FMA et libellés français.
- Z-Anatomy, CC BY-SA 4.0 : source de secours pour les vaisseaux absents de BodyParts3D, et traduction française de la TA2. Le partage à l'identique s'applique à tout maillage repris de Z-Anatomy.
