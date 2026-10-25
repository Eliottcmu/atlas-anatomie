# Test des clics, phase 1

Fichier généré par app/tests/clic.mjs, ne pas éditer à la main.

Date : 2026-10-25 16:16. Rendu : ANGLE (Intel, Intel(R) UHD Graphics (0x00004688) Direct3D11 vs_5_0 ps_5_0, D3D11). Chargement : 1.8 s.
Fluidité mesurée en rotation : 60 i/s (rendu matériel).

**402 cas cliquables sur 402** (100 %).

Profondeur : nombre de clics au même endroit pour atteindre la structure (1 = directement au premier clic).
Côtés sans modèle 3D, non testés : A12 artères bronchiques (gauche).

| Id | Structure | Côté | Résultat | Vue | Profondeur | Clics | Obtenu avant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | artère coronaire droite | - | OK | face | 2 | 2 | veines thoraciques internes x1 |
| A02 | artère coronaire gauche | - | OK | face | 1 | 1 | - |
| A03 | artère interventriculaire antérieure | - | OK | face | 1 | 1 | - |
| A04 | artère circonflexe | - | OK | face | 1 | 1 | - |
| A05 | aorte ascendante | - | OK | face | 1 | 1 | - |
| A06 | aorte horizontale | - | OK | face | 1 | 1 | - |
| A07 | artère brachio-céphalique | - | OK | face | 2 | 2 | veine brachiocéphalique x1 |
| A08 | artère carotide commune | droit | OK | face | 1 | 1 | - |
| A08 | artère carotide commune | gauche | OK | face | 1 | 1 | - |
| A09 | artère subclavière | droit | OK | face | 3 | 3 | artère brachio-céphalique x1, artère carotide commune x1 |
| A09 | artère subclavière | gauche | OK | face | 1 | 1 | - |
| A10 | aorte thoracique descendante | - | OK | face | 2 | 2 | branche portale du segment II x1 |
| A11 | artères intercostales postérieures | droit | OK | face | 1 | 1 | - |
| A11 | artères intercostales postérieures | gauche | OK | face | 2 | 2 | artère thoracique interne x1 |
| A12 | artères bronchiques | droit | OK | face | 4 | 8 | veines thoraciques internes x1, veine cave supérieure x2, veine brachiocéphalique x4 |
| A13 | tronc pulmonaire | - | OK | face | 1 | 1 | - |
| A14 | artère pulmonaire droite | - | OK | face | 4 | 4 | veines intercostales antérieures x1, tronc pulmonaire x1, artère pulmonaire gauche x1 |
| A15 | artère pulmonaire gauche | - | OK | face | 3 | 3 | veines intercostales antérieures x1, tronc pulmonaire x1 |
| A16 | artère carotide interne | droit | OK | face | 1 | 1 | - |
| A16 | artère carotide interne | gauche | OK | face | 1 | 1 | - |
| A17 | artère carotide externe | droit | OK | face | 1 | 1 | - |
| A17 | artère carotide externe | gauche | OK | face | 1 | 1 | - |
| A20 | artère faciale | droit | OK | face | 1 | 1 | - |
| A20 | artère faciale | gauche | OK | face | 1 | 1 | - |
| A21 | artère occipitale | droit | OK | face | 1 | 1 | - |
| A21 | artère occipitale | gauche | OK | face | 1 | 1 | - |
| A22 | artère temporale superficielle | droit | OK | face | 1 | 1 | - |
| A22 | artère temporale superficielle | gauche | OK | face | 1 | 1 | - |
| A23 | artère maxillaire | droit | OK | face | 1 | 1 | - |
| A23 | artère maxillaire | gauche | OK | face | 1 | 1 | - |
| A24 | artère vertébrale | droit | OK | face | 2 | 2 | artère subclavière x1 |
| A24 | artère vertébrale | gauche | OK | face | 3 | 3 | veine subclavière x1, artère subclavière x1 |
| A25 | tronc basilaire | - | OK | face | 1 | 1 | - |
| A26 | cercle artériel du cerveau | - | OK (par une sous-partie) | face | 2 | 2 | artère frontobasale médiale x1 |
| A27 | artère cérébrale antérieure | droit | OK | face | 1 | 1 | - |
| A27 | artère cérébrale antérieure | gauche | OK | face | 1 | 1 | - |
| A28 | artère cérébrale moyenne | droit | OK | face | 1 | 1 | - |
| A28 | artère cérébrale moyenne | gauche | OK | face | 1 | 1 | - |
| A29 | artère cérébrale postérieure | droit | OK | face | 3 | 3 | branche hypothalamique de l'artère communicante postérieure droite x1, artère communicante postérieure x1 |
| A29 | artère cérébrale postérieure | gauche | OK | face | 2 | 2 | artère communicante postérieure x1 |
| A30 | artère communicante antérieure | - | OK | face | 2 | 2 | artère frontobasale médiale x1 |
| A31 | artère communicante postérieure | droit | OK | face | 3 | 3 | artère ophtalmique x1, artère carotide interne x1 |
| A31 | artère communicante postérieure | gauche | OK | face | 3 | 3 | artère ophtalmique x1, artère carotide interne x1 |
| A32 | artère thoracique interne | droit | OK | face | 1 | 1 | - |
| A32 | artère thoracique interne | gauche | OK | face | 1 | 1 | - |
| A33 | tronc thyro-cervical | droit | OK | face | 2 | 2 | veine jugulaire externe x1 |
| A33 | tronc thyro-cervical | gauche | OK | face | 3 | 3 | veine jugulaire externe x1, artère subclavière x1 |
| A34 | artère axillaire | droit | OK | face | 1 | 1 | - |
| A34 | artère axillaire | gauche | OK | face | 1 | 1 | - |
| A35 | artère brachiale | droit | OK | face | 2 | 2 | veine brachiale médiale x1 |
| A35 | artère brachiale | gauche | OK | face | 2 | 2 | veine brachiale médiale x1 |
| A36 | artère profonde du bras | droit | OK | face | 2 | 2 | artère brachiale x1 |
| A36 | artère profonde du bras | gauche | OK | face | 3 | 3 | veine brachiale médiale x1, artère brachiale x1 |
| A37 | artère radiale | droit | OK | face | 1 | 1 | - |
| A37 | artère radiale | gauche | OK | face | 1 | 1 | - |
| A38 | artère ulnaire | droit | OK | face | 1 | 1 | - |
| A38 | artère ulnaire | gauche | OK | face | 2 | 2 | arcade veineuse palmaire profonde x1 |
| A39 | arcade palmaire superficielle | droit | OK | face | 1 | 1 | - |
| A39 | arcade palmaire superficielle | gauche | OK | face | 1 | 1 | - |
| A40 | arcade palmaire profonde | droit | OK | face | 2 | 2 | arcade palmaire superficielle x1 |
| A40 | arcade palmaire profonde | gauche | OK | face | 2 | 2 | arcade palmaire superficielle x1 |
| A41 | aorte abdominale | - | OK | face | 1 | 1 | - |
| A42 | artère phrénique inférieure | droit | OK | face | 1 | 1 | - |
| A42 | artère phrénique inférieure | gauche | OK | face | 1 | 1 | - |
| A43 | tronc cœliaque | - | OK | face | 2 | 2 | artère hépatique commune x1 |
| A44 | artère gastrique gauche | - | OK | face | 1 | 1 | - |
| A45 | artère hépatique commune | - | OK | face | 2 | 2 | artère épigastrique supérieure x1 |
| A46 | artère splénique | - | OK | face | 1 | 1 | - |
| A47 | artère mésentérique supérieure | - | OK | face | 1 | 1 | - |
| A48 | artère rénale | droit | OK | face | 4 | 12 | artère colique moyenne x1, veine colique moyenne x1, aorte abdominale x3, artère rénale x5, veine gastro-omentale droite x1 |
| A48 | artère rénale | gauche | OK | face | 4 | 4 | artère gastro-omentale droite x1, veine gastro-omentale droite x1, aorte abdominale x1 |
| A49 | artère gonadique | droit | OK | face | 1 | 1 | - |
| A49 | artère gonadique | gauche | OK | face | 1 | 1 | - |
| A50 | artère mésentérique inférieure | - | OK | face | 1 | 1 | - |
| A51 | artères lombaires | droit | OK | face | 2 | 2 | aorte abdominale x1 |
| A51 | artères lombaires | gauche | OK | face | 4 | 4 | aorte abdominale x1, artère iliaque commune x2 |
| A52 | artère sacrale médiane | - | OK | face | 1 | 1 | - |
| A53 | artère iliaque commune | droit | OK | face | 2 | 2 | aorte abdominale x1 |
| A53 | artère iliaque commune | gauche | OK | face | 2 | 2 | aorte abdominale x1 |
| A54 | artère iliaque interne | droit | OK | face | 3 | 3 | artère iliaque externe x1, artère iliaque commune x1 |
| A54 | artère iliaque interne | gauche | OK | face | 3 | 3 | artère iliaque commune x1, artère iliaque externe x1 |
| A55 | artère glutéale supérieure | droit | OK | face | 3 | 3 | division antérieure de l'artère iliaque interne x1, veines obturatrices x1 |
| A55 | artère glutéale supérieure | gauche | OK | face | 2 | 2 | veine épigastrique superficielle x1 |
| A56 | artère glutéale inférieure | droit | OK | face | 2 | 2 | veine épigastrique superficielle x1 |
| A56 | artère glutéale inférieure | gauche | OK | face | 1 | 1 | - |
| A57 | artère obturatrice | droit | OK | face | 2 | 2 | artère fémorale x1 |
| A57 | artère obturatrice | gauche | OK | face | 3 | 3 | veine fémorale x1, veine fémorale profonde x1 |
| A58 | artère pudendale interne | droit | OK | face | 2 | 2 | artère glutéale inférieure x1 |
| A58 | artère pudendale interne | gauche | OK | face | 1 | 1 | - |
| A62 | artère iliaque externe | droit | OK | face | 2 | 2 | artère épigastrique superficielle x1 |
| A62 | artère iliaque externe | gauche | OK | face | 2 | 2 | artère épigastrique superficielle x1 |
| A63 | artère fémorale | droit | OK | face | 1 | 1 | - |
| A63 | artère fémorale | gauche | OK | face | 1 | 1 | - |
| A64 | artère profonde de la cuisse | droit | OK | face | 2 | 2 | artère fémorale x1 |
| A64 | artère profonde de la cuisse | gauche | OK | face | 2 | 2 | veine fémorale x1 |
| A65 | artère poplitée | droit | OK | face | 3 | 3 | artère descendante du genou x1, artère fémorale x1 |
| A65 | artère poplitée | gauche | OK | face | 3 | 3 | artère descendante du genou x1, artère fémorale x1 |
| A66 | artère tibiale antérieure | droit | OK | face | 1 | 1 | - |
| A66 | artère tibiale antérieure | gauche | OK | face | 1 | 1 | - |
| A67 | artère dorsale du pied | droit | OK | face | 2 | 2 | veine grande saphène x1 |
| A67 | artère dorsale du pied | gauche | OK | face | 2 | 2 | veine grande saphène x1 |
| A69 | artère tibiale postérieure | droit | OK | face | 1 | 1 | - |
| A69 | artère tibiale postérieure | gauche | OK | face | 2 | 2 | artère plantaire médiale x1 |
| A70 | artère fibulaire | droit | OK | face | 1 | 1 | - |
| A70 | artère fibulaire | gauche | OK | face | 2 | 2 | artère plantaire profonde x1 |
| A71 | artère plantaire médiale | droit | OK | face | 1 | 1 | - |
| A71 | artère plantaire médiale | gauche | OK | face | 1 | 1 | - |
| A72 | artère plantaire latérale | droit | OK | face | 2 | 2 | arcade veineuse plantaire du pied droit x1 |
| A72 | artère plantaire latérale | gauche | OK | face | 2 | 2 | arcade veineuse plantaire du pied gauche x1 |
| V01 | veine cave supérieure | - | OK | face | 2 | 2 | veine brachiocéphalique x1 |
| V02 | veine cave inférieure | - | OK | face | 3 | 3 | veine mésentérique supérieure x1, artère gonadique x1 |
| V03 | veine brachiocéphalique | droit | OK | face | 1 | 1 | - |
| V03 | veine brachiocéphalique | gauche | OK | face | 1 | 1 | - |
| V04 | veine azygos | - | OK | face | 2 | 2 | veine cave supérieure x1 |
| V05 | veine hémi-azygos | - | OK | face | 1 | 1 | - |
| V06 | veine pulmonaire supérieure droite | - | OK | face | 1 | 1 | - |
| V07 | veine pulmonaire inférieure droite | - | OK | face | 3 | 3 | artère thoracique interne x1, artères intercostales postérieures x1 |
| V08 | veine pulmonaire supérieure gauche | - | OK | face | 1 | 1 | - |
| V09 | veine pulmonaire inférieure gauche | - | OK | face | 1 | 1 | - |
| V10 | sinus coronaire | - | OK | face | 1 | 1 | - |
| V11 | veine jugulaire interne | droit | OK | face | 1 | 1 | - |
| V11 | veine jugulaire interne | gauche | OK | face | 1 | 1 | - |
| V12 | veine jugulaire externe | droit | OK | face | 1 | 1 | - |
| V12 | veine jugulaire externe | gauche | OK | face | 1 | 1 | - |
| V13 | sinus sagittal supérieur | - | OK | face | 1 | 1 | - |
| V14 | sinus transverse | droit | OK | face | 2 | 2 | sinus sigmoïde x1 |
| V14 | sinus transverse | gauche | OK | face | 2 | 2 | sinus sigmoïde x1 |
| V15 | sinus sigmoïde | droit | OK | face | 1 | 1 | - |
| V15 | sinus sigmoïde | gauche | OK | face | 1 | 1 | - |
| V16 | veine céphalique | droit | OK | face | 1 | 1 | - |
| V16 | veine céphalique | gauche | OK | face | 1 | 1 | - |
| V17 | veine basilique | droit | OK | face | 1 | 1 | - |
| V17 | veine basilique | gauche | OK | face | 1 | 1 | - |
| V18 | veine médiane du coude | droit | OK | face | 1 | 1 | - |
| V18 | veine médiane du coude | gauche | OK | face | 1 | 1 | - |
| V19 | veine axillaire | droit | OK | face | 2 | 2 | veine subclavière x1 |
| V19 | veine axillaire | gauche | OK | face | 1 | 1 | - |
| V20 | veine subclavière | droit | OK | face | 3 | 3 | veine brachiocéphalique x1, veine jugulaire interne x1 |
| V20 | veine subclavière | gauche | OK | face | 3 | 3 | veine brachiocéphalique x1, veine jugulaire interne x1 |
| V21 | veine porte | - | OK | face | 1 | 1 | - |
| V22 | veine mésentérique supérieure | - | OK | face | 1 | 1 | - |
| V23 | veine splénique | - | OK | face | 1 | 1 | - |
| V24 | veine mésentérique inférieure | - | OK | face | 1 | 1 | - |
| V25 | veine hépatique droite | - | OK | face | 1 | 1 | - |
| V26 | veine hépatique moyenne | - | OK | face | 1 | 1 | - |
| V27 | veine hépatique gauche | - | OK | face | 2 | 2 | branche portale du segment III x1 |
| V28 | veine rénale | droit | OK | face | 4 | 20 | artère pancréatico-duodénale inférieure x2, rameau postérieur de l'artère pancréatico-duodénale inférieure x4, veine cave inférieure x4, veine rénale x2, artère colique moyenne x3, rameau antérieur de l'artère pancréatico-duodénale inférieure x1, veine colique moyenne x2, veine pancréatico-duodénale postéro-supérieure x1 |
| V28 | veine rénale | gauche | OK | face | 1 | 1 | - |
| V29 | veine gonadique | droit | OK | face | 1 | 1 | - |
| V29 | veine gonadique | gauche | OK | face | 1 | 1 | - |
| V30 | veine iliaque commune | droit | OK | face | 2 | 2 | veine cave inférieure x1 |
| V30 | veine iliaque commune | gauche | OK | face | 1 | 1 | - |
| V31 | veine iliaque interne | droit | OK | face | 2 | 2 | veine iliaque commune x1 |
| V31 | veine iliaque interne | gauche | OK | face | 2 | 2 | veine iliaque commune x1 |
| V32 | veine iliaque externe | droit | OK | face | 1 | 1 | - |
| V32 | veine iliaque externe | gauche | OK | face | 1 | 1 | - |
| V34 | veine grande saphène | droit | OK | face | 2 | 2 | veine métatarsienne dorsale x1 |
| V34 | veine grande saphène | gauche | OK | face | 2 | 2 | veine métatarsienne dorsale x1 |
| V35 | veine petite saphène | droit | OK | face | 3 | 3 | veine métatarsienne dorsale x1, arcade veineuse dorsale du pied droit x1 |
| V35 | veine petite saphène | gauche | OK | face | 2 | 2 | arcade veineuse dorsale du pied gauche x1 |
| V36 | veine fémorale | droit | OK | face | 1 | 1 | - |
| V36 | veine fémorale | gauche | OK | face | 1 | 1 | - |
| V37 | veine poplitée | droit | OK | face | 1 | 1 | - |
| V37 | veine poplitée | gauche | OK | face | 1 | 1 | - |
| V38 | veine tibiale antérieure | droit | OK | face | 1 | 1 | - |
| V38 | veine tibiale antérieure | gauche | OK | face | 1 | 1 | - |
| V39 | veine tibiale postérieure | droit | OK | face | 1 | 1 | - |
| V39 | veine tibiale postérieure | gauche | OK | face | 1 | 1 | - |
| V40 | veine fibulaire | droit | OK | face | 2 | 2 | veine tibiale postérieure x1 |
| V40 | veine fibulaire | gauche | OK | face | 2 | 2 | veine tibiale postérieure x1 |
| M001 | muscle masséter | droit | OK | face | 1 | 1 | - |
| M001 | muscle masséter | gauche | OK | face | 1 | 1 | - |
| M002 | muscle temporal | droit | OK | face | 1 | 1 | - |
| M002 | muscle temporal | gauche | OK | face | 1 | 1 | - |
| M003 | muscle ptérygoïdien latéral | droit | OK | face | 1 | 1 | - |
| M003 | muscle ptérygoïdien latéral | gauche | OK | face | 2 | 2 | muscle droit inférieur de l'œil x1 |
| M004 | muscle ptérygoïdien médial | droit | OK | face | 1 | 1 | - |
| M004 | muscle ptérygoïdien médial | gauche | OK | face | 1 | 1 | - |
| M005 | muscle sterno-cléido-mastoïdien | droit | OK | face | 1 | 1 | - |
| M005 | muscle sterno-cléido-mastoïdien | gauche | OK | face | 1 | 1 | - |
| M006 | muscle scalène antérieur | droit | OK | face | 4 | 4 | muscle platysma x1, muscle sterno-cléido-mastoïdien x1, artère thyroïdienne inférieure x1 |
| M006 | muscle scalène antérieur | gauche | OK | face | 4 | 4 | muscle platysma x1, muscle sterno-cléido-mastoïdien x1, muscle omo-hyoïdien x1 |
| M007 | muscle scalène moyen | droit | OK | face | 4 | 4 | muscle platysma x1, muscle sterno-cléido-mastoïdien x1, muscle scalène antérieur x1 |
| M007 | muscle scalène moyen | gauche | OK | face | 3 | 15 | muscle platysma x4, muscle sterno-cléido-mastoïdien x4, veine jugulaire interne x3, muscle scalène antérieur x3 |
| M008 | muscle scalène postérieur | droit | OK | face | 4 | 12 | muscle platysma x3, muscle sterno-cléido-mastoïdien x3, muscle scalène antérieur x2, muscle scalène moyen x2, veine jugulaire externe x1 |
| M008 | muscle scalène postérieur | gauche | OK | face | 4 | 4 | muscle platysma x1, muscle sterno-cléido-mastoïdien x1, muscle scalène moyen x1 |
| M009 | muscle digastrique | droit | OK | face | 1 | 1 | - |
| M009 | muscle digastrique | gauche | OK | face | 1 | 1 | - |
| M010 | muscle stylo-hyoïdien | droit | OK | face | 3 | 3 | muscle digastrique x1, muscle hyo-glosse x1 |
| M010 | muscle stylo-hyoïdien | gauche | OK | face | 2 | 2 | muscle mylo-hyoïdien x1 |
| M011 | muscle mylo-hyoïdien | droit | OK | face | 1 | 1 | - |
| M011 | muscle mylo-hyoïdien | gauche | OK | face | 1 | 1 | - |
| M012 | muscle génio-hyoïdien | droit | OK | face | 1 | 1 | - |
| M012 | muscle génio-hyoïdien | gauche | OK | face | 1 | 1 | - |
| M013 | muscle sterno-hyoïdien | droit | OK | face | 2 | 2 | muscle sterno-cléido-mastoïdien x1 |
| M013 | muscle sterno-hyoïdien | gauche | OK | face | 2 | 2 | muscle sterno-cléido-mastoïdien x1 |
| M014 | muscle omo-hyoïdien | droit | OK | face | 2 | 2 | muscle platysma x1 |
| M014 | muscle omo-hyoïdien | gauche | OK | face | 2 | 2 | muscle platysma x1 |
| M015 | muscle sterno-thyroïdien | droit | OK | face | 2 | 2 | partie sterno-costale du muscle grand pectoral droit x1 |
| M015 | muscle sterno-thyroïdien | gauche | OK | face | 2 | 2 | partie sterno-costale du muscle grand pectoral gauche x1 |
| M016 | muscle thyro-hyoïdien | droit | OK | face | 3 | 3 | muscle platysma x1, muscle sterno-hyoïdien x1 |
| M016 | muscle thyro-hyoïdien | gauche | OK | face | 3 | 3 | muscle platysma x1, muscle sterno-hyoïdien x1 |
| M017 | muscle platysma | droit | OK | face | 1 | 1 | - |
| M017 | muscle platysma | gauche | OK | face | 1 | 1 | - |
| M018 | muscle long du cou | droit | OK | face | 3 | 11 | muscle platysma x2, muscle sterno-hyoïdien x1, muscle thyro-aryténoïdien x1, muscle ary-épiglottique x1, muscle génio-hyoïdien x1, muscle génio-glosse x2, muscle mylo-hyoïdien x1, muscle constricteur moyen du pharynx x1 |
| M018 | muscle long du cou | gauche | OK | face | 4 | 12 | muscle platysma x3, muscle sterno-hyoïdien x3, muscle thyro-hyoïdien x2, muscle crico-aryténoïdien postérieur x1, muscle palato-pharyngien x1, muscle sterno-thyroïdien x1 |
| M019 | muscle splénius de la tête | droit | OK | face | 2 | 6 | muscle platysma x1, muscle sterno-cléido-mastoïdien x1, artère carotide commune x1, veine jugulaire interne x1, partie superficielle du muscle masséter x1 |
| M019 | muscle splénius de la tête | gauche | OK | face | 3 | 3 | muscle élévateur de la scapula x1, muscle splénius du cou x1 |
| M020 | diaphragme | - | OK | face | 3 | 3 | muscle oblique externe de l'abdomen x1, muscle droit de l'abdomen x1 |
| M021 | muscle intercostal externe | - | OK | face | 3 | 3 | muscle oblique externe de l'abdomen x1, partie abdominale du muscle grand pectoral gauche x1 |
| M022 | muscle intercostal interne | - | OK | face | 2 | 2 | partie sterno-costale du muscle grand pectoral gauche x1 |
| M023 | muscle intercostal intime | - | OK | face | 3 | 3 | muscle oblique externe de l'abdomen x1, partie abdominale du muscle grand pectoral gauche x1 |
| M024 | muscle droit de l'abdomen | droit | OK | face | 3 | 3 | muscle oblique externe de l'abdomen x1, muscle oblique interne de l'abdomen x1 |
| M024 | muscle droit de l'abdomen | gauche | OK | face | 2 | 2 | muscle oblique externe de l'abdomen x1 |
| M025 | muscle oblique externe de l'abdomen | droit | OK | face | 1 | 1 | - |
| M025 | muscle oblique externe de l'abdomen | gauche | OK | face | 1 | 1 | - |
| M026 | muscle oblique interne de l'abdomen | droit | OK | face | 2 | 2 | muscle oblique externe de l'abdomen x1 |
| M026 | muscle oblique interne de l'abdomen | gauche | OK | face | 2 | 2 | muscle oblique externe de l'abdomen x1 |
| M027 | muscle transverse de l'abdomen | droit | OK | face | 4 | 8 | muscle oblique externe de l'abdomen x2, muscle droit de l'abdomen x2, artère musculo-phrénique x1, diaphragme x1, muscle oblique interne de l'abdomen x1 |
| M027 | muscle transverse de l'abdomen | gauche | OK | face | 4 | 4 | muscle oblique externe de l'abdomen x1, muscle droit de l'abdomen x1, artère musculo-phrénique x1 |
| M028 | muscle carré des lombes | droit | OK | droite | 4 | 28 | muscle oblique externe de l'abdomen x7, muscle oblique interne de l'abdomen x6, muscle droit de l'abdomen x6, muscle transverse de l'abdomen x7, muscle grand dorsal x1 |
| M028 | muscle carré des lombes | gauche | OK | gauche | 2 | 50 | muscle oblique externe de l'abdomen x8, muscle oblique interne de l'abdomen x7, muscle droit de l'abdomen x6, muscle transverse de l'abdomen x9, muscle anconé x3, muscle grand dorsal x7, muscle dentelé postérieur et inférieur x1, diaphragme x1, artère subcostale x1, muscle carré des lombes x2, muscle longissimus du thorax x2, muscle extenseur des doigts x1, artère segmentaire postérieure du rein droit x1 |
| M029 | muscle trapèze | droit | OK | face | 1 | 1 | - |
| M029 | muscle trapèze | gauche | OK | face | 1 | 1 | - |
| M030 | muscle grand dorsal | droit | OK | face | 2 | 2 | muscle oblique externe de l'abdomen x1 |
| M030 | muscle grand dorsal | gauche | OK | face | 3 | 3 | chef court du muscle biceps brachial gauche x1, muscle coraco-brachial x1 |
| M031 | muscle grand rhomboïde | droit | OK | face | 3 | 3 | muscle platysma x1, muscle sterno-hyoïdien x1 |
| M031 | muscle grand rhomboïde | gauche | OK | droite | 4 | 28 | muscle platysma x2, muscle sterno-hyoïdien x2, muscle sterno-thyroïdien x2, partie oblique inférieure du muscle long du cou gauche x1, muscle sterno-cléido-mastoïdien x1, partie sterno-costale du muscle grand pectoral gauche x4, artères intercostales postérieures x2, veine intercostale supérieure gauche x1, muscle semi-épineux du cou x1, aorte horizontale x2, artère subclavière x2, artère thoracique interne x1, veine segmentaire apicale (V1) x1, veine segmentaire postérieure (V2) x1, muscle intercostal externe x1, partie descendante du muscle trapèze x2, muscle grand rhomboïde x1 |
| M032 | muscle petit rhomboïde | droit | OK | face | 3 | 3 | muscle platysma x1, muscle sterno-hyoïdien x1 |
| M032 | muscle petit rhomboïde | gauche | OK | face | 3 | 3 | muscle platysma x1, muscle sterno-hyoïdien x1 |
| M033 | muscle élévateur de la scapula | droit | OK | face | 4 | 4 | muscle platysma x1, muscle long de la tête x1, muscle long du cou x1 |
| M033 | muscle élévateur de la scapula | gauche | OK | face | 4 | 4 | muscle platysma x1, muscle sterno-cléido-mastoïdien x1, muscle scalène moyen x1 |
| M034 | muscle iliocostal | droit | OK | droite | 4 | 28 | muscle platysma x6, muscle sterno-cléido-mastoïdien x5, artère carotide commune x2, veine jugulaire interne x6, muscle scalène antérieur x4, muscle long de la tête x1, muscle grand dorsal x1, muscle dentelé antérieur x1, muscle intercostal externe x1 |
| M034 | muscle iliocostal | gauche | OK | droite | 2 | 26 | muscle platysma x6, muscle sterno-cléido-mastoïdien x4, veine jugulaire interne x4, muscle scalène antérieur x3, artère carotide commune x2, muscle long de la tête x1, muscle scalène moyen x1, artère subclavière x1, artère supra-scapulaire x1, muscle intercostal externe x1, muscle grand fessier x1 |
| M035 | muscle longissimus | droit | OK | droite | 3 | 47 | muscle platysma x6, muscle sterno-cléido-mastoïdien x4, muscle omo-hyoïdien x1, muscle long du cou x3, veine jugulaire interne x5, muscle scalène antérieur x1, artère carotide commune x2, muscle long de la tête x2, muscle grand dorsal x4, muscle dentelé postérieur et inférieur x1, muscle ilio-costal des lombes x2, muscle ilio-costal du thorax x5, muscle grand rond x1, muscle infra-épineux x3, muscle dentelé antérieur x3, muscle ilio-costal du cou x1, muscle intercostal externe x2 |
| M035 | muscle longissimus | gauche | OK | droite | 4 | 32 | muscle platysma x6, muscle sterno-cléido-mastoïdien x6, artère carotide commune x3, veine jugulaire interne x5, muscle scalène antérieur x3, artère transverse du cou x1, muscle grand dorsal x2, muscle carré des lombes x2, muscle longissimus du thorax x2, muscle épineux du thorax x1 |
| M036 | muscle épineux | droit | OK | face | 4 | 4 | muscle platysma x1, muscle constricteur inférieur du pharynx x1, muscle semi-épineux du cou x1 |
| M036 | muscle épineux | gauche | OK | face | 4 | 4 | muscle platysma x1, muscle constricteur inférieur du pharynx x1, muscle semi-épineux du cou x1 |
| M037 | muscle dentelé postérieur et supérieur | droit | OK | face | 4 | 4 | muscle platysma x1, artère subclavière x1, muscle dentelé antérieur x1 |
| M037 | muscle dentelé postérieur et supérieur | gauche | OK | face | 4 | 4 | muscle platysma x1, artère subclavière x1, muscle dentelé antérieur x1 |
| M038 | muscle dentelé postérieur et inférieur | droit | OK | droite | 2 | 30 | muscle oblique externe de l'abdomen x6, muscle oblique interne de l'abdomen x5, muscle droit de l'abdomen x3, muscle transverse de l'abdomen x5, muscle intercostal interne x3, diaphragme x3, chef long du muscle triceps brachial droit x1, muscle grand dorsal x2, muscle intercostal externe x1 |
| M038 | muscle dentelé postérieur et inférieur | gauche | OK | droite | 4 | 40 | muscle oblique externe de l'abdomen x6, muscle oblique interne de l'abdomen x6, muscle transverse de l'abdomen x5, diaphragme x3, muscle droit de l'abdomen x3, muscle intercostal interne x1, muscle grand dorsal x4, muscle dentelé postérieur et inférieur x4, muscle carré des lombes x4, muscle longissimus du thorax x3 |
| M039 | muscle transverse du thorax | droit | OK | face | 1 | 1 | - |
| M039 | muscle transverse du thorax | gauche | OK | face | 1 | 1 | - |
| M040 | muscle deltoïde | droit | OK | face | 1 | 1 | - |
| M040 | muscle deltoïde | gauche | OK | face | 1 | 1 | - |
| M041 | muscle supra-épineux | droit | OK | face | 3 | 3 | partie claviculaire du muscle deltoïde droit x1, partie acromiale du muscle deltoïde droit x1 |
| M041 | muscle supra-épineux | gauche | OK | face | 3 | 3 | partie claviculaire du muscle deltoïde gauche x1, chef long du muscle biceps brachial gauche x1 |
| M042 | muscle infra-épineux | droit | OK | face | 3 | 3 | partie claviculaire du muscle deltoïde droit x1, partie acromiale du muscle deltoïde droit x1 |
| M042 | muscle infra-épineux | gauche | OK | face | 3 | 3 | partie claviculaire du muscle deltoïde gauche x1, partie acromiale du muscle deltoïde gauche x1 |
| M043 | muscle petit rond | droit | OK | face | 4 | 4 | partie claviculaire du muscle deltoïde droit x1, partie acromiale du muscle deltoïde droit x1, veine circonflexe humérale antérieure x1 |
| M043 | muscle petit rond | gauche | OK | face | 3 | 3 | partie claviculaire du muscle deltoïde gauche x1, partie acromiale du muscle deltoïde gauche x1 |
| M044 | muscle sub-scapulaire | droit | OK | face | 2 | 2 | partie claviculaire du muscle deltoïde droit x1 |
| M044 | muscle sub-scapulaire | gauche | OK | face | 2 | 2 | partie claviculaire du muscle deltoïde gauche x1 |
| M045 | muscle grand rond | droit | OK | face | 4 | 4 | partie sterno-costale du muscle grand pectoral droit x1, partie abdominale du muscle grand pectoral droit x1, chef court du muscle biceps brachial droit x1 |
| M045 | muscle grand rond | gauche | OK | face | 4 | 8 | partie claviculaire du muscle grand pectoral gauche x1, partie sterno-costale du muscle grand pectoral gauche x2, partie abdominale du muscle grand pectoral gauche x2, chef court du muscle biceps brachial gauche x2 |
| M046 | muscle grand pectoral | droit | OK | face | 1 | 1 | - |
| M046 | muscle grand pectoral | gauche | OK | face | 1 | 1 | - |
| M047 | muscle petit pectoral | droit | OK | face | 2 | 2 | partie sterno-costale du muscle grand pectoral droit x1 |
| M047 | muscle petit pectoral | gauche | OK | face | 2 | 2 | partie sterno-costale du muscle grand pectoral gauche x1 |
| M048 | muscle sub-clavier | droit | OK | face | 2 | 2 | partie sterno-costale du muscle grand pectoral droit x1 |
| M048 | muscle sub-clavier | gauche | OK | face | 1 | 1 | - |
| M049 | muscle dentelé antérieur | droit | OK | face | 3 | 3 | partie sterno-costale du muscle grand pectoral droit x1, muscle oblique externe de l'abdomen x1 |
| M049 | muscle dentelé antérieur | gauche | OK | face | 1 | 1 | - |
| M050 | muscle biceps brachial | droit | OK | face | 1 | 1 | - |
| M050 | muscle biceps brachial | gauche | OK | face | 1 | 1 | - |
| M051 | muscle coraco-brachial | droit | OK | face | 3 | 3 | veine céphalique x1, partie claviculaire du muscle grand pectoral droit x1 |
| M051 | muscle coraco-brachial | gauche | OK | face | 2 | 2 | partie claviculaire du muscle grand pectoral gauche x1 |
| M052 | muscle brachial | droit | OK | face | 1 | 1 | - |
| M052 | muscle brachial | gauche | OK | face | 2 | 2 | chef court du muscle biceps brachial gauche x1 |
| M053 | muscle triceps brachial | droit | OK | face | 3 | 3 | chef court du muscle biceps brachial droit x1, muscle coraco-brachial x1 |
| M053 | muscle triceps brachial | gauche | OK | face | 2 | 2 | chef court du muscle biceps brachial gauche x1 |
| M054 | muscle anconé | droit | OK | droite | 2 | 26 | veine antébrachiale médiane x3, muscle fléchisseur radial du carpe x6, muscle fléchisseur superficiel des doigts x6, muscle fléchisseur profond des doigts x6, chef ulnaire du muscle fléchisseur ulnaire du carpe droit x3, muscle extenseur des doigts x1 |
| M054 | muscle anconé | gauche | OK | face | 4 | 24 | veine antébrachiale médiane x1, muscle fléchisseur radial du carpe x6, muscle fléchisseur superficiel des doigts x6, muscle fléchisseur profond des doigts x6, chef ulnaire du muscle fléchisseur ulnaire du carpe gauche x4 |
| M055 | muscle brachio-radial | droit | OK | face | 1 | 1 | - |
| M055 | muscle brachio-radial | gauche | OK | face | 2 | 2 | artère radiale x1 |
| M056 | muscle rond pronateur | droit | OK | face | 1 | 1 | - |
| M056 | muscle rond pronateur | gauche | OK | face | 1 | 1 | - |
| M057 | muscle fléchisseur radial du carpe | droit | OK | face | 1 | 1 | - |
| M057 | muscle fléchisseur radial du carpe | gauche | OK | face | 1 | 1 | - |
| M058 | muscle long palmaire | droit | OK | face | 1 | 1 | - |
| M058 | muscle long palmaire | gauche | OK | face | 1 | 1 | - |
| M059 | muscle fléchisseur ulnaire du carpe | droit | OK | face | 1 | 1 | - |
| M059 | muscle fléchisseur ulnaire du carpe | gauche | OK | face | 1 | 1 | - |
| M060 | muscle fléchisseur superficiel des doigts | droit | OK | face | 1 | 1 | - |
| M060 | muscle fléchisseur superficiel des doigts | gauche | OK | face | 1 | 1 | - |
| M061 | muscle fléchisseur profond des doigts | droit | OK | face | 1 | 1 | - |
| M061 | muscle fléchisseur profond des doigts | gauche | OK | face | 1 | 1 | - |
| M062 | muscle long fléchisseur du pouce | droit | OK | face | 1 | 1 | - |
| M062 | muscle long fléchisseur du pouce | gauche | OK | face | 1 | 1 | - |
| M063 | muscle carré pronateur | droit | OK | face | 4 | 4 | muscle fléchisseur superficiel des doigts x2, muscle fléchisseur profond des doigts x1 |
| M063 | muscle carré pronateur | gauche | OK | face | 4 | 4 | muscle long palmaire x1, muscle fléchisseur superficiel des doigts x1, muscle fléchisseur profond des doigts x1 |
| M064 | muscle long extenseur radial du carpe | droit | OK | face | 4 | 4 | chef superficiel du muscle court fléchisseur du pouce droit x1, muscle opposant du pouce x1, muscle court fléchisseur du pouce x1 |
| M064 | muscle long extenseur radial du carpe | gauche | OK | face | 4 | 4 | chef superficiel du muscle court fléchisseur du pouce gauche x1, muscle opposant du pouce x1, muscle court fléchisseur du pouce x1 |
| M065 | muscle court extenseur radial du carpe | droit | OK | face | 1 | 13 | muscle court abducteur du pouce x1, muscle opposant du pouce x3, chef superficiel du muscle court fléchisseur du pouce droit x3, muscle fléchisseur radial du carpe x1, muscle court fléchisseur du pouce x1, arcade veineuse palmaire superficielle x1, muscle long palmaire x1, muscle fléchisseur superficiel des doigts x1 |
| M065 | muscle court extenseur radial du carpe | gauche | OK | face | 3 | 3 | muscle long palmaire x1, chef oblique du muscle adducteur du pouce gauche x1 |
| M066 | muscle extenseur des doigts | droit | OK | face | 1 | 1 | - |
| M066 | muscle extenseur des doigts | gauche | OK | face | 2 | 2 | muscle fléchisseur superficiel des doigts x1 |
| M067 | muscle extenseur du petit doigt | droit | OK | face | 1 | 1 | - |
| M067 | muscle extenseur du petit doigt | gauche | OK | face | 2 | 2 | muscle fléchisseur superficiel des doigts x1 |
| M068 | muscle extenseur ulnaire du carpe | droit | OK | face | 2 | 2 | muscle abducteur du petit doigt x1 |
| M068 | muscle extenseur ulnaire du carpe | gauche | OK | face | 4 | 4 | muscle abducteur du petit doigt x1, muscle court fléchisseur du petit doigt x1, muscle opposant du petit doigt x1 |
| M069 | muscle supinateur | droit | OK | face | 3 | 15 | veine céphalique x3, muscle brachio-radial x4, chef huméral du muscle rond pronateur droit x4, artère radiale x1, chef ulnaire du muscle rond pronateur droit x2 |
| M069 | muscle supinateur | gauche | OK | face | 3 | 11 | veine céphalique x2, muscle brachio-radial x3, chef huméral du muscle rond pronateur gauche x3, artère radiale x1, chef ulnaire du muscle rond pronateur gauche x1 |
| M070 | muscle long abducteur du pouce | droit | OK | face | 2 | 2 | muscle opposant du pouce x1 |
| M070 | muscle long abducteur du pouce | gauche | OK | face | 2 | 2 | muscle opposant du pouce x1 |
| M071 | muscle court extenseur du pouce | droit | OK | face | 1 | 1 | - |
| M071 | muscle court extenseur du pouce | gauche | OK | face | 1 | 1 | - |
| M072 | muscle long extenseur du pouce | droit | OK | face | 2 | 2 | veines métacarpiennes palmaires x1 |
| M072 | muscle long extenseur du pouce | gauche | OK | face | 2 | 2 | veines métacarpiennes palmaires x1 |
| M073 | muscle extenseur de l'index | droit | OK | face | 1 | 1 | - |
| M073 | muscle extenseur de l'index | gauche | OK | face | 1 | 1 | - |
| M074 | muscle court abducteur du pouce | droit | OK | face | 1 | 1 | - |
| M074 | muscle court abducteur du pouce | gauche | OK | face | 1 | 1 | - |
| M075 | muscle court fléchisseur du pouce | droit | OK | face | 1 | 1 | - |
| M075 | muscle court fléchisseur du pouce | gauche | OK | face | 1 | 1 | - |
| M076 | muscle opposant du pouce | droit | OK | face | 2 | 2 | muscle court abducteur du pouce x1 |
| M076 | muscle opposant du pouce | gauche | OK | face | 1 | 1 | - |
| M077 | muscle adducteur du pouce | droit | OK | face | 1 | 1 | - |
| M077 | muscle adducteur du pouce | gauche | OK | face | 1 | 1 | - |
| M078 | muscle abducteur du petit doigt | droit | OK | face | 1 | 1 | - |
| M078 | muscle abducteur du petit doigt | gauche | OK | face | 1 | 1 | - |
| M079 | muscle court fléchisseur du petit doigt | droit | OK | face | 2 | 2 | muscle long palmaire x1 |
| M079 | muscle court fléchisseur du petit doigt | gauche | OK | face | 2 | 2 | muscle long palmaire x1 |
| M080 | muscle opposant du petit doigt | droit | OK | face | 2 | 2 | muscle court fléchisseur du petit doigt x1 |
| M080 | muscle opposant du petit doigt | gauche | OK | face | 1 | 1 | - |
| M081 | muscle grand fessier | droit | OK | face | 3 | 3 | muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M081 | muscle grand fessier | gauche | OK | face | 3 | 3 | muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M082 | muscle moyen fessier | droit | OK | face | 2 | 2 | muscle tenseur du fascia lata x1 |
| M082 | muscle moyen fessier | gauche | OK | face | 2 | 2 | muscle tenseur du fascia lata x1 |
| M083 | muscle petit fessier | droit | OK | face | 2 | 22 | muscle oblique externe de l'abdomen x5, muscle oblique interne de l'abdomen x5, muscle transverse de l'abdomen x5, muscle iliaque x5, muscle tenseur du fascia lata x1 |
| M083 | muscle petit fessier | gauche | OK | droite | 3 | 31 | muscle oblique externe de l'abdomen x6, muscle oblique interne de l'abdomen x6, muscle transverse de l'abdomen x6, muscle iliaque x6, muscle moyen fessier x2, muscle petit fessier x2, veines glutéales supérieures x1, artère iliaque interne x1 |
| M084 | muscle piriforme | droit | OK | face | 3 | 3 | muscle droit fémoral x1, muscle petit fessier x1 |
| M084 | muscle piriforme | gauche | OK | face | 3 | 3 | muscle droit fémoral x1, muscle petit fessier x1 |
| M085 | muscle obturateur interne | droit | OK | face | 4 | 4 | veine iliaque externe x1, veine fémorale x1, muscle pectiné x1 |
| M085 | muscle obturateur interne | gauche | OK | face | 3 | 3 | veine fémorale x1, muscle pectiné x1 |
| M086 | muscle obturateur externe | droit | OK | face | 4 | 8 | veine fémorale x1, veine grande saphène x2, veine fémorale profonde x1, muscle pectiné x1, muscle long adducteur x1, muscle court adducteur x1 |
| M086 | muscle obturateur externe | gauche | OK | face | 3 | 15 | veine fémorale x3, veine grande saphène x3, muscle long adducteur x2, muscle court adducteur x3, muscle pectiné x2, veine fémorale profonde x1 |
| M087 | muscle jumeau supérieur | droit | OK | face | 3 | 3 | muscle sartorius x1, muscle droit fémoral x1 |
| M087 | muscle jumeau supérieur | gauche | OK | face | 3 | 3 | muscle sartorius x1, muscle droit fémoral x1 |
| M088 | muscle jumeau inférieur | droit | OK | face | 2 | 2 | muscle droit fémoral x1 |
| M088 | muscle jumeau inférieur | gauche | OK | face | 2 | 2 | muscle droit fémoral x1 |
| M089 | muscle carré fémoral | droit | OK | face | 3 | 7 | muscle sartorius x2, muscle droit fémoral x1, branche descendante de l'artère circonflexe latérale du fémur droite x1, muscle iliaque x1, muscle pectiné x1 |
| M089 | muscle carré fémoral | gauche | OK | face | 4 | 8 | muscle sartorius x2, muscle pectiné x1, muscle iliaque x1, muscle grand psoas x1, muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M090 | muscle grand psoas | droit | OK | face | 4 | 4 | muscle oblique externe de l'abdomen x1, muscle oblique interne de l'abdomen x1, muscle transverse de l'abdomen x1 |
| M090 | muscle grand psoas | gauche | OK | face | 4 | 4 | muscle oblique externe de l'abdomen x1, muscle oblique interne de l'abdomen x1, muscle transverse de l'abdomen x1 |
| M091 | muscle iliaque | droit | OK | face | 4 | 4 | muscle oblique externe de l'abdomen x1, muscle oblique interne de l'abdomen x1, muscle transverse de l'abdomen x1 |
| M091 | muscle iliaque | gauche | OK | face | 4 | 4 | muscle oblique externe de l'abdomen x1, muscle oblique interne de l'abdomen x1, muscle transverse de l'abdomen x1 |
| M092 | muscle tenseur du fascia lata | droit | OK | face | 1 | 1 | - |
| M092 | muscle tenseur du fascia lata | gauche | OK | face | 1 | 1 | - |
| M093 | muscle sartorius | droit | OK | face | 1 | 1 | - |
| M093 | muscle sartorius | gauche | OK | face | 1 | 1 | - |
| M094 | muscle droit fémoral | droit | OK | face | 1 | 1 | - |
| M094 | muscle droit fémoral | gauche | OK | face | 1 | 1 | - |
| M095 | muscle vaste latéral | droit | OK | face | 1 | 1 | - |
| M095 | muscle vaste latéral | gauche | OK | face | 1 | 1 | - |
| M096 | muscle vaste médial | droit | OK | face | 1 | 1 | - |
| M096 | muscle vaste médial | gauche | OK | face | 1 | 1 | - |
| M097 | muscle vaste intermédiaire | droit | OK | face | 2 | 2 | muscle droit fémoral x1 |
| M097 | muscle vaste intermédiaire | gauche | OK | face | 2 | 2 | muscle droit fémoral x1 |
| M098 | muscle pectiné | droit | OK | face | 3 | 3 | artère fémorale x1, artère profonde de la cuisse x1 |
| M098 | muscle pectiné | gauche | OK | face | 3 | 3 | artère profonde de la cuisse x1, artère fémorale x1 |
| M099 | muscle long adducteur | droit | OK | face | 3 | 3 | artère fémorale x1, veine fémorale x1 |
| M099 | muscle long adducteur | gauche | OK | face | 2 | 2 | veine fémorale x1 |
| M100 | muscle court adducteur | droit | OK | face | 4 | 4 | artère fémorale x1, artère profonde de la cuisse x1, muscle pectiné x1 |
| M100 | muscle court adducteur | gauche | OK | face | 3 | 3 | veine fémorale x1, muscle pectiné x1 |
| M101 | muscle grand adducteur | droit | OK | face | 3 | 3 | muscle sartorius x1, artère fémorale x1 |
| M101 | muscle grand adducteur | gauche | OK | face | 2 | 2 | muscle gracile x1 |
| M102 | muscle gracile | droit | OK | face | 2 | 2 | veine grande saphène x1 |
| M102 | muscle gracile | gauche | OK | face | 3 | 3 | veine grande saphène x1, muscle long adducteur x1 |
| M103 | muscle biceps fémoral | droit | OK | face | 3 | 3 | muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M103 | muscle biceps fémoral | gauche | OK | face | 3 | 3 | muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M104 | muscle semi-tendineux | droit | OK | face | 3 | 3 | muscle sartorius x1, muscle gracile x1 |
| M104 | muscle semi-tendineux | gauche | OK | face | 3 | 3 | muscle sartorius x1, muscle gracile x1 |
| M105 | muscle semi-membraneux | droit | OK | face | 2 | 2 | muscle gracile x1 |
| M105 | muscle semi-membraneux | gauche | OK | face | 2 | 2 | muscle gracile x1 |
| M106 | muscle gastrocnémien | droit | OK | face | 1 | 1 | - |
| M106 | muscle gastrocnémien | gauche | OK | face | 1 | 1 | - |
| M107 | muscle soléaire | droit | OK | face | 1 | 1 | - |
| M107 | muscle soléaire | gauche | OK | face | 1 | 1 | - |
| M108 | muscle plantaire | droit | OK | face | 3 | 3 | muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M108 | muscle plantaire | gauche | OK | face | 3 | 3 | muscle droit fémoral x1, muscle vaste intermédiaire x1 |
| M109 | muscle poplité | droit | OK | face | 3 | 3 | muscle sartorius x1, muscle semi-tendineux x1 |
| M109 | muscle poplité | gauche | OK | face | 4 | 4 | muscle sartorius x1, muscle gracile x1, muscle semi-tendineux x1 |
| M110 | muscle tibial antérieur | droit | OK | face | 1 | 1 | - |
| M110 | muscle tibial antérieur | gauche | OK | face | 1 | 1 | - |
| M111 | muscle long extenseur des orteils | droit | OK | face | 1 | 1 | - |
| M111 | muscle long extenseur des orteils | gauche | OK | face | 1 | 1 | - |
| M112 | muscle long extenseur de l'hallux | droit | OK | face | 1 | 1 | - |
| M112 | muscle long extenseur de l'hallux | gauche | OK | face | 1 | 1 | - |
| M113 | muscle troisième fibulaire | droit | OK | face | 1 | 1 | - |
| M113 | muscle troisième fibulaire | gauche | OK | face | 2 | 2 | deuxième muscle interosseux plantaire du pied gauche x1 |
| M114 | muscle long fibulaire | droit | OK | face | 3 | 3 | muscle long extenseur de l'hallux x1, muscle court extenseur de l'hallux x1 |
| M114 | muscle long fibulaire | gauche | OK | face | 2 | 2 | muscle long extenseur de l'hallux x1 |
| M115 | muscle court fibulaire | droit | OK | face | 4 | 12 | muscle long extenseur des orteils x2, deuxième muscle interosseux plantaire du pied droit x2, artères digitales plantaires propres x1, veines perforantes du pied x2, premier muscle interosseux plantaire du pied droit x1, artères métatarsiennes plantaires x1, chef oblique du muscle adducteur de l'hallux droit x1, troisième muscle interosseux plantaire du pied droit x1 |
| M115 | muscle court fibulaire | gauche | OK | face | 4 | 12 | muscle long extenseur des orteils x2, deuxième muscle interosseux plantaire du pied gauche x2, artères digitales plantaires propres x1, veines perforantes du pied x2, premier muscle interosseux plantaire du pied gauche x1, artères métatarsiennes plantaires x1, chef oblique du muscle adducteur de l'hallux gauche x1, troisième muscle interosseux plantaire du pied gauche x1 |
| M116 | muscle tibial postérieur | droit | OK | face | 4 | 4 | chef médial du muscle court fléchisseur de l'hallux droit x1, chef latéral du muscle court fléchisseur de l'hallux droit x1, muscle abducteur de l'hallux x1 |
| M116 | muscle tibial postérieur | gauche | OK | face | 4 | 4 | veine métatarsienne dorsale x1, arcade veineuse dorsale du pied gauche x1, muscle court extenseur de l'hallux x1 |
| M117 | muscle long fléchisseur des orteils | droit | OK | face | 1 | 1 | - |
| M117 | muscle long fléchisseur des orteils | gauche | OK | face | 1 | 1 | - |
| M118 | muscle long fléchisseur de l'hallux | droit | OK | face | 1 | 1 | - |
| M118 | muscle long fléchisseur de l'hallux | gauche | OK | face | 1 | 1 | - |

Aucune erreur dans la console de la page.
