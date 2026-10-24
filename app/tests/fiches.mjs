// Test des fiches (phase 2) : affichage, sources, navigation par les relations, correction et vérification.
// Utilise une copie jetable de la base : la vraie n'est jamais modifiée.
//
// Usage : node tests/fiches.mjs

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAPPORTS = resolve(APP, "..", "rapports");
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`[${ok ? "OK" : "FAIL"}] ${message}`);
  if (!ok) echecs++;
};

const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5174";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
// Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
mkdirSync(resolve(RAPPORTS, "captures"), { recursive: true });

try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  const compteur = await page.textContent("#compteur-fiches");
  verifier(/^\d+\/\d+$/.test(compteur), `compteur des fiches affiché : ${compteur}`);

  // 1. Fiche de l'artère subclavière par la recherche
  await page.fill("#champ-recherche", "artere subclaviere");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".fiche-champs dt", { timeout: 10_000 });
  const champs = await page.$$eval(".fiche-champs dt", (d) => d.map((x) => x.textContent));
  verifier(champs.includes("Origine") && champs.includes("Branches"), `champs affichés : ${champs.join(", ")}`);
  const lien = await page.$eval(".sources a", (a) => a.getAttribute("href"));
  verifier(/^\/roneos\/[A-Z0-9]+#page=\d+$/.test(lien), `lien vers la ronéo à la page citée : ${lien}`);
  const pdf = await page.evaluate(async (h) => (await fetch(h.split("#")[0])).headers.get("content-type"), lien);
  verifier(pdf === "application/pdf", `la ronéo s'ouvre en PDF (${pdf})`);
  const statut = await page.textContent(".fiche-statut");
  verifier(/Brouillon|Vérifiée/.test(statut), `statut visible : ${statut.trim().slice(0, 60)}`);
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "fiche_lecture.png") });

  // 2. Navigation par une relation : « Naît de » -> aorte horizontale
  await page.click('.fiche-relations button[data-ouvrir="A06"]');
  await page.waitForTimeout(400);
  const apres = await page.evaluate(() => window.__atlas.etatSelection());
  verifier(apres.structure === "A06", `la relation mène à l'aorte horizontale (${apres.structure})`);

  // 3. Correction, protection contre la perte, puis vérification avec confirmation
  await page.keyboard.press("e");
  await page.waitForSelector(".fiche-edition textarea[name=origine]");
  const avant = await page.inputValue(".fiche-edition textarea[name=origine]");
  await page.fill(".fiche-edition textarea[name=origine]", `${avant} Test de correction.`);
  await page.evaluate(() => window.__atlas.selectionnerStructure("A05"));
  const bloque = await page.evaluate(() => window.__atlas.etatSelection().structure);
  verifier(bloque === "A06", "une autre sélection est refusée pendant la correction");
  await page.fill(".fiche-edition input[name=origine__sources]", "XX:3");
  await page.click('[data-action-fiche="enregistrer"]');
  const erreur = await page.textContent("#erreur-edition");
  verifier(/Source illisible/.test(erreur), "une source inconnue est refusée avec un message clair");
  await page.fill(".fiche-edition input[name=origine__sources]", "GV26:3");
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "fiche_edition.png") });
  await page.click('[data-action-fiche="demander-verification"]');
  const confirmation = await page.textContent(".actions-edition .confirmation");
  verifier(/conforme/.test(confirmation), "la vérification demande une confirmation");
  await page.click('[data-action-fiche="verifier"]');
  await page.waitForSelector(".fiche-statut.verifie", { timeout: 10_000 });
  const enBase = await page.evaluate(async () => (await (await fetch("/api/fiches/A06")).json()).fiche);
  verifier(enBase.statut === "verifie" && enBase.modifie_par === "eliott" && enBase.champs.origine.texte.endsWith("Test de correction."),
    "la fiche est enregistrée vérifiée dans la base de test, avec la correction");
  const compteurApres = await page.textContent("#compteur-fiches");
  verifier(compteurApres !== compteur, `le compteur avance : ${compteur} -> ${compteurApres}`);
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "fiche_verifiee.png") });

  // 4. Liste de suivi
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await page.waitForSelector("#liste-fiches:not([hidden])");
  await page.click('[data-filtre-fiches="verifiees"]');
  const verifiees = await page.$$eval("#liste-fiches-contenu li button", (b) => b.map((x) => x.textContent));
  verifier(verifiees.some((n) => /aorte horizontale/i.test(n)), `la liste des vérifiées contient l'aorte horizontale (${verifiees.length})`);
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "fiche_liste.png") });
  await page.keyboard.press("Escape");
  verifier(await page.$eval("#liste-fiches", (e) => e.hidden), "Échap ferme la liste");
} finally {
  verifier(!erreurs.length, erreurs.length ? `erreurs de la page : ${erreurs.slice(0, 3).join(" ; ")}` : "aucune erreur dans la console");
  await nav.close();
  await serveur.close();
  api.arreter();
}
console.log(`[${echecs ? "FAIL" : "OK"}] ${echecs ? `${echecs} vérification(s) en échec` : "toutes les vérifications passent"}.`);
process.exit(echecs ? 1 : 0);
