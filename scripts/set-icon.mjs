/**
 * Applique l'icône du projet à un exécutable Windows (PE).
 *
 * pkg ne sait pas définir l'icône : on remplace directement les ressources
 * d'icônes du fichier PE (RT_GROUP_ICON / RT_ICON) avec la bibliothèque
 * `resedit`.
 *
 * IMPORTANT : la réécriture du PE déplace tout ce qui suit la dernière section.
 * Sur un exécutable déjà empaqueté par pkg, cela invalide les offsets absolus
 * du payload et du préambule (SyntaxError au démarrage). L'icône doit donc être
 * appliquée au binaire Node de base, AVANT l'empaquetage (cf. package.mjs).
 *
 * Usage : node scripts/set-icon.mjs <chemin.exe> <chemin.ico>
 */

import { readFileSync, writeFileSync } from "node:fs";

import * as ResEdit from "resedit";

const [exePath, icoPath] = process.argv.slice(2);

if (!exePath || !icoPath) {
  console.error("Usage : node scripts/set-icon.mjs <chemin.exe> <chemin.ico>");
  process.exit(1);
}

// `ignoreCert` autorise le parsing d'un binaire signé ; la signature est de
// toute façon invalidée par la modification, elle est donc supprimée.
const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
const resources = ResEdit.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(readFileSync(icoPath));
const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);

if (!iconGroups.length) {
  console.error("Aucun groupe d'icônes dans l'exécutable : icône non appliquée.");
  process.exit(1);
}

for (const group of iconGroups) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    group.id,
    group.lang,
    iconFile.icons.map((icon) => icon.data),
  );
}

resources.outputResource(exe);
writeFileSync(exePath, Buffer.from(exe.generate()));

const groups = iconGroups.map((group) => `${group.id}/${group.lang}`).join(", ");
console.log(`  ✔ icône appliquée (${iconFile.icons.length} tailles, groupe ${groups})`);
