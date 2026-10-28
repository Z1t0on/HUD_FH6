/**
 * Construit la distribution Windows : exécutable autonome + archive ZIP.
 *
 * Étapes : compilation TypeScript → bundle esbuild → pkg → dossier de
 * distribution → archive ZIP → empreintes SHA-256.
 *
 * Sortie : release/HUD-FH6-<version>-win-x64/ et release/HUD-FH6-<version>-win-x64.zip
 */

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkgJson.version;
const TARGET = "win-x64";
const BASE_NAME = `HUD-FH6-${VERSION}-${TARGET}`;

const RELEASE_DIR = join(ROOT, "release");
const STAGE_DIR = join(RELEASE_DIR, BASE_NAME);
const EXE_NAME = "HUD_FH6.exe";
const EXE_PATH = join(STAGE_DIR, EXE_NAME);
const ZIP_PATH = join(RELEASE_DIR, `${BASE_NAME}.zip`);

function step(label, action) {
  const startedAt = Date.now();
  process.stdout.write(`\n▶ ${label}…\n`);
  action();
  console.log(`  ✔ ${label} (${((Date.now() - startedAt) / 1000).toFixed(1)} s)`);
}

function run(command) {
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

const README = `HUD FH6 — télémétrie Forza Horizon 6
=====================================

Version ${VERSION} · Windows x64

DÉMARRAGE
1. Double-cliquez sur ${EXE_NAME}.
2. La fenêtre affiche l'adresse du dashboard (http://localhost:3000) et l'IPv4
   de ce PC à saisir dans le jeu.
3. Ouvrez cette adresse dans un navigateur.

CONFIGURATION DANS FORZA HORIZON 6
- Paramètres > ATH et gameplay > Data Out
- Data Out : ON
- IP : adresse IPv4 du PC HUD (affichée au démarrage)
- Port : 9999 (éviter la plage 5200-5300, réservée par le jeu)

PARE-FEU WINDOWS (une fois, terminal administrateur)
  New-NetFirewallRule -DisplayName "HUD FH6 Data Out" -Direction Inbound -Protocol UDP -LocalPort 9999 -Action Allow

UTILISATION
- Unités : bouton KM/H · °C (barre supérieure) pour passer en mph / °F / ft.
- Sessions : chaque roulage est archivé automatiquement et consultable en analyse
  (clic sur le tracé pour lire la télémétrie de l'instant).
- Les sessions sont écrites dans le dossier data\\sessions, à côté de l'exécutable.

OPTIONS (variables d'environnement)
  UDP_PORT          port d'écoute Data Out (défaut 9999)
  HUD_PORT          port HTTP du dashboard (défaut 3000)
  HUD_SESSIONS_DIR  dossier d'archivage des sessions
  HUD_SESSION_KEEP  nombre de sessions conservées (défaut 40)

ARRÊT
Fermez la fenêtre de l'application (ou Ctrl+C).

REMARQUE
L'exécutable n'est pas signé numériquement. Au premier lancement, Windows
SmartScreen peut afficher un avertissement : cliquez sur « Informations
complémentaires » puis « Exécuter quand même ».
`;

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

step("Nettoyage des sorties", () => {
  rmSync(join(ROOT, "build"), { recursive: true, force: true });
  rmSync(RELEASE_DIR, { recursive: true, force: true });
  mkdirSync(STAGE_DIR, { recursive: true });
});

step("Compilation TypeScript", () => run("npx tsc -p tsconfig.json"));

step("Bundle du serveur (esbuild)", () => run("node scripts/bundle.mjs"));

step("Vendorisation de Three.js", () => {
  // pkg réécrit les modules ESM trouvés sous node_modules : on sert une copie
  // figée (vendor/, ignorée par Git) que pkg inclut telle quelle.
  const source = join(ROOT, "node_modules", "three");
  const target = join(ROOT, "vendor", "three");
  rmSync(join(ROOT, "vendor"), { recursive: true, force: true });
  mkdirSync(join(target, "build"), { recursive: true });
  for (const file of ["three.module.js", "three.core.js"]) {
    copyFileSync(join(source, "build", file), join(target, "build", file));
  }
  cpSync(join(source, "examples", "jsm", "controls"), join(target, "examples", "jsm", "controls"), {
    recursive: true,
  });
});

step("Exécutable Windows (pkg)", () => {
  run(
    `npx pkg build/server.cjs --config package.json --targets node22-win-x64 --output "${EXE_PATH}"`,
  );
});

step("Fichiers d'accompagnement", () => {
  writeFileSync(join(STAGE_DIR, "LISEZ-MOI.txt"), README, "utf8");
  copyFileSync(join(ROOT, "README.md"), join(STAGE_DIR, "README.md"));
});

step("Archive ZIP", () => {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${STAGE_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force`,
    ],
    { stdio: "inherit" },
  );
});

step("Empreintes SHA-256", () => {
  const lines = [
    `${sha256(EXE_PATH)}  ${EXE_NAME}`,
    `${sha256(ZIP_PATH)}  ${BASE_NAME}.zip`,
  ];
  writeFileSync(join(RELEASE_DIR, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));
});

const exeMb = (statSync(EXE_PATH).size / (1024 * 1024)).toFixed(1);
const zipMb = (statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(1);

console.log(`
Distributions prêtes :
  ${EXE_PATH}  (${exeMb} Mo)
  ${ZIP_PATH}  (${zipMb} Mo)
  ${join(RELEASE_DIR, "SHA256SUMS.txt")}
`);
