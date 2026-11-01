/** Tuile Pneus : températures et états des quatre roues. */

import { bus } from "../core/bus.js";
import { tireState } from "../core/format.js";
import { state } from "../core/state.js";
import { formatTemperature } from "../core/units.js";

const CORNERS = [
  ["frontLeft", "tire.fl", "AVG"],
  ["frontRight", "tire.fr", "AVD"],
  ["rearLeft", "tire.rl", "ARG"],
  ["rearRight", "tire.rr", "ARD"],
];

const HTML = `
  <header class="panel-head">
    <span class="panel-title" data-i18n="tires.title">Pneus</span>
    <span class="tire-note" data-i18n="tires.note">Température</span>
  </header>

  <div class="tire-grid">
    ${CORNERS.map(
      ([key, label, fallback]) => `
      <article class="tire" data-corner="${key}" data-state="cold">
        <span class="tire-corner" data-i18n="${label}">${fallback}</span>
        <strong class="tire-temp">—</strong>
        <span class="tire-pressure" data-i18n="tires.pressure-none">Pression n/d</span>
      </article>`,
    ).join("")}
  </div>

  <div class="tire-legend">
    <span data-state="cold" data-i18n="tires.cold">Froid</span>
    <span data-state="ideal" data-i18n="tires.ideal">Idéal</span>
    <span data-state="hot" data-i18n="tires.hot">Chaud</span>
    <span data-state="overheat" data-i18n="tires.overheat">Surchauffe</span>
  </div>
`;

let els = null;

function render(telemetry) {
  if (!els || !telemetry) return;
  const temps = telemetry.tireTemp ?? {};
  for (const [key] of CORNERS) {
    const element = els[key];
    if (!element) continue;
    const fahrenheit = temps[key];
    const value = element.querySelector(".tire-temp");
    if (!fahrenheit || fahrenheit <= 0) {
      element.dataset.state = "cold";
      value.textContent = "—";
      continue;
    }
    element.dataset.state = tireState((fahrenheit - 32) / 1.8);
    value.textContent = formatTemperature(fahrenheit);
  }
}

function refresh() {
  render(state.lastTelemetry);
}

export const tiresTile = {
  id: "tires",
  labelKey: "panels.tires",
  placement: { page: 1, x: 0.76, y: 0, w: 0.24, h: 0.4 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    els = {};
    for (const [key] of CORNERS) {
      els[key] = panel.querySelector(`.tire[data-corner="${key}"]`);
    }
    bus.on("language:changed", refresh);
    bus.on("units:changed", refresh);
    bus.on("telemetry:display", render);
    refresh();
  },

  update(telemetry) {
    if (state.mode === "live") render(telemetry);
  },
};
