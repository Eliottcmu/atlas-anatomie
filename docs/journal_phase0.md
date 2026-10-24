# Journal de la phase 0 : socle de données

## 17 octobre 2026 : inventaire de couverture des vaisseaux

### Fait

- Sources téléchargées : tables et maillages BodyParts3D 4.0 (2 234 OBJ), vascularisation du Human Reference Atlas v1.3 (homme et femme, GLB et graphe), Z-Anatomy (Startup.blend et TA2.csv).
- Liste noyau du plan mise en fichier : 72 artères et 40 veines, dont 4 en approfondissement.
- Correspondance FMA : 90 structures résolues (dont 4 à la main : tronc brachiocéphalique = « brachiocephalic artery », aorte thoracique descendante, arcades palmaires = « ... arterial arch »), 21 vérifiées absentes de BodyParts3D, 1 sans objet (anastomoses porto-caves).
- Inventaire et rapport générés : [rapports/rapport_couverture.md](../rapports/rapport_couverture.md).

### Constats

1. **BodyParts3D est lacunaire au cou et au pelvis.** Absents : carotide externe et toutes ses branches, branches de l'iliaque interne, artère fibulaire, tronc tibio-fibulaire, sacrale médiane, jugulaire externe, sinus de la dure-mère. Ce ne sont pas des problèmes de nom : les concepts n'existent pas dans les tables.
2. **Le Human Reference Atlas ne comble presque rien.** Sa vascularisation se limite au tronc (cœur, aorte, vaisseaux digestifs, veines pelviennes). Seule l'artère utérine (modèle féminin) en vient.
3. **Z-Anatomy devient la source de secours principale** : 15 des 21 absents y sont, avec les deux côtés. Contraintes : export GLB depuis Blender, alignement avec le repère BodyParts3D à vérifier, licence CC BY-SA (partage à l'identique si l'appli est diffusée).
4. **Cinq structures noyau n'existent dans aucune source 3D** : artère thyroïdienne supérieure, artère linguale, artères vésicales supérieure et inférieure, tronc tibio-fibulaire. Secours : schéma 2D. Pour le tronc tibio-fibulaire, on pourrait aussi isoler le segment proximal de la tibiale postérieure, ce qui est à valider.
5. **Couverture incomplète de certains maillages BodyParts3D** : une seule artère bronchique (droite), une seule artère lombaire par côté, cérébrale moyenne gauche absente comme concept (Z-Anatomy a les deux).
6. **Repère BodyParts3D** : ligne médiane à x = 0,4 mm, côté droit du sujet vers les x négatifs (étalonné sur carotides, subclavières, iliaques).
7. **Arbres vasculaires** : les fichiers d'un concept BodyParts3D incluent tout son arbre (la subclavière droite contient la vertébrale, donc le tronc basilaire). En phase 1, surligner une artère seule demandera ses propres segments, pas l'arbre entier.
8. **Licence** : l'en-tête des OBJ cite encore CC BY-SA 2.1 Japon ; la page officielle annonce CC BY 4.0 depuis le 27/02/2025, c'est elle qui fait foi.
9. **Nomenclature** : la traduction française de TA2.csv (Z-Anatomy) est communautaire et pas toujours cohérente (« communiquante », « veine sous-clavière » à côté d'« artère subclavière »). Elle sert de comparaison, pas de référence.

## 20 octobre 2026 : identifiants FMA et conversion GLB

### Fait

- Identifiants FMA réels des 20 structures absentes de BodyParts3D, pris dans Wikidata et confirmés sur la FMA 5.1 (service OLS de l'EBI) : carotide externe = FMA10635, sinus transverse = FMA50763, etc. Le marqueur « absent » disparaît de la liste : l'inventaire déduit l'absence lui-même.
- Libellés français et alias de Wikidata ajoutés à la comparaison de nomenclature du rapport.
- Maillages BodyParts3D convertis : 5 GLB par système, compressés en meshopt (36 Mo au total, dont 11 Mo pour artères, veines et os), validés sans erreur par gltf-transform. Rendu de contrôle de face et de profil conforme (position anatomique, droite du sujet vers -X).

### Constats

1. **Le tronc tibio-fibulaire n'existe pas dans la FMA** : l'artère fibulaire y est une subdivision de la tibiale postérieure. Le tronc correspond donc au segment proximal de la tibiale postérieure, avant la naissance de la fibulaire ; l'isoler sur ce maillage est plus fidèle qu'un schéma 2D.
2. **Repère BodyParts3D confirmé** : avant vers -Y (sternum à y = -189 mm), haut vers +Z, droite du sujet vers -X.
3. **17 fichiers OBJ ont un en-tête vide** (pas de concept FMA) ; ils sont rattachés au concept le plus spécifique qui les contient dans les tables de composition.
4. **Écart au plan** : conversion écrite avec numpy seul, sans trimesh (format OBJ simple, normales fournies). Les GLB compressés demandent MeshoptDecoder côté three.js.

## 20 octobre 2026, suite : export des vaisseaux de Z-Anatomy

### Fait

- Eliott valide (« je valide, vas-y ») : liste noyau gardée telle quelle, Blender installé (5.2.2 LTS, winget).
- `pipeline/zanatomy.py` pilote Blender en mode sans interface (`--disable-autoexec`, aucun script du .blend exécuté) et exporte les 16 structures prises dans Z-Anatomy, soit 32 objets, plus 10 segments de raccord : `modeles/zanatomy_arteres.glb` et `zanatomy_veines.glb`, dans le repère des GLB BodyParts3D.
- Contrôle de raccordement : 21 des 25 objets contrôlés touchent leur vaisseau d'origine dans BodyParts3D à moins de 1,1 mm (carotides externes, cérébrales moyennes, fibulaires, glutéales, pudendales internes, sacrale médiane, jugulaires externes). Rendu de contrôle du cou, du bassin et de la jambe conforme.

### Constats

1. **Z-Anatomy a remodelé le squelette** : tibia de 358 mm contre 380, sacrum de 115 contre 144, fémur de 454 contre 466. Une similitude globale laisse 1 à 3 cm d'écart aux membres et au bassin. D'où un recalage en deux temps : similitude globale sur 69 os, puis ICP rigide par région et par côté sur les vaisseaux présents dans les deux modèles. Le contrôle de raccordement choisit pour chaque région entre similitude seule, ICP et ICP inverse.
2. **Les vaisseaux de Z-Anatomy sont des courbes** avec un profil de tube, converties en maillages à l'export.
3. **BodyParts3D a des trous dans ses propres vaisseaux** : il manque environ 6 cm de carotide commune sous la bifurcation, toute la partie haute de la jugulaire interne (modélisée de 1 340 à 1 382 mm seulement) et les troncs antérieur et postérieur de l'iliaque interne. Ces segments sont repris de Z-Anatomy comme raccords, sans la partie que BodyParts3D couvre déjà.
4. **Limites propres à Z-Anatomy, mesurées sans recalage** : l'obturatrice n'est modélisée que dans sa partie distale, à 35 mm du tronc antérieur de l'iliaque interne ; le sinus sigmoïde s'arrête à 6,8 mm de la jugulaire interne (bulbe jugulaire absent).
5. **Licence** : les GLB `zanatomy_*` sont en CC BY-SA 4.0, avec mention dans le fichier et dans les extras de chaque nœud.

### Reste à faire pour franchir le portail

- [x] Eliott valide la liste noyau.
- [ ] Sort des 5 structures sans source 3D : schéma 2D par défaut ; pour le tronc tibio-fibulaire, option d'isoler le segment proximal de la tibiale postérieure en phase 1.
- [x] Installer Blender, exporter les objets Z-Anatomy manquants en GLB et vérifier leur alignement avec BodyParts3D.
- [x] Renseigner les vrais identifiants FMA des structures absentes de BodyParts3D.
- [x] Convertir les maillages BodyParts3D en GLB.
