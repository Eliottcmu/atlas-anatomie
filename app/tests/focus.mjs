// Test du focus : chaque région et chaque organe s'ouvre, affiche quelque chose, liste son contenu,
// et ce contenu se sélectionne depuis la liste et par un vrai clic dans la vue découpée.
//
// Usage : node tests/focus.mjs
// Sortie : rapports/test_focus.md et captures dans rapports/captures/focus_*.png

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { demarrerServeurTest, PORT_API_TEST } from "./serveur_test.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAPPORTS = resolve(APP, "..", "rapports");
const CAPTURES = new Set(["main-droit", "genou-gauche", "tete", "thorax", "pied-droit", "coeur", "poumon-droit", "encephale", "foie", "reins"]);
const journal = (n, m) => console.log(`[${n}] ${m}`);

// Serveur des fiches sur une copie jetable de la base, et Vite sur un port de test
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
await page.goto(serveur.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300_000 });
mkdirSync(resolve(RAPPORTS, "captures"), { recursive: true });
const atlas = await page.evaluate(() => fetch("/donnees/atlas.json").then((r) => r.json()));

const cas = [
  ...atlas.regions.map((r) => ({ type: "region", id: r.id, nom: r.nom })),
  ...atlas.organes.map((o) => ({ type: "organe", id: o.id, nom: o.nom })),
];
const resultats = [];
for (const c of cas) {
  const debut = Date.now();
  await page.evaluate(async ([t, id]) => {
    const f = window.__atlas.focusTest;
    if (t === "region") await f.entrerRegion(id); else await f.entrerOrgane(id);
  }, [c.type, c.id]);
  await page.waitForTimeout(750);
  // Les légendes sont posées après l'arrêt de la caméra : on attend la fin de la transition
  await page.waitForFunction(() => !window.__atlas.focusTest || window.__atlas.legendesTest.affichees.length > 0
    || window.__atlas.legendesTest.nombre === 0, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(250);
  const bilan = await page.evaluate(() => ({
    bandeau: [...document.querySelectorAll("#fil-ariane li")][1]?.textContent ?? "",
    legendes: window.__atlas.legendesTest.nombre,
    legendesAffichees: window.__atlas.legendesTest.affichees.length,
    zone: !document.getElementById("zone").hidden,
    entrees: document.querySelectorAll("#zone-liste li button").length,
    action: document.getElementById("etat-action").textContent,
  }));
  if (CAPTURES.has(c.id)) await page.screenshot({ path: resolve(RAPPORTS, "captures", `focus_${c.id}.png`) });

  // Sélection depuis la liste, puis vrai clic dans la vue sur la même structure ou partie
  let liste = false, clic = false, cible = "";
  // Les étiquettes recouvrent parfois le modèle : pas de légendes pendant les vrais clics
  await page.evaluate(() => window.__atlas.legendesTest.definirMode("aucune"));
  const bouton = await page.$("#zone-liste li button");
  if (bouton) {
    cible = (await bouton.textContent()).trim();
    const attendu = await bouton.evaluate((b) => ({ structure: b.dataset.structure || null, noeud: b.dataset.noeud || null }));
    await bouton.click();
    await page.waitForTimeout(150);
    const e1 = await page.evaluate(() => window.__atlas.etatSelection());
    liste = e1.ficheVisible && (attendu.structure ? e1.structure === attendu.structure : e1.noeud === attendu.noeud);
    const cles = await page.evaluate((a) => {
      const s = window.__atlas.etatSelection();
      return a.noeud ? [a.noeud] : (window.__atlas.clesTest(s.structure, s.cote));
    }, attendu);
    // Échap sans sélection quitterait le focus : on ferme la sélection par l'API
    await page.evaluate(() => window.__atlas.deselectionner());
    await page.evaluate(() => window.__atlas.focusTest.recadrer());
    const points = await page.evaluate((k) => window.__atlas.pointsSur(k), cles);
    for (const p of points.slice(0, 6)) {
      await page.evaluate(() => window.__atlas.deselectionner());
      for (let rep = 0; rep < 4 && !clic; rep++) {
        await page.mouse.click(p.x, p.y);
        const e = await page.evaluate(() => window.__atlas.etatSelection());
        clic = attendu.structure ? e.structure === attendu.structure : e.noeud === attendu.noeud;
        if (!e.noeud) break;
      }
      if (clic) break;
    }
    await page.evaluate(() => window.__atlas.deselectionner());
  }
  await page.evaluate(() => window.__atlas.legendesTest.definirMode("noms"));
  const ok = bilan.bandeau === c.nom && bilan.entrees > 0 && liste && clic && bilan.legendesAffichees > 0;
  resultats.push({ ...c, ...bilan, cible, liste, clic, ok, duree: Date.now() - debut });
  journal(ok ? "OK" : "FAIL", `${c.type} ${c.nom} : ${bilan.entrees} entrées, ${bilan.legendesAffichees}/${bilan.legendes} légendes affichées, liste ${liste ? "oui" : "non"}, clic ${clic ? "oui" : "non"} (${cible})`);
}

// Coupe sagittale de la tête, pour la capture
await page.evaluate(async () => { await window.__atlas.focusTest.entrerRegion("tete"); window.__atlas.focusTest.definirCoupe("sagittale"); });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(RAPPORTS, "captures", "focus_tete_coupe_sagittale.png") });
await page.evaluate(() => { window.__atlas.focusTest.definirCoupe("aucune"); window.__atlas.focusTest.quitter(); });

// Catalogue ouvert
await page.keyboard.press("g");
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(RAPPORTS, "captures", "focus_catalogue.png") });

const ok = resultats.filter((r) => r.ok);
const lignes = [
  "# Test du focus (régions et organes)", "", "Fichier généré par app/tests/focus.mjs, ne pas éditer à la main.", "",
  `**${ok.length} focus valides sur ${resultats.length}.** Valide : fil d'Ariane au bon nom, liste de la zone non vide, au moins une légende affichée sur la vue, première entrée sélectionnable depuis la liste et par un vrai clic dans la vue découpée.`, "",
  "| Type | Focus | Entrées listées | Légendes affichées / prévues | Première entrée | Liste | Clic 3D | Durée |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...resultats.map((r) => `| ${r.type} | ${r.nom} | ${r.entrees} | ${r.legendesAffichees} / ${r.legendes} | ${r.cible || "-"} | ${r.liste ? "oui" : "NON"} | ${r.clic ? "oui" : "NON"} | ${(r.duree / 1000).toFixed(1)} s |`),
  "", erreurs.length ? `Erreurs de la page : ${erreurs.slice(0, 10).join(" ; ")}` : "Aucune erreur dans la console de la page.",
];
writeFileSync(resolve(RAPPORTS, "test_focus.md"), lignes.join("\n") + "\n", "utf-8");
journal(ok.length === resultats.length && !erreurs.length ? "OK" : "WARN", `${ok.length}/${resultats.length} focus valides. Rapport : rapports/test_focus.md`);
if (erreurs.length) journal("WARN", `${erreurs.length} erreurs dans la console : ${erreurs[0]}`);
await nav.close();
await serveur.close();
api.arreter();
process.exit(ok.length === resultats.length && !erreurs.length ? 0 : 1);
