// Captures de l'interface à plusieurs tailles d'écran, pour la revue visuelle (rapports/captures/ui_*.png).
// Utilise une copie jetable de la base.
//
// Usage : node tests/captures_ui.mjs [scenario...]

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = resolve(APP, "..", "rapports", "captures");
mkdirSync(DOSSIER, { recursive: true });

const TAILLES = { grand: [1600, 950], portable: [1280, 720], petit: [1100, 620] };
const SCENARIOS = {
  accueil: async () => {},
  selection: async (p) => {
    await p.evaluate(() => window.__atlas.selectionnerStructure("A09", "droit"));
  },
  coeur: async (p) => {
    await p.evaluate(() => window.__atlas.focusTest.entrerOrgane("coeur"));
  },
  rein: async (p) => {
    await p.evaluate(() => window.__atlas.focusTest.entrerOrgane("reins"));
  },
  thorax: async (p) => {
    await p.evaluate(() => window.__atlas.focusTest.entrerRegion("thorax"));
  },
  question: async (p) => {
    await p.evaluate(() => window.__atlas.changerMode("reviser"));
    await p.waitForSelector("#seance:not([hidden]) .seance-consigne");
  },
  correction: async (p) => {
    await p.waitForSelector("#seance-saisie");
    await p.fill("#seance-saisie", "artere coronaire droite");
    await p.keyboard.press("Enter");
  },
  parcours: async (p) => {
    await p.keyboard.press("Escape");
    await p.keyboard.press("Enter");
    await p.evaluate(() => window.__atlas.changerMode("parcours", window.__atlas.apprentissageTest.lecteur.parcours[2].id));
    for (let i = 0; i < 3; i++) await p.keyboard.press("Enter");
  },
  tableau: async (p) => {
    await p.keyboard.press("Escape");
    await p.evaluate(() => window.__atlas.changerMode("progres"));
  },
  bienvenue: async (p) => {
    await p.evaluate(() => { window.__atlas.apprentissageTest.tableau.fermer(); window.__atlas.apprentissageTest.accueil.ouvrir(); });
  },
};
// « organe:rein », « region:thorax » : focus quelconque ; « taille:portable » : une seule taille
const args = process.argv.slice(2);
for (const a of args) {
  const [type, id] = a.split(":");
  if (type === "organe") SCENARIOS[a] = (p) => p.evaluate((x) => window.__atlas.focusTest.entrerOrgane(x), id);
  if (type === "region") SCENARIOS[a] = (p) => p.evaluate((x) => window.__atlas.focusTest.entrerRegion(x), id);
}
const tailleSeule = args.find((a) => a.startsWith("taille:"))?.split(":")[1];
if (tailleSeule) for (const t of Object.keys(TAILLES)) if (t !== tailleSeule) delete TAILLES[t];
const demandes = args.filter((a) => !a.startsWith("taille:")).length
  ? args.filter((a) => !a.startsWith("taille:")) : Object.keys(SCENARIOS);

const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5176";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [taille, [l, h]] of Object.entries(TAILLES)) {
    const page = await nav.newPage({ viewport: { width: l, height: h } });
    // Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
    await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
    page.on("pageerror", (e) => console.log(`[FAIL] erreur de page : ${e.message}`));
    await page.goto(serveur.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
    for (const nom of demandes) {
      // Les scénarios de la phase 3 s'enchaînent (la correction suit la question) : pas de remise à zéro
      if (!["correction", "parcours", "tableau", "bienvenue"].includes(nom)) {
        await page.evaluate(() => { window.__atlas.deselectionner(); if (window.__atlas.focusTest.actif) window.__atlas.focusTest.quitter(); });
      }
      await SCENARIOS[nom](page);
      await page.waitForTimeout(2200);
      const chemin = resolve(DOSSIER, `ui_${nom.replace(":", "_")}_${taille}.png`);
      await page.screenshot({ path: chemin });
      console.log(`[OK] ${chemin}`);
    }
    await page.close();
  }
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
