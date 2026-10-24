import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Les GLB restent dans ../modeles (sortie du pipeline) : on les sert sous /modeles/ sans les copier
const DOSSIER_MODELES = resolve(__dirname, "..", "modeles");

function servirModeles(): Plugin {
  const intercepter = (req: { url?: string }, res: import("node:http").ServerResponse, suite: () => void) => {
    const m = req.url?.match(/^\/modeles\/([\w.-]+\.glb)(\?.*)?$/);
    if (!m) return suite();
    const chemin = resolve(DOSSIER_MODELES, m[1]);
    if (!chemin.startsWith(DOSSIER_MODELES) || !existsSync(chemin)) {
      res.statusCode = 404;
      res.end(`Modèle introuvable : ${m[1]}. Lancer python -I pipeline/convertir_glb.py --compresser.`);
      return;
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Content-Length", statSync(chemin).size);
    createReadStream(chemin).pipe(res);
  };
  return {
    name: "servir-modeles",
    configureServer: (serveur) => { serveur.middlewares.use(intercepter); },
    configurePreviewServer: (serveur) => { serveur.middlewares.use(intercepter); },
  };
}

// Lanceur local (lanceur/, en Go) : API des fiches et ronéos ; port réglable pour que les tests utilisent une base de test
const API = `http://127.0.0.1:${process.env.ATLAS_API_PORT ?? "8765"}`;
const relais = { "/api": { target: API, changeOrigin: false }, "/roneos": { target: API, changeOrigin: false } };

export default defineConfig({
  plugins: [servirModeles()],
  server: { port: Number(process.env.ATLAS_VITE_PORT ?? 5173), strictPort: true, open: false, proxy: relais },
  preview: { port: 4173, strictPort: true, proxy: relais },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
