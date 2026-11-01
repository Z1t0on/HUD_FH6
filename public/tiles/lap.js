/** Tuile Chrono : tour en cours, dernier tour, meilleur tour et delta. */

import { bus } from "../core/bus.js";
import { formatLap } from "../core/format.js";
import { t } from "../core/i18n.js";
import { state } from "../core/state.js";

const HTML = `
  <header class="panel-head">
    <span class="panel-title" data-i18n="lap.title">Chrono</span>
    <span class="lap-count"></span>
  </header>

  <div class="lap-current">
    <span class="lap-label" data-i18n="lap.current">Tour actuel</span>
    <strong class="lap-time">--:--.---</strong>
  </div>

  <div class="lap-rows">
    <div class="lap-row">
      <span data-i18n="lap.last">Dernier</span>
      <b class="lap-last">--:--.---</b>
    </div>
    <div class="lap-row">
      <span data-i18n="lap.best">Meilleur</span>
      <b class="lap-best best">--:--.---</b>
    </div>
  </div>

  <div class="delta" data-state="idle">
    <span class="delta-label" data-i18n="lap.delta">Delta dernier / meilleur</span>
    <b class="delta-value">—</b>
  </div>
`;

let els = null;

function renderCount(lapNumber) {
  if (!els) return;
  els.count.textContent =
    Number.isFinite(lapNumber) ? t("lap.count", { n: lapNumber + 1 }) : t("lap.count", { n: "—" });
}

function render(telemetry) {
  if (!els || !telemetry) return;
  els.current.textContent = formatLap(telemetry.currentLap);
  els.last.textContent = formatLap(telemetry.lastLap);
  els.best.textContent = formatLap(telemetry.bestLap);
  renderCount(telemetry.lapNumber);

  if (telemetry.lastLap > 0 && telemetry.bestLap > 0) {
    const delta = telemetry.lastLap - telemetry.bestLap;
    els.deltaValue.textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)}`;
    els.delta.dataset.state = Math.abs(delta) < 0.05 ? "idle" : delta > 0 ? "positive" : "negative";
  } else {
    els.deltaValue.textContent = "—";
    els.delta.dataset.state = "idle";
  }
}

function refresh() {
  if (!els) return;
  render(state.lastTelemetry);
  if (!state.lastTelemetry) renderCount(NaN);
}

export const lapTile = {
  id: "lap",
  labelKey: "panels.lap",
  placement: { page: 1, x: 0, y: 0, w: 0.235, h: 0.305 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    els = {
      count: panel.querySelector(".lap-count"),
      current: panel.querySelector(".lap-time"),
      last: panel.querySelector(".lap-last"),
      best: panel.querySelector(".lap-best"),
      delta: panel.querySelector(".delta"),
      deltaValue: panel.querySelector(".delta-value"),
    };
    refresh();
    bus.on("language:changed", refresh);
    bus.on("telemetry:display", render);
  },

  update(telemetry) {
    if (state.mode === "live") render(telemetry);
  },
};
