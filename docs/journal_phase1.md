# Journal de la phase 1 : visualiseur 3D

Portail du plan : affichage fluide et clic fiable sur toutes les structures du bloc 1.

## 21 octobre 2026

### Fait

- **Interface** (`app/`) : Vite 6.4.4, TypeScript 6.0.3, three.js 0.186.1, three-mesh-bvh 0.9.15, polices embarquées (Fraunces, IBM Plex). Mode Explorer :
  - calques Artères, Veines, Os, Muscles, Organes et autres, avec pastille de couleur, étiquette, nombre de maillages et touche (A, V, O, M, R) ; muscles et organes chargés seulement à la première demande ;
  - os en trois modes : repère translucide non cliquable (par défaut), opaques, masqués ;
  - clic sur une structure : surlignage ocre, fiche (système, région, niveau, côté, synonymes, source du modèle, identifiant FMA) ; une branche hors liste noyau affiche « fait partie de » avec un lien vers la structure ;
  - clic répété au même endroit : structure suivante en profondeur, pour atteindre ce qui est caché ;
  - recherche tolérante aux accents et aux anciens noms (sous-clavière, péronière), y compris les structures sans modèle 3D, présentées avec leur solution de secours ;
  - Isoler (I), Masquer (H), Fermer ou tout réafficher (Échap), vues Face (F), Dos (D), profils (flèches), Cadrer (Z), recherche (/) ;
  - barre d'état en trois temps (où, action, ensuite), chargement avec pourcentage par fichier, erreurs avec cause et action.
- **Données** : `pipeline/construire_atlas.py` produit `app/public/donnees/atlas.json`. Chaque maillage est rattaché à la plus petite structure noyau qui le contient, avec un nom français (liste noyau 220, Wikidata 358, TA2 499, sinon terme anglais FMA 1 198, signalé comme tel).
- **Lancement** : `lancer.bat` vérifie Node, les dépendances, les modèles et les données, démarre le serveur et ouvre le navigateur. Vérifié de bout en bout.
- **Test du portail** : `npm run test:clic` pilote Edge et clique de vrais points de l'écran sur chaque structure et chaque côté. **170 cas sur 170 cliquables** ; 94 au premier clic, les autres en 2 à 4 clics au même endroit quand une structure passe devant. Rendu matériel (Intel UHD), **60 images par seconde** en rotation, atlas prêt en moins de 2 s. Détail : [rapports/test_clic.md](../rapports/test_clic.md).

### Constats et corrections

1. **73 maillages vasculaires étaient classés dans « autres »** (parties insulaire et sphénoïdale de la cérébrale moyenne, segments de la cérébrale postérieure, troncs des veines pulmonaires, arcades palmaires) : leurs ancêtres FMA sont « anastomose artérielle », « arbre veineux » ou « ensemble de... ». Règles de `convertir_glb.py` complétées, avec un repli sur le nom.
2. **Doublon** : « descending aorta » (FJ3427) recouvre exactement l'aorte thoracique descendante et l'aorte abdominale ; écarté.
3. **Les objets côté droit de Z-Anatomy sont des copies en miroir** : faces tournées vers l'intérieur. 19 objets réorientés à l'export d'après leur volume signé.
4. **Bug de sélection** : un objet et sa copie en miroir partagent leur tableau d'indices après compression, que three-mesh-bvh réordonne sur place ; le second index construit cassait le premier (0 rayon sur 20 touchait le sinus transverse gauche). Chaque maillage reçoit sa propre copie des indices.
5. **GLTFLoader assainit les noms de nœuds** (espaces, points) : la clé est relue dans le JSON du GLB.
6. **Vite 8 exige Node 22.12** ; le poste a 22.11. Vite 6.4.4, branche maintenue, sans mise à jour de Node.
7. Le clic sur une branche surligne tout l'arbre de la structure noyau qui la contient (la coronaire droite et ses rameaux) : utile pour le territoire, à revoir si l'on veut isoler la seule branche.

### Limites connues

- 7 structures sans modèle 3D (thyroïdienne supérieure, linguale, vésicales, utérine, tronc tibio-fibulaire, anastomoses porto-caves) : présentes dans la recherche, fiche avec la solution prévue, pas encore de schéma 2D.
- Artère bronchique gauche absente des modèles.
- `node_modules` (environ 100 Mo) est dans le dossier OneDrive, ce qui ralentit la synchronisation.

## 21 octobre 2026, suite : focus sur les régions et les organes, coupes

Demande d'Eliott après essai : pouvoir se concentrer sur un membre ou sur un organe.

### Fait

- **Focus sur une région** (29) : tête, cou, thorax, abdomen, bassin ; épaule, bras, coude, avant-bras, main, membre supérieur ; hanche, cuisse, genou, jambe, pied, membre inférieur ; côtés droit et gauche. Chaque boîte est calculée par `pipeline/focus.py` à partir des os qui délimitent la région (le coude : 6 cm autour de l'extrémité distale de l'humérus ; le cou : de la clavicule à l'atlas, en largeur de la mandibule). La vue est découpée à la boîte, comme une planche.
- **Focus sur un organe** (28), regroupés comme le bloc 3 du programme : cardiorespiratoire, digestif, urinaire et génital, nerveux, endocrine et sens. Composition tirée de l'arbre « partie de » de BodyParts3D ; l'organe s'affiche avec ses parties (cavités et valves du cœur, segments bronchiques, segments hépatiques) et les vaisseaux centrés dans sa boîte.
- **Panneau « Dans la zone »** : parties de l'organe et structures noyau présentes, chacune sélectionnable.
- **Coupe** frontale, sagittale ou horizontale (touche C), curseur de position, inversion du côté conservé ; la caméra se tourne vers la face coupée. Les clics ignorent les parties coupées.
- Catalogue (touche G), recherche (« main », « cœur » proposent le focus), bandeau du focus, Échap défait la dernière couche : sélection, masquages, focus, coupe.
- **Test** `npm run test:focus` : 57 focus sur 57 valides (bandeau, liste non vide, sélection depuis la liste et par un vrai clic dans la vue découpée). Non-régression : 170 clics sur 170.

### Constats et corrections

1. **Les poumons n'ont pas de surface dans BodyParts3D** : ils sont figurés par l'arbre bronchique segmentaire et les vaisseaux pulmonaires. Thyroïde, utérus et ovaires sont absents (modèle masculin ; seul le cartilage thyroïde existe).
2. **Vaisseaux de contexte** : retenir ceux qui touchent la boîte de l'organe entourait le cœur de 247 vaisseaux (intercostales, thoraciques internes). Critère retenu : centre dans la boîte (143). Pour les poumons, la trachée et le foie, qui contiennent leurs vaisseaux, aucun vaisseau de contexte.
3. **Liste de la zone** : un arbre vasculaire entier faisait figurer le tronc brachiocéphalique dans la main ; seuls les segments propres d'une structure comptent désormais.
4. **Boîte du membre supérieur** : la clavicule entière atteignait la ligne médiane et ramenait l'aorte ; seule sa moitié latérale compte.
5. **Bug CSS trouvé par le test** : `display: grid` l'emportait sur l'attribut `hidden`, le catalogue « caché » couvrait l'écran et captait les clics.
6. Beaucoup de parties d'organes n'ont qu'un nom anglais (« cavity of left atrium ») : pas de traduction maison, à traiter avec les fiches d'organes de la phase 5.

### Portail

Franchi : affichage à 60 images par seconde et clic vérifié sur toutes les structures du bloc 1 qui ont un modèle 3D. Reste à l'éprouver à la main : Eliott ouvre l'atlas avec `lancer.bat` et signale ce qui gêne.
