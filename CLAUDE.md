# Atlas d'anatomie local

Appli locale d'apprentissage de l'anatomie sur modèle 3D, avec révisions espacées. Plan complet : [docs/plan.md](docs/plan.md) (le document en ligne fait foi).

## Conventions

- Aucun emoji, ni dans le code ni dans les textes.
- Commentaires et messages en français.
- Journaux balisés `[OK]`, `[WARN]`, `[FAIL]`, construits en cause, conséquence, action.
- Python lancé avec `python -I` (les données téléchargées ne doivent jamais être importables).
- CSV : séparateur `;`, encodage UTF-8 avec BOM (ouverture directe dans Excel).

## Arborescence

- `donnees/brut/` : téléchargements non modifiés (BodyParts3D, Human Reference Atlas, Z-Anatomy). Non versionné, se reconstitue avec `pipeline/telecharger_sources.py`.
- `donnees/listes/` : listes éditées à la main, source de vérité (liste noyau, arbre vasculaire, corrections d'étiquettes, traductions).
- `pipeline/` : scripts de préparation des données.
- `donnees/derive/` : extraits générés depuis les sources (noms Z-Anatomy et HRA, libellés Wikidata).
- `modeles/` : GLB générés par `pipeline/convertir_glb.py` (repère glTF : mètres, Y en haut, Z vers l'avant, droite du sujet vers -X).
- `rapports/` : sorties générées par le pipeline, ne pas éditer à la main.
- Cache hors OneDrive : `%LOCALAPPDATA%\AtlasAnatomie\z-anatomy\` (Startup.blend extrait, exports intermédiaires).

## Interface (app/)

- Vite 6.4.4 (Vite 8 exige Node 22.12, le poste a 22.11), TypeScript 6, three.js 0.186.1, three-mesh-bvh pour les clics. Versions épinglées exactes.
- Les GLB restent dans `modeles/` : `vite.config.ts` les sert sous `/modeles/`.
- Après une modification de l'interface : `npx tsc --noEmit`, puis `npm run test:clic`, `test:focus`, `test:fiches`, `test:toutes-fiches`, `test:navigation`, `test:apprentissage`, `test:os` (pilotent Edge par Playwright ; ils démarrent `construction/lanceur-dev.exe` sur un dossier de données jetable).
- Dans les tests, ne jamais envoyer Échap pour fermer une sélection : sans sélection, Échap quitte le focus. Utiliser `window.__atlas.deselectionner()`.
- Le CSS force `[hidden] { display: none !important; }` : sans cette règle, un composant en `display: grid` reste affiché malgré `hidden`.
- Polices embarquées (@fontsource), aucune ressource en ligne : l'atlas doit marcher hors connexion.
- Les tests posent `localStorage["atlas.accueil"] = "vu"` avant le chargement : la carte des premiers pas recouvrirait la vue.
- Panneaux en position fixe : tester leur visibilité par `getClientRects()`, jamais `offsetParent` (toujours nul).
- La caméra cadre dans la zone libre entre les panneaux (`Scene3D.definirZoneUtile`, décalage de projection) : rien ne doit être cadré sous le dock ou la fiche.
- Masquage (H) annulable : Ctrl Z remet la dernière structure masquée (sélectionnée), Ctrl Y ou Ctrl Maj Z refait ; Échap « tout réafficher » s'annule aussi. Dans un champ de saisie, Ctrl Z reste au navigateur.
- Interrogation (T) sur la planche muette du focus : exercice libre, hors FSRS (noms des repères pas encore calés sur les ronéos). Pendant l'interrogation, ni fiche, ni liste de zone, ni infobulle, ni clic sur le modèle.

## Apprentissage (phase 3)

- Une carte tirée d'une fiche (relation, vrai ou faux, trajet) n'est active que si les fiches concernées sont vérifiées ; nommer et localiser dépendent seulement de la liste noyau et du modèle 3D. Fiche repassée en brouillon : cartes suspendues, jamais supprimées.
- FSRS-5 en Go (`lanceur/fsrs.go`, paramètres par défaut, rétention 90 %, journée à 4 h). Tests : `go test ./...` dans `lanceur/`.
- Pendant une question, rien ne doit trahir la réponse : pas d'infobulle, de légende, de fiche ni de nom dans le fil d'Ariane (`body.en-apprentissage`).
- Les colonnes ajoutées à `carte` sont créées par `migrerRevisions`, après la sauvegarde du jour.
- Pas de lookbehind dans les expressions régulières de l'interface : Safari ne le connaît qu'à partir de la version 16.4.

## Appli et lanceur (lanceur/)

- Un seul programme, en Go : il sert l'interface construite, les modèles, les ronéos, l'API des fiches (SQLite intégré, modernc.org/sqlite, pur Go) et ouvre une fenêtre d'appli (Edge ou Chrome en mode `--app`, sinon le navigateur par défaut). Il remplace l'ancien serveur FastAPI.
- Go portable : `%LOCALAPPDATA%\AtlasAnatomie\outils\go\bin\go.exe` (go1.27.0, empreinte vérifiée). Compilation croisée sans cgo : windows/amd64, darwin/arm64, darwin/amd64. Le lien ad hoc signe l'exécutable arm64, indispensable sur Mac Apple Silicon.
- Données personnelles hors de l'appli : `%LOCALAPPDATA%\AtlasAnatomie` (Windows), `~/Library/Application Support/AtlasAnatomie` (macOS) ; `ATLAS_DONNEES` les déplace (tests).
- Les brouillons arrivent par `construction/graine.sqlite` (pipeline/construire_base.py), fusionnés au démarrage : une fiche vérifiée ou corrigée par Eliott n'est jamais écrasée, le nouveau brouillon devient une proposition.
- Le schéma SQL est unique : `lanceur/schema.sql`, lu par pipeline/base.py et intégré au lanceur.
- Construire : `python -I pipeline/construire_appli.py` (paquets) ou `--dev` (graine et lanceur de développement pour les tests). Vérifier : `pipeline/verifier_appli.py`, `npm run test:appli`.
- Le paquet macOS n'a jamais tourné sur un vrai Mac depuis ce poste : seules ses propriétés sont vérifiées.
- Les fichiers des zip ont tous la même date : le lanceur ne doit jamais répondre « non modifié » (sinon la fenêtre garde la page de la version précédente). Seul `/assets/` (noms à empreinte) est mis en cache.

## Blender

- Toujours lancé par `pipeline/zanatomy.py`, en mode `-b --disable-autoexec` : un .blend téléchargé ne doit jamais exécuter ses scripts.
- `pipeline/blender_zanatomy.py` tourne dans le Python de Blender, pas celui du système.
- Les légendes de Z-Anatomy (texte « .t », trait « .j ») pointent l'organe par un modificateur HOOK : lire la géométrie évaluée du trait, jamais ses sommets bruts.
- `pipeline/legendes_squelette.py` pose les légendes osseuses de Z-Anatomy sur les os de BodyParts3D : recalage de chaque os (similitude globale, ICP rigide puis affine, déformation bornée à 25 %), pointe posée sur le sommet le plus proche (10 mm, jusqu'à 18 mm marquée « approchée » : centre d'un trou, axe d'un os long). Lent (8 min, ICP par force brute).
- `pipeline/organes_zanatomy.py` importe les organes absents de BodyParts3D ; un objet recouvrant à 60 % un maillage BodyParts3D est un doublon, écarté. Remplacement explicite (`remplace`) quand Z-Anatomy découpe plus finement (cervelet).

## Règles de contenu

- Une correspondance FMA ambiguë est signalée, jamais tranchée au hasard.
- Dans la liste noyau, `fma_id` porte toujours le vrai identifiant FMA, même si la structure manque dans BodyParts3D (l'inventaire le détecte via Wikidata). `aucun` : la structure n'existe pas comme concept dans la FMA.
- Après toute modification d'identifiants dans la liste, relancer `libelles_wikidata.py` avant l'inventaire.
- Nom affiché = nom des ronéos d'Eliott ; les autres noms vont en synonymes.
- Rattachement des maillages de vaisseaux : `donnees/listes/arbre_vasculaire.csv` fait foi, jamais l'arbre « partie de » de BodyParts3D (aplati : le tronc brachio-céphalique y contenait tout l'arbre droit). Tout nouveau concept de vaisseau y entre ; `construire_atlas.py` signale les absents. Les ronéos priment pour l'origine d'une branche, l'écart avec le modèle va en remarque.
- Étiquette BodyParts3D fausse (position ou contacts incompatibles avec le nom) : `donnees/listes/corrections_maillages.csv`, avec la justification géométrique, affichée dans l'appli.
- Une branche ne compte pas pour sa structure dans l'exercice « localiser » (seuls les segments propres).
- Noms hors liste noyau : `donnees/listes/traductions_fr.csv` prime sur Wikidata et la TA2 de Z-Anatomy (coquilles). Clé anglaise sans côté de tête, `{side}` pour un côté interne, `{droit}` / `{droite}` pour l'accord. `construire_atlas.py` signale tout nom resté en anglais.
- Après une modification des brouillons : `python -I pipeline/construire_base.py` (validation), `python -I pipeline/controler_citations.py` (recouvrement texte et pages citées), puis `construire_appli.py --dev` et `test:toutes-fiches`.
- Champs « pathologie » et « reperes » des fiches : compléments hors ronéos rédigés par Claude, sans source, affichés « hors ronéos, à vérifier ». Liste des champs à modifier à deux endroits : `pipeline/base.py` et `lanceur/base.go`.
- Fiches : chaque champ cite sa source (code de ronéo et pages, voir donnees/fiches/sources.json). Un champ sans source est affiché « hors ronéos, à vérifier ». Les incohérences des ronéos vont en remarque, jamais tranchées en silence.
- Référence des fiches : cours de Montaudon 2026 (gros vaisseaux, membres) et 2025 (médiastin, vascularisation du cœur, pas de version 2026 déposée).
