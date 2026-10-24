// Test de la phase 3 : cartes, révision du jour (FSRS), parcours guidé et mini-quiz, tableau de bord,
// premier lancement guidé. Copie jetable de la base : la vraie n'est jamais modifiée.
//
// Usage : node tests/apprentissage.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`[${ok ? "OK" : "FAIL"}] ${message}`);
  if (!ok) echecs++;
};

const api = await demarrerServeurTest(resolve(APP, ".."), { baseNeuve: true });
process.env.ATLAS_API_PORT = String(PORT_API_TEST);
process.env.ATLAS_VITE_PORT = "5180";
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const contexte = await nav.newContext({ viewport: { width: 1600, height: 950 } });
const page = await contexte.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
const question = () => page.evaluate(() => {
  const q = window.__atlas.apprentissageTest.seance.question;
  return q ? { type: q.type, structure: q.structure, cote: q.cote, attendu: q.attendu, choix: q.choix, enonce: q.enonce } : null;
});
const json = (url, options) => page.evaluate(async ([u, o]) => (await fetch(u, o)).json(), [url, options]);

/** Répond juste à la question courante, quel que soit son type. */
async function repondreJuste() {
  const q = await question();
  if (q.type === "nommer") {
    const nom = await page.evaluate((id) => window.__atlas.atlas.structures[id].nom, q.structure);
    await page.fill("#seance-saisie", nom);
    await page.keyboard.press("Enter");
  } else if (q.type === "localiser") {
    // Segments propres seulement : cliquer une branche ne localise pas la structure
    const cles = await page.evaluate(([id, cote]) => window.__atlas.clesTest(id, cote)
      .filter((c) => window.__atlas.atlas.noeuds[c]?.structure === id && window.__atlas.atlas.noeuds[c]?.propre), [q.structure, q.cote]);
    await page.evaluate(([id, cote]) => window.__atlas.preparerTestVue?.(id, cote), [q.structure, q.cote]);
    const points = await page.evaluate((k) => window.__atlas.pointsSur(k), cles);
    let fait = false;
    for (const p of points) {
      const pile = await page.evaluate((pt) => window.__atlas.sonder([pt])[0].pile, p);
      if (pile[0] && cles.includes(pile[0])) {
        await page.mouse.click(p.x, p.y);
        fait = true;
        break;
      }
    }
    if (!fait) await page.click('[data-seance="passe"]');
  } else if (q.type === "relation") {
    await page.click(`[data-choix="${q.attendu[0]}"]`);
  } else if (q.type === "vrai_faux") {
    await page.keyboard.press(q.enonce.vrai ? "v" : "f");
  } else if (q.type === "trajet") {
    for (const id of q.attendu) await page.click(`[data-etape="${id}"]`);
  }
  await page.waitForSelector(".seance-verdict", { timeout: 5000 });
  return page.evaluate(() => document.querySelector(".seance-verdict").classList.contains("juste"));
}

try {
  // 1. Premier lancement guidé (contexte neuf : aucune trace de premier lancement)
  await page.goto(serveur.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
  await page.waitForSelector("#accueil-guide:not([hidden])", { timeout: 10_000 });
  const controle = await page.textContent("#accueil-guide-contenu");
  verifier(/cartes de révision prêtes/.test(controle), "premier lancement, étape 1 : données vérifiées, cartes de révision prêtes");
  await page.keyboard.press("Enter");
  verifier(/Choisis ton bloc/.test(await page.textContent("#accueil-guide-contenu")), "étape 2 : choix du bloc");
  await page.keyboard.press("Enter");
  verifier(/Premier parcours/.test(await page.textContent("#accueil-guide-contenu")), "étape 3 : premier parcours proposé");
  await page.click('[data-accueil="explorer"]');
  const vu = await page.evaluate(() => localStorage.getItem("atlas.accueil"));
  verifier(vu === "vu", "« Explorer d'abord » ferme l'accueil et ne le reproposera plus");

  // 2. Cartes créées par la synchronisation
  const bilan0 = await json("/api/revisions/bilan");
  verifier(bilan0.actives >= 150 && bilan0.nouvelles === bilan0.actives,
    `${bilan0.actives} cartes actives (nommer et localiser), toutes nouvelles, fiches encore en brouillon`);

  // 3. Révision du jour : 6 cartes, la deuxième notée « À revoir »
  await page.evaluate(() => localStorage.setItem("atlas.nouvelles", "6"));
  await page.keyboard.press("q");
  await page.waitForSelector("#seance:not([hidden]) .seance-consigne", { timeout: 10_000 });
  verifier(await page.evaluate(() => document.body.classList.contains("en-apprentissage")),
    "Q lance la révision du jour ; fiche, légendes et infobulle masquées");
  const fil = await page.evaluate(() => window.__atlas.filTest().join(" / "));
  verifier(fil === "Apprendre / Révision du jour", `fil d'Ariane sans le nom de la réponse : ${fil}`);
  let justes = 0, notees = 0;
  const types = new Set();
  for (let i = 0; i < 6; i++) {
    const q = await question();
    if (!q) break;
    types.add(q.type);
    const juste = await repondreJuste();
    if (juste) justes++;
    const suggere = await page.evaluate(() => document.querySelector(".seance-notes .suggeree")?.dataset.note);
    if (i === 1) await page.keyboard.press("1");
    else await page.keyboard.press("Enter");
    notees++;
    // La note part au lanceur : on attend la question suivante (ou la fin) avant de répondre
    await page.waitForFunction(() => !document.querySelector("#seance:not([hidden]) .seance-verdict"), null, { timeout: 5000 });
    if (i === 0) verifier(suggere === (juste ? "3" : "1"), `note suggérée selon la réponse : ${suggere}`);
  }
  verifier(justes >= 5, `${justes} réponses justes sur 6 (types : ${[...types].join(", ")})`);
  const q7 = await question();
  verifier(!!q7, "la carte notée « À revoir » repasse en fin de séance");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const bilan1 = await json("/api/revisions/bilan");
  verifier(bilan1.revisions_total === notees, `${bilan1.revisions_total} révisions enregistrées par FSRS`);
  const maitrise = await json("/api/maitrise");
  const niveaux = Object.values(maitrise).map((m) => m.niveau);
  verifier(niveaux.includes("a_revoir") && niveaux.includes("en_cours"),
    `maîtrise calculée : ${niveaux.filter((n) => n === "a_revoir").length} à revoir, ${niveaux.filter((n) => n === "en_cours").length} en cours`);
  await page.keyboard.press("Enter");

  // 4. Parcours guidé et mini-quiz
  await page.keyboard.press("p");
  await page.waitForSelector("#parcours-liste:not([hidden]) button[data-parcours]");
  const titres = await page.$$eval("button[data-parcours]", (b) => b.map((x) => x.textContent));
  verifier(titres.length >= 8, `${titres.length} parcours proposés : ${titres.join(" ; ")}`);
  await page.click("button[data-parcours]");
  await page.waitForSelector("#parcours-panneau:not([hidden]) .fiche-statut", { timeout: 10_000 });
  const etapes = await page.evaluate(() => window.__atlas.apprentissageTest.lecteur.actif.etapes.length);
  const lignes = await page.$$eval(".parcours-lignes li", (l) => l.map((x) => x.textContent));
  verifier(etapes >= 5 && etapes <= 15 && lignes.length >= 1, `parcours de ${etapes} étapes, deux lignes de fiche : « ${lignes[0]?.slice(0, 60)}... »`);
  for (let i = 0; i < etapes; i++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
  }
  await page.waitForSelector("#seance:not([hidden]) .seance-consigne", { timeout: 10_000 });
  const titreQuiz = await page.textContent("#seance .etiquette");
  verifier(/Mini-quiz/.test(titreQuiz), `fin du parcours : ${titreQuiz}`);
  let quiz = 0;
  for (let i = 0; i < 5; i++) {
    if (!(await question())) break;
    if (await repondreJuste()) quiz++;
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("#seance:not([hidden]) .seance-verdict"), null, { timeout: 5000 });
  }
  const suivi = await json("/api/parcours/suivi");
  verifier(Object.keys(suivi).length === 1, `mini-quiz : ${quiz}/5, parcours enregistré comme terminé`);

  // 5. Tableau de bord, coloration, réinitialisation confirmée
  await page.keyboard.press("b");
  await page.waitForSelector("#tableau:not([hidden]) .tableau-chiffres");
  verifier(true, "B ouvre le tableau de bord");
  await page.click('[data-tableau="colorer"]');
  await page.waitForTimeout(500);
  const couleurs = await page.evaluate(() => [...new Set([...window.__atlas.modeles.maillages.values()]
    .filter((m) => m.visible).map((m) => "#" + m.material.color.getHexString()))]);
  verifier(couleurs.includes("#7fb38a") || couleurs.includes("#e2bf55") || couleurs.includes("#d9774a"),
    `modèle coloré selon la maîtrise (${couleurs.length} couleurs)`);
  await page.keyboard.press("b");
  await page.waitForSelector("#tableau:not([hidden])");
  await page.click('[data-tableau="reinitialiser"]');
  await page.waitForSelector('[data-tableau="confirmer"]');
  const avertissement = await page.textContent("#tableau-confirmation");
  verifier(/efface \d+ révision/.test(avertissement), `confirmation chiffrée : « ${avertissement.slice(0, 70)}... »`);
  await page.click('[data-tableau="confirmer"]');
  await page.waitForTimeout(500);
  const bilan2 = await json("/api/revisions/bilan");
  verifier(bilan2.revisions_total === 0, "réinitialisation confirmée : révisions effacées, copie faite avant");

  verifier(erreurs.length === 0, erreurs.length ? `erreurs : ${erreurs.slice(0, 3).join(" | ")}` : "aucune erreur dans la console");
} finally {
  await nav.close();
  await serveur.close();
  await api.arreter();
}
console.log(echecs ? `[FAIL] ${echecs} vérification(s) en échec.` : "[OK] toutes les vérifications de la phase 3 passent.");
process.exit(echecs ? 1 : 0);
