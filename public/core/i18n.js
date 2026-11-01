/**
 * Internationalisation FR/EN.
 *
 * Les textes statiques portent un attribut `data-i18n*` ; les tuiles écoutent
 * `language:changed` pour régénérer leurs libellés dynamiques.
 */

import { $ } from "./utils.js";
import { bus } from "./bus.js";
const LANG_KEY = "hud-fh6:lang";

/**
 * Textes de l'interface. Chaque clé est utilisée soit par un attribut
 * `data-i18n` du HTML, soit par un appel `t("…")` du script.
 */
const TRANSLATIONS = {
  fr: {
    "app.fullscreen": "Plein écran",
    "menu.panels": "Panneaux",
    "menu.theme": "Thème",
    "menu.preset": "Ambiance",
    "menu.accent": "Accent",
    "menu.background": "Fond",
    "menu.gauge": "Compteur",
    "menu.reset": "Réinitialiser",
    "menu.reset-layout": "Réinitialiser la disposition",
    "theme.preset-cyber": "Cyber",
    "theme.preset-ember": "Ambre",
    "theme.preset-daylight": "Clair",
    "gauge.digital": "Digital",
    "gauge.analog": "Analogique",
    "panels.lap": "Chrono",
    "panels.cluster": "Compteur",
    "panels.map": "Carte 3D",
    "panels.tires": "Pneus",
    "panels.pedals": "Commandes",
    "panels.gforce": "G-Force",
    "panels.inspector": "Inspecteur",
    "page.label": "Espace {n} / {total}",
    "page.switch": "Espace de travail",
    "page.prev": "Espace précédent",
    "page.next": "Espace suivant",
    "panel.hide": "Masquer {name}",
    "toast.panel-moved": "Tuile « {name} » déplacée vers l'espace {page}",
    "status.connecting": "Connexion…",
    "status.waiting": "En attente du flux Data Out",
    "status.live": "Data Out actif",
    "status.error": "Flux interrompu",
    "lap.title": "Chrono",
    "lap.count": "TOUR {n}",
    "lap.current": "Tour actuel",
    "lap.last": "Dernier",
    "lap.best": "Meilleur",
    "lap.delta": "Delta dernier / meilleur",
    "unit.rpm": "tr/min",
    "unit.rpm-short": " tr/min",
    "map.title": "Carte 3D",
    "map.sub-live": "Position X / Y / Z en temps réel",
    "map.sub-analysis": "Session archivée · cliquez sur le tracé",
    "map.waiting": "En attente du flux Data Out…",
    "map.iso": "Vue iso",
    "map.fit": "Vue d'ensemble",
    "map.follow": "Suivi",
    "map.free": "Libre",
    "map.clear": "Effacer tracé",
    "map.back-live": "Retour au direct",
    "map.hint": "Glisser pour orbiter · molette pour zoomer · 1 carreau = {cell}",
    "tires.title": "Pneus",
    "tires.note": "Température",
    "tires.pressure-none": "Pression n/d",
    "tires.cold": "Froid",
    "tires.ideal": "Idéal",
    "tires.hot": "Chaud",
    "tires.overheat": "Surchauffe",
    "tire.fl": "AVG",
    "tire.fr": "AVD",
    "tire.rl": "ARG",
    "tire.rr": "ARD",
    "pedals.title": "Commandes",
    "pedals.throttle": "ACC",
    "pedals.brake": "FR",
    "pedals.clutch": "EMB",
    "inspector.gear": "RAPPORT",
    "inspector.rpm": "TR/MIN",
    "inspector.steer": "DIR",
    "inspector.g-lat": "G lat",
    "inspector.g-long": "G long",
    "session.race": "Course · {n} tour(s)",
    "session.free": "Balade libre",
    "session.stat-duration": "Durée",
    "session.stat-best": "Meilleur",
    "session.stat-distance": "Distance",
    "session.stat-vmax": "V. max",
    "session.analyze": "Analyser",
    "session.delete": "Supprimer",
    "session.pin": "Épingler",
    "session.unpin": "Détacher",
    "session.pinned": "Épinglée",
    "session-list.title": "Sessions enregistrées",
    "session-list.loading": "Chargement…",
    "session-list.empty": "Aucune session enregistrée pour l'instant. Roulez : l'enregistrement est automatique.",
    "session-list.empty-short": "0 session",
    "session-list.count": "{n} session(s)",
    "session-list.summary": "{n} session(s) · {size} · {kept} épinglée(s) · conservation : {keep} max",
    "session-list.refresh": "Actualiser",
    "session-list.close": "Fermer",
    "session-list.unreachable": "Impossible de charger les sessions : serveur injoignable.",
    "session-list.server-down": "Serveur injoignable",
    "session-list.recording-on": "Archivage actif",
    "session-list.recording-off": "Archivage suspendu",
    "session-list.recording-title": "Archiver les nouvelles sessions",
    "session-list.foot": "Les sessions sont enregistrées sur le PC HUD, dans data/sessions. Une session sans roulage réel (moins de 30 m) n'est pas conservée. Épinglez une session pour la protéger de la suppression automatique.",
    "session.confirm-delete": "Supprimer définitivement cette session enregistrée ?",
    "toast.session-saved": "Session enregistrée",
    "toast.session-saved-race": "Course enregistrée · {n} tour(s) · meilleur {best}",
    "toast.session-saved-free": "Balade enregistrée",
    "toast.session-deleted": "Session supprimée",
    "toast.delete-failed": "Suppression impossible",
    "toast.load-failed": "Impossible de charger la session",
    "toast.panel-hidden": "Panneau « {name} » masqué",
    "toast.layout-reset": "Disposition réinitialisée",
    "toast.pinned": "Session épinglée",
    "toast.unpinned": "Session détachée",
    "toast.action-failed": "Action impossible",
    "toast.recording-on": "Archivage activé",
    "toast.recording-off": "Archivage suspendu",
    "lang.button": "{code}",
    "lang.title": "Langue : {name} — passer à {next}",
    "lang.french": "français",
    "lang.english": "anglais",
    "lang.name-fr": "Français",
    "lang.name-en": "English",
    "units.aria": "Système d'unités : {system}",
    "units.title": "Passer au système {next} ({units})",
    "units.metric": "métrique",
    "units.imperial": "impérial",
    "units.metric-units": "km/h, °C, m",
    "units.imperial-units": "mph, °F, ft",
    "unit.mo": "Mo",
    "unit.gb": "Go",
    "analysis.race": "Course · {n} tour(s) · {time}",
    "analysis.free": "Balade libre · {time}",
    "analysis.session-of": "Course {race} · {session} de session",
  },
  en: {
    "app.fullscreen": "Fullscreen",
    "menu.panels": "Panels",
    "menu.theme": "Theme",
    "menu.preset": "Preset",
    "menu.accent": "Accent",
    "menu.background": "Background",
    "menu.gauge": "Gauge",
    "menu.reset": "Reset",
    "menu.reset-layout": "Reset layout",
    "theme.preset-cyber": "Cyber",
    "theme.preset-ember": "Amber",
    "theme.preset-daylight": "Light",
    "gauge.digital": "Digital",
    "gauge.analog": "Analog",
    "panels.lap": "Lap timer",
    "panels.cluster": "Cluster",
    "panels.map": "3D map",
    "panels.tires": "Tires",
    "panels.pedals": "Inputs",
    "panels.gforce": "G-Force",
    "panels.inspector": "Inspector",
    "page.label": "Space {n} / {total}",
    "page.switch": "Workspace",
    "page.prev": "Previous space",
    "page.next": "Next space",
    "panel.hide": "Hide {name}",
    "toast.panel-moved": "Tile “{name}” moved to space {page}",
    "status.connecting": "Connecting…",
    "status.waiting": "Waiting for Data Out",
    "status.live": "Data Out live",
    "status.error": "Stream lost",
    "lap.title": "Lap timer",
    "lap.count": "LAP {n}",
    "lap.current": "Current lap",
    "lap.last": "Last",
    "lap.best": "Best",
    "lap.delta": "Delta last / best",
    "unit.rpm": "rpm",
    "unit.rpm-short": " rpm",
    "map.title": "3D map",
    "map.sub-live": "Live X / Y / Z position",
    "map.sub-analysis": "Archived session · click the trail",
    "map.waiting": "Waiting for Data Out…",
    "map.iso": "Iso view",
    "map.fit": "Overview",
    "map.follow": "Follow",
    "map.free": "Free",
    "map.clear": "Clear trail",
    "map.back-live": "Back to live",
    "map.hint": "Drag to orbit · wheel to zoom · 1 square = {cell}",
    "tires.title": "Tires",
    "tires.note": "Temperature",
    "tires.pressure-none": "Pressure n/a",
    "tires.cold": "Cold",
    "tires.ideal": "Ideal",
    "tires.hot": "Hot",
    "tires.overheat": "Overheat",
    "tire.fl": "FL",
    "tire.fr": "FR",
    "tire.rl": "RL",
    "tire.rr": "RR",
    "pedals.title": "Inputs",
    "pedals.throttle": "THR",
    "pedals.brake": "BRK",
    "pedals.clutch": "CLT",
    "inspector.gear": "GEAR",
    "inspector.rpm": "RPM",
    "inspector.steer": "STR",
    "inspector.g-lat": "Lat G",
    "inspector.g-long": "Lon G",
    "session.race": "Race · {n} lap(s)",
    "session.free": "Free roam",
    "session.stat-duration": "Duration",
    "session.stat-best": "Best",
    "session.stat-distance": "Distance",
    "session.stat-vmax": "Top speed",
    "session.analyze": "Analyze",
    "session.delete": "Delete",
    "session.pin": "Pin",
    "session.unpin": "Unpin",
    "session.pinned": "Pinned",
    "session-list.title": "Recorded sessions",
    "session-list.loading": "Loading…",
    "session-list.empty": "No sessions recorded yet. Just drive: recording is automatic.",
    "session-list.empty-short": "0 sessions",
    "session-list.count": "{n} session(s)",
    "session-list.summary": "{n} session(s) · {size} · {kept} pinned · keep: {keep} max",
    "session-list.refresh": "Refresh",
    "session-list.close": "Close",
    "session-list.unreachable": "Unable to load sessions: server unreachable.",
    "session-list.server-down": "Server unreachable",
    "session-list.recording-on": "Recording on",
    "session-list.recording-off": "Recording paused",
    "session-list.recording-title": "Record new sessions",
    "session-list.foot": "Sessions are stored on the HUD PC in data/sessions. A session without real driving (under 30 m) is discarded. Pin a session to protect it from automatic deletion.",
    "session.confirm-delete": "Permanently delete this recorded session?",
    "toast.session-saved": "Session recorded",
    "toast.session-saved-race": "Race recorded · {n} lap(s) · best {best}",
    "toast.session-saved-free": "Free roam recorded",
    "toast.session-deleted": "Session deleted",
    "toast.delete-failed": "Delete failed",
    "toast.load-failed": "Unable to load the session",
    "toast.panel-hidden": "Panel “{name}” hidden",
    "toast.layout-reset": "Layout reset",
    "toast.pinned": "Session pinned",
    "toast.unpinned": "Session unpinned",
    "toast.action-failed": "Action failed",
    "toast.recording-on": "Recording enabled",
    "toast.recording-off": "Recording paused",
    "lang.button": "{code}",
    "lang.title": "Language: {name} — switch to {next}",
    "lang.french": "French",
    "lang.english": "English",
    "lang.name-fr": "Français",
    "lang.name-en": "English",
    "units.aria": "Unit system: {system}",
    "units.title": "Switch to the {next} system ({units})",
    "units.metric": "metric",
    "units.imperial": "imperial",
    "units.metric-units": "km/h, °C, m",
    "units.imperial-units": "mph, °F, ft",
    "unit.mo": "MB",
    "unit.gb": "GB",
    "analysis.race": "Race · {n} lap(s) · {time}",
    "analysis.free": "Free roam · {time}",
    "analysis.session-of": "Race {race} · {session} of session",
  },
};

function detectLanguage() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "fr" || stored === "en") return { value: stored, manual: true };
  } catch {
    // Stockage indisponible : détection par la langue du navigateur.
  }
  const tag = ((Array.isArray(navigator.languages) && navigator.languages[0]) || navigator.language || "fr")
    .toLowerCase();
  return { value: tag.startsWith("en") ? "en" : "fr", manual: false };
}

const initialLanguage = detectLanguage();
let lang = initialLanguage.value;
/** true si l'utilisateur a choisi sa langue (sinon elle suit les unités). */
let languageChosen = initialLanguage.manual;

/**
 * Traduit une clé dans la langue active, avec remplacement des variables
 * `{nom}` fournies dans `vars`.
 */
export function t(key, vars) {
  const table = TRANSLATIONS[lang] ?? TRANSLATIONS.fr;
  let text = table[key] ?? TRANSLATIONS.fr[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function uiLocale() {
  return lang === "fr" ? "fr-FR" : "en-US";
}

/** Langue active ("fr" ou "en"). */
export function currentLanguage() {
  return lang;
}

/** true si l'utilisateur a explicitement choisi sa langue. */
export function hasChosenLanguage() {
  return languageChosen;
}

/**
 * Traduit un sous-arbre : texte, infobulles et libellés accessibles. Les tuiles
 * appellent cette fonction après avoir injecté leur HTML.
 */
export function translateTree(root = document) {
  if (root.nodeType === 1 && root.dataset?.i18n) {
    root.textContent = t(root.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }
  for (const element of root.querySelectorAll("[data-i18n-aria]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  }
}

/** Met à jour le bouton FR/EN de la barre supérieure. */
function refreshLanguageToggle() {
  const langToggle = $("lang-toggle");
  if (!langToggle) return;
  langToggle.textContent = lang.toUpperCase();
  const nextName = lang === "fr" ? t("lang.english") : t("lang.french");
  langToggle.title = t("lang.title", {
    name: lang === "fr" ? t("lang.name-fr") : t("lang.name-en"),
    next: nextName,
  });
  langToggle.setAttribute("aria-label", langToggle.title);
}

/**
 * Applique la langue au document puis prévient les tuiles, qui régénèrent
 * leurs libellés et valeurs dynamiques.
 */
export function applyLanguage({ rerender = false } = {}) {
  document.documentElement.lang = lang;
  translateTree(document);
  refreshLanguageToggle();
  bus.emit("language:changed", { rerender });
}

/** Change de langue ; un choix manuel est mémorisé et ne suivra plus les unités. */
export function setLanguage(next, { manual = true, rerender = true } = {}) {
  lang = next === "en" ? "en" : "fr";
  languageChosen = manual || languageChosen;
  if (manual) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Stockage indisponible : le choix vaut pour la session en cours.
    }
  }
  applyLanguage({ rerender });
}

/** Câble le bouton FR/EN de la barre supérieure. */
export function initLanguageControls() {
  $("lang-toggle")?.addEventListener("click", () => {
    setLanguage(lang === "fr" ? "en" : "fr");
  });
}

