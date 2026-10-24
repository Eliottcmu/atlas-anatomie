// Test de la navigation : fil d'Ariane, historique, légendes, raccourcis, repère d'orientation,
// double-clic et pavé tactile. Utilise une copie jetable de la base.
//
// Usage : node tests/navigation.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`[${ok ? "OK" : "FAIL"}] ${message}`);
  if (!ok) echecs++;
};

const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5177";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });

const fil = () => page.evaluate(() => window.__atlas.filTest());
const selection = () => page.evaluate(() => window.__atlas.etatSelection());
const camera = () => page.evaluate(() => {
  const s = window.__atlas.scene;
  return { p: s.camera.position.toArray(), c: s.controles.target.toArray() };
});
const attendreCamera = () => page.waitForFunction(() => !window.__atlas.scene.enTransition, null, { timeout: 5000 });

try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  verifier((await fil())[0] === "Corps entier", `fil d'Ariane au départ : ${(await fil()).join(" / ")}`);

  // 1. Recherche au clavier (Ctrl K), sélection d'une structure
  await page.keyboard.press("Control+k");
  const focusRecherche = await page.evaluate(() => document.activeElement?.id);
  verifier(focusRecherche === "champ-recherche", `Ctrl K place le curseur dans la recherche (${focusRecherche})`);
  await page.keyboard.type("artere subclaviere");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const f1 = await fil();
  verifier(f1.length === 2 && /subclavière/i.test(f1[1]), `fil après sélection : ${f1.join(" / ")}`);

  // 2. Focus sur le cœur par le catalogue filtré
  await page.keyboard.press("g");
  await page.keyboard.type("coeur");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__atlas.focusTest.actif?.id === "coeur", null, { timeout: 15000 });
  await attendreCamera();
  await page.waitForTimeout(400);
  const f2 = await fil();
  verifier(f2.join(" / ") === "Corps entier / Cœur", `catalogue filtré, Entrée : focus ${f2.join(" / ")}`);
  const legendes = await page.evaluate(() => window.__atlas.legendesTest.affichees);
  verifier(legendes.length > 0, `${legendes.length} légendes affichées sur le cœur`);

  // 3. Clic sur une légende : sélection de la partie, fil à trois étapes
  const etiquette = await page.$(".legende:not([hidden])");
  const nomEtiquette = (await etiquette.textContent()).trim();
  await etiquette.click();
  await page.waitForTimeout(250);
  const s3 = await selection();
  const f3 = await fil();
  verifier(s3.ficheVisible && f3.length === 3, `clic sur la légende « ${nomEtiquette} » : fiche ouverte, fil ${f3.join(" / ")}`);

  // 4. Historique : retour, retour, avance
  await page.keyboard.press("Alt+ArrowLeft");
  await page.waitForTimeout(400);
  const f4 = await fil();
  verifier(f4.join(" / ") === "Corps entier / Cœur" && !(await selection()).ficheVisible,
    `Alt flèche gauche : retour au focus sans sélection (${f4.join(" / ")})`);
  await page.keyboard.press("Alt+ArrowLeft");
  await page.waitForTimeout(900);
  const f5 = await fil();
  verifier(f5.length === 2 && /subclavière/i.test(f5[1]) && !(await page.evaluate(() => window.__atlas.focusTest.actif)),
    `second retour : focus quitté, subclavière resélectionnée (${f5.join(" / ")})`);
  await page.click("#nav-suivant");
  await page.waitForTimeout(900);
  const f6 = await fil();
  verifier(f6.join(" / ") === "Corps entier / Cœur", `bouton Suivant : retour au focus du cœur (${f6.join(" / ")})`);

  // 5. Planche muette : N passe aux numéros, un clic révèle le nom
  await page.keyboard.press("n");
  await page.waitForTimeout(300);
  const muette = await page.evaluate(() => [...document.querySelectorAll(".legende:not([hidden])")].every((b) => !b.querySelector(".nom")));
  verifier(muette, "N : légendes en numéros seuls (planche muette)");
  const numero = await page.$(".legende:not([hidden])");
  await numero.click();
  await page.waitForTimeout(150);
  const revele = await numero.evaluate((b) => !!b.querySelector(".nom"));
  verifier(revele, "clic sur un numéro : le nom apparaît");
  await page.keyboard.press("n");
  await page.keyboard.press("n");
  await page.waitForTimeout(200);
  verifier(await page.evaluate(() => window.__atlas.legendesTest.mode === "noms"), "N deux fois de plus : retour aux noms");

  // 6. Fil d'Ariane : « Corps entier » quitte le focus
  await page.click("#fil-ariane li:first-child button");
  await page.waitForTimeout(800);
  verifier(!(await page.evaluate(() => window.__atlas.focusTest.actif)), "clic sur « Corps entier » : focus quitté");

  // 7. Repère d'orientation : S donne la vue de dessus
  await page.click(".pole-S");
  await attendreCamera();
  const c7 = await camera();
  const dy = c7.p[1] - c7.c[1], horiz = Math.hypot(c7.p[0] - c7.c[0], c7.p[2] - c7.c[2]);
  verifier(dy > 5 * horiz, `clic sur S : caméra au-dessus de la cible (dy ${dy.toFixed(2)} m, horizontal ${horiz.toFixed(2)} m)`);
  await page.keyboard.press("f");
  await attendreCamera();

  // 8. Double-clic sur une structure : sélection et cadrage
  const points = await page.evaluate(() => window.__atlas.preparerTest("A63", "droit", "face"));
  await attendreCamera();
  await page.evaluate(() => window.__atlas.deselectionner());
  await page.evaluate(() => window.__atlas.scene.vue("face", window.__atlas.modeles.boiteVisible()));
  await attendreCamera();
  const avant = await camera();
  const p = points[0];
  const dansLaVue = await page.evaluate(({ x, y }) => window.__atlas.sonder([{ x, y }])[0].pile, p);
  let doubleOk = false;
  for (const q of points.slice(0, 6)) {
    await page.mouse.dblclick(q.x, q.y);
    await page.waitForTimeout(150);
    await attendreCamera();
    const s8 = await selection();
    const apres = await camera();
    const deplace = Math.hypot(...apres.p.map((v, i) => v - avant.p[i]));
    if (s8.noeud && deplace > 0.2) {
      doubleOk = true;
      verifier(true, `double-clic : ${s8.structure ?? s8.noeud} sélectionnée, caméra rapprochée de ${deplace.toFixed(2)} m`);
      break;
    }
  }
  if (!doubleOk) verifier(false, `double-clic sans effet (pile sous le premier point : ${dansLaVue.slice(0, 3).join(", ")})`);
  await page.evaluate(() => window.__atlas.deselectionner());

  // 9. Pavé tactile : défilement à deux doigts = rotation ; souris : zoom
  const canevas = await page.$("#vue3d canvas");
  const boite = await canevas.boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.evaluate(() => { window.__atlas.scene.modeNavigation = "pave"; });
  const c9 = await camera();
  await page.mouse.wheel(120, 0);
  await page.waitForTimeout(300);
  const c9b = await camera();
  const az = (c) => Math.atan2(c.p[0] - c.c[0], c.p[2] - c.c[2]);
  verifier(Math.abs(az(c9b) - az(c9)) > 0.2, `pavé tactile : deux doigts tournent la vue (${(az(c9b) - az(c9)).toFixed(2)} rad)`);
  await page.evaluate(() => { window.__atlas.scene.modeNavigation = "souris"; });
  const dist = (c) => Math.hypot(...c.p.map((v, i) => v - c.c[i]));
  const d0 = dist(await camera());
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(500);
  const d1 = dist(await camera());
  verifier(Math.abs(d1 - d0) / d0 > 0.05, `souris : la molette zoome (${d0.toFixed(2)} -> ${d1.toFixed(2)} m)`);

  // 10. Aide : ? ouvre, Échap ferme
  await page.keyboard.press("?");
  const aide = await page.evaluate(() => !document.getElementById("aide").hidden);
  await page.keyboard.press("Escape");
  const fermee = await page.evaluate(() => document.getElementById("aide").hidden);
  verifier(aide && fermee, "? ouvre l'aide, Échap la ferme");

  verifier(erreurs.length === 0, erreurs.length ? `erreurs de page : ${erreurs.slice(0, 3).join(" | ")}` : "aucune erreur dans la console");
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
console.log(echecs ? `[FAIL] ${echecs} vérification(s) en échec.` : "[OK] toutes les vérifications de navigation passent.");
process.exit(echecs ? 1 : 0);
