// Test du portail de la phase 1 : chaque structure noyau du bloc 1 qui a un modèle 3D se clique.
//
// Démarre le serveur Vite, ouvre l'atlas dans Edge piloté par Playwright, puis pour chaque
// structure (et chaque côté si elle est bilatérale) : cadre la structure, clique de vrais points
// de l'écran situés sur ses segments, et vérifie que la fiche affiche cette structure.
// Plusieurs vues sont essayées si la première est masquée par d'autres structures.
//
// Usage : npm run test:clic [-- --capture] [-- --structures A09,V21]
// Sortie : rapports/test_clic.md et captures dans rapports/captures/

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const APP = resolve(ICI, "..");
const RAPPORTS = resolve(APP, "..", "rapports");
const VUES = ["face", "droite", "gauche", "dos"];
const ESSAIS_PAR_VUE = 6;
const CLICS_REPETES = 4; // clics au même endroit pour descendre dans les structures superposées

const args = process.argv.slice(2);
const captureSeule = args.includes("--capture");
const filtre = args.includes("--structures") ? new Set(args[args.indexOf("--structures") + 1].split(",")) : null;

function journal(niveau, message) {
  console.log(`[${niveau}] ${message}`);
}

// Serveur des fiches sur une copie jetable de la base, et Vite sur un port de test
const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5174";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const url = serveur.resolvedUrls.local[0];
journal("OK", `Serveur Vite démarré : ${url}`);

let navigateur;
try {
  navigateur = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
} catch (e) {
  journal("FAIL", `Edge introuvable ou impossible à lancer : ${e.message}. Action : installer Microsoft Edge.`);
  await serveur.close();
api.arreter();
  process.exit(1);
}

const page = await navigateur.newPage({ viewport: { width: 1600, height: 950 } });
// Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });

const debut = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
const dureeChargement = (Date.now() - debut) / 1000;
journal("OK", `Atlas prêt en ${dureeChargement.toFixed(1)} s.`);
const renduInfo = await page.evaluate(() => {
  const gl = document.querySelector("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "inconnu";
});
journal("OK", `Rendu : ${renduInfo}`);

mkdirSync(resolve(RAPPORTS, "captures"), { recursive: true });
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(RAPPORTS, "captures", "vue_ensemble.png") });

if (captureSeule) {
  // Capture d'une sélection pour vérifier la fiche
  await page.fill("#champ-recherche", "subclaviere");
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "recherche.png") });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "selection.png") });
  // Branche d'une structure noyau (rameau du cône artériel, branche de la coronaire droite), puis isolement
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window.__atlas.selectionnerNoeud("FJ2670"); });
  await page.keyboard.press("z");
  await page.waitForTimeout(1200);
  await page.keyboard.press("i");
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(RAPPORTS, "captures", "branche_isolee.png") });
  journal("OK", `Captures écrites dans ${resolve(RAPPORTS, "captures")}`);
  await navigateur.close();
  await serveur.close();
api.arreter();
  process.exit(erreurs.length ? 1 : 0);
}

const atlas = await page.evaluate(() => fetch("/donnees/atlas.json").then((r) => r.json()));
const cas = [];
const sansModele = [];
for (const [id, s] of Object.entries(atlas.structures)) {
  if (!s.noeuds.length || (filtre && !filtre.has(id))) continue;
  const cotes = s.cote === "bilatéral" ? ["droit", "gauche"] : [null];
  for (const cote of cotes) {
    // Un côté sans aucun nœud (artère bronchique gauche, absente des modèles) n'a rien à cliquer
    const presents = s.noeuds.filter((k) => !cote || !atlas.noeuds[k].cote || atlas.noeuds[k].cote === cote);
    if (cote && !presents.some((k) => atlas.noeuds[k].cote === cote)) {
      sansModele.push(`${id} ${s.nom} (${cote})`);
      continue;
    }
    cas.push({ id, nom: s.nom, cote });
  }
}
journal("OK", `${cas.length} cas à tester (structures et côtés).`);

const resultats = [];
for (const [i, c] of cas.entries()) {
  let reussite = null;
  let cliques = 0;
  const autres = new Map();
  for (const vue of VUES) {
    const points = await page.evaluate(([id, cote, v]) => window.__atlas.preparerTest(id, cote, v), [c.id, c.cote, vue]);
    for (const p of points.slice(0, ESSAIS_PAR_VUE)) {
      await page.keyboard.press("Escape");
      for (let rep = 0; rep < CLICS_REPETES && !reussite; rep++) {
        await page.mouse.click(p.x, p.y);
        cliques++;
        const etat = await page.evaluate(() => window.__atlas.etatSelection());
        // Réussite : le nœud cliqué appartient à la structure (ses segments ou ses branches)
        const appartient = etat.noeud && atlas.structures[c.id].noeuds.includes(etat.noeud);
        const coteOk = !c.cote || !atlas.noeuds[etat.noeud]?.cote || atlas.noeuds[etat.noeud].cote === c.cote;
        if (appartient && coteOk && etat.ficheVisible) {
          reussite = { vue, cliques, exacte: etat.structure === c.id, profondeur: rep + 1 };
          break;
        }
        const obtenu = etat.noeud ? atlas.noeuds[etat.noeud]?.nom ?? etat.noeud : "rien";
        autres.set(obtenu, (autres.get(obtenu) ?? 0) + 1);
        if (!etat.noeud) break; // rien sous le pointeur : inutile d'insister
      }
      if (reussite) break;
    }
    if (reussite) break;
  }
  resultats.push({ ...c, reussite, cliques, autres: [...autres.entries()] });
  const libelle = `${c.id} ${c.nom}${c.cote ? ` (${c.cote})` : ""}`;
  if (reussite) journal("OK", `${i + 1}/${cas.length} ${libelle} : vue ${reussite.vue}, ${reussite.cliques} clic(s), profondeur ${reussite.profondeur}.`);
  else journal("FAIL", `${i + 1}/${cas.length} ${libelle} : non cliquable. Obtenu : ${[...autres.keys()].join(", ")}`);
}

// Fluidité : rotation continue pendant 3 secondes
await page.evaluate(() => window.__atlas.preparerTest("A05", null, "face"));
await page.mouse.move(800, 480);
await page.mouse.down();
for (let k = 0; k < 90; k++) {
  await page.mouse.move(800 + 300 * Math.sin(k / 10), 480, { steps: 1 });
  await page.waitForTimeout(33);
}
await page.mouse.up();
const ips = await page.evaluate(() => document.getElementById("etat-ips").textContent);

const ok = resultats.filter((r) => r.reussite);
const lignes = [
  "# Test des clics, phase 1",
  "",
  "Fichier généré par app/tests/clic.mjs, ne pas éditer à la main.",
  "",
  `Date : ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Rendu : ${renduInfo}. Chargement : ${dureeChargement.toFixed(1)} s.`,
  `Fluidité mesurée en rotation : ${ips || "non mesurée"} (rendu ${/SwiftShader/i.test(renduInfo) ? "logiciel, sans carte graphique : valeur plancher" : "matériel"}).`,
  "",
  `**${ok.length} cas cliquables sur ${resultats.length}** (${((100 * ok.length) / resultats.length).toFixed(0)} %).`,
  "",
  "Profondeur : nombre de clics au même endroit pour atteindre la structure (1 = directement au premier clic).",
  sansModele.length ? `Côtés sans modèle 3D, non testés : ${sansModele.join(", ")}.` : "",
  "",
  "| Id | Structure | Côté | Résultat | Vue | Profondeur | Clics | Obtenu avant |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...resultats.map((r) => `| ${r.id} | ${r.nom} | ${r.cote ?? "-"} | ${r.reussite ? (r.reussite.exacte ? "OK" : "OK (par une sous-partie)") : "ÉCHEC"} | ${r.reussite?.vue ?? "-"} | ${r.reussite?.profondeur ?? "-"} | ${r.cliques} | ${r.autres.map(([n, k]) => `${n} x${k}`).join(", ") || "-"} |`),
  "",
  erreurs.length ? `Erreurs de la page : ${erreurs.slice(0, 10).join(" ; ")}` : "Aucune erreur dans la console de la page.",
];
writeFileSync(resolve(RAPPORTS, "test_clic.md"), lignes.join("\n") + "\n", "utf-8");
journal(ok.length === resultats.length ? "OK" : "WARN", `${ok.length}/${resultats.length} cas cliquables. Rapport : rapports/test_clic.md`);
if (erreurs.length) journal("WARN", `${erreurs.length} erreurs dans la console : ${erreurs[0]}`);

await navigateur.close();
await serveur.close();
api.arreter();
process.exit(ok.length === resultats.length && !erreurs.length ? 0 : 1);
