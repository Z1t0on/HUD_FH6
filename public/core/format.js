/** Formatage des valeurs affichées par les tuiles. */

import { t, uiLocale } from "./i18n.js";
import { formatLength } from "./units.js";

/** Chrono au format m:ss.mmm, ou tirets si la valeur est absente. */
export function formatLap(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

/** Horloge de session au format m:ss.mmm, zéro si la valeur est absente. */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.000";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

/** Libellé du rapport engagé (le paquet FH6 code 0 = marche arrière, 1 = point mort). */
export function gearLabel(gear) {
  if (gear === 0) return "R";
  if (gear === 1) return "N";
  if (gear >= 2 && gear <= 11) return String(gear - 1);
  return "—";
}

/** Classe d'état d'un pneu à partir de sa température en °C. */
export function tireState(celsius) {
  if (celsius < 70) return "cold";
  if (celsius <= 100) return "ideal";
  if (celsius <= 115) return "hot";
  return "overheat";
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return formatLength(meters);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${t("unit.mo")}`;
  const megabytes = bytes / (1024 * 1024);
  const unit = megabytes < 1024 ? t("unit.mo") : t("unit.gb");
  const value = megabytes < 1024 ? megabytes : megabytes / 1024;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

export function formatDateTime(epochMs) {
  if (!Number.isFinite(epochMs)) return "—";
  return new Date(epochMs).toLocaleString(uiLocale(), {
    dateStyle: "short",
    timeStyle: "short",
  });
}
