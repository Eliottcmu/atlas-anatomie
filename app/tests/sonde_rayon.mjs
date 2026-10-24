// Sonde : pour une structure, tire des rayons vers ses triangles et liste ce qu'ils touchent.
// Usage : node tests/sonde_rayon.mjs V14 gauche dos
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [id, cote, vue] = process.argv.slice(2);
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
// Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
await page.goto(serveur.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300000 });
const points = await page.evaluate(([i, c, v]) => window.__atlas.preparerTest(i, c === "-" ? null : c, v), [id, cote, vue]);
console.log("points", points.length);
const res = await page.evaluate((pts) => window.__atlas.sonder(pts.slice(0, 8)), points);
for (const r of res) console.log(JSON.stringify(r));
await page.screenshot({ path: resolve(APP, "..", "rapports", "captures", `sonde_${id}_${cote}.png`) });
await nav.close(); await serveur.close();
