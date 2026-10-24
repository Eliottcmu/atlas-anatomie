// Sonde : étiquettes de légende qui débordent de la zone libre (largeur mesurée contre largeur réelle).
// Usage : node tests/sonde_legendes.mjs [organe] [largeur] [hauteur]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const [organe = "reins", l = "1100", h = "620"] = process.argv.slice(2);
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5179";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: Number(l), height: Number(h) } });
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  await page.evaluate((o) => window.__atlas.focusTest.entrerOrgane(o), organe);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const zone = window.__atlas.zoneLibre();
    return {
      zone,
      etiquettes: [...document.querySelectorAll(".legende:not([hidden])")].map((b) => {
        const rect = b.getBoundingClientRect();
        return { nom: b.textContent, gauche: Math.round(rect.left), droite: Math.round(rect.right),
          largeur: Math.round(rect.width), mesure: Number(b.dataset.largeur) };
      }),
    };
  });
  const hors = r.etiquettes.filter((e) => e.gauche < r.zone.gauche || e.droite > r.zone.droite);
  console.log(`[OK] zone libre ${Math.round(r.zone.gauche)}-${Math.round(r.zone.droite)} px, ${r.etiquettes.length} étiquettes`);
  for (const e of hors) console.log(`[WARN] hors zone : ${e.nom} (${e.gauche}-${e.droite}, largeur ${e.largeur}, mesurée ${e.mesure})`);
  const ecarts = r.etiquettes.filter((e) => Math.abs(e.largeur - e.mesure) > 1);
  for (const e of ecarts.slice(0, 5)) console.log(`[WARN] largeur réelle ${e.largeur} contre ${e.mesure} mesurée : ${e.nom}`);
  console.log(hors.length ? `[FAIL] ${hors.length} étiquettes hors zone` : "[OK] aucune étiquette hors zone");
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
