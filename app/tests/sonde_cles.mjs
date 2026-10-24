// Sonde : position de chaque maillage Z-Anatomy dans la page, à comparer à modeles/index_zanatomy.csv
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serveur = await createServer({ root: APP, configFile: resolve(APP, "vite.config.ts"), logLevel: "error" });
await serveur.listen();
const nav = await chromium.launch({ channel: "msedge", headless: true });
const page = await nav.newPage();
await page.goto(serveur.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__atlas?.pret === true, null, { timeout: 300000 });
const pos = await page.evaluate(() => window.__atlas.positions());
const index = readFileSync(resolve(APP, "..", "modeles", "index_zanatomy.csv"), "utf-8").replace(/^﻿/, "").trim().split(/\r?\n/);
const tete = index[0].split(";");
let ecarts = 0;
for (const l of index.slice(1)) {
  const v = Object.fromEntries(l.split(";").map((x, i) => [tete[i], x]));
  const p = pos[v.objet];
  const d = p ? Math.hypot(p[0] - v.centre_x, p[1] - v.centre_y, p[2] - v.centre_z) : null;
  if (d === null || d > 0.01) { ecarts++; console.log("ECART", v.objet, p, [v.centre_x, v.centre_y, v.centre_z].map(Number), d); }
}
console.log(`${index.length - 1} objets, ${ecarts} écarts de position`);
await nav.close(); await serveur.close();
