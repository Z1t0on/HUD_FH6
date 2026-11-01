/**
 * Constantes partagées du HUD FH6.
 *
 * Les seuils d'instrumentation et de tracé sont regroupés ici pour que les
 * tuiles et le noyau parlent le même langage sans se copier les valeurs.
 */

/* Instruments */
export const ARC_CIRCUMFERENCE = 2 * Math.PI * 100;
export const SHIFT_THRESHOLD = 0.94;

/* G-Force */
export const G_SCALE = 2.5;
export const G_HISTORY_SECONDS = 2.2;

/* Tracé 3D */
export const TRACK_CAPACITY = 60000;
export const TRACK_MIN_DISTANCE = 1.2;
export const TRACK_TELEPORT_DISTANCE = 800;
export const TRACK_MAX_SEGMENT = 80;

/* Flux */
export const IDLE_TIMEOUT = 1500;

/* Boucle de rendu */
export const FRAME_INTERVAL_MS = 1000 / 60;
export const FRAME_WATCHDOG_MS = 400;

/* Grille de la carte */
export const GRID_CELL_METERS = 20;
