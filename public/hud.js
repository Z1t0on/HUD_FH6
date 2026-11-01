/**
 * HUD FH6 — point d'entrée du tableau de bord.
 *
 * Il ne fait que trois choses : monter les tuiles, écouter le flux SSE /events
 * et redistribuer chaque paquet aux tuiles. Toute la logique d'affichage vit
 * dans `tiles/`, les services partagés dans `core/`.
 */

import { $ } from "./core/utils.js";
import { bus } from "./core/bus.js";
import { applyLanguage, initLanguageControls, t } from "./core/i18n.js";
import { getDragSession, getPanelLayout, initPanels, registerTile } from "./core/panel-manager.js";
import { state } from "./core/state.js";
import { initTheme } from "./core/theme.js";
import { IDLE_TIMEOUT } from "./core/constants.js";
import {
  applyUnitLabels,
  convertSpeed,
  currentUnitSystem,
  formatLength,
  formatTemperature,
  initUnitControls,
  setUnitSystem,
} from "./core/units.js";
import { tiles } from "./tiles/index.js";
import { exitAnalysis, loadSession, sceneRefs, selectSample } from "./tiles/map.js";
import { refreshSessions } from "./tiles/sessions.js";

const conn = $("conn");
const statusEl = $("status");

function setConnection(connectionState, text) {
  if (!conn) return;
  conn.classList.toggle("is-live", connectionState === "live");
  conn.classList.toggle("is-error", connectionState === "error");
  statusEl.textContent = text;
}

/* ------------------------------- Flux temps réel */

function connect() {
  const source = new EventSource("/events");

  source.onopen = () => {
    setConnection("idle", t("status.waiting"));
  };

  source.onmessage = (event) => {
    let telemetry;
    try {
      telemetry = JSON.parse(event.data);
    } catch (error) {
      console.warn("Paquet invalide ignoré", error);
      return;
    }

    state.latest = telemetry;
    state.activity.lastPacketAt = performance.now();
    state.activity.hasReceivedData = true;
    /* Pendant l'analyse, l'affichage suit l'échantillon choisi, pas le direct. */
    if (state.mode === "live") state.lastTelemetry = telemetry;

    for (const tile of tiles) tile.update?.(telemetry);
    setConnection("live", t("status.live"));
  };

  source.addEventListener("session", (event) => {
    let meta;
    try {
      meta = JSON.parse(event.data);
    } catch {
      return;
    }
    bus.emit("session:saved", meta);
  });

  source.onerror = () => {
    setConnection("error", t("status.error"));
  };
}

/* ------------------------------- Santé du serveur */

async function loadHealth() {
  const udpInfo = $("udp-info");
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) return;
    const health = await response.json();
    if (udpInfo) udpInfo.textContent = `UDP ${health.udpPort}`;
  } catch {
    // Le flux SSE signalera déjà le problème.
  }
}

/* ------------------------------- Démarrage */

function initFullscreen() {
  $("fullscreen")?.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
}

/** Un flux muet n'est plus « actif » ; au-delà de 10 s, la valeur courante est oubliée. */
function watchIdle() {
  setInterval(() => {
    if (!state.latest) return;
    const idleFor = performance.now() - state.activity.lastPacketAt;
    if (idleFor < IDLE_TIMEOUT) return;
    setConnection("idle", t("status.waiting"));
    if (idleFor > 10_000) {
      state.latest = null;
      state.smoothed.initialized = false;
    }
  }, 400);
}

initTheme();
initLanguageControls();
initUnitControls();
applyUnitLabels();
initFullscreen();

for (const tile of tiles) registerTile(tile);
initPanels();
applyLanguage({ rerender: true });
for (const tile of tiles) tile.init?.();

connect();
loadHealth();
watchIdle();

/* Point d'inspection pour les tests (http://localhost:3000/?debug=1) */
if (new URLSearchParams(location.search).has("debug")) {
  window.__hud = {
    ...sceneRefs,
    get latest() {
      return state.latest;
    },
    get followCar() {
      return state.followCar;
    },
    get mode() {
      return state.mode;
    },
    get analysis() {
      return state.analysis;
    },
    get sessions() {
      return state.sessions;
    },
    get livePoints() {
      return state.live.points;
    },
    get units() {
      return currentUnitSystem();
    },
    get layout() {
      return getPanelLayout();
    },
    get drag() {
      return getDragSession();
    },
    setUnits: setUnitSystem,
    formatLength,
    formatTemperature,
    convertSpeed,
    selectSample,
    loadSession,
    exitAnalysis,
    refreshSessions,
  };
}
