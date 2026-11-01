/**
 * Palette des tours.
 *
 * Teintes volontairement très écartées : les trois premiers tours sont
 * cyan / rose / jaune, lisibles côte à côte sur le tracé 3D.
 */

import * as THREE from "three";

const LAP_PALETTE = [
  "#00e5ff",
  "#ff4d9d",
  "#ffd21f",
  "#4ade80",
  "#a06cff",
  "#ff8a3d",
  "#4d9dff",
  "#ff5c5c",
  "#00ffd0",
  "#e6e6e6",
];

const LAP_COLORS = LAP_PALETTE.map((hex) => new THREE.Color(hex));

export function lapColorIndex(lapNumber) {
  const length = LAP_PALETTE.length;
  return ((Math.trunc(lapNumber) % length) + length) % length;
}

export function lapColorHex(lapNumber) {
  return LAP_PALETTE[lapColorIndex(lapNumber)];
}

export function lapColorRgb(lapNumber) {
  return LAP_COLORS[lapColorIndex(lapNumber)];
}
