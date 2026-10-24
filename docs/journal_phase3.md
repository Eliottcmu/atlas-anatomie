# Journal de la phase 3 : apprentissage

Portail du plan : une semaine de révisions réelles sur les vaisseaux, corrections faites.

## 22 octobre 2026

Lancée à la demande d'Eliott alors que le portail de la phase 2 (fiches vérifiées) n'est pas franchi : 0 fiche sur 91 vérifiée. La règle du plan reste appliquée : une carte tirée d'une fiche n'entre en révision qu'une fois la fiche vérifiée.

### Ce qui entre en révision, et quand

| Carte | Question | Active |
| --- | --- | --- |
| nommer | structure surlignée sur le modèle, nom à taper | tout de suite, pour chaque structure noyau qui a un modèle 3D (178 cartes avec localiser) : le nom vient de la liste noyau, calée sur les ronéos |
| localiser | nom donné, clic sur le modèle (côté tiré au hasard pour une structure paire) | idem |
| relation | « Naît de », « Fait suite à », « Se jette dans », « S'anastomose avec » : quatre choix | quand la fiche de la structure et celle de la cible sont vérifiées |
| vrai ou faux | une affirmation tirée des relations ; une fois sur deux, une seule inversion la rend fausse | idem |
| trajet | remettre dans l'ordre une suite de « fait suite à » (subclavière, axillaire, brachiale...) | quand toutes les fiches du trajet sont vérifiées |

Une fiche repassée en brouillon suspend ses cartes, historique gardé ; elles reviennent quand la fiche est de nouveau vérifiée. Les cartes se recalculent au démarrage et après chaque fiche vérifiée ou corrigée.

### Planification

- FSRS-5, l'algorithme proposé par Anki, en Go dans le lanceur (`lanceur/fsrs.go`), avec ses 19 paramètres par défaut et une rétention visée de 90 %. Le plan prévoyait py-fsrs dans un serveur Python, remplacé par le lanceur Go en phase 2.
- Notes : 1 À revoir, 2 Difficile, 3 Bien, 4 Facile ; chaque bouton affiche le délai qu'il donne (1 min, 1 j, 3 j, 16 j pour une nouvelle carte). La note suggérée suit la réponse (Bien si juste, Difficile à une faute près, À revoir si faux) ; Entrée la valide.
- « À revoir » : la carte revient dans la minute (5 min après un oubli) et repasse en fin de séance.
- 20 nouvelles cartes par jour (réglable dans Progrès) ; les structures des parcours terminés passent en tête. Journée comptée à partir de 4 h, comme Anki.
- Tables : `carte` (colonnes cle, statut, cree_le, ordre ajoutées par le lanceur à une base existante, après la sauvegarde du jour), `revision`, `parcours_suivi`.

### Modes

- **Parcours** (P) : 8 parcours générés depuis la liste noyau, par région et par système, 15 structures au plus, dans l'ordre des relations (la structure, ses branches, la suite ; pour les veines, du cœur vers la périphérie). Chaque étape : caméra placée, structure allumée, le reste estompé, deux lignes tirées de la fiche (origine, terminaison) avec leurs sources et le statut de la fiche. Fin : mini-quiz de 5 questions, non noté par FSRS ; le parcours terminé fait passer ses structures en tête des nouvelles cartes.
- **Réviser** (Q) : la file du jour. Pendant une question, rien ne trahit la réponse : ni infobulle au survol, ni légende, ni fiche, ni nom dans le fil d'Ariane.
- **Progrès** (B) : cartes dues, nouvelles du jour, série de jours, réponses justes sur 30 jours, histogramme, maîtrise par parcours ; coloration du modèle selon la maîtrise (gris pas encore vue, orange à revoir, jaune en cours, vert acquise) ; réinitialisation avec confirmation chiffrée, copie de la base avant.
- **Premier lancement guidé** : données installées, choix du bloc (le 1 seul disponible), premier parcours lancé directement. Remplace la carte des premiers pas.
- Correction des réponses tapées : accents, ligatures, tirets ignorés ; synonymes et anciens noms acceptés ; « artère » ou « veine » facultatifs ; une faute tolérée par tranche de 7 lettres, signalée et notée Difficile par défaut.

### Tests

| Commande | Résultat |
| --- | --- |
| `go test ./...` (lanceur) | FSRS (rétention à stabilité, intervalles croissants, oubli, bornes, libellés) ; API : cartes des seules fiches vérifiées, suspension, file, notation, maîtrise, réinitialisation |
| `npm run test:apprentissage` | 22/22 : premier lancement, 178 cartes, séance de 6 cartes notées, carte à revoir repassée, parcours de 15 étapes et mini-quiz, tableau de bord, coloration, réinitialisation |
| `npm run test:appli` | paquet Windows de bout en bout, révisions comprises |
| clics, focus, navigation, fiches | 170/170, 77/77, 19/19, 15/15 et 91/91 |

### Pour franchir le portail

- Une semaine de révisions réelles : Q chaque jour, puis noter ici ce qui gêne.
- Vérifier les fiches (L) pour ouvrir les questions de relations, de trajets et de vrai ou faux.
- Le paquet macOS n'a toujours pas tourné sur un vrai Mac.

## 23 octobre 2026 : page d'une ancienne version affichée

Constat d'Eliott : après extraction du nouveau paquet, ni menu des modes ni raccourcis P, Q, B. Cause : les zip sont reproductibles, tous les fichiers y portent la même date ; la fenêtre de l'atlas (profil gardé d'une version à l'autre) redemandait la page avec cette date, le lanceur répondait « non modifié », et la page de la version précédente restait affichée. Correction dans le lanceur : page, données et modèles toujours renvoyés (`no-store`, en-têtes conditionnels ignorés) ; seuls les fichiers à empreinte (`/assets/`) restent en cache. Test : `lanceur/statiques_test.go`, et vérification sur le paquet décompressé.

## 24 octobre 2026 : légendes des os et des organes, interrogation, annulation du masquage

Demandes d'Eliott : plus de légendes par organe et par os, plus d'éléments pour apprendre à décrire un os ou un organe, et Ctrl Z pour remettre une structure masquée par erreur.

### Légendes osseuses

- Z-Anatomy légende son squelette (collection « 1: Skeletal system », 910 légendes des deux côtés), que le pipeline n'extrayait pas. `pipeline/legendes_squelette.py` les relève dans Blender et recale chaque os porteur sur son homologue BodyParts3D : similitude globale, ICP rigide, puis ICP affine (les os de Z-Anatomy sont remodelés ; déformation refusée au-delà de 25 %). Écart médian des surfaces après recalage : 0,1 à 2,9 mm selon l'os (rapports/legendes_squelette.md).
- 851 légendes posées, écart de pose médian 1,6 mm. Une pointe à plus de 10 mm de la surface (centre du foramen obturé, axe du corps du tibia) est posée sur le bord le plus proche et marquée « approchée » ; 3 légendes écartées (au-delà de 18 mm). 36 légendes en réserve : os absents de BodyParts3D (manubrium, coccyx, osselets).
- Contrôle d'orientation (`pipeline/controler_legendes_os.py`) : paires médial/latéral, antérieur/postérieur, supérieur/inférieur sur le même os. Il a trouvé une étiquette fausse de Z-Anatomy : les lignes supracondylaires latérale et médiale du fémur sont inversées des deux côtés (la « latérale » à 2 cm de l'épicondyle médial). Noms échangés dans le pipeline, avec la justification affichée dans la fiche. Après correction : 60 paires contrôlées, 0 inversée.
- Patella : aucune légende dans Z-Anatomy, 4 repères calculés sur la géométrie (base, apex, face antérieure, surface articulaire), marqués « position calculée ».
- Les cartilages du larynx (36 repères) et la première molaire (19) sont dans la même collection : le larynx et les dents, qui n'avaient aucun repère, en ont maintenant.

### Focus des os

- Nouvelle colonne « Os » dans le catalogue (G) : 22 entrées, 36 focus avec les côtés (crâne, face, mandibule et os hyoïde, vertèbres par étage, sacrum, côtes et sternum ; clavicule, scapula, humérus, radius, ulna, carpe, métacarpe ; os coxal, fémur, patella, tibia, fibula, tarse, métatarse). Le choix Droit / Gauche passe dans l'en-tête du catalogue, commun aux régions et aux os.
- En focus d'os : os opaques et cliquables, vaisseaux masqués d'abord (A et V les montrent le long de l'os) ; le mode des os revient en sortant.
- Liste de la zone : repères rangés par rubrique de description (parties, faces et bords, surfaces articulaires, reliefs, fosses, trous et sillons), d'après le nom anglais. Un repère choisi dans la liste allume sa seule étiquette ; s'il est caché, la vue tourne vers lui (normale de la surface au point).
- 86 noms de repères sur 730 sont cités tels quels dans les ronéos : marque « ronéo » dans la liste. Les autres viennent de la TA2 de Z-Anatomy, corrigée dans `traductions_fr.csv` (123 entrées ajoutées : accents, coquilles « processsus », « throchlée », abréviations, termes des ronéos comme ligne nucale, calcanéus, olécrâne, incisure ischiatique). À vérifier par Eliott.

### Interrogation (T)

- En focus, T lance une interrogation sur les légendes visibles : un nom est demandé, on clique son numéro (numéros tirés au hasard). Juste : on passe ; faux : la bonne étiquette s'allume, Entrée pour continuer ; Espace pour passer ; bilan avec les repères à revoir. Pendant l'interrogation : ni fiche, ni liste, ni infobulle, ni clic sur le modèle.
- Exercice libre, hors FSRS : les noms des repères ne sont pas encore calés sur les ronéos (règle « nom affiché = nom des ronéos »). À discuter avant d'en faire des cartes de révision.

### Annulation du masquage

- Ctrl Z (Cmd Z sur Mac) remet la dernière structure masquée par H, sélectionnée avec sa fiche ; on remonte jusqu'à 50 masquages. Ctrl Y ou Ctrl Maj Z refait. Échap « tout réafficher » s'annule aussi. Dans un champ de saisie, Ctrl Z reste l'annulation de frappe.

### Tests

| Commande | Résultat |
| --- | --- |
| `npm run test:os` (nouveau) | toutes les vérifications : Ctrl Z, Ctrl Y, Ctrl Maj Z, focus du fémur et du coxal gauche, rubriques, repère caché, interrogation, larynx |
| `npm run test:focus` | 113/113 (36 focus d'os en plus) |
| `npm run test:clic`, `test:navigation`, `test:apprentissage` | 170/170, toutes les vérifications |
| `npm run test:fiches`, `test:toutes-fiches` | toutes les vérifications, 91/91 |
| `npm run test:appli`, `python -I pipeline/verifier_appli.py` | paquet Windows de bout en bout, paquets sans anomalie |

### Reste

- Os de la face (2 repères), vertèbres thoraciques (4, sur T8 seulement) : peu légendés dans Z-Anatomy.
- Manubrium, coccyx et osselets : absents de BodyParts3D, à importer de Z-Anatomy pour poser leurs 36 légendes.
- Pas de fiche descriptive pour les os et les organes : à rédiger depuis les ronéos UE10 (OGR membres, AG appareil locomoteur) si Eliott le souhaite.
