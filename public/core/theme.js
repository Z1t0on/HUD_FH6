/**
 * Thèmes visuels du tableau de bord.
 *
 * Le noyau ne calcule que les variables CSS ; la scène 3D et le compteur
 * analogique écoutent `theme:changed` pour se mettre à jour à leur tour.
 */

import { bus } from "./bus.js";
import { t } from "./i18n.js";
import { showToast } from "./toast.js";
import { $ } from "./utils.js";

const THEME_KEY = "hud-fh6:theme";

/**
 * Ambiances proposées. `mode` détermine les couleurs dérivées (panneaux,
 * texte, traits) : le fond et l'accent restent libres.
 */
const THEME_PRESETS = [
  { id: "cyber", label: "theme.preset-cyber", mode: "dark", bg: "#05080d", accent: "#00e5ff" },
  { id: "ember", label: "theme.preset-ember", mode: "dark", bg: "#0b0705", accent: "#ffb020" },
  { id: "daylight", label: "theme.preset-daylight", mode: "light", bg: "#eef3f8", accent: "#0b7fb5" },
];

const themePresetsEl = $("theme-presets");
const themeAccentInput = $("theme-accent");
const themeBgInput = $("theme-bg");
const gaugeToggle = $("gauge-toggle");
const themeResetButton = $("theme-reset");

function parseHexColor(value) {
  const clean = String(value ?? "").replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0 };
  const int = Number.parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHexColor({ r, g, b }) {
  const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function mixHex(a, b, amount) {
  const from = parseHexColor(a);
  const to = parseHexColor(b);
  return toHexColor({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  });
}

function rgbaHex(hex, alpha) {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexLuminance(hex) {
  const { r, g, b } = parseHexColor(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function defaultTheme() {
  return {
    mode: THEME_PRESETS[0].mode,
    bg: THEME_PRESETS[0].bg,
    accent: THEME_PRESETS[0].accent,
    gauge: "digital",
  };
}

function loadTheme() {
  const fallback = defaultTheme();
  try {
    const stored = JSON.parse(localStorage.getItem(THEME_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return fallback;
    return {
      mode: stored.mode === "light" ? "light" : "dark",
      bg: /^#[0-9a-fA-F]{6}$/.test(stored.bg ?? "") ? stored.bg : fallback.bg,
      accent: /^#[0-9a-fA-F]{6}$/.test(stored.accent ?? "") ? stored.accent : fallback.accent,
      gauge: stored.gauge === "analog" ? "analog" : "digital",
    };
  } catch {
    return fallback;
  }
}

/** État courant du thème, muté sur place pour rester partagé. */
export const themeState = loadTheme();

function saveTheme() {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(themeState));
  } catch {
    // Stockage indisponible : le thème vaut pour la session en cours.
  }
}

/** Applique les couleurs du thème aux variables CSS du document. */
function applyTheme() {
  const root = document.documentElement;
  const light = themeState.mode === "light";
  const bg = themeState.bg;
  const accent = themeState.accent;
  const panel = light ? mixHex(bg, "#ffffff", 0.7) : mixHex(bg, "#ffffff", 0.06);
  const panel2 = light ? mixHex(bg, "#ffffff", 0.95) : mixHex(bg, "#ffffff", 0.11);
  const soft = light ? mixHex(accent, "#001220", 0.2) : mixHex(accent, "#ffffff", 0.32);

  root.style.setProperty("--bg", bg);
  root.style.setProperty("--bg-panel", rgbaHex(panel, 0.86));
  root.style.setProperty("--bg-panel-2", rgbaHex(panel2, light ? 0.92 : 0.6));
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--cyan", accent);
  root.style.setProperty("--cyan-soft", soft);
  root.style.setProperty("--stroke", rgbaHex(accent, light ? 0.32 : 0.16));
  root.style.setProperty("--text", light ? "#0b1420" : "#eef6ff");
  root.style.setProperty("--muted", light ? "#5c6b7c" : "#7f8ea3");
  root.style.setProperty("--ink", light ? "#0b1420" : "#ffffff");
  root.dataset.theme = light ? "light" : "dark";

  themeAccentInput.value = accent;
  themeBgInput.value = bg;
  updateThemeSwatches();
  bus.emit("theme:changed", themeState);
}

function updateThemeSwatches() {
  if (!themePresetsEl) return;
  for (const button of themePresetsEl.querySelectorAll("button[data-preset]")) {
    const preset = THEME_PRESETS.find((entry) => entry.id === button.dataset.preset);
    const active =
      Boolean(preset) &&
      preset.bg.toLowerCase() === themeState.bg.toLowerCase() &&
      preset.accent.toLowerCase() === themeState.accent.toLowerCase();
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

/** Change un ou plusieurs réglages du thème. */
export function setTheme(patch, { persist = true } = {}) {
  Object.assign(themeState, patch);
  if (patch.bg) themeState.mode = hexLuminance(themeState.bg) > 0.55 ? "light" : "dark";
  applyTheme();
  /* Le libellé du bouton de compteur suit le style réellement actif. */
  refreshThemeMenu();
  if (persist) saveTheme();
}

function buildThemePresets() {
  if (!themePresetsEl) return;
  themePresetsEl.replaceChildren();
  for (const preset of THEME_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-swatch";
    button.dataset.preset = preset.id;
    button.title = t(preset.label);
    button.setAttribute("aria-label", t(preset.label));
    button.style.background = `linear-gradient(135deg, ${preset.bg} 45%, ${preset.accent} 55%)`;
    button.addEventListener("click", () => {
      setTheme({ mode: preset.mode, bg: preset.bg, accent: preset.accent });
    });
    themePresetsEl.appendChild(button);
  }
  updateThemeSwatches();
}

/** Met à jour les libellés du menu Thème (langue + style de compteur). */
export function refreshThemeMenu() {
  if (themePresetsEl) {
    for (const button of themePresetsEl.querySelectorAll("button[data-preset]")) {
      const preset = THEME_PRESETS.find((entry) => entry.id === button.dataset.preset);
      if (!preset) continue;
      button.title = t(preset.label);
      button.setAttribute("aria-label", t(preset.label));
    }
  }
  if (gaugeToggle) {
    gaugeToggle.textContent =
      themeState.gauge === "analog" ? t("gauge.analog") : t("gauge.digital");
    gaugeToggle.dataset.gauge = themeState.gauge;
  }
}

/** Initialise le thème, câble le menu et applique le rendu enregistré. */
export function initTheme() {
  buildThemePresets();
  applyTheme();
  refreshThemeMenu();

  themeAccentInput?.addEventListener("input", () => {
    setTheme({ accent: themeAccentInput.value });
  });

  themeBgInput?.addEventListener("input", () => {
    setTheme({ bg: themeBgInput.value });
  });

  gaugeToggle?.addEventListener("click", () => {
    setTheme({ gauge: themeState.gauge === "analog" ? "digital" : "analog" });
  });

  themeResetButton?.addEventListener("click", () => {
    setTheme(defaultTheme());
    showToast(t("menu.reset"));
  });

  bus.on("language:changed", () => refreshThemeMenu());
}
