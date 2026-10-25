// Sonde : ouvre chaque fiche rédigée dans l'interface et vérifie son affichage
// (tous les champs rendus, sources lisibles, aucune erreur de console).
// Utilise une copie jetable de la base.
//
// Usage : node tests/sonde_toutes_fiches.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;

const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5175";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
// Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });

try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  const liste = await page.evaluate(async () => (await (await fetch("/api/fiches")).json()));
  const lignes = (Array.isArray(liste) ? liste : liste.fiches).filter((f) => f.statut);
  console.log(`[OK] ${lignes.length} fiches rédigées à ouvrir`);
  for (const f of lignes) {
    const id = f.structure_id ?? f.id;
    const detail = await page.evaluate(async (i) => (await (await fetch(`/api/fiches/${i}`)).json()), id);
    const attendus = Object.keys(detail.fiche.champs).length;
    const avant = erreurs.length;
    await page.evaluate((i) => {
      const s = window.__atlas.atlas?.structures?.[i];
      window.__atlas.selectionnerStructure(i, s?.cote === "bilatéral" ? "droit" : null, false);
    }, id);
    // Début du premier champ, pour être sûr d'observer cette fiche et non la précédente
    const repere = Object.values(detail.fiche.champs)[0].texte.slice(0, 40);
    const vue = await page.waitForFunction(
      (r) => (document.querySelector("#fiche-contenu")?.textContent ?? "").includes(r),
      // 20 s : la première fiche de muscle charge le calque Muscles (13 Mo), qui occupe la page
      repere, { timeout: 20_000 },
    ).then(() => true, () => false);
    if (!vue) erreurs.push(`fiche non affichée (repère « ${repere} » absent)`);
    const rendu = await page.evaluate(() => ({
      dt: document.querySelectorAll(".fiche-champs dt").length,
      texte: document.querySelector("#fiche-contenu")?.textContent ?? "",
      titre: document.querySelector("#fiche h2, #fiche .fiche-titre")?.textContent ?? "",
    }));
    const defauts = [];
    if (rendu.dt !== attendus) defauts.push(`${rendu.dt} champs affichés sur ${attendus}`);
    if (/undefined|\[object Object\]|NaN/.test(rendu.texte)) defauts.push("texte suspect (undefined, NaN)");
    if (erreurs.length > avant) defauts.push(`erreur console : ${erreurs.slice(avant).join(" | ").slice(0, 160)}`);
    if (defauts.length) {
      echecs++;
      console.log(`[FAIL] ${id} ${detail.structure?.nom ?? ""} : ${defauts.join(" ; ")}`);
    }
  }
  console.log(`[${echecs ? "FAIL" : "OK"}] ${lignes.length - echecs}/${lignes.length} fiches affichées correctement`);
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
process.exit(echecs ? 1 : 0);
