// Démarre le lanceur (construction/lanceur-dev.exe) sur un dossier de données jetable, pour les tests.
// La vraie base n'est jamais modifiée : on part d'une copie, ou de la graine si aucune base n'existe.
// Le lanceur de développement se construit avec : python -I pipeline/construire_appli.py --dev

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const PORT_API_TEST = 8799;

// baseNeuve : partir de la graine seule, sans copier la base d'Eliott (tests qui supposent des cartes toutes nouvelles)
export async function demarrerServeurTest(racineProjet, { executable, options = [], baseNeuve = false } = {}) {
  const lanceur = executable ?? resolve(racineProjet, "construction", process.platform === "win32" ? "lanceur-dev.exe" : "lanceur-dev");
  if (!existsSync(lanceur)) {
    throw new Error(`Lanceur absent (${lanceur}). Le construire avec : python -I pipeline/construire_appli.py --dev`);
  }
  const dossier = mkdtempSync(join(tmpdir(), "atlas-test-"));
  const donnees = join(dossier, "donnees");
  mkdirSync(donnees, { recursive: true });
  const vraie = join(process.env.LOCALAPPDATA ?? "", "AtlasAnatomie", "anatomie.sqlite");
  if (existsSync(vraie) && !baseNeuve) copyFileSync(vraie, join(donnees, "anatomie.sqlite"));
  const args = executable ? options : ["-racine-projet", racineProjet, ...options];
  const processus = spawn(lanceur, ["-sans-navigateur", "-arret-inactivite", "0", "-port", String(PORT_API_TEST), ...args], {
    env: { ...process.env, ATLAS_DONNEES: donnees },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let journal = "";
  let termine = false;
  processus.stdout.on("data", (d) => { journal += d; });
  processus.stderr.on("data", (d) => { journal += d; });
  processus.on("exit", () => { termine = true; });
  const limite = Date.now() + 30_000;
  while (Date.now() < limite && !termine) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT_API_TEST}/api/etat`);
      if (r.ok) break;
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return {
    url: `http://127.0.0.1:${PORT_API_TEST}`,
    processus,
    journal: () => journal,
    termine: () => termine,
    arreter: () => {
      processus.kill();
      try { rmSync(dossier, { recursive: true, force: true }); } catch { /* fichier encore ouvert : sans gravité */ }
    },
  };
}
