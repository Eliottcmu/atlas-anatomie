// Sonde : dans un focus, empilement des structures sous les points d'une structure donnée.
// Usage : node tests/sonde_focus.mjs genou-droit A70 droit
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [region, id, cote] = process.argv.slice(2);
const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5174";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
// Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
await page.goto(serveur.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300000 });
await page.evaluate((r) => window.__atlas.focusTest.entrerRegion(r), region);
await page.waitForTimeout(900);
const cles = await page.evaluate(([i, c]) => window.__atlas.clesTest(i, c || null), [id, cote]);
const pts = await page.evaluate((k) => window.__atlas.pointsSur(k), cles);
console.log("clés", cles, "points", pts.length);
for (const r of await page.evaluate((p) => window.__atlas.sonder(p.slice(0, 6)), pts)) console.log(Math.round(r.x), Math.round(r.y), r.pile.join(" > "));
await page.screenshot({ path: resolve(APP, "..", "rapports", "captures", `sonde_focus_${region}.png`) });
await nav.close(); await serveur.close(); api.arreter();
