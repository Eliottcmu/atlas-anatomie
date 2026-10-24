# Journal de la phase 2 : fiches des vaisseaux

Portail du plan : toutes les fiches du bloc 1 au statut vérifié. Claude rédige les brouillons à partir des ronéos ; seul Eliott, dans l'appli, fait passer une fiche au statut vérifié.

## 21 octobre 2026

### Ronéos

- Déposées par Eliott dans `donnees/roneos/` : 41 PDF, 897 pages (cours de Montaudon 2025 et 2026, diaporamas UE10, annales).
- `pipeline/extraire_roneos.py` : texte page par page dans `donnees/derive/roneos/`, avec un marqueur `=== page N ===` et un index. Les pieds de page répétés sont retirés. pdftotext ne sait pas ouvrir les noms de fichier en Unicode décomposé (NFD, venus d'un Mac) : chaque PDF est copié sous un nom temporaire avant extraction.
- `pipeline/couverture_roneos.py` compte les occurrences de chaque nom et synonyme dans chaque ronéo et produit [rapports/nomenclature_roneos.md](../rapports/nomenclature_roneos.md).
- Référence pour le bloc 1 : cours de Montaudon 2026 (gros vaisseaux, vaisseaux des membres) et 2025 (médiastin, vascularisation du cœur : pas de version 2026 complète déposée pour le médiastin). Les ronéos 2025 servent aussi de recoupement.

### Liste noyau calée sur les ronéos

Règle du plan : le nom affiché est celui des ronéos. `pipeline/caler_liste_roneos.py` (idempotent) a appliqué :

| Changement | Structures |
| --- | --- |
| Renommées | A03 artère interventriculaire antérieure, A04 artère circonflexe, A06 aorte horizontale, A07 artère brachio-céphalique, A64 artère profonde de la cuisse, V26 veine hépatique moyenne, V34 veine grande saphène, V35 veine petite saphène |
| Passées en approfondissement, absentes des ronéos | A17 à A23 (carotide externe et ses branches), A25 à A31 (tronc basilaire, cercle artériel du cerveau), A59 vésicale supérieure, A68 tronc tibio-fibulaire, V18 veine médiane du coude |
| Synonyme ajouté | « artère pulmonaire » pour A13 tronc pulmonaire |

Chaque changement est noté dans la colonne remarque de la liste, préfixé « [ronéos 21/10/2026] ». Résultat : **91 structures noyau, 21 d'approfondissement**. L'ancien nom reste en synonyme et la recherche le trouve.

### Fiches

- **91 brouillons, un par structure noyau**, en quatre fichiers de `donnees/fiches/brouillons/` : cœur et thorax (25), tête, cou et membre supérieur (17), abdomen et pelvis (33), membre inférieur (16).
- Champs. Artère : origine, trajet, branches, terminaison, territoire, rapports, variations, intérêt clinique. Veine : origine, trajet, affluents, terminaison, territoire, rapports, variations, intérêt clinique. Le champ trajet a été ajouté aux veines pendant la rédaction : la céphalique, la basilique et les saphènes se décrivent surtout par leur trajet.
- Chaque champ cite ses sources sous la forme `CODE:pages` (par exemple `GV26:16-17`). Les codes sont dans `donnees/fiches/sources.json` ; dans l'appli, chaque référence ouvre le PDF à la page citée.
- Relations : branche de, fait suite à, se jette dans, anastomosé avec, avec le côté quand il diffère (la veine gonadique droite se jette dans la veine cave inférieure, la gauche dans la veine rénale gauche).
- Un champ sans source s'affiche « hors ronéos, à vérifier ». Il en reste un seul : la terminaison de la veine jugulaire externe, que seule la diapo du cou mentionne, sans dire où elle se jette.
- Ce que les ronéos ne décrivent pas n'est pas inventé : le champ est absent et une remarque dit ce qui manque (trajet intracrânien de la carotide interne, branches de l'artère hépatique commune, territoire propre de chaque veine hépatique).
- Contrôle : `python -I pipeline/controler_citations.py` mesure, pour chacun des 429 champs, la part de ses mots présente sur les pages citées. Deux champs sous 60 %, tous deux expliqués (« utérus » tiré du nom de l'artère utérine, « poul » mal orthographié dans MB25 p.22). C'est un garde-fou contre une page fausse, pas une preuve d'exactitude : la vérification reste celle d'Eliott.

### Incohérences des ronéos relevées

Aucune n'est tranchée en silence : chacune figure en remarque dans la fiche concernée.

| Fiche | Constat |
| --- | --- |
| A01 | Segment d'origine des coronaires : segment I (CV25 p.5) ou segment 0, sinus de l'aorte (GV26 p.4). CV25 p.6 appelle « sinus coronaire » une dilatation de l'artère. |
| A09 | MB26 p.3 place la fin de la subclavière au-dessus puis au-dessous du milieu de la clavicule. |
| A24 | Origine aortique de la vertébrale gauche dans 20 % des cas d'après GV25 et GV26, chiffre plus élevé que celui des ouvrages. |
| A39, A40 | MB26 p.11-12 : branches nées « par la concavité » d'une arcade convexe en bas ; « métatarsiens » pour métacarpiens. |
| A41 | Calibre de l'aorte abdominale : 25 mm (GV26 p.10) ou 20 mm (GV25 p.12). |
| A47, A49 | Niveaux d'origine différents entre 2025 et 2026 (mésentérique supérieure, gonadiques). |
| A62 | GV25 p.14 : phrase tronquée sur les pontages coronaires. |
| A63, A64 | Cinq petites branches annoncées, quatre nommées (MB26 p.15). Adducteurs rangés tantôt dans le compartiment postérieur, tantôt dans l'antérieur. |
| A65 | Veine poplitée en dehors puis en dedans de l'artère sur la même page (MB26 p.17), « nerf tibial antérieur » pour nerf tibial. |
| A72 | MB25 p.24 : « vascularise le orteil », numéro manquant. |
| V02, V30 | GV26 p.19 : « veine cave supérieure » pour veine cave inférieure. |
| V03 | MB26 p.13 : « veine cave inférieure » pour veine cave supérieure. |
| V21 | Formation de la veine porte « en arrière de la tête du pancréas » ; les ouvrages disent plutôt derrière le col. |
| V28 | GV25 p.17 : la veine rénale droite « passe en arrière de la veine cave inférieure » ; c'est classiquement l'artère rénale droite. |
| V30 | « Syndrome de Crockett » (GV25 p.18) : l'orthographe usuelle est Cockett. |
| V34 | MB26 p.21 : « veines superficielles issues de l'artère fémorale ». |

### Base et vérification dans l'appli

- Schéma unique `lanceur/schema.sql` : structures, relations, fiches (statut brouillon ou vérifié, auteur de la dernière modification, proposition en attente), historique de chaque version, et les tables des parcours, cartes et révisions pour la phase 3.
- `pipeline/construire_base.py` valide les brouillons (champs permis, sources lisibles, pages existantes, cibles des relations) et produit `construction/graine.sqlite`. Au démarrage, l'appli fusionne la graine dans la base personnelle : une fiche vérifiée ou corrigée par Eliott n'est jamais écrasée ; un nouveau brouillon pour cette fiche devient une proposition, qu'Eliott accepte ou ignore.
- Dans l'appli : lien vers la ronéo à la page citée, correction (touche E), vérification avec confirmation, liste des fiches à vérifier ou vérifiées (touche L), compteur « vérifiées / noyau » dans la barre du haut.

### Appli téléchargeable

Demande d'Eliott : une appli qui marche sur Mac et sur Windows sans rien installer, ouvrable aussi dans un navigateur.

- **Un seul programme en Go** (`lanceur/`) : il sert l'interface construite, les modèles 3D, les ronéos et l'API des fiches, avec SQLite intégré (modernc.org/sqlite, sans dépendance C). Il remplace le serveur Python prévu au départ.
- Compilé depuis ce PC pour Windows (x64), macOS Apple Silicon et macOS Intel. Écartés : Tauri (le paquet Mac ne se construit que sur un Mac), Electron (environ 150 Mo par système, et sur Apple Silicon une appli non signée est refusée, alors que l'éditeur de liens Go signe l'exécutable arm64).
- Fenêtre : Edge ou Chrome en mode application (sans barre d'adresse), avec un profil dédié ; sinon le navigateur par défaut. L'atlas reste accessible à http://127.0.0.1:8765 tant qu'il tourne.
- Arrêt automatique 20 s après la fermeture de la dernière fenêtre (battement de chaque page toutes les 15 s), une seule instance à la fois (un second lancement rouvre une fenêtre), journal dans le dossier de données.
- Données personnelles hors de l'appli : `%LOCALAPPDATA%\AtlasAnatomie` sous Windows, `~/Library/Application Support/AtlasAnatomie` sous macOS, avec une sauvegarde datée à chaque lancement (15 conservées). Remplacer l'appli par une version plus récente ne touche donc pas à la progression.
- Paquets : `distribution/Atlas-anatomie-Windows.zip` (135 Mo) et `distribution/Atlas-anatomie-Mac.zip` (140 Mo), construits par `python -I pipeline/construire_appli.py`.
- **Limite connue** : sans certificat de développeur payant, le premier lancement affiche un avertissement (SmartScreen sous Windows, Gatekeeper sous macOS). `Lisez-moi.txt` donne la marche à suivre ; aucune technique gratuite ne le supprime.
- **Le paquet macOS n'a jamais tourné sur un vrai Mac** : `pipeline/verifier_appli.py` contrôle ses propriétés (architectures, signature ad hoc arm64, Info.plist, droits d'exécution, fins de ligne du script), et `npm run test:appli` déroule le paquet Windows de bout en bout.
- Les paquets contiennent les ronéos d'Eliott : usage personnel, à ne pas diffuser.

### Tests

| Commande | Ce qu'elle vérifie | Résultat |
| --- | --- | --- |
| `npm run test:clic` | chaque structure cliquable, chaque côté | 170/170 |
| `npm run test:focus` | chaque focus de région et d'organe | 57/57 |
| `npm run test:fiches` | affichage, lien vers la ronéo, correction, vérification | 15/15 |
| `npm run test:toutes-fiches` | les 91 fiches s'ouvrent et affichent tous leurs champs | 91/91 |
| `npm run test:appli` | paquet Windows : décompression, lancement, instance unique, arrêt automatique | OK |
| `python -I pipeline/verifier_appli.py` | propriétés des paquets Windows et macOS | 24/24 |

### Reste à faire pour franchir le portail

- Eliott vérifie les 91 fiches dans l'appli, en commençant par celles qui portent une remarque « à vérifier ».
- Les 21 structures d'approfondissement n'ont pas de fiche : peu ou pas couvertes par les ronéos, elles en recevraient une majoritairement « hors ronéos ».
- Essai du paquet macOS sur un vrai Mac.

## 22 octobre 2026 : navigation, organes détaillés et légendes

Demande d'Eliott : améliorer la navigation, légender davantage de zones sur les organes, des organes plus détaillés, une interface plus claire, sur Windows comme sur macOS.

### Organes

- **Organes de Z-Anatomy** (`pipeline/organes_zanatomy.py`) : 277 objets absents de BodyParts3D, recalés par une similitude globale sur les os puis un ICP local par groupe, sur des repères communs aux deux modèles. Écart médian des repères après recalage : 0,8 mm (yeux) à 5,5 mm (abdomen). Rapport : [rapports/recalage_organes.md](../rapports/recalage_organes.md).
  - Lobes pulmonaires et plèvre, translucides : bronches et vaisseaux visibles au travers.
  - Cervelet en 31 lobules ; une centaine de sillons et gyrus, noyaux et faisceaux de l'encéphale et du tronc cérébral.
  - Pharynx, voile du palais, parotides, thyroïde, adéno- et neurohypophyse, pelvis rénaux, grand et petit omentum, côlon sigmoïde, rétine, oreille interne et tympan, dure-mère spinale, ganglions spinaux et sympathiques, 135 nœuds lymphatiques (vert tilleul).
- **Doublons** : un objet dont 60 % de la surface tombe à moins de 2 mm d'un maillage BodyParts3D est écarté (67 objets). Le cervelet et l'hypophyse d'un seul tenant de BodyParts3D sont remplacés par leurs parties.
- **Catalogue** : 48 organes au lieu de 28, dont plèvres, pharynx, glandes salivaires, dents, thymus, thyroïde, péritoine, plancher pelvien, pénis et urètre, noyaux gris centraux, nerfs de l'orbite, appareil lacrymal, oreilles, nez, nœuds lymphatiques en cinq régions. Des maillages déjà présents mais rattachés à aucun organe y entrent, dont la paroi des ventricules du cœur.

### Zones légendées

- **243 repères** sur les organes :
  - 230 légendes de Z-Anatomy (hile et pôles du rein, segments du foie et des poumons, faces et bords de la rate, du pancréas, de l'estomac...) ; leur pointe est lue sur la géométrie évaluée (le trait est accroché par un modificateur), puis posée sur la surface affichée ;
  - les légendes du rein, de la surrénale et du testicule, posées du seul côté droit par Z-Anatomy, sont reportées en miroir à gauche ; 6 sont écartées, trop loin de la surface ;
  - 13 repères calculés, signalés comme tels : apex, faces, bord droit et sillons du cœur (au plus près de l'IVA, de l'interventriculaire postérieure, de la coronaire droite), pointe, dos et racine de la langue, base et apex de la prostate.
- **Légendes à l'écran**, comme une planche d'atlas, en focus sur un organe (parties et repères) ou sur une région (structures de la liste noyau) :
  - étiquettes en colonnes de part et d'autre de la structure, reliées par un trait ;
  - masquées quand leur point est caché ou coupé ;
  - rangées dans l'espace libre entre les panneaux.
  - Touche N : noms, numéros seuls (planche muette, un clic révèle le nom), aucune.
- **Noms français** : `donnees/listes/traductions_fr.csv`, 927 traductions rédigées par Claude, en nomenclature actuelle, avec la numérotation des segments du foie (Couinaud) et des poumons (S1 à S10). Elle prime sur la TA2 traduite de Z-Anatomy, qui contient des coquilles (« moëlle », « teticule », « Bord inférieur » pour bord médial), et sur Wikidata (éponymes anciens). Plus aucun nom affiché en anglais. La fiche indique « traduction Claude, non vérifié ».

### Navigation

- Fil d'Ariane cliquable (Corps entier / focus / structure / branche ou repère) et historique : boutons précédent et suivant, Alt flèches (Windows), Cmd [ et ] (Mac), boutons latéraux de la souris.
- Double-clic : cadrer la structure visée ; dans le vide, vue d'ensemble. Vues de dessus et de dessous (flèches haut et bas). Repère d'orientation S I A P D G cliquable.
- La caméra cadre dans la zone libre entre les panneaux, centre optique décalé : la structure n'est plus cachée sous la fiche ou le dock.
- Recherche par Ctrl K ou Cmd K (« / » est peu accessible sur un clavier AZERTY) ; « coeur » trouve « Cœur » ; le terme anglais est aussi cherché.
- Catalogue avec filtre au clavier ; entrer dans un focus ferme la fiche en cours.
- Pavé tactile (réglage, par défaut sur Mac) : deux doigts tournent, pincer zoome, Maj et deux doigts déplacent.

### Interface

- Panneau d'affichage unique (calques, os, légendes), dock des vues et de la coupe en bas, compacté sur petit écran, panneau d'aide (touche ?) avec raccourcis et réglages, carte des premiers pas au premier lancement.
- Vérifié à 1600 × 950, 1280 × 720 et 1100 × 620 (portable Windows à 125 %).
- Corrections : accords des régions (« Bras droit » et non « Bras droite »), fil d'Ariane (« côté droit »), focus des segments de membre limité aux vaisseaux de ce membre.

### Tests

| Commande | Résultat |
| --- | --- |
| `npm run test:focus` | 77/77 focus, chacun avec au moins une légende affichée |
| `npm run test:clic` | 170/170 |
| `npm run test:navigation` | 19/19 |
| `npm run test:fiches`, `test:toutes-fiches` | 15/15, 91/91 |
| `npm run test:appli` | paquet Windows de bout en bout, légendes du cervelet comprises |
| `python -I pipeline/verifier_appli.py` | paquets Windows et macOS sans anomalie |

Le paquet macOS n'a toujours pas tourné sur un vrai Mac. La cadence mesurée par les tests (30 images/s) est le plafond du navigateur sans affichage : elle est identique avec et sans légendes.

## 23 octobre 2026 : arbre vasculaire, segmentation et fiches étoffées

Signalement d'Eliott : problème avec l'artère brachio-céphalique. Demande : revoir en profondeur les vaisseaux, leur localisation et leur découpage en segments, et étoffer les fiches (pathologies, repères physiologiques).

### Cause du problème

- Chaque maillage était rattaché à « la plus petite structure de la liste qui le contient », d'après les tables de BodyParts3D. Or leur arbre « partie de » est aplati et asymétrique : le tronc brachio-céphalique y contient tout l'arbre artériel droit, du cerveau à la main (93 maillages), l'ulnaire est rangée sous la subclavière, le tronc basilaire sous la vertébrale droite.
- Conséquences : sélectionner l'artère brachio-céphalique surlignait le membre supérieur droit et les artères cérébrales droites ; un clic sur l'artère thoraco-acromiale droite affichait « branche de l'artère brachio-céphalique », la gauche n'était rattachée à rien ; dans l'exercice « localiser », cliquer une branche comptait comme la structure.
- Le maillage du tronc lui-même est juste : raccordé à la crosse (1,8 mm), à la carotide commune droite (0,5 mm) et à la subclavière droite (1,1 mm).

### Arbre vasculaire

- `donnees/listes/arbre_vasculaire.csv` (éditée à la main, fait foi) : pour chacun des 411 concepts des maillages de vaisseaux, son lien avec le vaisseau d'origine (structure de la liste, partie, branche, affluent, anastomose, hors arbre) et une remarque. Côté gauche distinct quand il diffère (veine intercostale supérieure, veines surrénale et phrénique inférieure).
- `pipeline/arbre_vasculaire.py` remonte de parent en parent jusqu'à une structure de la liste ; un maillage est propre à la structure s'il n'a franchi que des liens « partie ». Utilisé par `inventaire_couverture.py` et `construire_atlas.py`.
- Résultat : le tronc brachio-céphalique n'a plus qu'un segment ; les branches de l'axillaire (thoraco-acromiale, subscapulaire, circonflexes humérales, thoracique latérale) vont à l'axillaire, celles de l'ulnaire et de la radiale à leur artère, l'artère cérébelleuse inféro-postérieure à la vertébrale, des deux côtés.
- Choix signalés : l'artère scapulaire dorsale suit les ronéos (branche de la subclavière, MB26 p.3) alors que le modèle la fait naître de la transverse du cou ; l'artère descendante du genou naît de la fémorale (elle était rangée sous la profonde de la cuisse) ; les arcades marginales du côlon et les veines cardiaques antérieures ne sont rattachées à aucune structure (anastomose, atrium droit).

### Étiquettes BodyParts3D corrigées

Repérées par la position et les contacts des maillages (`donnees/listes/corrections_maillages.csv`, avec la justification de chaque correction, affichée dans la fiche du segment) :

| Étiquette BodyParts3D | Identification |
| --- | --- |
| right anterior segmental artery (poumon), 2 maillages | artères segmentaires antérieures du rein droit, au hile rénal |
| set of dorsal digital arteries, à la jambe | artères fibulaires droite et gauche (33 cm, nées de la tibiale postérieure) |
| set of calcaneal branches, à la racine de la cuisse | branches ascendante et transverse de la circonflexe latérale du fémur (probable, à vérifier) |
| right fibular vein, dans la cuisse gauche | veines perforantes de la cuisse gauche |
| left external iliac vein, 3 maillages | veine iliaque interne gauche (reçoit obturatrice, glutéales, ilio-lombale) |
| superior phrenic vein, 7 maillages | veine phrénique inférieure droite |
| right et left superior epigastric vein | copies exactes des veines épigastriques superficielles : masquées |
| ascending lumbar vein droite et gauche | étiquettes inversées |
| dorsal metacarpal vein, au pied | veines métatarsiennes dorsales |
| pancreaticoduodenal vein | antérieure (vers la mésentérique supérieure) et postéro-supérieure (vers la porte) |

### Segmentation et doublons Z-Anatomy

- Artère profonde de la cuisse : BodyParts3D n'en a que les branches. L'inventaire compte désormais les maillages propres : elle est importée de Z-Anatomy (région « cuisse », raccord à la fémorale 0,7 mm).
- Artère vertébrale : BodyParts3D la commence vers C6, il manquait le segment V1 des deux côtés (5 cm). Segment de raccord pris dans Z-Anatomy (région « vertébrale »).
- Artère cérébrale moyenne et artère fibulaire : BodyParts3D les a (parties sphénoïdale et insulaire ; maillage fibulaire mal étiqueté). Les objets Z-Anatomy, qui s'y superposaient, sont retirés.
- Reste connu : trou de 3,7 cm entre les veines tibiales postérieures et la veine poplitée ; artère obturatrice de Z-Anatomy à 34 mm de l'iliaque interne.

### Interface

- Fiche d'un segment : « Naît de », « Se jette dans », « Partie de » ou « Anastomose entre » avec le vaisseau d'origine, remarque de l'arbre, et l'étiquette BodyParts3D corrigée le cas échéant.
- Exercice « localiser » : seule la structure compte, pas ses branches (sauf structure sans segment propre, comme le cercle artériel du cerveau) ; la réponse surligne la structure seule.
- Séance de révision : après une réponse tapée, Entrée était parfois avalée par le champ désactivé (la carte ne se notait pas). Corrigé.
- Noms alignés sur les ronéos : artère scapulaire dorsale, supra-scapulaire, circonflexes humérales, thoraco-dorsale, collatérale ulnaire supérieure, circonflexe latérale du fémur. Les artères digitales dorsales de la main s'affichaient « artère digitale dorsale du pied » (Wikidata).

### Fiches

- Deux champs pour artères et veines, dans `pipeline/base.py` et `lanceur/base.go` : « Pathologies » et « Repères physiologiques » (calibres, pressions, pouls, segments, valeurs normales). Rédigés pour les 91 fiches, sans source ronéo : affichés « hors ronéos, à vérifier ». Ils ne créent aucune carte de révision (les cartes ne viennent que des relations).
- Artère brachio-céphalique : trajet ajouté (hors ronéos) et variation citée (artère thyroïdienne ima, GV26 p.4).
- Segments décrits dans les repères : vertébrale V1 à V4, carotide interne C1 à C7, portions de la subclavière et de l'axillaire, dominance coronaire.

### Tests

- `test:apprentissage` part maintenant d'une base neuve (option `baseNeuve` de `serveur_test.mjs`) : il copiait la vraie base d'Eliott, qui contient déjà des révisions, alors qu'il suppose des cartes toutes nouvelles.

| Commande | Résultat |
| --- | --- |
| `npm run test:clic` | 170/170 |
| `npm run test:focus` | 77/77 |
| `npm run test:fiches`, `test:toutes-fiches` | toutes les vérifications, 91/91 |
| `npm run test:navigation`, `test:apprentissage` | toutes les vérifications (apprentissage passé deux fois de suite) |
| `go test ./...` (lanceur) | OK |
| `python -I pipeline/verifier_appli.py` | paquets Windows et macOS sans anomalie |
