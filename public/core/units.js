/**
 * Système d'unités : métrique ou impérial.
 *
 * La langue et les unités sont deux axes indépendants : choisir l'anglais ne
 * force jamais les miles, et inversement. Seule exception historique : tant que
 * l'utilisateur n'a pas choisi sa langue, passer en impérial bascule l'interface
 * en anglais (et réciproquement).
 */

import { bus } from "./bus.js";
import { hasChosenLanguage, setLanguage, t } from "./i18n.js";
import { $ } from "./utils.js";
import { GRID_CELL_METERS } from "./constants.js";

const UNITS_STORAGE_KEY = "hud-fh6:units";
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.23693629;
const METERS_TO_FEET = 3.280839895;
const METERS_TO_MILES = 1 / 1609.344;

/** Pays qui utilisent encore les unités impériales dans la vie courante. */
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

/** Détecte le système d'unités : préférence mémorisée, sinon langue du navigateur. */
function detectUnitSystem() {
  try {
    const stored = localStorage.getItem(UNITS_STORAGE_KEY);
    if (stored === "metric" || stored === "imperial") return stored;
  } catch {
    // Stockage indisponible (navigation privée) : on garde la détection par langue.
  }

  const tags = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of tags) {
    if (!tag) continue;
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && IMPERIAL_REGIONS.has(region)) return "imperial";
    } catch {
      // Locale exotique : on retombe sur l'analyse de la chaîne.
    }
    if (/(?:^|[-_])US(?:$|[-_])/i.test(tag)) return "imperial";
  }
  return "metric";
}

let unitSystem = detectUnitSystem();

/** Système d'unités courant ("metric" ou "imperial"). */
export function currentUnitSystem() {
  return unitSystem;
}

export const isImperial = () => unitSystem === "imperial";

export function speedUnit() {
  return isImperial() ? "MPH" : "KM/H";
}

export function secondarySpeedUnit() {
  return isImperial() ? "KM/H" : "MPH";
}

/** Vitesse en m/s convertie dans l'unité principale. */
export function convertSpeed(metersPerSecond) {
  return isImperial() ? metersPerSecond * MS_TO_MPH : metersPerSecond * MS_TO_KMH;
}

/** Vitesse en m/s convertie dans l'unité secondaire (rappel). */
export function convertSecondarySpeed(metersPerSecond) {
  return isImperial() ? metersPerSecond * MS_TO_KMH : metersPerSecond * MS_TO_MPH;
}

export function lengthUnit() {
  return isImperial() ? "ft" : "m";
}

export function convertLength(meters) {
  return isImperial() ? meters * METERS_TO_FEET : meters;
}

export function formatLength(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (!isImperial()) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  }
  const feet = meters * METERS_TO_FEET;
  return feet >= 5280 ? `${(meters * METERS_TO_MILES).toFixed(1)} mi` : `${Math.round(feet)} ft`;
}

export function formatTemperature(fahrenheit) {
  if (!Number.isFinite(fahrenheit) || fahrenheit <= 0) return "—";
  return isImperial()
    ? `${Math.round(fahrenheit)}°F`
    : `${Math.round((fahrenheit - 32) / 1.8)}°C`;
}

/** Rappel d'échelle de la carte, dans l'unité et la langue courantes. */
export function mapScaleHint() {
  const cell = isImperial()
    ? `${Math.round(GRID_CELL_METERS * METERS_TO_FEET)} ft`
    : `${GRID_CELL_METERS} m`;
  return t("map.hint", { cell });
}

/** Met à jour le bouton d'unités de la barre supérieure. */
export function applyUnitLabels() {
  const unitsButton = $("units-toggle");
  if (!unitsButton) return;
  unitsButton.textContent = isImperial() ? "MPH · °F" : "KM/H · °C";
  unitsButton.dataset.units = unitSystem;
  unitsButton.setAttribute(
    "aria-label",
    t("units.aria", { system: isImperial() ? t("units.imperial") : t("units.metric") }),
  );
  unitsButton.title = isImperial()
    ? t("units.title", { next: t("units.metric"), units: t("units.metric-units") })
    : t("units.title", { next: t("units.imperial"), units: t("units.imperial-units") });
}

/** Les unités impériales basculent l'interface en anglais, sauf choix manuel. */
export function syncLanguageWithUnits() {
  if (hasChosenLanguage()) return;
  setLanguage(isImperial() ? "en" : "fr", { manual: false });
}

/** Change de système d'unités et prévient les tuiles. */
export function setUnitSystem(next) {
  const value = next === "imperial" ? "imperial" : "metric";
  if (value === unitSystem) return;
  unitSystem = value;
  try {
    localStorage.setItem(UNITS_STORAGE_KEY, value);
  } catch {
    // Préférence non persistée : le choix reste actif pour la session en cours.
  }
  applyUnitLabels();
  syncLanguageWithUnits();
  bus.emit("units:changed", unitSystem);
}

/** Câble le bouton d'unités de la barre supérieure. */
export function initUnitControls() {
  $("units-toggle")?.addEventListener("click", () => {
    setUnitSystem(isImperial() ? "metric" : "imperial");
  });
}
