// Test du paquet Windows tel qu'un utilisateur le reçoit : décompression, lancement de l'exe,
// atlas utilisable, une seule instance, arrêt automatique à la fermeture de la fenêtre.
// Données personnelles dans un dossier jetable : la vraie base n'est pas touchée.
//
// Usage : node tests/appli.mjs   (après python -I pipeline/construire_appli.py)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAQUET = join(RACINE, "distribution", "Atlas-anatomie-Windows.zip");
const PORT = 8797;
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`[${ok ? "OK" : "FAIL"}] ${message}`);
  if (!ok) echecs++;
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(PAQUET)) {
  console.log("[FAIL] Paquet absent. Action : python -I pipeline/construire_appli.py");
  process.exit(1);
}
const dossier = mkdtempSync(join(tmpdir(), "atlas-appli-"));
const donnees = join(dossier, "donnees");
// Décompression par l'outil de Windows, celui de « Extraire tout » (le tar de Git ne lit pas les zip)
spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${PAQUET}' -DestinationPath '${dossier}'`]);
const exe = join(dossier, "Atlas d'anatomie", "Atlas d'anatomie.exe");
verifier(existsSync(exe), "paquet décompressé, exe présent");

const lancer = () => spawn(exe, ["-sans-navigateur", "-port", String(PORT)], { env: { ...process.env, ATLAS_DONNEES: donnees } });
let fini = false;
const atlas = lancer();
atlas.on("exit", () => { fini = true; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/api/etat`)).ok) break; } catch { /* démarrage */ }
  await attendre(200);
}
const etat = await (await fetch(`http://127.0.0.1:${PORT}/api/etat`)).json();
verifier(etat.atlas && etat.brouillons > 0, `atlas démarré, base créée depuis la graine (${etat.brouillons} brouillons, version ${etat.version})`);

// Second lancement : il doit trouver l'instance en cours et s'arrêter sans en créer une autre
const second = spawnSync(exe, ["-sans-navigateur"], { env: { ...process.env, ATLAS_DONNEES: donnees }, timeout: 15_000 });
verifier(second.status === 0, "un second lancement rejoint l'atlas déjà ouvert et s'arrête");

const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
// Premiers pas déjà vus : la carte d'accueil recouvrirait la vue pendant les clics
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 120_000 });
verifier(true, "interface construite chargée, modèles 3D affichés");
await page.fill("#champ-recherche", "aorte horizontale");
await page.keyboard.press("Enter");
await page.waitForSelector(".fiche-champs dt", { timeout: 10_000 });
verifier((await page.$$(".fiche-champs dt")).length > 3, "fiche affichée depuis la base de l'appli");
const pdf = await page.evaluate(async () => (await fetch("/roneos/GV26")).headers.get("content-type"));
verifier(pdf === "application/pdf", "ronéos servies par l'appli");
// Organes de Z-Anatomy et légendes : focus sur le cervelet (lobules), étiquettes posées
await page.evaluate(() => window.__atlas.deselectionner());
await page.evaluate(() => window.__atlas.focusTest.entrerOrgane("cervelet"));
await page.waitForFunction(() => window.__atlas.legendesTest.affichees.length > 0, null, { timeout: 20_000 }).catch(() => {});
const legendes = await page.evaluate(() => window.__atlas.legendesTest.affichees.length);
verifier(legendes > 5, `focus sur le cervelet : lobules de Z-Anatomy chargés, ${legendes} légendes affichées`);
// Révisions servies par le lanceur compilé : cartes créées au démarrage, file du jour disponible
const revisions = await page.evaluate(async () => {
  const b = await (await fetch("/api/revisions/bilan")).json();
  const f = await (await fetch("/api/revisions/file?nouvelles=20")).json();
  return { actives: b.actives, nouvelles: f.nouvelles.length };
});
verifier(revisions.actives > 100 && revisions.nouvelles === 20,
  `révisions : ${revisions.actives} cartes actives, ${revisions.nouvelles} nouvelles dans la file du jour`);
verifier(!erreurs.length, erreurs.length ? `erreurs : ${erreurs.slice(0, 3).join(" ; ")}` : "aucune erreur dans la console");

// Fermeture de la fenêtre : l'atlas doit s'arrêter seul
await page.close();
await nav.close();
const debut = Date.now();
while (!fini && Date.now() - debut < 60_000) await attendre(500);
verifier(fini, `arrêt automatique après fermeture de la fenêtre (${Math.round((Date.now() - debut) / 1000)} s)`);
const journal = readFileSync(join(donnees, "journal.txt"), "utf-8");
verifier(/dernière fenêtre fermée/.test(journal), "le journal explique l'arrêt");
verifier(!existsSync(join(donnees, "instance.json")), "le verrou d'instance est retiré à l'arrêt");

if (!fini) atlas.kill();
try { rmSync(dossier, { recursive: true, force: true }); } catch { /* fichier encore ouvert */ }
console.log(`[${echecs ? "FAIL" : "OK"}] ${echecs ? `${echecs} vérification(s) en échec` : "le paquet Windows fonctionne de bout en bout"}.`);
process.exit(echecs ? 1 : 0);
