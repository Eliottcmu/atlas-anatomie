# Recalage des organes de Z-Anatomy

Fichier généré par pipeline/organes_zanatomy.py, ne pas éditer à la main.

Similitude globale sur 69 os : écart médian 9.7 mm. Recalage local par groupe ensuite :

| Groupe | Repères | Écart médian avant (mm) | Après (mm) | Transformation |
| --- | --- | --- | --- | --- |
| poumons | 25 | 5.66 | 5.13 | ICP local |
| cervelet | 48 | 2.89 | 2.53 | ICP local |
| encephale | 48 | 2.89 | 2.53 | ICP local |
| moelle | 29 | 6.24 | 5.8 | ICP local |
| yeux | 10 | 1.76 | 0.82 | ICP local |
| oreilles | 2 | 3.56 | 3.03 | ICP local |
| pharynx | 8 | 3.56 | 2.63 | ICP local |
| endocrines | 5 | 2.36 | 1.46 | ICP local |
| abdomen | 9 | 5.63 | 5.49 | ICP local |
| coccyx | 3 | 9.72 | 2.78 | ICP local |
| osselets-droits | 1 | 3.19 | 2.68 | ICP local |
| osselets-gauches | 1 | 3.19 | 2.71 | ICP local |
| os : tête et cou | 15 | 3.97 | 3.42 | ICP local |
| os : thorax | 24 | 5.85 | 5.21 | ICP local |
| os : membre supérieur droit | 5 | 7.32 | 2.13 | ICP local |
| os : membre supérieur gauche | 5 | 7.05 | 2.26 | ICP local |
| os : bassin | 3 | 9.72 | 2.78 | ICP local |
| os : membre inférieur droit | 4 | 6.17 | 4.24 | ICP local |
| os : membre inférieur gauche | 4 | 6.15 | 4.19 | ICP local |

**284 objets importés** : abdomen 5, cervelet 31, coccyx 1, encephale 74, endocrines 3, lymphatiques 135, moelle 5, oreilles 8, osselets-droits 3, osselets-gauches 3, pharynx 10, poumons 6.

**67 objets écartés**, déjà présents dans BodyParts3D (60 % de leur surface à moins de 2 mm) :

- Ampulla of lacrimal canaliculus.l : left lacrimal sac
- Ampulla of lacrimal canaliculus.r : right lacrimal sac
- Amygdaloid body.l : left amygdala
- Amygdaloid body.r : right amygdala
- Anterior occipital sulcus*.l : white matter of left cerebral hemisphere
- Anterior occipital sulcus*.r : white matter of right cerebral hemisphere
- Base of peduncle.l : peduncle of midbrain
- Base of peduncle.r : peduncle of midbrain
- Choroid plexus.l : choroid plexus of cerebral hemisphere
- Choroid plexus.r : choroid plexus of cerebral hemisphere
- Cingulate sulcus (Marginal part*).l : white matter of left cerebral hemisphere
- Cingulate sulcus (Marginal part*).r : white matter of right cerebral hemisphere
- Circular sulcus of insula.l : left insula
- Circular sulcus of insula.r : right insula
- Collateral sulcus.l : white matter of left cerebral hemisphere
- Collateral sulcus.r : white matter of right cerebral hemisphere
- Fornix.l : left fornix of forebrain
- Fornix.r : right fornix of forebrain
- Hippocampal commissure : commissure of fornix of forebrain
- Inferior pancreatic nodes : parenchyma of pancreas
- Inferior temporal sulcus.l : left inferior temporal gyrus
- Inferior temporal sulcus.r : right inferior temporal gyrus
- Inferior tracheobronchial nodes : right main bronchus proper
- Intraparietal sulcus.l : left superior parietal lobule
- Intraparietal sulcus.r : right superior parietal lobule
- Lat_Fis-post.l : left supramarginal gyrus
- Lat_Fis-post.r : right supramarginal gyrus
- Mamillary body.l : mammillary body
- Mamillary body.r : mammillary body
- Occipitotemporal sulcus (Lateral part*).l : white matter of left cerebral hemisphere
- Occipitotemporal sulcus (Lateral part*).r : right middle temporal gyrus
- Olfactory sulcus.l : white matter of left cerebral hemisphere
- Olfactory sulcus.r : white matter of right cerebral hemisphere
- Olive.l : medulla oblongata
- Opercular part of inferior frontal gyrus.l : left inferior frontal gyrus
- Opercular part of inferior frontal gyrus.r : right inferior frontal gyrus
- Paracentral gyrus and sulcus*.l : left precentral gyrus
- Paracentral gyrus and sulcus*.r : right precentral gyrus
- Paracentral sulcus.l : white matter of left cerebral hemisphere
- Paracentral sulcus.r : white matter of right cerebral hemisphere
- Parieto-occipital sulcus.l : white matter of left cerebral hemisphere
- Parieto-occipital sulcus.r : white matter of right cerebral hemisphere
- Postcentral sulcus.l : left postcentral gyrus
- Postcentral sulcus.r : right postcentral gyrus
- Posterior cochlear nucleus.l : medulla oblongata
- Posterior cochlear nucleus.r : medulla oblongata
- Precentral sulcus (Superior part)*.l : white matter of left cerebral hemisphere
- Precentral sulcus (Superior part)*.r : white matter of right cerebral hemisphere
- Precentral sulcus (inferior part)*.l : white matter of left cerebral hemisphere
- Precuneus.l : left superior parietal lobule
- Precuneus.r : right superior parietal lobule
- Retina.l : optic part of left retina
- Retina.r : right choroid
- Right colic nodes : taenia mesocolica
- Septal nuclei : lamina terminalis
- Septum pellucidum : septum of telencephalon
- Straight gyrus (Gyrus rectus).l : orbital gyrus
- Straight gyrus (Gyrus rectus).r : orbital gyrus
- Stria medullaris thalami.l : left thalamus
- Stria medullaris thalami.r : third ventricle
- Subparietal sulcus.l : left superior parietal lobule
- Subparietal sulcus.r : right superior parietal lobule
- Sulcus interm_prim-Jensen.l : white matter of left cerebral hemisphere
- Sulcus interm_prim-Jensen.r : right angular gyrus
- Transverse frontopolar gyrus and sulcus*.r : right superior frontal gyrus
- Transverse occipital sulcus.l : white matter of left cerebral hemisphere
- Transverse occipital sulcus.r : white matter of right cerebral hemisphere

**3 maillages BodyParts3D remplacés** par des parties plus fines :

- cerebellum (FJ1781) : Anterior quadrangular lobule.l, Anterior quadrangular lobule.r, Biventral lobule.l, Biventral lobule.r, Central lobule, Culmen, Declive, Flocculus.l, Flocculus.r, Folium of vermis, Gracile lobule.l, Gracile lobule.r, Inferior semilunar lobule.l, Inferior semilunar lobule.r, Lingula of cerebellum, Nodule of vermis, Peduncle of flocculus.l, Peduncle of flocculus.r, Posterior quadrangular lobule.l, Posterior quadrangular lobule.r, Pyramis of vermis, Superior cerebellar peduncle.l, Superior cerebellar peduncle.r, Superior semilunar lobule.l, Superior semilunar lobule.r, Tonsil of cerebellum.l, Tonsil of cerebellum.r, Tuber of vermis, Uvula of vermis, Wing of central lobule.l, Wing of central lobule.r
- pituitary gland (FJ1796) : Adenohypophysis, Neurohypophysis
- cerebellum (FJ1830) : Anterior quadrangular lobule.l, Anterior quadrangular lobule.r, Biventral lobule.l, Biventral lobule.r, Central lobule, Culmen, Declive, Flocculus.l, Flocculus.r, Folium of vermis, Gracile lobule.l, Gracile lobule.r, Inferior semilunar lobule.l, Inferior semilunar lobule.r, Lingula of cerebellum, Nodule of vermis, Peduncle of flocculus.l, Peduncle of flocculus.r, Posterior quadrangular lobule.l, Posterior quadrangular lobule.r, Pyramis of vermis, Superior cerebellar peduncle.l, Superior cerebellar peduncle.r, Superior semilunar lobule.l, Superior semilunar lobule.r, Tonsil of cerebellum.l, Tonsil of cerebellum.r, Tuber of vermis, Uvula of vermis, Wing of central lobule.l, Wing of central lobule.r

**243 légendes posées** ; écart de pose médian 0.4 mm, maximal 11.4 mm.

Légendes écartées :

- Optic axis (External axis of eyeball : porteur absent)
- Anterior surface of suprarenal gland (Suprarenal gland.l : 13 mm de la surface)
- Hilum of suprarenal gland (Suprarenal gland.l : 19 mm de la surface)
- Inferior pole of kidney (Kidney.l : 23 mm de la surface)
- Medial border of suprarenal gland (Suprarenal gland.l : 16 mm de la surface)
- Renal surface of suprarenal gland (Suprarenal gland.l : 13 mm de la surface)
