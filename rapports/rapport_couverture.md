# Rapport de couverture 3D, bloc 1 (vaisseaux)

Fichier généré par pipeline/inventaire_couverture.py, ne pas éditer à la main.

Structures noyau : 91. Maillage BodyParts3D complet : 81 (89 %). Partiel : 1. Couvert par une source 3D de secours : 8. Schéma 2D seulement : 1. Non résolu : 0.

## Couverture par région (structures noyau)

| Système | Région | Structures | BodyParts3D | Partiel | Secours 3D | 2D | Taux 3D |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Artères | Cœur et thorax | 15 | 14 | 1 | 0 | 0 | 100 % |
| Artères | Tête et cou | 2 | 2 | 0 | 0 | 0 | 100 % |
| Artères | Membre supérieur | 9 | 9 | 0 | 0 | 0 | 100 % |
| Artères | Abdomen | 13 | 12 | 0 | 1 | 0 | 100 % |
| Artères | Pelvis et membre inférieur | 17 | 10 | 0 | 6 | 1 | 94 % |
| Veines | Cœur et thorax | 10 | 10 | 0 | 0 | 0 | 100 % |
| Veines | Tête et cou | 2 | 1 | 0 | 1 | 0 | 100 % |
| Veines | Membre supérieur | 4 | 4 | 0 | 0 | 0 | 100 % |
| Veines | Abdomen et pelvis | 12 | 12 | 0 | 0 | 0 | 100 % |
| Veines | Membre inférieur | 7 | 7 | 0 | 0 | 0 | 100 % |

## Correspondances FMA à trancher

| Id | Nom français | Statut | Candidats |
| --- | --- | --- | --- |
| V33 | anastomoses porto-caves | sans nom FMA | aucun |

## Absents ou partiels dans BodyParts3D

| Id | Nom français | Niveau | BodyParts3D | Z-Anatomy | HRA femme | HRA homme | Solution proposée | Export Z-Anatomy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A12 | artères bronchiques | noyau | partiel | non | non | non | côté manquant : copie en miroir du côté présent | - |
| A17 | artère carotide externe | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 1.1 mm au plus |
| A18 | artère thyroïdienne supérieure | approfondissement | non | non | non | non | schéma 2D (planche de Gray) : absent des trois sources 3D | - |
| A19 | artère linguale | approfondissement | non | non | non | non | schéma 2D (planche de Gray) : absent des trois sources 3D | - |
| A20 | artère faciale | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, origine non contrôlée |
| A21 | artère occipitale | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, origine non contrôlée |
| A22 | artère temporale superficielle | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, origine non contrôlée |
| A23 | artère maxillaire | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, origine non contrôlée |
| A52 | artère sacrale médiane | noyau | non | oui | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 1 objets, écart à l'origine 0.4 mm au plus |
| A55 | artère glutéale supérieure | noyau | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 0.0 mm au plus |
| A56 | artère glutéale inférieure | noyau | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 0.1 mm au plus |
| A57 | artère obturatrice | noyau | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 34.6 mm au plus |
| A58 | artère pudendale interne | noyau | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 0.0 mm au plus |
| A59 | artère vésicale supérieure | approfondissement | non | non | non | non | schéma 2D (planche de Gray) : absent des trois sources 3D | - |
| A60 | artère vésicale inférieure | noyau | non | non | non | non | schéma 2D (planche de Gray) : absent des trois sources 3D | - |
| A61 | artère utérine | noyau | non | non | oui (droit et gauche) | non | Human Reference Atlas, modèle féminin (GLB) | - |
| A64 | artère profonde de la cuisse | noyau | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 0.7 mm au plus |
| A68 | tronc tibio-fibulaire | approfondissement | non | non | non | non | schéma 2D (planche de Gray) : absent des trois sources 3D | - |
| V12 | veine jugulaire externe | noyau | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 0.4 mm au plus |
| V13 | sinus sagittal supérieur | approfondissement | non | oui | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 1 objets, origine non contrôlée |
| V14 | sinus transverse | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, origine non contrôlée |
| V15 | sinus sigmoïde | approfondissement | non | oui (droit et gauche) | non | non | Z-Anatomy : export GLB depuis Blender (licence CC BY-SA) | oui, 2 objets, écart à l'origine 6.8 mm au plus |

## Nomenclature : écarts avec la TA2 française et Wikidata

Comparaison du nom de la liste avec deux références françaises non officielles : la traduction de la TA2 fournie par Z-Anatomy et le libellé français de Wikidata. Le nom retenu reste celui des ronéos.

| Id | Nom de la liste | TA2 français | Wikidata français |
| --- | --- | --- | --- |
| A04 | artère circonflexe | non trouvé | rameau circonflexe de l'artère coronaire gauche |
| A06 | aorte horizontale | non trouvé | arc de l'aorte |
| A07 | artère brachio-céphalique | non trouvé | tronc brachiocéphalique |
| A10 | aorte thoracique descendante | non trouvé | non trouvé |
| A11 | artères intercostales postérieures | Artère intercostale postérieure | artère intercostale aortique |
| A12 | artères bronchiques | non trouvé | rameau artériel bronchique de l'aorte thoracique |
| A25 | tronc basilaire | Artère basilaire | artère basilaire |
| A28 | artère cérébrale moyenne | non trouvé | non trouvé |
| A30 | artère communicante antérieure | Artère communiquante antérieure | = |
| A31 | artère communicante postérieure | Artère communiquante postérieure | = |
| A33 | tronc thyro-cervical | Tronc thyrocervical | = |
| A36 | artère profonde du bras | Artère brachiale profonde | = |
| A43 | tronc cœliaque | non trouvé | non trouvé |
| A49 | artère gonadique | Artère testiculaire | artère testiculaire |
| A51 | artères lombaires | = | non trouvé |
| A59 | artère vésicale supérieure | Artères vésicales supérieures | = |
| A64 | artère profonde de la cuisse | Artère fémorale profonde | non trouvé |
| A68 | tronc tibio-fibulaire | non trouvé | non trouvé |
| V05 | veine hémi-azygos | = | veine hémiazygos |
| V14 | sinus transverse | = | sinus transverse de la dure-mère |
| V16 | veine céphalique | = | veine céphalique antébrachiale |
| V17 | veine basilique | = | veine basilique de l'avant-bras |
| V18 | veine médiane du coude | = | veine médiane cubitale |
| V20 | veine subclavière | Veine sous-clavière | = |
| V21 | veine porte | Veine porte du foie | = |
| V26 | veine hépatique moyenne | non trouvé | veine hépatique intermédiaire |
| V28 | veine rénale | non trouvé | = |
| V29 | veine gonadique | non trouvé | veine testiculaire |
| V33 | anastomoses porto-caves | non trouvé | veine intercostale supérieure gauche |
| V38 | veine tibiale antérieure | Veines tibiales antérieures | = |
| V39 | veine tibiale postérieure | Veines tibiales postérieures | = |
| V40 | veine fibulaire | Veines fibulaires | non trouvé |

« = » : identique au nom de la liste.
