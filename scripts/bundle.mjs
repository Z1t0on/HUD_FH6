/**
 * Assemble le serveur compilé (dist/) en un seul fichier CommonJS (build/server.cjs).
 *
 * pkg ne sait pas démarrer un projet ESM : ce bundle intermédiaire embarque tous
 * les modules du serveur, puis pkg y ajoute le runtime Node et les ressources.
 */

import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = join(ROOT, "build");

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [join(ROOT, "dist", "server.js")],
  outfile: join(OUT_DIR, "server.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  legalComments: "none",
  // `server.ts` garde un repli `import.meta.url` pour l'exécution ESM ; ici
  // `__dirname` existe toujours, ce repli n'est jamais évalué.
  logOverride: { "empty-import-meta": "silent" },
  logLevel: "warning",
});

console.log("[bundle] build/server.cjs prêt");
