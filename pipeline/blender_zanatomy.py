"""Script exécuté dans Blender (pas dans le Python du système) sur le Startup.blend de Z-Anatomy.

Deux modes :
  bornes <sortie.json>
      relève les bornes, dans le repère du monde, de chaque objet des systèmes
      squelettique et cardiovasculaire, pour le recalage sur BodyParts3D
  export <demandes.json> <sortie.npz>
      convertit les objets demandés (courbes ou maillages) en maillages triangulés,
      coordonnées du monde, et les enregistre dans une archive numpy
  legendes <sortie.json> <sommets.npz> [collection...]
      relève les légendes (texte « .t » ou « .s » et son trait « .j » ou « .i ») des organes,
      de l'encéphale et du cœur (ou des collections nommées, le squelette par exemple), avec la
      position de leur pointe ; enregistre aussi les sommets des objets qui portent ces légendes,
      pour les recaler sur BodyParts3D

Lancé par pipeline/zanatomy.py, jamais à la main :
  blender -b --disable-autoexec Startup.blend --python pipeline/blender_zanatomy.py -- <mode> ...
"""

import json
import sys

import bpy
import numpy as np


SYSTEMES = {"1: Skeletal system": "os", "5: Cardiovascular system": "vaisseaux"}


def rendre_tout_visible():
    """Les objets des collections masquées ne sont pas évalués : on les rend tous visibles."""
    def activer(lc):
        lc.exclude = False
        lc.hide_viewport = False
        for e in lc.children:
            activer(e)
    activer(bpy.context.view_layer.layer_collection)
    for o in bpy.data.objects:
        o.hide_viewport = False
    return bpy.context.evaluated_depsgraph_get()


def bornes(sortie):
    depsgraph = rendre_tout_visible()
    resultat = {}
    for collection, systeme in SYSTEMES.items():
        for o in bpy.data.collections[collection].all_objects:
            if o.type not in ("MESH", "CURVE") or o.name in resultat:
                continue
            maillage = maillage_evalue(o, depsgraph)
            if maillage is None:
                continue
            monde = maillage[0]
            resultat[o.name] = {"systeme": systeme, "min": monde.min(axis=0).tolist(),
                                "max": monde.max(axis=0).tolist(), "sommets": len(monde)}
    with open(sortie, "w", encoding="utf-8") as f:
        json.dump(resultat, f)
    print(f"[OK] {len(resultat)} objets relevés.")


def maillage_evalue(o, depsgraph):
    """Maillage triangulé de l'objet tel qu'affiché (courbe avec profil, modificateurs appliqués)."""
    evalue = o.evaluated_get(depsgraph)
    me = evalue.to_mesh()
    try:
        me.calc_loop_triangles()
        n_s, n_t = len(me.vertices), len(me.loop_triangles)
        if not n_s or not n_t:
            return None
        co = np.empty(n_s * 3)
        me.vertices.foreach_get("co", co)
        tri = np.empty(n_t * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", tri)
        m = np.array(evalue.matrix_world)
        return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3], tri.reshape(-1, 3)
    finally:
        evalue.to_mesh_clear()


def exporter(demandes_json, sortie):
    with open(demandes_json, encoding="utf-8") as f:
        demandes = json.load(f)
    depsgraph = rendre_tout_visible()
    tableaux, manquants, vides, miroirs = {}, [], [], []
    for nom in demandes["objets"]:
        o = bpy.data.objects.get(nom)
        if o is None:
            manquants.append(nom)
            continue
        resultat = maillage_evalue(o, depsgraph)
        if resultat is None:
            vides.append(nom)
            continue
        k = len(tableaux) // 3
        tableaux[f"s{k}"], tableaux[f"t{k}"] = resultat
        tableaux[f"nom{k}"] = np.array(nom)
        # Copie en miroir (échelle négative) : l'ordre des sommets des faces est inversé, donc les normales
        if np.linalg.det(np.array(o.matrix_world)[:3, :3]) < 0:
            miroirs.append(nom)
    # Un seul tableau de plus : len(files) // 3 reste le nombre d'objets pour les lecteurs existants
    tableaux["miroirs"] = np.array(miroirs if miroirs else [""])
    np.savez_compressed(sortie, **tableaux)
    print(f"[OK] {len(tableaux) // 3} objets exportés.")
    if manquants:
        print(f"[WARN] Objets introuvables : {', '.join(manquants)}")
    if vides:
        print(f"[WARN] Objets sans géométrie : {', '.join(vides)}")


COLLECTIONS_LEGENDES = ("5: Cardiovascular system", "6: Lymphoid organs", "7: Nervous system & Sense organs",
                        "8: Visceral systems")


def legendes(sortie, sommets_npz, collections=COLLECTIONS_LEGENDES):
    """Légendes des organes : texte, objet porteur, pointe du trait (repère du monde, mètres)."""
    depsgraph = rendre_tout_visible()
    vues, res, porteurs = set(), [], {}
    for collection in collections:
        for o in bpy.data.collections[collection].all_objects:
            if o.type != "FONT" or o.name in vues or not o.name.endswith((".t", ".s")):
                continue
            vues.add(o.name)
            trait = next((e for e in o.children if e.type == "MESH" and len(e.data.vertices) == 2), None)
            porteur = o.parent
            # Le porteur peut être une autre légende (sous-repère) : on remonte jusqu'à un objet géométrique
            while porteur is not None and porteur.type not in ("MESH", "CURVE"):
                porteur = porteur.parent
            if trait is None or porteur is None:
                continue
            # Le trait est accroché à l'organe par un crochet (modificateur HOOK) : seule la géométrie
            # évaluée place sa pointe sur l'organe ; le sommet accroché est la pointe
            evalue = trait.evaluated_get(depsgraph)
            me = evalue.to_mesh()
            extremites = [list(evalue.matrix_world @ v.co) for v in me.vertices]
            evalue.to_mesh_clear()
            crochet = next((m for m in trait.modifiers if m.type == "HOOK" and len(m.vertex_indices)), None)
            pointe = crochet.vertex_indices[0] if crochet else None
            try:
                texte = o.data.body.strip()
            except UnicodeDecodeError:  # quelques textes mal encodés dans le fichier : le nom de l'objet suffit
                texte = ""
            res.append({"objet": o.name, "texte": texte, "porteur": porteur.name,
                        "collection": collection, "position_texte": list(o.matrix_world.translation),
                        "extremites": extremites, "pointe": pointe})
            porteurs.setdefault(porteur.name, porteur)
    tableaux = {}
    for k, (nom, o) in enumerate(sorted(porteurs.items())):
        m = maillage_evalue(o, depsgraph)
        if m is None:
            continue
        tableaux[f"s{k}"], tableaux[f"nom{k}"] = m[0].astype(np.float32), np.array(nom)
    np.savez_compressed(sommets_npz, **tableaux)
    with open(sortie, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    print(f"[OK] {len(res)} légendes sur {len(porteurs)} objets porteurs.")


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    if args[0] == "bornes":
        bornes(args[1])
    elif args[0] == "export":
        exporter(args[1], args[2])
    elif args[0] == "legendes":
        legendes(args[1], args[2], args[3:] or COLLECTIONS_LEGENDES)
    else:
        print(f"[FAIL] Mode inconnu : {args[0]}")
        sys.exit(1)


main()
