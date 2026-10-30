import * as THREE from "three";
import {
  chargerAtlas, ErreurChargement, libelleCote, libelleSysteme, normaliser,
  type Atlas, type Cote, type Noeud, type Structure,
} from "./donnees";
import { Accueil } from "./apprentissage/accueil";
import { api, type Niveau } from "./apprentissage/api";
import { construireParcours, Lecteur, type Etape } from "./apprentissage/parcours";
import { FabriqueQuestions } from "./apprentissage/questions";
import { Seance, type Plateau } from "./apprentissage/seance";
import { COULEURS_NIVEAU, Tableau } from "./apprentissage/tableau";
import { chercherCoupe, chercherVue, PART_ACCEPTABLE } from "./degagement";
import { ChoixFamilles } from "./familles";
import { Fiches } from "./fiches";
import { Focus } from "./focus";
import { Interrogation } from "./interrogation";
import { Legendes, MODES_LEGENDES, type ItemLegende, type ModeLegendes } from "./legendes";
import { Modeles, type ModeOs, type Progression } from "./modeles";
import { Historique, SUR_MAC, touche, type EtapeNavigation } from "./navigation";
import { Orientation } from "./orientation";
import { Scene3D, type ModeNavigation, type Vue } from "./scene";
import { Selecteur } from "./selection";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const CALQUES_INITIAUX = ["arteres", "veines", "os"];
const CALQUES_ATTENUABLES = new Set(["arteres", "veines", "muscles", "nerfs", "lymphatique", "autres"]);
const NOMS_CALQUES: Record<string, string> = {
  arteres: "Artère", veines: "Veine", os: "Os", muscles: "Muscle", nerfs: "Nerf", lymphatique: "Nœud lymphatique",
  autres: "Organe ou autre structure",
};
/** Lien d'un vaisseau avec son vaisseau d'origine, tel que la fiche l'énonce. */
const LIENS: Record<string, string> = {
  partie: "Partie de", branche: "Naît de", affluent: "Se jette dans", anastomose: "Anastomose entre",
};
const NOMS_VUES: Record<Vue, string> = {
  face: "de face", dos: "de dos", droite: "de profil, côté droit du sujet", gauche: "de profil, côté gauche du sujet",
  dessus: "de dessus", dessous: "de dessous",
};

interface Selection {
  noeud: string | null;
  structure: string | null;
  cote: Cote;
  cles: Set<string>;
  repere?: string;
  /** Identifiant de l'étiquette du repère choisi : elle seule s'allume. */
  repereId?: string;
  /** Pointe approchée, étiquette corrigée : affiché dans la fiche. */
  repereNote?: string;
}

/**
 * Un masquage (H), un dégagement de la vue (structures estompées) ou un réaffichage de tout (Échap) :
 * ce qu'il faut pour le défaire.
 */
interface ActionMasquage {
  masque: boolean;
  cles: string[];
  /** Structures estompées (translucides, non cliquables) par le dégagement de la vue. */
  estompes?: string[];
  libelle: string;
  /** Sélection en cours au moment de masquer : elle revient avec la structure. */
  selection: { noeud: string | null; structure: string | null; cote: Cote } | null;
}

const MAXI_ANNULATIONS = 50;

interface Resultat {
  type: "structure" | "noeud" | "region" | "organe";
  id: string;
  nom: string;
  sousTitre: string;
  synonyme?: string;
  score: number;
}

/** Réglages de l'utilisateur, gardés d'une session à l'autre (navigateur privé : valeurs par défaut). */
const reglages = {
  lire(cle: string): string | null {
    try { return localStorage.getItem(`atlas.${cle}`); } catch { return null; }
  },
  ecrire(cle: string, valeur: string): void {
    try { localStorage.setItem(`atlas.${cle}`, valeur); } catch { /* stockage indisponible : réglage non retenu */ }
  },
};

export class Application {
  private atlas!: Atlas;
  private scene!: Scene3D;
  private modeles!: Modeles;
  private selecteur!: Selecteur;
  private focus!: Focus;
  private fiches!: Fiches;
  private legendes!: Legendes;
  private interrogation!: Interrogation;
  private historique = new Historique();
  private organeDe = new Map<string, string>();
  private selection: Selection | null = null;
  private survol: THREE.Mesh | null = null;
  private survolLegende: Set<string> | null = null;
  private isole = false;
  private masques = new Set<string>();
  private estompes = new Set<string>();
  private choix!: ChoixFamilles;
  // Dernier dégagement de la vue : son message reste affiché tant que la sélection ne change pas
  private degagement: { action: ActionMasquage; boite: THREE.Box3; direction: THREE.Vector3; nom: string } | null = null;
  // Masquages annulables (Ctrl Z) et rétablissables (Ctrl Y ou Ctrl Maj Z), du plus ancien au plus récent
  private aAnnuler: ActionMasquage[] = [];
  private aRetablir: ActionMasquage[] = [];
  private resultats: Resultat[] = [];
  private indexResultat = 0;
  private progression = new Map<string, Progression>();
  // Clic répété au même endroit : on descend dans l'empilement des structures sous le pointeur
  private dernierClic: { x: number; y: number; pile: string[] } | null = null;
  // Phase 3 : apprentissage
  private seance!: Seance;
  private lecteur!: Lecteur;
  private tableau!: Tableau;
  private accueil!: Accueil;
  private capteur: ((cle: string | null) => void) | null = null;
  private titreSeance: string | null = null;
  private coloration: Map<string, string> | null = null;
  private cartesPretes: number | null = null;
  pret = false;

  async demarrer(): Promise<void> {
    try {
      this.atlas = await chargerAtlas();
    } catch (e) {
      return this.erreurFatale(e);
    }
    try {
      this.scene = new Scene3D($("vue3d"));
    } catch {
      return this.erreurFatale(new ErreurChargement(
        "Le navigateur n'a pas pu créer l'affichage 3D (WebGL indisponible).",
        "Ouvrir l'atlas dans Edge, Chrome, Safari ou Firefox à jour, avec l'accélération graphique activée.",
      ));
    }
    this.modeles = new Modeles(this.atlas, () => {
      this.majCalques();
      this.legendes?.invalider();
      this.scene.demanderRendu();
    });
    this.scene.scene.add(this.modeles.racine);
    this.selecteur = new Selecteur(this.scene, this.modeles);
    this.scene.apresRendu.push(() => this.majIps());
    for (const o of this.atlas.organes) for (const cle of o.parties) this.organeDe.set(cle, o.nom);
    this.legendes = new Legendes(this.atlas, this.scene, this.modeles, {
      survoler: (item) => {
        this.survolLegende = item ? new Set(item.cles) : null;
        this.appliquerEtats();
      },
      choisir: (item) => this.choisirLegende(item),
      zoneLibre: () => this.zoneLibre(),
    });
    this.interrogation = new Interrogation(this.legendes, {
      etat: (a, e, err) => this.etat(a, e, err),
      definirModeLegendes: (mode) => this.definirModeLegendes(mode, false),
      sujet: () => this.focus.actif?.nom ?? "Vue",
    });
    this.focus = new Focus(this.atlas, this.scene, this.modeles, {
      etat: (a, e, err) => this.etat(a, e, err),
      selectionnerStructure: (id, cote) => this.selectionnerStructure(id, cote),
      selectionnerNoeud: (cle, cadrer) => this.selectionnerNoeud(cle, cadrer),
      chargerCalque: (id) => this.modeles.charger(id, (p) => this.suivre(p)).then(() => this.appliquerEtats()),
      ficheVisible: () => !$("fiche").hidden,
      legendes: (items) => this.legendes.definir(items),
      choisirRepere: (nom, cle) => this.choisirRepere(nom, cle),
      modeOs: (mode) => {
        this.modeles.definirModeOs(mode);
        this.majModeOs();
      },
      avant: (entree) => {
        this.interrogation.arreter();
        this.avantNavigation();
        if (entree) this.fermerSelection();
      },
      change: () => this.apresNavigation(),
    });
    this.focus.brancherZone();
    this.fiches = new Fiches({
      etat: (a, e, err) => this.etat(a, e, err),
      selectionnerStructure: (id, cote) => this.selectionnerStructure(id, cote),
      ficheModifiee: () => this.preparerApprentissage(),
    });
    await this.fiches.demarrer();
    this.creerApprentissage();
    new Orientation(document.getElementById("orientation-svg") as unknown as SVGSVGElement, this.scene,
      (v) => this.vue(v));

    this.choix = new ChoixFamilles(this.atlas, {
      etat: (a, e, err) => this.etat(a, e, err),
      afficherCalque: (id) => this.afficherCalque(id),
      appliquer: (caches) => {
        this.modeles.definirHorsFamilles(caches);
        this.appliquerEtats();
        this.focus.majZone();
      },
      lire: (cle) => reglages.lire(cle),
      ecrire: (cle, v) => reglages.ecrire(cle, v),
    });
    this.choix.demarrer();
    document.addEventListener("atlas:familles", () => this.majCalques());
    this.construireCalques();
    this.brancherEvenements();
    this.majModeOs();
    this.appliquerReglages();
    this.construireAide();

    try {
      await Promise.all(CALQUES_INITIAUX.map((c) => this.modeles.charger(c, (p) => this.suivre(p))));
    } catch (e) {
      return this.erreurFatale(new ErreurChargement(
        `Modèle introuvable : ${(e as Error).message}.`,
        "Lancer python -I pipeline/convertir_glb.py --compresser puis python -I pipeline/zanatomy.py --compresser, et recharger la page.",
      ));
    }
    this.majZoneUtile();
    window.addEventListener("resize", () => this.majZoneUtile());
    this.scene.vue("face", this.modeles.boiteVisible());
    $("chargement").classList.add("fini");
    document.body.classList.add("pret");
    this.pret = true;
    this.memoriser();
    this.majFil();
    const n = CALQUES_INITIAUX.reduce((s, c) => s + this.modeles.compter(c), 0);
    this.etat(
      `${n} structures chargées : artères, veines et os en repère.`,
      `Clique sur un vaisseau pour voir son nom, ou cherche un nom (${touche("Ctrl")} K).`,
    );
    await this.preparerApprentissage();
    if (reglages.lire("accueil") !== "vu") this.accueil.ouvrir();
  }

  // ------------------------------------------------------------ chargement

  private suivre(p: Progression): void {
    this.progression.set(p.fichier, p);
    const liste = $("chargement-fichiers");
    let li = liste.querySelector<HTMLLIElement>(`[data-fichier="${p.fichier}"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.fichier = p.fichier;
      li.innerHTML = `<span>${p.fichier}</span><span class="taux"></span><span class="barre"><i></i></span>`;
      liste.appendChild(li);
    }
    const taux = p.termine ? 1 : p.total ? p.charge / p.total : 0;
    li.querySelector(".taux")!.textContent = p.termine ? "prêt" : `${Math.round(taux * 100)} %`;
    li.querySelector<HTMLElement>(".barre i")!.style.width = `${taux * 100}%`;

    const valeurs = [...this.progression.values()];
    const total = valeurs.reduce((s, v) => s + (v.termine ? 1 : v.total ? v.charge / v.total : 0), 0) / Math.max(valeurs.length, 1);
    $("chargement-pourcent").textContent = String(Math.round(total * 100));
    if (this.pret) {
      const calque = this.atlas.calques.find((c) => c.id === p.calque)!;
      this.etat(`Chargement des ${calque.nom.toLowerCase()} : ${Math.round(taux * 100)} %.`, "Le calque s'affichera dès la fin du chargement.");
    }
  }

  private erreurFatale(e: unknown): void {
    const err = e instanceof ErreurChargement ? e : new ErreurChargement(String(e), "Recharger la page.");
    const bloc = $("chargement-erreur");
    bloc.hidden = false;
    bloc.innerHTML = `<strong>Le chargement a échoué.</strong><br>${err.cause_}<br>Action : ${err.action}`;
    $("etat-action").textContent = err.cause_;
    $("etat-action").classList.add("erreur");
    $("etat-ensuite").textContent = err.action;
  }

  // ------------------------------------------------------------ calques

  private construireCalques(): void {
    const ul = $("liste-calques");
    for (const c of this.atlas.calques) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="calque" data-calque="${c.id}" aria-pressed="${c.visible}">
          <span class="pastille" style="background:${c.couleur}"></span>
          <span class="nom">${c.nom}</span><span class="compte"></span><kbd>${c.touche}</kbd></button>`
        + (this.choix.aDesFamilles(c.id) ? `<button class="choisir" data-choisir="${c.id}"
          title="Choisir les familles et les éléments affichés">Choisir <span class="choisir-bilan"></span></button>` : "");
      li.querySelector(".calque")!.addEventListener("click", () => this.basculerCalque(c.id));
      li.querySelector(".choisir")?.addEventListener("click", () => this.choix.basculer(c.id, c.nom));
      ul.appendChild(li);
    }
    this.majCalques();
  }

  private majCalques(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>(".calque")) {
      const id = b.dataset.calque!;
      const charge = this.modeles?.calquesCharges.has(id);
      b.setAttribute("aria-pressed", String(this.modeles ? this.modeles.estVisible(id) : false));
      b.querySelector(".compte")!.textContent = charge ? String(this.modeles.compter(id)) : "";
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>(".choisir")) {
      const { affiches, total } = this.choix.bilan(b.dataset.choisir!);
      b.querySelector(".choisir-bilan")!.textContent = affiches === total ? "tout" : `${affiches} sur ${total}`;
      b.classList.toggle("partiel", affiches !== total);
    }
  }

  /** Affiche un calque (chargé au besoin), sans message : une case cochée dans « Choisir ». */
  private async afficherCalque(id: string): Promise<void> {
    if (id === "os") return;
    this.modeles.afficherCalque(id, true);
    if (!this.modeles.calquesCharges.has(id)) {
      try {
        await this.modeles.charger(id, (p) => this.suivre(p));
      } catch {
        this.etat(`Le calque ${id} n'a pas pu être chargé.`, "Lancer python -I pipeline/organes_zanatomy.py --compresser puis réessayer.", true);
      }
    }
    this.majCalques();
    this.appliquerEtats();
  }

  private async basculerCalque(id: string): Promise<void> {
    if (id === "os") return this.cyclerOs();
    const calque = this.atlas.calques.find((c) => c.id === id)!;
    const visible = !this.modeles.estVisible(id);
    this.modeles.afficherCalque(id, visible);
    if (visible && !this.modeles.calquesCharges.has(id)) {
      const bouton = document.querySelector(`.calque[data-calque="${id}"]`)!;
      bouton.classList.add("en-cours");
      try {
        await this.modeles.charger(id, (p) => this.suivre(p));
      } catch {
        this.etat(`Le calque ${calque.nom.toLowerCase()} n'a pas pu être chargé.`,
          "Lancer python -I pipeline/convertir_glb.py --compresser puis réessayer.", true);
        return;
      } finally {
        bouton.classList.remove("en-cours");
      }
      this.appliquerEtats();
    }
    const masque = id === "muscles" && visible ? " Les muscles cachent la plupart des vaisseaux."
      : visible && this.choix.aDesFamilles(id) && this.choix.bilan(id).affiches < this.choix.bilan(id).total
        ? ` Une partie est décochée dans « Choisir » (${this.choix.bilan(id).affiches} éléments sur ${this.choix.bilan(id).total}).` : "";
    this.etat(`Calque ${calque.nom.toLowerCase()} ${visible ? "affiché" : "masqué"}.${masque}`,
      `Touche ${calque.touche} pour ${visible ? "le masquer" : "l'afficher"} à nouveau.`);
  }

  /** Calques masqués qui portent ces maillages (un muscle cherché alors que le calque Muscles est masqué). */
  private calquesMasques(cles: Iterable<string>): string[] {
    const ids = new Set<string>();
    for (const c of cles) {
      const k = this.atlas.noeuds[c]?.calque;
      if (k && k !== "os" && !this.modeles.estVisible(k)) ids.add(k);
    }
    return [...ids];
  }

  /**
   * Recoche dans « Choisir » les éléments qui portent ces maillages (organe d'une famille décochée) ;
   * renvoie la phrase qui le dit, vide si rien n'était caché.
   */
  private recocher(cles: Iterable<string>): string {
    const noms = this.choix.montrer(cles);
    return noms.length ? ` ${noms.join(", ")} recoché${noms.length > 1 ? "s" : ""} dans « Choisir ».` : "";
  }

  /** Charge et affiche, sans message, les calques masqués qui portent ces maillages. */
  private async montrerCalques(cles: Iterable<string>): Promise<void> {
    for (const id of this.calquesMasques(cles)) {
      this.modeles.afficherCalque(id, true);
      if (!this.modeles.calquesCharges.has(id)) {
        try {
          await this.modeles.charger(id, (p) => this.suivre(p));
        } catch {
          this.etat(`Le calque ${id} n'a pas pu être chargé.`, "Lancer python -I pipeline/convertir_glb.py --compresser puis réessayer.", true);
        }
      }
    }
    this.majCalques();
    this.appliquerEtats();
  }

  private cyclerOs(): void {
    const ordre: ModeOs[] = ["repere", "opaque", "masque"];
    this.definirModeOs(ordre[(ordre.indexOf(this.modeles.modeOs) + 1) % ordre.length]);
  }

  private definirModeOs(mode: ModeOs): void {
    this.modeles.definirModeOs(mode);
    this.majModeOs();
    const texte = { repere: "en repère translucide, non cliquables", opaque: "opaques et cliquables", masque: "masqués" }[mode];
    this.etat(`Os ${texte}.`, "Touche O pour passer au mode suivant.");
  }

  private majModeOs(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      b.setAttribute("aria-checked", String(b.dataset.mode === this.modeles.modeOs));
    }
    const bouton = document.querySelector<HTMLButtonElement>('.calque[data-calque="os"]');
    bouton?.setAttribute("aria-pressed", String(this.modeles.modeOs !== "masque"));
  }

  // ------------------------------------------------------------ légendes

  private definirModeLegendes(mode: ModeLegendes, annoncer = true): void {
    this.legendes.definirMode(mode);
    reglages.ecrire("legendes", mode);
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-legendes]")) {
      b.setAttribute("aria-checked", String(b.dataset.legendes === mode));
    }
    if (!annoncer) return;
    const textes: Record<ModeLegendes, [string, string]> = {
      noms: ["Légendes : noms affichés.", "Survole un nom pour surligner la structure, clique-le pour ouvrir sa fiche."],
      numeros: ["Légendes : planche muette, numéros seuls.", "Clique un numéro pour révéler son nom, encore une fois pour la fiche."],
      aucune: ["Légendes masquées.", "N pour les réafficher."],
    };
    const [a, e] = textes[mode];
    const sans = mode !== "aucune" && !this.legendes.nombre ? " Elles apparaissent en focus (G)." : "";
    this.etat(a + sans, e);
  }

  private choisirLegende(item: ItemLegende): void {
    if (item.type === "structure" && item.structure) {
      this.selectionnerStructure(item.structure, item.cote ?? null, false);
    } else if (item.type === "repere") {
      this.selectionnerNoeud(item.cles[0]);
      if (this.selection) {
        this.selection.repere = item.nom + (item.calcule ? " (position calculée sur le modèle)" : "");
        this.selection.repereId = item.id;
        this.selection.repereNote = [item.approchee ? "La pointe de Z-Anatomy vise le centre d'un trou ou l'axe de l'os : posée sur le bord le plus proche." : "",
          item.reporte ? `Repère reporté par recalage depuis le seul os de la famille légendé par Z-Anatomy (${item.reporte.toLowerCase()}) : position à vérifier.` : "",
          item.correction ?? ""].filter(Boolean).join(" ") || undefined;
        this.appliquerEtats();
        this.afficherFiche();
        this.majFil();
        const porteur = this.nomAffiche();
        this.etat(`Repère : ${item.nom}${item.inconstant ? " (inconstant)" : ""}, sur ${porteur}.`,
          "Clique un autre nom, ou Échap pour fermer.");
      }
    } else {
      this.selectionnerNoeud(item.cles[0]);
    }
  }

  /** Repère choisi dans la liste de la zone : comme un clic sur sa légende ; s'il est caché, la vue tourne vers lui. */
  private choisirRepere(nom: string, cle: string): void {
    const item = this.legendes.item(`repere:${nom}:${cle}`);
    if (!item) {
      this.selectionnerNoeud(cle, true);
      return;
    }
    this.choisirLegende(item);
    if (!this.legendes.estAffichee(item.id) && item.ancres.length) {
      const boite = this.focus.boiteCourante() ?? this.modeles.boite(item.cles);
      const dir = this.normaleEn(item.cles[0], item.ancres[0])
        ?? item.ancres[0].clone().sub(boite.getCenter(new THREE.Vector3())).normalize();
      // Un peu de recul vers l'avant du corps : la vue reste lisible même pour une normale très oblique
      this.scene.cadrer(boite, dir.add(new THREE.Vector3(0, 0.1, 0.15)).normalize(), 1.02);
    }
  }

  /** Normale de la surface d'un maillage au sommet le plus proche d'un point (repère du monde). */
  private normaleEn(cle: string, point: THREE.Vector3): THREE.Vector3 | null {
    const m = this.modeles.maillages.get(cle);
    const pos = m?.geometry.getAttribute("position");
    const nor = m?.geometry.getAttribute("normal");
    if (!m || !pos || !nor) return null;
    m.updateWorldMatrix(true, false);
    const local = m.worldToLocal(point.clone());
    const v = new THREE.Vector3();
    let meilleur = -1, d = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const e = v.fromBufferAttribute(pos, i).distanceToSquared(local);
      if (e < d) { d = e; meilleur = i; }
    }
    if (meilleur < 0) return null;
    const n = new THREE.Vector3().fromBufferAttribute(nor, meilleur)
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize();
    return n.lengthSq() > 0.5 ? n : null;
  }

  /** Zone de cadrage : entre le panneau d'affichage et la colonne de la fiche, sous l'en-tête, au-dessus du dock. */
  private majZoneUtile(): void {
    const entete = Math.max(...[".titre", ".entete-centre", ".entete-droite"]
      .map((s) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect().bottom));
    const dock = document.querySelector<HTMLElement>(".dock")!.getBoundingClientRect();
    const carte = document.querySelector<HTMLElement>(".dock-carte")!.getBoundingClientRect();
    this.scene.definirZoneUtile({ gauche: dock.left, droite: dock.right, haut: entete + 6, bas: carte.top - 6 });
  }

  /** Partie de l'écran laissée libre par les panneaux : les étiquettes s'y rangent. */
  /** Public pour les sondes de test. */
  zoneLibre(): { gauche: number; droite: number; haut: number; bas: number } {
    // offsetParent vaut null pour un élément en position fixe : on regarde s'il occupe une place à l'écran
    const visible = (el: HTMLElement) => !el.hidden && el.getClientRects().length > 0;
    const affichage = document.querySelector<HTMLElement>(".affichage")!;
    const droiteEl = [$("fiche"), $("zone"), $("interrogation")].find(visible);
    const entete = Math.max(...[".titre", ".entete-centre", ".entete-droite"]
      .map((s) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect().bottom));
    const dock = document.querySelector<HTMLElement>(".dock")!.getBoundingClientRect();
    return {
      gauche: visible(affichage) ? affichage.getBoundingClientRect().right + 12 : 12,
      droite: (droiteEl ? droiteEl.getBoundingClientRect().left : window.innerWidth) - 12,
      haut: entete + 10,
      bas: dock.top - 10,
    };
  }

  // ------------------------------------------------------------ sélection

  /** Segments propres d'une structure (sans ses branches), limités à un côté ; à défaut, tous ses nœuds. */
  private clesPropres(id: string, cote: Cote): Set<string> {
    const toutes = this.clesStructure(id, cote);
    const propres = new Set([...toutes].filter((c) => this.atlas.noeuds[c]?.structure === id && this.atlas.noeuds[c]?.propre));
    return propres.size ? propres : toutes;
  }

  /** Nœuds d'une structure, limités à un côté pour une structure bilatérale. */
  private clesStructure(id: string, cote: Cote): Set<string> {
    const s = this.atlas.structures[id];
    return new Set(s.noeuds.filter((c) => {
      const n = this.atlas.noeuds[c];
      return !cote || !n || n.cote === cote || n.cote === null;
    }));
  }

  /** Vrai si une correction de fiche est en cours : on ne change pas de sélection sans l'avoir close. */
  private correctionEnCours(): boolean {
    if (!this.fiches?.edition) return false;
    this.etat("Correction de fiche en cours : rien n'a changé.", "Enregistre, marque vérifiée ou annule (Échap) avant de sélectionner autre chose.");
    return true;
  }

  selectionnerNoeud(cle: string, cadrer = false): void {
    if (this.correctionEnCours()) return;
    const n = this.atlas.noeuds[cle];
    if (!n) return;
    this.avantNavigation();
    const s = n.structure ? this.atlas.structures[n.structure] : null;
    const cote = s && s.cote === "bilatéral" ? n.cote : null;
    const cles = n.structure ? this.clesStructure(n.structure, cote) : new Set([cle]);
    cles.add(cle);
    this.masquerDegagement();
    const recoches = this.recocher(cles);
    this.selection = { noeud: cle, structure: n.structure, cote: n.cote, cles };
    this.appliquerEtats();
    this.afficherFiche();
    if (cadrer) this.scene.cadrer(this.modeles.boite([cle]));
    const nom = this.nomAffiche();
    this.etat(`Sélection : ${nom}${n.cote ? `, ${libelleCote(n.cote)}` : ""}. ${cles.size > 1 ? `${cles.size} segments surlignés.` : ""}${recoches}`,
      "I pour isoler, Z pour cadrer, Échap pour fermer.");
    this.apresNavigation();
  }

  selectionnerStructure(id: string, cote: Cote = null, cadrer = true): void {
    if (this.correctionEnCours()) return;
    const s = this.atlas.structures[id];
    this.avantNavigation();
    // Un côté n'a de sens que pour une structure bilatérale (un lien de relation peut en porter un)
    if (s.cote !== "bilatéral") cote = null;
    const cles = this.clesStructure(id, cote);
    this.masquerDegagement();
    const recoches = this.recocher(cles);
    this.selection = { noeud: null, structure: id, cote, cles };
    this.appliquerEtats();
    this.afficherFiche();
    this.apresNavigation();
    if (!cles.size) {
      this.etat(`${s.nom} : pas de modèle 3D.`, `Solution prévue : ${s.couverture}. Échap pour fermer.`);
      return;
    }
    const masques = this.calquesMasques(cles);
    if (masques.length) {
      // Calque masqué (muscles) : affiché, puis cadrage une fois ses maillages chargés
      void this.montrerCalques(cles).then(() => {
        if (cadrer && this.selection?.structure === id) this.scene.cadrer(this.modeles.boite(cles));
      });
    } else if (cadrer) this.scene.cadrer(this.modeles.boite(cles));
    const affiches = masques.length ? ` Calque ${masques.map((k) => this.atlas.calques.find((c) => c.id === k)?.nom.toLowerCase() ?? k).join(", ")} affiché.` : "";
    this.etat(`Sélection : ${s.nom}${cote ? `, ${libelleCote(cote)}` : ""}.${cadrer ? " Vue cadrée sur la structure." : ""}${affiches}${recoches}`,
      "I pour isoler, Échap pour fermer, Alt flèche gauche pour revenir.");
  }

  /** Ferme la sélection sans toucher aux masquages (retour dans l'historique). */
  private fermerSelection(): void {
    this.masquerDegagement();
    if (!this.selection) return;
    this.selection = null;
    this.isole = false;
    $("fiche").hidden = true;
    this.fiches.afficher(null);
    this.focus.majZone();
    this.appliquerEtats();
  }

  deselectionner(): void {
    if (!this.selection) {
      if (this.isole || this.masques.size || this.estompes.size) {
        const n = this.masques.size + this.estompes.size;
        if (n) {
          this.noterMasquage({ masque: false, cles: [...this.masques], estompes: [...this.estompes],
            libelle: `${n} structure${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""} ou estompée${n > 1 ? "s" : ""}`, selection: null });
        }
        this.isole = false;
        this.masques.clear();
        this.estompes.clear();
        this.modeles.toutReafficher();
        this.appliquerEtats();
        this.majMasquage();
        this.etat("Toutes les structures sont réaffichées.",
          n ? `${touche("Ctrl")} Z pour les masquer de nouveau.` : "Clique sur une structure pour la sélectionner.");
      }
      return;
    }
    this.avantNavigation();
    this.fermerSelection();
    this.apresNavigation();
    const reste = this.masques.size || this.estompes.size ? ` Des structures restent masquées ou estompées : ${touche("Ctrl")} Z pour remettre la dernière, Échap pour tout réafficher.` : "";
    this.etat(`Sélection fermée.${reste}`, `Clique sur une structure, ou cherche un nom (${touche("Ctrl")} K).`);
  }

  private isoler(): void {
    if (!this.selection?.cles.size) {
      this.etat("Rien à isoler : aucune structure sélectionnée.", "Clique d'abord sur une structure.");
      return;
    }
    this.isole = !this.isole;
    this.appliquerEtats();
    document.querySelector('[data-action="isoler"]')!.classList.toggle("actif", this.isole);
    this.etat(this.isole ? "Structure isolée : les autres vaisseaux sont estompés, les os restent en repère."
      : "Isolement levé : tous les vaisseaux sont de nouveau affichés.", this.isole ? "I pour revenir à la vue complète." : "Échap pour fermer la fiche.");
  }

  private masquer(): void {
    if (!this.selection?.cles.size) {
      this.etat("Rien à masquer : aucune structure sélectionnée.", "Clique d'abord sur une structure.");
      return;
    }
    const nom = this.nomAffiche();
    const { noeud, structure, cote } = this.selection;
    const nouvelles = [...this.selection.cles].filter((c) => !this.masques.has(c));
    this.noterMasquage({ masque: true, cles: nouvelles, libelle: nom, selection: { noeud, structure, cote } });
    for (const c of nouvelles) this.masques.add(c);
    this.modeles.masquer(nouvelles, true);
    this.selection = null;
    this.isole = false;
    $("fiche").hidden = true;
    this.focus.majZone();
    this.appliquerEtats();
    this.majFil();
    this.etat(`Masqué : ${nom}. On voit ce que la structure cachait.`,
      `${touche("Ctrl")} Z pour la remettre, Échap pour tout réafficher.`);
  }

  private noterMasquage(action: ActionMasquage): void {
    this.aAnnuler.push(action);
    if (this.aAnnuler.length > MAXI_ANNULATIONS) this.aAnnuler.shift();
    this.aRetablir = [];
    this.majMasquage();
  }

  /** Masque (vrai) ou réaffiche (faux) ces maillages, et estompe ou rend leur aspect à d'autres, sans rien noter. */
  private appliquerMasquage(cles: string[], masque: boolean, estompes: string[] = []): void {
    for (const c of cles) {
      if (masque) this.masques.add(c);
      else this.masques.delete(c);
    }
    for (const c of estompes) {
      if (masque) this.estompes.add(c);
      else this.estompes.delete(c);
    }
    if (this.degagement && !masque && this.degagement.action.estompes?.some((c) => estompes.includes(c))) {
      this.masquerDegagement();
    }
    this.modeles.masquer(cles, masque);
    if (masque && this.selection && cles.some((c) => this.selection!.cles.has(c))) {
      this.selection = null;
      this.isole = false;
      $("fiche").hidden = true;
      this.focus.majZone();
    }
    this.appliquerEtats();
    this.majFil();
    this.legendes.invalider();
    this.majMasquage();
  }

  /** Ctrl Z : défait le dernier masquage (la structure revient, sélectionnée) ou le dernier « tout réafficher ». */
  annulerMasquage(): void {
    const action = this.aAnnuler.pop();
    if (!action) {
      this.etat("Rien à annuler : aucun masquage récent.", "H masque la structure sélectionnée.");
      return;
    }
    this.aRetablir.push(action);
    const encore = this.aAnnuler.length ? ` ${touche("Ctrl")} Z encore pour remonter plus loin.` : "";
    if (action.masque && !action.cles.length) {
      // Dégagement : les structures estompées reprennent leur aspect, la sélection reste
      this.appliquerMasquage([], false, action.estompes);
      this.etat(`Dégagement annulé : ${action.estompes?.length ?? 0} structures remises.${encore}`,
        `${touche("Ctrl")} Y pour les estomper de nouveau.`);
    } else if (action.masque) {
      this.appliquerMasquage(action.cles, false, action.estompes);
      const s = action.selection;
      if (s?.noeud) this.selectionnerNoeud(s.noeud);
      else if (s?.structure) this.selectionnerStructure(s.structure, s.cote, false);
      this.etat(`Masquage annulé : ${action.libelle} de nouveau affiché.${encore}`,
        `${touche("Ctrl")} Y pour la masquer de nouveau.`);
    } else {
      this.appliquerMasquage(action.cles, true, action.estompes);
      this.etat(`Réaffichage annulé : ${action.libelle} de nouveau.${encore}`,
        `${touche("Ctrl")} Y pour tout réafficher.`);
    }
  }

  /** Ctrl Y (ou Ctrl Maj Z) : refait ce que Ctrl Z vient de défaire. */
  retablirMasquage(): void {
    const action = this.aRetablir.pop();
    if (!action) {
      this.etat("Rien à rétablir.", `${touche("Ctrl")} Z annule le dernier masquage.`);
      return;
    }
    this.aAnnuler.push(action);
    this.appliquerMasquage(action.cles, action.masque, action.estompes);
    this.etat(action.masque ? `${action.cles.length ? "Masqué" : "Estompé"} de nouveau : ${action.libelle}.`
      : "Toutes les structures sont de nouveau réaffichées.", `${touche("Ctrl")} Z pour annuler.`);
  }

  /** Masquages encore en vigueur, du plus récent au plus ancien : ce que la liste du dock propose de remettre. */
  private masquagesActifs(): { action: ActionMasquage; cles: string[]; estompes: string[] }[] {
    const res: { action: ActionMasquage; cles: string[]; estompes: string[] }[] = [];
    const vus = new Set<string>();
    for (const a of [...this.aAnnuler].reverse()) {
      if (!a.masque) continue;
      const cles = a.cles.filter((c) => this.masques.has(c) && !vus.has(c));
      const estompes = (a.estompes ?? []).filter((c) => this.estompes.has(c) && !vus.has(c));
      for (const c of [...cles, ...estompes]) vus.add(c);
      if (cles.length || estompes.length) res.push({ action: a, cles, estompes });
    }
    return res;
  }

  /** Dock : compte des masquages, boutons Annuler et Rétablir, liste des structures à remettre. */
  private majMasquage(): void {
    const actifs = this.masquagesActifs();
    const groupe = $("dock-masquage");
    const avant = groupe.hidden;
    groupe.hidden = !actifs.length && !this.aAnnuler.length && !this.aRetablir.length;
    if (groupe.hidden !== avant) requestAnimationFrame(() => this.majZoneUtile());
    $("masquage-compte").textContent = actifs.length ? String(actifs.length) : "";
    $<HTMLButtonElement>("masquage-annuler").disabled = !this.aAnnuler.length;
    $<HTMLButtonElement>("masquage-retablir").disabled = !this.aRetablir.length;
    $<HTMLButtonElement>("masquage-tout").disabled = !this.masques.size && !this.estompes.size;
    $<HTMLButtonElement>("masquage-liste-bouton").disabled = !actifs.length;
    if (!actifs.length) this.fermerListeMasquage();
    else if (!$("masquage-liste").hidden) this.afficherListeMasquage();
  }

  private afficherListeMasquage(): void {
    const actifs = this.masquagesActifs();
    const liste = $("masquage-liste");
    liste.innerHTML = `<span class="etiquette">Masqué ou estompé</span><ul>${actifs.map((x, i) => `<li>
        <span class="nom">${echapper(x.action.libelle)}</span>
        <span class="meta">${x.cles.length ? "masqué" : `${x.estompes.length} estompée${x.estompes.length > 1 ? "s" : ""}`}</span>
        <button data-remettre="${i}">Remettre</button></li>`).join("")}</ul>`;
    liste.hidden = false;
    $("masquage-liste-bouton").setAttribute("aria-expanded", "true");
    // Au-dessus du bouton qui l'ouvre, sans sortir de l'écran
    const r = $("masquage-liste-bouton").getBoundingClientRect();
    liste.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - liste.offsetWidth - 12))}px`;
    liste.style.bottom = `${window.innerHeight - r.top + 8}px`;
  }

  private fermerListeMasquage(): void {
    $("masquage-liste").hidden = true;
    $("masquage-liste-bouton").setAttribute("aria-expanded", "false");
  }

  /** Remet une entrée de la liste (pas forcément la dernière) ; Ctrl Z la masque de nouveau. */
  private remettre(i: number): void {
    const x = this.masquagesActifs()[i];
    if (!x) return;
    this.noterMasquage({ masque: false, cles: x.cles, estompes: x.estompes, libelle: x.action.libelle, selection: null });
    this.appliquerMasquage(x.cles, false, x.estompes);
    this.etat(`Remis : ${x.action.libelle}.`, `${touche("Ctrl")} Z pour la masquer de nouveau.`);
  }

  // ------------------------------------------------------------ dégagement de la vue

  /**
   * Structure enfouie : tourne la vue vers le côté où elle est le moins cachée et, s'il reste des structures
   * devant elle, les estompe (annulable par Ctrl Z, ou Couper plutôt, ou Masquer plutôt).
   * auto : après une recherche, rien n'est dit si la vue est déjà dégagée.
   */
  async degager(auto: boolean): Promise<void> {
    const sel = this.selection;
    if (!sel?.cles.size || this.titreSeance || this.interrogation.active) {
      if (!auto) this.etat("Rien à dégager : aucune structure sélectionnée.", "Clique d'abord sur une structure, ou cherche-la (Ctrl K).");
      return;
    }
    const cibles = sel.structure && !sel.noeud ? this.clesPropres(sel.structure, sel.cote) : new Set([sel.noeud!]);
    // Calques à charger d'abord (muscle cherché alors que le calque était masqué) ; une image de plus, pour
    // passer après le cadrage de la sélection
    const calques = new Set([...cibles].map((c) => this.atlas.noeuds[c]?.calque).filter((c): c is string => !!c && c !== "os"));
    await Promise.all([...calques].map((c) => this.modeles.charger(c, (p) => this.suivre(p)).catch(() => undefined)));
    await new Promise((r) => requestAnimationFrame(r));
    if (this.selection !== sel) return;
    const cam = this.scene.etatCamera();
    const actuelle = new THREE.Vector3(...cam.position).sub(new THREE.Vector3(...cam.cible)).normalize();
    const d = chercherVue(this.scene, this.modeles, cibles, sel.cles, actuelle);
    const nom = this.nomAffiche();
    const boite = this.modeles.boite(cibles);
    if (!d) {
      if (!auto) this.etat(`${nom} : pas de surface affichée à dégager.`, "Vérifie le calque et la coupe.");
      return;
    }
    if (d.partActuelle <= PART_ACCEPTABLE) {
      if (!auto) this.etat(`${nom} : rien ne la cache dans cette vue.`, "H masque la sélection, I l'isole.");
      return;
    }
    // 3 cm de contexte autour de la cible : un tronc de 2 cm ne doit pas remplir l'écran
    this.scene.cadrer(boite.clone().expandByScalar(0.03), d.direction);
    const estompes = d.occultants.filter((c) => !this.estompes.has(c));
    if (d.partCachee <= PART_ACCEPTABLE || !estompes.length) {
      this.etat(`Vue tournée vers ${nom} : elle y est visible.`, "Alt flèche gauche pour revenir à la vue précédente.");
      return;
    }
    const action: ActionMasquage = { masque: true, cles: [], estompes, libelle: `devant ${nom}`, selection: null };
    this.noterMasquage(action);
    this.appliquerMasquage([], true, estompes);
    this.degagement = { action, boite, direction: d.direction, nom };
    const noms = [...new Set(estompes.slice(0, 3).map((c) => this.nomNoeud(c)))];
    $("degagement-texte").innerHTML = `<strong>Vue dégagée sur ${echapper(nom)}.</strong> ${estompes.length} structure${estompes.length > 1 ? "s" : ""}
      estompée${estompes.length > 1 ? "s" : ""} devant elle : ${echapper(noms.join(", "))}${estompes.length > noms.length ? "..." : ""}`;
    $("degagement").hidden = false;
    this.etat(`Vue dégagée sur ${nom} : ${estompes.length} structures estompées devant elle.`,
      `${touche("Ctrl")} Z ou Remettre pour les rendre, Couper plutôt pour une coupe juste devant.`);
  }

  private nomNoeud(cle: string): string {
    const n = this.atlas.noeuds[cle];
    return n ? (n.propre && n.structure ? this.atlas.structures[n.structure].nom : n.nom) : cle;
  }

  private masquerDegagement(): void {
    this.degagement = null;
    $("degagement").hidden = true;
  }

  /** Bouton du message de dégagement : remettre, couper juste devant ou masquer pour de bon. */
  private suiteDegagement(choix: "remettre" | "couper" | "masquer"): void {
    const d = this.degagement;
    if (!d) return;
    const estompes = (d.action.estompes ?? []).filter((c) => this.estompes.has(c));
    this.masquerDegagement();
    if (this.aAnnuler[this.aAnnuler.length - 1] === d.action) this.aAnnuler.pop();
    else this.noterMasquage({ masque: false, cles: [], estompes, libelle: d.action.libelle, selection: null });
    this.appliquerMasquage([], false, estompes);
    if (choix === "remettre") {
      this.etat(`Structures remises devant ${d.nom}.`, "X pour dégager de nouveau.");
    } else if (choix === "couper") {
      // La direction qui dégage le mieux en estompant n'est pas toujours celle qui dégage le mieux en coupant
      const sel = this.selection;
      const cibles = sel?.structure && !sel.noeud ? this.clesPropres(sel.structure, sel.cote) : new Set(sel?.noeud ? [sel.noeud] : []);
      const dir = sel ? chercherCoupe(this.scene, this.modeles, cibles, sel.cles, d.boite) : null;
      this.focus.couperDevant(d.boite, dir ?? d.direction);
      this.etat(`Coupe juste devant ${d.nom} : on voit ce qui est derrière le plan.`,
        "Curseur pour déplacer le plan, Inverser pour l'autre moitié, C pour une autre coupe, Échap pour la retirer.");
    } else {
      this.noterMasquage({ masque: true, cles: estompes, libelle: `structures devant ${d.nom}`, selection: null });
      this.appliquerMasquage(estompes, true);
      this.etat(`${estompes.length} structures masquées devant ${d.nom}.`, `${touche("Ctrl")} Z pour les remettre.`);
    }
  }

  private appliquerEtats(): void {
    const sel = this.selection?.cles;
    for (const [cle, m] of this.modeles.maillages) {
      const couleur = this.coloration?.get(cle);
      if (couleur && !sel?.has(cle) && this.survol !== m) {
        this.modeles.colorer(m, couleur);
        continue;
      }
      let etat: "normal" | "survol" | "selection" | "attenue" = "normal";
      if (sel?.has(cle)) etat = "selection";
      else if (this.estompes.has(cle)) etat = "attenue";
      else if (this.isole && sel && CALQUES_ATTENUABLES.has(m.userData.calque)) etat = "attenue";
      else if (this.survol === m || this.survolLegende?.has(cle)) etat = "survol";
      if (this.modeles.etat(m) !== etat) this.modeles.definirEtat(m, etat);
    }
    this.legendes?.definirSelection(sel ?? null, this.selection?.repereId ?? null);
    this.scene.demanderRendu();
  }

  // ------------------------------------------------------------ navigation : historique et fil d'Ariane

  private etapeCourante(): EtapeNavigation {
    const f = this.focus.actif;
    const s = this.selection;
    const libelle = s ? this.nomAffiche() : f ? f.nom : "Corps entier";
    return {
      focus: f ? { type: f.type, id: f.id } : null,
      selection: s ? { structure: s.structure, noeud: s.noeud, cote: s.cote } : null,
      camera: this.scene.etatCamera(), libelle,
    };
  }

  /** Avant un changement de focus ou de sélection : on retient le point de vue qu'on quitte. */
  private avantNavigation(): void {
    if (this.pret) this.historique.majCamera(this.scene.etatCamera());
  }

  private apresNavigation(): void {
    if (!this.pret) return;
    this.memoriser();
    this.majFil();
  }

  private memoriser(): void {
    this.historique.enregistrer(this.etapeCourante());
    $<HTMLButtonElement>("nav-precedent").disabled = !this.historique.peutReculer;
    $<HTMLButtonElement>("nav-suivant").disabled = !this.historique.peutAvancer;
  }

  async reculer(): Promise<void> {
    this.historique.majCamera(this.scene.etatCamera());
    const e = this.historique.reculer();
    if (!e) {
      this.etat("Début de l'historique : rien avant.", "Les étapes s'enregistrent à chaque sélection et à chaque focus.");
      return;
    }
    await this.restaurer(e);
    this.etat(`Retour : ${e.libelle}.`, `${touche("Alt")} flèche droite pour revenir en avant.`);
  }

  async avancer(): Promise<void> {
    this.historique.majCamera(this.scene.etatCamera());
    const e = this.historique.avancer();
    if (!e) {
      this.etat("Fin de l'historique : rien après.", `${touche("Alt")} flèche gauche pour revenir en arrière.`);
      return;
    }
    await this.restaurer(e);
    this.etat(`Avance : ${e.libelle}.`, `${touche("Alt")} flèche gauche pour revenir en arrière.`);
  }

  private async restaurer(e: EtapeNavigation): Promise<void> {
    if (this.fiches.edition) {
      this.correctionEnCours();
      return;
    }
    this.historique.restauration = true;
    try {
      const f = this.focus.actif;
      const meme = f && e.focus ? f.type === e.focus.type && f.id === e.focus.id : !f && !e.focus;
      if (!meme) {
        this.fermerSelection();
        if (!e.focus) this.focus.quitter(false);
        else if (e.focus.type === "region") await this.focus.entrerRegion(e.focus.id);
        else await this.focus.entrerOrgane(e.focus.id);
      }
      if (e.selection?.noeud) this.selectionnerNoeud(e.selection.noeud);
      else if (e.selection?.structure) this.selectionnerStructure(e.selection.structure, e.selection.cote, false);
      else this.fermerSelection();
      this.scene.restaurerCamera(e.camera);
    } finally {
      this.historique.restauration = false;
      $<HTMLButtonElement>("nav-precedent").disabled = !this.historique.peutReculer;
      $<HTMLButtonElement>("nav-suivant").disabled = !this.historique.peutAvancer;
      this.majFil();
    }
  }

  /** Fil d'Ariane : corps entier, focus, structure, branche ou partie. Chaque étape est cliquable. */
  private majFil(): void {
    const etapes: { nom: string; titre: string; action?: () => void }[] = [];
    if (this.titreSeance) {
      $("fil-ariane").innerHTML = `<li><span>Apprendre</span></li><li><span aria-current="location">${echapper(this.titreSeance)}</span></li>`;
      return;
    }
    const f = this.focus?.actif;
    const s = this.selection;
    etapes.push({
      nom: "Corps entier", titre: "Quitter le focus et revenir au corps entier",
      action: () => {
        this.fermerSelection();
        if (this.focus.actif) this.focus.quitter();
        else this.cadrer();
      },
    });
    if (f) {
      etapes.push({
        nom: f.nom, titre: `${f.type === "region" ? "Région" : "Organe"} : recadrer`,
        action: () => {
          this.avantNavigation();
          this.fermerSelection();
          this.focus.recadrer();
          this.apresNavigation();
        },
      });
    }
    if (s) {
      const n = s.noeud ? this.atlas.noeuds[s.noeud] : null;
      const st = s.structure ? this.atlas.structures[s.structure] : null;
      const cote = st?.cote === "bilatéral" && s.cote ? `, ${libelleCote(s.cote)}` : "";
      if (st) {
        etapes.push({
          nom: st.nom + cote, titre: "Sélectionner la structure entière",
          action: () => this.selectionnerStructure(s.structure!, st.cote === "bilatéral" ? s.cote : null),
        });
      }
      if (n && !(n.propre && n.structure)) etapes.push({ nom: n.nom, titre: n.nom });
      if (s.repere) etapes.push({ nom: s.repere, titre: "Repère légendé" });
    }
    const ol = $("fil-ariane");
    ol.innerHTML = "";
    etapes.forEach((e, i) => {
      const li = document.createElement("li");
      const dernier = i === etapes.length - 1;
      if (dernier || !e.action) {
        const span = document.createElement("span");
        span.textContent = e.nom;
        span.title = e.titre;
        if (dernier) span.setAttribute("aria-current", "location");
        li.appendChild(span);
      } else {
        const b = document.createElement("button");
        b.textContent = e.nom;
        b.title = e.titre;
        b.addEventListener("click", e.action);
        li.appendChild(b);
      }
      ol.appendChild(li);
    });
  }

  // ------------------------------------------------------------ fiche

  private aDesPropres(id: string): boolean {
    return this.atlas.structures[id].noeuds.some((c) => this.atlas.noeuds[c]?.structure === id && this.atlas.noeuds[c]?.propre);
  }

  private nomAffiche(): string {
    const sel = this.selection!;
    const n = sel.noeud ? this.atlas.noeuds[sel.noeud] : null;
    if (n && !(n.propre && n.structure)) return n.nom;
    return this.atlas.structures[sel.structure!].nom;
  }

  private afficherFiche(): void {
    const sel = this.selection!;
    const n: Noeud | null = sel.noeud ? this.atlas.noeuds[sel.noeud] : null;
    const s: Structure | null = sel.structure ? this.atlas.structures[sel.structure] : null;
    const branche = !!(n && s && !n.propre);
    const lien = n?.lien ?? "branche";
    const fiche = $("fiche");
    fiche.hidden = false;
    $("zone").hidden = true;
    fiche.dataset.structure = sel.structure ?? "";
    fiche.dataset.noeud = sel.noeud ?? "";

    const systeme = s ? libelleSysteme(s.systeme) : NOMS_CALQUES[n!.calque] ?? n!.calque;
    $("fiche-surtitre").textContent = [systeme, s?.region, branche ? lien : s?.niveau].filter(Boolean).join(" · ");
    $("fiche-nom").textContent = this.nomAffiche();
    $("fiche-cote").textContent = libelleCote(sel.cote);

    const parent = $("fiche-parent");
    parent.hidden = !branche;
    if (branche) {
      // « Fait partie de » seulement si le parent direct est la structure ; sinon l'arbre (artère) ou le drainage (veine)
      $("fiche-parent-texte").textContent = n!.calque === "veines" ? "Se draine par"
        : lien === "partie" && n!.parent === s!.nom ? "Fait partie de" : "Fait partie de l'arbre de";
      $("fiche-parent-lien").textContent = s!.nom;
    }

    const lignes: [string, string, boolean?][] = [];
    if (sel.repere) lignes.push(["Repère", sel.repere]);
    if (sel.repereNote) lignes.push(["Remarque", sel.repereNote]);
    if (s && !branche && s.synonymes.length) lignes.push(["Synonymes", s.synonymes.join(", ")]);
    if (n && n.source_nom !== "liste noyau") {
      lignes.push(["Nom", n.source_nom === "anglais FMA" ? "terme anglais de la FMA, pas de traduction disponible"
        : `${n.source_nom}, non vérifié`, true]);
    }
    if (n?.parent && !(n.propre && n.lien === "partie" && n.parent === s?.nom)) lignes.push([LIENS[n.lien ?? "branche"], n.parent]);
    if (n?.remarque_arbre) lignes.push(["Arbre vasculaire", n.remarque_arbre]);
    if (n?.correction) lignes.push(["Étiquette corrigée", `BodyParts3D l'appelle « ${n.etiquette_bp3d} » : ${n.correction}`, true]);
    if (n) {
      const ecart = n.ecart_origine_mm ? ` ; raccord à l'origine : ${n.ecart_origine_mm} mm` : "";
      lignes.push(["Modèle 3D", n.source + ecart]);
    } else if (s) {
      lignes.push(["Modèle 3D", s.noeuds.length ? `${sel.cles.size} segment${sel.cles.size > 1 ? "s" : ""}` : `aucun ; ${s.couverture}`, !s.noeuds.length]);
    }
    const fma = (n && !n.propre ? n.fma_id : s?.fma_id) || n?.fma_id;
    if (fma) lignes.push(["FMA", fma]);
    if (n) lignes.push(["Terme anglais", n.nom_en]);
    if (s && branche) lignes.push(["Structure", `${s.nom} (${s.niveau})`]);
    const organe = sel.noeud ? this.organeDe.get(sel.noeud) : undefined;
    if (organe) lignes.push(["Organe", organe]);

    $("fiche-details").innerHTML = lignes.map(([dt, dd, alerte]) =>
      `<dt>${dt}</dt><dd${alerte ? ' class="avertissement"' : ""}>${echapper(dd)}</dd>`).join("");
    document.querySelector('[data-action="isoler"]')!.classList.toggle("actif", this.isole);
    // Fiche de la structure ; pour une branche hors liste noyau, un lien vers la fiche de la structure qui la contient
    this.fiches.afficher(sel.structure, branche ? s!.nom : undefined);
  }

  // ------------------------------------------------------------ recherche

  private chercher(texte: string): void {
    const q = normaliser(texte);
    const liste = $("resultats");
    if (!q) {
      liste.hidden = true;
      return;
    }
    const mots = q.split(" ");
    const res: Resultat[] = [];
    const noter = (nom: string) => {
      const n = normaliser(nom);
      if (!mots.every((m) => n.includes(m))) return 0;
      return (n.startsWith(q) ? 3 : 0) + (n.split(" ").some((m) => m.startsWith(mots[0])) ? 1 : 0) + 1 / (1 + n.length / 40);
    };
    for (const [id, s] of Object.entries(this.atlas.structures)) {
      const scores = [s.nom, ...s.synonymes].map((x) => [noter(x), x] as const);
      const [score, trouve] = scores.reduce((a, b) => (b[0] > a[0] ? b : a));
      if (score > 0) {
        res.push({
          type: "structure", id, nom: s.nom, score: score + 2,
          sousTitre: `${libelleSysteme(s.systeme)} · ${s.region}${s.noeuds.length ? "" : " · schéma 2D"}`,
          synonyme: trouve !== s.nom ? trouve : undefined,
        });
      }
    }
    const vus = new Set(res.map((r) => normaliser(r.nom)));
    for (const [cle, n] of Object.entries(this.atlas.noeuds)) {
      if ((n.propre && n.structure) || n.doublon) continue;
      const k = normaliser(n.nom);
      if (vus.has(k)) continue;
      // Le terme anglais compte aussi : un étudiant peut chercher « hilum » ou « kidney »
      const score = Math.max(noter(n.nom), noter(n.nom_en) * 0.8);
      if (score > 0) {
        vus.add(k);
        const organe = this.organeDe.get(cle);
        res.push({ type: "noeud", id: cle, nom: n.nom, score,
          sousTitre: organe ? `Partie · ${organe}` : NOMS_CALQUES[n.calque] ?? n.calque });
      }
    }
    // Ex aequo : ordre de la liste noyau (artères avant veines), puis structures avant branches
    for (const f of this.focus.chercher(mots, normaliser)) {
      res.push({ ...f, score: noter(f.nom) + 2.5 });
    }
    res.sort((a, b) => b.score - a.score || (a.type === b.type ? a.id.localeCompare(b.id) : a.type === "structure" ? -1 : 1));
    this.resultats = res.slice(0, 10);
    this.indexResultat = 0;
    liste.hidden = false;
    if (!this.resultats.length) {
      liste.innerHTML = `<li class="vide">Aucune structure ne correspond à « ${echapper(texte)} ». Essaie un autre nom, l'ancien nom (sous-clavière, péronière...) ou le terme anglais.</li>`;
      return;
    }
    this.afficherResultats();
  }

  private afficherResultats(): void {
    $("resultats").innerHTML = this.resultats.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === this.indexResultat}">
        <span class="nom">${echapper(r.nom)}</span><span class="meta">${echapper(r.sousTitre)}</span>
        ${r.synonyme ? `<span class="synonyme">aussi : ${echapper(r.synonyme)}</span>` : ""}</li>`).join("");
  }

  private choisirResultat(i: number): void {
    const r = this.resultats[i];
    if (!r) return;
    const champ = $<HTMLInputElement>("champ-recherche");
    champ.value = "";
    champ.blur();
    $("resultats").hidden = true;
    if (r.type === "region") {
      this.fermerSelection();
      this.focus.entrerRegion(r.id);
    } else if (r.type === "organe") {
      this.fermerSelection();
      this.focus.entrerOrgane(r.id);
    } else if (r.type === "structure") {
      this.selectionnerStructure(r.id);
      void this.degager(true);
    } else {
      this.selectionnerNoeud(r.id, true);
      void this.degager(true);
    }
  }

  // ------------------------------------------------------------ réglages et aide

  private appliquerReglages(): void {
    const legendes = reglages.lire("legendes") as ModeLegendes | null;
    this.definirModeLegendes(legendes && MODES_LEGENDES.includes(legendes) ? legendes : "noms", false);
    const nav = reglages.lire("navigation") as ModeNavigation | null;
    // Sur Mac, le pavé tactile est le cas courant : deux doigts pour tourner, pincer pour zoomer
    this.scene.modeNavigation = nav === "souris" || nav === "pave" ? nav : SUR_MAC ? "pave" : "souris";
    $("raccourci-recherche").textContent = `${touche("Ctrl")} K`;
    for (const k of document.querySelectorAll<HTMLElement>(".touche-echap")) k.textContent = touche("Échap");
    for (const k of document.querySelectorAll<HTMLElement>(".touche-annuler")) k.textContent = `${touche("Ctrl")} Z`;
    for (const k of document.querySelectorAll<HTMLElement>(".touche-retablir")) k.textContent = `${touche("Ctrl")} Y`;
  }

  private construireAide(): void {
    const t = touche;
    const groupes: [string, [string, string][]][] = [
      ["Se déplacer", [
        ["Glisser", "tourner autour du point visé"],
        ["Molette, pincement", "zoomer vers le pointeur"],
        ["Clic droit glissé, ou Maj glissé", "déplacer la vue"],
        ["F, D, flèches", "vues de face, de dos, de profil, de dessus et de dessous"],
        ["Z", "cadrer la sélection, le focus, ou le corps entier"],
        ["Double-clic", "cadrer la structure sous le pointeur"],
        ["Repère S I A P D G", "clic sur une lettre : regarder de ce côté"],
      ]],
      ["Naviguer", [
        [`${t("Ctrl")} K ou /`, "rechercher une structure, une région, un organe"],
        ["G", "aller à une région ou un organe (focus)"],
        [SUR_MAC ? "⌘ [ et ⌘ ]" : "Alt ← et Alt →", "étape précédente et suivante (aussi les boutons de la souris)"],
        ["Fil d'Ariane", "clic sur une étape pour y remonter"],
        [t("Échap"), "défaire la dernière couche : sélection, masquages, focus, coupe"],
      ]],
      ["Voir et sélectionner", [
        ["Clic", "sélectionner ; encore au même endroit : la structure de dessous"],
        ["A, V, O, M, J, Y, R", "calques artères, veines, os, muscles, nerfs, lymphatique, organes"],
        ["Choisir", "sous un calque : cocher les familles et les organes à afficher (la peau à part)"],
        ["N", "légendes : noms, numéros (planche muette), aucune"],
        ["T", "s'interroger sur les légendes visibles du focus : un nom, cliquer son numéro"],
        ["I, H", "isoler la sélection, la masquer"],
        ["X", "dégager la sélection : tourner la vue vers elle, estomper ce qui la cache"],
        [`${t("Ctrl")} Z, ${t("Ctrl")} Y`, "annuler le dernier masquage ou dégagement, le refaire (aussi le dock : Annuler, Liste)"],
        ["C", "coupe frontale, sagittale, horizontale"],
      ]],
      ["Fiches", [
        ["L", "liste des fiches à vérifier"],
        ["E", "corriger la fiche affichée"],
      ]],
    ];
    let html = `<div class="aide-colonnes">`;
    for (const [titre, lignes] of groupes) {
      html += `<section><h3 class="etiquette">${titre}</h3><dl>`;
      html += lignes.map(([k, v]) => `<dt>${echapper(k)}</dt><dd>${echapper(v)}</dd>`).join("");
      html += "</dl></section>";
    }
    html += `</div><section class="aide-reglages"><h3 class="etiquette">Réglages</h3>
      <div class="reglage"><span>Défilement à deux doigts</span>
        <div class="segments" role="radiogroup" aria-label="Navigation">
          <button data-navigation="souris" role="radio">Zoom (souris)</button>
          <button data-navigation="pave" role="radio">Rotation (pavé tactile)</button>
        </div></div>
      <p class="aide">Avec un pavé tactile, choisir Rotation : deux doigts tournent la vue, pincer zoome, Maj et deux doigts déplacent.
        Avec une souris, choisir Zoom : la molette zoome.</p>
      <button id="revoir-accueil" class="lien">Revoir le premier lancement guidé</button></section>`;
    $("aide-contenu").innerHTML = html;
    const majNav = () => {
      for (const b of document.querySelectorAll<HTMLButtonElement>("[data-navigation]")) {
        b.setAttribute("aria-checked", String(b.dataset.navigation === this.scene.modeNavigation));
      }
    };
    majNav();
    $("aide-contenu").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      if (b.dataset.navigation) {
        this.scene.modeNavigation = b.dataset.navigation as ModeNavigation;
        reglages.ecrire("navigation", this.scene.modeNavigation);
        majNav();
        this.etat(this.scene.modeNavigation === "pave" ? "Pavé tactile : deux doigts tournent la vue, pincer zoome."
          : "Souris : la molette zoome.", "Réglage gardé pour les prochaines sessions.");
      } else if (b.id === "revoir-accueil") {
        this.fermerAide();
        this.accueil.ouvrir();
      }
    });
  }

  private get aideOuverte(): boolean {
    return !$("aide").hidden;
  }

  private basculerAide(): void {
    if (this.aideOuverte) this.fermerAide();
    else {
      $("aide").hidden = false;
      this.etat("Raccourcis et réglages.", `${touche("Échap")} ou ? pour fermer.`);
    }
  }

  private fermerAide(): void {
    $("aide").hidden = true;
  }

  // ------------------------------------------------------------ événements

  private brancherEvenements(): void {
    const canevas = this.scene.renderer.domElement;
    let depart: { x: number; y: number } | null = null;
    let attente = false;
    canevas.addEventListener("pointerdown", (e) => { depart = { x: e.clientX, y: e.clientY }; });
    canevas.addEventListener("pointerup", (e) => {
      if (e.button !== 0 || !depart || Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 5) return;
      depart = null;
      this.cliquer(e.clientX, e.clientY);
    });
    canevas.addEventListener("dblclick", (e) => this.doubleClic(e.clientX, e.clientY));
    canevas.addEventListener("pointermove", (e) => {
      if (e.buttons || attente || !this.pret) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; this.survoler(e.clientX, e.clientY); });
    });
    canevas.addEventListener("pointerleave", () => this.survoler(-1, -1));
    // Infobulle masquée dès que la vue bouge : elle désignerait autre chose
    this.scene.controles.addEventListener("start", () => { $("infobulle").hidden = true; });
    // Boutons « précédent » et « suivant » des souris
    window.addEventListener("mouseup", (e) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        if (e.button === 3) this.reculer();
        else this.avancer();
      }
    });

    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-vue]")) {
      b.addEventListener("click", () => this.vue(b.dataset.vue as Vue));
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      b.addEventListener("click", () => this.definirModeOs(b.dataset.mode as ModeOs));
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-legendes]")) {
      b.addEventListener("click", () => this.definirModeLegendes(b.dataset.legendes as ModeLegendes));
    }
    const actions: Record<string, () => void> = {
      cadrer: () => this.cadrer(), isoler: () => this.isoler(), masquer: () => this.masquer(),
      deselectionner: () => this.deselectionner(), degager: () => void this.degager(false),
    };
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
      b.addEventListener("click", () => actions[b.dataset.action!]());
    }
    $("fiche-parent-lien").addEventListener("click", () => {
      const sel = this.selection;
      if (sel?.structure) this.selectionnerStructure(sel.structure, this.atlas.structures[sel.structure].cote === "bilatéral" ? sel.cote : null);
    });
    $("masquage-annuler").addEventListener("click", () => this.annulerMasquage());
    $("masquage-retablir").addEventListener("click", () => this.retablirMasquage());
    $("masquage-tout").addEventListener("click", () => {
      if (this.selection) this.fermerSelection();
      this.deselectionner();
    });
    $("masquage-liste-bouton").addEventListener("click", () => {
      if ($("masquage-liste").hidden) this.afficherListeMasquage();
      else this.fermerListeMasquage();
    });
    $("masquage-liste").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-remettre]");
      if (b) this.remettre(Number(b.dataset.remettre));
    });
    $("degagement-remettre").addEventListener("click", () => this.suiteDegagement("remettre"));
    $("degagement-couper").addEventListener("click", () => this.suiteDegagement("couper"));
    $("degagement-masquer").addEventListener("click", () => this.suiteDegagement("masquer"));
    $("degagement-fermer").addEventListener("click", () => this.masquerDegagement());
    $("nav-precedent").addEventListener("click", () => this.reculer());
    $("nav-suivant").addEventListener("click", () => this.avancer());
    $("ouvrir-aide").addEventListener("click", () => this.basculerAide());
    $("aide-fermer").addEventListener("click", () => this.fermerAide());
    $("aide").addEventListener("click", (e) => { if (e.target === $("aide")) this.fermerAide(); });
    $("catalogue").addEventListener("click", (e) => { if (e.target === $("catalogue")) this.focus.fermerCatalogue(); });
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode-app]")) {
      b.addEventListener("click", () => this.changerMode(b.dataset.modeApp!));
    }

    const champ = $<HTMLInputElement>("champ-recherche");
    champ.addEventListener("input", () => this.chercher(champ.value));
    champ.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = this.resultats.length;
        if (!n) return;
        this.indexResultat = (this.indexResultat + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
        this.afficherResultats();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.choisirResultat(this.indexResultat);
      } else if (e.key === "Escape") {
        champ.value = "";
        $("resultats").hidden = true;
        champ.blur();
      }
    });
    $("resultats").addEventListener("click", (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>("li[data-i]");
      if (li) this.choisirResultat(Number(li.dataset.i));
    });
    champ.addEventListener("blur", () => setTimeout(() => { $("resultats").hidden = true; }, 150));

    window.addEventListener("keydown", (e) => this.touche(e));
  }

  private touche(e: KeyboardEvent): void {
    if (!this.pret) return;
    const cmd = SUR_MAC ? e.metaKey : e.ctrlKey;
    // Raccourcis à modificateur, valables même depuis un champ de saisie
    if (cmd && (e.key === "k" || e.key === "K" || e.key === "f" || e.key === "F")) {
      e.preventDefault();
      if (this.focus.catalogueOuvert) this.focus.fermerCatalogue();
      $<HTMLInputElement>("champ-recherche").focus();
      $<HTMLInputElement>("champ-recherche").select();
      return;
    }
    const balise = (e.target as HTMLElement).tagName;
    const saisie = balise === "TEXTAREA" || (balise === "INPUT" && (e.target as HTMLInputElement).type !== "range");
    // Ctrl Z et Ctrl Y : masquages ; dans un champ, le navigateur garde son annulation de frappe
    const lettre = e.key.toLowerCase();
    if (cmd && !e.altKey && !saisie && (lettre === "z" || lettre === "y") && !this.titreSeance) {
      e.preventDefault();
      if (lettre === "y" || e.shiftKey) this.retablirMasquage();
      else this.annulerMasquage();
      return;
    }
    if (!saisie && ((e.altKey && e.key === "ArrowLeft") || (SUR_MAC && e.metaKey && e.key === "["))) {
      e.preventDefault();
      this.reculer();
      return;
    }
    if (!saisie && ((e.altKey && e.key === "ArrowRight") || (SUR_MAC && e.metaKey && e.key === "]"))) {
      e.preventDefault();
      this.avancer();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && this.aideOuverte) {
      e.preventDefault();
      this.fermerAide();
      return;
    }
    if (e.key === "Escape" && !$("masquage-liste").hidden) {
      e.preventDefault();
      this.fermerListeMasquage();
      return;
    }
    if (e.key === "Escape" && this.choix.ouvert) {
      e.preventDefault();
      this.choix.fermer();
      $<HTMLInputElement>("choix-filtre").blur();
      return;
    }
    // Apprentissage : premier lancement, séance, parcours et tableau de bord prennent les touches en premier
    if (this.accueil.touche(e) || this.seance.touche(e) || this.lecteur.touche(e)) return;
    if (this.tableau.ouvert) {
      if (e.key === "Escape" || e.key.toLowerCase() === "b") {
        e.preventDefault();
        this.tableau.fermer();
      } else if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        this.tableau.fermer();
        this.changerMode("reviser");
      }
      return;
    }
    if (e.key === "Escape" && this.fiches.listeOuverte) {
      e.preventDefault();
      this.fiches.fermerListe();
      return;
    }
    if (e.key === "Escape" && this.fiches.edition) {
      e.preventDefault();
      this.fiches.annulerEdition();
      return;
    }
    if (saisie) return;
    if (this.interrogation.touche(e)) return;
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    // Catalogue ouvert : seules la fermeture et G comptent
    if (this.focus.catalogueOuvert) {
      if (k === "Escape" || k === "G") {
        e.preventDefault();
        this.focus.fermerCatalogue();
      }
      return;
    }
    if (this.aideOuverte) {
      if (k === "?") {
        e.preventDefault();
        this.fermerAide();
      }
      return;
    }
    const calque = this.atlas.calques.find((c) => c.touche === k);
    const raccourcis: Record<string, () => void> = {
      "/": () => $("champ-recherche").focus(),
      "?": () => this.basculerAide(), F1: () => this.basculerAide(),
      F: () => this.vue("face"), D: () => this.vue("dos"),
      ArrowLeft: () => this.vue("droite"), ArrowRight: () => this.vue("gauche"),
      ArrowUp: () => this.vue("dessus"), ArrowDown: () => this.vue("dessous"),
      Z: () => this.cadrer(), I: () => this.isoler(), H: () => this.masquer(), X: () => void this.degager(false),
      G: () => this.focus.basculerCatalogue(), C: () => this.focus.cyclerCoupe(),
      N: () => this.definirModeLegendes(MODES_LEGENDES[(MODES_LEGENDES.indexOf(this.legendes.mode) + 1) % MODES_LEGENDES.length]),
      P: () => this.changerMode("parcours"), Q: () => this.changerMode("reviser"), B: () => this.changerMode("progres"),
      E: () => { if (!$("fiche").hidden) this.fiches.basculerEdition(); },
      L: () => this.fiches.basculerListe(),
      T: () => this.interrogation.basculer(),
      Escape: () => this.echap(),
    };
    const action = calque ? () => this.basculerCalque(calque.id) : raccourcis[k];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  /** Échap défait la dernière couche : sélection, puis masquages, puis focus, puis coupe. */
  private echap(): void {
    if (this.selection || this.isole || this.masques.size || this.estompes.size) this.deselectionner();
    else if (this.focus.actif) this.focus.quitter();
    else if (this.focus.coupe !== "aucune") this.focus.definirCoupe("aucune");
  }

  private cliquer(x: number, y: number): void {
    if (this.correctionEnCours()) return;
    const r = this.scene.renderer.domElement.getBoundingClientRect();
    if (this.capteur) {
      const t = this.selecteur.toucher(x - r.left, y - r.top);
      this.capteur(t ? (t.maillage.userData.cle as string) : null);
      return;
    }
    if (this.titreSeance) return;
    if (this.interrogation.active) {
      this.etat("Interrogation en cours : la réponse se donne en cliquant un numéro d'étiquette.",
        "Échap pour arrêter l'interrogation.");
      return;
    }
    const d = this.dernierClic;
    const courant = this.selection?.noeud;
    if (d && courant && Math.hypot(x - d.x, y - d.y) < 4 && d.pile.length > 1 && d.pile.includes(courant)) {
      const k = (d.pile.indexOf(courant) + 1) % d.pile.length;
      this.selectionnerNoeud(d.pile[k]);
      this.etat(`Clic répété : structure ${k + 1} sur ${d.pile.length} sous le pointeur, ${this.nomAffiche()}.`,
        "Clique encore au même endroit pour descendre plus profond, ou H pour masquer celle-ci.");
      return;
    }
    const t = this.selecteur.toucher(x - r.left, y - r.top);
    if (t) {
      const cle = t.maillage.userData.cle as string;
      const pile = this.selecteur.empilement(x - r.left, y - r.top).map((m) => m.userData.cle as string);
      this.dernierClic = { x, y, pile: [cle, ...pile.filter((c) => c !== cle)] };
      this.selectionnerNoeud(cle);
      if (this.dernierClic.pile.length > 1) {
        $("etat-ensuite").textContent = `${this.dernierClic.pile.length} structures superposées ici : clique encore au même endroit pour la suivante.`;
      }
    } else if (this.selection) {
      this.deselectionner();
      this.etat("Aucune structure sous le pointeur : sélection fermée.", "Clique sur un vaisseau, ou double-clic dans le vide pour tout cadrer.");
    } else {
      this.etat("Aucune structure sous le pointeur.", "Zoome avec la molette pour atteindre les petits vaisseaux.");
    }
  }

  /** Double-clic : cadre la structure visée (la première de l'empilement, pas celle du second clic) ; dans le vide, vue d'ensemble. */
  private doubleClic(x: number, y: number): void {
    if (this.correctionEnCours() || this.titreSeance) return;
    const d = this.dernierClic;
    if (d && Math.hypot(x - d.x, y - d.y) < 6 && d.pile.length) {
      this.selectionnerNoeud(d.pile[0], true);
      this.etat(`Double-clic : vue cadrée sur ${this.nomAffiche()}.`, "Molette pour zoomer davantage, Alt flèche gauche pour revenir.");
    } else {
      this.cadrer();
    }
  }

  private survoler(x: number, y: number): void {
    const bulle = $("infobulle");
    const r = this.scene.renderer.domElement.getBoundingClientRect();
    const t = x < 0 ? null : this.selecteur.toucher(x - r.left, y - r.top);
    const m = t?.maillage ?? null;
    document.body.classList.toggle("survol-structure", !!m);
    if (this.titreSeance || this.interrogation.active) {
      bulle.hidden = true;
      return;
    }
    if (m !== this.survol) {
      this.survol = m;
      this.appliquerEtats();
    }
    if (!m) {
      bulle.hidden = true;
      return;
    }
    const n = this.atlas.noeuds[m.userData.cle];
    const nom = n ? (n.propre && n.structure ? this.atlas.structures[n.structure].nom : n.nom) : m.userData.cle;
    bulle.innerHTML = `${echapper(nom)}${n?.cote ? ` <span class="cote">${libelleCote(n.cote)}</span>` : ""}`;
    bulle.style.left = `${x}px`;
    bulle.style.top = `${y}px`;
    bulle.hidden = false;
  }

  private vue(v: Vue): void {
    const boite = this.selection?.cles.size ? this.modeles.boite(this.selection.cles)
      : this.focus.boiteCourante() ?? this.modeles.boiteVisible();
    if (this.selection?.cles.size) this.scene.cadrer(boite, v);
    else this.scene.vue(v, boite);
    this.etat(`Vue ${NOMS_VUES[v]}.`, "Glisser pour tourner, molette pour zoomer, clic droit pour déplacer.");
  }

  private cadrer(): void {
    if (this.selection?.cles.size) {
      this.scene.cadrer(this.modeles.boite(this.selection.cles));
      this.etat("Vue cadrée sur la sélection.", "F pour revenir à la vue de face du corps entier.");
    } else if (this.focus.actif) {
      this.focus.recadrer();
      this.etat(`Vue recadrée sur ${this.focus.actif.nom.toLowerCase()}.`, `${touche("Échap")} pour quitter le focus.`);
    } else {
      this.scene.vue("face", this.modeles.boiteVisible());
      this.etat("Vue d'ensemble.", "Clique sur une structure pour la sélectionner.");
    }
  }

  // ------------------------------------------------------------ apprentissage (phase 3)

  private creerApprentissage(): void {
    const plateau: Plateau = {
      atlas: this.atlas,
      etat: (a, e, err) => this.etat(a, e, err),
      montrer: (id, cote, cadrer = true) => this.surligner([id], cote, cadrer),
      montrerPlusieurs: (ids) => this.surligner(ids, null, true),
      vueEnsemble: (structure) => {
        this.surligner([], null, false);
        // Localiser un muscle : son calque doit être affiché pour qu'on puisse le cliquer
        const cles = structure ? this.atlas.structures[structure]?.noeuds ?? [] : [];
        this.choix.montrer(cles);
        void this.montrerCalques(cles).then(() => this.scene.vue("face", this.modeles.boiteVisible()));
      },
      effacer: () => this.surligner([], null, false),
      capturerClic: (f) => { this.capteur = f; },
      infoNoeud: (cle) => {
        const n = this.atlas.noeuds[cle];
        const nom = n ? (n.propre && n.structure ? this.atlas.structures[n.structure].nom : n.nom) : cle;
        // Une branche n'est pas la structure : cliquer l'artère thoraco-acromiale ne localise pas l'axillaire.
        // Exception : structure sans segment propre (cercle artériel du cerveau), faite de ses parties.
        const structure = n?.structure && (n.propre || !this.aDesPropres(n.structure)) ? n.structure : null;
        return { structure, cote: n?.cote ?? null, nom: n && !n.propre && n.parent ? `${nom} (${LIENS[n.lien ?? "branche"].toLowerCase()} : ${n.parent})` : nom };
      },
      modeSeance: (actif, titre) => this.modeSeance(actif, titre),
    };
    this.seance = new Seance(plateau, () => this.nouvellesParJour(), () => this.majCompteurDues());
    this.lecteur = new Lecteur(plateau, this.seance, () => this.seance.fabrique,
      (etape, toutes) => this.montrerEtape(etape, toutes), () => this.majCompteurDues());
    this.tableau = new Tableau(this.atlas, () => this.lecteur.parcours, {
      etat: (a, e, err) => this.etat(a, e, err),
      colorer: (niveaux) => this.colorerMaitrise(niveaux),
      reviser: () => this.changerMode("reviser"),
      nouvellesParJour: () => this.nouvellesParJour(),
      definirNouvellesParJour: (n) => reglages.ecrire("nouvelles", String(n)),
    });
    this.accueil = new Accueil(this.atlas, () => this.lecteur.parcours[0] ?? null, () => ({
      maillages: this.modeles.maillages.size, organes: this.atlas.organes.length,
      fiches: this.fiches.bilan, cartes: this.cartesPretes,
    }), (id) => this.changerMode("parcours", id), () => reglages.ecrire("accueil", "vu"));
  }

  /** Relations, parcours et cartes : au démarrage et après chaque fiche vérifiée ou corrigée. */
  private async preparerApprentissage(): Promise<void> {
    const relations = await api.relations().catch(() => []);
    this.seance.fabrique = new FabriqueQuestions(this.atlas, relations);
    this.lecteur.parcours = construireParcours(this.atlas, relations);
    const avecModele = Object.entries(this.atlas.structures)
      .filter(([, s]) => s.niveau === "noyau" && s.noeuds.length).map(([id]) => id);
    try {
      const b = await api.synchroniser(avecModele);
      this.cartesPretes = Object.values(b.actives).reduce((x, y) => x + y, 0);
      if (b.suspendues) {
        this.etat(`${b.suspendues} carte${b.suspendues > 1 ? "s" : ""} suspendue${b.suspendues > 1 ? "s" : ""} : fiche repassée en brouillon.`,
          "Elles reviennent dès que la fiche est de nouveau vérifiée ; leur historique est gardé.");
      }
    } catch {
      this.cartesPretes = null;
    }
    await this.majCompteurDues();
  }

  private nouvellesParJour(): number {
    const n = Number(reglages.lire("nouvelles"));
    return Number.isFinite(n) && reglages.lire("nouvelles") !== null ? n : 20;
  }

  private async majCompteurDues(): Promise<void> {
    const compteur = $("compteur-dues");
    try {
      const b = await api.bilan();
      const aFaire = b.dues + Math.min(b.nouvelles, Math.max(0, this.nouvellesParJour() - b.nouvelles_aujourdhui));
      compteur.textContent = String(aFaire);
      compteur.hidden = aFaire === 0;
      compteur.title = `${b.dues} cartes dues, ${aFaire - b.dues} nouvelles à découvrir aujourd'hui`;
    } catch {
      compteur.hidden = true;
    }
  }

  /** Surligne des structures (un côté pour une structure paire) et estompe le reste, sans fiche ni nom. */
  private surligner(ids: string[], cote: Cote, cadrer: boolean): void {
    const cles = new Set<string>();
    // La structure demandée seule, sans ses branches : l'artère axillaire, pas ses vingt rameaux
    for (const id of ids) for (const c of this.clesPropres(id, this.atlas.structures[id]?.cote === "bilatéral" ? cote : null)) cles.add(c);
    this.choix.montrer(cles);
    if (this.focus.actif) this.focus.quitter(false);
    this.selection = cles.size ? { noeud: null, structure: ids[0] ?? null, cote, cles } : null;
    this.isole = cles.size > 0;
    $("fiche").hidden = true;
    this.appliquerEtats();
    if (this.calquesMasques(cles).length) {
      void this.montrerCalques(cles).then(() => {
        if (cadrer && cles.size) this.scene.cadrer(this.modeles.boite(cles), undefined, 2.2);
      });
    } else if (cadrer && cles.size) this.scene.cadrer(this.modeles.boite(cles), undefined, 2.2);
  }

  /** Étape d'un parcours : la structure en surbrillance, celles du parcours visibles, le reste estompé. */
  private montrerEtape(etape: Etape, toutes: Etape[]): void {
    this.surligner([etape.structure], etape.cote, true);
    const garder = new Set<string>();
    for (const e of toutes) for (const c of this.clesStructure(e.structure, e.cote)) garder.add(c);
    for (const [cle, m] of this.modeles.maillages) {
      if (garder.has(cle) && !this.selection?.cles.has(cle)) this.modeles.definirEtat(m, "normal");
    }
    this.scene.demanderRendu();
  }

  private modeSeance(actif: boolean, titre?: string): void {
    this.titreSeance = actif ? titre ?? "Apprendre" : null;
    if (actif) this.interrogation.arreter();
    document.body.classList.toggle("en-apprentissage", actif);
    if (actif) {
      $("infobulle").hidden = true;
      this.legendes.vider();
      if (this.coloration) this.colorerMaitrise(null);
    }
    $("titre-mode").textContent = actif ? (document.body.classList.contains("en-parcours") ? "Parcours" : "Révision") : "Explorer";
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode-app]")) {
      const mode = !actif ? "explorer" : document.body.classList.contains("en-parcours") ? "parcours" : "reviser";
      if (b.dataset.modeApp === mode) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    this.majFil();
  }

  private colorerMaitrise(niveaux: Map<string, Niveau> | null): void {
    if (!niveaux) {
      this.coloration = null;
      $("legende-maitrise").hidden = true;
    } else {
      this.coloration = new Map();
      for (const [id, niveau] of niveaux) {
        for (const c of this.atlas.structures[id].noeuds) this.coloration.set(c, COULEURS_NIVEAU[niveau]);
      }
      $("legende-maitrise").innerHTML = (Object.keys(COULEURS_NIVEAU) as Niveau[])
        .map((n) => `<span><i style="background:${COULEURS_NIVEAU[n]}"></i>${{ nouvelle: "pas encore vue", a_revoir: "à revoir", en_cours: "en cours", acquise: "acquise" }[n]}</span>`).join("")
        + `<button id="retirer-couleurs" class="lien">Retirer</button>`;
      $("legende-maitrise").hidden = false;
      $("retirer-couleurs").addEventListener("click", () => this.tableau.basculerColoration());
    }
    for (const m of this.modeles.maillages.values()) this.modeles.definirEtat(m, "normal");
    this.appliquerEtats();
  }

  /** Changement de mode : explorer, parcours (liste ou parcours donné), révision du jour, progrès. */
  changerMode(mode: string, parcours?: string): void {
    if (this.correctionEnCours()) return;
    if (mode === "explorer") {
      if (this.seance.actif) this.seance.quitter();
      if (this.lecteur.actif) this.lecteur.quitter();
      return;
    }
    if (this.seance.actif || this.lecteur.actif) {
      this.etat("Une séance est en cours.", "Échap pour la quitter d'abord.");
      return;
    }
    this.focus.fermerCatalogue();
    this.fermerAide();
    if (mode === "parcours") {
      if (parcours) this.lecteur.lancer(parcours);
      else this.lecteur.ouvrirListe();
    } else if (mode === "reviser") {
      this.fermerSelection();
      this.seance.fermerPanneau();
      this.seance.demarrerRevision();
    } else if (mode === "progres") {
      this.tableau.ouvrir();
    }
  }

  /** Accès des tests à l'apprentissage. */
  get apprentissageTest(): { seance: Seance; lecteur: Lecteur; tableau: Tableau; accueil: Accueil } {
    return { seance: this.seance, lecteur: this.lecteur, tableau: this.tableau, accueil: this.accueil };
  }

  // ------------------------------------------------------------ barre d'état

  private etat(action: string, ensuite: string, erreur = false): void {
    $("etat-action").textContent = action;
    $("etat-action").classList.toggle("erreur", erreur);
    $("etat-ensuite").textContent = ensuite;
    const visibles = this.atlas.calques.filter((c) => this.modeles?.estVisible(c.id)).map((c) => c.nom.toLowerCase());
    const focus = this.focus?.libelle;
    const mode = this.titreSeance ?? "Explorer";
    $("etat-ou").textContent = `${mode} · ${focus ? `${focus} · ` : ""}${visibles.join(", ") || "aucun calque"}`;
  }

  private majIps(): void {
    if (this.scene.imagesParSeconde) $("etat-ips").textContent = `${Math.round(this.scene.imagesParSeconde)} i/s`;
  }

  // ------------------------------------------------------------ tests automatiques

  /** Nœuds d'une structure pour un côté (test automatique). */
  clesTest(id: string, cote: Cote): string[] {
    return [...this.clesStructure(id, cote)];
  }

  /** Accès du test automatique au focus. */
  get focusTest(): Focus {
    return this.focus;
  }

  /** Accès du test automatique aux légendes. */
  get legendesTest(): Legendes {
    return this.legendes;
  }

  /** Maillages masqués à la main et piles d'annulation (test). */
  masquesTest(): { masques: number; estompes: number; annulables: number; retablissables: number } {
    return { masques: this.masques.size, estompes: this.estompes.size, annulables: this.aAnnuler.length,
      retablissables: this.aRetablir.length };
  }

  /** Accès du test automatique au panneau « Choisir ». */
  get choixTest(): ChoixFamilles {
    return this.choix;
  }

  /** Accès du test automatique à l'interrogation. */
  get interrogationTest(): Interrogation {
    return this.interrogation;
  }

  /** Fil d'Ariane affiché (test). */
  filTest(): string[] {
    return [...document.querySelectorAll("#fil-ariane li")].map((li) => li.textContent ?? "");
  }

  etatSelection(): { structure: string | null; noeud: string | null; cote: Cote; ficheVisible: boolean } {
    return {
      structure: this.selection?.structure ?? null, noeud: this.selection?.noeud ?? null,
      cote: this.selection?.cote ?? null, ficheVisible: !$("fiche").hidden,
    };
  }

  /** Diagnostic : centre (moyenne des sommets, repère du monde) de chaque maillage. */
  positions(): Record<string, number[]> {
    const res: Record<string, number[]> = {};
    const v = new THREE.Vector3();
    for (const [cle, m] of this.modeles.maillages) {
      const pos = m.geometry.getAttribute("position");
      const c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) c.add(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
      res[cle] = c.divideScalar(pos.count).toArray();
    }
    return res;
  }

  /** Diagnostic : empilement des structures sous des points écran (pixels de la page). */
  sonder(points: { x: number; y: number }[]): { x: number; y: number; pile: string[] }[] {
    const r = this.scene.renderer.domElement.getBoundingClientRect();
    return points.map((p) => ({
      ...p, pile: this.selecteur.empilement(p.x - r.left, p.y - r.top).map((m) => m.userData.cle as string),
    }));
  }

  /** Cadre une structure et renvoie des points écran (pixels de la page) situés sur ses segments propres. */
  async preparerTest(id: string, cote: Cote, vue: Vue): Promise<{ x: number; y: number }[]> {
    if (this.focus.actif) this.focus.quitter();
    if (this.focus.coupe !== "aucune") this.focus.definirCoupe("aucune");
    this.selection = null;
    $("fiche").hidden = true;
    this.isole = false;
    this.masques.clear();
    this.estompes.clear();
    this.aAnnuler = [];
    this.aRetablir = [];
    this.masquerDegagement();
    this.modeles.toutReafficher();
    this.majMasquage();
    // Calques par défaut, plus celui de la structure (un muscle ne doit pas cacher les vaisseaux du cas suivant)
    for (const c of this.atlas.calques) if (c.id !== "os") this.modeles.afficherCalque(c.id, c.visible);
    this.appliquerEtats();
    const toutes = this.clesStructure(id, cote);
    const propres = [...toutes].filter((c) => this.atlas.noeuds[c]?.structure === id && this.atlas.noeuds[c]?.propre);
    const cles = propres.length ? propres : [...toutes];
    await this.montrerCalques(cles);
    this.scene.cadrer(this.modeles.boite(cles), vue);
    return this.pointsSur(cles);
  }

  /** Points écran (pixels de la page) sur les faces visibles et non coupées de ces maillages, sans toucher à la vue. */
  async pointsSur(cles: Iterable<string>): Promise<{ x: number; y: number }[]> {
    while (this.scene.enTransition) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const r = this.scene.renderer.domElement.getBoundingClientRect();
    const cam = this.scene.camera.position;
    const points: { x: number; y: number; d: number }[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const cle of cles) {
      const m = this.modeles.maillages.get(cle);
      if (!m?.geometry.index || !m.visible) continue;
      const pos = m.geometry.getAttribute("position");
      const idx = m.geometry.index;
      const nTri = idx.count / 3;
      const pas = Math.max(1, Math.floor(nTri / 60));
      for (let t = 0; t < nTri; t += pas) {
        a.fromBufferAttribute(pos, idx.getX(3 * t)).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, idx.getX(3 * t + 1)).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, idx.getX(3 * t + 2)).applyMatrix4(m.matrixWorld);
        const centre = a.clone().add(b).add(c).divideScalar(3);
        const normale = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (normale.dot(cam.clone().sub(centre)) <= 0) continue; // face tournée vers l'arrière
        if (!this.scene.estAffiche(centre)) continue; // partie retirée par la découpe
        const e = this.scene.versEcran(centre);
        if (!e.devant || e.x < 2 || e.y < 2 || e.x > r.width - 2 || e.y > r.height - 2) continue;
        points.push({ x: e.x + r.left, y: e.y + r.top, d: centre.distanceTo(cam) });
      }
    }
    points.sort((p, q) => p.d - q.d);
    return points.slice(0, 16).map(({ x, y }) => ({ x, y }));
  }
}

function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
