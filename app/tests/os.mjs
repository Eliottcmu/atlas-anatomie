// Test des os et des légendes : annulation du masquage (Ctrl Z, Ctrl Y), focus d'un os par le catalogue
// (côté choisi, os opaques, repères légendés et rangés par rubrique), interrogation sur la planche muette (T).
// Utilise une copie jetable de la base.
//
// Usage : node tests/os.mjs
// Captures : rapports/captures/os_*.png

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES = resolve(APP, "..", "rapports", "captures");
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`[${ok ? "OK" : "FAIL"}] ${message}`);
  if (!ok) echecs++;
};

const api = await demarrerServeurTest(resolve(APP, ".."));
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5179";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage({ viewport: { width: 1600, height: 950 } });
await page.addInitScript(() => { try { localStorage.setItem("atlas.accueil", "vu"); } catch {} });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
mkdirSync(CAPTURES, { recursive: true });

const selection = () => page.evaluate(() => window.__atlas.etatSelection());
const masques = () => page.evaluate(() => window.__atlas.masquesTest());
const attendreCamera = () => page.waitForFunction(() => !window.__atlas.scene.enTransition, null, { timeout: 5000 });
const attendreLegendes = async () => {
  await attendreCamera();
  await page.waitForFunction(() => window.__atlas.legendesTest.affichees.length > 0, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
};

try {
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });

  // 1. Masquer puis annuler : la structure revient, sélectionnée
  await page.evaluate(() => window.__atlas.selectionnerStructure("A63", "droit"));
  await page.waitForTimeout(200);
  const avant = await selection();
  await page.keyboard.press("h");
  await page.waitForTimeout(150);
  const m1 = await masques();
  verifier(m1.masques > 0 && !(await selection()).ficheVisible, `H : ${m1.masques} maillages masqués, sélection fermée`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const m2 = await masques(), s2 = await selection();
  verifier(m2.masques === 0 && s2.structure === avant.structure && s2.ficheVisible,
    `Ctrl Z : maillages réaffichés (${m2.masques} masqué), ${s2.structure} de nouveau sélectionnée, fiche ouverte`);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(150);
  const m3 = await masques();
  verifier(m3.masques === m1.masques && !(await selection()).ficheVisible, `Ctrl Y : masquée de nouveau (${m3.masques} maillages)`);
  // Échap sans sélection réaffiche tout : Ctrl Z le défait aussi
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const m4 = await masques();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  const m5 = await masques();
  verifier(m4.masques === 0 && m5.masques === m1.masques, `Échap réaffiche tout (${m4.masques}), Ctrl Z remasque (${m5.masques})`);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(150);
  verifier((await masques()).masques === 0, "Ctrl Maj Z : rétablit le réaffichage");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const m6 = await masques();
  verifier(m6.masques === 0 && m6.annulables === 0 && (await selection()).structure === avant.structure,
    "deux Ctrl Z : retour à l'état de départ, structure sélectionnée");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const action = await page.evaluate(() => document.getElementById("etat-action").textContent);
  verifier(/Rien à annuler/.test(action), `Ctrl Z de trop : « ${action} »`);
  // Dans un champ de saisie, Ctrl Z reste l'annulation de frappe
  await page.evaluate(() => window.__atlas.deselectionner());
  await page.evaluate(() => window.__atlas.selectionnerStructure("A63", "droit"));
  await page.keyboard.press("h");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("femur");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  verifier((await masques()).masques > 0, "Ctrl Z dans la recherche : le masquage n'est pas annulé");
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // 2. Focus d'un os par le catalogue : fémur droit (côté par défaut)
  await page.keyboard.press("g");
  await page.keyboard.type("femur");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__atlas.focusTest.actif?.id === "femur-droit", null, { timeout: 15000 });
  await attendreLegendes();
  const f = await page.evaluate(() => ({
    os: window.__atlas.modeles.modeOs,
    legendes: window.__atlas.legendesTest.nombre,
    affichees: window.__atlas.legendesTest.affichees.length,
    rubriques: [...document.querySelectorAll("#zone-liste h4.rubrique")].map((h) => h.childNodes[0].textContent.trim()),
    roneo: document.querySelectorAll("#zone-liste .compte.roneo").length,
    arteres: window.__atlas.modeles.estVisible("arteres"),
  }));
  verifier(f.os === "opaque" && !f.arteres, `focus fémur droit : os ${f.os}, artères ${f.arteres ? "affichées" : "masquées"}`);
  verifier(f.legendes >= 20 && f.affichees >= 8, `${f.legendes} légendes sur le fémur, ${f.affichees} affichées de face`);
  verifier(f.rubriques.length >= 3, `repères rangés par rubrique : ${f.rubriques.join(", ")}`);
  verifier(f.roneo > 0, `${f.roneo} repères marqués « ronéo »`);
  await page.screenshot({ path: resolve(CAPTURES, "os_femur_droit.png") });

  // Clic sur une légende de repère : elle seule s'allume
  const etiquette = await page.$(".legende.repere:not([hidden])");
  const nom = (await etiquette.textContent()).trim();
  await etiquette.click();
  await page.waitForTimeout(250);
  const allumees = await page.evaluate(() => document.querySelectorAll(".legende.repere.actif:not([hidden])").length);
  const fil = await page.evaluate(() => window.__atlas.filTest());
  verifier(allumees === 1 && fil[fil.length - 1].toLowerCase() === nom.toLowerCase(),
    `clic sur « ${nom} » : ${allumees} étiquette allumée, fil ${fil.join(" / ")}`);
  await page.evaluate(() => window.__atlas.deselectionner());

  // Repère choisi dans la liste alors qu'il est caché : la vue tourne vers lui
  const cache = await page.evaluate(() => {
    const vus = new Set(window.__atlas.legendesTest.affichees.map((a) => a.nom));
    const b = [...document.querySelectorAll("#zone-liste button[data-repere]")].find((x) => !vus.has(x.dataset.repere));
    return b?.dataset.repere ?? null;
  });
  if (cache) {
    await page.click(`#zone-liste button[data-repere="${cache.replace(/"/g, '\\"')}"]`);
    await attendreLegendes();
    const vu = await page.evaluate((n) => window.__atlas.legendesTest.affichees.some((a) => a.nom === n), cache);
    verifier(vu, `repère caché « ${cache} » choisi dans la liste : la vue tourne, son étiquette apparaît`);
    await page.evaluate(() => window.__atlas.deselectionner());
    await page.evaluate(() => window.__atlas.focusTest.recadrer());
    await attendreLegendes();
  }

  // 3. Interrogation : T, réponse juste, réponse fausse, arrêt
  await page.keyboard.press("t");
  await page.waitForTimeout(300);
  const q1 = await page.evaluate(() => window.__atlas.interrogationTest.etatTest);
  const muette = await page.evaluate(() => window.__atlas.legendesTest.mode === "numeros"
    && [...document.querySelectorAll(".legende:not([hidden])")].every((b) => !b.querySelector(".nom")));
  verifier(q1.active && q1.question && muette && await page.isVisible("#interrogation"),
    `T : interrogation de ${q1.total} questions, planche muette, première « ${q1.question} »`);
  const cliquer = async (bon) => page.evaluate((juste) => {
    const it = window.__atlas.interrogationTest.etatTest;
    const L = window.__atlas.legendesTest;
    const cible = L.affichees.find((a) => (a.nom === it.question) === juste);
    document.querySelector(`.legende[data-legende="${CSS.escape(cible.id)}"]`).click();
    return cible.nom;
  }, bon);
  await cliquer(true);
  await page.waitForTimeout(900);
  const q2 = await page.evaluate(() => window.__atlas.interrogationTest.etatTest);
  verifier(q2.justes === 1 && q2.index === 1, `bonne réponse : ${q2.justes} juste, question suivante (${q2.index + 1}/${q2.total})`);
  const faux = await cliquer(false);
  await page.waitForTimeout(200);
  const marques = await page.evaluate(() => ({
    faux: document.querySelectorAll(".legende.faux").length, attendu: document.querySelectorAll(".legende.attendu").length,
  }));
  verifier(marques.faux === 1 && marques.attendu >= 1, `mauvaise réponse (« ${faux} ») : marquée, la bonne allumée`);
  await page.screenshot({ path: resolve(CAPTURES, "os_interrogation.png") });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const q3 = await page.evaluate(() => window.__atlas.interrogationTest.etatTest);
  verifier(q3.index === 2 && q3.justes === 1, `Entrée : question ${q3.index + 1}`);
  // Pendant l'interrogation, un clic sur le modèle ne sélectionne rien (la fiche donnerait le nom)
  const canevas = await (await page.$("#vue3d canvas")).boundingBox();
  await page.mouse.click(canevas.x + canevas.width / 2, canevas.y + canevas.height / 2);
  await page.waitForTimeout(200);
  verifier(!(await selection()).ficheVisible, "clic sur le modèle pendant l'interrogation : aucune fiche");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const fin = await page.evaluate(() => ({ active: window.__atlas.interrogationTest.etatTest.active,
    mode: window.__atlas.legendesTest.mode, focus: window.__atlas.focusTest.actif?.id }));
  verifier(!fin.active && fin.mode === "noms" && fin.focus === "femur-droit",
    `Échap : interrogation arrêtée, légendes ${fin.mode}, focus gardé`);

  // 4. Côté gauche par le catalogue : os coxal gauche
  await page.keyboard.press("g");
  await page.click('#catalogue [data-cote="gauche"]');
  await page.click('#catalogue-os button[data-organe="coxal"]');
  await page.waitForFunction(() => window.__atlas.focusTest.actif?.id === "coxal-gauche", null, { timeout: 15000 });
  await attendreLegendes();
  const c = await page.evaluate(() => ({ n: window.__atlas.legendesTest.nombre, aff: window.__atlas.legendesTest.affichees.length }));
  verifier(c.n >= 40 && c.aff >= 8, `os coxal gauche : ${c.n} légendes, ${c.aff} affichées`);
  await page.screenshot({ path: resolve(CAPTURES, "os_coxal_gauche.png") });

  // 5. Organe après un os : les os reprennent leur mode ; sortie du focus aussi
  await page.evaluate(() => window.__atlas.focusTest.entrerOrgane("larynx"));
  await attendreLegendes();
  const l = await page.evaluate(() => ({ os: window.__atlas.modeles.modeOs, n: window.__atlas.legendesTest.nombre }));
  verifier(l.os === "repere" && l.n >= 30, `larynx après un os : os en ${l.os}, ${l.n} légendes (cartilages compris)`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  verifier(!(await page.evaluate(() => window.__atlas.focusTest.actif)), "Échap : focus quitté");

  verifier(erreurs.length === 0, erreurs.length ? `erreurs de page : ${erreurs.slice(0, 3).join(" | ")}` : "aucune erreur dans la console");
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
console.log(echecs ? `[FAIL] ${echecs} vérification(s) en échec.` : "[OK] toutes les vérifications des os passent.");
process.exit(echecs ? 1 : 0);
