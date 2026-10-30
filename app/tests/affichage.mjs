// Test de l'affichage : calques Nerfs et Lymphatique, panneau « Choisir » (familles d'organes, peau cachée
// par défaut, choix gardé d'une session à l'autre), boutons Annuler, Rétablir et Liste du masquage,
// dégagement d'une structure enfouie après une recherche (estomper, remettre, couper plutôt).
// Utilise une copie jetable de la base.
//
// Usage : node tests/affichage.mjs
// Captures : rapports/captures/affichage_*.png

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES = resolve(APP, "..", "rapports", "captures");
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`[${ok ? "OK" : "FAIL"}] ${message}`);
  if (!ok) echecs++;
};

const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5180";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
mkdirSync(CAPTURES, { recursive: true });

const masques = () => page.evaluate(() => window.__atlas.masquesTest());
const selection = () => page.evaluate(() => window.__atlas.etatSelection());
const attendreCamera = () => page.waitForFunction(() => !window.__atlas.scene.enTransition, null, { timeout: 8000 });
const visibleEl = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && !el.hidden && el.getClientRects().length > 0; }, sel);
const charge = (calque) => page.waitForFunction((c) => window.__atlas.modeles.calquesCharges.has(c), calque, { timeout: 120_000 });
const element = (id) => page.evaluate((i) => window.__atlas.atlas.familles.flatMap((f) => f.elements).find((e) => e.id === i), id);
const visibles = (cles) => page.evaluate((cs) => cs.map((c) => window.__atlas.modeles.maillages.get(c)?.visible ?? null), cles);
/** Part des points visibles de la cible où la première structure cliquable sous le pointeur est la cible. */
const partVue = async (cles) => {
  await attendreCamera();
  const points = await page.evaluate((cs) => window.__atlas.pointsSur(cs), cles);
  if (!points.length) return 0;
  const piles = await page.evaluate((p) => window.__atlas.sonder(p), points);
  return piles.filter((x) => cles.includes(x.pile[0])).length / piles.length;
};
const chercher = async (texte) => {
  await page.click("#champ-recherche");
  await page.fill("#champ-recherche", texte);
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
};

try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });

  // 1. Calques Nerfs (J) et Lymphatique (Y)
  const calques = await page.evaluate(() => window.__atlas.atlas.calques.map((c) => c.id));
  verifier(calques.includes("nerfs") && calques.includes("lymphatique"), `calques : ${calques.join(", ")}`);
  await page.keyboard.press("j");
  await charge("nerfs");
  await page.keyboard.press("y");
  await charge("lymphatique");
  const n = await page.evaluate(() => ({ nerfs: window.__atlas.modeles.compter("nerfs"), lymph: window.__atlas.modeles.compter("lymphatique") }));
  verifier(n.nerfs >= 200 && n.lymph >= 100, `${n.nerfs} nerfs, ${n.lymph} nœuds lymphatiques chargés`);
  // Recalage des nerfs : chaque nerf longe son artère satellite (distance médiane des points de l'artère au nerf)
  const satellites = await page.evaluate((paires) => {
    const THREE = window.__atlas.scene.camera.position.constructor;
    const points = (cle) => {
      const m = window.__atlas.modeles.maillages.get(cle);
      if (!m) return [];
      const p = m.geometry.getAttribute("position"), res = [];
      m.updateWorldMatrix(true, false);
      for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 400))) res.push(new THREE().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
      return res;
    };
    return paires.map(([artere, nerf]) => {
      const a = points(artere), n = points(nerf);
      const d = a.map((x) => Math.min(...n.map((y) => x.distanceTo(y)))).sort((u, v) => u - v);
      return { artere, nerf, mm: d.length && n.length ? Math.round(d[Math.floor(d.length / 2)] * 1000) : null };
    });
  }, [["FJ2271", "Median nerve.r"], ["FJ3564", "Vagus nerve (X).r"], ["FJ2170", "Tibial nerve.r"], ["FJ2172", "Tibial nerve.r"]]);
  // Fosse poplitée : le nerf tibial est superficiel, la veine poplitée passe entre lui et l'artère
  const seuils = { FJ2170: 20 };
  for (const s of satellites) {
    const seuil = seuils[s.artere] ?? 15;
    verifier(s.mm !== null && s.mm <= seuil, `${s.nerf} à ${s.mm} mm de son artère satellite (${s.artere}, seuil ${seuil} mm)`);
  }
  await page.evaluate(() => window.__atlas.scene.vue("face", window.__atlas.modeles.boiteVisible()));
  await attendreCamera();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(CAPTURES, "affichage_nerfs_lymphatique.png") });
  await chercher("nerf median");
  await page.waitForTimeout(500);
  const sMedian = await selection();
  const nomMedian = await page.textContent("#fiche-nom");
  verifier(!!sMedian.noeud && /médian/i.test(nomMedian ?? ""), `recherche « nerf median » : ${nomMedian} sélectionné`);
  await page.evaluate(() => window.__atlas.deselectionner());
  await page.keyboard.press("j");
  await page.keyboard.press("y");

  // 2. Panneau « Choisir » des organes : peau cachée par défaut
  await page.keyboard.press("r");
  await charge("autres");
  const peau = await element("autres:peau");
  verifier(!!peau && (await visibles(peau.cles)).every((v) => v === false), `peau cachée par défaut (${peau?.cles.length} maillage)`);
  await page.click('.choisir[data-choisir="autres"]');
  verifier(await visibleEl("#choix-familles"), "Choisir : panneau ouvert");
  const familles = await page.$$eval("#choix-liste section", (s) => s.length);
  verifier(familles >= 7, `${familles} familles d'organes proposées`);
  const foie = await element("autres:foie");
  await page.click('#choix-liste input[data-famille="autres:digestif"]');
  await page.waitForTimeout(150);
  verifier((await visibles(foie.cles)).every((v) => v === false), "famille digestive décochée : foie caché");
  // Un seul élément recoché
  await page.click('#choix-liste section[data-section="autres:digestif"] [data-deplier]');
  await page.click('#choix-liste input[data-element="autres:foie"]');
  await page.waitForTimeout(150);
  const estomac = await element("autres:estomac");
  verifier((await visibles(foie.cles)).every(Boolean) && (await visibles(estomac.cles)).every((v) => v === false),
    "foie recoché seul : foie affiché, estomac caché");
  const indet = await page.$eval('#choix-liste input[data-famille="autres:digestif"]', (c) => c.indeterminate);
  verifier(indet, "case de la famille digestive à demi cochée");
  await page.screenshot({ path: resolve(CAPTURES, "affichage_choisir.png") });
  await page.keyboard.press("Escape");
  verifier(!(await visibleEl("#choix-familles")), "Échap : panneau fermé");
  // Choix gardé au rechargement
  await page.reload();
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  await page.keyboard.press("r");
  await charge("autres");
  verifier((await visibles(estomac.cles)).every((v) => v === false) && (await visibles(foie.cles)).every(Boolean),
    "après rechargement : estomac toujours caché, foie affiché");
  // Le focus d'un organe décoché le montre le temps du focus ; une recherche de structure le recoche
  await chercher("estomac");
  await page.waitForFunction(() => window.__atlas.focusTest.actif?.id === "estomac", null, { timeout: 15000 });
  const enFocus = (await visibles(estomac.cles)).every(Boolean);
  await page.evaluate(() => window.__atlas.focusTest.quitter());
  await page.waitForTimeout(200);
  verifier(enFocus && (await visibles(estomac.cles)).every((v) => v === false),
    "focus de l'estomac décoché : affiché pendant le focus, caché de nouveau après");
  await chercher("peau");
  await page.waitForTimeout(400);
  const sPeau = await selection();
  verifier(peau.cles.includes(sPeau.noeud) && (await visibles(peau.cles)).every(Boolean), "recherche « peau » : recochée et sélectionnée");
  await page.evaluate(() => window.__atlas.deselectionner());
  await page.click('.choisir[data-choisir="autres"]');
  await page.click('.choix-outils button[data-choix="defaut"]');
  await page.waitForTimeout(150);
  verifier((await visibles(estomac.cles)).every(Boolean) && (await visibles(peau.cles)).every((v) => v === false),
    "Par défaut : tout affiché sauf la peau");
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");

  // 3. Boutons du masquage : Annuler, Rétablir, Liste
  verifier(!(await visibleEl("#dock-masquage")), "dock : groupe Masqué caché tant que rien n'est masqué");
  await page.evaluate(() => window.__atlas.selectionnerStructure("A63", "droit"));
  await page.waitForTimeout(200);
  await page.keyboard.press("h");
  await page.waitForTimeout(150);
  const m1 = await masques();
  verifier(m1.masques > 0 && (await visibleEl("#dock-masquage")), `H : ${m1.masques} maillages masqués, groupe Masqué affiché`);
  await page.click("#masquage-annuler");
  await page.waitForTimeout(150);
  verifier((await masques()).masques === 0 && (await selection()).structure === "A63", "bouton Annuler : structure remise et sélectionnée");
  await page.click("#masquage-retablir");
  await page.waitForTimeout(150);
  verifier((await masques()).masques === m1.masques, "bouton Rétablir : masquée de nouveau");
  await page.evaluate(() => window.__atlas.selectionnerStructure("A65", "droit"));
  await page.waitForTimeout(150);
  await page.keyboard.press("h");
  await page.waitForTimeout(150);
  await page.click("#masquage-liste-bouton");
  const lignes = await page.$$eval("#masquage-liste li", (l) => l.map((x) => x.querySelector(".nom").textContent));
  verifier(lignes.length === 2, `Liste : ${lignes.join(" ; ")}`);
  // Remettre l'entrée la plus ancienne, pas la dernière
  await page.click('#masquage-liste button[data-remettre="1"]');
  await page.waitForTimeout(150);
  const m2 = await masques();
  verifier(m2.masques > 0 && m2.masques < m1.masques + 100 && (await page.$$eval("#masquage-liste li", (l) => l.length)) === 1,
    `Remettre l'ancienne : ${m2.masques} maillages encore masqués, une entrée dans la liste`);
  await page.click("#masquage-tout");
  await page.waitForTimeout(150);
  verifier((await masques()).masques === 0, "Tout remettre : plus rien de masqué");

  // 4. Dégagement : tronc cœliaque cherché, muscles affichés (la paroi abdominale le cache)
  await page.keyboard.press("m");
  await charge("muscles");
  await page.evaluate(() => window.__atlas.scene.vue("face", window.__atlas.modeles.boiteVisible()));
  await attendreCamera();
  const cibles = await page.evaluate(() => [...window.__atlas.clesTest("A43", null)]
    .filter((c) => window.__atlas.atlas.noeuds[c]?.propre));
  const avant = await partVue(cibles);
  const t0 = Date.now();
  await chercher("tronc coeliaque");
  await page.waitForFunction(() => window.__atlas.masquesTest().estompes > 0, null, { timeout: 10_000 }).catch(() => {});
  const duree = Date.now() - t0;
  const e1 = await masques();
  const apres = await partVue(cibles);
  verifier(e1.estompes > 0 && (await visibleEl("#degagement")), `recherche : ${e1.estompes} structures estompées en ${duree} ms, message affiché`);
  verifier(apres >= 0.5 && apres > avant, `tronc cœliaque visible sur ${Math.round(apres * 100)} % de ses points (contre ${Math.round(avant * 100)} % avant)`);
  await page.screenshot({ path: resolve(CAPTURES, "affichage_degagement.png") });
  await page.click("#degagement-remettre");
  await page.waitForTimeout(150);
  verifier((await masques()).estompes === 0 && !(await visibleEl("#degagement")) && (await selection()).structure === "A43",
    "Remettre : structures rendues, sélection gardée");
  await page.keyboard.press("x");
  await page.waitForFunction(() => window.__atlas.masquesTest().estompes > 0, null, { timeout: 10_000 }).catch(() => {});
  const e2 = await masques();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  const e3 = await masques();
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(150);
  const e4 = await masques();
  verifier(e2.estompes > 0 && e3.estompes === 0 && e4.estompes === e2.estompes, `X : ${e2.estompes} estompées, Ctrl Z ${e3.estompes}, Ctrl Y ${e4.estompes}`);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("x");
  await page.waitForFunction(() => !document.getElementById("degagement").hidden, null, { timeout: 10_000 }).catch(() => {});
  await page.click("#degagement-couper");
  await page.waitForTimeout(200);
  const coupe = await page.evaluate(() => window.__atlas.focusTest.coupe);
  const vuCoupe = await partVue(cibles);
  verifier(coupe !== "aucune" && (await masques()).estompes === 0 && vuCoupe >= 0.5,
    `Couper plutôt : coupe ${coupe}, rien d'estompé, tronc visible sur ${Math.round(vuCoupe * 100)} % de ses points`);
  await page.screenshot({ path: resolve(CAPTURES, "affichage_coupe_devant.png") });

  verifier(erreurs.length === 0, erreurs.length ? `erreurs de page : ${erreurs.slice(0, 3).join(" | ")}` : "aucune erreur dans la console");
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
console.log(echecs ? `[FAIL] ${echecs} vérification(s) en échec.` : "[OK] toutes les vérifications de l'affichage passent.");
process.exit(echecs ? 1 : 0);
