# Atlas d'anatomie local : plan du projet

Copie du 17 octobre 2026. Le document en ligne fait foi : https://claude.ai/code/artifact/e8b2f8a4-6001-43ed-972c-7a26dd48dc8d
Les deux schémas du document en ligne (architecture, feuille de route) sont retranscrits ici en texte.

## Objectif et périmètre

L'objectif : une application qui tourne sur ton ordinateur, sans connexion, pour apprendre à nommer, situer et décrire les vaisseaux, muscles et organes principaux sur un modèle 3D cliquable, avec des révisions espacées.

Ce qu'elle doit permettre :

- voir chaque structure en 3D dans son contexte, avec les os affichés en repère semi-transparent
- apprendre par parcours guidés courts, dans l'ordre logique (une artère, ses branches, son territoire)
- s'interroger dans les deux sens : nommer une structure surlignée, ou la retrouver sur le modèle
- retenir dans la durée grâce à un planificateur de révisions, avec un suivi par système et par région
- garder données et progression en local, dans un seul fichier

Ordre d'apprentissage :

1. Vaisseaux : artères puis veines, en commençant par le cœur et les gros vaisseaux du thorax (UE cardiovasculaire du semestre)
2. Muscles, région par région
3. Organes, système par système
4. Os : révision rapide, centrée sur les reliefs d'insertion musculaire et les repères des vaisseaux

"Principal" veut dire le niveau attendu en DFGSM : une liste noyau d'environ 70 artères, 30 veines, 80 muscles et 35 organes (détail dans la section Programme). Chaque structure porte une étiquette "noyau" ou "approfondissement". Les noms suivent la nomenclature internationale en français (artère subclavière), avec l'ancienne en synonyme (artère sous-clavière), à caler sur celle des ronéos.

## Solutions possibles

Décision du 17 octobre 2026 : construire un atlas maison local, et installer Z-Anatomy comme atlas de consultation en attendant qu'il soit prêt.

| Option | Ce que c'est | Points forts | Limites | Mise en route |
| --- | --- | --- | --- | --- |
| Atlas maison (retenu) | Appli web locale sur les modèles BodyParts3D et Human Reference Atlas, avec parcours, quiz et révisions espacées | Contenu calé sur les cours, quiz en 3D, suivi de progression, tout en français | Demande du développement et de la validation de contenu | Environ 10 semaines de soirées, estimation |
| Z-Anatomy dans Blender | Atlas 3D libre de plus de 5 000 structures, en local | Complet, gratuit, hors ligne, calques et coupes | Pas de quiz ni de suivi, interface Blender peu pédagogique, projet qui ne semble plus maintenu | Une heure |
| Anki seul | Occlusion d'image sur des planches libres (Gray, schémas) | Outil déjà maîtrisé, répétition espacée native | 2D uniquement, aucun parcours, pas de vue d'ensemble 3D | Une à deux heures par planche |

Z-Anatomy sert d'atlas de vérification pendant la validation des fiches, et l'export Anki de l'appli (phase 6) permet de réviser aussi sur téléphone.

## Sources de données libres

Le socle 3D est BodyParts3D, passé sous licence CC BY 4.0 le 27 février 2025 : redistribution et modification autorisées, avec attribution.

| Source | Contenu | Format | Licence | Rôle dans le projet |
| --- | --- | --- | --- | --- |
| BodyParts3D 4.0 (DBCLS) | Corps entier d'un homme adulte issu de l'IRM TARO, 2 234 maillages, arbres "est un" et "partie de", chaque pièce reliée à un identifiant FMA | OBJ | CC BY 4.0 | Modèle principal : os, muscles, organes, gros vaisseaux |
| Human Reference Atlas (HuBMAP) | Organes de référence et vascularisation sanguine homme et femme, issus du Visible Human | GLB | CC BY 4.0 | Compléter vaisseaux et organes, anatomie féminine |
| Z-Anatomy | Atlas Blender dérivé de BodyParts3D, étiquettes et définitions | .blend | CC BY-SA 4.0 | Consultation et vérification visuelle |
| Terminologia Anatomica 2 (FIPAT) | Terminologie officielle latin et anglais | PDF, visualiseur web | Termes dans le domaine public, PDF en CC BY-ND 4.0 | Normaliser les noms latins |
| FMA (université de Washington) | Ontologie anatomique, près de 79 000 classes, relations "partie de" et "branche de" | OWL | Libre | Identifiant pivot et relations entre structures |
| Wikidata | Libellés français reliés aux identifiants FMA (propriété P1402) | Requête SPARQL | CC0 | Amorcer les noms français |
| Planches de Gray (1918) | Planches anatomiques classiques | Images, Wikimedia Commons | Domaine public | Schémas 2D de secours |

L'identifiant FMA sert de clé commune : il relie le maillage 3D, le terme latin, le nom français et la fiche. Une traduction française de la FMA existe aussi (plus de 10 000 termes, projet CISMeF), utile pour compléter Wikidata. En usage personnel, les licences ne posent aucune contrainte ; en cas de partage de l'appli, un écran "À propos" avec les attributions suffit, sauf pour Z-Anatomy qui impose le partage à l'identique.

## Architecture technique

Une appli web locale : un pipeline Python prépare les données une seule fois, puis un petit serveur Python et une interface three.js tournent sur l'ordinateur, sans connexion.

Schéma, version texte :

1. Sources : BodyParts3D (2 234 maillages OBJ), Human Reference Atlas (vaisseaux et organes), Wikidata, TA2 et FMA (noms et relations), ronéos (validation des fiches)
2. Pipeline Python, lancé une fois : convertit les OBJ en GLB, simplifie, construit la base, importe les fiches validées
3. Sorties : modèles 3D `.glb` (un fichier par structure, chargé par système à la demande) et `anatomie.sqlite` (structures, relations, fiches, cartes, historique des révisions)
4. Interface web three.js (atlas 3D, parcours guidés, quiz, révisions du jour, tableau de bord), qui dialogue par API avec le serveur local FastAPI (planificateur FSRS py-fsrs, sauvegarde, journaux [OK] [WARN])
5. Optionnel : export des cartes vérifiées vers Anki par AnkiConnect

Choix arrêtés :

- **Interface** : Vite, TypeScript et three.js, qui charge les GLB nativement ; empaquetable plus tard en application de bureau avec Tauri.
- **Serveur** : FastAPI en Python, avec py-fsrs pour planifier les révisions (FSRS, le même algorithme que celui proposé dans Anki).
- **Base** : SQLite plutôt que PostgreSQL, un seul fichier, aucun service à démarrer, sauvegarde par simple copie.
- **Pipeline** : trimesh pour lire et convertir les OBJ, gltf-transform pour compresser les GLB.
- **Lancement** : un double-clic sur `lancer.bat` démarre le serveur, vérifie la base et ouvre le navigateur, avec un message à chaque étape.
- **Fiches** : Claude rédige un brouillon à partir des ronéos, Eliott valide dans l'appli, la fiche passe au statut vérifié.

## Modèle de données

Six tables SQLite ; la table des relations est la plus importante, car elle génère automatiquement la majorité des questions.

| Table | Rôle | Champs clés |
| --- | --- | --- |
| structure | Une entrée par structure anatomique | fma_id, nom_fr, synonymes_fr, nom_latin, systeme (artère, veine, muscle, organe, os), region, cote (droit, gauche, médian), parent_fma_id, maillage_glb, niveau (noyau, approfondissement) |
| relation | Liens entre structures | source_id, cible_id, type (branche_de, se_jette_dans, s_insere_sur, vascularise, draine, innerve) |
| fiche | Contenu pédagogique, champs selon le système | Artère : origine, trajet, branches, terminaison, territoire. Veine : origine, affluents, terminaison, territoire drainé. Muscle : origine, terminaison, innervation, vascularisation, action. Organe : situation, rapports, vascularisation, innervation. Plus source (ronéo, page) et statut (brouillon, vérifié) |
| parcours | Leçons guidées | titre, bloc, étapes ordonnées (structure, angle de caméra, texte de deux lignes) |
| carte | Une question révisable | structure_id, type (nommer, localiser, relation, trajet, vrai ou faux), état FSRS (stabilité, difficulté, échéance) |
| revision | Historique | carte_id, date, note (À revoir, Difficile, Bien, Facile), temps de réponse |

Exemple : la ligne "artère vertébrale, branche_de, artère subclavière" produit trois questions ("De quelle artère naît la vertébrale ?", "Cite les branches de la subclavière", et un vrai ou faux piégé qui remplace la subclavière par la carotide commune).

## Modes d'apprentissage

| Mode | Ce que fait l'utilisateur | Ce que fait l'appli |
| --- | --- | --- |
| Parcours guidé | Suit une leçon de 5 à 15 structures avec le bouton Suivant | Place la caméra, allume la structure, affiche deux lignes d'explication, termine par un mini-quiz de 5 questions |
| Explorer | Navigue librement dans le modèle | Calques par système, os en repère, clic sur une structure pour ouvrir sa fiche, isoler, masquer, couper |
| Quiz 3D | Nommer une structure surlignée, la localiser par un clic, retrouver une relation, ordonner un trajet (aorte, subclavière, axillaire, brachiale, radiale) | Corrige en tolérant accents et synonymes, montre la bonne réponse sur le modèle |
| Vrai ou faux piégé | Juge des affirmations générées depuis les relations, avec une erreur glissée une fois sur deux | Reproduit le format des QCM à discordances : une seule inversion suffit à rendre l'item faux |
| Révision du jour | Traite la file des cartes dues | L'algorithme FSRS choisit les cartes et fixe la prochaine échéance selon la note |
| Tableau de bord | Regarde où il en est | Colore le modèle 3D selon la maîtrise de chaque structure, affiche les cartes dues et la progression par bloc |

L'export Anki arrive en dernier : il pousse les cartes vérifiées vers un paquet dédié, avec une capture de la vue 3D.

## Principes UX

Chaque écran répond à trois questions : où suis-je, que vient-il de se passer, que faire ensuite.

- **Retour après chaque action**, construit en cause, conséquence, étape suivante. Exemple : "Réponse correcte : artère fibulaire. Prochaine révision dans 4 jours. Carte 3 sur 20, Entrée pour continuer."
- **États toujours visibles** : chargement du modèle avec pourcentage, file vide ("Tout est à jour. Prochaines cartes demain, 12 au total. Tu peux lancer un parcours."), erreur avec sa cause et l'action à faire.
- **Premier lancement guidé** en trois étapes : vérification des données installées, choix du bloc, premier parcours lancé directement.
- **Actions irréversibles confirmées** avec leur conséquence chiffrée : "Réinitialiser les muscles efface 214 révisions. Cette action est définitive."
- **Code couleur constant** par système (artères rouges, veines bleues, muscles brun-rouge, os ivoire), doublé d'une étiquette pour ne jamais reposer sur la couleur seule.
- **Raccourcis clavier affichés** à côté des boutons (Entrée, chiffres 1 à 4 pour noter, Échap pour quitter).
- **Côté code** : aucun emoji, commentaires en français, journaux serveur balisés [OK], [WARN], [FAIL] avec la structure cause, conséquence, action.

## Programme

Liste noyau à confronter aux ronéos : ce qui n'y figure pas passe en "approfondissement".

| Bloc | Région ou système | Structures noyau |
| --- | --- | --- |
| 1. Artères | Cœur et thorax | Artères coronaires droite et gauche (rameaux interventriculaire antérieur et circonflexe), aorte ascendante, arc aortique, tronc brachiocéphalique, carotides communes, subclavières, aorte thoracique descendante, intercostales postérieures, bronchiques, tronc pulmonaire, artères pulmonaires droite et gauche |
| 1. Artères | Tête et cou | Carotides interne et externe, branches de la carotide externe (thyroïdienne supérieure, linguale, faciale, occipitale, temporale superficielle, maxillaire), vertébrales, tronc basilaire, cercle artériel du cerveau (cérébrales antérieure, moyenne, postérieure, communicantes antérieure et postérieures) |
| 1. Artères | Membre supérieur | Subclavière et ses branches (vertébrale, thoracique interne, tronc thyro-cervical), axillaire, brachiale, profonde du bras, radiale, ulnaire, arcades palmaires superficielle et profonde |
| 1. Artères | Abdomen | Aorte abdominale, phréniques inférieures, tronc cœliaque (gastrique gauche, hépatique commune, splénique), mésentérique supérieure, rénales, gonadiques, mésentérique inférieure, lombaires, sacrale médiane, iliaques communes |
| 1. Artères | Pelvis et membre inférieur | Iliaque interne (glutéales supérieure et inférieure, obturatrice, pudendale interne, vésicales, utérine), iliaque externe, fémorale, fémorale profonde, poplitée, tibiale antérieure, dorsale du pied, tronc tibio-fibulaire, tibiale postérieure, fibulaire, plantaires médiale et latérale |
| 1. Veines | Cœur et thorax | Veines caves supérieure et inférieure, veines brachiocéphaliques, azygos et hémi-azygos, quatre veines pulmonaires, sinus coronaire |
| 1. Veines | Tête et cou | Jugulaires interne et externe ; sinus de la dure-mère (sagittal supérieur, transverse, sigmoïde) en approfondissement |
| 1. Veines | Membre supérieur | Céphalique, basilique, médiane du coude, axillaire, subclavière |
| 1. Veines | Abdomen et pelvis | Veine porte et ses origines (mésentérique supérieure, splénique, mésentérique inférieure), veines hépatiques, rénales, gonadiques (la gauche se jette dans la rénale gauche), iliaques communes, internes et externes ; anastomoses porto-caves en approfondissement |
| 1. Veines | Membre inférieur | Grande et petite saphènes, fémorale, poplitée, veines tibiales et fibulaires |
| 2. Muscles | Tête et cou | Masséter, temporal, ptérygoïdiens latéral et médial, sterno-cléido-mastoïdien, scalènes, groupes supra-hyoïdien et infra-hyoïdien ; muscles de la face en approfondissement |
| 2. Muscles | Tronc | Diaphragme, intercostaux, droit de l'abdomen, obliques externe et interne, transverse, trapèze, grand dorsal, rhomboïdes, élévateur de la scapula, érecteurs du rachis, carré des lombes |
| 2. Muscles | Membre supérieur | Deltoïde, coiffe des rotateurs (supra-épineux, infra-épineux, petit rond, subscapulaire), grand rond, grand et petit pectoraux, dentelé antérieur, biceps brachial, coraco-brachial, brachial, triceps brachial, brachio-radial, loges antérieure et postérieure de l'avant-bras, éminences thénar et hypothénar |
| 2. Muscles | Membre inférieur | Grand, moyen et petit glutéaux, piriforme, ilio-psoas, tenseur du fascia lata, sartorius, quadriceps fémoral, adducteurs long, court et grand, gracile, ischio-jambiers, triceps sural, tibiaux antérieur et postérieur, long et court fibulaires, extenseurs et fléchisseurs des orteils |
| 3. Organes | Cardiorespiratoire | Cœur (cavités, valves, péricarde), larynx, trachée, bronches principales, poumons (lobes et scissures), plèvre |
| 3. Organes | Digestif | Œsophage, estomac, duodénum, jéjunum et iléon, côlon (cæcum, appendice, segments), rectum, foie, vésicule et voies biliaires, pancréas, rate |
| 3. Organes | Urinaire et génital | Reins, uretères, vessie, urètre, prostate, testicules ; utérus, trompes et ovaires sur le modèle féminin |
| 3. Organes | Endocrine et nerveux | Thyroïde, surrénales, hypophyse, encéphale (lobes, cervelet, tronc cérébral), moelle spinale en vue d'ensemble |
| 4. Os | Révision ciblée | Reliefs d'insertion des muscles du bloc 2 (tubercules de l'humérus, trochanters, tubérosité tibiale) et repères vasculaires (foramens transversaires pour l'artère vertébrale, sillon de l'artère subclavière sur la première côte) |

## Feuille de route

Environ 10 semaines au total, avec une première version utile, vaisseaux complets, à la fin de la phase 3. Durées indicatives en soirées et week-ends. Chaque portail est un critère vérifiable : tant qu'il n'est pas franchi, la phase suivante attend.

| Phase | Contenu | Durée | Portail pour passer à la suite |
| --- | --- | --- | --- |
| 0. Socle de données | BodyParts3D téléchargé, maillages convertis en GLB, inventaire de couverture du bloc 1 | 1 semaine | Chaque structure noyau du bloc 1 a un maillage ou un schéma de secours |
| 1. Visualiseur 3D | Modèle affiché, calques par système, os en repère, clic sur une structure pour voir son nom | 1 semaine | Affichage fluide et clic fiable sur toutes les structures du bloc 1 |
| 2. Fiches des vaisseaux | Base SQLite, fiches artères et veines rédigées par Claude, vérifiées contre les ronéos | 2 semaines | Toutes les fiches du bloc 1 au statut vérifié |
| 3. Apprentissage (première version utile) | Parcours guidés, quiz 3D, vrai ou faux, révisions FSRS, tableau de bord, premier lancement guidé | 2 semaines | Une semaine de révisions réelles sur les vaisseaux, corrections faites |
| 4. Muscles | Fiches origine, terminaison, innervation, action ; parcours et cartes du bloc 2 | 2 semaines | Fiches du bloc 2 vérifiées, cartes en révision |
| 5. Organes, puis révision des os | Fiches des organes (situation, rapports, vascularisation), reliefs osseux liés aux blocs 1 et 2 | 1 à 2 semaines | Les quatre blocs disponibles dans l'appli |
| 6. Finitions | Export Anki, sauvegarde automatique de la base, empaquetage en application de bureau en option | 1 semaine | Aucun |

## Étape en cours : inventaire de couverture des vaisseaux

Première tâche de la phase 0, décidée le 17 octobre 2026 : vérifier que chaque vaisseau noyau du bloc 1 existe en 3D avant d'écrire la moindre ligne d'interface.

**Pourquoi en premier** : tout le plan suppose que BodyParts3D contient les quelque 100 vaisseaux noyau. S'il en manque beaucoup, il faut le savoir avant de construire le visualiseur. L'étape ne demande aucun code d'interface et tient en une à deux séances.

| Livrable | Contenu |
| --- | --- |
| `liste_noyau_bloc1.csv` | Vaisseaux noyau : nom français, synonymes, nom anglais FMA, identifiant FMA, région, niveau |
| `inventaire_couverture.csv` | Pour chaque structure : maillage trouvé (oui, partiel, non), fichier, côtés disponibles, solution de secours |
| `rapport_couverture.md` | Taux de couverture par région, liste des manquants, solution proposée pour chacun |

Déroulé :

1. Télécharger les tables BodyParts3D (quelques centaines de Ko), puis l'archive des maillages (`isa_BP3D_4.0_obj_99.zip`, 136 Mo)
2. Mettre la liste noyau du plan en fichier, validée ou ajustée par Eliott
3. Associer chaque nom français à un identifiant FMA ; les cas ambigus sont signalés, jamais tranchés au hasard
4. Vérifier la présence des maillages, côté droit et côté gauche
5. Pour les manquants, chercher dans la vascularisation du Human Reference Atlas, sinon prévoir un schéma 2D

**Portail** : liste noyau validée par Eliott, et chaque structure a un maillage ou une solution de secours identifiée.

**Hors périmètre** : interface, base SQLite, fiches.

À trancher avant de lancer :

- Lieu de travail : sur le PC d'Eliott (conversation reliée à l'appli de bureau Claude) ou dans l'espace de travail de Claude, avec envoi des fichiers ensuite
- Nomenclature de référence, d'après les ronéos
- Liste noyau : celle du plan telle quelle, ou recalée d'abord sur le programme

## Risques et parades

Le risque principal n'est pas technique : c'est une fiche fausse apprise par cœur, d'où le statut "vérifié" obligatoire avant toute révision.

| Risque | Parade |
| --- | --- |
| Erreur dans une fiche rédigée par Claude | Statut brouillon ou vérifié, source (ronéo et page) sur chaque fiche ; une carte n'entre en révision qu'une fois sa fiche vérifiée |
| Petites branches vasculaires absentes de BodyParts3D | Inventaire de couverture en phase 0, complément par le Human Reference Atlas, sinon schéma 2D en secours |
| Nomenclature différente des cours | Nom affiché = celui des ronéos, autres noms en synonymes acceptés au quiz |
| Un seul modèle d'homme adulte, aucune variation | Champ "variations fréquentes" dans la fiche, modèle féminin pour l'appareil génital |
| Lenteur d'affichage avec plus de 2 000 maillages | Simplification des maillages, chargement par système à la demande |
| Projet qui s'étale sans servir aux révisions | Module vaisseaux utilisable de bout en bout dès la phase 3, avant d'ouvrir les muscles |

## Sources

- BodyParts3D, licence CC BY 4.0 (mise à jour du 27/02/2025) : https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- BodyParts3D, téléchargement : https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- BodyParts3D, description : https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html
- Exemple de visualiseur web bâti sur BodyParts3D et le Human Reference Atlas : https://raw.githubusercontent.com/ashemag/human-atlas/master/public/ATTRIBUTION.md
- Z-Anatomy, dépôt et licence : https://github.com/Z-Anatomy/Models-of-human-anatomy
- Discussion sur l'activité du projet Z-Anatomy : https://discourse.slicer.org/t/open-source-human-anatomy-atlas/17734?page=2
- Human Reference Atlas : https://humanatlas.io ; vascularisation sanguine masculine sur NIH 3D : https://3d.nih.gov/entries/20997
- Galerie d'organes du Human Reference Atlas (fichiers GLB) : https://github.com/cns-iu/ccf-organ-vr-gallery
- Terminologia Anatomica 2 (FIPAT) : https://fipat.library.dal.ca/TA2
- Ontologie FMA : https://ontobee.org/ontology/fma
- Correspondance FMA et Wikidata (Bioregistry) : https://bioregistry.io/api/registry/fma?format=n3
- Traduction de la FMA en français (CISMeF) : https://hal.archives-ouvertes.fr/hal-00645338
- ts-fsrs : https://github.com/open-spaced-repetition/ts-fsrs ; implémentations FSRS dont py-fsrs : https://github.com/open-spaced-repetition/awesome-fsrs
