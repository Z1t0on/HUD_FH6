/**
 * État partagé du HUD.
 *
 * Les tuiles lisent cet objet et n'écrivent que les champs dont elles sont
 * propriétaires : il n'y a donc qu'une seule source de vérité pour le paquet
 * courant, le mode d'affichage et le tracé direct.
 */

import { TRACK_CAPACITY } from "./constants.js";

export const state = {
  /** Dernier paquet reçu du flux Data Out. */
  latest: null,

  /** Télémétrie actuellement affichée (paquet direct ou échantillon d'archive). */
  lastTelemetry: null,

  /** "live" pendant le direct, "analysis" pendant l'exploration d'une archive. */
  mode: "live",

  /** Session archivée en cours d'analyse (null en direct). */
  analysis: null,

  /** Caméra verrouillée sur la voiture. */
  followCar: true,

  /** Sessions archivées connues du client. */
  sessions: [],

  /** Dernière réponse complète de GET /sessions. */
  sessionsPayload: null,

  /** Vitesse lissée du compteur, partagée entre tuiles et analyse. */
  smoothed: { speed: 0, initialized: false },

  /** Horodatage du dernier paquet et état « déjà reçu ». */
  activity: { lastPacketAt: 0, hasReceivedData: false },

  /** Tracé direct : points, segments et tampons GPU associés. */
  live: {
    points: [],
    pointCount: 0,
    segmentCount: 0,
    pointPositions: new Float32Array(TRACK_CAPACITY * 3),
    pointColors: new Float32Array(TRACK_CAPACITY * 3),
    segmentPositions: new Float32Array(TRACK_CAPACITY * 2 * 3),
    segmentColors: new Float32Array(TRACK_CAPACITY * 2 * 3),
  },
};
