// Sonde : images par seconde en rotation continue (rotation automatique d'OrbitControls), avec et sans
// le repère d'orientation, en vue d'ensemble et en focus. Usage : node tests/sonde_ips.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5178";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const mesurer = (libelle) => page.evaluate(async (l) => {
  const s = window.__atlas.scene;
  s.controles.autoRotate = true;
  s.controles.autoRotateSpeed = 6;
  const t0 = performance.now();
  let images = 0;
  const f = () => { images++; };
  s.apresRendu.push(f);
  await new Promise((r) => setTimeout(r, 2500));
  s.apresRendu.splice(s.apresRendu.indexOf(f), 1);
  s.controles.autoRotate = false;
  return `${l} : ${Math.round(images / ((performance.now() - t0) / 1000))} i/s`;
}, libelle);
try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  console.log("[OK]", await mesurer("vue d'ensemble"));
  await page.evaluate(() => { document.getElementById("orientation").hidden = true; });
  console.log("[OK]", await mesurer("vue d'ensemble, sans repère d'orientation"));
  await page.evaluate(() => { document.getElementById("orientation").hidden = false; });
  await page.evaluate(() => window.__atlas.focusTest.entrerOrgane("encephale"));
  await page.waitForTimeout(1500);
  console.log("[OK]", await mesurer("focus encéphale, légendes affichées"));
  await page.evaluate(() => window.__atlas.legendesTest.definirMode("aucune"));
  console.log("[OK]", await mesurer("focus encéphale, sans légendes"));
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
