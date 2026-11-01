/**
 * Registre des tuiles du tableau de bord.
 *
 * L'ordre définit celui du menu « Panneaux ». Une tuile expose son libellé, sa
 * place par défaut et son montage ; `sessions` n'est pas une fenêtre flottante
 * mais la modale d'archives.
 */

import { clusterTile } from "./cluster.js";
import { gforceTile } from "./gforce.js";
import { inspectorTile } from "./inspector.js";
import { lapTile } from "./lap.js";
import { mapTile } from "./map.js";
import { pedalsTile } from "./pedals.js";
import { sessionsTile } from "./sessions.js";
import { tiresTile } from "./tires.js";

export const tiles = [
  lapTile,
  clusterTile,
  mapTile,
  tiresTile,
  pedalsTile,
  gforceTile,
  inspectorTile,
  sessionsTile,
];
