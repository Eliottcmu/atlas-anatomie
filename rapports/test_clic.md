# Test des clics, phase 1

Fichier généré par app/tests/clic.mjs, ne pas éditer à la main.

Date : 2026-10-24 15:21. Rendu : ANGLE (Intel, Intel(R) UHD Graphics (0x00004688) Direct3D11 vs_5_0 ps_5_0, D3D11). Chargement : 1.8 s.
Fluidité mesurée en rotation : 60 i/s (rendu matériel).

**170 cas cliquables sur 170** (100 %).

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

Aucune erreur dans la console de la page.
