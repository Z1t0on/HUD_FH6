/**
 * Schéma des colonnes exposées pour l'analyse d'une session enregistrée.
 *
 * Les paquets bruts restent la source de vérité sur disque : ce schéma ne sert
 * qu'à convertir une session en colonnes Float32 lisibles par le navigateur.
 * Ajouter un champ ici ne casse pas les sessions existantes : l'en-tête envoyé
 * au client décrit l'ordre et les noms des colonnes.
 */

import type { Telemetry } from "./decode.js";

export interface FieldInfo {
  /** Identifiant stable utilisé par le client. */
  key: string;
  /** Libellé français affiché dans l'interface. */
  label: string;
  unit?: string;
}

export interface FieldDef extends FieldInfo {
  get: (telemetry: Telemetry) => number;
}

/** Première colonne, calculée à partir de l'horodatage du paquet. */
export const TIME_FIELD: FieldInfo = {
  key: "time",
  label: "Temps de session",
  unit: "s",
};

export const ANALYSIS_FIELDS: FieldDef[] = [
  { key: "raceTime", label: "Temps de course", unit: "s", get: (t) => t.currentRaceTime },
  { key: "lapNumber", label: "Tour", get: (t) => t.lapNumber },
  { key: "lapTime", label: "Temps du tour", unit: "s", get: (t) => t.currentLap },
  { key: "lastLap", label: "Dernier tour", unit: "s", get: (t) => t.lastLap },
  { key: "bestLap", label: "Meilleur tour", unit: "s", get: (t) => t.bestLap },
  { key: "racePosition", label: "Position", get: (t) => t.racePosition },

  { key: "x", label: "Position X", unit: "m", get: (t) => t.position.x },
  { key: "y", label: "Altitude", unit: "m", get: (t) => t.position.y },
  { key: "z", label: "Position Z", unit: "m", get: (t) => t.position.z },

  { key: "speed", label: "Vitesse", unit: "m/s", get: (t) => t.speed },
  { key: "rpm", label: "Régime", unit: "tr/min", get: (t) => t.rpm },
  { key: "engineMaxRpm", label: "Régime maxi", unit: "tr/min", get: (t) => t.engineMaxRpm },
  { key: "gear", label: "Rapport", get: (t) => t.gear },

  { key: "throttle", label: "Accélérateur", unit: "0-255", get: (t) => t.throttle },
  { key: "brake", label: "Frein", unit: "0-255", get: (t) => t.brake },
  { key: "clutch", label: "Embrayage", unit: "0-255", get: (t) => t.clutch },
  { key: "handbrake", label: "Frein à main", unit: "0-255", get: (t) => t.handbrake },
  { key: "steer", label: "Direction", unit: "-127..127", get: (t) => t.steer },

  { key: "accelX", label: "Accélération X", unit: "m/s²", get: (t) => t.acceleration.x },
  { key: "accelY", label: "Accélération Y", unit: "m/s²", get: (t) => t.acceleration.y },
  { key: "accelZ", label: "Accélération Z", unit: "m/s²", get: (t) => t.acceleration.z },

  { key: "velocityX", label: "Vitesse X", unit: "m/s", get: (t) => t.velocity.x },
  { key: "velocityY", label: "Vitesse Y", unit: "m/s", get: (t) => t.velocity.y },
  { key: "velocityZ", label: "Vitesse Z", unit: "m/s", get: (t) => t.velocity.z },

  { key: "yaw", label: "Lacet", unit: "rad", get: (t) => t.yaw },
  { key: "pitch", label: "Tangage", unit: "rad", get: (t) => t.pitch },
  { key: "roll", label: "Roulis", unit: "rad", get: (t) => t.roll },

  { key: "tireTempFL", label: "Temp. pneu AVG", unit: "°F", get: (t) => t.tireTemp.frontLeft },
  { key: "tireTempFR", label: "Temp. pneu AVD", unit: "°F", get: (t) => t.tireTemp.frontRight },
  { key: "tireTempRL", label: "Temp. pneu ARG", unit: "°F", get: (t) => t.tireTemp.rearLeft },
  { key: "tireTempRR", label: "Temp. pneu ARD", unit: "°F", get: (t) => t.tireTemp.rearRight },

  { key: "slipRatioFL", label: "Glisse AVG", get: (t) => t.tireSlipRatio.frontLeft },
  { key: "slipRatioFR", label: "Glisse AVD", get: (t) => t.tireSlipRatio.frontRight },
  { key: "slipRatioRL", label: "Glisse ARG", get: (t) => t.tireSlipRatio.rearLeft },
  { key: "slipRatioRR", label: "Glisse ARD", get: (t) => t.tireSlipRatio.rearRight },

  { key: "slipAngleFL", label: "Angle AVG", unit: "rad", get: (t) => t.tireSlipAngle.frontLeft },
  { key: "slipAngleFR", label: "Angle AVD", unit: "rad", get: (t) => t.tireSlipAngle.frontRight },
  { key: "slipAngleRL", label: "Angle ARG", unit: "rad", get: (t) => t.tireSlipAngle.rearLeft },
  { key: "slipAngleRR", label: "Angle ARD", unit: "rad", get: (t) => t.tireSlipAngle.rearRight },

  { key: "suspensionFL", label: "Suspension AVG", unit: "m", get: (t) => t.suspensionMeters.frontLeft },
  { key: "suspensionFR", label: "Suspension AVD", unit: "m", get: (t) => t.suspensionMeters.frontRight },
  { key: "suspensionRL", label: "Suspension ARG", unit: "m", get: (t) => t.suspensionMeters.rearLeft },
  { key: "suspensionRR", label: "Suspension ARD", unit: "m", get: (t) => t.suspensionMeters.rearRight },

  { key: "fuel", label: "Carburant", unit: "0-1", get: (t) => t.fuel },
  { key: "boost", label: "Surpression", unit: "PSI", get: (t) => t.boost },
  { key: "power", label: "Puissance", unit: "W", get: (t) => t.power },
  { key: "torque", label: "Couple", unit: "N·m", get: (t) => t.torque },
  { key: "distanceTraveled", label: "Distance", unit: "m", get: (t) => t.distanceTraveled },

  { key: "carOrdinal", label: "Voiture", get: (t) => t.carOrdinal },
  { key: "carClass", label: "Classe", get: (t) => t.carClass },
  { key: "performanceIndex", label: "Indice de performance", get: (t) => t.performanceIndex },
  { key: "drivetrain", label: "Transmission", get: (t) => t.drivetrain },
  { key: "numCylinders", label: "Cylindres", get: (t) => t.numCylinders },
  { key: "carGroup", label: "Groupe", get: (t) => t.carGroup },
];

export const ALL_FIELDS: FieldInfo[] = [
  TIME_FIELD,
  ...ANALYSIS_FIELDS.map(({ key, label, unit }) => ({ key, label, unit })),
];

/** Nombre de valeurs Float32 par échantillon (temps inclus). */
export const SAMPLE_STRIDE = ALL_FIELDS.length;
