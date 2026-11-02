/**
 * Construit la distribution Windows : exécutable autonome + archive ZIP.
 *
 * Étapes : compilation TypeScript → bundle esbuild → préparation de la base
 * Node (icône) → vendorisation de Three.js → pkg → dossier de distribution →
 * archive ZIP → empreintes SHA-256.
 *
 * L'icône est appliquée au binaire Node de base AVANT pkg, jamais après : pkg
 * ajoute son payload (données + préambule) à la fin de ce binaire et y inscrit
 * des offsets absolus (PAYLOAD_POSITION / PRELUDE_POSITION). Réécrire les
 * ressources PE d'un exécutable déjà empaqueté décale ce payload et rend ces
 * offsets invalides, ce qui provoque un « SyntaxError: Unexpected string » au
 * démarrage (le préambule est lu au mauvais endroit).
 *
 * Sortie : release_dist/HUD-FH6-<version>-win-x64/ et
 * release_dist/HUD-FH6-<version>-win-x64.zip
 */

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pkgFetch from "@yao-pkg/pkg-fetch";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkgJson.version;
/** Cible pkg unique, déclarée dans package.json (`node22-win-x64`). */
const TARGET = pkgJson.pkg?.targets?.[0] ?? "node22-win-x64";
const [NODE_RANGE, TARGET_PLATFORM, TARGET_ARCH] = TARGET.split("-");
const BASE_NAME = `HUD-FH6-${VERSION}-${TARGET_PLATFORM}-${TARGET_ARCH}`;

const RELEASE_DIR = join(ROOT, "release_dist");
const STAGE_DIR = join(RELEASE_DIR, BASE_NAME);
const EXE_NAME = "HUD_FH6.exe";
const EXE_PATH = join(STAGE_DIR, EXE_NAME);
const ZIP_PATH = join(RELEASE_DIR, `${BASE_NAME}.zip`);

const ICON_PATH = join(ROOT, "assets", "HUD.ico");
/** Copie locale du binaire Node de base, recevant l'icône avant pkg. */
const BASE_NODE_PATH = join(ROOT, "build", "base-node.exe");
/** Three.js servi au navigateur, physiquement à côté de l'exécutable. */
const VENDOR_DIR = join(STAGE_DIR, "vendor", "three");

async function step(label, action) {
  const startedAt = Date.now();
  process.stdout.write(`\n▶ ${label}…\n`);
  await action();
  console.log(`  ✔ ${label} (${((Date.now() - startedAt) / 1000).toFixed(1)} s)`);
}

function run(command, options = {}) {
  execSync(command, { cwd: ROOT, stdio: "inherit", ...options });
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

DOSSIER vendor
Le sous-dossier vendor\\three contient Three.js, servi au navigateur pour la
carte 3D. Il doit rester à côté de ${EXE_NAME} (ne pas déplacer l'exécutable seul).

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

await step("Nettoyage des sorties", () => {
  rmSync(join(ROOT, "build"), { recursive: true, force: true });
  rmSync(RELEASE_DIR, { recursive: true, force: true });
  mkdirSync(STAGE_DIR, { recursive: true });
});

await step("Compilation TypeScript", () => run("npx tsc -p tsconfig.json"));

await step("Bundle du serveur (esbuild)", () => run("node scripts/bundle.mjs"));

await step("Préparation de la base Node et de l'icône", async () => {
  // `need()` renvoie immédiatement PKG_NODE_PATH s'il est défini : on le
  // neutralise le temps de récupérer le binaire officiel depuis le cache.
  delete process.env.PKG_NODE_PATH;
  const stockBinary = await pkgFetch.need({
    nodeRange: NODE_RANGE,
    platform: TARGET_PLATFORM,
    arch: TARGET_ARCH,
  });

  copyFileSync(stockBinary, BASE_NODE_PATH);
  // pkg ne sait pas appliquer d'icône : on réécrit les ressources PE de la
  // base Node ici, avant l'empaquetage (voir l'en-tête de ce fichier).
  execFileSync(process.execPath, [join(ROOT, "scripts", "set-icon.mjs"), BASE_NODE_PATH, ICON_PATH], {
    stdio: "inherit",
  });
});

await step("Vendorisation de Three.js", () => {
  // Le snapshot pkg n'embarque PAS node_modules/three : les modules ESM sont
  // recopiés à côté de l'exécutable et servis depuis <exe>/vendor/three.
  const source = join(ROOT, "node_modules", "three");
  rmSync(VENDOR_DIR, { recursive: true, force: true });
  mkdirSync(join(VENDOR_DIR, "build"), { recursive: true });
  for (const file of ["three.module.js", "three.core.js"]) {
    copyFileSync(join(source, "build", file), join(VENDOR_DIR, "build", file));
  }
  mkdirSync(join(VENDOR_DIR, "examples", "jsm", "controls"), { recursive: true });
  for (const control of ["OrbitControls.js", "PointerLockControls.js"]) {
    copyFileSync(
      join(source, "examples", "jsm", "controls", control),
      join(VENDOR_DIR, "examples", "jsm", "controls", control),
    );
  }
});

await step("Exécutable Windows (pkg)", () => {
  // PKG_NODE_PATH force pkg à repartir de notre base déjà icônée ; les offsets
  // du payload sont alors calculés sur le fichier définitif.
  run(`npx pkg build/server.cjs --config package.json --output "${EXE_PATH}"`, {
    env: { ...process.env, PKG_NODE_PATH: BASE_NODE_PATH },
  });
});

await step("Fichiers d'accompagnement", () => {
  writeFileSync(join(STAGE_DIR, "LISEZ-MOI.txt"), README, "utf8");
  copyFileSync(join(ROOT, "README.md"), join(STAGE_DIR, "README.md"));
});

await step("Archive ZIP", () => {
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

await step("Empreintes SHA-256", () => {
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
