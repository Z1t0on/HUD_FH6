/** Tuile Commandes : course d'accélérateur, de frein et d'embrayage. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";

const HTML = `
  <header class="panel-head">
    <span class="panel-title" data-i18n="pedals.title">Commandes</span>
  </header>
  <div class="pedals">
    <div class="pedal pedal-throttle">
      <div class="pedal-fill"></div>
      <span class="pedal-label" data-i18n="pedals.throttle">ACC</span>
      <span class="pedal-value">0%</span>
    </div>
    <div class="pedal pedal-brake">
      <div class="pedal-fill"></div>
      <span class="pedal-label" data-i18n="pedals.brake">FR</span>
      <span class="pedal-value">0%</span>
    </div>
    <div class="pedal pedal-clutch">
      <div class="pedal-fill"></div>
      <span class="pedal-label" data-i18n="pedals.clutch">EMB</span>
      <span class="pedal-value">0%</span>
    </div>
  </div>
`;

const PEDALS = ["throttle", "brake", "clutch"];

let els = null;

function render(telemetry) {
  if (!els || !telemetry) return;
  for (const name of PEDALS) {
    const ratio = (telemetry[name] ?? 0) / 255;
    const element = els[name];
    element.fill.style.height = `${(ratio * 100).toFixed(1)}%`;
    element.value.textContent = `${Math.round(ratio * 100)}%`;
  }
}

function refresh() {
  render(state.lastTelemetry);
}

export const pedalsTile = {
  id: "pedals",
  labelKey: "panels.pedals",
  placement: { page: 1, x: 0.76, y: 0.41, w: 0.24, h: 0.275 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    els = {};
    for (const name of PEDALS) {
      const root = panel.querySelector(`.pedal-${name}`);
      els[name] = { fill: root.querySelector(".pedal-fill"), value: root.querySelector(".pedal-value") };
    }
    bus.on("language:changed", refresh);
    bus.on("telemetry:display", render);
    refresh();
  },

  update(telemetry) {
    if (state.mode === "live") render(telemetry);
  },
};
