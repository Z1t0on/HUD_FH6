/**
 * Tuile Sessions : modale des archives, épinglage, suppression et archivage.
 *
 * Ce n'est pas une fenêtre flottante : elle vit hors de l'espace de travail et
 * s'ouvre depuis la barre supérieure.
 */

import { bus } from "../core/bus.js";
import {
  deleteSessionRequest,
  fetchSessions,
  keepSessionRequest,
  setRecordingRequest,
} from "../core/api.js";
import { formatBytes, formatDateTime, formatDistance, formatLap } from "../core/format.js";
import { t, translateTree } from "../core/i18n.js";
import { lapColorHex } from "../core/lap-colors.js";
import { state } from "../core/state.js";
import { showToast } from "../core/toast.js";
import { convertSpeed, speedUnit } from "../core/units.js";
import { $ } from "../core/utils.js";

const HTML = `
  <div class="modal" role="dialog" aria-modal="true" data-i18n-aria="session-list.title">
    <div class="modal-panel">
      <header class="modal-head">
        <div>
          <h2 data-i18n="session-list.title">Sessions enregistrées</h2>
          <p class="modal-sub"></p>
        </div>
        <div class="modal-actions">
          <label class="switch" data-i18n-title="session-list.recording-title">
            <input type="checkbox" class="recording-toggle" checked />
            <span class="switch-track"></span>
            <span class="switch-label"></span>
          </label>
          <button class="btn sessions-refresh" type="button" data-i18n="session-list.refresh">
            Actualiser
          </button>
          <button class="btn modal-close sessions-close" type="button" data-i18n="session-list.close">
            Fermer
          </button>
        </div>
      </header>
      <div class="session-list"></div>
      <p class="modal-foot" data-i18n="session-list.foot">
        Les sessions sont enregistrées sur le PC HUD, dans <code>data/sessions</code>. Une session
        sans roulage réel (moins de 30 m) n'est pas conservée. Épinglez une session pour la
        protéger de la suppression automatique.
      </p>
    </div>
  </div>
`;

let modalEl = null;
let listEl = null;
let summaryEl = null;
let recordingToggle = null;
let recordingLabel = null;

function makeStat(label, value) {
  const span = document.createElement("span");
  span.append(`${label} `);
  const strong = document.createElement("b");
  strong.textContent = value;
  span.appendChild(strong);
  return span;
}

function sessionRow(meta) {
  const row = document.createElement("div");
  row.className = "session-row";
  if (meta.kept) row.classList.add("is-kept");

  const main = document.createElement("div");
  main.className = "session-main";

  const date = document.createElement("span");
  date.className = "session-date";
  date.textContent = formatDateTime(meta.startedAt);

  const kind = document.createElement("span");
  kind.className = "session-kind";
  kind.textContent =
    meta.kind === "race" ? t("session.race", { n: meta.lapCount }) : t("session.free");

  const laps = document.createElement("div");
  laps.className = "session-laps";
  for (const lap of meta.laps ?? []) {
    const stripe = document.createElement("i");
    stripe.style.setProperty("--lap-color", lapColorHex(lap.index));
    stripe.title = `Tour ${lap.number}${lap.time > 0 ? ` — ${formatLap(lap.time)}` : ""}`;
    laps.appendChild(stripe);
  }

  if (meta.kept) {
    const badge = document.createElement("span");
    badge.className = "session-badge";
    badge.textContent = t("session.pinned");
    kind.append(badge);
  }

  main.append(date, kind, laps);

  const stats = document.createElement("div");
  stats.className = "session-stats";
  stats.append(
    makeStat(t("session.stat-duration"), formatLap(meta.duration)),
    makeStat(t("session.stat-best"), meta.bestLap > 0 ? formatLap(meta.bestLap) : "—"),
    makeStat(t("session.stat-distance"), formatDistance(meta.distance)),
    makeStat(
      t("session.stat-vmax"),
      `${Math.round(convertSpeed(meta.maxSpeed))} ${speedUnit().toLowerCase()}`,
    ),
  );

  const actions = document.createElement("div");
  actions.className = "session-actions";

  const pinButton = document.createElement("button");
  pinButton.type = "button";
  pinButton.className = "btn";
  pinButton.classList.toggle("is-active", meta.kept === true);
  pinButton.dataset.action = "keep";
  pinButton.dataset.id = meta.id;
  pinButton.dataset.kept = meta.kept ? "1" : "0";
  pinButton.textContent = meta.kept ? t("session.unpin") : t("session.pin");

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "btn";
  analyzeButton.dataset.action = "analyze";
  analyzeButton.dataset.id = meta.id;
  analyzeButton.textContent = t("session.analyze");

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn danger";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = meta.id;
  deleteButton.textContent = t("session.delete");

  actions.append(pinButton, analyzeButton, deleteButton);
  row.append(main, stats, actions);
  return row;
}

function renderSessionList(data) {
  if (!listEl) return;
  const payload = data ?? state.sessionsPayload;
  const list = payload?.sessions ?? state.sessions;
  listEl.replaceChildren();

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "session-empty";
    empty.textContent = t("session-list.empty");
    listEl.appendChild(empty);
    summaryEl.textContent = t("session-list.empty-short");
    return;
  }

  const totalBytes = payload?.totalBytes ?? list.reduce((sum, meta) => sum + (meta.bytes || 0), 0);
  const keep = payload?.keep ?? 40;
  const kept = payload?.kept ?? list.filter((meta) => meta.kept).length;
  summaryEl.textContent = t("session-list.summary", {
    n: list.length,
    size: formatBytes(totalBytes),
    kept,
    keep,
  });

  for (const meta of list) {
    listEl.appendChild(sessionRow(meta));
  }
}

/** Reflète l'état d'archivage renvoyé par le serveur. */
function applyRecordingState(enabled) {
  if (recordingToggle) recordingToggle.checked = enabled;
  if (recordingLabel) {
    recordingLabel.textContent = enabled
      ? t("session-list.recording-on")
      : t("session-list.recording-off");
  }
}

export async function refreshSessions({ render = true } = {}) {
  try {
    const data = await fetchSessions();
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    state.sessionsPayload = data;
    const countEl = $("sessions-count");
    if (countEl) countEl.textContent = String(state.sessions.length);
    if (typeof data.recording === "boolean") applyRecordingState(data.recording);
    if (render) renderSessionList(data);
    return data;
  } catch (error) {
    console.warn("Liste des sessions indisponible :", error);
    if (render && listEl) {
      listEl.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "session-empty";
      empty.textContent = t("session-list.unreachable");
      listEl.appendChild(empty);
      summaryEl.textContent = t("session-list.server-down");
    }
    return null;
  }
}

function openSessions() {
  if (!modalEl) return;
  modalEl.hidden = false;
  refreshSessions();
}

function closeSessions() {
  if (modalEl) modalEl.hidden = true;
}

export async function deleteSession(id) {
  if (!window.confirm(t("session.confirm-delete"))) return;
  try {
    await deleteSessionRequest(id);
    bus.emit("session:removed", id);
    await refreshSessions();
    showToast(t("toast.session-deleted"));
  } catch (error) {
    console.warn("Suppression impossible :", error);
    showToast(t("toast.delete-failed"));
  }
}

async function keepSession(id, kept) {
  try {
    await keepSessionRequest(id, kept);
    await refreshSessions();
    showToast(kept ? t("toast.pinned") : t("toast.unpinned"));
  } catch (error) {
    console.warn("Épinglage impossible :", error);
    showToast(t("toast.action-failed"));
  }
}

async function setRecording(enabled) {
  try {
    const data = await setRecordingRequest(enabled);
    applyRecordingState(data.recording !== false);
    showToast(enabled ? t("toast.recording-on") : t("toast.recording-off"));
  } catch (error) {
    console.warn("Changement d'archivage impossible :", error);
    applyRecordingState(!enabled);
    showToast(t("session-list.server-down"));
  }
}

/** Une session vient d'être archivée : compteur, message et rafraîchissement. */
function onSessionSaved(meta) {
  const countEl = $("sessions-count");
  const count = Number(countEl?.textContent) || 0;
  if (countEl) countEl.textContent = String(count + 1);

  if (meta?.kind === "race") {
    showToast(
      t("toast.session-saved-race", {
        n: meta.lapCount,
        best: meta.bestLap > 0 ? formatLap(meta.bestLap) : "—",
      }),
    );
  } else {
    showToast(t("toast.session-saved-free"));
  }
  if (modalEl && !modalEl.hidden) refreshSessions();
}

export const sessionsTile = {
  id: "sessions",
  panel: false,

  init() {
    document.body.insertAdjacentHTML("beforeend", HTML);
    modalEl = document.body.lastElementChild;
    listEl = modalEl.querySelector(".session-list");
    summaryEl = modalEl.querySelector(".modal-sub");
    recordingToggle = modalEl.querySelector(".recording-toggle");
    recordingLabel = modalEl.querySelector(".switch-label");
    translateTree(modalEl);
    applyRecordingState(recordingToggle?.checked ?? true);

    $("sessions-open")?.addEventListener("click", openSessions);
    modalEl.querySelector(".sessions-close")?.addEventListener("click", closeSessions);
    modalEl.querySelector(".sessions-refresh")?.addEventListener("click", () => refreshSessions());
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) closeSessions();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modalEl.hidden) closeSessions();
    });
    recordingToggle?.addEventListener("change", () => setRecording(recordingToggle.checked));

    listEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (!id) return;
      if (button.dataset.action === "analyze") {
        closeSessions();
        bus.emit("session:analyze", id);
      } else if (button.dataset.action === "delete") {
        deleteSession(id);
      } else if (button.dataset.action === "keep") {
        keepSession(id, button.dataset.kept !== "1");
      }
    });

    bus.on("session:saved", onSessionSaved);
    bus.on("language:changed", () => {
      translateTree(modalEl);
      applyRecordingState(recordingToggle?.checked ?? true);
      if (!modalEl.hidden) renderSessionList(state.sessionsPayload);
    });

    refreshSessions({ render: false });
  },
};
